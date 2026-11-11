// Post renderer (pure). PRD Module 4 "Rendering" + fidelity rule: the post's structured blocks are mapped into
// the sample post's OWN elements (cloned tag + classes + wrappers + srcset pattern). The renderer never invents
// markup: a block that needs a structure the template lacks is omitted and reported in `held`.
import type { IImageSlot, IPost, IPostBlock, ISite, ITemplateMapping } from "@/lib/types";
import { analyze, srcsetPattern, tagOf, type IStructure, type TParseHtml } from "./structure";
import { placeholderSvg } from "./placeholder";

export interface IRenderHeld {
	reason: string;
	blockId?: string;
}

export interface IRenderInput {
	/** The confirmed manifest's sample post HTML (the template). */
	manifestHtml: string;
	post: IPost;
	slots: IImageSlot[];
	site: Pick<ISite, "domain" | "name" | "repo">;
	pillarName?: string;
	/** preview = what the reader sees now (candidate images or labelled placeholders, `<base>` for the site's CSS);
	 * publish = what the MR carries (asset-dir image paths). */
	mode: "preview" | "publish";
	/** Injected DOM parser (DOMParser in the browser, linkedom in tests). */
	parseHtml: TParseHtml;
	/** Hand mappings from the manifest ("CTA block", "Author bio", "Callout", "Ignore"). */
	mappings?: ITemplateMapping[];
	/** Preview only: base URL the template's relative CSS/images resolve against. */
	baseHref?: string;
	/** Publish date (ISO). Defaults to keeping the sample's date. */
	publishedAt?: string;
	/** Author display name. Defaults to the sample's author (the site's default byline). */
	author?: string;
	/** Publish: whether per-width variant files exist (default true). False → one src, no srcset (never reference files the MR doesn't carry). */
	variants?: boolean;
}

export interface IRenderResult {
	html: string;
	held: IRenderHeld[];
	warnings: string[];
	/** Would-be public URL (canonical). */
	url: string;
	/** Blocks placed / images placed / images still placeholders. */
	stats: { blocks: number; images: number; placeholders: number };
}

const WORDS_PER_MIN = 250;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ARTICLE_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "MedicalWebPage", "TechArticle", "Report"]);

type TJson = Record<string, unknown>;

// ---- helpers ------------------------------------------------------------------

function clone<T extends Element>(el: T): T {
	return el.cloneNode(true) as T;
}

/** Sets the text of a cloned prototype, keeping its wrappers: writes into the deepest first element chain. */
function setText(el: Element, text: string) {
	let target: Element = el;
	while (target.children.length === 1 && !["img", "br"].includes(tagOf(target.children[0]!))) target = target.children[0]!;
	if (target.children.length > 1) {
		// e.g. <blockquote><p>…</p><cite>…</cite></blockquote>: fill the first text-bearing child, drop the rest.
		const first = Array.from(target.children).find((c) => (c.textContent ?? "").trim()) ?? target.children[0]!;
		for (const c of Array.from(target.children)) if (c !== first) c.remove();
		setText(first, text);
		return;
	}
	target.textContent = text;
}

function fillList(proto: Element, items: string[]): Element {
	const list = clone(proto);
	const li = list.querySelector("li");
	const indent = indentOf(list);
	clearChildren(list);
	appendIndented(
		list,
		items.map((item) => {
			const node = li ? clone(li) : list.ownerDocument.createElement("li");
			setText(node, item);
			return node;
		}),
		indent,
	);
	return list;
}

const trimTo = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, s.lastIndexOf(" ", n - 1) > n * 0.6 ? s.lastIndexOf(" ", n - 1) : n - 1).trimEnd()}…`);

function formatLike(sample: string, iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return sample;
	const day = d.getUTCDate();
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	const t = sample.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso.slice(0, 10);
	if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(t)) return `${(t.split(" ")[0]!.length > 3 ? MONTHS_LONG : MONTHS)[m]} ${day}, ${y}`;
	if (/^\d{1,2} [A-Z][a-z]+ \d{4}$/.test(t)) return `${day} ${(t.split(" ")[1]!.length > 3 ? MONTHS_LONG : MONTHS)[m]} ${y}`;
	if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return `${String(day).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`;
	return `${day} ${MONTHS[m]} ${y}`;
}

/** Publish URL on the site: sample canonical with host → site domain and last path segment → slug. */
export function postUrlFromTemplate(canonical: string | null | undefined, domain: string, slug: string): string {
	try {
		if (canonical) {
			const u = new URL(canonical, `https://${domain}`);
			const segs = u.pathname.split("/").filter(Boolean);
			const trailing = u.pathname.endsWith("/");
			if (segs.length) segs[segs.length - 1] = slug;
			else segs.push("blog", slug);
			return `https://${domain}/${segs.join("/")}${trailing ? "/" : ""}`;
		}
	} catch {
		/* fall through */
	}
	return `https://${domain}/blog/${slug}`;
}

