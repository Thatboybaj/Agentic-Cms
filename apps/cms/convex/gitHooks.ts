// GitHub events → CMS state (handoff 06 step 4), plus the internal reads gitNode needs. Tenant resolution only via
// the repo connection that owns (installation, repo) (I7): a payload's own ids are never trusted beyond that. Every
// delivery is recorded once (webhookEvents) so replays are no-ops.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { activeManifest, activeRepo } from "./lib/gateInputs";
import { notify, siteAudience, siteAudienceWith } from "./lib/notify";
import { prDescription } from "./lib/prDescription";
import { transitionPost } from "./lib/transition";

const mrRef = (n: number) => `#${n}`;

export const mrForSync = internalQuery({
	args: { mrId: v.id("mergeRequests") },
	handler: async (ctx, { mrId }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.host !== "github") return null;
		const conn = await ctx.db.get(mr.repoConnectionId);
		if (!conn || conn.status !== "active" || conn.siteId !== mr.siteId || !conn.live) return null;
		return { repo: conn.repo, installationId: conn.installationId, headSha: mr.headSha, number: mr.number };
	},
});

/** Everything openPr needs for one approved post: the live connection, asset bytes per slot, and the PR text. */
export const shipContext = internalQuery({
	args: { siteId: v.id("sites"), postId: v.id("posts"), slotIds: v.array(v.string()), autopost: v.boolean(), overrides: v.array(v.string()) },
	handler: async (ctx, { siteId, postId, slotIds, autopost, overrides }) => {
		const site = await ctx.db.get(siteId);
		const post = await ctx.db.get(postId);
		const conn = await activeRepo(ctx, siteId);
		if (!site || !post || post.siteId !== siteId || !conn || conn.host !== "github" || !conn.live) return null;
		const assets: { slotId: string; storageId: Id<"_storage"> | null; name: string }[] = [];
		for (const sid of slotIds) {
			// The credited author's photo (prd-rubrics-and-authors D4): "author:<storage id>" of an author on this site.
			if (sid.startsWith("author:") && post.authorId) {
				const a = await ctx.db.get(post.authorId);
				const sids = a?.photo ? [a.photo.s96, a.photo.s192, a.photo.s400].filter(Boolean).map(String) : [];
				if (sids.includes(sid.slice(7))) assets.push({ slotId: sid, storageId: sid.slice(7) as Id<"_storage">, name: `Photo of ${a!.name}` });
				continue;
			}
			const slotId = ctx.db.normalizeId("imageSlots", sid);
			const slot = slotId ? await ctx.db.get(slotId) : null;
			if (!slot || slot.siteId !== siteId) continue;
			const cand = slot.selectedCandidateId ? await ctx.db.get(slot.selectedCandidateId) : null;
			const asset = cand?.assetId ? await ctx.db.get(cand.assetId) : null;
			assets.push({ slotId: sid, storageId: asset?.storageId ?? null, name: slot.name });
		}
		const manifest = await activeManifest(ctx, siteId);
		const langDirs = (site.languages ?? []).filter((l) => l.enabled).map((l) => l.contentDir);
		const kw = (await ctx.db.get(post.keywordId))?.term ?? post.title;
		const checks = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", postId)).take(100);
		const author = post.authorId ? await ctx.db.get(post.authorId) : null;
		const reviewer = post.reviewerId ? await ctx.db.get(post.reviewerId) : null;
		const rubric = post.rubricId ? await ctx.db.get(post.rubricId) : null;
		return {
			installationId: conn.installationId,
			repo: conn.repo,
			base: conn.baseBranch,
			branch: conn.branchPattern.replace("{slug}", post.slug),
			scope: { contentDir: conn.contentDir, assetDir: conn.assetDir, ...(conn.indexFiles ? { indexFiles: conn.indexFiles } : {}), ...(langDirs.length ? { extraDirs: langDirs } : {}) },
			title: `content: add ${post.title}`,
			message: `content(blog): ${post.currentVersion > 1 ? "update" : "add"} ${post.slug}`,
			body: prDescription({ keyword: kw, intent: post.intent, checks, overrides, autopost, contentDir: conn.contentDir, assetDir: conn.assetDir, baseBranch: conn.baseBranch, manifestVersion: manifest?.version, metaDescription: post.metaDescription, ...(author ? { author: { name: author.name, source: post.authorSource ?? "default", ...(rubric ? { rubric: rubric.name } : {}), ...(reviewer ? { reviewer: reviewer.name } : {}) } } : {}) }),
			assets,
		};
	},
});

