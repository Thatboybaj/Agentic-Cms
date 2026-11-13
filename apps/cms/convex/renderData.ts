// Inputs for the server renderer (render.ts): the confirmed manifest's sample file, the post and its slots in the
// prototype shapes renderPost takes (via gateInputs), and the site's repo layout. One site only (I4).
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { gateInputs } from "./lib/gateInputs";
import { authorProfileFor } from "./authors";
import { sourceHash } from "./agents/translateCore";

export const forPost = internalQuery({
	args: { siteId: v.id("sites"), postId: v.id("posts"), manifestId: v.optional(v.id("templateManifests")) },
	handler: async (ctx, { siteId, postId, manifestId }) => {
		const site = await ctx.db.get(siteId);
		const post = await ctx.db.get(postId);
		if (!site || !post || post.siteId !== siteId) return null;
		const inputs = await gateInputs(ctx, site, post);
		const manifest = manifestId ? await ctx.db.get(manifestId) : inputs.manifestDoc;
		if (!manifest || manifest.siteId !== siteId || !manifest.samplePath) return null;
		const sample = await ctx.db.query("templateFiles").withIndex("by_manifest_path", (q) => q.eq("manifestId", manifest._id).eq("path", manifest.samplePath!)).unique();
		if (!sample?.storageId) return null; // seeded/demo manifests have no stored files: the step keeps its stub
		const pillar = await ctx.db.get(post.pillarId);
		// The credited author (rubrics and authors); older posts without one keep the assignee's name.
		const profile = await authorProfileFor(ctx, post);
		const author = profile?.name ?? (post.assigneeId ? (await ctx.db.get(post.assigneeId))?.name : undefined);
		// Language versions: each enabled language with a saved version, flagged current when it was made from this
		// exact content (a stale one isn't re-committed; the repo keeps the last good file).
		const selected = (await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50)).filter((x) => x.status === "selected");
		const src = { title: post.title, seoTitle: post.seoTitle, ...(post.metaDescription ? { metaDescription: post.metaDescription } : {}), ...(pillar && pillar.siteId === siteId ? { pillarName: pillar.name } : {}), blocks: post.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })), alts: selected.map((x) => ({ slotId: x._id as string, alt: x.alt })) };
		const conn = inputs.repoDoc;
		const languages = (site.languages ?? [])
			.filter((l) => l.enabled)
			.map((l) => {
				const t = (post.translations ?? []).find((x) => x.lang === l.lang);
				return { ...l, translation: t ?? null, current: !!t && t.sourceHash === sourceHash(src, l.lang, l.styleGuide ?? "") };
			});
		return {
			languages,
			...(conn && conn.host === "github" && conn.live ? { git: { installationId: conn.installationId, repo: conn.repo, ref: conn.baseBranch } } : {}),
			sampleStorageId: sample.storageId,
			samplePath: manifest.samplePath,
			manifest: { id: manifest._id as string, version: manifest.version, output: manifest.output, mappings: manifest.mappings },
			post: inputs.post,
			slots: inputs.slots,
			slotDocs: inputs.slotDocs.map((s) => ({ id: s._id as string, filename: s.filename, selectedCandidateId: s.selectedCandidateId ?? null })),
			site: { domain: site.domain, name: site.name, repo: inputs.repo },
			keyword: inputs.keyword,
			metaDescription: post.metaDescription,
			...(pillar && pillar.siteId === siteId ? { pillarName: pillar.name } : {}),
			...(author ? { author } : {}),
			...(profile ? { authorProfile: profile } : {}),
			publishedAt: new Date(post.liveAt ?? Date.now()).toISOString(),
		};
	},
});
