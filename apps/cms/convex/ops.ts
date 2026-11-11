// Operations (handoff 09 steps 5 and 8): a health view for admins, site export (JSON), site deletion (admin,
// confirmed by slug, audited, batched in the background), and retention (webhook deliveries, presence).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { audit } from "./lib/audit";
import { siteMutation, siteQuery } from "./lib/functions";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** What needs a person right now: holds, failed runs, stuck workflows, webhook failures, connection problems. */
export const health = siteQuery({
	permission: "budget.set",
	args: {},
	handler: async (ctx, { siteId }) => {
		const now = Date.now();
		const site = ctx.access.site;
		const runs = await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId).gte("startedAt", now - DAY)).take(500);
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(2000);
		const holds = (await ctx.db.query("ledgerItems").withIndex("by_site_done", (q) => q.eq("siteId", siteId).eq("done", false)).take(300)).filter((l) => l.kind === "autopost-hold" || l.kind === "autopost-refused");
		const failedHooks = (await ctx.db.query("webhookEvents").order("desc").take(500)).filter((w) => w.siteId === siteId && w.status === "failed" && now - w.receivedAt < DAY).length;
		const conns = await ctx.db.query("connections").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		return {
			failedRuns24h: runs.filter((r) => r.status === "failed").map((r) => ({ kind: r.kind, error: r.error ?? r.output, at: r.startedAt })),
			stuckRuns: runs.filter((r) => (r.status === "running" || r.status === "queued") && now - r.startedAt > HOUR).map((r) => ({ kind: r.kind, since: r.startedAt })),
			stuckWorkflows: posts.filter((p) => p.workflowId && now - p.updatedAt > HOUR).map((p) => ({ postId: p._id, title: p.title, state: p.state, since: p.updatedAt })),
			autopostHolds: holds.map((h) => ({ title: h.title, since: h.createdAt })),
			failedWebhooks24h: failedHooks,
			brokenConnections: conns.filter((c) => c.enabled && c.status === "failed").map((c) => ({ label: c.label, error: c.lastError ?? "" })),
			searchConsole: site.searchConsole,
			spend: { textUsd: site.spend.textMicroUsd / 1e6, textCapUsd: site.budgetCaps.textCapUsd, imageUsd: site.spend.imageMicroUsd / 1e6, imageCapUsd: site.budgetCaps.imageCapUsd },
		};
	},
});

/** Everything a site owns, as data (no secrets, no storage bytes): posts with versions, keywords, pillars, audit. */
export const exportSite = siteQuery({
	permission: "budget.set",
	args: {},
	handler: async (ctx, { siteId }) => {
		const site = ctx.access.site;
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(2000);
		const versions = [];
		for (const p of posts) versions.push(...(await ctx.db.query("postVersions").withIndex("by_post_n", (q) => q.eq("postId", p._id)).take(200)));
		return {
			exportedAt: new Date().toISOString(),
			site: { name: site.name, slug: site.slug, domain: site.domain, industry: site.industry, brandPack: site.brandPack, publishing: site.publishing, budgetCaps: site.budgetCaps },
			pillars: await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(200),
			keywords: await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(5000),
			posts,
			versions,
			audit: await ctx.db.query("auditEvents").withIndex("by_site_at", (q) => q.eq("siteId", siteId)).order("desc").take(5000),
		};
	},
});

// Tables holding a site's rows, with the index that finds them by siteId (first field).
const SITE_TABLES: { table: TableNames; index: string }[] = [
	{ table: "posts", index: "by_site_week" },
	{ table: "keywords", index: "by_site" },
	{ table: "pillars", index: "by_site" },
	{ table: "imageSlots", index: "by_site_status" },
	{ table: "mergeRequests", index: "by_site_status" },
	{ table: "runs", index: "by_site_started" },
	{ table: "schedules", index: "by_site_kind" },
	{ table: "ledgerItems", index: "by_site_done" },
	{ table: "auditEvents", index: "by_site_at" },
	{ table: "kasSnapshots", index: "by_site_at" },
	{ table: "trafficWeekly", index: "by_site_week" },
	{ table: "reports", index: "by_site_n" },
	{ table: "templateManifests", index: "by_site_version" },
	{ table: "repoConnections", index: "by_site" },
	{ table: "connections", index: "by_site" },
	{ table: "secrets", index: "by_site" },
	{ table: "assets", index: "by_site" },
	{ table: "memberships", index: "by_site_user" },
	{ table: "gitInstallations", index: "by_site" },
	{ table: "siteSubscriptions", index: "by_site" },
	{ table: "spendEntries", index: "by_site_month_budget" },
	{ table: "artifacts", index: "by_site_agent_kind" },
];