/** CI roll-up for the MR's current head. Old heads are ignored (out-of-order events). */
export const ciResult = internalMutation({
	args: { mrId: v.id("mergeRequests"), headSha: v.string(), ci: v.union(v.literal("pending"), v.literal("passing"), v.literal("failing"), v.literal("none")), detail: v.optional(v.string()) },
	handler: async (ctx, { mrId, headSha, ci, detail }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.status !== "open" || mr.headSha !== headSha || mr.ci === ci) return;
		if (ci === "pending" || ci === "none") {
			// "none": no checks configured. Mergeable by a developer only; autopost never auto-merges without CI.
			await ctx.db.patch(mrId, { ci, ...(ci === "none" ? { ciDetail: "No CI checks configured on this repo · a developer merges" } : { ciDetail: undefined }) });
			return;
		}
		await ctx.scheduler.runAfter(0, internal.git.onCi, { mrId, ci, headSha, ...(detail ? { detail } : {}) });
	},
});

export const mergeRefused = internalMutation({
	args: { mrId: v.id("mergeRequests"), detail: v.string() },
	handler: async (ctx, { mrId, detail }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.status !== "open") return;
		const site = (await ctx.db.get(mr.siteId))!;
		const conflict = /not mergeable|merge conflict|409|405/i.test(detail);
		await ctx.db.patch(mrId, conflict ? { status: "conflict", conflictDetail: detail } : { ciDetail: detail });
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, ...(mr.postId ? { postId: mr.postId } : {}), actor: { system: "CMS agent" }, action: "merge refused by GitHub", target: `${mrRef(mr.number)} ${mr.branch}`, detail: detail.slice(0, 200) });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudienceWith(ctx, site, "mr.merge"), tone: "block", title: `${mrRef(mr.number)} couldn't merge`, body: detail.slice(0, 160), href: "/merge-requests", dedupeKey: `merge-refused:${mrId}:${mr.headSha ?? ""}` });
	},
});

// ─── Install round-trip ──────────────────────────────────────────────────────

