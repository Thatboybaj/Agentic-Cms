import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { createSeed, LUMEN_ID, standardMappings } from "../lib/seed";
import type { IImageSlot, IPost } from "../lib/types";
import { renderPost } from "./render";
import type { TParseHtml } from "./structure";

const parseHtml: TParseHtml = (html) => new DOMParser().parseFromString(html, "text/html") as unknown as Document;
const TEMPLATE = readFileSync(join(__dirname, "..", "..", "public", "demo-templates", "lumen", "post.html"), "utf8");
const seed = createSeed();
const data = seed.data[LUMEN_ID]!;
const site = seed.sites.find((s) => s.id === LUMEN_ID)!;
const post = structuredClone(data.posts.find((p) => p.blocks.length > 3)!) as IPost;
const slots = structuredClone(data.slots.filter((s) => s.postId === post.id)) as IImageSlot[];
const ola = { name: "Olayinka Adeyefa", image: { src: "/assets/blog/authors/olayinka-adeyefa-400.webp", width: 400, height: 400, alt: "Photo of Olayinka Adeyefa" } };

const render = (authorProfile?: Parameters<typeof renderPost>[0]["authorProfile"]) => {
	const r = renderPost({ manifestHtml: TEMPLATE, post, slots, site, mode: "publish", parseHtml, mappings: standardMappings("t", true), ...(authorProfile ? { authorProfile } : {}) });
	return { ...r, doc: parseHtml(r.html) };
};
const jsonLd = (doc: Document) => Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent ?? "{}") as Record<string, unknown>);

describe("credited author in the page", () => {
	it("replaces the sample's byline, card and JSON-LD author", () => {
		const { doc, html } = render({ ...ola, jobTitle: "Founder, Baynor AI", url: "https://baynor.qa/about", sameAs: ["https://www.linkedin.com/in/example"] });
		expect(doc.querySelector(".post__author")?.textContent).toBe("Olayinka Adeyefa");
		expect(doc.querySelector(".author-card__name")?.textContent).toBe("Olayinka Adeyefa");
		expect(doc.querySelector(".author-card__role")?.textContent).toBe("Founder, Baynor AI");
		expect(doc.querySelector(".author-card__avatar")?.textContent).toBe("OA");
		expect(html).not.toContain("Ada Okafor");
		const article = jsonLd(doc).flatMap((n) => (Array.isArray(n["@graph"]) ? (n["@graph"] as Record<string, unknown>[]) : [n])).find((n) => n.author);
		expect(article?.author).toEqual({ "@type": "Person", name: "Olayinka Adeyefa", jobTitle: "Founder, Baynor AI", image: ola.image.src, url: "https://baynor.qa/about", sameAs: ["https://www.linkedin.com/in/example"] });
	});

	it("renders nothing for empty fields (no undefined, no sample text)", () => {
		const { doc, html } = render(ola);
		expect(doc.querySelector(".author-card__role")).toBeNull();
		expect(html).not.toMatch(/undefined|Lead dentist/);
	});

	it("keeps the sample's byline when no author is resolved", () => {
		expect(render().doc.querySelector(".post__author")?.textContent).toBe("Dr Ada Okafor");
	});
});
