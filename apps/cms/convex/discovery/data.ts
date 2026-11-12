// Site discovery persistence (prd-site-discovery §8): what the crawl and agent steps read and write. Internal only;
// the screens read through discovery/queries.ts with the site's access rules.
import { v } from "convex/values";
import { checkCap, DISCOVERY_DEFAULTS, estimateRun, type IDiscoverySettings } from "../../src/lib/logic";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { capSite } from "../lib/budget";
import { createRun } from "../lib/runs";

export const TEXT_RETENTION_MS = 90 * 86_400_000; // SD7

export const settingsOf = (site: Pick<Doc<"sites">, "discovery">): IDiscoverySettings => ({ ...DISCOVERY_DEFAULTS, ...(site.discovery ?? {}) });

export async function pagesOf(ctx: QueryCtx, siteId: Id<"sites">, cap = 1000): Promise<Doc<"crawledPages">[]> {
	return ctx.db.query("crawledPages").withIndex("by_site_url", (q) => q.eq("siteId", siteId)).take(cap);
}

/** What the crawl needs: the domain, the site's limits, and the hashes it already stored (incremental re-runs). */
export const crawlInput = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pages = await pagesOf(ctx, siteId);
		return { domain: site.domain, settings: settingsOf(site), known: pages.map((p) => ({ url: p.url, hash: p.hash })) };
	},
});

const vSkipped = v.array(v.object({ url: v.string(), reason: v.string() }));

/** The crawl plan is set: coverage so far (skipped with reasons) and the page total for progress. */
export const recordPlan = internalMutation({
	args: { runId: v.id("runs"), reportId: v.id("discoveryReports"), total: v.number(), skipped: vSkipped, limitHit: v.boolean() },
	handler: async (ctx, { runId, reportId, total, skipped, limitHit }) => {
		const r = await ctx.db.get(reportId);
		if (!r) return;
		await ctx.db.patch(reportId, { stage: "crawl", coverage: { crawled: 0, skipped: skipped.slice(0, 1000), limitHit } });
		await ctx.db.patch(runId, { stage: "crawl", output: `Reading ${total} page${total === 1 ? "" : "s"}`, progress: { pagesTotal: total, pagesCrawled: 0, pagesSkipped: skipped.length } });
	},
});

const vOutline = v.array(v.object({ level: v.number(), text: v.string() }));
const vRow = v.object({
	url: v.string(),
	canonical: v.optional(v.string()),
	status: v.number(),
	title: v.string(),
	metaDescription: v.optional(v.string()),
	outline: vOutline,
	wordCount: v.number(),
	publishedAt: v.optional(v.string()),
	modifiedAt: v.optional(v.string()),
	schemaTypes: v.array(v.string()),
	internalLinks: v.array(v.string()),
});

/**
 * Upserts crawled pages. An unchanged hash keeps the page's extract (F3: not re-extracted) and drops the new text
 * blob; a changed page replaces its text and clears the extract. Returns blobs the caller no longer needs.
 */
export const savePages = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports"), pages: v.array(v.object({ row: vRow, hash: v.string(), textStorageId: v.id("_storage") })), failed: vSkipped },
	handler: async (ctx, { siteId, runId, reportId, pages, failed }): Promise<{ unused: Id<"_storage">[] }> => {
		const now = Date.now();
		const unused: Id<"_storage">[] = [];
		for (const p of pages) {
			const existing = (await ctx.db.query("crawledPages").withIndex("by_site_url", (q) => q.eq("siteId", siteId).eq("url", p.row.url)).take(1))[0];
			const base = { ...p.row, siteId, runId, lastCrawledAt: now };
			if (existing && existing.hash === p.hash && existing.textStorageId) {
				unused.push(p.textStorageId);
				await ctx.db.patch(existing._id, { ...base, textExpiresAt: now + TEXT_RETENTION_MS });
			} else if (existing) {
				if (existing.textStorageId) unused.push(existing.textStorageId);
				await ctx.db.patch(existing._id, { ...base, hash: p.hash, textStorageId: p.textStorageId, textExpiresAt: now + TEXT_RETENTION_MS, extract: undefined, type: undefined });
			} else {
				await ctx.db.insert("crawledPages", { ...base, hash: p.hash, textStorageId: p.textStorageId, textExpiresAt: now + TEXT_RETENTION_MS, schemaTypes: p.row.schemaTypes });
			}
		}
		const report = await ctx.db.get(reportId);
		const run = await ctx.db.get(runId);
		if (report) await ctx.db.patch(reportId, { coverage: { ...report.coverage, crawled: report.coverage.crawled + pages.length, skipped: [...report.coverage.skipped, ...failed].slice(0, 1000) } });
		if (run?.progress) {
			const crawled = run.progress.pagesCrawled + pages.length;
			await ctx.db.patch(runId, { progress: { ...run.progress, pagesCrawled: crawled, pagesSkipped: run.progress.pagesSkipped + failed.length }, output: `Read ${crawled} of ${run.progress.pagesTotal} pages` });
		}
		return { unused };
	},
});