export const recordInstall = internalMutation({
	args: { siteId: v.id("sites"), userId: v.id("users"), installationId: v.string() },
	handler: async (ctx, { siteId, userId, installationId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const existing = (await ctx.db.query("gitInstallations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(20)).find((i) => i.installationId === installationId);
		if (!existing) await ctx.db.insert("gitInstallations", { siteId, host: "github", installationId, createdBy: userId, createdAt: Date.now() });
		return { slug: site.slug };
	},
});

// ─── Webhooks ────────────────────────────────────────────────────────────────

async function connectionFor(ctx: MutationCtx, installationId: string, repo: string): Promise<Doc<"repoConnections"> | null> {
	const rows = await ctx.db.query("repoConnections").withIndex("by_repo", (q) => q.eq("host", "github").eq("repo", repo)).take(10);
	return rows.find((r) => r.status === "active" && r.installationId === installationId) ?? null;
}

async function openMrsFor(ctx: MutationCtx, conn: Doc<"repoConnections">) {
	return (await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", conn.siteId).eq("status", "open")).take(200)).filter((m) => m.repoConnectionId === conn._id);
}

type TPayload = {
	installation?: { id?: number };
	repository?: { full_name?: string };
	action?: string;
	check_suite?: { head_sha?: string };
	check_run?: { head_sha?: string };
	sha?: string;
	pull_request?: { number?: number; merged?: boolean; merge_commit_sha?: string | null; merged_by?: { login?: string } | null; head?: { sha?: string; ref?: string } };
	repositories_removed?: { full_name?: string }[];
};

export const onEvent = internalMutation({
	args: { deliveryId: v.string(), event: v.string(), payload: v.any() },
	handler: async (ctx, { deliveryId, event, payload }) => {
		const seen = await ctx.db.query("webhookEvents").withIndex("by_source_delivery", (q) => q.eq("source", "github").eq("deliveryId", deliveryId)).unique();
		if (seen) return { status: "duplicate" as const };
		const p = payload as TPayload;
		const inst = String(p.installation?.id ?? "");
		const record = (status: "processed" | "ignored", siteId?: Id<"sites">) => ctx.db.insert("webhookEvents", { source: "github", deliveryId, type: `${event}${p.action ? `.${p.action}` : ""}`, receivedAt: Date.now(), status, ...(siteId ? { siteId } : {}) });

		if (event === "installation" && p.action === "deleted") {
			for (const c of (await ctx.db.query("repoConnections").withIndex("by_installation", (q) => q.eq("host", "github").eq("installationId", inst)).take(50)).filter((c) => c.status === "active")) await removeConnection(ctx, c, "The GitHub App was uninstalled");
			await record("processed");
			return { status: "processed" as const };
		}
		if (event === "installation_repositories" && p.action === "removed") {
			for (const r of p.repositories_removed ?? []) {
				const c = r.full_name ? await connectionFor(ctx, inst, r.full_name) : null;
				if (c) await removeConnection(ctx, c, `${r.full_name} was removed from the GitHub App installation`);
			}
			await record("processed");
			return { status: "processed" as const };
		}

		const repo = p.repository?.full_name;
		const conn = repo && inst ? await connectionFor(ctx, inst, repo) : null;
		if (!conn) {
			await record("ignored"); // unknown repo / installation: 200, nothing touched
			return { status: "ignored" as const };
		}
		const mrs = await openMrsFor(ctx, conn);
		if (event === "check_suite" || event === "check_run" || event === "status") {
			const sha = p.check_suite?.head_sha ?? p.check_run?.head_sha ?? p.sha;
			for (const m of mrs.filter((x) => x.headSha && x.headSha === sha)) await ctx.scheduler.runAfter(0, internal.gitNode.refreshCi, { mrId: m._id });
		} else if (event === "pull_request") {
			const pr = p.pull_request;
			const mr = mrs.find((x) => x.number === pr?.number) ?? (await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", conn.siteId)).take(500)).find((x) => x.repoConnectionId === conn._id && x.number === pr?.number);
			if (mr && p.action === "closed") {
				if (pr?.merged) await ctx.scheduler.runAfter(0, internal.git.onMerged, { mrId: mr._id, sha: pr.merge_commit_sha ?? "", by: pr.merged_by?.login ?? "GitHub" });
				else await closedUnmerged(ctx, mr);
			} else if (mr && p.action === "synchronize" && pr?.head?.sha && pr.head.sha !== mr.headSha) {
				// Someone else pushed to the post branch: the approved head is gone; CI reruns on the new head.
				await ctx.db.patch(mr._id, { headSha: pr.head.sha, ci: "pending", ciDetail: "New commits on the branch from outside the CMS" });
				await ctx.scheduler.runAfter(0, internal.gitNode.refreshCi, { mrId: mr._id });
			}
		}
		await record("processed", conn.siteId);
		return { status: "processed" as const };
	},
});

async function closedUnmerged(ctx: MutationCtx, mr: Doc<"mergeRequests">) {
	if (mr.status === "closed" || mr.status === "merged") return;
	const site = (await ctx.db.get(mr.siteId))!;
	await ctx.db.patch(mr._id, { status: "closed" });
	const post = mr.postId ? await ctx.db.get(mr.postId) : null;
	if (post && post.state === "mr-open") await transitionPost(ctx, post, "in-review");
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, ...(post ? { postId: post._id } : {}), actor: { system: "GitHub" }, action: "closed MR without merging", target: `${mrRef(mr.number)} ${mr.branch}`, detail: post ? "Post back in review" : "" });
	await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), tone: "human", title: `${mrRef(mr.number)} was closed without merging`, body: `${post?.title ?? mr.branch} is back in review`, href: "/merge-requests" });
}

async function removeConnection(ctx: MutationCtx, c: Doc<"repoConnections">, why: string) {
	const site = await ctx.db.get(c.siteId);
	await ctx.db.patch(c._id, { status: "removed" });
	if (!site) return;
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: { system: "GitHub" }, action: "disconnected repo", target: c.repo, detail: why });
	await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudienceWith(ctx, site, "repo.connect"), tone: "block", title: `Repo disconnected · ${c.repo}`, body: `${why}. Posts can't ship until a developer reconnects it.`, href: "/settings" });
}


export const mrRebaseInput = internalQuery({
	args: { mrId: v.id("mergeRequests") },
	handler: async (ctx, { mrId }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || !mr.postId) return null;
		return { siteId: mr.siteId, postId: mr.postId, autopost: !!mr.autopost, overrides: mr.overrides };
	},
});

export const rebased = internalMutation({
	args: { mrId: v.id("mergeRequests"), headSha: v.string(), manifestVersion: v.number() },
	handler: async (ctx, { mrId, headSha, manifestVersion }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr) return;
		await ctx.db.patch(mrId, { headSha, ci: "pending", status: "open", conflictDetail: undefined, ciDetail: undefined, manifestVersion });
		await ctx.scheduler.runAfter(30_000, internal.gitNode.refreshCi, { mrId }); // in case the repo's CI never reports
	},
});
