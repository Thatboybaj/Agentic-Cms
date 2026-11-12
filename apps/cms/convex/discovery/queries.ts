// Site discovery screens (prd-site-discovery §9, F25–F27): everything the report, onboarding card, Plan banner and
// Settings section read, plus the person-driven actions (accept/edit the profile, answer the interview, send refresh
// candidates, change the settings). Access through the site wrappers: plan.view reads, discovery.* writes.
import { v } from "convex/values";
import { DISCOVERY_DEFAULTS, DISCOVERY_MAX_PAGES_CAP } from "../../src/lib/logic";
import type { Doc } from "../_generated/dataModel";
import { audit } from "../lib/audit";
import { siteMutation, siteQuery } from "../lib/functions";
import { readinessOf } from "../lib/readiness";
import { releaseWaiting } from "../posts";
import { pagesOf, settingsOf } from "./data";
import { discoveryBlocked, startDiscovery } from "./run";

/** The seven questions from the seo-action-plan skill's discovery interview (§11 fallback). */
export const INTERVIEW_QUESTIONS = [
	"What does the business sell, at what price point, and where?",
	"What 3–5 services, features or angles can competitors not easily copy?",
	"Who buys, and who influences the decision?",
	"How many posts a week can the team sustain, and who reviews them?",
	"What's the monthly budget ceiling for SEO tools?",
	"Is the domain new or established? Any current rankings or traffic?",
	"Name 2–3 competitors (or say if we should find them).",
] as const;

const profileView = (p: Doc<"siteProfiles">) => ({
	version: p.version,
	confidence: p.confidence,
	sells: p.sells,
	offerings: p.offerings,
	audience: p.audience,
	regions: p.regions,
	pricePositioning: p.pricePositioning ?? null,
	differentiators: p.differentiators,
	competitorsNamed: p.competitorsNamed,
	regulated: p.regulated,
	blogCoverage: p.blogCoverage,
	brandPack: p.brandPackDraft,
	gaps: p.gaps,
	accepted: p.acceptedAt ? { at: p.acceptedAt } : null,
	createdAt: p.createdAt,
});

/** Everything the discovery surfaces show, in one reactive read. */
export const overview = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const site = ctx.access.site;
		const reports = await ctx.db.query("discoveryReports").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(20);
		const latest = reports[0] ?? null;
		const run = latest ? await ctx.db.get(latest.runId) : null;
		const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const pages = await pagesOf(ctx, siteId);
		const ev = (await ctx.db.query("discoveryEvals").withIndex("by_site_created", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		const ideaIds = new Set(reports.flatMap((r) => r.ideaIds));
		const ideas = [];
		for (const id of ideaIds) {
			const p = await ctx.db.get(id);
			if (p) ideas.push({ id: p._id, title: p.title, state: p.state, ideaStatus: p.ideaStatus, contentType: p.contentType, week: p.week, waiting: p.hold?.missing ?? null, runId: p.discoveryRunId ?? null });
		}
		return {
			blocked: discoveryBlocked(),
			settings: settingsOf(site),
			readiness: await readinessOf(ctx, site),
			running: !!run && run.status === "running",
			latest: latest && {
				id: latest._id,
				status: latest.status,
				stage: latest.stage,
				mode: latest.mode,
				error: latest.error ?? null,
				coverage: latest.coverage,
				pillars: latest.pillars,
				competitorNotes: latest.competitorNotes,
				refreshCandidates: latest.refreshCandidates,
				dropped: latest.dropped,
				costUsd: run?.costUsd ?? latest.costUsd,
				estimateUsd: run?.estimateUsd ?? 0,
				progress: run?.progress ?? null,
				output: run?.output ?? "",
				startedAt: latest.createdAt,
				finishedAt: latest.finishedAt ?? null,
				ideaCount: latest.ideaIds.length,
			},
			history: reports.map((r) => ({ id: r._id, status: r.status, mode: r.mode, createdAt: r.createdAt, ideas: r.ideaIds.length, crawled: r.coverage.crawled, costUsd: r.costUsd })),
			profile: profile ? profileView(profile) : null,
			ideas: ideas.sort((a, b) => a.week - b.week),
			contentMap: pages.map((p) => ({ url: p.url, title: p.title, type: p.type ?? null, wordCount: p.wordCount, topic: p.extract?.topic ?? null, targetQuery: p.extract?.targetQuery ?? null, refresh: p.extract?.refreshCandidate ? (p.extract.refreshReason ?? "Thin or dated") : null })),
			interviewQuestions: INTERVIEW_QUESTIONS,
			needsInterview: latest?.status === "needs-interview",
			evaluation: ev ? { reportId: ev.reportId, confirmed: ev.goldenConfirmed, hash: ev.behaviourHash, checks: ev.checks, judge: ev.judge ? { mean: ev.judge.mean, passed: ev.judge.passed, model: ev.judge.model } : null, passed: ev.passed, createdAt: ev.createdAt } : null,
		};
	},
});

