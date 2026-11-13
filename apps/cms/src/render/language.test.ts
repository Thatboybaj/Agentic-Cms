// Language versions (every site): a language template with its own chrome, dt/dd meta labels in that language,
// {slug} placeholders and a language switch, rendered with structures borrowed from the main template.
import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import type { IImageSlot, IPost } from "../lib/types";
import { renderPost } from "./render";

const parseHtml = (h: string) => new DOMParser().parseFromString(h, "text/html") as unknown as Document;

const AR = `<!doctype html><html lang="ar" dir="rtl"><head><title>بينور BAYNOR AI | ابدأ بمسار عمل واحد</title>
<link rel="canonical" href="https://baynor.qa/ar/blog/{slug}"></head><body>
<nav><a href="/blog/{related-slug}" lang="en" hreflang="en">English</a></nav>
<div class="article-backdrop"><img src="/assets/blog/{slug}-hero.webp" alt=""></div>
<article id="article"><header class="article-head"><div><h1 class="display">ابدأ بمسار عمل واحد، لا بخطة شاملة.</h1>
<dl class="article-meta"><div><dt class="sr-only">الكاتب</dt><dd>فريق بينور</dd></div><div><dt>التصنيف</dt><dd>البداية</dd></div>
<div><dt>التاريخ</dt><dd><time datetime="2026-11-12">12 نوفمبر 2026</time></dd></div><div><dt>القراءة</dt><dd>5 دقائق</dd></div></dl></div></header>
<figure class="article-hero"><img src="/assets/blog/{slug}-hero.webp" alt="عينة" width="1536" height="1024"></figure>
<div class="prose"><p>فقرة العينة.</p><h2>عنوان العينة</h2><ul><li><strong>العمل يتكرر.</strong> الخطوات نفسها تحدث كل يوم.</li></ul><div class="callout"><p>نص العينة.</p></div></div>
<footer class="article-end"><div class="tags"><a href="/ar/blog">البداية</a><a href="/ar/blog">العمليات</a></div>
<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fbaynor.qa%2Far%2Fblog%2F{slug}">in</a></footer></article></body></html>`;
const EN = `<!doctype html><html lang="en"><head><title>x</title></head><body><article><h1>x</h1><div class="prose"><p>x</p><h2>x</h2><h3>Question</h3><p>x</p></div></article></body></html>`;

const slot = { id: "s1", postId: "p", name: "hero", type: "hero", placement: "Top of post", width: 1600, height: 900, format: "webp", breakpoints: [], filename: "my-post-hero.webp", alt: "فريق يعمل", prompt: "", styleKeywords: [], provider: "openai", model: "m", status: "selected", estimateUsd: 0, candidates: [{ id: "c", label: "c", hue: 0, selected: true }] } as unknown as IImageSlot;
const post = { id: "p", slug: "my-post", title: "دليل عملي", seoTitle: "دليل عملي", words: 600, blocks: [{ id: "i", kind: "image", text: "s1" }, { id: "b1", kind: "p", text: "اقرأ [خدماتنا](/ar/services)." }, { id: "b2", kind: "h2", text: "لماذا" }, { id: "b3", kind: "ul", text: "أ\nب" }, { id: "b4", kind: "faq", text: "سؤال؟\nجواب." }], intent: "informational", contentType: "guide", state: "in-review", facts: [] } as unknown as IPost;

describe("language versions", () => {
	const r = renderPost({
		manifestHtml: AR,
		fallbackHtml: EN,
		lang: "ar",
		post,
		slots: [slot],
		site: { domain: "baynor.qa", name: "BAYNOR AI", repo: { contentDir: "dist/ar/blog", assetDir: "dist/assets/blog" } } as never,
		pillarName: "دعم العملاء",
		mode: "publish",
		variants: false,
		parseHtml,
		mappings: [{ selector: "div.callout", label: "Callout", status: "mapped" }] as never,
		publishedAt: "2026-11-13T00:00:00Z",
		authorProfile: { name: "Toheeb Adeboye" },
		alternates: [
			{ hreflang: "en", href: "https://baynor.qa/blog/my-post" },
			{ hreflang: "ar", href: "https://baynor.qa/ar/blog/my-post" },
			{ hreflang: "x-default", href: "https://baynor.qa/blog/my-post" },
		],
	});
	const doc = parseHtml(r.html);
	const dd = [...doc.querySelectorAll(".article-meta dd")].map((d) => d.textContent);

	it("renders with nothing held, at the language URL", () => {
		expect(r.held).toEqual([]);
		expect(r.url).toBe("https://baynor.qa/ar/blog/my-post");
	});
	it("fills meta found by its Arabic labels: author, category, date, read time", () => {
		expect(dd).toEqual(["Toheeb Adeboye", "دعم العملاء", "13 نوفمبر 2026", "دقيقتان"]);
	});
	it("swaps the shortened headline in <title>", () => {
		expect(doc.querySelector("title")?.textContent).toBe("بينور BAYNOR AI | دليل عملي");
	});
	it("links the language versions and fills {slug} placeholders", () => {
		expect(doc.querySelector('nav a[hreflang="en"]')?.getAttribute("href")).toBe("/blog/my-post");
		expect([...doc.querySelectorAll('link[rel="alternate"]')].map((l) => l.getAttribute("hreflang"))).toEqual(["en", "ar", "x-default"]);
		expect(r.html).not.toContain("{slug}");
		expect(doc.querySelector(".article-backdrop img")?.getAttribute("src")).toBe("/assets/blog/my-post-hero.webp");
	});
	it("keeps no sample text: list items, callout, extra tags", () => {
		expect([...doc.querySelectorAll(".prose li")].map((l) => l.textContent)).toEqual(["أ", "ب"]);
		expect(r.html).not.toContain("العينة");
		expect(r.html).not.toContain("الخطوات نفسها");
		expect([...doc.querySelectorAll(".tags a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["دعم العملاء", "/ar/blog"]]);
	});
	it("borrows the main template's h3 for FAQ questions", () => {
		expect(doc.querySelector(".prose h3")?.textContent).toBe("سؤال؟");
	});
});
