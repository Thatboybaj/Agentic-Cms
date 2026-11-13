// shipPost steps (handoff 02 step 6; ported from the prototype's openMergeRequest, MR half). Only an approved post at
// its approved version ships; an edit after approval makes it stale and the step stops.
import { v } from "convex/values";
import { AUTOPOST_ACTOR } from "../../src/lib/logic";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { holdPost } from "../lib/approval";
import { audit } from "../lib/audit";
import { activeManifest, activeRepo } from "../lib/gateInputs";
import { notify, siteAudienceWith } from "../lib/notify";
import { transitionPost } from "../lib/transition";
import { vOpenPrOutput, vRenderOutput } from "./steps";

async function shippable(ctx: MutationCtx, siteId: Id<"sites">, postId: Id<"posts">, version: number) {
	const post = await ctx.db.get(postId);
	const site = await ctx.db.get(siteId);
	if (!post || !site || post.siteId !== siteId) return null;
	if (post.state !== "in-review" || post.approvedVersion !== version || post.currentVersion !== version) return null;
	return { post, site };
}

const cap1 = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const mrRef = (host: "github" | "gitlab", n: number) => `${host === "gitlab" ? "!" : "#"}${n}`;

export const prepare = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), version: v.number() },
	handler: async (ctx, { siteId, postId, version }) => {
		const got = await shippable(ctx, siteId, postId, version);
		if (!got) return { stop: true as const };
		const { post, site } = got;
		const repo = await activeRepo(ctx, siteId);
		const manifest = await activeManifest(ctx, siteId);
		if (!repo || !manifest) {
			await holdPost(ctx, site, post, !repo ? "No repo connected · the MR has nowhere to open" : "Template can't render the post · no confirmed manifest");
			return { stop: true as const };
		}
		const slots = (await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50)).filter((s) => s.status === "selected");
		const raster = slots.filter((s) => s.format !== "svg").length;
		const branch = repo.branchPattern.replace("{slug}", post.slug);
		return {
			stop: false as const,
			languages: (site.languages ?? []).some((l) => l.enabled) && process.env.CMS_AGENTS === "live",
			render: { siteId, postId, slug: post.slug, words: post.words, output: manifest.output, contentDir: repo.contentDir, assetDir: repo.assetDir, rasterSlots: raster, svgSlots: slots.length - raster },
			pr: { siteId, postId, branch, base: repo.baseBranch, title: `content: add ${post.title}`, domain: site.domain, slug: post.slug },
		};
	},
});

export const renderHeld = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), held: v.array(v.string()) },
	handler: async (ctx, { siteId, postId, held }) => {
		const post = await ctx.db.get(postId);
		const site = await ctx.db.get(siteId);
		if (!post || !site || post.siteId !== siteId) return;
		await holdPost(ctx, site, post, held.length === 1 && /^Image files/.test(held[0]!) ? held[0]! : `Template can't render: ${held.join(", ")}`);
	},
});

export const recordMr = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), version: v.number(), autopost: v.boolean(), overrides: v.array(v.string()), render: vRenderOutput, pr: vOpenPrOutput },
	handler: async (ctx, { siteId, postId, version, autopost, overrides, render, pr }) => {
		const got = await shippable(ctx, siteId, postId, version);
		if (!got) return null;
		const { post, site } = got;
		const repo = (await activeRepo(ctx, siteId))!;
		const manifest = (await activeManifest(ctx, siteId))!;
		const existing = await ctx.db.query("mergeRequests").withIndex("by_post", (q) => q.eq("postId", postId)).take(20);
		const open = existing.find((m) => m.status === "open" || m.status === "conflict");
		const kw = (await ctx.db.get(post.keywordId))?.term ?? post.title;
		const checks = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", postId)).take(100);
		const passed = checks.filter((c) => c.status === "pass").length;
		const schema = checks.find((c) => c.checkId === "schema")?.value ?? "Article";
		const internalLinks = checks.find((c) => c.checkId === "internal-links")?.value.replace(" · soft", "") ?? "—";
		const description = [
			`**Keyword** ${kw}  `,
			`**Intent** ${cap1(post.intent)}  `,
			`**On-page** ${passed} / ${checks.length}${overrides.length ? ` · ${overrides.length} override${overrides.length > 1 ? "s" : ""}` : ""}  `,
			`**Internal links** ${internalLinks}  `,
			`**Schema** ${schema}`,
			autopost ? `**Shipped by** ${AUTOPOST_ACTOR} · no human review (site autopost is on)` : "",
			overrides.length ? `\n**Unresolved (soft gate overridden)**\n${overrides.map((o) => `- ${o}`).join("\n")}` : "",
			`\nWrites only to \`${repo.contentDir}\` and \`${repo.assetDir}\`. Never pushes to ${repo.baseBranch}. CI runs the repo's own checks.`,
		]
			.filter(Boolean)
			.join("\n");
		const branch = repo.branchPattern.replace("{slug}", post.slug);
		let mrId;
		let number;
		if (open) {
			// The PR for this post already exists (re-approval after an edit): it was updated in place.
			mrId = open._id;
			number = open.number;
			await ctx.db.patch(open._id, { headSha: pr.headSha, ci: "pending", ciDetail: undefined, files: render.files, overrides, description, postVersion: version, manifestVersion: manifest.version, ...(autopost ? { autopost: true } : {}) });
		} else {
			const siteMrs = await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", siteId)).take(1000);
			number = pr.number ?? siteMrs.reduce((m, x) => Math.max(m, x.number), 0) + 1;
			mrId = await ctx.db.insert("mergeRequests", {
				workspaceId: site.workspaceId,
				siteId,
				postId,
				repoConnectionId: repo._id,
				host: repo.host,
				repo: repo.repo,
				number,
				...(pr.externalId ? { externalId: pr.externalId } : {}),
				branch,
				base: repo.baseBranch,
				headSha: pr.headSha,
				status: "open",
				ci: "pending",
				...(pr.previewUrl ? { previewUrl: pr.previewUrl } : {}),
				...(pr.url ? { url: pr.url } : {}),
				files: render.files,
				openedAt: Date.now(),
				overrides,
				title: `content: add ${post.title}`,
				description,
				manifestVersion: manifest.version,
				postVersion: version,
				...(autopost ? { autopost: true } : {}),
			});
		}
		const r = await transitionPost(ctx, post, "mr-open", { extra: { mrId } });
		if (!r.ok) return null;
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: { system: autopost ? AUTOPOST_ACTOR : "CMS agent" }, action: "opened MR", target: `${mrRef(repo.host, number)} ${branch}`, detail: `${repo.host === "github" ? "GitHub" : "GitLab"} · ${repo.baseBranch} · manifest v${manifest.version}` });
		await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudienceWith(ctx, site, "mr.merge"), tone: "ink", title: `MR ${mrRef(repo.host, number)} opened${autopost ? " by autopost" : ""}`, body: `${post.title} · ${branch} → ${repo.baseBranch}`, href: "/merge-requests" });
		return mrId;
	},
});
