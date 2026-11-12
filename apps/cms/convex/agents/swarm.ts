"use node";
// Keyword research swarm v0.3 (harness #2): nine specialists, one model call each, run as five workflow steps so no
// action comes near Convex's time limit (workflows/scheduledRun.ts):
//   seeds (1) → discover (2 ∥ 3 ∥ 4 ∥ 9) → analyze (5 ∥ 6) → cluster (7) → prioritize (8) + the lead's merge.
// Every call goes through runAgentCall → cappedInference. Steps 4, 5 and 9 search the web; the URLs those searches
// returned are the only URLs a keyword may cite. A specialist that fails is skipped and named in the run output;
// nothing is filled in for it.
import { SWARM_SPECIALISTS, type TModelTier, type TSwarmSpecialist } from "@studio/seo-harness";
import { v } from "convex/values";
import type { z } from "zod/v4";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import type { TRunArtifact } from "../pipeline/steps";
import { modelOf } from "./provider";
import { AgentError, type IAgentResult, runAgentCall } from "./run";
import { formatFor, ledgerFor, modelTransport } from "./sdk";
import { briefBlock, ClusterOutput, CONTRACT, ExpandOutput, funnelMix, gscBlock, IntentOutput, type ISwarmBrief, LongTailOutput, ltmBlock, ltmCsv, mergeUpsert, PrioritizeOutput, SeedsOutput, specialistSkill } from "./swarmCore";

const SEARCHES = 5;
type TRouting = { mechanical: TModelTier; writing: TModelTier; strategy: TModelTier; pillarPages: TModelTier };

export interface ISwarmState {
	brief: ISwarmBrief;
	routing: TRouting;
	failed: string[];
	sources: string[];
	seeds?: z.infer<typeof SeedsOutput>["seeds"];
	expand?: z.infer<typeof ExpandOutput>["candidates"];
	longTail?: z.infer<typeof LongTailOutput>["candidates"];
	gapNotes?: string;
	audienceNotes?: string;
	metricsNotes?: string;
	intent?: z.infer<typeof IntentOutput>["labels"];
	cluster?: z.infer<typeof ClusterOutput>;
}

const tierOf = (id: TSwarmSpecialist, r: TRouting): TModelTier => (SWARM_SPECIALISTS.find((s) => s.id === id)!.tier === "fast" ? r.mechanical : r.writing);

async function record<T>(ctx: ActionCtx, runId: Id<"runs">, r: IAgentResult<T>) {
	await ctx.runMutation(internal.spend.recordUsage, { runId, model: r.model, tier: r.tier, escalated: r.escalated, inputTokens: r.totalInputTokens, outputTokens: r.totalOutputTokens, costMicroUsd: r.totalMicroUsd });
}

/** One specialist call. Returns null (and notes the failure) instead of throwing, except over the spend cap. */
async function call<T>(ctx: ActionCtx, siteId: Id<"sites">, runId: Id<"runs">, s: ISwarmState, id: TSwarmSpecialist, user: string, schema: z.ZodType<T> | null, maxTokens: number, effort: "low" | "medium"): Promise<T | null> {
	try {
		const r = await runAgentCall<T>(ledgerFor(ctx, siteId, "text", runId), modelTransport(), `swarm:${runId}:${id}`, { tier: tierOf(id, s.routing), escalated: false }, { system: [specialistSkill(id).text, CONTRACT[id]], user, ...(schema ? { schema } : { webSearch: { maxUses: SEARCHES } }), maxTokens, effort }, formatFor as never);
		await record(ctx, runId, r);
		if (r.sources) s.sources.push(...r.sources);
		return r.output;
	} catch (e) {
		if (e instanceof AgentError && e.billedMicroUsd > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model: modelOf(e.tier), tier: e.tier, escalated: e.escalated, inputTokens: 0, outputTokens: 0, costMicroUsd: e.billedMicroUsd });
		// A cap refusal lands here too: optional specialists are skipped; seeds, cluster and prioritize end the run.
		s.failed.push(`${id}: ${(e as Error).message.slice(0, 120)}`);
		return null;
	}
}

