import { describe, expect, it } from "vitest";
import { applySvgStrings, blockProblem, svgStrings, chunkBlocks, headerProblem, linkedPaths, localizeLinks, parseJson, sourceHash, systemPrompt } from "./translateCore";

const src = { title: "Start with one workflow", seoTitle: "Start with one workflow", blocks: [{ id: "b1", kind: "p", text: "Book a [free call](/contact) in 30 minutes." }, { id: "i1", kind: "image", text: "slot" }, { id: "b2", kind: "ul", text: "One\nTwo" }], alts: [{ slotId: "s1", alt: "A team" }] };

describe("translation agent checks (every site)", () => {
	it("passes a faithful Arabic block and names what a bad one broke", () => {
		const b = src.blocks[0]!;
		expect(blockProblem(b, "احجز [مكالمة مجانية](/contact) خلال 30 دقيقة.", "ar")).toBeNull();
		expect(blockProblem(b, "احجز مكالمة مجانية خلال 30 دقيقة.", "ar")).toMatch(/links changed/);
		expect(blockProblem(b, "احجز [مكالمة](/contact) خلال 20 دقيقة.", "ar")).toMatch(/numbers changed/);
		expect(blockProblem(b, "احجز [مكالمة](/contact) خلال ٣٠ دقيقة.", "ar")).toBeNull(); // Arabic-Indic digits are the same number
		expect(blockProblem(b, "Book a [free call](/contact) in 30 minutes.", "ar")).toMatch(/not written in Modern Standard Arabic/);
		expect(blockProblem(b, "احجز [مكالمة](/contact) خلال 30 دقيقة. [ملاحظة: تحقق]", "ar")).toMatch(/bracketed note/);
		expect(blockProblem(src.blocks[2]!, "واحد", "ar")).toMatch(/1 lines; the source has 2/);
		expect(blockProblem({ id: "x", kind: "p", text: "Answers 24/7, in 2 languages." }, "إجابات على مدار الساعة بلغتين.", "ar")).toBeNull(); // idiom and the dual
		expect(blockProblem({ id: "x", kind: "p", text: "Answers 24/7 within 15 minutes." }, "إجابات على مدار الساعة خلال دقائق.", "ar")).toMatch(/numbers changed/);
	});

	it("checks the header and parses fenced JSON", () => {
		expect(headerProblem(src, { title: "ابدأ بمسار عمل واحد", alts: [{ id: "s1", text: "فريق" }] }, "ar")).toBeNull();
		expect(headerProblem(src, { title: "ابدأ بمسار", alts: [] }, "ar")).toMatch(/image description/);
		expect(parseJson<{ a: number }>('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
	});

	it("chunks body blocks, skips images, and hashes content", () => {
		expect(chunkBlocks(src.blocks).flat().map((b) => b.id)).toEqual(["b1", "b2"]);
		expect(sourceHash(src, "ar")).toBe(sourceHash({ ...src }, "ar"));
		expect(sourceHash(src, "ar")).toBe(sourceHash({ ...src, alts: [{ alt: "A team", slotId: "s1" }] }, "ar")); // key order doesn't matter
		expect(sourceHash(src, "ar")).not.toBe(sourceHash({ ...src, title: "Other" }, "ar"));
		expect(systemPrompt({ lang: "ar", siteName: "S", domain: "s.qa", styleGuide: "Brand: بينور" })).toContain("<style_guide>");
	});

	it("moves site links under the language prefix only when that page exists", () => {
		const t = "اقرأ [الخدمات](/services) و[المدونة](https://s.qa/blog/x) و[مصدر](https://example.org/a)";
		expect(linkedPaths([{ text: t }], "s.qa")).toEqual(["/services", "/blog/x"]);
		expect(localizeLinks(t, "s.qa", "/ar", (p) => p === "/ar/services")).toBe("اقرأ [الخدمات](/ar/services) و[المدونة](https://s.qa/blog/x) و[مصدر](https://example.org/a)");
	});

	it("translates a diagram's words and nothing else", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title id="t">four-areas.jpg</title><desc id="d">4 steps: Teams &amp; tools</desc><text x="180">1</text><text x="236"> Sales follow-ups </text></svg>';
		expect(svgStrings(svg)).toEqual([{ id: "s2", text: "4 steps: Teams & tools" }, { id: "s4", text: "Sales follow-ups" }]);
		const out = applySvgStrings(svg, "ar", { s2: "4 خطوات: الفرق والأدوات", s4: "متابعة المبيعات" });
		expect(out).toBe('<svg xml:lang="ar" xmlns="http://www.w3.org/2000/svg"><title id="t">four-areas.jpg</title><desc id="d">4 خطوات: الفرق والأدوات</desc><text x="180">1</text><text x="236"> متابعة المبيعات </text></svg>');
	});
});
