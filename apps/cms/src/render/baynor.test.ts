// Regression tests from the first live Baynor post (13 Nov 2026): a template whose <title> is "Site | <headline.>",
// whose tag links to a bare domain, whose hero photo is reused as a backdrop, whose byline has an avatar, and whose
// "Keep reading" card links the sample article. Plus image blocks inserted from the writer's image sheet.
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { placeImageBlocks } from "../../convex/lib/imageBlocks";
import type { IImageSlot, IPost } from "../lib/types";
import { renderPost } from "./render";
import type { TParseHtml } from "./structure";

const parseHtml: TParseHtml = (html) => new DOMParser().parseFromString(html, "text/html") as unknown as Document;

const TEMPLATE = `<!doctype html><html><head><title>BAYNOR AI | Start with one workflow, not a whole AI strategy</title>
<link rel="canonical" href="https://baynor.qa/blog/sample-post"></head><body>
<div class="article-backdrop" aria-hidden="true"><img src="/assets/services-team.webp" alt=""></div>
<article><h1 class="display">Start with one workflow, not a whole AI strategy.</h1>
<dl class="article-meta"><div><span class="avatar"><img src="/assets/favicon.svg" alt=""></span><dd class="article-author">Baynor team</dd></div></dl>
<div class="prose"><figure class="article-hero"><img src="/assets/services-team.webp" alt="Sample" width="1536" height="1024"></figure>
<p>Sample paragraph.</p><h2>Sample heading</h2><p>More sample.</p></div>
<footer class="article-end"><div class="tags"><a class="tag" rel="tag" href="https://blog.baynor.qa/">Getting started</a></div></footer></article>
<section class="related"><h2>Keep reading</h2><div class="related-grid"><a class="related-card" href="https://blog.baynor.qa/start-with-one-workflow"><h3>Start with one workflow, not a whole AI strategy</h3></a></div></section>
<section class="cta"><h2 id="cta-title">Talk to us</h2></section></body></html>`;

const slot = (id: string, type: IImageSlot["type"], placement: string): IImageSlot => ({ id, postId: "p", name: id, type, placement, width: 1600, height: 900, format: type === "diagram" ? "svg" : "webp", breakpoints: [], filename: `post-${id}.${type === "diagram" ? "svg" : "webp"}`, alt: `${id} alt`, prompt: "", styleKeywords: [], provider: "openai", model: "m", status: "selected", estimateUsd: 0, candidates: [{ id: "c", label: "c", hue: 0, selected: true }] }) as unknown as IImageSlot;

describe("Baynor template regressions", () => {
	const slots = [slot("hero1", "hero", "Top of post"), slot("dia1", "diagram", 'In "Why it matters"')];
	const blocks = placeImageBlocks(
		[
			{ id: "b1", kind: "p", text: "Opening answer." },
			{ id: "b2", kind: "h2", text: "Why it matters" },
			{ id: "b3", kind: "p", text: "Because." },
		],
		slots.map((s) => ({ id: s.id, type: s.type, placement: s.placement })),
		(id) => ({ id: `img-${id}`, kind: "image", text: id }),
	);
	const post = { id: "p", slug: "ai-knowledge-base", title: "The AI Knowledge Base", seoTitle: "The AI Knowledge Base", blocks, words: 3, intent: "informational", contentType: "guide", state: "in-review", facts: [] } as unknown as IPost;
	const r = renderPost({ manifestHtml: TEMPLATE, post, slots, site: { domain: "baynor.qa", name: "BAYNOR AI", repo: { contentDir: "dist/blog", assetDir: "dist/assets/blog" } } as never, pillarName: "Customer Support", mode: "publish", variants: false, parseHtml, authorProfile: { name: "Toheeb Adeboye", image: { src: "/assets/blog/authors/toheeb-400.webp", width: 400, height: 400, alt: "Photo" } } });
	const doc = parseHtml(r.html);

	it("inserts image blocks: hero first, the diagram after the paragraph under its heading", () => {
		expect(blocks.map((b) => b.id)).toEqual(["img-hero1", "b1", "b2", "b3", "img-dia1"]);
		expect(r.stats.images).toBe(2);
	});
	it("keeps the site prefix in <title> and swaps the sample headline (despite its full stop)", () => {
		expect(doc.querySelector("title")?.textContent).toBe("BAYNOR AI | The AI Knowledge Base");
	});
	it("leaves a bare-domain tag link working", () => {
		expect(doc.querySelector("a.tag")?.getAttribute("href")).toBe("https://blog.baynor.qa/");
	});
	it("swaps the sample hero everywhere (backdrop included) and the byline avatar", () => {
		expect(r.html).not.toContain("services-team.webp");
		expect(doc.querySelector(".avatar img")?.getAttribute("src")).toBe("/assets/blog/authors/toheeb-400.webp");
		expect(doc.querySelector(".article-author")?.textContent).toBe("Toheeb Adeboye");
	});
	it("drops the sample's own 'Keep reading' card and its emptied section, keeps the CTA", () => {
		expect(doc.querySelector(".related")).toBeNull();
		expect(r.html).not.toContain("Start with one workflow");
		expect(doc.querySelector("#cta-title")).not.toBeNull();
	});
});