const pool = (s: ISwarmState) => {
	const terms = new Map<string, string>();
	for (const x of s.seeds ?? []) terms.set(x.term.toLowerCase(), `seed (${x.source})`);
	for (const x of s.expand ?? []) if (!terms.has(x.term.toLowerCase())) terms.set(x.term.toLowerCase(), `${x.lengthClass} from "${x.seed}"`);
	for (const x of s.longTail ?? []) if (!terms.has(x.term.toLowerCase())) terms.set(x.term.toLowerCase(), `long-tail${x.question ? " question" : ""} from "${x.seed}"`);
	return [...terms].slice(0, 160);
};
const poolBlock = (s: ISwarmState) => `<pool>\n${pool(s).map(([t, w]) => `${t} · ${w}`).join("\n")}\n</pool>`;
const notes = (label: string, text?: string) => (text ? `<notes source="${label}">\n${text.slice(0, 24_000)}\n</notes>` : "");

export const stage = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), stage: v.string(), state: v.any() },
	returns: v.any(),
	handler: async (ctx, { siteId, runId, stage: name, state }): Promise<ISwarmState | TRunArtifact> => {
		let s = state as ISwarmState | null;
		if (name === "seeds") {
			const b = await ctx.runQuery(internal.scheduledAgents.swarmBrief, { siteId });
			if (!b) return { status: "failed", output: "Site not found", ideas: [] };
			if (!b.brief.pillars.length) return { status: "succeeded", output: "No pillars in the plan yet · nothing to research (run site discovery first)", ideas: [] };
			const gsc = b.searchConsole === "connected" ? (await ctx.runAction(internal.gsc.topQueries, { siteId, limit: 150 })).map((g) => ({ query: g.query, impressions: g.impressions, position: g.position })) : [];
			s = { brief: { ...b.brief, gsc }, routing: b.modelRouting, failed: [], sources: [] };
			const out = await call(ctx, siteId, runId, s, "seed-brainstormer", [briefBlock(s.brief), ltmBlock(s.brief)].join("\n\n"), SeedsOutput, 3_000, "medium");
			if (!out?.seeds.length) return { status: "failed", output: `Seed brainstorm failed · ${s.failed.join("; ") || "no seeds"}`.slice(0, 200), ideas: [] };
			s.seeds = out.seeds.slice(0, 20);
			return s;
		}
		if (!s) return { status: "failed", output: "Swarm state missing", ideas: [] };
		const ctxBlock = [briefBlock(s.brief), ltmBlock(s.brief)].join("\n\n");
		const seedList = `Seeds: ${(s.seeds ?? []).map((x) => x.term).join("; ")}`;
		if (name === "discover") {
			const [ex, lt, gap, aud] = await Promise.all([
				call(ctx, siteId, runId, s, "term-expander", `${ctxBlock}\n\n${seedList}`, ExpandOutput, 4_000, "low"),
				call(ctx, siteId, runId, s, "long-tail-hunter", `${ctxBlock}\n\n${seedList}`, LongTailOutput, 4_000, "low"),
				call<string>(ctx, siteId, runId, s, "competitor-gap-analyst", `${ctxBlock}\n\n${seedList}`, null, 6_000, "medium"),
				call<string>(ctx, siteId, runId, s, "audience-researcher", `${ctxBlock}\n\n${seedList}`, null, 6_000, "medium"),
			]);
			s.expand = ex?.candidates ?? [];
			s.longTail = lt?.candidates ?? [];
			if (gap) s.gapNotes = gap;
			if (aud) s.audienceNotes = aud;
			return s;
		}
		if (name === "analyze") {
			const [met, intent] = await Promise.all([
				call<string>(ctx, siteId, runId, s, "metrics-analyst", [ctxBlock, gscBlock(s.brief), poolBlock(s), notes("competitor-gaps", s.gapNotes)].join("\n\n"), null, 8_000, "medium"),
				call(ctx, siteId, runId, s, "intent-classifier", poolBlock(s), IntentOutput, 6_000, "low"),
			]);
			if (met) s.metricsNotes = met;
			s.intent = intent?.labels ?? [];
			return s;
		}
		if (name === "cluster") {
			const labels = `Intent labels:\n${(s.intent ?? []).map((l) => `${l.term} · ${l.intent} · ${l.funnel}`).join("\n")}`;
			const out = await call(ctx, siteId, runId, s, "cluster-architect", [ctxBlock, gscBlock(s.brief), poolBlock(s), labels, notes("metrics", s.metricsNotes), notes("competitor-gaps", s.gapNotes)].join("\n\n"), ClusterOutput, 12_000, "medium");
			if (!out?.rows.length) return { status: "failed", output: `Clustering failed · ${s.failed.join("; ") || "no rows"}`.slice(0, 200), ideas: [] };
			s.cluster = out;
			return s;
		}
		// prioritize (step 8) + the lead's merge → the run artifact the persist step writes into the LTM.
		const rowsBlock = `<pool>\n${(s.cluster?.rows ?? []).map((r) => `${r.term} · ${r.pillar} / ${r.cluster} · ${r.role}${r.primaryFor ? ` of "${r.primaryFor}"` : ""} · ${r.intent} · ${r.funnel} · volume ${r.volumeTier} · difficulty ${r.difficultyTier} (${r.difficultyEvidence})`).join("\n")}\n</pool>`;
		const p = await call(ctx, siteId, runId, s, "funnel-prioritizer", [ctxBlock, gscBlock(s.brief), rowsBlock, notes("audience", s.audienceNotes)].join("\n\n"), PrioritizeOutput, 10_000, "medium");
		if (!p) return { status: "failed", output: `Prioritizing failed · ${s.failed.join("; ")}`.slice(0, 200), ideas: [] };
		const { rows, dropped } = mergeUpsert(s.cluster?.rows ?? [], p.rows, { pillars: s.brief.pillars, ltm: s.brief.ltm, rejected: s.brief.rejected, sources: s.sources, gsc: s.brief.gsc });
		const mix = funnelMix(rows);
		const qualified = rows.filter((r) => r.status === "qualified");
		const ideas = qualified
			.filter((r) => r.idea)
			.slice(0, s.brief.target)
			.map((r) => ({ term: r.term, intent: r.intent, difficulty: r.difficulty, evidence: r.difficultyEvidence || r.evidenceUrls[0] || "", pillar: r.pillar, suggestedTitle: r.idea!.suggestedTitle, contentType: r.idea!.contentType }));
		const failed = s.failed.length ? `\n\nSpecialists that didn't finish (their steps were skipped, nothing filled in): ${s.failed.join("; ")}` : "";
		const delta = [p.delta.trim(), mix.ok ? "" : `Funnel mix below a third MoFu/BoFu (${Math.round(mix.lowerShare * 100)}%): review before approving.`].filter(Boolean).join("\n");
		return {
			status: "succeeded",
			output: `${qualified.length} keywords qualified · ${rows.length - qualified.length} retired · ${ideas.length} ideas${s.failed.length ? ` · ${s.failed.length} specialist(s) skipped` : ""}`,
			ideas,
			ltm: rows.map(({ idea: _i, ...r }) => r),
			artifacts: [
				{ kind: "keyword_ltm_upsert_csv", content: ltmCsv(rows) },
				{ kind: "pipeline_csv", content: ltmCsv(qualified) },
				{ kind: "top10_md", content: [`# Keyword swarm · ${s.brief.siteName}`, delta, "", ...p.top10.slice(0, 10).map((t, i) => `${i + 1}. **${t.term}** · ${t.rationale}`), "", `Funnel mix: ${Math.round(mix.lowerShare * 100)}% MoFu/BoFu`, dropped.length ? `\nDropped by the merge rules (${dropped.length}): ${dropped.slice(0, 12).join("; ")}` : "", failed].join("\n") },
				{ kind: "community_language_md", content: p.communityPhrases.length ? p.communityPhrases.map((x) => `> ${x}`).join("\n") : "No community phrases this run." },
				{ kind: "cluster_gaps_md", content: (s.cluster?.clusterGaps ?? []).map((g) => `- ${g}`).join("\n") || "No thin clusters found." },
			],
		};
	},
});
