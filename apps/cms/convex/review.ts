// Send back → revise (handoff 02 step 8; api-map §4 `sendBack`). In review → drafting with the note; the revise workflow
// applies it (reviseStep, stub until 03) and returns the post to In review with "Revision ready". Ported from the
// prototype's sendBack + "revise-complete" job; wording matches.
import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { RUN_META, checkCap, type IEstimate } from "../src/lib/logic";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { loadPostInSite } from "./lib/access";
import { audit } from "./lib/audit";
import { capSite } from "./lib/budget";
import { siteMutation } from "./lib/functions";
import { notify, siteAudienceWith } from "./lib/notify";
import { createRun, finishRun, refuseRun } from "./lib/runs";
import { transitionPost } from "./lib/transition";
import { workflow } from "./workflows/manager";

type TResult = { ok: true } | { ok: false; reason: string };
const REVISE_ESTIMATE: IEstimate = { usd: 0.4, budget: "text", tier: "workhorse" };

export const sendBack = siteMutation({
	permission: "post.sendBack",
	args: { postId: v.id("posts"), note: v.string() },
	handler: async (ctx, { siteId, postId, note }): Promise<TResult> => {
		const { site, user, role } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state !== "in-review") return { ok: false, reason: "Only posts in review can be sent back" };
		const text = note.trim();
		if (!text) return { ok: false, reason: "Tell the agent what to change" };
		if (post.workflowId) return { ok: false, reason: "An agent is already working on this post" };
		const idempotencyKey = `run:${siteId}:revise:${postId}:${post.currentVersion}`;
		const base = { site, kind: "post-generation" as const, trigger: "manual" as const, estimate: REVISE_ESTIMATE, idempotencyKey, postId, triggeredBy: user._id, output: "Revising from note" };
		const cap = checkCap(capSite(site), "post-generation", REVISE_ESTIMATE);
		if (cap.status === "refused") {
			await refuseRun(ctx, base, cap, user);
			return { ok: false, reason: cap.message };
		}
		const r = await transitionPost(ctx, post, "drafting", { extra: { sendBackNote: text, progress: { label: "Revising from your note", value: 20 } } });
		if (!r.ok) return { ok: false, reason: r.reason };
		await ctx.db.insert("comments", { siteId, postId, byUserId: user._id, by: user.name, role, text: `Sent back: ${text}`, at: Date.now() });
		for (const l of await ctx.db.query("ledgerItems").withIndex("by_post", (q) => q.eq("postId", postId)).take(100)) {
			if (!l.done && (/review/i.test(l.title) || l.kind === "autopost-hold")) await ctx.db.patch(l._id, { done: true, doneAt: Date.now(), doneBy: user._id });
		}
		const runId = await createRun(ctx, base);
		const workflowId = await workflow.start(ctx, internal.workflows.revise.revise, { siteId, postId, runId }, { startAsync: true, onComplete: internal.review.reviseDone, context: { siteId, postId, runId } });
		await ctx.db.patch(postId, { workflowId });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "sent back", target: post.title, detail: `"${text}"` });
		return { ok: true };
	},
});

/** Hands the current draft + note to reviseStep. Stops if the post moved on. */
export const beginRevise = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const post = await ctx.db.get(postId);
		if (!post || post.siteId !== siteId || post.state !== "drafting" || !post.sendBackNote) return { stop: true as const };
		const site = await ctx.db.get(siteId);
		return { stop: false as const, input: { siteId, postId, note: post.sendBackNote, blocks: post.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })), seoTitle: post.seoTitle, ...(site ? { modelRouting: site.modelRouting } : {}) } };
	},
});

export const saveRevision = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs"), blocks: v.array(v.object({ id: v.string(), kind: v.string(), text: v.string() })), seoTitle: v.string() },
	handler: async (ctx, { siteId, postId, runId, blocks, seoTitle }) => {
		const post = await ctx.db.get(postId);
		const site = await ctx.db.get(siteId);
		if (!post || !site || post.siteId !== siteId || post.state !== "drafting") return;
		const note = post.sendBackNote ?? "";
		const kinds = new Set(post.blocks.map((b) => b.kind));
		// The writer may only return block kinds the post already uses (03 validates against vBlock with zod).
		const next = blocks.map((b, i) => ({ ...(post.blocks[i] ?? {}), id: b.id, kind: (kinds.has(b.kind as never) ? b.kind : "p") as (typeof post.blocks)[number]["kind"], text: b.text }));
		const words = next.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
		const n = post.currentVersion + 1;
		await ctx.db.insert("postVersions", { siteId, postId, n, origin: "agent-edit", actor: RUN_META["post-generation"].agent, runId, at: Date.now(), words, blocks: next, seoTitle, note: `Revised from note: "${note}"` });
		const r = await transitionPost(ctx, post, "in-review", { extra: { blocks: next, seoTitle, words, currentVersion: n, sendBackNote: undefined } });
		if (!r.ok) return;
		await finishRun(ctx, runId, { status: "succeeded", output: "Revision ready for review" });
		const recipients = await siteAudienceWith(ctx, site, "post.approve");
		if (post.assigneeId) recipients.push(post.assigneeId);
		await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: recipients, tone: "human", title: "Revision ready", body: `${post.title} is back in review.`, href: `/posts/${postId}`, dedupeKey: `revision:${postId}:${n}` });
	},
});

export const reviseDone = internalMutation({
	args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs") }) },
	handler: async (ctx, { workflowId, result, context }) => {
		const post = await ctx.db.get(context.postId as Id<"posts">);
		if (post && post.workflowId === workflowId) await ctx.db.patch(post._id, { workflowId: undefined, ...(result.kind === "success" ? {} : { progress: undefined }) });
		if (result.kind === "success") return;
		await finishRun(ctx, context.runId, { status: result.kind === "canceled" ? "cancelled" : "failed", output: "Revision failed", ...(result.kind === "failed" ? { error: result.error } : {}) });
	},
});
