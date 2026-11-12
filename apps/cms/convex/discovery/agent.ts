"use node";
// Site discovery agent steps (prd-site-discovery §7.2 steps 3–6, §7.3): extract → profile → keywords → ideas. Every
// model call goes through runAgentCall → cappedInference (estimate, cap check, hold, call, settle; D7 retry then
// escalate). Tiers come from the site's modelRouting: mechanical for extraction, strategy for the profile, writing
// for keywords and ideas. Page text reaches a model only as fenced data in the user turn (§7.4).
import { MODELS } from "@studio/seo-harness";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { AgentError, type IAgentResult, runAgentCall } from "../agents/run";
import { agentsLive, modelTransport, formatFor, ledgerFor } from "../agents/sdk";
import { DISCOVERY_SKILL, EXTRACT_CONTRACT, ExtractOutput, IDEAS_CONTRACT, IdeasOutput, ideasPrompt, KEYWORD_CONTRACT, KeywordOutput, keywordPrompt, pageBlock, planKeywords, PROFILE_CONTRACT, ProfileOutput, selectIdeas, extractLine, validEvidence, type IGscQuery } from "./agentCore";
import { bareHost, normalizeUrl, USD_PER_CREDIT } from "./crawlCore";
import { FirecrawlError, searchCredits, searchWeb } from "./firecrawl";

const vStep = v.object({ ok: v.boolean(), error: v.optional(v.string()), note: v.optional(v.string()) });
type TStep = typeof vStep.type;

const EXTRACT_PAGES_PER_CALL = 6;
const EXTRACT_CHARS = 6_000;
const PROFILE_CHARS = 7_000;
const COMPETITOR_RESULTS = 5;

async function record<T>(ctx: ActionCtx, runId: Id<"runs">, r: IAgentResult<T>) {
	await ctx.runMutation(internal.spend.recordUsage, { runId, model: r.model, tier: r.tier, escalated: r.escalated, inputTokens: r.totalInputTokens, outputTokens: r.totalOutputTokens, costMicroUsd: r.totalMicroUsd });
}
async function recordFailure(ctx: ActionCtx, runId: Id<"runs">, e: unknown) {
	if (e instanceof AgentError && e.billedMicroUsd > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model: MODELS[e.tier], tier: e.tier, escalated: e.escalated, inputTokens: 0, outputTokens: 0, costMicroUsd: e.billedMicroUsd });
}
const notLive = (): TStep => ({ ok: false, error: "Live agents are off on this deployment (CMS_AGENTS=live turns them on)" });
const textOf = async (ctx: ActionCtx, id: Id<"_storage">) => (await (await ctx.storage.get(id))?.text()) ?? "";

/** Step 3: page extraction for pages whose text changed (F10). */
export const extract = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	returns: vStep,
	handler: async (ctx, { siteId, runId }): Promise<TStep> => {
		const input = await ctx.runQuery(internal.discovery.agentData.extractInput, { siteId });
		if (!input) return { ok: false, error: "Site not found" };
		if (!input.pages.length) return { ok: true, note: "Every page already extracted" };
		if (!agentsLive()) return notLive();
		const ledger = ledgerFor(ctx, siteId, "text", runId);
		const transport = modelTransport();
		let done = 0;
		for (let i = 0; i < input.pages.length; i += EXTRACT_PAGES_PER_CALL) {
			const group = input.pages.slice(i, i + EXTRACT_PAGES_PER_CALL);
			const blocks = await Promise.all(group.map(async (p) => pageBlock({ url: p.url, title: p.title, outline: p.outline, text: await textOf(ctx, p.textStorageId) }, EXTRACT_CHARS)));
			try {
				const r = await runAgentCall(ledger, transport, `discovery:${runId}:extract:${i}`, { tier: input.routing.mechanical, escalated: false }, { system: [DISCOVERY_SKILL.text, EXTRACT_CONTRACT], user: blocks.join("\n\n"), schema: ExtractOutput, maxTokens: 4_000, effort: "low" }, formatFor);
				await record(ctx, runId, r);
				const byUrl = new Map(group.map((p) => [p.url, p.id]));
				const items = r.output.pages.filter((x) => byUrl.has(x.url)).map((x) => ({ id: byUrl.get(x.url)!, type: x.type, topic: x.topic, entities: x.entities, targetQuery: x.targetQuery, funnel: x.funnel, refreshCandidate: x.refreshCandidate, refreshReason: x.refreshReason }));
				await ctx.runMutation(internal.discovery.agentData.saveExtracts, { items });
				done += items.length;
			} catch (e) {
				await recordFailure(ctx, runId, e);
				return { ok: false, error: `Page extraction stopped after ${done} pages: ${(e as Error).message}` };
			}
		}
		return { ok: true, note: `${done} pages extracted` };
	},
});

