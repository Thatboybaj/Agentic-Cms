// Sample-post fixture + manifest view helpers for /templates and /templates/ingest.
// The store keeps the parsed manifest (mappings) but not the uploaded sample's markup, so the sample
// source shown in the Confirm step lives here as a fixture (reported as a store gap).
import type { ISourceHighlight } from "@/ds";
import type { IPost, ITemplateManifest, ITemplateMapping } from "@/lib/types";

export const SAMPLE_PATH = "blog/sample-post.html";

export const SAMPLE_SOURCE = `<!doctype html>
<html lang="en">
<head>
	<title>Sample post title goes here · Lumen Dental</title>
	<meta name="description" content="One rendered post from the live blog.">
	<link rel="canonical" href="https://lumendental.co/blog/sample-post">
	<meta property="og:title" content="Sample post title goes here">
	<script type="application/ld+json">{ "@type": "Article" }</script>
</head>
<body>
<article class="post">
	<header class="post__meta">
		<span>General</span> · <time>12 Mar 2025</time> · <span>Dr Ada Okafor</span>
		<h1>Sample post title goes here</h1>
	</header>
	<figure class="post-media">
		<img srcset="hero-640.webp 640w, hero-1280.webp 1280w, hero-1920.webp 1920w" alt="">
	</figure>
	<p>Opening paragraph of the sample post.</p>
	<h2 class="post__heading">A section heading</h2>
	<p>Body copy under the heading.</p>
	<div class="cta-inline">
		<p>Book a consultation</p>
		<a class="btn" href="/book">Book now</a>
	</div>
	<aside class="author-card">Dr Ada Okafor · Lead dentist</aside>
	<p>Closing paragraph.</p>
</article>
</body>
</html>`;

const find = (m: ITemplateManifest | null | undefined, selector: string) => m?.mappings.find((x) => x.selector === selector);

/** Label for a hand-mapped region: unclassified until mapped, then its chosen meaning. */
function handLabel(m: ITemplateManifest | null | undefined, selector: string): { label: string; tone: ISourceHighlight["tone"] } {
	const map = find(m, selector);
	if (!map || map.status === "needs-you") return { label: `${selector} · unclassified`, tone: "human" };
	return { label: `${selector} · ${map.label ?? "mapped"}`, tone: "ink" };
}

/** Highlights in the order the manifest lists them (outer region first — SourceCodeFrame draws it dashed). */
export function renderedHighlights(m: ITemplateManifest | null | undefined, sample: ISourceHighlight["sample"]): ISourceHighlight[] {
	const cta = handLabel(m, "div.cta-inline");
	return [
		{ selector: "article.post", label: "content region", tone: "agent" },
		{ selector: "header.post__meta", label: "meta: title · date · author", tone: "ink", sample },
		{ selector: "figure.post-media", label: "figure.post-media · srcset ×3", tone: "ink" },
		{ selector: "h2.post__heading", label: "h2.post__heading", tone: "ink" },
		{ selector: "div.cta-inline", label: cta.label, tone: cta.tone },
	];
}

/** Source view matches lines by needle; `article` alone avoids tinting every line that contains "post". */
export function sourceHighlights(m: ITemplateManifest | null | undefined): ISourceHighlight[] {
	const cta = handLabel(m, "div.cta-inline");
	const bio = handLabel(m, "aside.author-card");
	return [
		{ selector: "article", label: "content region · article.post", tone: "agent" },
		{ selector: "header.post__meta", label: "meta", tone: "ink" },
		{ selector: "figure.post-media", label: "srcset ×3", tone: "ink" },
		{ selector: "h2.post__heading", label: "heading", tone: "ink" },
		{ selector: "div.cta-inline", label: cta.tone === "human" ? "unclassified" : cta.label.split(" · ")[1]!, tone: cta.tone },
		{ selector: "aside.author-card", label: bio.tone === "human" ? "unclassified" : bio.label.split(" · ")[1]!, tone: bio.tone },
	];
}

/** Items that were unclassified at parse time (they carry `options`), mapped or not. */
export const isHand = (x: ITemplateMapping) => !!(x.options?.length || x.label || x.role === "unclassified");
export const handMapped = (m: ITemplateManifest | null | undefined) => (m?.mappings ?? []).filter(isHand);
export const openItems = (m: ITemplateManifest | null | undefined) => (m?.mappings ?? []).filter((x) => x.status === "needs-you");
export const mappedCount = (m: ITemplateManifest | null | undefined) => (m?.mappings ?? []).filter((x) => x.status === "mapped" && !isHand(x)).length;

