// Template parser (pure). PRD Module 4 "Parsing": content region + repeating structures, image containers
// (classes, wrapper, srcset), metadata bindings, existing JSON-LD shapes, and anything unclassified.
import type { ITemplateMapping } from "@/lib/types";
import { analyze, classesOf, selectorOf, srcsetPattern, tagOf, type TParseHtml } from "./structure";

export interface IParsedTemplate {
	mappings: ITemplateMapping[];
	sampleHtml: string;
	/** Sample post title (h1) — shown in the confirm step. */
	title: string;
	/** Relative URLs the sample loads (stylesheets / images), to check they arrived in the bundle. */
	assets: { stylesheets: string[]; images: string[] };
	counts: { mapped: number; needsYou: number; absent: number };
}

export class TemplateParseError extends Error {}

// "Keep as is": template chrome (share bars, article footers) stays exactly as in the sample on every post.
const OPTIONS_AUTHOR = ["Author bio", "Callout", "Keep as is", "Ignore"];
const OPTIONS_CTA = ["CTA block", "Callout", "Keep as is", "Ignore"];
const OPTIONS_ANY = ["CTA block", "Author bio", "Callout", "Keep as is", "Ignore"];

function optionsFor(el: Element): { options: string[]; group: ITemplateMapping["group"]; detail: string } {
	const hint = `${classesOf(el).join(" ")} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("id") ?? ""}`.toLowerCase();
	if (/author|bio|byline|about/.test(hint)) return { options: OPTIONS_AUTHOR, group: "meta", detail: "Author bio?" };
	if (/cta|book|signup|sign-up|subscribe|newsletter|promo|banner|offer/.test(hint)) return { options: OPTIONS_CTA, group: "content", detail: "Unclassified · map once" };
	return { options: OPTIONS_ANY, group: tagOf(el) === "aside" ? "meta" : "content", detail: "Unclassified · map once" };
}

function schemaShape(json: string): string {
	try {
		const v = JSON.parse(json) as Record<string, unknown>;
		const nodes = Array.isArray(v) ? v : Array.isArray(v["@graph"]) ? (v["@graph"] as Record<string, unknown>[]) : [v];
		const types = nodes.map((n) => String((n as Record<string, unknown>)["@type"] ?? "Thing"));
		const keys = Object.keys(nodes[0] ?? {}).filter((k) => !k.startsWith("@")).slice(0, 5);
		return `${types.join(", ")} (JSON-LD${Array.isArray(v["@graph"]) ? " @graph" : ""})${keys.length ? ` · ${keys.join(", ")}` : ""}`;
	} catch {
		return "unreadable JSON-LD (kept as-is)";
	}
}

/**
 * Parses one rendered sample post into manifest mappings. Throws `TemplateParseError` when the HTML has no
 * recognisable content region (nothing could render into it).
 */