/**
 * Accept the profile (SD3: required before a regulated site's first draft): the brand pack draft becomes the site's
 * brand pack (voice, style keywords, the category's disclaimer). Posts waiting only for this start drafting.
 */
export const acceptProfile = siteMutation({
	permission: "discovery.run",
	args: {},
	handler: async (ctx, { siteId }) => {
		const { site, user } = ctx.access;
		const p = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		if (!p) return { ok: false as const, reason: "No site profile yet · run discovery first" };
		await ctx.db.patch(p._id, { acceptedBy: user._id, acceptedAt: Date.now() });
		const cat = p.regulated.category;
		const disclaimers = { ...site.brandPack.disclaimers, ...(cat !== "none" && p.brandPackDraft.disclaimers.length ? { [cat]: p.brandPackDraft.disclaimers.join(" ") } : {}) };
		await ctx.db.patch(siteId, { brandPack: { ...site.brandPack, voice: p.brandPackDraft.voice || site.brandPack.voice, styleKeywords: p.brandPackDraft.styleKeywords.length ? p.brandPackDraft.styleKeywords : site.brandPack.styleKeywords, disclaimers } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "accepted site profile", target: `Profile v${p.version}`, detail: cat === "none" ? "Brand pack updated" : `Brand pack updated · ${cat} disclaimer set` });
		const started = await releaseWaiting(ctx, siteId);
		return { ok: true as const, started };
	},
});

const vCited = v.object({ value: v.string(), evidence: v.array(v.string()) });

/** Edit the drafted profile before accepting it (the specialist's corrections win over the crawl). */
export const editProfile = siteMutation({
	permission: "discovery.run",
	args: { sells: v.optional(v.string()), audience: v.optional(v.string()), voice: v.optional(v.string()), styleKeywords: v.optional(v.array(v.string())), disclaimers: v.optional(v.array(v.string())), offerings: v.optional(v.array(vCited)) },
	handler: async (ctx, { siteId, ...e }) => {
		const { site, user } = ctx.access;
		const p = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(1))[0];
		if (!p) return { ok: false as const, reason: "No site profile yet" };
		const clean = (s: string) => s.trim().slice(0, 2000);
		await ctx.db.patch(p._id, {
			...(e.sells !== undefined ? { sells: { ...p.sells, value: clean(e.sells) } } : {}),
			...(e.audience !== undefined ? { audience: { ...p.audience, value: clean(e.audience) } } : {}),
			...(e.offerings ? { offerings: e.offerings.slice(0, 20) } : {}),
			brandPackDraft: { ...p.brandPackDraft, ...(e.voice !== undefined ? { voice: clean(e.voice) } : {}), ...(e.styleKeywords ? { styleKeywords: e.styleKeywords.map(clean).filter(Boolean).slice(0, 12) } : {}), ...(e.disclaimers ? { disclaimers: e.disclaimers.map(clean).filter(Boolean).slice(0, 6) } : {}) },
			editedBy: user._id,
			// An edit after acceptance needs accepting again (the brand pack only changes on accept).
			acceptedAt: undefined,
			acceptedBy: undefined,
		});
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "edited site profile", target: `Profile v${p.version}` });
		return { ok: true as const };
	},
});

