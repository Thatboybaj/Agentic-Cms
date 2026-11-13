// Template structure analysis (pure). Works on any DOM `Document` — the browser's DOMParser or linkedom in tests.
// Both the parser (manifest mappings) and the renderer derive everything from the sample post's own markup,
// so the structure map is a function of `sampleHtml`, never a second copy of it.

/** Injected HTML parser: `(html) => new DOMParser().parseFromString(html, "text/html")` in the browser. */
export type TParseHtml = (html: string) => Document;

export const BLOCK_TAGS = new Set(["p", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "blockquote", "pre", "table", "figure", "hr", "img", "details", "dl"]);

export interface IStructure {
	region: Element | null;
	body: Element | null;
	h1: Element | null;
	metaHeader: Element | null;
	h2: Element | null;
	h3: Element | null;
	p: Element | null;
	ul: Element | null;
	ol: Element | null;
	quote: Element | null;
	code: Element | null;
	table: Element | null;
	/** Figure (or bare img) used for images inside the body. */
	figure: Element | null;
	/** Lead media container outside the body (hero), when the template has one. */
	leadFigure: Element | null;
	faq: Element | null;
	title: Element | null;
	description: Element | null;
	canonical: Element | null;
	og: Element[];
	twitter: Element[];
	date: Element | null;
	author: Element | null;
	tags: Element[];
	/** A meta-row value labelled as the category (dt "Category"/"التصنيف"), when there is no tag link. */
	category: Element | null;
	readTime: Element | null;
	schema: Element[];
	/** Direct children of the region/body the parser can't classify (developer maps them once). */
	unclassified: Element[];
}

export const tagOf = (el: Element) => el.tagName.toLowerCase();
export const classesOf = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** "figure.post-media.post-media--wide" — tag plus every class, the way the manifest shows selectors. */
export function selectorOf(el: Element): string {
	const cls = classesOf(el);
	return `${tagOf(el)}${cls.map((c) => `.${c}`).join("")}`;
}

const all = (root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel));
const inside = (el: Element, anc: Element | null) => !!anc && (anc === el || anc.contains(el));
const pCount = (el: Element) => el.querySelectorAll("p").length;

function depth(el: Element): number {
	let d = 0;
	for (let n: Element | null = el; n; n = n.parentElement) d++;
	return d;
}

function findRegion(doc: Document): Element | null {
	const cands = all(doc, "article, main, [role=main], [class*=post], [class*=content], [class*=entry], [class*=article]").filter(
		(el) => !["html", "body", "head", "meta", "link", "script", "a", "span", "time", "img"].includes(tagOf(el)),
	);
	const max = Math.max(0, ...cands.map(pCount));
	if (max >= 2) {
		const articles = cands.filter((el) => tagOf(el) === "article" && pCount(el) >= max * 0.6).sort((a, b) => pCount(b) - pCount(a));
		if (articles[0]) return articles[0];
		const strong = cands.filter((el) => pCount(el) >= max * 0.75).sort((a, b) => depth(b) - depth(a));
		if (strong[0]) return strong[0];
	}
	// No semantic wrapper: the element with the most direct block children is the region.
	let best: Element | null = null;
	let bestN = 1;
	for (const el of all(doc.body ?? doc, "*")) {
		const n = Array.from(el.children).filter((c) => BLOCK_TAGS.has(tagOf(c))).length;
		if (n > bestN) {
			best = el;
			bestN = n;
		}
	}
	return best;
}

function findBody(region: Element): Element {
	let best = region;
	let bestN = Array.from(region.children).filter((c) => BLOCK_TAGS.has(tagOf(c)) && tagOf(c) !== "figure").length;
	for (const el of all(region, "*")) {
		const n = Array.from(el.children).filter((c) => BLOCK_TAGS.has(tagOf(c)) && tagOf(c) !== "figure").length;
		if (n > bestN) {
			best = el;
			bestN = n;
		}
	}
	return best;
}

/** First match that is a direct child of `body`, else anywhere in `region` (outside nav/header chrome). */
function proto(sel: string, body: Element | null, region: Element | null, pick?: (els: Element[]) => Element | undefined): Element | null {
	if (!region) return null;
	const direct = body ? Array.from(body.children).filter((c) => c.matches(sel)) : [];
	const any = all(region, sel).filter((el) => !el.closest("nav"));
	const choose = pick ?? ((els: Element[]) => els[0]);
	return choose(direct) ?? choose(any) ?? null;
}