const publicAssetDir = (site: IRenderInput["site"]) => {
	const dir = site.repo?.assetDir?.replace(/^\/+|\/+$/g, "") ?? "images/blog";
	return `/${dir.replace(/^public\//, "")}`;
};

/** Whitespace before the first child element ("\n\t\t\t"), so inserted nodes keep the sample's formatting. */
function indentOf(el: Element): string | null {
	const t = Array.from(el.childNodes).find((n) => n.nodeType === 3 && /\n/.test(n.textContent ?? ""));
	const m = t ? /\n([ \t]*)$/.exec(t.textContent ?? "") : null;
	return m ? m[1]! : null;
}

function clearChildren(el: Element) {
	for (const n of Array.from(el.childNodes)) n.remove();
}

function appendIndented(parent: Element, nodes: Element[], indent: string | null) {
	const doc = parent.ownerDocument;
	for (const n of nodes) {
		if (indent !== null) parent.appendChild(doc.createTextNode(`\n${indent}`));
		parent.appendChild(n);
	}
	if (indent !== null) parent.appendChild(doc.createTextNode(`\n${indent.replace(/(\t| {1,4})$/, "")}`));
}

function faqPairs(text: string): { q: string; a: string }[] {
	const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
	const out: { q: string; a: string }[] = [];
	for (let i = 0; i + 1 < lines.length; i += 2) out.push({ q: lines[i]!, a: lines[i + 1]! });
	return out;
}

