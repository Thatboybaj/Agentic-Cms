"use node";
// Server renderer (handoff 05 steps 5–6): renderPost in publish mode with linkedom, then the site's output format
// (serialize.ts). The renderer never invents markup: anything it couldn't place comes back in `held` and the post is
// held for a developer. Returns null when the site's confirmed manifest has no stored template file (seeded demo
// manifests), so pipeline/steps.renderStep can keep its stub there.
import { v, type Infer } from "convex/values";
import { renderPost, servedPath } from "../src/render";
import { serialize } from "../src/render/serialize";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { decodeText, linkedomParse } from "./templatesNode";

export const vPublishOutput = v.union(
	v.null(),
	v.object({
		held: v.array(v.string()),
		post: v.object({ path: v.string(), content: v.string() }),
		/** Selected images the commit should carry: repo path + the slot (bytes come from its asset, handoff 04). */
		assets: v.array(v.object({ path: v.string(), slotId: v.string() })),
		manifestVersion: v.number(),
		url: v.string(),
	}),
);

const trimSlashes = (s: string) => s.replace(/^\/+|\/+$/g, "");

export const publish = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	returns: vPublishOutput,
	handler: async (ctx, { siteId, postId }): Promise<Infer<typeof vPublishOutput>> => {
		const d = await ctx.runQuery(internal.renderData.forPost, { siteId, postId });
		if (!d) return null;
		const blob = await ctx.storage.get(d.sampleStorageId);
		if (!blob) return null;
		const manifestHtml = decodeText(new Uint8Array(await blob.arrayBuffer()));
		const r = renderPost({ manifestHtml, post: d.post, slots: d.slots, site: d.site, ...(d.pillarName ? { pillarName: d.pillarName } : {}), mode: "publish", variants: false, parseHtml: linkedomParse, mappings: d.manifest.mappings, publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}) });
		const repo = d.site.repo;
		const contentDir = trimSlashes(repo?.contentDir ?? "content/blog");
		const assetDir = trimSlashes(repo?.assetDir ?? "public/images/blog");
		if (d.manifest.output === "component") return { held: ["Component output isn't supported yet · pick HTML, MDX or JSON"], post: { path: "", content: "" }, assets: [], manifestVersion: d.manifest.version, url: r.url };
		const out = serialize({ output: d.manifest.output, post: { ...d.post, ...(d.metaDescription ? { metaDescription: d.metaDescription } : {}), keyword: d.keyword }, slots: d.slots, html: r.html, assetPath: servedPath(assetDir), publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}), url: r.url });
		return {
			held: r.held.map((h) => h.reason),
			post: { path: `${contentDir}/${d.post.slug}.${out.ext}`, content: out.content },
			assets: d.slotDocs.filter((s) => s.selectedCandidateId).map((s) => ({ path: `${assetDir}/${s.filename}`, slotId: s.id })),
			manifestVersion: d.manifest.version,
			url: r.url,
		};
	},
});
