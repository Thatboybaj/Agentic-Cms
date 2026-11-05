import { describe, expect, it } from "vitest";
import { brandColors, chartSvg, contrast, deterministicDiagrams, enumerations, numberPairs, sanitizeSvg, stepsFor } from "./svg";
import type { IPostExcerpt, TAgentSlot } from "./types";

describe("sanitizeSvg", () => {
	it("strips scripts, handlers, foreignObject, external hrefs, url() and comments", () => {
		const dirty = `<?xml version="1.0"?><!DOCTYPE svg><svg viewBox="0 0 10 10" onload="alert(1)"><!-- hi --><script>alert(2)</script>
			<style>@import url(https://evil.test/x.css)</style>
			<foreignObject><div onclick="x()">html</div></foreignObject>
			<a href="https://evil.test"><text>link</text></a>
			<image href="https://evil.test/p.png"/>
			<use href="https://evil.test/s.svg#a"/><use href="#ok"/>
			<rect width="5" height="5" fill="url(https://evil.test/p)" onmouseover="x()" style="fill:red"/>
			<path d="M0 0" fill="url(#grad)"/>
			<text x="1" font-family="system-ui">Scan &amp; plan</text>
			<circle href="&#106;avascript:alert(1)" r="2"/></svg>`;
		const out = sanitizeSvg(dirty)!;
		expect(out).toBeTruthy();
		for (const bad of ["script", "onload", "onclick", "onmouseover", "foreignObject", "evil.test", "@import", "<!--", "DOCTYPE", "<?xml", "<image", "<a ", "javascript", "style="]) expect(out).not.toContain(bad);
		expect(out).toContain('<use href="#ok"/>');
		expect(out).toContain('fill="url(#grad)"');
		expect(out).toContain("Scan &amp; plan");
		expect(out).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 10 10">/);
		expect(out.endsWith("</svg>")).toBe(true);
	});

	it("returns null without an svg root and closes unbalanced tags", () => {
		expect(sanitizeSvg("<div>nope</div>")).toBeNull();
		expect(sanitizeSvg('<svg viewBox="0 0 1 1"><g><rect/></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><g><rect/></g></svg>');
	});

	it("drops namespaced elements (xhtml etc.) with their content", () => {
		expect(sanitizeSvg('<svg><html:script>bad()</html:script><rect/></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
	});
});

const slot: TAgentSlot = {
	id: "s-inv-timeline",
	name: "Treatment timeline diagram",
	type: "diagram",
	placement: 'After "How long does treatment take?"',
	width: 1200,
	height: 675,
	alt: "Invisalign treatment timeline from first scan to retainers, 6 to 18 months",
	prompt: "Clean horizontal timeline diagram: scan, first aligners, refinements, retainers.",
	styleKeywords: [],
	provider: "openai",
	model: "openai-image",
};
const post: IPostExcerpt = {
	title: "invisalign cost in lagos (2026 prices)",
	keyword: "invisalign cost in lagos 2026",
	headings: ["What Invisalign costs in Lagos in 2026", "How long does treatment take?", "Is it worth the cost?"],
	listItems: [],
	paragraphs: [
		"Here are 2026 prices from our clinics, what's included, and how to spread the cost.",
		"Treatment is priced by complexity: minor, moderate or comprehensive. Every plan includes the scan, the aligners, refinements and retainers.",
	],
	blocks: [
		{ kind: "h2", text: "How long does treatment take?" },
		{ kind: "h2", text: "Is it worth the cost?" },
	],
};
const brand = { palette: ["#F6F1E7", "#0F766E", "#111317"], styleKeywords: [] };

describe("deterministic diagrams", () => {
	it("reads enumerations from the post's own sentences", () => {
		expect(enumerations("Every plan includes the scan, the aligners, refinements and retainers.")).toEqual([["Scan", "Aligners", "Refinements", "Retainers"]]);
	});

	it("picks the steps that match the slot brief, not unrelated lists", () => {
		expect(stepsFor(slot, post).steps).toEqual(["Scan", "Aligners", "Refinements", "Retainers"]);
	});

	it("prefers the list inside the slot's own section", () => {
		const p = { ...post, blocks: [{ kind: "h2" as const, text: "How long does treatment take?" }, { kind: "ul" as const, text: "Consult\nScan\nWear aligners" }] };
		expect(stepsFor(slot, p)).toMatchObject({ steps: ["Consult", "Scan", "Wear aligners"] });
	});

	it("draws a timeline + variant with title/desc, viewBox, brand colours and no invented numbers", () => {
		const out = deterministicDiagrams(slot, post, brand);
		expect(out.map((d) => d.kind)).toEqual(["timeline", "steps"]);
		const svg = out[0].svg;
		expect(svg).toMatch(/<svg[^>]*viewBox="0 0 1200 675"/);
		expect(svg).not.toMatch(/<svg[^>]*\swidth=/);
		expect(svg).toContain("<title id=\"t\">Treatment timeline diagram</title>");
		expect(svg).toContain("<desc id=\"d\">Timeline of 4 stages, in order: Scan, Aligners, Refinements, Retainers.</desc>");
		expect(svg).not.toMatch(/18|months/); // the alt's "6 to 18 months" is not in the post
		expect(svg).toContain("#0F766E");
		expect(sanitizeSvg(svg)).toBe(svg); // our own output survives the sanitizer unchanged
	});

	it("returns nothing when the post has fewer than two steps", () => {
		expect(deterministicDiagrams(slot, { title: "t", keyword: "k", headings: ["Only one"], listItems: [], paragraphs: [] }, brand)).toEqual([]);
	});

	it("brand colours: lightest background, darkest ink, accent ≥3:1, text ≥4.5:1", () => {
		const c = brandColors(brand.palette);
		expect(c).toMatchObject({ bg: "#F6F1E7", ink: "#111317", accent: "#0F766E" });
		expect(contrast(c.ink, c.bg)).toBeGreaterThanOrEqual(4.5);
		expect(contrast(c.onAccent, c.accent)).toBeGreaterThanOrEqual(4.5);
	});
});

describe("charts from the post's numbers only", () => {
	it("holds (null) when the post states no numbers", () => {
		expect(chartSvg({ ...slot, type: "chart" }, post, brand)).toBeNull();
	});

	it("charts label: value pairs verbatim", () => {
		const p = { ...post, listItems: ["Minor: ₦1,200,000", "Moderate: ₦2,100,000", "Comprehensive: ₦3,400,000"] };
		expect(numberPairs(p).map((x) => x.value)).toEqual([1200000, 2100000, 3400000]);
		const svg = chartSvg({ ...slot, type: "chart", name: "Price chart" }, p, brand)!;
		expect(svg).toContain("₦1,200,000");
		expect(svg).toContain("Comprehensive");
	});
});