/** Step 4: site profile + brand pack draft on the strategy tier (F11–F12). */
export const profile = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	returns: vStep,
	handler: async (ctx, { siteId, runId }): Promise<TStep> => {
		const input = await ctx.runQuery(internal.discovery.agentData.profileInput, { siteId });
		if (!input) return { ok: false, error: "Site not found" };
		if (!agentsLive()) return notLive();
		const pages = await Promise.all(input.top.map(async (p) => pageBlock({ url: p.url, title: p.title, outline: p.outline, text: await textOf(ctx, p.textStorageId) }, PROFILE_CHARS)));
		const user = [
			`Site: ${input.siteName} (${input.domain}) · industry as entered: ${input.industry}`,
			`<content_map>\n${input.extracts.map(extractLine).join("\n")}\n</content_map>`,
			pages.join("\n\n"),
			input.interview?.length ? `Answers from the site owner:\n${input.interview.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join("\n")}` : "",
		].filter(Boolean).join("\n\n");
		try {
			const r = await runAgentCall(ledgerFor(ctx, siteId, "text", runId), modelTransport(), `discovery:${runId}:profile`, { tier: input.routing.strategy, escalated: false }, { system: [DISCOVERY_SKILL.text, PROFILE_CONTRACT], user, schema: ProfileOutput, maxTokens: 8_000, effort: "high" }, formatFor);
			await record(ctx, runId, r);
			// Evidence that isn't a crawled page is dropped (§7.4); the voice examples must be real quotes from the site.
			const crawled = new Set(input.extracts.map((e) => normalizeUrl(e.url) ?? e.url));
			const allowed = { crawled, gsc: new Set<string>(), seen: new Set<string>() };
			const keep = (c: { value: string; evidence: string[] }) => ({ value: c.value.trim(), evidence: validEvidence(c.evidence, allowed) });
			const o = r.output;
			const profileOut = {
				sells: keep(o.sells), offerings: o.offerings.map(keep), audience: keep(o.audience), regions: o.regions.map(keep), pricePositioning: keep(o.pricePositioning), differentiators: o.differentiators.map(keep), competitorsNamed: o.competitorsNamed.map(keep),
				regulated: { category: o.regulated.category, evidence: validEvidence(o.regulated.evidence, allowed) }, blogCoverage: o.blogCoverage.map(keep),
				brandPack: { voice: o.brandPack.voice, voiceExamples: o.brandPack.voiceExamples.map(keep).filter((x) => x.evidence.length), styleKeywords: o.brandPack.styleKeywords.slice(0, 12), disclaimers: o.brandPack.disclaimers.slice(0, 6) },
				gaps: o.gaps.slice(0, 20),
			};
			await ctx.runMutation(internal.discovery.agentData.saveProfile, { siteId, runId, version: input.nextVersion, lowConfidence: input.contentPages < 5, profile: profileOut });
			return { ok: true, note: `Profile v${input.nextVersion} (${profileOut.regulated.category === "none" ? "not regulated" : `${profileOut.regulated.category} category`})` };
		} catch (e) {
			await recordFailure(ctx, runId, e);
			return { ok: false, error: `The site profile couldn't be written: ${(e as Error).message}` };
		}
	},
});

/** Difficulty from who ranks (skill rule): forums or thin results = low, the site itself or mixed = medium, all exact-match = high. */
function difficultyOf(term: string, results: { url: string; title: string }[], domain: string): "low" | "medium" | "high" {
	const hosts = results.map((r) => bareHost(new URL(r.url).hostname));
	if (hosts.some((h) => /(^|\.)(reddit|quora|stackexchange|medium)\.com$/.test(h))) return "low";
	if (hosts.includes(bareHost(domain))) return "medium";
	const words = term.split(" ").filter((w) => w.length > 2);
	const exact = results.filter((r) => words.every((w) => r.title.toLowerCase().includes(w))).length;
	return exact >= Math.min(4, results.length) && results.length >= 3 ? "high" : "medium";
}

