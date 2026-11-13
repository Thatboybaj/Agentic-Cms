"use node";
// Server renderer (handoff 05 steps 5–6): renderPost in publish mode with linkedom, then the site's output format
// (serialize.ts). The renderer never invents markup: anything it couldn't place comes back in `held` and the post is
// held for a developer. Returns null when the site's confirmed manifest has no stored template file (seeded demo
// manifests), so pipeline/steps.renderStep can keep its stub there.
import { v, type Infer } from "convex/values";
import { postUrlFromTemplate, renderPost, servedPath } from "../src/render";
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
		/** Language versions rendered from the site's language templates (dist/ar/blog/{slug}.html). */
		extra: v.optional(v.array(v.object({ path: v.string(), content: v.string() }))),
		/** Why a language version isn't in this commit (shown on the run log; never holds the main post). */
		langNotes: v.optional(v.array(v.string())),
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
		const repo0 = d.site.repo;
		const assetDir0 = trimSlashes(repo0?.assetDir ?? "public/images/blog");
		// The credited author's photo is committed into the asset folder (D4) and referenced at its served path.
		const p = d.authorProfile;
		const sizes = p?.photo ? ([[96, p.photo.s96], [192, p.photo.s192], [400, p.photo.s400]] as const).filter((x) => !!x[1]) : [];
		const photoFiles = sizes.map(([w, id]) => ({ w, id: id as string, path: `${assetDir0}/authors/${p!.slug}-${w}.webp`, served: `${servedPath(assetDir0)}/authors/${p!.slug}-${w}.webp` }));
		const big = photoFiles.find((f) => f.w === 400) ?? photoFiles[photoFiles.length - 1];
		const authorProfile = p ? { name: p.name, ...(p.url ? { url: p.url } : {}), ...(p.jobTitle ? { jobTitle: p.jobTitle } : {}), ...(p.bio ? { bio: p.bio } : {}), ...(p.sameAs ? { sameAs: p.sameAs } : {}), ...(p.credentials ? { credentials: p.credentials } : {}), ...(big ? { image: { src: big.served, width: big.w, height: big.w, alt: p.photo!.alt, ...(photoFiles.length > 1 ? { srcset: photoFiles.map((f) => `${f.served} ${f.w}w`).join(", ") } : {}) } } : {}) } : undefined;
		// Language versions: the language template from the repo, its URL, and the version text.
		const langNotes: string[] = [];
		const langs: { l: (typeof d.languages)[number]; html: string; url: string }[] = [];
		const canonicalOf = (html: string) => linkedomParse(html).querySelector('link[rel="canonical"]')?.getAttribute("href");
		for (const l of d.languages) {
			if (!l.translation) {
				langNotes.push(`No ${l.lang} version yet`);
				continue;
			}
			if (!d.git) {
				langNotes.push(`The ${l.lang} template can't be read: the repo isn't connected through the GitHub App`);
				continue;
			}
			const html = await ctx.runAction(internal.gitNode.readFile, { installationId: d.git.installationId, repo: d.git.repo, ref: d.git.ref, path: l.templatePath });
			if (!html) {
				langNotes.push(`The ${l.lang} template isn't in the repo at ${l.templatePath}`);
				continue;
			}
			langs.push({ l, html, url: postUrlFromTemplate(canonicalOf(html), d.site.domain, d.post.slug) });
		}
		const mainUrl = postUrlFromTemplate(canonicalOf(manifestHtml), d.site.domain, d.post.slug);
		const mainLang = (linkedomParse(manifestHtml).documentElement?.getAttribute("lang") ?? "en").split("-")[0] || "en";
		const alternates = langs.length ? [{ hreflang: mainLang, href: mainUrl }, ...langs.map((x) => ({ hreflang: x.l.lang, href: x.url })), { hreflang: "x-default", href: mainUrl }] : undefined;
		const r = renderPost({ manifestHtml, post: d.post, slots: d.slots, site: d.site, ...(d.pillarName ? { pillarName: d.pillarName } : {}), mode: "publish", variants: false, parseHtml: linkedomParse, mappings: d.manifest.mappings, publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}), ...(authorProfile ? { authorProfile } : {}), ...(alternates ? { alternates } : {}) });
		const repo = d.site.repo;
		const contentDir = trimSlashes(repo?.contentDir ?? "content/blog");
		const assetDir = trimSlashes(repo?.assetDir ?? "public/images/blog");
		if (d.manifest.output === "component") return { held: ["Component output isn't supported yet · pick HTML, MDX or JSON"], post: { path: "", content: "" }, assets: [], manifestVersion: d.manifest.version, url: r.url };
		const out = serialize({ output: d.manifest.output, post: { ...d.post, ...(d.metaDescription ? { metaDescription: d.metaDescription } : {}), keyword: d.keyword }, slots: d.slots, html: r.html, assetPath: servedPath(assetDir), publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}), url: r.url });
		const extra: { path: string; content: string }[] = [];
		const langAssets: { path: string; slotId: string }[] = [];
		for (const x of langs) {
			const t = x.l.translation!;
			if (!x.l.current) {
				langNotes.push(`The ${x.l.lang} version is from an earlier edit · the repo keeps its last good file until the next one is ready`);
				continue;
			}
			if (d.manifest.output !== "html") {
				langNotes.push(`Language versions need HTML output (this site uses ${d.manifest.output})`);
				continue;
			}
			const tPost = { ...d.post, title: t.title, seoTitle: t.seoTitle, blocks: t.blocks as typeof d.post.blocks };
			// Diagrams with their words in this language are separate files: "<name>-ar.svg" beside the original.
			const langFile = (fn: string) => fn.replace(/(\.[a-z0-9]+)$/i, `-${x.l.lang}$1`);
			const tSvgs = t.svgs ?? [];
			const tSlots = d.slots.map((sl) => ({ ...sl, alt: t.alts.find((a) => a.slotId === sl.id)?.alt ?? sl.alt, ...(tSvgs.some((f) => f.slotId === sl.id) ? { filename: langFile(sl.filename) } : {}) }));
			const tProfile = authorProfile?.image && x.l.lang === "ar" ? { ...authorProfile, image: { ...authorProfile.image, alt: `صورة ${authorProfile.name}` } } : authorProfile;
			const tr = renderPost({ manifestHtml: x.html, fallbackHtml: manifestHtml, lang: x.l.lang, post: tPost, slots: tSlots, site: d.site, ...((x.l.categoryLabel ?? t.pillarName ?? d.pillarName) ? { pillarName: x.l.categoryLabel ?? t.pillarName ?? d.pillarName } : {}), mode: "publish", variants: false, parseHtml: linkedomParse, mappings: d.manifest.mappings, publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}), ...(tProfile ? { authorProfile: tProfile } : {}), ...(alternates ? { alternates } : {}) });
			if (tr.held.length) {
				langNotes.push(`The ${x.l.lang} template can't render: ${tr.held.map((h) => h.reason).join(", ")}`);
				continue;
			}
			const to = serialize({ output: "html", post: { ...tPost, ...(t.metaDescription ? { metaDescription: t.metaDescription } : {}), keyword: d.keyword }, slots: tSlots, html: tr.html, assetPath: servedPath(assetDir), publishedAt: d.publishedAt, ...(d.author ? { author: d.author } : {}), url: tr.url });
			extra.push({ path: `${trimSlashes(x.l.contentDir)}/${d.post.slug}.${to.ext}`, content: to.content });
			for (const f of tSvgs) {
				const sl = d.slotDocs.find((s) => s.id === f.slotId);
				if (sl) langAssets.push({ path: `${assetDir}/${langFile(sl.filename)}`, slotId: `lang:${f.storageId}` });
			}
		}
		return {
			held: r.held.map((h) => h.reason),
			post: { path: `${contentDir}/${d.post.slug}.${out.ext}`, content: out.content },
			assets: [...d.slotDocs.filter((s) => s.selectedCandidateId).map((s) => ({ path: `${assetDir}/${s.filename}`, slotId: s.id })), ...photoFiles.map((f) => ({ path: f.path, slotId: `author:${f.id}` })), ...langAssets],
			manifestVersion: d.manifest.version,
			url: r.url,
			...(extra.length ? { extra } : {}),
			...(langNotes.length ? { langNotes } : {}),
		};
	},
});