/** Meaning → manifest role for hand-mapped items. "Ignore" keeps the item's group role so render skips it. */
export function roleForLabel(map: ITemplateMapping, label: string): ITemplateMapping["role"] {
	if (/author/i.test(label)) return "meta";
	if (label === "Ignore") return map.group === "meta" ? "meta" : "content-region";
	return "content-region";
}

const joinSel = (rows: ITemplateMapping[]) => rows.map((r) => r.selector).join(", ");

function metaSummary(rows: ITemplateMapping[]): string {
	const nameOf = (r: ITemplateMapping) => (r.detail.toLowerCase().startsWith("og:") ? "og:*" : r.detail.toLowerCase());
	const names = [...new Set(rows.filter((r) => /^(title|meta|link)/.test(r.selector)).map(nameOf))].slice(0, 4);
	const rest = rows.filter((r) => !names.includes(nameOf(r))).length;
	return `${names.join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

const row = (id: string, label: string, selector: string, role: ITemplateMapping["role"], status: ITemplateMapping["status"] = "mapped", detail = ""): ITemplateMapping => ({
	id,
	label,
	selector,
	role,
	status,
	detail,
});

/** Ref 04 summary rows: Content structures · Images, metadata, schema. Derived from the manifest's mappings. */
export function summaryRows(m: ITemplateManifest): { content: ITemplateMapping[]; media: ITemplateMapping[] } {
	const by = (role: ITemplateMapping["role"]) => m.mappings.filter((x) => x.role === role && x.status === "mapped" && !isHand(x));
	const table = m.mappings.find((x) => x.role === "table");
	const headings = by("heading");
	const lists = [...by("list"), ...by("quote")];
	const images = by("image");
	const meta = by("meta");
	const schema = by("schema");
	const content: ITemplateMapping[] = [];
	if (headings.length) content.push(row("sum-headings", "Headings", joinSel(headings), "heading"));
	if (lists.length) content.push(row("sum-lists", "Lists, quotes", joinSel(lists), "list"));
	content.push(
		table && table.status !== "absent"
			? row("sum-table", "Table", table.selector, "table")
			: row("sum-table", "Table", "table", "table", "absent", "Not in template · posts needing one are held"),
	);
	const media: ITemplateMapping[] = [];
	if (images[0]) media.push(row("sum-image", "Image", images[0].selector, "image"));
	if (meta.length) media.push(row("sum-meta", "Meta", metaSummary(meta), "meta"));
	if (schema.length) media.push(row("sum-schema", "Schema", schema.map((s) => s.detail.replace(/^Schema · /, "")).join(", "), "schema"));
	return { content, media };
}

/** Mobile ref groups: Content structures 9 · Image containers 3 · Metadata and schema 12 (auto-detected only). */
export function groupCounts(m: ITemplateManifest) {
	const auto = m.mappings.filter((x) => x.status === "mapped" && !isHand(x));
	return [
		{ id: "content", label: "Content structures", rows: auto.filter((x) => x.group === "content") },
		{ id: "images", label: "Image containers", rows: auto.filter((x) => x.group === "images") },
		{ id: "meta", label: "Metadata and schema", rows: auto.filter((x) => x.group === "meta") },
	];
}

/** Ephemeral per-upload notes (not domain data): sample path + assets the bundle lacked, keyed by manifest id. */
export const UPLOAD_NOTES = new Map<string, { samplePath: string; missing: string[]; skipped: number; linkError?: string }>();

/** A post worth previewing a template with: in review first, then any drafted post with the most blocks. */
export function pickPreviewPost(posts: IPost[]): IPost | null {
	const drafted = posts.filter((p) => p.blocks.length >= 3);
	const order = ["in-review", "needs-assets", "mr-open", "drafting", "live", "decaying"];
	const rank = (p: IPost) => (order.includes(p.state) ? order.indexOf(p.state) : order.length);
	return [...drafted].sort((a, b) => rank(a) - rank(b) || b.blocks.length - a.blocks.length)[0] ?? null;
}
