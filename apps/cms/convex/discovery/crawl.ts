// Site discovery crawl (prd-site-discovery §6.2): seed from robots.txt + Firecrawl map, plan within the site's limits,
// batch-scrape through Firecrawl, store each page PII-stripped. Resumable: each call works for a bounded time and
// returns a cursor, so the discovery workflow can call it again (no single action runs into Convex's time limit).
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { CRAWL_USER_AGENT, contentHash, crawlCostUsd, normalizeUrl, parseRobots, planCrawl, toPageRow, USD_PER_CREDIT, type IRobots } from "./crawlCore";
import { batchPage, FirecrawlError, mapSite, startBatch } from "./firecrawl";

const WORK_MS = 7 * 60_000; // stay well inside an action's 10-minute limit
const POLL_MS = 8_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRobots(domain: string): Promise<IRobots & { found: boolean }> {
	try {
		const res = await fetch(`https://${domain}/robots.txt`, { headers: { "User-Agent": `${CRAWL_USER_AGENT} (+https://baynor-seo-cms.vercel.app)` }, signal: AbortSignal.timeout(10_000), redirect: "follow" });
		// 4xx = no robots rules (crawl allowed); 5xx = treat as fully disallowed (RFC 9309 §2.3.1.4).
		if (res.status >= 500) return { allow: [], disallow: ["/"], crawlDelaySec: null, sitemaps: [], found: true };
		if (!res.ok) return { allow: [], disallow: [], crawlDelaySec: null, sitemaps: [], found: false };
		return { ...parseRobots(await res.text()), found: true };
	} catch {
		return { allow: [], disallow: [], crawlDelaySec: null, sitemaps: [], found: false };
	}
}

const vCursor = v.object({ batchId: v.string(), next: v.union(v.string(), v.null()), estimateMicroUsd: v.number() });
export const vCrawlResult = v.object({
	done: v.boolean(),
	cursor: v.optional(vCursor),
	/** Set when the crawl can't continue: unreachable domain, everything disallowed, over the cap, Firecrawl not set up. */
	stop: v.optional(v.object({ reason: v.union(v.literal("unreachable"), v.literal("robots-blocked"), v.literal("over-cap"), v.literal("not-configured"), v.literal("provider")), message: v.string() })),
	pages: v.optional(v.number()),
});
type TCrawlResult = typeof vCrawlResult.type;

async function storeBatch(ctx: ActionCtx, a: { siteId: Id<"sites">; runId: Id<"runs">; reportId: Id<"discoveryReports">; domain: string }, items: Awaited<ReturnType<typeof batchPage>>["data"]) {
	const pages: { row: Omit<NonNullable<ReturnType<typeof toPageRow>>, "text">; hash: string; textStorageId: Id<"_storage"> }[] = [];
	const failed: { url: string; reason: string }[] = [];
	for (const item of items) {
		const url = normalizeUrl(item.metadata?.url ?? item.metadata?.sourceURL ?? "") ?? item.metadata?.sourceURL ?? "unknown";
		const status = item.metadata?.statusCode ?? 0;
		if (item.metadata?.error || status >= 400) {
			failed.push({ url, reason: `error · ${status || item.metadata?.error || "no response"}` });
			continue;
		}
		const row = toPageRow(item, a.domain);
		if (!row) {
			failed.push({ url, reason: "error · unreadable URL" });
			continue;
		}
		if (!row.text.trim()) {
			failed.push({ url: row.url, reason: "non-html · no readable content" });
			continue;
		}
		const { text, ...rest } = row;
		const textStorageId = await ctx.storage.store(new Blob([text], { type: "text/markdown" }));
		pages.push({ row: rest, hash: await contentHash(row), textStorageId });
	}
	for (let i = 0; i < Math.max(1, pages.length); i += 40) {
		const { unused } = await ctx.runMutation(internal.discovery.data.savePages, { siteId: a.siteId, runId: a.runId, reportId: a.reportId, pages: pages.slice(i, i + 40), failed: i === 0 ? failed : [] });
		for (const id of unused) await ctx.storage.delete(id);
	}
}

/**
 * One crawl slice. Without a cursor: seed and plan, hold the estimated credits, start the batch. With one: keep
 * reading results. Returns done, or a cursor for the next slice, or a stop with the reason the report shows.
 */
