// Inputs for the live scheduled agents (agents/scheduled.ts), read from this site only (isolation I4), and the QA
// sweep's findings, computed from records rather than asked of a model. The QA skill's reality checks that need a
// fetch of the live site (status codes, schema in HTML) wait for the renderer + crawler (05 / 07).
import { v } from "convex/values";
import { ledgerStatus } from "../src/lib/logic";
import { internalQuery } from "./_generated/server";
import type { IQaDigest, IQaFinding } from "./agents/scheduledCore";

const DAY = 86_400_000;

export const swarmContext = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(2000);
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(2000);
		const rejectedIds = new Set(posts.filter((p) => p.ideaStatus === "rejected").map((p) => p.keywordId));
		return {
			context: {
				siteName: site.name,
				domain: site.domain,
				industry: site.industry,
				voice: site.brandPack.voice,
				pillars: pillars.map((p) => p.name),
				existing: keywords.filter((k) => !rejectedIds.has(k._id)).map((k) => k.term),
				rejected: keywords.filter((k) => rejectedIds.has(k._id)).map((k) => k.term),
				target: Math.max(8, Math.min(20, site.cadenceTarget * 4)),
			},
			modelRouting: site.modelRouting,
		};
	},
});

/** Keyword swarm v0.3 brief: the site, its pillars, the keyword LTM, rejected terms and known competitors. */
export const swarmBrief = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const pillarName = new Map(pillars.map((p) => [p._id, p.name]));
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(3000);
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(3000);
		const rejectedIds = new Set(posts.filter((p) => p.ideaStatus === "rejected").map((p) => p.keywordId));
		const liveIds = new Set(posts.filter((p) => p.state === "live").map((p) => p.keywordId));
		const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const report = (await ctx.db.query("discoveryReports").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const host = (u: string) => {
			try {
				return new URL(u).hostname.replace(/^www\./, "");
			} catch {
				return "";
			}
		};
		const competitors = [...new Set([...(profile?.competitorsNamed.map((c) => c.value) ?? []), ...(report?.competitorNotes.flatMap((n) => n.ranking.map(host)) ?? [])].filter((c) => c && c !== site.domain))].slice(0, 12);
		return {
			brief: {
				siteName: site.name,
				domain: site.domain,
				industry: site.industry,
				voice: site.brandPack.voice,
				pillars: pillars.map((p) => p.name),
				...(profile ? { profile: `${profile.sells.value} · audience: ${profile.audience.value}` } : {}),
				ltm: keywords.filter((k) => !rejectedIds.has(k._id)).map((k) => ({ term: k.term, pillar: pillarName.get(k.pillarId) ?? "", ...(k.cluster ? { cluster: k.cluster } : {}), ...(k.role ? { role: k.role } : {}), status: k.status ?? (liveIds.has(k._id) ? "live" : "in-plan"), intent: k.intent })),
				rejected: keywords.filter((k) => rejectedIds.has(k._id)).map((k) => k.term),
				competitors,
				gsc: [] as { query: string; impressions: number; position: number }[],
				target: Math.max(12, Math.min(30, site.cadenceTarget * 8)),
			},
			searchConsole: site.searchConsole,
			modelRouting: site.modelRouting,
		};
	},
});

const PERIOD: Record<string, number> = { weekly: 7 * DAY, biweekly: 14 * DAY, monthly: 31 * DAY };

