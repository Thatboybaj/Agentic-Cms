// Site discovery agent steps, persistence (prd-site-discovery §6.3–6.5, §8): what each step reads, and the one
// mutation per step that writes its result, so a crashed run resumes from the last finished step.
import { v } from "convex/values";
import { discoveryBatchSize } from "../../src/lib/logic";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { audit } from "../lib/audit";
import { notify, siteAudienceWith } from "../lib/notify";
import { isoWeek } from "../posts";
import { scheduleBackfill } from "../gsc";
import { ideasSummary } from "./agentCore";
import { pagesOf, settingsOf } from "./data";

const summaryOf = (p: Doc<"crawledPages">) => ({ url: p.url, type: p.type ?? "other", title: p.title, topic: p.extract?.topic ?? "", ...(p.extract?.targetQuery ? { targetQuery: p.extract.targetQuery } : {}), funnel: p.extract?.funnel ?? "awareness", refreshCandidate: p.extract?.refreshCandidate ?? false, wordCount: p.wordCount });

// ─── Extract ─────────────────────────────────────────────────────────────────

/** Pages whose current text hasn't been extracted yet (F3: unchanged pages keep their extract). */
export const extractInput = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pages = (await pagesOf(ctx, siteId)).filter((p) => p.textStorageId && (!p.extract || p.extract.hash !== p.hash));
		return { routing: site.modelRouting, pages: pages.map((p) => ({ id: p._id, url: p.url, title: p.title, outline: p.outline, textStorageId: p.textStorageId! })) };
	},
});

const vExtract = v.object({ id: v.id("crawledPages"), type: v.string(), topic: v.string(), entities: v.array(v.string()), targetQuery: v.string(), funnel: v.string(), refreshCandidate: v.boolean(), refreshReason: v.string() });
const PAGE_TYPES = new Set(["home", "service", "product", "blog-post", "category", "location", "about", "contact", "legal", "other"]);
const FUNNELS = new Set(["awareness", "consideration", "decision"]);

export const saveExtracts = internalMutation({
	args: { items: v.array(vExtract) },
	handler: async (ctx, { items }) => {
		for (const x of items) {
			const p = await ctx.db.get(x.id);
			if (!p) continue;
			await ctx.db.patch(x.id, {
				type: (PAGE_TYPES.has(x.type) ? x.type : "other") as Doc<"crawledPages">["type"],
				extract: { topic: x.topic.slice(0, 200), entities: x.entities.slice(0, 20).map((e) => e.slice(0, 80)), ...(x.targetQuery.trim() ? { targetQuery: x.targetQuery.trim().slice(0, 120) } : {}), funnel: (FUNNELS.has(x.funnel) ? x.funnel : "awareness") as "awareness", refreshCandidate: x.refreshCandidate, ...(x.refreshReason.trim() ? { refreshReason: x.refreshReason.trim().slice(0, 200) } : {}), hash: p.hash },
			});
		}
	},
});

/** Run stage for progress cards and the report. */
export const setStage = internalMutation({
	args: { runId: v.id("runs"), reportId: v.id("discoveryReports"), stage: v.string(), output: v.string() },
	handler: async (ctx, { runId, reportId, stage, output }) => {
		await ctx.db.patch(runId, { stage, output });
		await ctx.db.patch(reportId, { stage });
	},
});

// ─── Profile ─────────────────────────────────────────────────────────────────

export const profileInput = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pages = await pagesOf(ctx, siteId);
		// The highest-signal pages go in full: home, services/products, about; then the longest others.
		const RANK: Record<string, number> = { home: 0, service: 1, product: 1, about: 2, category: 3, location: 3, "blog-post": 4 };
		const rank = (p: Doc<"crawledPages">) => RANK[p.type ?? "other"] ?? 5;
		const top = [...pages].filter((p) => p.textStorageId).sort((a, b) => rank(a) - rank(b) || b.wordCount - a.wordCount).slice(0, 8);
		const latest = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		return { siteName: site.name, domain: site.domain, industry: site.industry, routing: site.modelRouting, extracts: pages.map(summaryOf), contentPages: pages.filter((p) => p.wordCount >= 150).length, top: top.map((p) => ({ url: p.url, title: p.title, outline: p.outline, textStorageId: p.textStorageId! })), nextVersion: (latest?.version ?? 0) + 1, interview: latest?.interview ?? null };
	},
});

const vCited = v.object({ value: v.string(), evidence: v.array(v.string()) });
export const vProfile = v.object({
	sells: vCited,
	offerings: v.array(vCited),
	audience: vCited,
	regions: v.array(vCited),
	pricePositioning: vCited,
	differentiators: v.array(vCited),
	competitorsNamed: v.array(vCited),
	regulated: v.object({ category: v.union(v.literal("health"), v.literal("finance"), v.literal("legal"), v.literal("none")), evidence: v.array(v.string()) }),
	blogCoverage: v.array(vCited),
	brandPack: v.object({ voice: v.string(), voiceExamples: v.array(vCited), styleKeywords: v.array(v.string()), disclaimers: v.array(v.string()) }),
	gaps: v.array(v.string()),
});

