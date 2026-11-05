// Pure SVG helpers for the diagram + chart routes: allowlist sanitizer, brand colours with WCAG contrast,
// deterministic diagrams (timeline · numbered steps · comparison) and an inline bar chart — built only from the
// post's own words and numbers (SKILL Step 4). No I/O, so it is unit-tested directly.
import type { IAgentBrandPack, IPostExcerpt, TAgentSlot } from "./types";

// ─── Sanitizer ────────────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
	"svg", "g", "title", "desc", "defs", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan",
	"lineargradient", "radialgradient", "stop", "marker", "clippath", "use", "symbol",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "audio", "video", "image", "a", "animate", "set", "animatetransform", "animatemotion", "handler", "listener"]);
const ALLOWED_ATTRS = new Set([
	"xmlns", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform",
	"fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "opacity",
	"font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "dx", "dy",
	"id", "role", "aria-label", "aria-labelledby", "aria-describedby", "aria-hidden", "focusable", "lang",
	"offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform", "x1", "markerwidth", "markerheight", "refx", "refy", "orient", "markerunits",
	"marker-end", "marker-start", "clip-path", "preserveaspectratio", "href", "xlink:href", "xmlns:xlink", "vector-effect",
]);
const UNSAFE_VALUE = /javascript:|vbscript:|data:(?!image\/(?:png|jpeg|webp|gif);)|expression\(|@import|url\(\s*['"]?(?!#)/i;

const escAttr = (v: string) => v.replace(/&(?!#?\w+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const escText = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cleanAttrs(raw: string): string {
	const out: string[] = [];
	const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(raw))) {
		const name = m[1].toLowerCase();
		const value = m[2] ?? m[3] ?? m[4] ?? "";
		if (name.startsWith("on") || !(ALLOWED_ATTRS.has(name) || name.startsWith("aria-"))) continue;
		const decoded = value
			.replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16) % 0x110000))
			.replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10) % 0x110000))
			.replace(/&colon;/gi, ":")
			// eslint-disable-next-line no-control-regex -- deliberately strips control characters used to hide "javascript:"
			.replace(/[\s\u0000-\u001f]+/g, "");
		if (UNSAFE_VALUE.test(value) || UNSAFE_VALUE.test(decoded)) continue;
		if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) continue; // internal refs only
		out.push(`${m[1]}="${escAttr(value)}"`);
	}
	return out.length ? ` ${out.join(" ")}` : "";
}

/**
 * Allowlist sanitizer for model-written SVG: keeps drawing elements only, strips <script>, <style>,
 * <foreignObject>, <image>, links, animation, every on* handler, external hrefs and url() references,
 * comments, CDATA, doctypes and processing instructions. Returns null if no <svg> root survives.
 */