export const deleteSite = siteMutation({
	permission: "members.manage",
	args: { confirmSlug: v.string() },
	handler: async (ctx, { siteId, confirmSlug }): Promise<{ ok: true } | { ok: false; reason: string }> => {
		const { site, user } = ctx.access;
		if (confirmSlug !== site.slug) return { ok: false, reason: `Type the site's slug (${site.slug}) to confirm` };
		await ctx.db.patch(siteId, { status: "paused" }); // nothing runs while it's being removed
		await audit(ctx, { workspaceId: site.workspaceId, actor: user, action: "deleted site", target: site.name, detail: "Removal running in the background" });
		await ctx.scheduler.runAfter(0, internal.ops.purgeChildren, { siteId });
		return { ok: true };
	},
});

/** Phase 1: rows that hang off posts, slots, keywords and manifests (no site index), 25 parents per pass. */
export const purgeChildren = internalMutation({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(25);
		for (const p of posts) {
			for (const x of await ctx.db.query("postVersions").withIndex("by_post_n", (q) => q.eq("postId", p._id)).take(500)) await ctx.db.delete(x._id);
			for (const x of await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", p._id)).take(500)) await ctx.db.delete(x._id);
			for (const x of await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", p._id)).take(500)) await ctx.db.delete(x._id);
			for (const x of await ctx.db.query("suggestions").withIndex("by_post_status", (q) => q.eq("postId", p._id)).take(500)) await ctx.db.delete(x._id);
			for (const x of await ctx.db.query("comments").withIndex("by_post_at", (q) => q.eq("postId", p._id)).take(500)) await ctx.db.delete(x._id);
			for (const sl of await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", p._id)).take(100)) {
				for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", sl._id)).take(100)) await ctx.db.delete(c._id);
				await ctx.db.delete(sl._id);
			}
			await ctx.db.delete(p._id);
		}
		if (posts.length === 25) return void (await ctx.scheduler.runAfter(0, internal.ops.purgeChildren, { siteId }));
		for (const k of await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(5000)) {
			for (const h of await ctx.db.query("positionHistory").withIndex("by_keyword_date", (q) => q.eq("keywordId", k._id)).take(400)) await ctx.db.delete(h._id);
		}
		for (const m of await ctx.db.query("templateManifests").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).take(200)) {
			for (const tf of await ctx.db.query("templateFiles").withIndex("by_manifest_path", (q) => q.eq("manifestId", m._id)).take(2000)) {
				if (tf.storageId) await ctx.storage.delete(tf.storageId).catch(() => undefined);
				await ctx.db.delete(tf._id);
			}
		}
		await ctx.scheduler.runAfter(0, internal.ops.purgeSite, { siteId, step: 0 });
	},
});

/** Phase 2: deletes a site's rows table by table in bounded batches (and their stored files), then the site itself. */
export const purgeSite = internalMutation({
	args: { siteId: v.id("sites"), step: v.number() },
	handler: async (ctx, { siteId, step }) => {
		const t = SITE_TABLES[step];
		if (!t) {
			const site = await ctx.db.get(siteId);
			if (site) await ctx.db.delete(siteId);
			return;
		}
		const rows = await (ctx.db.query(t.table) as unknown as { withIndex: (i: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown) => { take: (n: number) => Promise<{ _id: Id<TableNames>; storageId?: Id<"_storage"> }[]> } }).withIndex(t.index, (q) => q.eq("siteId", siteId)).take(200);
		for (const r of rows) {
			if (r.storageId) await ctx.storage.delete(r.storageId).catch(() => undefined);
			await ctx.db.delete(r._id);
		}
		await ctx.scheduler.runAfter(0, internal.ops.purgeSite, { siteId, step: rows.length === 200 ? step : step + 1 });
	},
});

/** Retention: webhook deliveries after 30 days, presence heartbeats after 1 day. */
export const retention = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		for (const w of await ctx.db.query("webhookEvents").order("asc").take(500)) if (now - w.receivedAt > 30 * DAY) await ctx.db.delete(w._id);
		for (const p of await ctx.db.query("presence").withIndex("by_at", (q) => q.lt("at", now - DAY)).take(500)) await ctx.db.delete(p._id);
	},
});