const READ_TIME = /^\s*\d+\s*(min|mins|minute|minutes)\s+read\s*$|^\s*[\d٠-٩]+\s*(دقيقة|دقائق|دقيقتان|د)\s*(قراءة|للقراءة)?\s*$/i;

// Meta rows written as <dt>label</dt><dd>value</dd> (any language): the value is found by its label.
const LABELS = {
	author: /^(author|by|written by|writer|الكاتب|الكاتبة|بقلم|كتبه|المؤلف)$/i,
	category: /^(category|topic|section|التصنيف|الفئة|القسم|الموضوع)$/i,
	readTime: /^(read|reading|reading time|read time|القراءة|مدة القراءة|وقت القراءة)$/i,
};
function labelled(scope: ParentNode, re: RegExp): Element | null {
	for (const dt of all(scope, "dt")) {
		if (!re.test((dt.textContent ?? "").replace(/[:：]\s*$/, "").trim())) continue;
		let n = dt.nextElementSibling;
		while (n && tagOf(n) !== "dd") n = n.nextElementSibling;
		if (n) return n;
	}
	return null;
}

export function analyze(doc: Document): IStructure {
	const region = findRegion(doc);
	const body = region ? findBody(region) : null;
	const h1 = (region && region.querySelector("h1")) || doc.querySelector("h1");
	const metaHeader = h1 ? (h1.closest("header") && inside(h1.closest("header")!, region) ? h1.closest("header") : h1.parentElement !== body ? h1.parentElement : null) : null;
	const plain = (els: Element[]) => els.find((e) => classesOf(e).length === 0) ?? els[0];
	const figures = region ? all(region, "figure").filter((f) => f.querySelector("img")) : [];
	const bodyFigure = figures.find((f) => inside(f, body)) ?? null;
	const leadFigure = figures.find((f) => !inside(f, body)) ?? null;
	const bareImg = !bodyFigure && region ? (all(region, "img").find((i) => !i.closest("figure") && inside(i, body)) ?? null) : null;
	// An FAQ pattern is <details>, or a <dl> in the article body. A <dl> outside the body is usually the meta row
	// (author, date, read time), which must never receive FAQ content.
	const faq = region ? (region.querySelector("details") ?? (body ?? region).querySelector("dl:not(header dl)") ?? null) : null;
	const metaScope: ParentNode = metaHeader ?? region ?? doc;

	const authorEl =
		doc.querySelector("[itemprop=author]") ??
		all(metaScope, "[rel=author], [class]").find((el) => el.getAttribute("rel") === "author" || classesOf(el).some((c) => /author$/i.test(c) && !/card|bio|box/i.test(c))) ??
		labelled(metaScope, LABELS.author) ??
		null;
	const tagLinks = region ? all(region, "a[rel=tag], a[class*=tag], a[class*=category]") : [];
	// A tag list without per-link classes: <div class="tags"><a>…</a><a>…</a></div>.
	const tags = tagLinks.length || !region ? tagLinks : all(region, '[class~="tags"] a, [class*="tag-list"] a, [class*="post-tags"] a');
	const readTime = all(metaScope, "span, p, div, small, dd").find((el) => el.children.length === 0 && READ_TIME.test(el.textContent ?? "")) ?? labelled(metaScope, LABELS.readTime);
	const category = labelled(metaScope, LABELS.category);
	const date = (region && region.querySelector("time[datetime]")) || doc.querySelector("time[datetime]");

	const known = new Set<Element>([body, metaHeader, leadFigure].filter(Boolean) as Element[]);
	const unclassified: Element[] = [];
	const scan = (parent: Element | null) => {
		if (!parent) return;
		for (const c of Array.from(parent.children)) {
			const t = tagOf(c);
			if (known.has(c) || BLOCK_TAGS.has(t) || t === "h1" || t === "br" || t === "script" || t === "style" || t === "a" || t === "time") continue;
			if (c.contains(body) || (h1 && c.contains(h1))) continue;
			if (t === "div" && c.children.length > 0 && Array.from(c.children).every((x) => BLOCK_TAGS.has(tagOf(x))) && !classesOf(c).length) continue;
			unclassified.push(c);
		}
	};
	scan(body);
	if (region && region !== body) scan(region);

	return {
		region,
		body,
		h1,
		metaHeader,
		h2: proto("h2", body, region),
		h3: proto("h3", body, region),
		p: proto("p", body, region, plain),
		ul: proto("ul", body, region),
		ol: proto("ol", body, region),
		quote: proto("blockquote", body, region),
		code: proto("pre", body, region),
		table: proto("table", body, region),
		figure: bodyFigure ?? bareImg ?? leadFigure,
		leadFigure,
		faq,
		title: doc.querySelector("head > title") ?? doc.querySelector("title"),
		description: doc.querySelector('meta[name="description"]'),
		canonical: doc.querySelector('link[rel="canonical"]'),
		og: all(doc, 'meta[property^="og:"]'),
		twitter: all(doc, 'meta[name^="twitter:"]'),
		date,
		author: authorEl,
		tags,
		category,
		readTime,
		schema: all(doc, 'script[type="application/ld+json"]'),
		unclassified,
	};
}