export const saveProfile = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), version: v.number(), lowConfidence: v.boolean(), profile: vProfile },
	handler: async (ctx, { siteId, runId, version, lowConfidence, profile: p }) => {
		const existing = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId).eq("version", version)).take(1))[0];
		if (existing) return existing._id; // replayed step
		const prev = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		return ctx.db.insert("siteProfiles", {
			siteId,
			runId,
			version,
			confidence: lowConfidence ? "low" : "normal",
			sells: p.sells,
			offerings: p.offerings,
			audience: p.audience,
			regions: p.regions,
			...(p.pricePositioning.value.trim() ? { pricePositioning: p.pricePositioning } : {}),
			differentiators: p.differentiators,
			competitorsNamed: p.competitorsNamed,
			regulated: p.regulated,
			blogCoverage: p.blogCoverage,
			brandPackDraft: p.brandPack,
			gaps: p.gaps,
			...(prev?.interview ? { interview: prev.interview } : {}),
			createdAt: Date.now(),
		});
	},
});

// ─── Keywords ────────────────────────────────────────────────────────────────

export const keywordInput = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return null;
		const pages = await pagesOf(ctx, siteId);
		const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(2000);
		const rejected = (await ctx.db.query("posts").withIndex("by_site_idea", (q) => q.eq("siteId", siteId).eq("ideaStatus", "rejected")).take(300)).map((p) => p.title);
		return {
			siteName: site.name,
			domain: site.domain,
			routing: site.modelRouting,
			searchConsole: site.searchConsole,
			competitorCheck: settingsOf(site).competitorCheck,
			profileJson: profile ? JSON.stringify({ sells: profile.sells.value, offerings: profile.offerings.map((o) => o.value), audience: profile.audience.value, regions: profile.regions.map((r) => r.value), differentiators: profile.differentiators.map((d) => d.value), regulated: profile.regulated.category, blogCoverage: profile.blogCoverage.map((b) => b.value) }) : "{}",
			extracts: pages.map(summaryOf),
			pageTargets: pages.map((p) => ({ url: p.url, title: p.title, ...(p.extract?.targetQuery ? { targetQuery: p.extract.targetQuery } : {}) })),
			existingKeywords: keywords.map((k) => k.termNormalized),
			rejected,
		};
	},
});

const vPlannedKeyword = v.object({ term: v.string(), intent: v.string(), funnel: v.string(), volumeTier: v.string(), volumeSource: v.string(), impressions: v.number(), position: v.union(v.number(), v.null()), quickWin: v.boolean(), existingPageUrl: v.optional(v.string()), evidence: v.array(v.string()) });
const vPlannedPillar = v.object({ name: v.string(), why: v.string(), evidence: v.array(v.string()), keywords: v.array(vPlannedKeyword) });

