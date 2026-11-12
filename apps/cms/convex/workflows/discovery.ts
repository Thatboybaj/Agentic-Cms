// Site discovery workflow (prd-site-discovery §7.2): seed → crawl (resumable slices) → extract → profile → keywords
// → ideas → finish. Each step persists its own result, so a crash resumes from the last finished step. Paid steps
// don't retry blindly (each agent call retries itself inside cappedInference); a step that can't continue ends the
// run with the reason the report shows. "More ideas" reruns only the ideas step on the current plan (F27).
import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { finishDiscovery } from "../discovery/agentData";
import { workflow } from "./manager";

const RESUME_MS = 20_000;
const MAX_SLICES = 12; // 12 × 7 minutes: far beyond a 1,000-page crawl at one request at a time

export const discovery = workflow
	.define({ args: { siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports"), mode: v.union(v.literal("full"), v.literal("more-ideas"), v.literal("interview")) } })
	.handler(async (step, a): Promise<void> => {
		const ids = { siteId: a.siteId, runId: a.runId, reportId: a.reportId };
		const stop = (status: "failed" | "needs-interview", error: string) => step.runMutation(internal.discovery.agentData.finish, { ...ids, status, output: error, error });
		if (a.mode === "full") {
			let r = await step.runAction(internal.discovery.crawl.crawl, ids, { retry: false });
			for (let i = 0; !r.done && r.cursor && i < MAX_SLICES; i++) {
				await step.sleep(RESUME_MS);
				r = await step.runAction(internal.discovery.crawl.crawl, { ...ids, cursor: r.cursor }, { retry: false });
			}
			if (r.stop) {
				// Robots-blocked: fall back to the discovery interview (§11) on the report screen.
				return void (await stop(r.stop.reason === "robots-blocked" ? "needs-interview" : "failed", r.stop.message));
			}
			if (!r.done) return void (await stop("failed", "The crawl didn't finish in time · re-run discovery"));
			for (const [stage, label, fn] of [
				["extract", "Reading what each page is about", internal.discovery.agent.extract],
				["profile", "Understanding the business", internal.discovery.agent.profile],
			] as const) {
				await step.runMutation(internal.discovery.agentData.setStage, { runId: a.runId, reportId: a.reportId, stage, output: label });
				const s = await step.runAction(fn, { siteId: a.siteId, runId: a.runId }, { retry: false });
				if (!s.ok) return void (await stop("failed", s.error ?? `${stage} failed`));
			}
			await step.runMutation(internal.discovery.agentData.setStage, { runId: a.runId, reportId: a.reportId, stage: "keywords", output: "Choosing pillars and keywords" });
			const k = await step.runAction(internal.discovery.agent.keywords, ids, { retry: false });
			if (!k.ok) return void (await stop("failed", k.error ?? "keywords failed"));
		} else if (a.mode === "interview") {
			// The crawl couldn't read the site: the profile comes from the owner's answers (and any pages that were read).
			for (const [stage, label, fn] of [
				["profile", "Understanding the business from your answers", internal.discovery.agent.profile],
			] as const) {
				await step.runMutation(internal.discovery.agentData.setStage, { runId: a.runId, reportId: a.reportId, stage, output: label });
				const s = await step.runAction(fn, { siteId: a.siteId, runId: a.runId }, { retry: false });
				if (!s.ok) return void (await stop("failed", s.error ?? `${stage} failed`));
			}
			await step.runMutation(internal.discovery.agentData.setStage, { runId: a.runId, reportId: a.reportId, stage: "keywords", output: "Choosing pillars and keywords" });
			const k = await step.runAction(internal.discovery.agent.keywords, ids, { retry: false });
			if (!k.ok) return void (await stop("failed", k.error ?? "keywords failed"));
		} else {
			await step.runMutation(internal.discovery.agentData.copyPlan, ids);
		}
		await step.runMutation(internal.discovery.agentData.setStage, { runId: a.runId, reportId: a.reportId, stage: "ideas", output: "Writing the first ideas" });
		const i = await step.runAction(internal.discovery.agent.ideas, ids, { retry: false });
		if (!i.ok) return void (await stop("failed", i.error ?? "ideas failed"));
		await step.runMutation(internal.discovery.agentData.finish, { ...ids, status: "succeeded", output: i.note ?? "Done" });
	});

/** A crash or cancel the steps didn't handle still settles the run and the report. */
export const discoveryDone = internalMutation({
	args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ siteId: v.id("sites"), runId: v.id("runs"), reportId: v.id("discoveryReports") }) },
	handler: async (ctx, { result, context }) => {
		if (result.kind === "success") return;
		const report = await ctx.db.get(context.reportId);
		if (!report || report.finishedAt) return;
		await finishDiscovery(ctx, { ...context, status: "failed", output: result.kind === "canceled" ? "Cancelled" : "Discovery stopped unexpectedly", ...(result.kind === "failed" ? { error: result.error } : {}) });
	},
});