export const crawl = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports"), cursor: v.optional(vCursor) },
	returns: vCrawlResult,
	handler: async (ctx, a): Promise<TCrawlResult> => {
		const started = Date.now();
		const input = await ctx.runQuery(internal.discovery.data.crawlInput, { siteId: a.siteId });
		if (!input) return { done: true, stop: { reason: "unreachable", message: "Site not found" } };
		const holdKey = `discovery:${a.runId}:crawl`;
		let cursor = a.cursor;
		try {
			if (!cursor) {
				const home = `https://${input.domain}/`;
				const robots = await fetchRobots(input.domain);
				if (robots.disallow.includes("/") && !robots.allow.length) return { done: true, stop: { reason: "robots-blocked", message: `${input.domain}'s robots.txt disallows crawling` } };
				let found: string[];
				try {
					found = await mapSite(home, { includeSubdomains: input.settings.subdomains, limit: 5000 });
				} catch (e) {
					if (e instanceof FirecrawlError && e.status === 0) return { done: true, stop: { reason: "not-configured", message: e.message } };
					if (e instanceof FirecrawlError && e.status === 402) return { done: true, stop: { reason: "provider", message: e.message } };
					return { done: true, stop: { reason: "unreachable", message: `We couldn't reach ${input.domain}` } };
				}
				const plan = planCrawl(found, home, { domain: input.domain, subdomains: input.settings.subdomains, exclude: input.settings.exclude, depth: input.settings.depth, robots }, Math.min(input.settings.maxPages, 1000));
				if (!plan.urls.length) return { done: true, stop: { reason: "robots-blocked", message: "No crawlable pages on the site (robots rules, limits or exclusions)" } };
				const estimateMicroUsd = Math.round(crawlCostUsd(plan.urls.length) * 1e6);
				const held = await ctx.runMutation(internal.spend.hold, { siteId: a.siteId, budget: "text", key: holdKey, microUsd: estimateMicroUsd, runId: a.runId });
				if (!held.ok) return { done: true, stop: { reason: "over-cap", message: held.message } };
				await ctx.runMutation(internal.discovery.data.recordPlan, { runId: a.runId, reportId: a.reportId, total: plan.urls.length, skipped: plan.skipped, limitHit: plan.limitHit });
				// One request at a time (F6: 1 request per second); a longer crawl-delay is still one at a time.
				const batch = await startBatch(plan.urls, 1);
				if (batch.invalid.length) await ctx.runMutation(internal.discovery.data.savePages, { siteId: a.siteId, runId: a.runId, reportId: a.reportId, pages: [], failed: batch.invalid.map((url) => ({ url, reason: "error · invalid URL" })) });
				cursor = { batchId: batch.id, next: null, estimateMicroUsd };
			}
			// Wait for the batch to finish, then page through its results (each page ≤10 MB).
			let page = await batchPage(cursor.next ?? cursor.batchId);
			while (page.status === "scraping") {
				if (Date.now() - started > WORK_MS) return { done: false, cursor };
				await sleep(POLL_MS);
				page = await batchPage(cursor.batchId);
			}
			if (page.status === "failed" || page.status === "cancelled") return { done: true, stop: { reason: "provider", message: `Firecrawl's crawl ${page.status}` } };
			let stored = 0;
			for (;;) {
				await storeBatch(ctx, { ...a, domain: input.domain }, page.data);
				stored += page.data.length;
				if (!page.next) break;
				cursor = { ...cursor, next: page.next };
				if (Date.now() - started > WORK_MS) return { done: false, cursor };
				page = await batchPage(page.next);
			}
			// Settle the hold at what Firecrawl actually charged (pages + the map call).
			const actual = Math.round((page.creditsUsed + 1) * USD_PER_CREDIT * 1e6);
			await ctx.runMutation(internal.spend.settle, { key: holdKey, actualMicroUsd: actual });
			await ctx.runMutation(internal.discovery.data.addRunCost, { runId: a.runId, microUsd: actual });
			return { done: true, pages: stored };
		} catch (e) {
			if (e instanceof FirecrawlError && e.status === 429 && cursor) return { done: false, cursor }; // slow down, resume next slice
			if (e instanceof FirecrawlError) return { done: true, stop: { reason: e.status === 0 ? "not-configured" : "provider", message: e.message } };
			throw e;
		}
	},
});