/** Removes scripts (except JSON-LD), frames, <base>, meta refresh, inline handlers and javascript: URLs. */
export function stripUnsafe(doc: Document) {
	for (const s of Array.from(doc.querySelectorAll("script"))) if ((s.getAttribute("type") ?? "").toLowerCase() !== "application/ld+json") s.remove();
	for (const s of Array.from(doc.querySelectorAll("noscript, iframe, object, embed, base, meta[http-equiv]"))) s.remove();
	for (const el of Array.from(doc.querySelectorAll("*"))) {
		for (const a of Array.from(el.attributes)) {
			const n = a.name.toLowerCase();
			if (n.startsWith("on") || ((n === "href" || n === "src" || n === "action" || n === "formaction") && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
		}
	}
}

// ---- render -------------------------------------------------------------------

export function renderPost(input: IRenderInput): IRenderResult {
	const { post, slots, site, mode, parseHtml } = input;
	const doc = parseHtml(input.manifestHtml);
	const held: IRenderHeld[] = [];
	const warnings: string[] = [];
	const stats = { blocks: 0, images: 0, placeholders: 0 };
	stripUnsafe(doc);
	const s: IStructure = analyze(doc);
	const url = postUrlFromTemplate(s.canonical?.getAttribute("href"), site.domain, post.slug);
	const title = post.seoTitle || post.title;
	const sampleTitle = (s.h1?.textContent ?? "").trim();
	const labelOf = (el: Element) =>
		input.mappings?.find((m) => {
			if (m.status === "needs-you" || !m.label) return false;
			try {
				return el.matches(safeSel(m.selector));
			} catch {
				return false;
			}
		})?.label;

	if (!s.region || !s.body) {
		held.push({ reason: "Template has no content region" });
		return { html: serialize(doc), held, warnings, url, stats };
	}

	// Structures the post requires beyond its blocks (e.g. a comparison table).
	for (const r of post.requires ?? []) {
		const has = { table: s.table, list: s.ul ?? s.ol, quote: s.quote, image: s.figure, schema: s.schema[0] ?? null }[r];
		if (!has) held.push({ reason: `Template has no ${r === "schema" ? "schema block" : r}` });
	}

	// ---- images
	const pattern = srcsetPattern(s.figure ? (tagOf(s.figure) === "img" ? s.figure : s.figure.querySelector("img")) : null);
	const imageFor = (slot: IImageSlot) => {
		const chosen = slot.candidates.find((c) => c.selected);
		const base = slot.filename.replace(/\.[a-z0-9]+$/i, "");
		const dir = publicAssetDir(site);
		const publishSrc = (w?: number) => `${dir}/${base}${w ? `-${w}` : ""}.${slot.format}`;
		if (mode === "publish" && input.variants === false) {
			return { src: publishSrc(), srcset: null, placeholder: !chosen, absolute: `https://${site.domain}${publishSrc()}` };
		}
		if (mode === "publish") {
			const top = pattern.widths.length ? Math.max(...pattern.widths.filter((w) => pattern.descriptor === "w")) : 0;
			return {
				src: publishSrc(pattern.descriptor === "w" && top > 0 ? top : undefined),
				srcset: pattern.widths.length ? pattern.widths.map((w) => `${publishSrc(pattern.descriptor === "w" ? w : undefined)} ${w}${pattern.descriptor}`).join(", ") : null,
				placeholder: !chosen,
				absolute: `https://${site.domain}${publishSrc(pattern.descriptor === "w" && top > 0 ? top : undefined)}`,
			};
		}
		const src = chosen?.url ?? placeholderSvg(slot.name, slot.width, slot.height, chosen?.label);
		return {
			src,
			srcset: pattern.widths.length ? pattern.widths.map((w) => `${src} ${w}${pattern.descriptor}`).join(", ") : null,
			placeholder: !chosen?.url,
			absolute: chosen?.url && /^https?:/.test(chosen.url) ? chosen.url : `https://${site.domain}${publishSrc(pattern.descriptor === "w" && pattern.widths.length ? Math.max(...pattern.widths) : undefined)}`,
		};
	};
	const fillImage = (container: Element, slot: IImageSlot) => {
		const out = clone(container);
		const img = tagOf(out) === "img" ? out : out.querySelector("img");
		if (!img) return null;
		const im = imageFor(slot);
		img.setAttribute("src", im.src);
		if (im.srcset) img.setAttribute("srcset", im.srcset);
		else img.removeAttribute("srcset");
		img.setAttribute("alt", slot.alt);
		if (img.hasAttribute("width")) img.setAttribute("width", String(slot.width));
		if (img.hasAttribute("height")) img.setAttribute("height", String(slot.height));
		// Sample caption text belongs to the sample; slots carry no caption, so the caption element is dropped.
		// <picture><source> in the sample points at sample files; keep the element only for the img.
		for (const el of Array.from(out.querySelectorAll("figcaption, source"))) {
			const prev = el.previousSibling;
			if (prev && prev.nodeType === 3 && !(prev.textContent ?? "").trim()) prev.remove();
			el.remove();
		}
		stats.images++;
		if (im.placeholder) stats.placeholders++;
		return { el: out, absolute: im.absolute };
	};

	const slotOf = (id: string) => slots.find((x) => x.id === id);
	const imageBlocks = post.blocks.filter((b) => b.kind === "image");
	const heroBlock = imageBlocks.find((b) => slotOf(b.text)?.type === "hero") ?? null;
	let ogImage: string | null = null;

	// Lead media: the template's hero container outside the body takes the hero slot, or is removed.
	if (s.leadFigure) {
		const heroSlot = heroBlock ? slotOf(heroBlock.text) : undefined;
		const filled = heroSlot ? fillImage(s.leadFigure, heroSlot) : null;
		if (filled) {
			s.leadFigure.replaceWith(filled.el);
			ogImage = filled.absolute;
		} else s.leadFigure.remove();
	}

	// ---- body blocks
	const kept: { el: Element; at: number }[] = [];
	const bodyChildren = Array.from(s.body.children);
	let calloutProto: Element | null = null;
	// Title + byline living inside the body wrapper (h1, the kicker with date/tags/author) are template chrome:
	// they stay where the sample has them and get filled like any other metadata binding.
	const metaEls = [s.h1, s.date, s.author, s.readTime, ...s.tags].filter(Boolean) as Element[];
	const firstContent = bodyChildren.findIndex((c) => c !== s.h1 && !metaEls.some((m) => c.contains(m)) && ["p", "h2", "h3", "ul", "ol", "figure", "blockquote"].includes(tagOf(c)));
	bodyChildren.forEach((c, i) => {
		if (metaEls.some((m) => c === m || c.contains(m))) {
			kept.push({ el: c, at: firstContent === -1 || i < firstContent ? 0 : i / Math.max(1, bodyChildren.length - 1) });
			return;
		}
		const label = labelOf(c);
		if (s.unclassified.includes(c)) {
			if (label === "Ignore") return;
			if (label === "Callout") {
				calloutProto ??= c;
				return;
			}
			if (!label) warnings.push(`Unmapped ${c.tagName.toLowerCase()} kept as in the sample`);
			kept.push({ el: c, at: i / Math.max(1, bodyChildren.length - 1) });
		}
	});
	const bodyIndent = indentOf(s.body);
	clearChildren(s.body);
	for (const c of s.unclassified) if (!bodyChildren.includes(c) && labelOf(c) === "Ignore") c.remove();

	const out: { el: Element; block: IPostBlock }[] = [];
	const hold = (b: IPostBlock, reason: string) => held.push({ reason, blockId: b.id });
	for (const b of post.blocks) {
		switch (b.kind) {
			case "h2":
			case "h3": {
				const p = b.kind === "h2" ? s.h2 : s.h3;
				if (!p) {
					hold(b, `Template has no ${b.kind === "h2" ? "section heading (h2)" : "sub-heading (h3)"}`);
					break;
				}
				const el = clone(p);
				setText(el, b.text);
				out.push({ el, block: b });
				break;
			}
			case "p": {
				const el = clone(s.p!);
				setText(el, b.text);
				out.push({ el, block: b });
				break;
			}
			case "disclaimer": {
				const el = clone(calloutProto ?? s.p!);
				setText(el, b.text);
				out.push({ el, block: b });
				break;
			}
			case "ul": {
				if (!s.ul) {
					hold(b, "Template has no bulleted list");
					break;
				}
				out.push({ el: fillList(s.ul, b.text.split("\n").map((x) => x.trim()).filter(Boolean)), block: b });
				break;
			}
			case "quote": {
				if (!s.quote) {
					hold(b, "Template has no blockquote");
					break;
				}
				const el = clone(s.quote);
				setText(el, b.text);
				out.push({ el, block: b });
				break;
			}
			case "image": {
				if (b === heroBlock && s.leadFigure) break; // placed in the lead container above
				const slot = slotOf(b.text);
				if (!slot) {
					warnings.push(`Image block ${b.id} points at a missing slot`);
					break;
				}
				if (!s.figure) {
					hold(b, "Template has no image container");
					break;
				}
				const filled = fillImage(s.figure, slot);
				if (!filled) {
					hold(b, "Template image container has no img");
					break;
				}
				ogImage ??= filled.absolute;
				out.push({ el: filled.el, block: b });
				break;
			}
			case "faq": {
				const pairs = faqPairs(b.text);
				if (s.faq && tagOf(s.faq) === "details") {
					for (const { q, a } of pairs) {
						const d = clone(s.faq);
						const sum = d.querySelector("summary");
						const ans = Array.from(d.children).find((c) => tagOf(c) !== "summary");
						if (!sum) break;
						setText(sum, q);
						for (const c of Array.from(d.children)) if (c !== sum && c !== ans) c.remove();
						if (ans) setText(ans, a);
						out.push({ el: d, block: b });
					}
				} else if (s.faq && tagOf(s.faq) === "dl") {
					const dl = clone(s.faq);
					const dt = dl.querySelector("dt");
					const dd = dl.querySelector("dd");
					if (!dt || !dd) {
						hold(b, "Template FAQ list has no dt/dd pattern");
						break;
					}
					for (const c of Array.from(dl.children)) c.remove();
					for (const { q, a } of pairs) {
						const t = clone(dt);
						setText(t, q);
						const d = clone(dd);
						setText(d, a);
						dl.append(t, d);
					}
					out.push({ el: dl, block: b });
				} else if (s.h3 && s.p) {
					// The template's own sub-heading + paragraph carry question + answer.
					for (const { q, a } of pairs) {
						const t = clone(s.h3);
						setText(t, q);
						const d = clone(s.p);
						setText(d, a);
						out.push({ el: t, block: b }, { el: d, block: b });
					}
				} else hold(b, "Template has no FAQ pattern");
				break;
			}
		}
	}
	stats.blocks = new Set(out.map((o) => o.block.id)).size;

	// Re-insert kept partials (CTA block, …) at their relative position: on a block boundary (never inside a
	// multi-node FAQ) and never straight after a heading.
	const nodes: { el: Element; id: string | null }[] = out.map((o) => ({ el: o.el, id: o.block.id }));
	for (const k of [...kept].reverse()) {
		let at = Math.round(k.at * nodes.length);
		const bad = (i: number) => i > 0 && i < nodes.length && ((nodes[i - 1]!.id !== null && nodes[i - 1]!.id === nodes[i]!.id) || /^h[1-6]$/.test(tagOf(nodes[i - 1]!.el)));
		while (bad(at)) at--;
		nodes.splice(at, 0, { el: k.el, id: null });
	}
	appendIndented(
		s.body,
		nodes.map((n) => n.el),
		bodyIndent,
	);

	// ---- metadata bindings
	const intro = post.blocks.find((b) => b.kind === "p")?.text ?? "";
	const description = trimTo(intro, 155);
	if (s.h1) setText(s.h1, title);
	if (s.title) {
		const t = s.title.textContent ?? "";
		const sep = /\s[·|–—-]\s(?!.*\s[·|–—-]\s)/.exec(t);
		// "<post title> · Site" keeps the site suffix; otherwise swap the sample's title wherever it appears.
		s.title.textContent = sep ? `${title}${t.slice(sep.index)}` : sampleTitle && t.includes(sampleTitle) ? t.replace(sampleTitle, title) : title;
	}
	if (s.description) s.description.setAttribute("content", description);
	if (s.canonical) s.canonical.setAttribute("href", url);
	for (const m of [...s.og, ...s.twitter]) {
		const key = (m.getAttribute("property") ?? m.getAttribute("name") ?? "").toLowerCase();
		if (/:title$/.test(key)) m.setAttribute("content", title);
		else if (/:description$/.test(key)) m.setAttribute("content", description);
		else if (key === "og:url") m.setAttribute("content", url);
		else if (/:image$/.test(key)) {
			if (ogImage) m.setAttribute("content", ogImage);
			else m.remove();
		}
	}
	if (s.date && input.publishedAt) {
		s.date.setAttribute("datetime", input.publishedAt.slice(0, 10));
		s.date.textContent = formatLike(s.date.textContent ?? "", input.publishedAt);
	}
	if (s.author && input.author) setText(s.author, input.author);
	if (input.pillarName && s.tags[0]) {
		setText(s.tags[0], input.pillarName);
		const href = s.tags[0].getAttribute("href");
		if (href) s.tags[0].setAttribute("href", href.replace(/[^/]+\/?$/, (seg) => `${input.pillarName!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}${seg.endsWith("/") ? "/" : ""}`));
		for (const extra of s.tags.slice(1)) extra.remove();
	}
	if (s.readTime) s.readTime.textContent = (s.readTime.textContent ?? "").replace(/\d+/, String(Math.max(1, Math.round(post.words / WORDS_PER_MIN))));
	// Sample title repeated in page chrome (breadcrumb current item, etc.).
	if (sampleTitle) {
		for (const el of Array.from(doc.body?.querySelectorAll("*") ?? [])) {
			if (el === s.h1 || el.children.length > 0 || s.region.contains(el)) continue;
			if ((el.textContent ?? "").trim() === sampleTitle) el.textContent = title;
		}
	}
	if (!s.description) warnings.push("Template has no meta description tag");

	// ---- JSON-LD in the shape the sample already uses
	const faqs = post.blocks.filter((b) => b.kind === "faq").flatMap((b) => faqPairs(b.text));
	const faqEntity = faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }));
	let faqEmitted = false;
	const updateNode = (n: TJson) => {
		const type = n["@type"];
		const types = Array.isArray(type) ? type.map(String) : [String(type ?? "")];
		if (types.some((t) => ARTICLE_TYPES.has(t))) {
			n.headline = trimTo(title, 110);
			if ("name" in n) n.name = title;
			if (description) n.description = description;
			if ("url" in n) n.url = url;
			if ("mainEntityOfPage" in n) n.mainEntityOfPage = typeof n.mainEntityOfPage === "object" && n.mainEntityOfPage ? { ...(n.mainEntityOfPage as TJson), "@id": url } : url;
			if ("image" in n) {
				if (!ogImage) delete n.image;
				else if (Array.isArray(n.image)) n.image = [ogImage];
				else if (typeof n.image === "object" && n.image) n.image = { ...(n.image as TJson), url: ogImage };
				else n.image = ogImage;
			}
			if (input.publishedAt) {
				if ("datePublished" in n) n.datePublished = input.publishedAt.slice(0, 10);
				if ("dateModified" in n) n.dateModified = input.publishedAt.slice(0, 10);
			}
			if (input.author && n.author && typeof n.author === "object" && !Array.isArray(n.author)) n.author = { ...(n.author as TJson), name: input.author };
			if ("keywords" in n && input.pillarName) n.keywords = input.pillarName;
		}
		if (types.includes("FAQPage")) {
			if (faqEntity.length) {
				n.mainEntity = faqEntity;
				faqEmitted = true;
			} else return false;
		}
		return true;
	};
	for (const script of s.schema) {
		let json: unknown;
		try {
			json = JSON.parse(script.textContent ?? "");
		} catch {
			warnings.push("A JSON-LD block in the template is not valid JSON; kept unchanged");
			continue;
		}
		if (Array.isArray(json)) json = (json as TJson[]).filter((n) => updateNode(n));
		else if (json && typeof json === "object" && Array.isArray((json as TJson)["@graph"])) {
			const g = json as TJson;
			g["@graph"] = (g["@graph"] as TJson[]).filter((n) => updateNode(n));
			if (faqEntity.length && !faqEmitted) {
				(g["@graph"] as TJson[]).push({ "@type": "FAQPage", mainEntity: faqEntity });
				faqEmitted = true;
			}
		} else if (json && typeof json === "object") {
			if (!updateNode(json as TJson)) {
				script.remove();
				continue;
			}
		}
		script.textContent = jsonText(json, script.textContent ?? "");
	}
	if (faqEntity.length && !faqEmitted) {
		const first = s.schema.find((x) => x.isConnected);
		if (first) {
			let ctx: unknown = "https://schema.org";
			try {
				ctx = (JSON.parse(first.textContent ?? "{}") as TJson)["@context"] ?? ctx;
			} catch {
				/* default context */
			}
			const faqScript = clone(first);
			faqScript.textContent = jsonText({ "@context": ctx, "@type": "FAQPage", mainEntity: faqEntity }, first.textContent ?? "");
			first.after(faqScript);
		} else warnings.push("FAQPage schema not emitted · the template has no JSON-LD block to follow");
	}

	if (mode === "preview" && input.baseHref && doc.head) {
		const base = doc.createElement("base");
		base.setAttribute("href", input.baseHref);
		doc.head.insertBefore(base, doc.head.firstChild);
	}
	if (stats.placeholders) warnings.push(`${stats.placeholders} image${stats.placeholders === 1 ? "" : "s"} without a final image yet · shown as labelled placeholders`);
	return { html: serialize(doc), held, warnings, url, stats };
}

/** JSON in the sample's own formatting: same base indent, same indent unit. */
function jsonText(value: unknown, original: string): string {
	const base = /^\s*?\n?([ \t]*)[[{]/.exec(original)?.[1] ?? "";
	const key = /\n([ \t]*)"/.exec(original)?.[1];
	const unit = key !== undefined && key.length > base.length ? key.slice(base.length) : "\t";
	const body = JSON.stringify(value, null, unit).replace(/</g, "\\u003c");
	const trail = /\n([ \t]*)$/.exec(original)?.[1] ?? "";
	return `\n${body
		.split("\n")
		.map((l) => base + l)
		.join("\n")}\n${trail}`;
}

function safeSel(sel: string): string {
	return sel.replace(/:nth-of-type\(\d+\)/g, "");
}

function serialize(doc: Document): string {
	return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}