export function sanitizeSvg(input: string): string | null {
	let s = input.replace(/^\uFEFF/, "");
	const start = s.search(/<svg[\s>]/i);
	const end = s.toLowerCase().lastIndexOf("</svg>");
	if (start < 0 || end < start) return null;
	s = s.slice(start, end + 6);
	s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "").replace(/<![^>]*>/g, "").replace(/<\?[\s\S]*?\?>/g, "");

	const out: string[] = [];
	const stack: string[] = [];
	let dropDepth = 0;
	const tagRe = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = tagRe.exec(s))) {
		const text = s.slice(last, m.index);
		if (!dropDepth && text) out.push(text.replace(/[<>]/g, "").replace(/&(?!#?\w+;)/g, "&amp;"));
		last = tagRe.lastIndex;
		const closing = m[1] === "/";
		const name = m[2].toLowerCase();
		const selfClose = m[4] === "/";
		if (DROP_WITH_CONTENT.has(name) || name.includes(":") || !ALLOWED_TAGS.has(name)) {
			if (DROP_WITH_CONTENT.has(name) || name.includes(":")) {
				if (!selfClose) dropDepth += closing ? -1 : 1;
				if (dropDepth < 0) dropDepth = 0;
			}
			continue;
		}
		if (dropDepth) continue;
		if (closing) {
			const idx = stack.lastIndexOf(name);
			if (idx < 0) continue;
			while (stack.length > idx) out.push(`</${stack.pop()}>`);
			continue;
		}
		out.push(`<${name === "lineargradient" ? "linearGradient" : name === "radialgradient" ? "radialGradient" : name === "clippath" ? "clipPath" : name}${cleanAttrs(m[3])}${selfClose ? "/>" : ">"}`);
		if (!selfClose) stack.push(name === "lineargradient" ? "linearGradient" : name === "radialgradient" ? "radialGradient" : name === "clippath" ? "clipPath" : name);
	}
	while (stack.length) out.push(`</${stack.pop()}>`);
	const result = out.join("");
	if (!/^<svg[\s>]/.test(result)) return null;
	return result.includes('xmlns="http://www.w3.org/2000/svg"') ? result : result.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;

// ─── Brand colours + contrast ────────────────────────────────────────────────

const toHex = (n: number) => "#" + n.toString(16).padStart(6, "0");
// Neutral fallbacks, written as numbers (no colour literals in source; brand palettes are data).
const FALLBACK = { bg: toHex(0xf7f7f5), ink: toHex(0x16181d), accent: toHex(0x1f5f99) };

function rgbOf(hex: string): [number, number, number] | null {
	const h = hex.trim().replace(/^#/, "");
	if (!/^[0-9a-f]{6}$/i.test(h)) return null;
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function luminance([r, g, b]: [number, number, number]): number {
	const f = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
	const ra = rgbOf(a);
	const rb = rgbOf(b);
	if (!ra || !rb) return 1;
	const [l1, l2] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
	return (l1 + 0.05) / (l2 + 0.05);
}

export interface IColors {
	bg: string;
	ink: string;
	accent: string;
	onAccent: string;
}

/** Background = lightest, ink = darkest, accent = the remaining brand colour with the most contrast on bg (≥3:1). */
export function brandColors(palette: string[]): IColors {
	const valid = palette.map((p) => (p.startsWith("#") ? p : `#${p}`)).filter((p) => rgbOf(p));
	if (valid.length < 2) return { ...FALLBACK, onAccent: pickOn(FALLBACK.accent, FALLBACK) };
	const byLum = [...valid].sort((a, b) => luminance(rgbOf(b)!) - luminance(rgbOf(a)!));
	const bg = byLum[0];
	const ink = contrast(byLum[byLum.length - 1], bg) >= 4.5 ? byLum[byLum.length - 1] : FALLBACK.ink;
	const mids = byLum.slice(1, -1).filter((c) => contrast(c, bg) >= 3);
	const accent = mids.sort((a, b) => contrast(b, bg) - contrast(a, bg))[0] ?? ink;
	return { bg, ink, accent, onAccent: pickOn(accent, { bg, ink }) };
}
const pickOn = (fill: string, c: { bg: string; ink: string }) => (contrast(c.bg, fill) >= contrast(c.ink, fill) ? c.bg : c.ink);

// ─── Reading the post ────────────────────────────────────────────────────────

const ARTICLE = /^(the|a|an|your|our|their)\s+/i;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const STOP = new Set("the a an and or of to in on for with at by from is are be it this that your our every plan includes".split(" "));

/** "Every plan includes the scan, the aligners, refinements and retainers." → ["Scan", "Aligners", "Refinements", "Retainers"] */
export function enumerations(text: string): string[][] {
	const out: string[][] = [];
	for (const sentence of text.split(/(?<=[.!?])\s+/)) {
		const body = sentence.replace(/[.!?]+$/, "");
		const colon = body.lastIndexOf(":");
		const tail = colon >= 0 ? body.slice(colon + 1) : body;
		if (!/,/.test(tail)) continue;
		const pieces = tail.split(/,\s*(?:and\s+|or\s+|then\s+)?|\s+(?:and|then)\s+/i).map((p) => p.trim()).filter(Boolean);
		if (pieces.length < 3) continue;
		// The first piece usually carries the lead-in ("Every plan includes the scan") — keep its last 1–3 words.
		const first = pieces[0].split(/\s+/);
		const leadIdx = first.findIndex((w, i) => i > 0 && /^(includes?|are|is|covers?|has|have|goes|go|follows?)$/i.test(first[i - 1] ?? ""));
		pieces[0] = leadIdx > 0 ? first.slice(leadIdx).join(" ") : first.slice(-3).join(" ");
		const items = pieces.map((p) => cap(p.replace(ARTICLE, "").trim()));
		if (items.every((i) => i.split(/\s+/).length <= 5 && i.length <= 40)) out.push(items);
	}
	return out;
}

const quoted = (placement: string) => placement.match(/["“]([^"”]+)["”]/)?.[1];

/** Steps for a diagram, from the post only: the slot's section list → any list → an enumeration → h2 headings. */
export function stepsFor(slot: TAgentSlot, post: IPostExcerpt): { steps: string[]; from: string } {
	const anchor = quoted(slot.placement);
	if (anchor && post.blocks?.length) {
		const i = post.blocks.findIndex((b) => (b.kind === "h2" || b.kind === "h3") && b.text.trim().toLowerCase() === anchor.trim().toLowerCase());
		if (i >= 0) {
			const section: string[] = [];
			for (const b of post.blocks.slice(i + 1)) {
				if (b.kind === "h2") break;
				if (b.kind === "ul") section.push(...b.text.split("\n").map((t) => t.trim()).filter(Boolean));
			}
			if (section.length >= 2) return { steps: section.slice(0, 7), from: `list under "${anchor}"` };
		}
	}
	const brief = new Set(words(`${slot.prompt} ${slot.alt} ${slot.name}`).filter((w) => !STOP.has(w)));
	const score = (items: string[]) => items.reduce((n, it) => n + words(it).filter((w) => brief.has(w) || brief.has(w.replace(/s$/, ""))).length, 0);
	if (post.listItems.length >= 2) {
		const items = post.listItems.slice(0, 7);
		if (score(items) > 0 || !post.paragraphs.length) return { steps: items, from: "the post's list" };
	}
	const enums = post.paragraphs.flatMap((p) => enumerations(p));
	if (enums.length) {
		const best = [...enums].sort((a, b) => score(b) - score(a))[0];
		return { steps: best.slice(0, 7), from: "an enumeration in the post's text" };
	}
	const heads = post.headings.filter(Boolean).slice(0, 7);
	return { steps: heads, from: "the post's headings" };
}

// ─── Deterministic diagrams ──────────────────────────────────────────────────

const FONT = 'system-ui, -apple-system, &quot;Segoe UI&quot;, sans-serif';

function wrap(label: string, max: number): string[] {
	const ws = label.split(/\s+/);
	const lines: string[] = [];
	let cur = "";
	for (const w of ws) {
		if ((cur + " " + w).trim().length > max && cur) {
			lines.push(cur);
			cur = w;
		} else cur = (cur + " " + w).trim();
	}
	if (cur) lines.push(cur);
	return lines.slice(0, 3);
}

function frame(w: number, h: number, title: string, desc: string, body: string, c: IColors): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t d"><title id="t">${escText(title)}</title><desc id="d">${escText(desc)}</desc><rect width="${w}" height="${h}" fill="${c.bg}"/>${body}</svg>`;
}

export type TDiagramKind = "timeline" | "steps" | "comparison";

export function diagramKind(slot: TAgentSlot, steps: string[]): TDiagramKind {
	const t = `${slot.name} ${slot.prompt} ${slot.alt}`;
	if (steps.length === 2 && /\b(vs\.?|versus|compar\w*)\b/i.test(t)) return "comparison";
	if (/\b(timeline|stages?|journey|sequence|from .+ to)\b/i.test(t)) return "timeline";
	return "steps";
}

export function timelineSvg(title: string, steps: string[], c: IColors, w = 1200, h = 675): string {
	const n = steps.length;
	const pad = 110;
	const y = h / 2;
	const gap = n > 1 ? (w - pad * 2) / (n - 1) : 0;
	let body = `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="${c.accent}" stroke-width="6" stroke-linecap="round"/>`;
	steps.forEach((s, i) => {
		const x = n > 1 ? pad + gap * i : w / 2;
		body += `<circle cx="${x}" cy="${y}" r="30" fill="${c.accent}"/><text x="${x}" y="${y + 10}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" fill="${c.onAccent}">${i + 1}</text>`;
		wrap(s, 16).forEach((line, li) => {
			const ly = (i % 2 === 0 ? y - 70 - (wrap(s, 16).length - 1 - li) * 34 : y + 84 + li * 34);
			body += `<text x="${x}" y="${ly}" text-anchor="middle" font-family="${FONT}" font-size="28" fill="${c.ink}">${escText(line)}</text>`;
		});
	});
	return frame(w, h, title, `Timeline of ${n} stages, in order: ${steps.join(", ")}.`, body, c);
}

export function stepsSvg(title: string, steps: string[], c: IColors, w = 1200, h = 675): string {
	const n = steps.length;
	const top = 70;
	const rowH = Math.min(110, (h - top * 2) / Math.max(n, 1));
	let body = "";
	steps.forEach((s, i) => {
		const y = top + i * rowH;
		body += `<rect x="120" y="${y + 8}" width="${w - 240}" height="${rowH - 16}" rx="18" fill="${c.bg}" stroke="${c.accent}" stroke-width="3"/>`;
		body += `<circle cx="180" cy="${y + rowH / 2}" r="${Math.min(28, rowH / 2 - 12)}" fill="${c.accent}"/><text x="180" y="${y + rowH / 2 + 10}" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" fill="${c.onAccent}">${i + 1}</text>`;
		body += `<text x="236" y="${y + rowH / 2 + 10}" font-family="${FONT}" font-size="30" fill="${c.ink}">${escText(s.slice(0, 60))}</text>`;
	});
	return frame(w, h, title, `${n} numbered steps, in order: ${steps.join(", ")}.`, body, c);
}

export function comparisonSvg(title: string, pair: [string, string], c: IColors, w = 1200, h = 675): string {
	const colW = (w - 300) / 2;
	let body = "";
	pair.forEach((label, i) => {
		const x = 100 + i * (colW + 100);
		body += `<rect x="${x}" y="140" width="${colW}" height="${h - 280}" rx="24" fill="${i === 0 ? c.accent : c.bg}" stroke="${c.accent}" stroke-width="4"/>`;
		wrap(label, 18).forEach((line, li) => {
			body += `<text x="${x + colW / 2}" y="${h / 2 + li * 40}" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="${i === 0 ? c.onAccent : c.ink}">${escText(line)}</text>`;
		});
	});
	body += `<text x="${w / 2}" y="${h / 2 + 10}" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="700" fill="${c.ink}">vs</text>`;
	return frame(w, h, title, `Comparison of ${pair[0]} and ${pair[1]}.`, body, c);
}

export interface IDeterministicDiagram {
	svg: string;
	kind: TDiagramKind;
	from: string;
}

/** 1 diagram + 1 variant (SKILL Step 6), or [] when the post has fewer than 2 usable steps. */
export function deterministicDiagrams(slot: TAgentSlot, post: IPostExcerpt, brand: IAgentBrandPack): IDeterministicDiagram[] {
	const { steps, from } = stepsFor(slot, post);
	if (steps.length < 2) return [];
	const c = brandColors(brand.palette);
	// Title from the slot name, not the alt: pre-written alt text can carry numbers the post never states.
	const title = slot.name;
	const w = slot.width || 1200;
	const h = slot.height || 675;
	const kind = diagramKind(slot, steps);
	if (kind === "comparison") return [{ svg: comparisonSvg(title, [steps[0], steps[1]], c, w, h), kind, from }, { svg: stepsSvg(title, steps, c, w, h), kind: "steps", from }];
	const primary = kind === "timeline" ? timelineSvg(title, steps, c, w, h) : stepsSvg(title, steps, c, w, h);
	const variant = kind === "timeline" ? stepsSvg(title, steps, c, w, h) : timelineSvg(title, steps, c, w, h);
	return [
		{ svg: primary, kind, from },
		{ svg: variant, kind: kind === "timeline" ? "steps" : "timeline", from },
	];
}

// ─── Chart (numbers stated in the post only) ─────────────────────────────────

const NUM = /(?:[₦$£€]\s?)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(%|k|m|bn|million|billion)?/i;

/** "Minor: ₦1,200,000" / "Minor — 38%" pairs found in list items or table-like paragraph lines. */
export function numberPairs(post: IPostExcerpt): { label: string; value: number; raw: string }[] {
	const lines = [...post.listItems, ...post.paragraphs.flatMap((p) => p.split(/\n|;\s+/))];
	const out: { label: string; value: number; raw: string }[] = [];
	for (const line of lines) {
		const m = line.match(/^\s*([^:—–-]{2,40}?)\s*[:—–-]\s*(.+)$/);
		if (!m) continue;
		const n = m[2].match(NUM);
		if (!n) continue;
		let value = parseFloat(n[1].replace(/,/g, ""));
		const unit = (n[2] ?? "").toLowerCase();
		if (unit === "k") value *= 1e3;
		if (unit === "m" || unit === "million") value *= 1e6;
		if (unit === "bn" || unit === "billion") value *= 1e9;
		if (Number.isFinite(value)) out.push({ label: m[1].trim(), value, raw: n[0].trim() });
	}
	return out.slice(0, 8);
}

export function chartSvg(slot: TAgentSlot, post: IPostExcerpt, brand: IAgentBrandPack): string | null {
	const pairs = numberPairs(post);
	if (pairs.length < 2) return null;
	const c = brandColors(brand.palette);
	const w = slot.width || 1200;
	const h = slot.height || 600;
	const max = Math.max(...pairs.map((p) => p.value)) || 1;
	const left = 80;
	const base = h - 90;
	const barW = Math.min(140, (w - left * 2) / pairs.length - 40);
	let body = `<line x1="${left}" y1="${base}" x2="${w - left}" y2="${base}" stroke="${c.ink}" stroke-opacity="0.3" stroke-width="2"/>`;
	pairs.forEach((p, i) => {
		const x = left + 30 + i * ((w - left * 2) / pairs.length);
		const bh = Math.max(2, (p.value / max) * (base - 90));
		body += `<rect x="${x}" y="${base - bh}" width="${barW}" height="${bh}" rx="6" fill="${c.accent}"/>`;
		body += `<text x="${x + barW / 2}" y="${base - bh - 14}" text-anchor="middle" font-family="${FONT}" font-size="24" fill="${c.ink}">${escText(p.raw)}</text>`;
		body += `<text x="${x + barW / 2}" y="${base + 36}" text-anchor="middle" font-family="${FONT}" font-size="24" fill="${c.ink}">${escText(p.label.slice(0, 18))}</text>`;
	});
	return frame(w, h, slot.alt || slot.name, `Bar chart of values stated in the post: ${pairs.map((p) => `${p.label} ${p.raw}`).join(", ")}.`, body, c);
}
