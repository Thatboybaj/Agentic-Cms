"use node";
// CMS agent edits, live (handoff 03 steps 7 + 10): instructAgent, rewriteFactWithout and fixCheck schedule `suggest`;
// the autopost gate's fixStep calls `autopostFixes`. Both go through runAgentCall → cappedInference, then the
// no-invention guard (editorCore.safeEdits). Harness CMS_AGENT tier (workhorse); model ids only from MODELS.
import { CMS_AGENT, MODELS } from "@studio/seo-harness";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { vSafeEdits, vTask, vTaskMeta } from "../agentEdits";
import { EDIT_CONTRACT, EditOutput, editUserPrompt, OPTIMIZER_SKILL, safeEdits, type ISafeEdits, type TEditTask } from "./editorCore";
import { AgentError, runAgentCall } from "./run";
import { anthropicTransport, formatFor, ledgerFor } from "./sdk";

const START = { tier: CMS_AGENT.modelTier, escalated: false };

async function runEdit(ctx: ActionCtx, siteId: Id<"sites">, postId: Id<"posts">, runId: Id<"runs">, tasks: TEditTask[], key: string) {
	const c = await ctx.runQuery(internal.agentEdits.context, { siteId, postId });
	if (!c) throw new Error("Post not in this site");
	try {
		const r = await runAgentCall(ledgerFor(ctx, siteId, "text", runId), anthropicTransport(), key, START, { system: [OPTIMIZER_SKILL.text, EDIT_CONTRACT], user: editUserPrompt(c.post, tasks), schema: EditOutput, maxTokens: 12_000, effort: "medium" }, formatFor);
		await ctx.runMutation(internal.spend.recordUsage, { runId, model: r.model, tier: r.tier, escalated: r.escalated, inputTokens: r.totalInputTokens, outputTokens: r.totalOutputTokens, costMicroUsd: r.totalMicroUsd });
		return { version: c.version, safe: safeEdits(r.output, c.post, tasks), notes: r.output.notes };
	} catch (e) {
		if (e instanceof AgentError && e.billedMicroUsd > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model: MODELS[e.tier], tier: e.tier, escalated: e.escalated, inputTokens: 0, outputTokens: 0, costMicroUsd: e.billedMicroUsd });
		throw e;
	}
}

export const suggest = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs"), tasks: v.array(vTask), meta: v.array(vTaskMeta) },
	handler: async (ctx, { siteId, postId, runId, tasks, meta }) => {
		try {
			const out = await runEdit(ctx, siteId, postId, runId, tasks, `agent:${runId}:edit`);
			await ctx.runMutation(internal.agentEdits.saveSuggestions, { siteId, postId, runId, version: out.version, meta, result: out.safe, notes: out.notes });
		} catch (e) {
			await ctx.runMutation(internal.agentEdits.failRun, { runId, error: (e as Error).message });
		}
	},
});

/** Autopost: one call for every text fix in the gate's plan. Returns no edits on failure (the gate falls back to the deterministic fixes, then re-checks). */
export const autopostFixes = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), tasks: v.array(vTask) },
	returns: v.object({ result: vSafeEdits, runId: v.union(v.id("runs"), v.null()) }),
	handler: async (ctx, { siteId, postId, tasks }): Promise<{ result: ISafeEdits; runId: Id<"runs"> | null }> => {
		const empty: ISafeEdits = { edits: [], dropped: [] };
		if (!tasks.length) return { result: empty, runId: null };
		const runId = await ctx.runMutation(internal.agentEdits.startFixRun, { siteId, postId });
		if (!runId) return { result: empty, runId: null };
		try {
			const out = await runEdit(ctx, siteId, postId, runId, tasks, `agent:${runId}:autopost`);
			return { result: out.safe, runId };
		} catch (e) {
			await ctx.runMutation(internal.agentEdits.failRun, { runId, error: (e as Error).message });
			return { result: { ...empty, dropped: [`model call failed: ${(e as Error).message.slice(0, 120)}`] }, runId };
		}
	},
});
