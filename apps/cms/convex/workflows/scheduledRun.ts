// scheduledRun (api-map §10): stop if the site is paused → run the harness agent(s) for `kind` (stub until 03/07) →
// persist the artifact (ideas, outputs) and settle the run. The cap check happened before the run row was made.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";

export const scheduledRun = workflow
	.define({ args: { siteId: v.id("sites"), runId: v.id("runs"), kind: v.string() } })
	.handler(async (step, args): Promise<void> => {
		const begun = await step.runMutation(internal.schedules.beginScheduled, { siteId: args.siteId, runId: args.runId });
		if (begun.stop) return;
		// No workflow retry on the paid step (agents retry their own calls; a blind re-run would pay twice).
		const artifact = await step.runAction(internal.pipeline.steps.runKindStep, begun.input, { retry: false });
		await step.runMutation(internal.schedules.finishScheduled, { siteId: args.siteId, runId: args.runId, ...artifact });
	});
