// Site discovery eval data (prd-site-discovery §13): what the grader reads for one report, where results are stored,
// and the latest result for the report screen. The grading itself is in evalCore (pure) and evalRun (judge call).
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { siteQuery } from "../lib/functions";
import { pagesOf } from "./data";

/** Everything the graded checks and the judge need for one discovery report (the latest finished one by default). */
export const evalInput = internalQuery({
	args: { siteId: v.id("sites"), reportId: v.optional(v.id("discoveryReports")) },
	handler: async (ctx, { siteId, reportId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const report = reportId
			? await ctx.db.get(reportId)
			: (await ctx.db.query("discoveryReports").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(10)).find((r) => r.finishedAt);
		if (!report || report.siteId !== siteId) return null;
		const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const ideas = [];
		for (const id of report.ideaIds) {
			const p = await ctx.db.get(id);
			if (!p) continue;
			const kw = await ctx.db.get(p.keywordId);
			ideas.push({ title: p.title, keyword: kw?.term ?? "", evidence: p.discoveryEvidence ?? [], internalLinks: p.internalLinkTargets ?? [], angle: p.angle ?? "" });
		}
		return {
			domain: site.domain,
			siteName: site.name,
			routing: site.modelRouting,
			reportId: report._id,
			status: report.status,
			pillars: report.pillars.map((p) => p.name),
			ideas,
			crawled: (await pagesOf(ctx, siteId)).map((p) => p.url),
			pages: (await pagesOf(ctx, siteId)).map((p) => `${p.url} · ${p.title}${p.extract ? ` · ${p.extract.topic}` : ""}`),
			offerings: profile?.offerings.map((o) => o.value) ?? [],
			profileCategory: profile?.regulated.category ?? null,
			disclaimers: profile?.brandPackDraft.disclaimers ?? [],
			sells: profile?.sells.value ?? "",
			audience: profile?.audience.value ?? "",
		};
	},
});

const vCheck = v.object({ id: v.string(), label: v.string(), passed: v.boolean(), score: v.number(), detail: v.string() });
const vJudge = v.object({ model: v.string(), mean: v.number(), passed: v.boolean(), ideas: v.array(v.object({ title: v.string(), score: v.number(), reason: v.string() })), costUsd: v.number() });

export const saveEval = internalMutation({
	args: { siteId: v.id("sites"), reportId: v.id("discoveryReports"), goldenId: v.string(), goldenConfirmed: v.boolean(), behaviourHash: v.string(), models: v.string(), checks: v.array(vCheck), judge: v.optional(vJudge), passed: v.boolean() },
	handler: async (ctx, a) => ctx.db.insert("discoveryEvals", { ...a, createdAt: Date.now() }),
});

/** The most recent eval for this site (Coverage & history tab). */
export const latest = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const e = (await ctx.db.query("discoveryEvals").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		return e ? { reportId: e.reportId, goldenId: e.goldenId, confirmed: e.goldenConfirmed, hash: e.behaviourHash, models: e.models, checks: e.checks, judge: e.judge ?? null, passed: e.passed, createdAt: e.createdAt } : null;
	},
});
