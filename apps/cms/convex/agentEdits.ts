// Persistence for the CMS agent's model edits (agents/editor.ts). Actions orchestrate; these internal functions read
// the single-site context and write the results (README §3). Every result is a pending suggestion (a diff a person
// accepts); the autopost path applies its edits in pipeline/gate.applyAndShip instead.
import { v } from "convex/values";
import { RUN_META } from "../src/lib/logic";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { createRun, finishRun } from "./lib/runs";

export const vTask = v.union(
	v.object({ id: v.string(), type: v.literal("instruct"), instruction: v.string(), blockId: v.optional(v.string()) }),
	v.object({ id: v.string(), type: v.literal("rewrite-claim"), claim: v.string(), blockId: v.string() }),
	v.object({ id: v.string(), type: v.literal("fix-check"), checkId: v.string(), label: v.string(), value: v.string() }),
);

/** What each task resolves when its suggestion is accepted. */
export const vTaskMeta = v.object({ taskId: v.string(), instruction: v.string(), fixesCheckId: v.optional(v.string()), resolvesFactId: v.optional(v.id("factMarkers")) });

const vEdit = v.object({ taskId: v.string(), blockId: v.string(), op: v.union(v.literal("replace"), v.literal("insert_after")), kind: v.union(v.literal("h2"), v.literal("h3"), v.literal("p"), v.literal("ul"), v.literal("faq"), v.literal("quote")), text: v.string() });
export const vSafeEdits = v.object({ edits: v.array(vEdit), seoTitle: v.optional(v.string()), metaDescription: v.optional(v.string()), dropped: v.array(v.string()) });

export async function editContext(ctx: QueryCtx, siteId: Id<"sites">, post: Doc<"posts">) {
	const site = (await ctx.db.get(siteId))!;
	const kw = await ctx.db.get(post.keywordId);
	const linkRows = (await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(500)).filter((k) => k.rankingUrl && k._id !== post.keywordId).slice(0, 12);
	return {
		keyword: kw && kw.siteId === siteId ? kw.term : post.title,
		siteName: site.name,
		voice: site.brandPack.voice,
		seoTitle: post.seoTitle,
		...(post.metaDescription ? { metaDescription: post.metaDescription } : {}),
		blocks: post.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })),
		internalLinks: linkRows.map((k) => ({ title: k.term, url: k.rankingUrl! })),
	};
}

export const context = internalQuery({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const post = await ctx.db.get(postId);
		if (!post || post.siteId !== siteId) return null; // isolation (I4): never another site's post
		const site = await ctx.db.get(siteId);
		return { post: await editContext(ctx, siteId, post), version: post.currentVersion, modelRouting: site!.modelRouting };
	},
});

/** The agent's edits → pending suggestions, if the post hasn't moved on since the request. */
export const saveSuggestions = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs"), version: v.number(), meta: v.array(vTaskMeta), result: vSafeEdits, notes: v.string() },
	handler: async (ctx, { siteId, postId, runId, version, meta, result, notes }) => {
		const post = await ctx.db.get(postId);
		const site = await ctx.db.get(siteId);
		if (!post || !site || post.siteId !== siteId) return;
		if (post.currentVersion !== version) {
			await finishRun(ctx, runId, { status: "cancelled", output: `The draft changed while the agent worked (v${version} → v${post.currentVersion}) · ask again` });
			return;
		}
		const now = Date.now();
		let n = 0;
		const metaOf = (taskId: string) => meta.find((m) => m.taskId === taskId) ?? meta[0]!;
		const base = { siteId, postId, status: "pending" as const, runId, createdAt: now };
		for (const e of result.edits) {
			const m = metaOf(e.taskId);
			const block = post.blocks.find((b) => b.id === e.blockId);
			if (!block) continue;
			await ctx.db.insert("suggestions", {
				...base,
				instruction: m.instruction,
				blockId: e.blockId,
				before: e.op === "replace" ? block.text : "",
				after: e.text,
				...(e.op === "insert_after" ? { insertKind: e.kind } : {}),
				...(m.fixesCheckId ? { fixesCheckId: m.fixesCheckId } : {}),
				...(m.resolvesFactId ? { resolvesFactId: m.resolvesFactId } : {}),
			});
			n++;
		}
		const fieldMeta = meta.find((m) => m.fixesCheckId === "title-length" || m.fixesCheckId === "meta-description") ?? meta[0]!;
		if (result.seoTitle) {
			await ctx.db.insert("suggestions", { ...base, instruction: fieldMeta.instruction, blockId: "", field: "seoTitle", before: post.seoTitle, after: result.seoTitle, ...(fieldMeta.fixesCheckId ? { fixesCheckId: fieldMeta.fixesCheckId } : {}) });
			n++;
		}
		if (result.metaDescription) {
			await ctx.db.insert("suggestions", { ...base, instruction: fieldMeta.instruction, blockId: "", field: "metaDescription", before: post.metaDescription ?? "", after: result.metaDescription, ...(fieldMeta.fixesCheckId ? { fixesCheckId: fieldMeta.fixesCheckId } : {}) });
			n++;
		}
		const output = n ? `${n} suggestion${n === 1 ? "" : "s"} ready · "${meta[0]!.instruction}"` : `Nothing safe to change · ${result.dropped[0] ?? notes}`.slice(0, 200);
		await finishRun(ctx, runId, { status: "succeeded", output });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: { system: RUN_META["post-generation"].agent }, action: n ? "suggested edits" : "found nothing safe to change", target: post.title, detail: `"${meta[0]!.instruction}"${result.dropped.length ? ` · ${result.dropped.length} edit${result.dropped.length === 1 ? "" : "s"} dropped by the no-invention guard` : ""}` });
	},
});

/** The autopost gate's run for its model fixes (one per post version). */
export const startFixRun = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const post = await ctx.db.get(postId);
		const site = await ctx.db.get(siteId);
		if (!post || !site || post.siteId !== siteId) return null;
		return await createRun(ctx, { site, kind: "post-generation", trigger: "workflow", estimate: { usd: 0.3, budget: "text", tier: "workhorse" }, idempotencyKey: `run:${siteId}:autopost-fix:post-generation:${postId}:${post.currentVersion}`, postId, output: "Autopost gate · agent fixes" });
	},
});

export const failRun = internalMutation({
	args: { runId: v.id("runs"), error: v.string() },
	handler: async (ctx, { runId, error }) => {
		await finishRun(ctx, runId, { status: "failed", output: "The agent couldn't finish this edit", error: error.slice(0, 500) });
	},
});
