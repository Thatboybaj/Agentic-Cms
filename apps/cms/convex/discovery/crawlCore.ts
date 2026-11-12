// Site discovery crawl, pure parts (prd-site-discovery §6.2, F5–F9): robots rules, which URLs are in scope, crawl
// order and limits, PII stripping, and turning one scraped page into a stored row. No I/O here; unit-tested.

export const CRAWL_USER_AGENT = "AgenticCMS-SiteDiscovery";
/** Main-content text kept per page (F8). */
export const MAX_TEXT_CHARS = 20_000;
/** Firecrawl pay-as-you-go: 2,000 credits for $5. */
export const USD_PER_CREDIT = 0.0025;

// ─── robots.txt ──────────────────────────────────────────────────────────────

export interface IRobots {
	allow: string[];
	disallow: string[];
	crawlDelaySec: number | null;
	sitemaps: string[];
}

/**
 * Parses robots.txt for our user agent, falling back to the "*" group (RFC 9309: the most specific group wins,
 * groups are not merged). Sitemap lines apply to every group.
 */
export function parseRobots(text: string): IRobots {
	const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number | null }[] = [];
	const sitemaps: string[] = [];
	let cur: (typeof groups)[number] | null = null;
	let lastWasAgent = false;
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/#.*/, "").trim();
		if (!line) continue;
		const i = line.indexOf(":");
		if (i < 0) continue;
		const key = line.slice(0, i).trim().toLowerCase();
		const val = line.slice(i + 1).trim();
		if (key === "sitemap") {
			if (val) sitemaps.push(val);
			continue;
		}
		if (key === "user-agent") {
			if (!cur || !lastWasAgent) {
				cur = { agents: [], allow: [], disallow: [], delay: null };
				groups.push(cur);
			}
			cur.agents.push(val.toLowerCase());
			lastWasAgent = true;
			continue;
		}
		lastWasAgent = false;
		if (!cur) continue;
		if (key === "disallow" && val) cur.disallow.push(val);
		else if (key === "allow" && val) cur.allow.push(val);
		else if (key === "crawl-delay") {
			const n = Number(val);
			if (Number.isFinite(n) && n >= 0) cur.delay = n;
		}
	}
	const ua = CRAWL_USER_AGENT.toLowerCase();
	const mine = groups.find((g) => g.agents.some((a) => a !== "*" && ua.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
	return { allow: mine?.allow ?? [], disallow: mine?.disallow ?? [], crawlDelaySec: mine?.delay ?? null, sitemaps };
}

/** robots path pattern: "*" wildcard, "$" end anchor, otherwise a prefix. */
function robotsMatch(pattern: string, path: string): number {
	const anchored = pattern.endsWith("$");
	const body = anchored ? pattern.slice(0, -1) : pattern;
	const re = new RegExp(`^${body.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
	return re.test(path) ? body.length : -1;
}

/** Longest matching rule wins; on a tie, allow wins (RFC 9309). */
export function robotsAllows(robots: IRobots, pathWithQuery: string): boolean {
	let best = -1;
	let allowed = true;
	for (const d of robots.disallow) {
		const n = robotsMatch(d, pathWithQuery);
		if (n > best) {
			best = n;
			allowed = false;
		}
	}
	for (const a of robots.allow) {
		const n = robotsMatch(a, pathWithQuery);
		if (n >= best && n >= 0) {
			best = n;
			allowed = true;
		}
	}
	return allowed;
}

// ─── Scope, order, limits ────────────────────────────────────────────────────

export const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** Canonical form for dedupe: https, no www, no fragment, no trailing slash (except root), lowercase host. */
export function normalizeUrl(input: string, base?: string): string | null {
	let u: URL;
	try {
		u = new URL(input, base);
	} catch {
		return null;
	}
	if (u.protocol !== "http:" && u.protocol !== "https:") return null;
	u.hash = "";
	u.hostname = bareHost(u.hostname);
	u.protocol = "https:";
	let path = u.pathname.replace(/\/{2,}/g, "/");
	if (path.length > 1) path = path.replace(/\/+$/, "");
	path = path.replace(/\/index\.html?$/i, "") || "/";
	u.pathname = path;
	return u.toString();
}

const NON_HTML = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|mp4|mov|webm|mp3|wav|zip|gz|rar|docx?|xlsx?|pptx?|csv|json|xml|txt|css|js|woff2?|ttf|eot)$/i;

export type TSkipReason = "robots" | "limit" | "non-html" | "off-site" | "excluded" | "depth" | "error";

export interface IScopeRules {
	domain: string;
	subdomains: boolean;
	exclude: string[];
	depth: number;
	robots: IRobots;
}

/** Why a URL is out of scope, or null when it can be crawled. */
export function skipReason(url: string, rules: IScopeRules): Exclude<TSkipReason, "limit" | "error"> | null {
	const u = new URL(url);
	const host = bareHost(u.hostname);
	const domain = bareHost(rules.domain);
	if (host !== domain && !(rules.subdomains && host.endsWith(`.${domain}`))) return "off-site";
	if (NON_HTML.test(u.pathname)) return "non-html";
	const pq = u.pathname + u.search;
	for (const x of rules.exclude) {
		if (x === "?" ? u.search.length > 0 : pq.toLowerCase().startsWith(x.toLowerCase())) return "excluded";
	}
	if (u.pathname.split("/").filter(Boolean).length > rules.depth) return "depth";
	if (!robotsAllows(rules.robots, pq)) return "robots";
	return null;
}

export interface IPlannedCrawl {
	urls: string[];
	skipped: { url: string; reason: TSkipReason }[];
	limitHit: boolean;
}

/**
 * Picks the pages to scrape: the home page first, then shallower paths before deeper ones, sitemap order within a
 * depth; out-of-scope URLs and everything past the page limit are recorded as skipped (F9).
 */
export function planCrawl(candidates: string[], home: string, rules: IScopeRules, maxPages: number): IPlannedCrawl {
	const seen = new Set<string>();
	const ordered: { url: string; depth: number; i: number }[] = [];
	const skipped: IPlannedCrawl["skipped"] = [];
	[home, ...candidates].forEach((raw, i) => {
		const url = normalizeUrl(raw, home);
		if (!url || seen.has(url)) return;
		seen.add(url);
		const why = skipReason(url, rules);
		if (why) skipped.push({ url, reason: why });
		else ordered.push({ url, depth: new URL(url).pathname.split("/").filter(Boolean).length, i });
	});
	ordered.sort((a, b) => a.depth - b.depth || a.i - b.i);
	const take = ordered.slice(0, maxPages);
	for (const o of ordered.slice(maxPages)) skipped.push({ url: o.url, reason: "limit" });
	return { urls: take.map((o) => o.url), skipped, limitHit: ordered.length > maxPages };
}

/** Crawl credits for a plan (one map call + one per page) and their dollar cost, for the run estimate. */
export const crawlCostUsd = (pages: number) => (pages + 1) * USD_PER_CREDIT;

// ─── PII and page parsing ────────────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone-like runs: optional +, 7+ digits with spaces, dots, dashes or brackets between them.
const PHONE = /(?<![\w/])\+?\(?\d[\d\s().-]{6,}\d(?![\w/])/g;
const MAILTO_TEL = /\]\((?:mailto|tel):[^)]*\)/gi;

/** Removes emails, phone numbers and form fields from page text before it is stored or sent to a model (F8). */
export function stripPii(text: string): string {
	return text
		.replace(MAILTO_TEL, "](removed)")
		.replace(EMAIL, "[email removed]")
		.replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 7 ? "[phone removed]" : m))
		.replace(/^.*(?:type=["'](?:text|email|tel|password)["']|<input|<textarea|<select|<form).*$/gim, "");
}

export interface IScrapedPage {
	markdown: string;
	rawHtml?: string;
	links?: string[];
	metadata: { title?: string | string[]; description?: string | string[]; url?: string; sourceURL?: string; statusCode?: number; error?: string; canonical?: string };
}

export interface IPageRow {
	url: string;
	canonical?: string;
	status: number;
	title: string;
	metaDescription?: string;
	outline: { level: number; text: string }[];
	text: string;
	wordCount: number;
	publishedAt?: string;
	modifiedAt?: string;
	schemaTypes: string[];
	internalLinks: string[];
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** JSON-LD @type values and article dates from the raw HTML (no DOM needed). */
export function structuredData(rawHtml: string | undefined): { types: string[]; published?: string; modified?: string; canonical?: string } {
	if (!rawHtml) return { types: [] };
	const types = new Set<string>();
	let published: string | undefined;
	let modified: string | undefined;
	for (const m of rawHtml.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
		try {
			const root = JSON.parse(m[1]!.trim()) as unknown;
			const walk = (n: unknown) => {
				if (Array.isArray(n)) return n.forEach(walk);
				if (!n || typeof n !== "object") return;
				const o = n as Record<string, unknown>;
				const t = o["@type"];
				for (const x of Array.isArray(t) ? t : [t]) if (typeof x === "string") types.add(x);
				if (typeof o.datePublished === "string") published ??= o.datePublished;
				if (typeof o.dateModified === "string") modified ??= o.dateModified;
				if (o["@graph"]) walk(o["@graph"]);
			};
			walk(root);
		} catch {
			/* malformed JSON-LD: ignore */
		}
	}
	const meta = (prop: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)`, "i").exec(rawHtml)?.[1];
	published ??= meta("article:published_time");
	modified ??= meta("article:modified_time");
	const canonical = /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i.exec(rawHtml)?.[1];
	return { types: [...types], ...(published ? { published } : {}), ...(modified ? { modified } : {}), ...(canonical ? { canonical } : {}) };
}

/** One Firecrawl result → the stored page (F8): outline, PII-stripped capped text, internal links on this site. */
export function toPageRow(p: IScrapedPage, domain: string): IPageRow | null {
	const url = normalizeUrl(p.metadata.url ?? p.metadata.sourceURL ?? "");
	if (!url) return null;
	const md = p.markdown ?? "";
	const outline = [...md.matchAll(/^(#{1,3})\s+(.+?)\s*#*$/gm)].map((m) => ({ level: m[1]!.length, text: stripPii(m[2]!.replace(/[*_`[\]]/g, "").replace(/\(.*?\)/g, "").trim()) })).filter((h) => h.text).slice(0, 60);
	const clean = stripPii(md).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n").trim();
	const sd = structuredData(p.rawHtml);
	const host = bareHost(domain);
	const internal = new Set<string>();
	// Firecrawl's `links` only covers the main content when onlyMainContent is on, so the site's own navigation
	// (the links between its pages) comes from the raw HTML's anchors.
	const anchors = [...(p.rawHtml ?? "").matchAll(/<a\b[^>]*\bhref=["']([^"'#][^"']*)["']/gi)].map((m) => m[1]!);
	for (const l of [...(p.links ?? []), ...anchors]) {
		const n = normalizeUrl(l, url);
		if (n && bareHost(new URL(n).hostname) === host && n !== url && !NON_HTML.test(new URL(n).pathname)) internal.add(n);
	}
	const canonical = normalizeUrl(p.metadata.canonical ?? sd.canonical ?? "", url) ?? undefined;
	return {
		url,
		...(canonical && canonical !== url ? { canonical } : {}),
		status: p.metadata.statusCode ?? 200,
		title: stripPii(one(p.metadata.title) ?? outline.find((h) => h.level === 1)?.text ?? url),
		...(one(p.metadata.description) ? { metaDescription: stripPii(one(p.metadata.description)!) } : {}),
		outline,
		text: clean.slice(0, MAX_TEXT_CHARS),
		wordCount: clean.split(/\s+/).filter(Boolean).length,
		...(sd.published ? { publishedAt: sd.published } : {}),
		...(sd.modified ? { modifiedAt: sd.modified } : {}),
		schemaTypes: sd.types,
		internalLinks: [...internal].slice(0, 200),
	};
}

/** Content hash for incremental re-runs (F3): unchanged pages aren't re-extracted. */
export async function contentHash(row: Pick<IPageRow, "title" | "text">): Promise<string> {
	const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${row.title}\n${row.text}`)));
	return [...bytes.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
