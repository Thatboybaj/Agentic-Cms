"use node";
// Blog writing agent, live (handoff 03 step 7). Called by pipeline/steps.ts only when CMS_AGENTS=live. Builds the
// prompt from the single-site brief beginDraft assembled, runs it through runAgentCall → cappedInference (hold,
// bounded retry, settle, D7 escalation), records the measured usage on the run, and returns the step's draft shape.
// It never writes posts: persist.saveDraft does (README §3).
import { MODELS } from "@studio/seo-harness";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { type TDraftOutput, vDraftInput, vDraftOutput, vReviseInput, vReviseOutput } from "../pipeline/steps";
import { modelFor } from "./models";
import { AgentError, type IAgentResult, runAgentCall } from "./run";
import { modelTransport, formatFor, ledgerFor } from "./sdk";
import { CMS_CONTRACT, REVISE_CONTRACT, ReviseOutput, reviseUserPrompt, toDraft, toRevision, WRITER_SKILL, WriterOutput, writerUserPrompt } from "./writerCore";

async function record<T>(ctx: ActionCtx, runId: Id<"runs">, r: IAgentResult<T>) {
	await ctx.runMutation(internal.spend.recordUsage, { runId, model: r.model, tier: r.tier, escalated: r.escalated, inputTokens: r.totalInputTokens, outputTokens: r.totalOutputTokens, costMicroUsd: r.totalMicroUsd });
}

async function recordFailure(ctx: ActionCtx, runId: Id<"runs">, e: unknown) {
	if (e instanceof AgentError && e.billedMicroUsd > 0) {
		await ctx.runMutation(internal.spend.recordUsage, { runId, model: MODELS[e.tier], tier: e.tier, escalated: e.escalated, inputTokens: 0, outputTokens: 0, costMicroUsd: e.billedMicroUsd });
	}
}

export const draft = internalAction({
	args: { input: vDraftInput, runId: v.id("runs") },
	returns: vDraftOutput,
	handler: async (ctx, { input, runId }): Promise<TDraftOutput> => {
		const choice = modelFor("blog-writing-agent", input.modelRouting, { pillar: input.strongModel });
		try {
			const r = await runAgentCall(
				ledgerFor(ctx, input.siteId, "text", runId),
				modelTransport(),
				`agent:${runId}:writer`,
				choice,
				{
					system: [WRITER_SKILL.text, CMS_CONTRACT],
					user: writerUserPrompt(input),
					schema: WriterOutput,
					maxTokens: 32_000,
					effort: "high",
				},
				formatFor,
			);
			await record(ctx, runId, r);
			const d = toDraft(r.output, input.disclaimer ? { disclaimer: input.disclaimer } : {});
			return { ...d, tokens: { input: r.totalInputTokens, output: r.totalOutputTokens } };
		} catch (e) {
			await recordFailure(ctx, runId, e);
			throw e;
		}
	},
});

export const revise = internalAction({
	args: { ...vReviseInput, runId: v.id("runs") },
	returns: vReviseOutput,
	handler: async (ctx, a) => {
		const choice = modelFor("blog-writing-agent", a.modelRouting);
		try {
			const r = await runAgentCall(
				ledgerFor(ctx, a.siteId, "text", a.runId),
				modelTransport(),
				`agent:${a.runId}:revise`,
				choice,
				{ system: [WRITER_SKILL.text, REVISE_CONTRACT], user: reviseUserPrompt(a), schema: ReviseOutput, maxTokens: 32_000, effort: "medium" },
				formatFor,
			);
			await record(ctx, a.runId, r);
			return { ...toRevision(r.output, a.blocks), tokens: { input: r.totalInputTokens, output: r.totalOutputTokens } };
		} catch (e) {
			await recordFailure(ctx, a.runId, e);
			throw e;
		}
	},
});
