"use node";
// Live scheduled agents (handoff 03 step 7), called by pipeline/steps.runKindStep. Each returns the run artifact
// schedules.finishScheduled persists. Every model call goes through runAgentCall → cappedInference.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { vRunArtifact, type TRunArtifact } from "../pipeline/steps";
import { modelFor } from "./models";
import { AgentError, type IAgentResult, runAgentCall } from "./run";
import { QA_CONTRACT, QA_SKILL, QaOutput, qaScorecard, refreshCandidates } from "./scheduledCore";
import { modelTransport, formatFor, ledgerFor } from "./sdk";
import { modelOf } from "./provider";

const REFRESH_CAPACITY = 2;

async function record<T>(ctx: ActionCtx, runId: Id<"runs">, r: IAgentResult<T>) {
	await ctx.runMutation(internal.spend.recordUsage, { runId, model: r.model, tier: r.tier, escalated: r.escalated, inputTokens: r.totalInputTokens, outputTokens: r.totalOutputTokens, costMicroUsd: r.totalMicroUsd });
}
async function recordFailure(ctx: ActionCtx, runId: Id<"runs">, e: unknown) {
	if (e instanceof AgentError && e.billedMicroUsd > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model: modelOf(e.tier), tier: e.tier, escalated: e.escalated, inputTokens: 0, outputTokens: 0, costMicroUsd: e.billedMicroUsd });
}

const none: TRunArtifact["ideas"] = [];

async function qa(ctx: ActionCtx, siteId: Id<"sites">, runId: Id<"runs">, mode: "light" | "full"): Promise<TRunArtifact> {
	const d = await ctx.runQuery(internal.scheduledAgents.qaDigest, { siteId, mode });
	if (!d) return { status: "failed", output: "Site not found", ideas: none };
	let out = null;
	try {
		const r = await runAgentCall(ledgerFor(ctx, siteId, "text", runId), modelTransport(), `agent:${runId}:qa`, modelFor("seo-qa-agent", d.modelRouting), { system: [QA_SKILL.text, QA_CONTRACT], user: `<digest>\n${JSON.stringify(d.digest, null, 1)}\n</digest>`, schema: QaOutput, maxTokens: 4_000, effort: "low" }, formatFor);
		await record(ctx, runId, r);
		out = r.output;
	} catch (e) {
		await recordFailure(ctx, runId, e); // the findings stand without the prose
	}
	const card = qaScorecard(out, d.digest);
	if (card.rejected) console.log(`qa-sweep ${siteId}: model scorecard dropped, numbers not in the digest: ${card.rejected.join(", ")}`);
	const ledger = d.digest.findings.filter((f) => f.ledger).map((f) => ({ key: `qa:${f.key}`, title: f.ledger!.title, downstream: f.ledger!.downstream, ...(f.ledger!.postId ? { postId: f.ledger!.postId as Id<"posts"> } : {}) }));
	return { status: "succeeded", output: `${card.headline}${ledger.length ? ` · ${ledger.length} new on the ledger` : ""}`.slice(0, 200), ideas: none, ledger, artifacts: [{ kind: "scorecard_md", content: card.rejected ? `${card.md}

_Model prose dropped: it used numbers not in the findings (${card.rejected.join(", ")})._` : card.md }] };
}

async function refresh(ctx: ActionCtx, siteId: Id<"sites">): Promise<TRunArtifact> {
	const inp = await ctx.runQuery(internal.scheduledAgents.refreshInputs, { siteId });
	if (!inp) return { status: "failed", output: "Site not found", ideas: none };
	const picks = refreshCandidates(inp.posts, { year: new Date().getUTCFullYear(), gsc: inp.gsc, capacity: REFRESH_CAPACITY });
	const gap = inp.gsc ? "" : " · rank targeting needs Search Console";
	const ledger = inp.gsc ? [] : [{ key: "refresh:gsc", title: "Connect Search Console for refresh targeting", downstream: "Refresh picks only stale-dated posts; page-2 and decaying posts and the prune list need rank data" }];
	if (!picks.length) return { status: "succeeded", output: `No refresh candidates among ${inp.posts.length} live posts${gap}`, ideas: none, ledger };
	return { status: "succeeded", output: "", ideas: none, ledger, refresh: picks.map((p) => ({ postId: p.postId as Id<"posts">, reason: p.reason })), artifacts: [{ kind: "refresh_candidates_md", content: picks.map((p) => `- ${p.title}: ${p.reason}`).join("\n") + gap }] };
}

export const run = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), kind: v.string() },
	returns: vRunArtifact,
	handler: async (ctx, { siteId, runId, kind }): Promise<TRunArtifact> => {
		try {
			// keyword-swarm v0.3 runs as its own workflow steps (agents/swarm.ts, workflows/scheduledRun.ts).
			if (kind === "qa-sweep") return await qa(ctx, siteId, runId, new Date().getUTCDate() <= 14 ? "full" : "light");
			if (kind === "content-refresh") return await refresh(ctx, siteId);
			return { status: "failed", output: `No live agent for ${kind}`, ideas: none };
		} catch (e) {
			await recordFailure(ctx, runId, e);
			return { status: "failed", output: `Failed: ${(e as Error).message}`.slice(0, 200), ideas: none };
		}
	},
});
