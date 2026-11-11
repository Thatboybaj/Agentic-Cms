import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { createSeed, LUMEN_ID, standardMappings } from "../lib/seed";
import type { IImageSlot, IPost } from "../lib/types";
import { pickSamplePost, resolveInBundle, safeBundlePath } from "./bundle";
import { parseTemplate, TemplateParseError } from "./parse";
import { renderPost, type IRenderInput } from "./render";
import { structureMap, type TParseHtml } from "./structure";

const parseHtml: TParseHtml = (html) => new DOMParser().parseFromString(html, "text/html") as unknown as Document;
const TEMPLATE = readFileSync(join(__dirname, "..", "..", "public", "demo-templates", "lumen", "post.html"), "utf8");

const seed = createSeed();
const data = seed.data[LUMEN_ID]!;
const site = seed.sites.find((s) => s.id === LUMEN_ID)!;
const post = (id: string) => structuredClone(data.posts.find((p) => p.id === id)!) as IPost;
const slotsOf = (p: IPost) => structuredClone(data.slots.filter((s) => s.postId === p.id)) as IImageSlot[];
const mappings = standardMappings("t", true);

function render(p: IPost, extra: Partial<IRenderInput> = {}) {
	const r = renderPost({ manifestHtml: TEMPLATE, post: p, slots: slotsOf(p), site, pillarName: "General dentistry", mode: "preview", parseHtml, mappings, ...extra });
	return { ...r, doc: parseHtml(r.html) };
}

const classSet = (doc: Document) => new Set(Array.from(doc.querySelectorAll("[class]")).flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)));
const tagSet = (doc: Document) => new Set(Array.from(doc.querySelectorAll("*")).map((el) => el.tagName.toLowerCase()));

describe("parseTemplate · demo Lumen template", () => {
	const parsed = parseTemplate(TEMPLATE, parseHtml);
	const sel = (role: string) => parsed.mappings.filter((m) => m.role === role).map((m) => m.selector);

	it("finds the content region, body wrapper and repeating structures", () => {
		expect(sel("content-region")).toContain("article.post");
		expect(sel("content-region")).toContain("div.post__body");
		expect(sel("heading")).toEqual(["h2.post__heading", "h3"]);
		expect(sel("list")).toEqual(["ul", "ol"]);
		expect(sel("quote")).toEqual(["blockquote.pull"]);
	});

	it("records the table as absent (fidelity rule)", () => {
		const table = parsed.mappings.find((m) => m.role === "table")!;
		expect(table.status).toBe("absent");
	});

	it("records image containers with their srcset pattern", () => {
		const images = parsed.mappings.filter((m) => m.role === "image");
		expect(images.map((m) => m.selector)).toContain("figure.post-media > img[srcset]");
		expect(images.map((m) => m.selector)).toContain("figure.post-media.post-media--wide > img[srcset]");
		expect(images.find((m) => m.selector.startsWith("figure.post-media >"))!.detail).toMatch(/srcset ×3/);
	});

	it("extracts metadata bindings and the JSON-LD shape", () => {
		const meta = sel("meta");
		for (const s of ["title", 'meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:image"]', "time.post__date", "span.post__author", "a.post__tag", "span.post__read"]) expect(meta).toContain(s);
		const schema = parsed.mappings.find((m) => m.role === "schema")!;
		expect(schema.detail).toMatch(/Article \(JSON-LD\)/);
		expect(schema.detail).toMatch(/headline/);
	});

	it("flags the CTA and the author card as unclassified with suggested meanings", () => {
		const open = parsed.mappings.filter((m) => m.status === "needs-you");
		expect(open.map((m) => m.selector)).toEqual(["div.cta-inline", "aside.author-card"]);
		expect(open[0]!.options).toContain("CTA block");
		expect(open[1]!.options?.[0]).toBe("Author bio");
		expect(parsed.counts.needsYou).toBe(2);
	});

	it("lists the stylesheet the preview must load", () => {
		expect(parsed.assets.stylesheets).toEqual(["styles.css"]);
		expect(parsed.title).toBe("What to expect at your first check-up");
	});

	it("exposes a serializable structure map with the template's own wrapper markup", () => {
		const map = structureMap(TEMPLATE, parseHtml);
		const img = map.find((r) => r.role === "image")!;
		expect(img.selector).toBe("figure.post-media.post-media--wide");
		expect(img.markup).toContain('srcset="images/first-check-up-640.svg 640w');
		expect(map.find((r) => r.role === "quote")!.markup).toMatch(/^<blockquote class="pull">/);
	});

	it("refuses HTML with no content region", () => {
		expect(() => parseTemplate("<html><body><nav>Home</nav></body></html>", parseHtml)).toThrow(TemplateParseError);
	});
});

