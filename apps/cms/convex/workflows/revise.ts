// revise (api-map §10): writer applies the send-back note → back to In review, "Revision ready". The on-page optimizer
// re-runs inside reviseStep once 03 lands (it owns both model calls).
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";

export const revise = workflow
	.define({ args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs") } })
	.handler(async (step, args): Promise<void> => {
		const begun = await step.runMutation(internal.review.beginRevise, { siteId: args.siteId, postId: args.postId });
		if (begun.stop) return;
		const out = await step.runAction(internal.pipeline.steps.reviseStep, begun.input);
		await step.runMutation(internal.review.saveRevision, { ...args, blocks: out.blocks, seoTitle: out.seoTitle });
	});