/** Adds provider spend (crawl credits, searches) to the run's cost; the ledger itself is hold → settle in spend.ts. */
export const addRunCost = internalMutation({
	args: { runId: v.id("runs"), microUsd: v.number() },
	handler: async (ctx, { runId, microUsd }) => {
		const run = await ctx.db.get(runId);
		if (run) await ctx.db.patch(runId, { costUsd: Math.round((run.costUsd + microUsd / 1e6) * 10000) / 10000 });
	},
});

/** Daily: page text older than 90 days is deleted (SD7); the extract and outline stay. */
export const purgeExpiredText = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		let n = 0;
		for (const p of await ctx.db.query("crawledPages").withIndex("by_text_expiry", (q) => q.gt("textExpiresAt", 0).lte("textExpiresAt", now)).take(500)) {
			if (!p.textStorageId) continue;
			await ctx.storage.delete(p.textStorageId);
			await ctx.db.patch(p._id, { textStorageId: undefined, textExpiresAt: undefined });
			if (++n >= 500) break;
		}
		return n;
	},
});

/**
 * Opens a discovery run and its report (F2, F4): one run per site at a time, cap-checked against the text budget
 * with the run's estimate, refused with the reason the screens show. The workflow (discovery/workflow.ts) starts
 * on the returned ids.
 */
export async function openDiscoveryRun(ctx: MutationCtx, site: Doc<"sites">, o: { mode: "full" | "more-ideas"; trigger: "manual" | "workflow"; userId?: Id<"users"> }): Promise<{ ok: true; runId: Id<"runs">; reportId: Id<"discoveryReports"> } | { ok: false; reason: string }> {
	const running = await ctx.db.query("runs").withIndex("by_site_status", (q) => q.eq("siteId", site._id).eq("status", "running")).take(50);
	if (running.some((r) => r.kind === "site-discovery")) return { ok: false, reason: "Discovery is already running" };
	const estimate = estimateRun("site-discovery", capSite(site));
	const cap = checkCap(capSite(site), "site-discovery", estimate);
	if (cap.status === "refused") return { ok: false, reason: cap.message };
	const n = (await ctx.db.query("discoveryReports").withIndex("by_site_created", (q) => q.eq("siteId", site._id)).take(500)).length;
	const runId = await createRun(ctx, { site, kind: "site-discovery", trigger: o.trigger, estimate, idempotencyKey: `run:${site._id}:site-discovery:${n + 1}:${o.mode}`, output: `Reading ${site.domain}`, ...(o.userId ? { triggeredBy: o.userId } : {}) });
	await ctx.db.patch(runId, { stage: "seed" });
	const reportId = await ctx.db.insert("discoveryReports", { siteId: site._id, runId, status: "running", stage: "seed", mode: o.mode, coverage: { crawled: 0, skipped: [], limitHit: false }, pillars: [], competitorNotes: [], refreshCandidates: [], ideaIds: [], dropped: [], costUsd: 0, createdAt: Date.now() });
	return { ok: true, runId, reportId };
}

/** Internal entry (tests, ops, the crawl-only check): open a run without the workflow. */
export const beginRun = internalMutation({
	args: { siteId: v.id("sites"), mode: v.union(v.literal("full"), v.literal("more-ideas")) },
	handler: async (ctx, { siteId, mode }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return { ok: false as const, reason: "Site not found" };
		return openDiscoveryRun(ctx, site, { mode, trigger: "workflow" });
	},
});

/** Closes a run and its report (the workflow's finish step uses this; so does a crawl-only check). */
export const closeRun = internalMutation({
	args: { runId: v.id("runs"), reportId: v.id("discoveryReports"), status: v.union(v.literal("succeeded"), v.literal("failed"), v.literal("needs-interview")), output: v.string(), error: v.optional(v.string()) },
	handler: async (ctx, a) => {
		const now = Date.now();
		const run = await ctx.db.get(a.runId);
		await ctx.db.patch(a.runId, { status: a.status === "succeeded" ? "succeeded" : "failed", finishedAt: now, output: a.output, stage: "finish", ...(a.error ? { error: a.error } : {}) });
		await ctx.db.patch(a.reportId, { status: a.status, stage: "finish", finishedAt: now, costUsd: run?.costUsd ?? 0, ...(a.error ? { error: a.error } : {}) });
	},
});