describe("renderPost · root canal recovery into the Lumen template", () => {
	const p = post("p-root-canal");
	const r = render(p, { publishedAt: "2026-09-25T09:42:00.000Z", baseHref: "/demo-templates/lumen/" });
	const body = r.doc.querySelector("div.post__body")!;

	it("preserves heading levels and the template's heading classes", () => {
		const h2s = Array.from(body.querySelectorAll("h2"));
		expect(h2s.map((h) => h.textContent)).toEqual(["The first 24 hours", "Days two to three", "Eating after a root canal", "When to call the clinic", "Frequently asked questions"]);
		expect(h2s.every((h) => h.getAttribute("class") === "post__heading")).toBe(true);
		expect(r.doc.querySelector("h1.post__title")!.textContent).toBe(p.seoTitle);
	});

	it("renders unresolved fact markers as plain text (as they will ship)", () => {
		expect(body.querySelector("p")!.textContent).toContain("Around 95% of treated teeth last a lifetime");
		expect(body.querySelector("mark")).toBeNull();
	});

	it("places images in the template's real containers with the srcset pattern", () => {
		const lead = r.doc.querySelector("article.post > figure.post-media > img")!;
		expect(lead.getAttribute("alt")).toBe(slotsOf(p).find((s) => s.type === "hero")!.alt);
		expect(lead.getAttribute("srcset")!.split(", ").map((x) => x.split(" ").pop())).toEqual(["640w", "1280w", "1920w"]);
		expect(lead.getAttribute("sizes")).toBe("(max-width: 760px) 100vw, 760px");
		const inline = Array.from(body.querySelectorAll("figure"));
		expect(inline.length).toBe(2);
		expect(inline.every((f) => f.getAttribute("class") === "post-media post-media--wide")).toBe(true);
		expect(r.doc.querySelector("figcaption")).toBeNull();
	});

	it("uses a selected candidate's url, else a labelled placeholder", () => {
		const q = post("p-root-canal");
		const slots = slotsOf(q);
		const hero = slots.find((s) => s.type === "hero")!;
		hero.candidates = [{ id: "c1", label: "candidate 1", hue: 180, selected: true, url: "https://cdn.example.com/hero.webp" }];
		const out = renderPost({ manifestHtml: TEMPLATE, post: q, slots, site, mode: "preview", parseHtml, mappings });
		const img = parseHtml(out.html).querySelector("article.post > figure.post-media > img")!;
		expect(img.getAttribute("src")).toBe("https://cdn.example.com/hero.webp");
		const other = parseHtml(out.html).querySelector("div.post__body figure img")!;
		expect(other.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
		expect(decodeURIComponent(other.getAttribute("src")!)).toContain(`${slots.find((s) => s.id !== hero.id)!.width}×`);
	});

	it("fills metadata bindings from the post and site", () => {
		const $ = (s: string) => r.doc.querySelector(s)!;
		expect($("title").textContent).toBe(`${p.seoTitle} · Lumen Dental`);
		expect($('link[rel="canonical"]').getAttribute("href")).toBe("https://lumendental.co/blog/root-canal-recovery");
		expect(r.url).toBe("https://lumendental.co/blog/root-canal-recovery");
		expect($('meta[property="og:title"]').getAttribute("content")).toBe(p.seoTitle);
		expect($('meta[property="og:url"]').getAttribute("content")).toBe(r.url);
		expect($('meta[name="description"]').getAttribute("content")!.length).toBeLessThanOrEqual(156);
		expect($("time.post__date").getAttribute("datetime")).toBe("2026-09-25");
		expect($("time.post__date").textContent).toBe("25 Sep 2026");
		expect($("a.post__tag").textContent).toBe("General dentistry");
		expect($("span.post__read").textContent).toBe("6 min read");
		expect($(".breadcrumb li[aria-current]").textContent).toBe(p.seoTitle);
	});

	it("emits JSON-LD in the sample's shape: Article updated + FAQPage alongside", () => {
		const blocks = Array.from(r.doc.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent!));
		expect(blocks.map((b) => b["@type"])).toEqual(["Article", "FAQPage"]);
		expect(blocks[0].headline).toBe(p.seoTitle);
		expect(blocks[0].mainEntityOfPage["@id"]).toBe(r.url);
		expect(Array.isArray(blocks[0].image)).toBe(true);
		expect(blocks[0].publisher.name).toBe("Lumen Dental");
		expect(blocks[1]["@context"]).toBe("https://schema.org");
		expect(blocks[1].mainEntity).toHaveLength(4);
		expect(blocks[1].mainEntity[0].acceptedAnswer.text).toMatch(/few days/);
	});

	it("renders the FAQ with the template's own sub-heading + paragraph", () => {
		const h3 = Array.from(body.querySelectorAll("h3")).map((h) => h.textContent);
		expect(h3).toContain("How long does root canal recovery take?");
	});

	it("keeps the mapped CTA partial, not after a heading", () => {
		const cta = body.querySelector("div.cta-inline")!;
		expect(cta).not.toBeNull();
		expect(cta.previousElementSibling?.tagName.toLowerCase()).not.toMatch(/^h\d$/);
		// Never splits the FAQ run (h3 + p pairs from one block).
		const kids = Array.from(body.children);
		const faqIdx = kids.map((k, i) => (k.tagName.toLowerCase() === "h3" ? i : -1)).filter((i) => i >= 0);
		const at = kids.indexOf(cta);
		expect(at < faqIdx[0]! || at > faqIdx[faqIdx.length - 1]! + 1).toBe(true);
		expect(r.doc.querySelector("aside.author-card")).not.toBeNull();
	});

	it("strips scripts (except JSON-LD) so the preview is safe", () => {
		const scripts = Array.from(r.doc.querySelectorAll("script"));
		expect(scripts.every((s) => s.getAttribute("type") === "application/ld+json")).toBe(true);
		expect(r.html).not.toContain("dataLayer");
		expect(r.html).not.toContain("googletagmanager");
	});

	it("adds a <base> for the site's assets in preview mode only", () => {
		expect(r.doc.querySelector("head > base")!.getAttribute("href")).toBe("/demo-templates/lumen/");
		const pub = renderPost({ manifestHtml: TEMPLATE, post: p, slots: slotsOf(p), site, mode: "publish", parseHtml, mappings, baseHref: "/x/" });
		expect(parseHtml(pub.html).querySelector("base")).toBeNull();
	});

	it("invents no class names or tags", () => {
		const template = parseHtml(TEMPLATE);
		const allowedClasses = classSet(template);
		const allowedTags = tagSet(template);
		allowedTags.add("base");
		expect([...classSet(r.doc)].filter((c) => !allowedClasses.has(c))).toEqual([]);
		expect([...tagSet(r.doc)].filter((t) => !allowedTags.has(t))).toEqual([]);
		expect(r.held).toEqual([]);
	});

	it("publish mode writes asset-dir paths following the template's srcset pattern", () => {
		const pub = renderPost({ manifestHtml: TEMPLATE, post: p, slots: slotsOf(p), site, mode: "publish", parseHtml, mappings });
		const img = parseHtml(pub.html).querySelector("article.post > figure.post-media > img")!;
		const hero = slotsOf(p).find((s) => s.type === "hero")!;
		const base = hero.filename.replace(/\.[a-z]+$/, "");
		expect(img.getAttribute("src")).toBe(`/images/blog/${base}-1920.webp`);
		expect(img.getAttribute("srcset")).toBe(`/images/blog/${base}-640.webp 640w, /images/blog/${base}-1280.webp 1280w, /images/blog/${base}-1920.webp 1920w`);
	});
});

