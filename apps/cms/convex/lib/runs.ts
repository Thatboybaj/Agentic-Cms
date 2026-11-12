// Run rows (handoff 02 step 3): the billable record of every agent run. One row per idempotency key: a retried step
// finds its row instead of making a second one. Spend is debited once when a run settles, with the cost the caller
// measured. Steps are stubs until 03 (cappedInference records real token costs), so they cost $0: the spend cache and
// caps must only ever reflect real money (the prototype simulated 94% of the estimate; we don't).
import { RUN_META, type ICapCheck, type IEstimate } from "../../src/lib/logic";
import type { TRunKind } from "../../src/lib/types";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { audit } from "./audit";
import { fmtUsd } from "./budget";
import { spendMonth } from "./defaults";
import { notify, siteAudience } from "./notify";
import { modelOf } from "../agents/provider";

export interface IRunStart {
	site: Doc<"sites">;
	kind: TRunKind;
	trigger: "scheduled" | "manual" | "workflow";
	estimate: IEstimate;
	idempotencyKey: string;
	postId?: Id<"posts">;
	triggeredBy?: Id<"users">;
	output: string;
	status?: "queued" | "running";
}

export async function createRun(ctx: MutationCtx, r: IRunStart): Promise<Id<"runs">> {
	const existing = await ctx.db
		.query("runs")
		.withIndex("by_idempotency", (q) => q.eq("idempotencyKey", r.idempotencyKey))
		.unique();
	if (existing) return existing._id;
	const meta = RUN_META[r.kind];
	return ctx.db.insert("runs", {
		workspaceId: r.site.workspaceId,
		siteId: r.site._id,
		kind: r.kind,
		trigger: r.trigger,
		...(r.triggeredBy ? { triggeredBy: r.triggeredBy } : {}),
		status: r.status ?? "running",
		agent: meta.agent,
		agentId: r.kind,
		model: modelOf(r.estimate.tier),
		tier: r.estimate.tier,
		inputTokens: 0,
		outputTokens: 0,
		costUsd: 0,
		estimateUsd: r.estimate.usd,
		budget: r.estimate.budget,
		startedAt: Date.now(),
		...(r.postId ? { postId: r.postId } : {}),
		output: r.output,
		idempotencyKey: r.idempotencyKey,
		attempt: 1,
	});
}

/** Refused before any model call: run row + audit + notify the site's people (prototype refuseRun). */
export async function refuseRun(ctx: MutationCtx, r: Omit<IRunStart, "status">, cap: ICapCheck, actor: Pick<Doc<"users">, "_id" | "name"> | { system: string }) {
	const runId = await createRun(ctx, { ...r, status: "queued" });
	await ctx.db.patch(runId, { status: "refused-over-cap", output: cap.message, finishedAt: Date.now() });
	await audit(ctx, {
		workspaceId: r.site.workspaceId,
		siteId: r.site._id,
		...(r.postId ? { postId: r.postId } : {}),
		actor,
		action: "run refused over cap",
		target: RUN_META[r.kind].label,
		detail: `${cap.budget} ${fmtUsd(cap.spentUsd)} / ${fmtUsd(cap.capUsd)} · est. ${fmtUsd(r.estimate.usd)}`,
	});
	await notify(ctx, {
		workspaceId: r.site.workspaceId,
		siteId: r.site._id,
		userIds: await siteAudience(ctx, r.site),
		tone: "block",
		title: `Run refused: over ${cap.budget} cap`,
		body: cap.message,
		href: "/runs",
		dedupeKey: `refused:${r.site._id}:${r.kind}:${r.postId ?? ""}`,
	});
	return runId;
}

/** Settles a run and debits the site's month spend once (the status guard makes it idempotent). */
export async function finishRun(ctx: MutationCtx, runId: Id<"runs">, outcome: { status: "succeeded" | "failed" | "cancelled"; output: string; error?: string; costUsd?: number }) {
	const run = await ctx.db.get(runId);
	if (!run || (run.status !== "running" && run.status !== "queued")) return;
	// Live agents settle money through convex/spend.ts and record usage on the run (spend.recordUsage); then the caller
	// passes no costUsd and the recorded cost stands. A measured costUsd here is debited once (status guard above).
	if (outcome.costUsd === undefined) {
		await ctx.db.patch(runId, { status: outcome.status, output: outcome.output, finishedAt: Date.now(), ...(outcome.error ? { error: outcome.error } : {}) });
		return;
	}
	const costUsd = Math.round(outcome.costUsd * 100) / 100;
	await ctx.db.patch(runId, { status: outcome.status, output: outcome.output, finishedAt: Date.now(), costUsd, ...(outcome.error ? { error: outcome.error } : {}) });
	const site = await ctx.db.get(run.siteId);
	if (!site || costUsd <= 0) return;
	const month = spendMonth(Date.now());
	const spend = site.spend.month === month ? site.spend : { month, textMicroUsd: 0, imageMicroUsd: 0 };
	const micro = Math.round(costUsd * 1e6);
	await ctx.db.patch(site._id, {
		spend: run.budget === "image" ? { ...spend, imageMicroUsd: spend.imageMicroUsd + micro } : { ...spend, textMicroUsd: spend.textMicroUsd + micro },
	});
}