export function parseTemplate(html: string, parseHtml: TParseHtml, idPrefix = "pm"): IParsedTemplate {
	const doc = parseHtml(html);
	const s = analyze(doc);
	if (!s.region || !s.p) throw new TemplateParseError("No content region found. Upload a rendered blog post with its article text (paragraphs and headings).");

	let seq = 0;
	const rows: ITemplateMapping[] = [];
	const add = (selector: string, role: ITemplateMapping["role"], group: ITemplateMapping["group"], detail: string, status: ITemplateMapping["status"] = "mapped", extra: Partial<ITemplateMapping> = {}) => {
		if (rows.some((r) => r.selector === selector && r.role === role)) return;
		rows.push({ id: `${idPrefix}-${++seq}`, selector, role, group, status, detail, ...extra });
	};

	// 1 · content region and repeating structures
	add(selectorOf(s.region), "content-region", "content", "Content region");
	if (s.body && s.body !== s.region) add(selectorOf(s.body), "content-region", "content", "Body wrapper");
	add(selectorOf(s.p), "content-region", "content", "Paragraphs");
	if (s.h1) add(selectorOf(s.h1), "meta", "meta", "Title (h1)");
	if (s.h2) add(selectorOf(s.h2), "heading", "content", `Headings · ${selectorOf(s.h2)}${s.h3 ? `, ${selectorOf(s.h3)}` : ""}`);
	if (s.h3) add(selectorOf(s.h3), "heading", "content", "Sub-headings");
	if (s.ul) add(selectorOf(s.ul), "list", "content", "Lists");
	if (s.ol) add(selectorOf(s.ol), "list", "content", "Ordered lists");
	if (s.quote) add(selectorOf(s.quote), "quote", "content", "Pull quotes");
	if (s.code) add(`${selectorOf(s.code)} > code`, "content-region", "content", "Code blocks");
	if (s.faq) add(selectorOf(s.faq), "content-region", "content", "FAQ pattern");
	if (s.table) add(selectorOf(s.table), "table", "content", "Tables");
	else add("table", "table", "content", "Not in template · posts needing one are held", "absent");

	// 2 · image containers
	const imgOf = (el: Element | null) => (el ? (tagOf(el) === "img" ? el : el.querySelector("img")) : null);
	for (const [el, label] of [
		[s.leadFigure, "Lead image"],
		[s.figure !== s.leadFigure ? s.figure : null, "Image"],
	] as const) {
		if (!el) continue;
		const img = imgOf(el);
		const set = srcsetPattern(img);
		const sel = tagOf(el) === "img" ? selectorOf(el) : `${selectorOf(el)} > img${set.widths.length ? "[srcset]" : ""}`;
		add(sel, "image", "images", `${label}${set.widths.length ? ` · srcset ×${set.widths.length}` : " · no srcset"}${set.sizes ? " · sizes" : ""}`);
		const cap = el.querySelector("figcaption");
		if (cap) add(selectorOf(cap), "image", "images", "Caption");
	}
	if (!s.figure) add("figure", "image", "images", "No image container · posts with images are held", "absent");

	// 3 · metadata bindings
	if (s.title) add("title", "meta", "meta", "Title");
	if (s.description) add('meta[name="description"]', "meta", "meta", "Description");
	if (s.canonical) add('link[rel="canonical"]', "meta", "meta", "Canonical");
	for (const m of s.og) {
		const p = m.getAttribute("property")!;
		add(`meta[property="${p}"]`, "meta", "meta", p);
	}
	for (const m of s.twitter) {
		const n = m.getAttribute("name")!;
		add(`meta[name="${n}"]`, "meta", "meta", n.replace("twitter:", "Twitter "));
	}
	if (s.date) add(selectorOf(s.date), "meta", "meta", "Publish date");
	if (s.author) add(selectorOf(s.author), "meta", "meta", "Author");
	if (s.tags[0]) add(selectorOf(s.tags[0]), "meta", "meta", s.tags.length > 1 ? `Tags ×${s.tags.length}` : "Tags");
	if (s.readTime) add(selectorOf(s.readTime), "meta", "meta", "Read time");

	// 4 · schema blocks
	s.schema.forEach((el, i) => add(`script[type="application/ld+json"]${s.schema.length > 1 ? `:nth-of-type(${i + 1})` : ""}`, "schema", "meta", `Schema · ${schemaShape(el.textContent ?? "")}`));

	// 5 · anything unclassified, for the developer to map once
	for (const el of s.unclassified) {
		const o = optionsFor(el);
		add(selectorOf(el), "unclassified", o.group, o.detail, "needs-you", { options: o.options });
	}

	const stylesheets = Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]')).map((l) => l.getAttribute("href")!);
	const images = Array.from(doc.querySelectorAll("img[src]")).map((i) => i.getAttribute("src")!);
	return {
		mappings: rows,
		sampleHtml: html,
		title: (s.h1?.textContent ?? s.title?.textContent ?? "").trim(),
		assets: { stylesheets, images },
		counts: {
			mapped: rows.filter((r) => r.status === "mapped").length,
			needsYou: rows.filter((r) => r.status === "needs-you").length,
			absent: rows.filter((r) => r.status === "absent").length,
		},
	};
}