export const qaDigest = internalQuery({
	args: { siteId: v.id("sites"), mode: v.union(v.literal("light"), v.literal("full")) },
	handler: async (ctx, { siteId, mode }): Promise<{ digest: IQaDigest; modelRouting: { mechanical: "fast" | "workhorse" | "strongest"; writing: "fast" | "workhorse" | "strongest"; strategy: "fast" | "workhorse" | "strongest"; pillarPages: "fast" | "workhorse" | "strongest" } } | null> => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const now = Date.now();
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(2000);
		const findings: IQaFinding[] = [];
		const days = (t: number) => Math.floor((now - t) / DAY);

		// B · reality: nothing ships with an open [VERIFY] or an unfilled slot.
		for (const p of posts.filter((x) => x.state === "live" || x.state === "mr-open")) {
			const open = (await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", p._id)).take(60)).filter((f) => f.status === "open");
			if (open.length) findings.push({ key: `verify:${p._id}`, kind: "reality", status: "FAIL", detail: `${p.title} is ${p.state} with ${open.length} open fact marker${open.length === 1 ? "" : "s"}`, ledger: { title: `Source or remove ${open.length} claim${open.length === 1 ? "" : "s"} · ${p.title}`, downstream: `${p.state === "live" ? "Live" : "Open MR"} post carries unsourced claims`, postId: p._id } });
			const slots = (await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", p._id)).take(50)).filter((s) => s.status !== "selected");
			if (slots.length) findings.push({ key: `slots:${p._id}`, kind: "reality", status: "FAIL", detail: `${p.title} is ${p.state} with ${slots.length} unfilled image slot${slots.length === 1 ? "" : "s"}` });
			if (p.state === "mr-open" && days(p.stateChangedAt) >= 7) findings.push({ key: `stale-mr:${p._id}`, kind: "reality", status: "FAIL", detail: `${p.title} approved ${days(p.stateChangedAt)} days ago and still not live`, ledger: { title: `Merge or close the MR · ${p.title}`, downstream: `Approved ${days(p.stateChangedAt)} days ago, not live`, postId: p._id } });
		}
		for (const p of posts.filter((x) => x.state === "in-review" && days(x.stateChangedAt) >= 7)) findings.push({ key: `review:${p._id}`, kind: "progress", status: "BEHIND", detail: `${p.title} waiting in review ${days(p.stateChangedAt)} days`, ledger: { title: `Review ${p.title}`, downstream: `In review ${days(p.stateChangedAt)} days`, postId: p._id } });

		// A · contract: every scheduled run happened.
		// Last run per kind from the run log (manual and scheduled both count), excluding this sweep's own row.
		const recentRuns = await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId)).order("desc").take(300);
		const lastOf = (kind: string) => recentRuns.find((r) => r.kind === kind && r.status !== "running" && r.status !== "queued" && r.status !== "refused-over-cap")?.startedAt;
		for (const s of await ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", siteId)).take(20)) {
			const period = PERIOD[s.rule.split(":")[0] ?? ""];
			if (!s.enabled || !period || s.kind === "qa-sweep") continue;
			const last = Math.max(lastOf(s.kind) ?? 0, s.lastRunAt ?? 0) || site.createdAt;
			if (now - last > period * 2) findings.push({ key: `missing:${s.kind}`, kind: "contract", status: "MISSING", detail: `${s.label} hasn't run in ${days(last)} days (${s.cadence})` });
		}
		const runs = await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId).gte("startedAt", now - 7 * DAY)).take(200);
		const failed = runs.filter((r) => r.status === "failed");
		if (failed.length) findings.push({ key: "runs-failed", kind: "contract", status: "FAIL", detail: `${failed.length} run${failed.length === 1 ? "" : "s"} failed this week (${[...new Set(failed.map((r) => r.kind))].join(", ")})` });
		else findings.push({ key: "runs-ok", kind: "contract", status: "PASS", detail: `${runs.length} run${runs.length === 1 ? "" : "s"} this week, none failed` });

		// D · progress against cadence.
		const liveLast30 = posts.filter((p) => p.liveAt && now - p.liveAt <= 30 * DAY).length;
		const target = Math.round(site.cadenceTarget * 30 / 7);
		findings.push({ key: "cadence", kind: "progress", status: liveLast30 >= target ? (liveLast30 > target * 1.25 ? "AHEAD" : "ON TRACK") : "BEHIND", detail: `${liveLast30} posts live in 30 days vs a target of ${target}` });

		// E · the human ledger, aged.
		const open = await ctx.db.query("ledgerItems").withIndex("by_site_done", (q) => q.eq("siteId", siteId).eq("done", false)).take(300);
		const ages = open.map((l) => days(l.createdAt));
		const overdue = ages.filter((a) => ledgerStatus(a) === "overdue").length;
		const blockers = ages.filter((a) => ledgerStatus(a) === "blocker").length;
		if (blockers) findings.push({ key: "ledger-blockers", kind: "ledger", status: "FAIL", detail: `${blockers} ledger item${blockers === 1 ? " is" : "s are"} 14+ days old (blockers)` });
		const existingKeys = new Set(open.map((l) => l.dedupeKey).filter(Boolean));
		for (const f of findings) if (f.ledger && existingKeys.has(`qa:${f.key}`)) delete f.ledger; // already on the ledger
		const counts: Record<string, number> = { total: findings.length };
		for (const f of findings) counts[f.status] = (counts[f.status] ?? 0) + 1;
		counts.needAction = findings.filter((f) => f.status === "FAIL" || f.status === "MISSING" || f.status === "BEHIND").length;
		return { digest: { siteName: site.name, mode, counts, findings, ledger: { open: open.length, overdue, blockers, oldestDays: ages.length ? Math.max(...ages) : 0 }, cadence: { target, liveLast30 } }, modelRouting: site.modelRouting };
	},
});

export const refreshInputs = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const live = await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(500);
		const posts = [];
		for (const p of live) {
			const kw = await ctx.db.get(p.keywordId);
			posts.push({ id: p._id as string, title: p.title, text: p.blocks.map((b) => b.text).join(" "), position: kw && kw.siteId === siteId ? kw.position : null, decaying: !!kw?.decaying, impressions: kw?.impressions ?? 0 });
		}
		return { posts, gsc: site.searchConsole === "connected" };
	},
});