describe("fidelity rule", () => {
	it("holds a post that needs a table the template doesn't have", () => {
		const p = post("p-aligners-vs-braces");
		p.blocks = [{ id: "b1", kind: "p", text: "Intro." }];
		const r = render(p);
		expect(r.held).toEqual([{ reason: "Template has no table" }]);
		expect(r.doc.querySelector("table")).toBeNull();
	});

	it("omits a block whose structure is missing and reports it", () => {
		const noQuote = TEMPLATE.replace(/<blockquote class="pull">[\s\S]*?<\/blockquote>/, "");
		const p = post("p-root-canal");
		p.blocks = [...p.blocks.slice(0, 3), { id: "q1", kind: "quote", text: "A quote." }];
		const r = renderPost({ manifestHtml: noQuote, post: p, slots: slotsOf(p), site, mode: "preview", parseHtml, mappings });
		expect(r.held).toEqual([{ reason: "Template has no blockquote", blockId: "q1" }]);
		expect(r.html).not.toContain("A quote.");
	});

	it("drops a partial the developer mapped as Ignore", () => {
		const ignore = mappings.map((m) => (m.selector === "div.cta-inline" ? { ...m, label: "Ignore" } : m));
		const r = render(post("p-root-canal"), { mappings: ignore });
		expect(r.doc.querySelector("div.cta-inline")).toBeNull();
	});

	it("renders a needs-assets post with placeholders labelled by slot", () => {
		const p = post("p-invisalign-2026");
		const r = render(p);
		expect(r.stats.images).toBe(5);
		expect(r.stats.placeholders).toBeGreaterThan(0);
		expect(r.warnings.join(" ")).toMatch(/placeholders/);
	});
});

