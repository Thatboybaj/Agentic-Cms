// postPipeline (api-map §10, README §6): briefed → drafting → needs-assets → (slots) → in-review or wait for a person.
// Started by approveIdea (autopost on) and generateNow. Short by design: it ends at the first human pause.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { workflow } from "./manager";

export const postPipeline = workflow
	.define({ args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs") } })
	.handler(async (step, args): Promise<void> => {
		const begun = await step.runMutation(internal.pipeline.persist.beginDraft, { siteId: args.siteId, postId: args.postId });
		if (begun.stop) return;

		// No workflow-level retry: the agent retries retryable errors itself, and a blind re-run would pay twice.
		const draft = await step.runAction(internal.pipeline.steps.draftStep, { input: begun.input, runId: args.runId }, { retry: false });
		const saved = await step.runMutation(internal.pipeline.persist.saveDraft, { ...args, draft });
		if (saved.stop) return;

		// Fan out the visual-asset agent per slot (parallel steps; a Workpool "images" pool takes over in 04).
		const results = await Promise.all(saved.toFill.map((s) => step.runAction(internal.pipeline.steps.fillSlotStep, { siteId: args.siteId, slotId: s.slotId, provider: s.provider })));
		for (let i = 0; i < results.length; i++) {
			await step.runMutation(internal.pipeline.persist.saveSlot, { siteId: args.siteId, slotId: saved.toFill[i]!.slotId, ok: results[i]!.ok, candidates: results[i]!.candidates, note: results[i]!.note });
		}

		await step.runMutation(internal.pipeline.persist.finishPipeline, args);
	});