/** §11: the crawl couldn't read the site; the owner's answers drive profile, keywords and ideas instead. */
export const answerInterview = siteMutation({
	permission: "discovery.run",
	args: { answers: v.array(v.object({ question: v.string(), answer: v.string() })) },
	handler: async (ctx, { answers }) => {
		const filled = answers.map((a) => ({ question: a.question.slice(0, 300), answer: a.answer.trim().slice(0, 2000) })).filter((a) => a.answer);
		if (filled.length < 3) return { ok: false as const, reason: "Answer at least three questions so the profile has something to stand on" };
		return startDiscovery(ctx, ctx.access.site, { mode: "interview", trigger: "manual", user: ctx.access.user, interview: filled });
	},
});

/** F27: send refresh candidates (thin or dated pages the crawl found) to the human ledger for the refresh agent. */
export const sendRefreshCandidates = siteMutation({
	permission: "discovery.run",
	args: { urls: v.array(v.string()) },
	handler: async (ctx, { siteId, urls }) => {
		const { site, user } = ctx.access;
		const pages = new Map((await pagesOf(ctx, siteId)).map((p) => [p.url, p]));
		let n = 0;
		for (const url of urls.slice(0, 50)) {
			const p = pages.get(url);
			if (!p?.extract?.refreshCandidate) continue;
			const dedupeKey = `refresh-candidate:${url}`;
			const open = await ctx.db.query("ledgerItems").withIndex("by_site_dedupe", (q) => q.eq("siteId", siteId).eq("dedupeKey", dedupeKey)).first();
			if (open && !open.done) continue;
			await ctx.db.insert("ledgerItems", { siteId, title: `Refresh: ${p.title}`, owner: "Content specialist", ownerUserId: user._id, createdAt: Date.now(), downstream: `${new URL(url).pathname} · ${p.extract.refreshReason ?? "thin or dated"} (from site discovery)`, origin: "system", dedupeKey, done: false });
			n++;
		}
		if (n) await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "sent refresh candidates", target: `${n} page${n === 1 ? "" : "s"}`, detail: "To the human ledger for the content-refresh agent" });
		return { ok: true as const, sent: n };
	},
});

/** Discovery settings (F1, F6, F17, SD5): admin only. */
export const setSettings = siteMutation({
	permission: "discovery.configure",
	args: { onAdd: v.boolean(), maxPages: v.number(), depth: v.number(), exclude: v.array(v.string()), subdomains: v.boolean(), competitorCheck: v.boolean(), batchSize: v.number() },
	handler: async (ctx, { siteId, ...s }) => {
		const { site, user } = ctx.access;
		if (!Number.isInteger(s.maxPages) || s.maxPages < 5 || s.maxPages > DISCOVERY_MAX_PAGES_CAP) return { ok: false as const, reason: `Page limit is 5 to ${DISCOVERY_MAX_PAGES_CAP}` };
		if (!Number.isInteger(s.depth) || s.depth < 1 || s.depth > 6) return { ok: false as const, reason: "Depth is 1 to 6 folders" };
		if (!Number.isInteger(s.batchSize) || s.batchSize < 0 || s.batchSize > 40) return { ok: false as const, reason: "Batch size is 0 (four weeks at your cadence) to 40" };
		const exclude = [...new Set(s.exclude.map((x) => x.trim()).filter(Boolean))].slice(0, 30);
		await ctx.db.patch(siteId, { discovery: { ...s, exclude } });
		const changed = (Object.keys(DISCOVERY_DEFAULTS) as (keyof typeof DISCOVERY_DEFAULTS)[]).filter((k) => JSON.stringify(settingsOf(site)[k]) !== JSON.stringify({ ...s, exclude }[k]));
		if (changed.length) await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "changed discovery settings", target: site.domain, detail: changed.join(", ") });
		return { ok: true as const };
	},
});
