// Inputs for the server renderer (render.ts): the confirmed manifest's sample file, the post and its slots in the
// prototype shapes renderPost takes (via gateInputs), and the site's repo layout. One site only (I4).
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { gateInputs } from "./lib/gateInputs";

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
		const author = post.assigneeId ? (await ctx.db.get(post.assigneeId))?.name : undefined;
		return {
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
			publishedAt: new Date(post.liveAt ?? Date.now()).toISOString(),
		};
	},
});