/** Step 5: pillars + keywords with GSC merge, cannibalisation and the competitor check (F13–F17). */
export const keywords = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports") },
	returns: vStep,
	handler: async (ctx, { siteId, runId, reportId }): Promise<TStep> => {
		const input = await ctx.runQuery(internal.discovery.agentData.keywordInput, { siteId });
		if (!input) return { ok: false, error: "Site not found" };
		if (!agentsLive()) return notLive();
		const gsc: IGscQuery[] = input.searchConsole === "connected" ? await ctx.runAction(internal.gsc.topQueries, { siteId, limit: 150 }) : [];
		try {
			const r = await runAgentCall(ledgerFor(ctx, siteId, "text", runId), modelTransport(), `discovery:${runId}:keywords`, { tier: input.routing.writing, escalated: false }, { system: [DISCOVERY_SKILL.text, KEYWORD_CONTRACT], user: keywordPrompt({ siteName: input.siteName, domain: input.domain, profileJson: input.profileJson, extracts: input.extracts, gsc, competitors: [], existingKeywords: input.existingKeywords, rejected: input.rejected }), schema: KeywordOutput, maxTokens: 12_000, effort: "medium" }, formatFor);
			await record(ctx, runId, r);
			const seen = new Set<string>();
			const crawled = new Set(input.extracts.map((e) => normalizeUrl(e.url) ?? e.url));
			let plan = planKeywords(r.output, { crawled, pageTargets: input.pageTargets, gsc, seen, existing: input.existingKeywords, rejected: input.rejected });
			// Competitor check (F17): top 2 uncovered keywords per pillar, capped like model spend.
			const notes: { keyword: string; ranking: string[]; difficulty: string }[] = [];
			if (input.competitorCheck) {
				const picks = plan.pillars.flatMap((p) => p.keywords.filter((k) => !k.existingPageUrl).sort((a, b) => b.impressions - a.impressions).slice(0, 2));
				const key = `discovery:${runId}:search`;
				const est = Math.round(picks.length * searchCredits(COMPETITOR_RESULTS) * USD_PER_CREDIT * 1e6);
				const held = picks.length ? await ctx.runMutation(internal.spend.hold, { siteId, budget: "text", key, microUsd: est, runId }) : { ok: false as const, message: "" };
				if (held.ok) {
					let credits = 0;
					for (const k of picks) {
						try {
							const res = await searchWeb(k.term, COMPETITOR_RESULTS);
							credits += searchCredits(COMPETITOR_RESULTS);
							for (const x of res) seen.add(new URL(x.url).toString());
							notes.push({ keyword: k.term, ranking: res.map((x) => x.url), difficulty: difficultyOf(k.term, res, input.domain) });
						} catch (e) {
							if (e instanceof FirecrawlError && (e.status === 402 || e.status === 0)) break;
						}
					}
					const actual = Math.round(credits * USD_PER_CREDIT * 1e6);
					await ctx.runMutation(internal.spend.settle, { key, actualMicroUsd: actual });
					await ctx.runMutation(internal.discovery.data.addRunCost, { runId, microUsd: actual });
					// Competitor URLs now count as evidence the run saw.
					plan = planKeywords(r.output, { crawled, pageTargets: input.pageTargets, gsc, seen, existing: input.existingKeywords, rejected: input.rejected });
				}
			}
			if (!plan.pillars.length) return { ok: false, error: "No pillars with evidence came out of the crawl · the report lists what was dropped" };
			await ctx.runMutation(internal.discovery.agentData.savePlan, { siteId, reportId, pillars: plan.pillars, competitorNotes: notes, dropped: plan.dropped });
			const kw = plan.pillars.reduce((n, p) => n + p.keywords.length, 0);
			return { ok: true, note: `${plan.pillars.length} pillars · ${kw} keywords${gsc.length ? ` · ${gsc.length} Search Console queries` : ""}` };
		} catch (e) {
			await recordFailure(ctx, runId, e);
			return { ok: false, error: `Keywords couldn't be proposed: ${(e as Error).message}` };
		}
	},
});

/** Step 6: the first batch of ideas (F18–F21). */
export const ideas = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports") },
	returns: vStep,
	handler: async (ctx, { siteId, runId, reportId }): Promise<TStep> => {
		const input = await ctx.runQuery(internal.discovery.agentData.ideasInput, { siteId, reportId });
		if (!input) return { ok: false, error: "Site not found" };
		if (!agentsLive()) return notLive();
		const pillars = input.pillars.map((p) => ({ name: p.name, why: p.why, evidence: p.evidence, keywords: p.keywords.map((k) => ({ term: k.term, intent: k.intent as "commercial", funnel: k.funnel as "awareness", volumeTier: "low" as const, volumeSource: k.volumeSource as "estimate", impressions: 0, position: null, quickWin: k.quickWin, ...(k.existingPageUrl ? { existingPageUrl: k.existingPageUrl } : {}), evidence: k.evidence })) }));
		try {
			const r = await runAgentCall(ledgerFor(ctx, siteId, "text", runId), modelTransport(), `discovery:${runId}:ideas`, { tier: input.routing.writing, escalated: false }, { system: [DISCOVERY_SKILL.text, IDEAS_CONTRACT], user: ideasPrompt({ siteName: input.siteName, profileJson: input.profileJson, extracts: input.extracts, pillars, batchSize: input.batchSize, existingTitles: input.existingTitles, quickWinShare: input.hasGsc }), schema: IdeasOutput, maxTokens: 12_000, effort: "medium" }, formatFor);
			await record(ctx, runId, r);
			const gscSet = new Set(pillars.flatMap((p) => p.keywords.flatMap((k) => k.evidence.filter((e) => e.startsWith("gsc:")).map((e) => e.slice(4)))));
			const picked = selectIdeas(r.output, { pillars, crawled: new Set(input.crawled), pageTitles: input.pageTitles, existingTitles: input.existingTitles, existingKeywords: input.existingKeywords, seen: new Set(input.seen), gsc: gscSet, batchSize: input.batchSize });
			const ids = await ctx.runMutation(internal.discovery.agentData.saveIdeas, { siteId, runId, reportId, ideas: picked.ideas, dropped: picked.dropped });
			return { ok: true, note: `${ids.length} ideas in the plan` };
		} catch (e) {
			await recordFailure(ctx, runId, e);
			return { ok: false, error: `Ideas couldn't be written: ${(e as Error).message}` };
		}
	},
});
