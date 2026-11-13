// Inline text in post blocks (every site). Blocks are plain text with one inline format: links as [anchor](url).
// The writer is told to use it, toDraft normalises anything else it writes, and the renderer turns [anchor](url) into
// real <a> elements. Raw HTML in block text is never shown: a model wrote <a href="/services">…</a> into a live Baynor
// post (13 Nov 2026) and the page printed the tags as text.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) => s.replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_m, e: string) => ENTITIES[e] ?? _m);

/**
 * Block text → the canonical form: <a href="x">t</a> becomes [t](x); bold/italic/span tags and any other tag are
 * dropped (their text kept); markdown emphasis markers are removed. Idempotent.
 */
export function normalizeInline(text: string): string {
	let s = text.replace(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, _q, href: string, inner: string) => {
		const label = inner.replace(/<[^>]+>/g, "").trim();
		return label ? `[${label}](${href.trim()})` : "";
	});
	s = s.replace(/<br\s*\/?>/gi, " ").replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, "");
	s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1");
	return decode(s).replace(/[ \t]{2,}/g, " ");
}

/** A link the page may carry: site-relative ("/services", not "//x") or http(s). Anything else stays text. */
export function safeHref(href: string): string | null {
	const h = href.trim();
	if (/^\/(?!\/)/.test(h)) return h;
	if (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(h)) return h;
	return null;
}

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

/** Text with [anchor](url) links → DOM nodes under `el` (replacing its content). External links get rel=noopener. */
export function fillInline(el: Element, text: string, siteHost?: string) {
	const doc = el.ownerDocument;
	while (el.firstChild) el.removeChild(el.firstChild);
	const s = normalizeInline(text);
	let at = 0;
	for (const m of s.matchAll(LINK)) {
		const i = m.index ?? 0;
		if (i > at) el.appendChild(doc.createTextNode(s.slice(at, i)));
		const href = safeHref(m[2]!);
		if (href) {
			const a = doc.createElement("a");
			a.setAttribute("href", href);
			const host = siteHost?.replace(/^www\./, "").toLowerCase();
			const external = /^https?:\/\//i.test(href) && !(host && new URL(href).hostname.replace(/^www\./, "").toLowerCase() === host);
			if (external) a.setAttribute("rel", "noopener noreferrer");
			a.textContent = m[1]!;
			el.appendChild(a);
		} else el.appendChild(doc.createTextNode(m[1]!));
		at = i + m[0].length;
	}
	if (at < s.length) el.appendChild(doc.createTextNode(s.slice(at)));
}

/** Plain text of block text (for word counts, meta descriptions, alt text): links reduced to their anchor. */
export const inlinePlain = (text: string) => normalizeInline(text).replace(LINK, "$1");
