// Scheduled agents that run on Search Console data (handoff 07 → 03's monitor/report): no model, no spend.
//   technical-monitor: URL Inspection API for the site's live posts → indexing verdicts; problems on the ledger.
//   biweekly-report:   an edition from real numbers (impressions, cadence, KAS concentration) + pivot triggers.
// Without a connected property both return their data gap (pipeline/steps.runKindStep keeps the text).
import { v } from "convex/values";
import { FRAGILE_THRESHOLD } from "../src/lib/logic";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { accessToken } from "./gsc";
import { vRunArtifact, type TRunArtifact } from "./pipeline/steps";

const DAY = 86_400_000;
const none: TRunArtifact["ideas"] = [];

export const livePosts = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const posts = await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(200);
		const urls = [];
		for (const p of posts) {
			const kw = await ctx.db.get(p.keywordId);
			const path = kw?.rankingUrl && kw.rankingUrl.startsWith("/") ? kw.rankingUrl : `/blog/${p.slug}`;
			urls.push({ postId: p._id, title: p.title, url: `https://${site.domain}${path}` });
		}
		return { domain: site.domain, urls: urls.slice(0, 40) };
	},
});

export const monitor = internalAction({
	args: { siteId: v.id("sites") },
	returns: vRunArtifact,
	handler: async (ctx, { siteId }): Promise<TRunArtifact> => {
		const t = await accessToken(ctx, siteId);
		if (!t?.propertyUri) return { status: "succeeded", output: "Data gap: Search Console not connected · no health checked", ideas: none };
		const d = await ctx.runQuery(internal.gscAgents.livePosts, { siteId });
		if (!d || !d.urls.length) return { status: "succeeded", output: "No live posts to inspect yet", ideas: none };
		const issues: { postId: (typeof d.urls)[number]["postId"]; title: string; why: string }[] = [];
		let ok = 0;
		for (const u of d.urls) {
			const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { method: "POST", headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ inspectionUrl: u.url, siteUrl: t.propertyUri }) });
			if (res.status === 429) break; // daily quota: inspect the rest next run
			if (!res.ok) continue;
			const r = (await res.json()) as { inspectionResult?: { indexStatusResult?: { verdict?: string; coverageState?: string; robotsTxtState?: string; pageFetchState?: string } } };
			const s = r.inspectionResult?.indexStatusResult;
			if (!s) continue;
			if (s.verdict === "PASS") ok++;
			else issues.push({ postId: u.postId, title: u.title, why: [s.coverageState, s.pageFetchState && s.pageFetchState !== "SUCCESSFUL" ? `fetch ${s.pageFetchState}` : "", s.robotsTxtState === "DISALLOWED" ? "blocked by robots.txt" : ""].filter(Boolean).join(" · ") || "Not indexed" });
		}
		const checked = ok + issues.length;
		const digest = [`# Technical monitor · ${d.domain}`, "", `${checked} live URL${checked === 1 ? "" : "s"} inspected · ${ok} indexed · ${issues.length} with issues`, "", ...issues.map((i) => `- **${i.title}** · ${i.why} · who fixes it: developer`)].join("\n");
		return {
			status: "succeeded",
			output: `Health ${checked ? Math.round((ok / checked) * 100) : 0}% indexed · ${issues.length} issue${issues.length === 1 ? "" : "s"} (${checked} URLs inspected)`,
			ideas: none,
			ledger: issues.map((i) => ({ key: `monitor:${i.postId}`, title: `Fix indexing · ${i.title}`, downstream: i.why.slice(0, 200), postId: i.postId })),
			artifacts: [{ kind: "digest_md", content: digest }],
		};
	},
});