describe("renderPost · WordPress-style template (title inside the body wrapper, @graph schema, table)", () => {
	const WP = `<!doctype html><html><head><title>Old title | Journal</title><link rel="canonical" href="https://x.test/journal/old/">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BlogPosting","headline":"Old"},{"@type":"BreadcrumbList","itemListElement":[]}]}</script></head>
<body><main><div class="entry-content">
<p class="kicker"><a class="entry-category" rel="tag" href="/journal/cosmetic/">Cosmetic</a> · <time datetime="2024-11-02">November 2, 2024</time></p>
<h1 class="entry-title">Old</h1>
<p>Intro.</p>
<figure class="wp-block-image"><img src="a-1024.jpg" srcset="a-480.jpg 480w, a-1024.jpg 1024w" alt=""></figure>
<h2 class="wp-block-heading">Section</h2><p>Body.</p><ul class="wp-block-list"><li>x</li></ul>
<table class="wp-block-table"><tr><td>1</td></tr></table>
</div></main></body></html>`;
	const p = post("p-root-canal");
	const r = renderPost({ manifestHtml: WP, post: p, slots: slotsOf(p), site, pillarName: "General", mode: "preview", parseHtml, publishedAt: "2026-09-25T09:00:00Z" });
	const doc = parseHtml(r.html);

	it("keeps the title and kicker in place and fills them", () => {
		const body = doc.querySelector(".entry-content")!;
		expect(body.children[0]!.getAttribute("class")).toBe("kicker");
		expect(body.children[1]!.textContent).toBe(p.seoTitle);
		expect(doc.querySelector("time")!.textContent).toBe("September 25, 2026");
		expect(doc.querySelector("a.entry-category")!.textContent).toBe("General");
		expect(doc.querySelector("title")!.textContent).toBe(`${p.seoTitle} | Journal`);
	});

	it("keeps the canonical's trailing-slash URL shape and the @graph schema shape", () => {
		expect(r.url).toBe("https://lumendental.co/journal/root-canal-recovery/");
		const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
		expect(ld["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["BlogPosting", "BreadcrumbList", "FAQPage"]);
		expect(ld["@graph"][0].headline).toBe(p.seoTitle);
	});

	it("uses the WordPress classes for headings, lists and images", () => {
		expect(Array.from(doc.querySelectorAll("h2")).every((h) => h.getAttribute("class") === "wp-block-heading")).toBe(true);
		expect(doc.querySelector("ul")!.getAttribute("class")).toBe("wp-block-list");
		expect(doc.querySelectorAll("figure.wp-block-image img").length).toBe(3);
		// No h3 in this template, so the FAQ has no pattern: held, never improvised.
		expect(r.held).toEqual([{ reason: "Template has no FAQ pattern", blockId: "rc-b14" }]);
	});
});

describe("bundle helpers", () => {
	it("rejects unsafe paths", () => {
		for (const bad of ["../x.css", "/etc/passwd", "C:\\x.css", "a/../../b.css", "__MACOSX/a.css", ".env", "a/.git/config"]) expect(safeBundlePath(bad)).toBeNull();
		expect(safeBundlePath("site\\css\\main.css")).toBe("site/css/main.css");
		expect(safeBundlePath("./blog/post.html")).toBe("blog/post.html");
	});

	it("picks the sample post by name, then by <article>", () => {
		const p = "<p>a</p><p>b</p>";
		expect(pickSamplePost([{ path: "index.html", html: `<main>${p}${p}</main>` }, { path: "blog/my-post.html", html: `<article>${p}</article>` }])).toBe("blog/my-post.html");
		expect(pickSamplePost([{ path: "index.html", html: "<div>x</div>" }, { path: "page.html", html: `<article>${p}</article>` }])).toBe("page.html");
	});

	it("resolves relative URLs inside the bundle", () => {
		expect(resolveInBundle("blog/post.html", "../css/site.css")).toBe("css/site.css");
		expect(resolveInBundle("blog/post.html", "https://cdn.x/y.css")).toBeNull();
		expect(resolveInBundle("post.html", "/assets/a.png")).toBe("assets/a.png");
	});
});

describe("applyPreviewBase", async () => {
	const { applyPreviewBase } = await import("./render");
	it("points root-relative CSS and images at the bundle root, leaves the rest alone", () => {
		const doc = new DOMParser().parseFromString(`<html><head><link rel="stylesheet" href="/styles.css?v=5"><link rel="preconnect" href="https://fonts.googleapis.com"></head><body><img src="/assets/a.webp" srcset="/assets/a.webp 1x, /assets/a@2x.webp 2x"><img src="rel.png"><img src="//cdn.x/y.png"><a href="/services">S</a></body></html>`, "text/html") as unknown as Document;
		applyPreviewBase(doc, "https://x.site/tpl/m1/blog/", "https://x.site/tpl/m1/");
		const imgs = Array.from(doc.querySelectorAll("img"));
		expect(doc.querySelector('link[rel="stylesheet"]')!.getAttribute("href")).toBe("https://x.site/tpl/m1/styles.css?v=5");
		expect(doc.querySelector('link[rel="preconnect"]')!.getAttribute("href")).toBe("https://fonts.googleapis.com");
		expect(imgs[0]!.getAttribute("src")).toBe("https://x.site/tpl/m1/assets/a.webp");
		expect(imgs[0]!.getAttribute("srcset")).toBe("https://x.site/tpl/m1/assets/a.webp 1x, https://x.site/tpl/m1/assets/a@2x.webp 2x");
		expect(imgs[1]!.getAttribute("src")).toBe("rel.png"); // the <base> handles relative URLs
		expect(imgs[2]!.getAttribute("src")).toBe("//cdn.x/y.png");
		expect(doc.querySelector("a")!.getAttribute("href")).toBe("/services");
		expect(doc.querySelector("base")!.getAttribute("href")).toBe("https://x.site/tpl/m1/blog/");
	});
});