// ---- srcset -----------------------------------------------------------------

export interface ISrcsetPattern {
	/** Width descriptors in the template, e.g. [640, 1280, 1920]. Empty when the template uses no srcset. */
	widths: number[];
	descriptor: "w" | "x" | null;
	/** "images/hero-{w}.webp" when the template names files by width. */
	pattern: string | null;
	sizes: string | null;
}

export function srcsetPattern(img: Element | null): ISrcsetPattern {
	const raw = img?.getAttribute("srcset") ?? "";
	const entries = raw
		.split(/,\s+/)
		.map((s) => s.trim().split(/\s+/))
		.filter((p) => p[0]);
	const widths: number[] = [];
	let descriptor: ISrcsetPattern["descriptor"] = null;
	let pattern: string | null = null;
	for (const [url, d] of entries) {
		const m = /^(\d+(?:\.\d+)?)(w|x)$/.exec(d ?? "");
		if (!m) continue;
		descriptor = m[2] as "w" | "x";
		widths.push(Number(m[1]));
		const byName = new RegExp(`^(.*?)${m[1]!.replace(".", "\\.")}(\\D*\\.[a-z0-9]+)$`, "i").exec(url!);
		if (byName && pattern === null) pattern = `${byName[1]}{w}${byName[2]}`;
	}
	return { widths, descriptor, pattern, sizes: img?.getAttribute("sizes") ?? null };
}

/** The template's own markup for a role, text removed — "wrapper markup per role" for the manifest. */
export function skeletonOf(el: Element | null): string {
	if (!el) return "";
	const c = el.cloneNode(true) as Element;
	const walk = (n: Element) => {
		for (const child of Array.from(n.childNodes)) {
			if (child.nodeType === 3) {
				const t = child.textContent ?? "";
				child.textContent = t.trim() ? "…" : t.replace(/\s+/g, " ");
			} else if (child.nodeType === 1) walk(child as Element);
		}
	};
	walk(c);
	return c.outerHTML.replace(/\s{2,}/g, " ");
}

export interface IStructureEntry {
	role: string;
	selector: string;
	markup: string;
}

/** Serializable structure map (selector + wrapper markup per role), derived from the sample HTML. */
export function structureMap(sampleHtml: string, parseHtml: TParseHtml): IStructureEntry[] {
	const s = analyze(parseHtml(sampleHtml));
	const rows: [string, Element | null][] = [
		["content-region", s.region],
		["body", s.body],
		["h2", s.h2],
		["h3", s.h3],
		["p", s.p],
		["ul", s.ul],
		["ol", s.ol],
		["quote", s.quote],
		["code", s.code],
		["table", s.table],
		["image", s.figure],
		["lead-image", s.leadFigure],
		["faq", s.faq],
	];
	return rows.filter(([, el]) => el).map(([role, el]) => ({ role, selector: selectorOf(el!), markup: role === "content-region" || role === "body" ? `<${selectorOf(el!)}>…` : skeletonOf(el) }));
}
