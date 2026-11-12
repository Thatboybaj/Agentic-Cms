// Firecrawl v2 client for site discovery (prd-site-discovery F7, F17): map, batch scrape and search. The key lives in
// the Convex env (FIRECRAWL_API_KEY) and is only ever sent to api.firecrawl.dev. Errors are typed so the workflow can
// tell "out of credits" (402) and "slow down" (429) from a broken site.
import type { IScrapedPage } from "./crawlCore";

const BASE = "https://api.firecrawl.dev/v2";

export class FirecrawlError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "FirecrawlError";
	}
}

export const firecrawlConfigured = () => !!process.env.FIRECRAWL_API_KEY;

async function call<T>(method: "GET" | "POST", pathOrUrl: string, body?: unknown): Promise<T> {
	const key = process.env.FIRECRAWL_API_KEY;
	if (!key) throw new FirecrawlError(0, "Firecrawl isn't set up on this deployment (add FIRECRAWL_API_KEY in the Convex dashboard)");
	const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${BASE}${pathOrUrl}`;
	if (!url.startsWith(`${BASE}/`)) throw new FirecrawlError(0, "Refusing a non-Firecrawl URL"); // `next` links come from Firecrawl
	const res = await fetch(url, { method, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
	const text = await res.text();
	if (!res.ok) {
		let msg = text.slice(0, 300);
		try {
			msg = (JSON.parse(text) as { error?: string }).error ?? msg;
		} catch {
			/* not JSON */
		}
		if (res.status === 402) throw new FirecrawlError(402, "Firecrawl is out of credits · top up the Firecrawl account, then re-run discovery");
		throw new FirecrawlError(res.status, `Firecrawl ${res.status}: ${msg}`);
	}
	return JSON.parse(text) as T;
}

/** Every URL Firecrawl finds for the site (sitemaps plus link discovery). 1 credit. */
export async function mapSite(url: string, o: { includeSubdomains: boolean; limit: number }): Promise<string[]> {
	const r = await call<{ links?: ({ url: string } | string)[] }>("POST", "/map", { url, includeSubdomains: o.includeSubdomains, ignoreQueryParameters: false, limit: o.limit, sitemap: "include" });
	return (r.links ?? []).map((l) => (typeof l === "string" ? l : l.url)).filter(Boolean);
}

const SCRAPE_OPTIONS = {
	formats: ["markdown", "links", "rawHtml"],
	onlyMainContent: true,
	blockAds: true,
	timeout: 45_000,
};

/** Starts a batch scrape (1 credit per page). maxConcurrency honours the site's crawl-delay. */
export async function startBatch(urls: string[], maxConcurrency: number): Promise<{ id: string; invalid: string[] }> {
	const r = await call<{ id: string; invalidURLs?: string[] | null }>("POST", "/batch/scrape", { urls, ignoreInvalidURLs: true, maxConcurrency, ...SCRAPE_OPTIONS });
	return { id: r.id, invalid: r.invalidURLs ?? [] };
}

export interface IBatchPage {
	status: "scraping" | "completed" | "failed" | "cancelled";
	total: number;
	completed: number;
	creditsUsed: number;
	data: IScrapedPage[];
	next: string | null;
}

/** One page of a batch's results; follow `next` until null (results come in ≤10 MB pages). */
export async function batchPage(idOrNext: string): Promise<IBatchPage> {
	const r = await call<Partial<IBatchPage>>("GET", idOrNext.startsWith("https://") ? idOrNext : `/batch/scrape/${encodeURIComponent(idOrNext)}`);
	return { status: r.status ?? "scraping", total: r.total ?? 0, completed: r.completed ?? 0, creditsUsed: r.creditsUsed ?? 0, data: r.data ?? [], next: r.next ?? null };
}

/** Web search for who ranks (competitor check, F17). 2 credits per 10 results. */
export async function searchWeb(query: string, limit: number): Promise<{ url: string; title: string; description: string }[]> {
	const r = await call<{ data?: { web?: { url: string; title?: string; description?: string }[] } }>("POST", "/search", { query, limit, sources: ["web"] });
	return (r.data?.web ?? []).map((w) => ({ url: w.url, title: w.title ?? "", description: w.description ?? "" }));
}

/** Credits a search costs: 2 per 10 results, rounded up. */
export const searchCredits = (limit: number) => 2 * Math.ceil(limit / 10);
