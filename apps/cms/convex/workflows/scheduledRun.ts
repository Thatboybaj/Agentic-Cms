// scheduledRun (api-map §10): stop if the site is paused → run the harness agent(s) for `kind` (stub until 03/07) →
// persist the artifact (ideas, outputs) and settle the run. The cap check happened before the run row was made.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";
import type { TRunArtifact } from "../pipeline/steps";

export const scheduledRun = workflow
	.define({ args: { siteId: v.id("sites"), runId: v.id("runs"), kind: v.string() } })
	.handler(async (step, args): Promise<void> => {
		const begun = await step.runMutation(internal.schedules.beginScheduled, { siteId: args.siteId, runId: args.runId });
		if (begun.stop) return;
		// No workflow retry on the paid step (agents retry their own calls; a blind re-run would pay twice).
		if (args.kind === "keyword-swarm" && (await step.runQuery(internal.pipeline.steps.swarmLive, begun.input.trigger ? { trigger: begun.input.trigger } : {}))) {
			// Keyword swarm v0.3: nine specialists over five steps, each its own action (agents/swarm.ts).
			let state: unknown = null;
			let artifact: TRunArtifact = { status: "failed", output: "The swarm didn't finish", ideas: [] };
			for (const stage of ["seeds", "discover", "analyze", "cluster", "prioritize"]) {
				const r = await step.runAction(internal.agents.swarm.stage, { siteId: args.siteId, runId: args.runId, stage, state }, { retry: false });
				if (r && typeof r === "object" && "status" in r && "ideas" in r) {
					artifact = r as TRunArtifact;
					break;
				}
				state = r;
			}
			return void (await step.runMutation(internal.schedules.finishScheduled, { siteId: args.siteId, runId: args.runId, ...artifact }));
		}
		const artifact = await step.runAction(internal.pipeline.steps.runKindStep, begun.input, { retry: false });
		await step.runMutation(internal.schedules.finishScheduled, { siteId: args.siteId, runId: args.runId, ...artifact });
	});