/** Writes pillars and keywords into the plan (new ones only: a re-run never edits or deletes, F3) and the report. */
export const savePlan = internalMutation({
	args: { siteId: v.id("sites"), reportId: v.id("discoveryReports"), pillars: v.array(vPlannedPillar), competitorNotes: v.array(v.object({ keyword: v.string(), ranking: v.array(v.string()), difficulty: v.string() })), dropped: v.array(v.string()) },
	handler: async (ctx, { siteId, reportId, pillars, competitorNotes, dropped }) => {
		const site = (await ctx.db.get(siteId))!;
		const existingPillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const pages = await pagesOf(ctx, siteId);
		const pageBy = new Map(pages.map((p) => [p.url, p._id]));
		const difficultyOf = new Map(competitorNotes.map((n) => [n.keyword, n.difficulty]));
		for (const p of pillars) {
			let pillarId = existingPillars.find((x) => x.name.toLowerCase() === p.name.toLowerCase())?._id;
			if (!pillarId) pillarId = await ctx.db.insert("pillars", { workspaceId: site.workspaceId, siteId, name: p.name, plannedPosts: 0, livePosts: 0, kasShare: 0, claimedButUnearned: false });
			for (const k of p.keywords) {
				const dupe = (await ctx.db.query("keywords").withIndex("by_site_term", (q) => q.eq("siteId", siteId).eq("termNormalized", k.term)).take(1))[0];
				if (dupe) continue;
				const d = difficultyOf.get(k.term);
				const existingPageId = k.existingPageUrl ? pageBy.get(k.existingPageUrl) : undefined;
				await ctx.db.insert("keywords", {
					workspaceId: site.workspaceId,
					siteId,
					pillarId,
					term: k.term,
					termNormalized: k.term,
					intent: k.intent as Doc<"keywords">["intent"],
					difficulty: d === "high" ? 70 : d === "medium" ? 40 : d === "low" ? 15 : 0,
					difficultyEvidence: d ? `${d} · from who ranks (site discovery)` : "Not checked · no competitor search for this keyword",
					impressions: k.impressions,
					position: k.position,
					positionTrend: [],
					kasShare: 0,
					kasDelta: 0,
					rankingUrl: k.existingPageUrl ? new URL(k.existingPageUrl).pathname : null,
					rankingPages: k.existingPageUrl ? 1 : 0,
					decaying: false,
					evidence: k.evidence,
					volumeSource: k.volumeSource as "gsc" | "import" | "estimate",
					volumeTier: k.volumeTier as "low" | "medium" | "high",
					funnel: k.funnel as "awareness" | "consideration" | "decision",
					quickWin: k.quickWin,
					...(existingPageId ? { existingPageId } : {}),
				});
			}
		}
		const report = await ctx.db.get(reportId);
		const refreshCandidates = pages.filter((p) => p.extract?.refreshCandidate).map((p) => ({ url: p.url, reason: p.extract?.refreshReason ?? "Thin or dated" }));
		await ctx.db.patch(reportId, {
			pillars: pillars.map((p) => ({ name: p.name, why: p.why, evidence: p.evidence, keywords: p.keywords.map((k) => ({ term: k.term, intent: k.intent, funnel: k.funnel, volume: k.volumeSource === "gsc" ? `${k.impressions} impressions` : `${k.volumeTier} (estimated)`, volumeSource: k.volumeSource, quickWin: k.quickWin, ...(k.existingPageUrl ? { existingPageUrl: k.existingPageUrl } : {}), evidence: k.evidence })) })),
			competitorNotes,
			refreshCandidates,
			dropped: [...(report?.dropped ?? []), ...dropped].slice(0, 200),
		});
	},
});

// ─── Ideas ───────────────────────────────────────────────────────────────────

export const ideasInput = internalQuery({
	args: { siteId: v.id("sites"), reportId: v.id("discoveryReports") },
	handler: async (ctx, { siteId, reportId }) => {
		const site = await ctx.db.get(siteId);
		const report = await ctx.db.get(reportId);
		if (!site || !report) return null;
		const pages = await pagesOf(ctx, siteId);
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(2000);
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(2000);
		const used = new Set(posts.map((p) => p.keywordId));
		const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const contentPages = pages.filter((p) => p.wordCount >= 150).length;
		return {
			siteName: site.name,
			routing: site.modelRouting,
			profileJson: profile ? JSON.stringify({ sells: profile.sells.value, audience: profile.audience.value, voice: profile.brandPackDraft.voice, regulated: profile.regulated.category, disclaimers: profile.brandPackDraft.disclaimers }) : "{}",
			extracts: pages.map(summaryOf),
			pillars: report.pillars,
			crawled: pages.map((p) => p.url),
			pageTitles: pages.map((p) => p.title),
			existingTitles: posts.filter((p) => p.ideaStatus !== "rejected").map((p) => p.title),
			existingKeywords: keywords.filter((k) => used.has(k._id)).map((k) => k.termNormalized),
			seen: report.competitorNotes.flatMap((n) => n.ranking),
			batchSize: discoveryBatchSize(site, settingsOf(site), contentPages),
			hasGsc: site.searchConsole === "connected",
		};
	},
});

const vIdea = v.object({ title: v.string(), keyword: v.string(), secondaryKeywords: v.array(v.string()), intent: v.string(), pillar: v.string(), contentType: v.union(v.literal("pillar"), v.literal("guide"), v.literal("money-page")), weekOffset: v.number(), internalLinks: v.array(v.string()), angle: v.string(), evidence: v.array(v.string()), quickWin: v.boolean() });