export const reportData = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site || site.searchConsole !== "connected") return null;
		const weeks = (await ctx.db.query("trafficWeekly").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).order("desc").take(4)).reverse();
		const kas = (await ctx.db.query("kasSnapshots").withIndex("by_site_at", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0] ?? null;
		const shipped = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(1000)).filter((p) => p.liveAt && Date.now() - p.liveAt <= 14 * DAY).length;
		const last = (await ctx.db.query("reports").withIndex("by_site_n", (q) => q.eq("siteId", siteId)).order("desc").take(2));
		return { name: site.name, cadence: site.cadenceTarget, weeks: weeks.map((w) => ({ week: w.isoWeek, impressions: w.impressions })), concentration: kas?.concentration ?? null, shipped, n: (last[0]?.n ?? 0) + 1, previousPivots: last.map((r) => r.pivotTriggers.length) };
	},
});

export const report = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	returns: vRunArtifact,
	handler: async (ctx, { siteId, runId }): Promise<TRunArtifact> => {
		const d = await ctx.runQuery(internal.gscAgents.reportData, { siteId });
		if (!d) return { status: "succeeded", output: "Data gap: the report needs Search Console data · nothing drafted", ideas: none };
		const known = d.weeks.filter((w) => w.impressions !== null) as { week: string; impressions: number }[];
		if (known.length < 2) return { status: "succeeded", output: "Data gap: fewer than two weeks of Search Console data · nothing drafted", ideas: none };
		const recent = known.slice(-2).reduce((n, w) => n + w.impressions, 0);
		const prior = known.length >= 4 ? known.slice(0, 2).reduce((n, w) => n + w.impressions, 0) : null;
		const change = prior ? Math.round(((recent - prior) / prior) * 100) : null;
		const pivots: string[] = [];
		if (d.concentration !== null && d.concentration > FRAGILE_THRESHOLD) pivots.push(`Concentration ${d.concentration}%: the top 5 keywords carry the score (fragile above ${FRAGILE_THRESHOLD}%)`);
		if (change !== null && change <= -20) pivots.push(`Impressions down ${Math.abs(change)}% on the previous fortnight`);
		if (d.shipped < d.cadence * 2) pivots.push(`${d.shipped} post${d.shipped === 1 ? "" : "s"} shipped in 14 days vs a cadence of ${d.cadence * 2}`);
		const headline = `${recent.toLocaleString("en")} impressions in the last 2 weeks${change !== null ? ` (${change >= 0 ? "+" : ""}${change}%)` : ""} · ${d.shipped} post${d.shipped === 1 ? "" : "s"} shipped`;
		await ctx.runMutation(internal.gscAgents.writeReport, { siteId, runId, n: d.n, headline, pivots });
		// Two consecutive editions with pivot triggers → the action plan is reviewed (escalation rule 3).
		const escalate = pivots.length > 0 && (d.previousPivots[0] ?? 0) > 0;
		return {
			status: "succeeded",
			output: `Edition ${d.n} · ${headline}${pivots.length ? ` · ${pivots.length} pivot trigger${pivots.length === 1 ? "" : "s"}` : ""}`,
			ideas: none,
			...(escalate ? { ledger: [{ key: `pivot-review:${siteId}:${d.n}`, title: "Review the SEO action plan", downstream: "Two reports in a row fired pivot triggers" }] } : {}),
			artifacts: [{ kind: "report_md", content: [`# ${d.name} · report ${d.n}`, "", headline, "", ...(pivots.length ? ["## Pivot triggers", ...pivots.map((p) => `- ${p}`)] : ["No pivot triggers this edition."])].join("\n") }],
		};
	},
});

export const writeReport = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), n: v.number(), headline: v.string(), pivots: v.array(v.string()) },
	handler: async (ctx, { siteId, runId, n, headline, pivots }) => {
		const now = new Date();
		const from = new Date(now.getTime() - 14 * DAY);
		await ctx.db.insert("reports", { siteId, n, period: `${from.toUTCString().slice(5, 11)} – ${now.toUTCString().slice(5, 11)}`, publishedAt: Date.now(), headline, pivotTriggers: pivots, runId });
	},
});
