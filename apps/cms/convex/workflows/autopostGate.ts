// autopostGate (api-map §10): evaluateGate → autopostDecision → agent fixes → re-evaluate → ship (starts shipPost) or
// hold (ledger "Autopost held: …"). Started by postPipeline when autopost is on, and by shipNow.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";

export const autopostGate = workflow
	.define({ args: { siteId: v.id("sites"), postId: v.id("posts") } })
	.handler(async (step, args): Promise<void> => {
		const decided = await step.runMutation(internal.pipeline.gate.decide, args);
		if (decided.action !== "ship") return;
		const textFixes = decided.plan.filter((f) => f.kind !== "slot" && f.kind !== "soft-accept").length;
		if (textFixes) await step.runAction(internal.pipeline.steps.fixStep, { ...args, fixes: textFixes });
		await step.runMutation(internal.pipeline.gate.applyAndShip, args);
	});