/** Ideas enter the plan as posts in Idea, source site-discovery (F21): approval as for every idea (C10). */
export const saveIdeas = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports"), ideas: v.array(vIdea), dropped: v.array(v.string()) },
	handler: async (ctx, { siteId, runId, reportId, ideas, dropped }): Promise<Id<"posts">[]> => {
		const site = (await ctx.db.get(siteId))!;
		const report = (await ctx.db.get(reportId))!;
		if (report.ideaIds.length) return report.ideaIds; // replayed step
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const now = Date.now();
		const week = isoWeek(now);
		const ids: Id<"posts">[] = [];
		const added = new Map<Id<"pillars">, number>();
		for (const i of ideas) {
			const pillar = pillars.find((p) => p.name.toLowerCase() === i.pillar.toLowerCase());
			if (!pillar) continue;
			let keywordId = (await ctx.db.query("keywords").withIndex("by_site_term", (q) => q.eq("siteId", siteId).eq("termNormalized", i.keyword)).take(1))[0]?._id;
			if (!keywordId) keywordId = await ctx.db.insert("keywords", { workspaceId: site.workspaceId, siteId, pillarId: pillar._id, term: i.keyword, termNormalized: i.keyword, intent: i.intent as Doc<"keywords">["intent"], difficulty: 0, difficultyEvidence: "Not checked · pillar page keyword", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false, evidence: i.evidence, volumeSource: "estimate" });
			const slug = i.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
			const strong = i.contentType !== "guide";
			ids.push(
				await ctx.db.insert("posts", {
					workspaceId: site.workspaceId, siteId, slug, title: i.title, seoTitle: i.title, keywordId, pillarId: pillar._id, intent: i.intent as Doc<"posts">["intent"], contentType: i.contentType,
					source: "site-discovery", state: "idea", stateChangedAt: now, owner: "human", week: week + i.weekOffset, strongModel: strong, words: 0, wordTarget: i.contentType === "pillar" ? 2500 : 1500, blocks: [], currentVersion: 0,
					ideaApproval: { status: "pending" }, ideaStatus: "pending", discoveryEvidence: i.evidence, angle: i.angle, secondaryKeywords: i.secondaryKeywords, internalLinkTargets: i.internalLinks, discoveryRunId: runId, createdAt: now, updatedAt: now,
				}),
			);
			added.set(pillar._id, (added.get(pillar._id) ?? 0) + 1);
		}
		for (const [id, n] of added) {
			const p = await ctx.db.get(id);
			if (p) await ctx.db.patch(id, { plannedPosts: p.plannedPosts + n });
		}
		await ctx.db.patch(reportId, { ideaIds: ids, dropped: [...report.dropped, ...dropped].slice(0, 200) });
		await scheduleBackfill(ctx, siteId); // the new keywords' Search Console history
		return ids;
	},
});

// ─── Finish ──────────────────────────────────────────────────────────────────

export interface IFinish {
	siteId: Id<"sites">;
	runId: Id<"runs">;
	reportId: Id<"discoveryReports">;
	status: "succeeded" | "failed" | "needs-interview";
	output: string;
	error?: string;
}

/** Settles the run, writes the report status, tells the people who approve ideas (§7.2 step 7). Idempotent. */
export async function finishDiscovery(ctx: MutationCtx, a: IFinish) {
		const site = await ctx.db.get(a.siteId);
		const run = await ctx.db.get(a.runId);
		const report = await ctx.db.get(a.reportId);
		if (!site || !run || !report || report.finishedAt) return;
		const now = Date.now();
		await ctx.db.patch(a.runId, { status: a.status === "succeeded" ? "succeeded" : "failed", finishedAt: now, stage: "finish", output: a.output, ...(a.error ? { error: a.error } : {}) });
		await ctx.db.patch(a.reportId, { status: a.status, stage: "finish", finishedAt: now, costUsd: run.costUsd, ...(a.error ? { error: a.error } : {}) });
		const n = report.ideaIds.length;
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: { system: "Site discovery agent" }, action: a.status === "succeeded" ? "finished site discovery" : "site discovery stopped", target: site.domain, detail: a.status === "succeeded" ? `${report.coverage.crawled} pages · ${ideasSummary(n, report.pillars.length)} · $${run.costUsd.toFixed(2)}` : (a.error ?? a.output) });
		const audience = await siteAudienceWith(ctx, site, "idea.approve");
		if (a.status === "succeeded" && n) await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: audience, tone: "human", title: `${n} idea${n === 1 ? "" : "s"} from site discovery ready to approve`, body: `${report.pillars.length} pillars from ${report.coverage.crawled} pages of ${site.domain}`, href: "/plan" });
		else if (a.status !== "succeeded") await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: audience, tone: a.status === "needs-interview" ? "human" : "block", title: a.status === "needs-interview" ? `Site discovery needs a few answers about ${site.name}` : `Site discovery stopped on ${site.domain}`, body: a.error ?? a.output, href: "/discovery" });
}

export const finish = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports"), status: v.union(v.literal("succeeded"), v.literal("failed"), v.literal("needs-interview")), output: v.string(), error: v.optional(v.string()) },
	handler: async (ctx, a) => finishDiscovery(ctx, a),
});

/** "Generate more ideas" (F27): this run reuses the latest finished run's pillars and keywords; only ideas are new. */
export const copyPlan = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports") },
	handler: async (ctx, { siteId, reportId }) => {
		const prev = (await ctx.db.query("discoveryReports").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(20)).find((r) => r._id !== reportId && r.status === "succeeded" && r.pillars.length);
		if (!prev) return;
		await ctx.db.patch(reportId, { pillars: prev.pillars, competitorNotes: prev.competitorNotes, refreshCandidates: prev.refreshCandidates, coverage: prev.coverage });
	},
});
