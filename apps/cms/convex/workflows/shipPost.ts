// shipPost (api-map §10): render (publish mode, fidelity hold) → open/update the PR → transition → mr-open.
// Started by an approval (human or autopost) for one approved version; CI and merge arrive later as webhook events
// (git.onCi / git.onMerged), so this workflow never waits on them.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";

export const shipPost = workflow
	.define({ args: { siteId: v.id("sites"), postId: v.id("posts"), version: v.number(), autopost: v.boolean(), overrides: v.array(v.string()) } })
	.handler(async (step, args): Promise<void> => {
		const prep = await step.runMutation(internal.pipeline.ship.prepare, { siteId: args.siteId, postId: args.postId, version: args.version });
		if (prep.stop) return;
		const render = await step.runAction(internal.pipeline.steps.renderStep, prep.render);
		if (render.held.length) {
			await step.runMutation(internal.pipeline.ship.renderHeld, { siteId: args.siteId, postId: args.postId, held: render.held });
			return;
		}
		const pr = await step.runAction(internal.pipeline.steps.openPrStep, prep.pr);
		await step.runMutation(internal.pipeline.ship.recordMr, { ...args, render, pr });
	});
