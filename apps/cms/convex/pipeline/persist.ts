// Pipeline persistence (README §3: "actions orchestrate; one internal mutation per step persists"). Every step takes
// siteId and refuses a post from another site (isolation rule I4). Each step re-reads the post and stops cleanly if a
// person moved it or the site was paused (handoff 02 step 10: no killing workflows, steps check state at their start).
import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId } from "@convex-dev/workflow";
import { ConvexError, v } from "convex/values";
import { AUTOPOST_ACTOR, VISUAL_AGENT } from "../../src/lib/logic";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { audit } from "../lib/audit";
import { notify, siteAudience } from "../lib/notify";
import { finishRun } from "../lib/runs";
import { mustTransition, transitionPost } from "../lib/transition";
import { placeImageBlocks } from "../lib/imageBlocks";
import { agentsLive, refreshOnPage } from "../lib/onpage";
import { internal } from "../_generated/api";
import { workflow } from "../workflows/manager";
import { vDraftOutput } from "./steps";

async function load(ctx: MutationCtx, siteId: Id<"sites">, postId: Id<"posts">) {
	const post = await ctx.db.get(postId);
	if (!post || post.siteId !== siteId) throw new ConvexError({ code: "NOT_FOUND", reason: "Post not in this site" });
	const site = (await ctx.db.get(siteId))!;
	return { post, site };
}

const WRITER = "Blog writer agent";
const actorFor = (site: Doc<"sites">) => ({ system: site.publishing.autopost ? AUTOPOST_ACTOR : WRITER });

/** briefed | decaying → drafting. Returns the draft step's input, or stop:true when there's nothing to do. */
export const beginDraft = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const { post, site } = await load(ctx, siteId, postId);
		if (site.status === "paused") return { stop: true as const, reason: "Site paused" };
		if (post.state !== "briefed" && post.state !== "decaying") return { stop: true as const, reason: `Post is ${post.state}` };
		await mustTransition(ctx, post, "drafting", { extra: { progress: { label: "Reading brief and brand pack", value: 4 }, ...(post.state === "decaying" ? { source: "refresh" as const } : {}) } });
		const kw = await ctx.db.get(post.keywordId);
		const keyword = kw && kw.siteId === siteId ? kw.term : post.title;
		const pillar = await ctx.db.get(post.pillarId);
		// Internal links: only real URLs this site already ranks with (Search Console), never guessed paths.
		const linkRows = (await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(500)).filter((k) => k.rankingUrl && k._id !== post.keywordId).slice(0, 12);
		const disclaimer = post.regulated ? site.brandPack.disclaimers[post.regulated] : undefined;
		return {
			stop: false as const,
			input: {
				siteId,
				postId,
				siteName: site.name,
				title: post.title,
				keyword,
				contentType: post.contentType,
				styleKeywords: site.brandPack.styleKeywords,
				heroProvider: site.routing.hero,
				strongModel: post.strongModel || post.contentType === "pillar" || post.contentType === "money-page",
				wordTarget: post.wordTarget,
				domain: site.domain,
				industry: site.industry,
				voice: site.brandPack.voice,
				intent: post.intent,
				...(pillar && pillar.siteId === siteId ? { pillar: pillar.name } : {}),
				...(post.regulated ? { regulated: post.regulated } : {}),
				...(disclaimer ? { disclaimer } : {}),
				internalLinks: linkRows.map((k) => ({ title: k.term, url: k.rankingUrl! })),
				modelRouting: site.modelRouting,
				...(post.state === "decaying" && post.blocks.length ? { refreshOf: { reason: post.refreshReason ?? "Scheduled refresh", blocks: post.blocks.filter((b) => b.kind !== "image").map((b) => ({ kind: b.kind, text: b.text })) } } : {}),
			},
		};
	},
});

/** Writes the draft as a new version, opens fact markers, creates image slots; drafting → needs-assets. */
export const saveDraft = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs"), draft: vDraftOutput },
	handler: async (ctx, { siteId, postId, runId, draft }) => {
		const { post, site } = await load(ctx, siteId, postId);
		if (post.state !== "drafting") return { stop: true as const, toFill: [] };
		const n = post.currentVersion + 1;
		const actor = actorFor(site);
		await ctx.db.insert("postVersions", { siteId, postId, n, origin: post.source === "refresh" ? "refresh" : "agent-generation", actor: WRITER, runId, at: Date.now(), words: draft.words, blocks: draft.blocks, seoTitle: draft.seoTitle });
		for (const c of draft.unsourcedClaims) {
			await ctx.db.insert("factMarkers", { siteId, postId, blockId: c.blockId, claim: c.claim, status: "open", note: "The writer couldn't source this claim" });
		}
		// Re-drafts replace the previous image sheet.
		for (const s of await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50)) await ctx.db.delete(s._id);
		const toFill: { slotId: Id<"imageSlots">; provider: string }[] = [];
		const placed: { id: string; type: string; placement: string; afterBlockId?: string }[] = [];
		let order = 0;
		for (const s of draft.imageSheet) {
			const provider = s.type === "chart" ? "inline-svg" : s.type === "hero" ? site.routing.hero : site.routing[s.type];
			const humanOnly = provider === "human" || site.publishing.humanOnlyAssets === true;
			const slotId = await ctx.db.insert("imageSlots", {
				siteId,
				postId,
				name: s.name,
				type: s.type,
				placement: s.placement,
				width: s.width,
				height: s.height,
				format: s.format,
				breakpoints: s.format === "svg" ? [] : [640, 1280, 1920],
				filename: `${post.slug}-${s.filenameSuffix}.${s.format}`,
				alt: s.alt,
				prompt: s.prompt,
				styleKeywords: site.brandPack.styleKeywords,
				provider,
				model: provider === "higgsfield" ? "higgsfield-preset" : provider === "openai" ? "openai-image" : provider === "open-source" ? "flux-dev" : "—",
				status: humanOnly ? "human-only" : "generating",
				estimateUsd: s.format === "svg" ? 0 : 0.18,
				order: order++,
			});
			if (!humanOnly) toFill.push({ slotId, provider });
			placed.push({ id: slotId, type: s.type, placement: s.placement, ...(s.afterBlockId ? { afterBlockId: s.afterBlockId } : {}) });
		}
		// Each slot gets an image block where the writer put it, or the renderer has nowhere to place the image.
		const blocks = placeImageBlocks<Doc<"posts">["blocks"][number]>(draft.blocks, placed, (slotId) => ({ id: `img-${slotId}`, kind: "image" as const, text: slotId }));
		await mustTransition(ctx, post, "needs-assets", {
			extra: { blocks, words: draft.words, seoTitle: draft.seoTitle, ...(draft.metaDescription ? { metaDescription: draft.metaDescription } : {}), currentVersion: n, progress: { label: `Image sheet · ${draft.imageSheet.length} slots`, value: 60 } },
		});
		// On-page audit of the new draft (the optimizer's checks; live only, stub drafts keep stub rows).
		if (agentsLive()) await refreshOnPage(ctx, (await ctx.db.get(postId))!);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor, action: "generated draft", target: post.title, detail: `v${n} · ${draft.words} words · ${draft.imageSheet.length} image slots` });
		return { stop: false as const, toFill };
	},
});

/** One slot's result. Autopost: the agent selects; otherwise the slot waits for a person to pick a candidate. */
export const saveSlot = internalMutation({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), ok: v.boolean(), candidates: v.number(), note: v.string() },
	handler: async (ctx, { siteId, slotId, ok, candidates }) => {
		const slot = await ctx.db.get(slotId);
		if (!slot || slot.siteId !== siteId || slot.status !== "generating") return;
		const site = (await ctx.db.get(siteId))!;
		const post = (await ctx.db.get(slot.postId))!;
		if (!ok) {
			await ctx.db.patch(slotId, { status: "failed" });
			return;
		}
		const auto = site.publishing.autopost;
		// Placeholder candidates (hue art, no file) until 04 stores real images; autopost selects the first.
		let first: Id<"candidates"> | undefined;
		for (let i = 0; i < candidates; i++) {
			const id = await ctx.db.insert("candidates", { siteId, postId: post._id, slotId, label: `candidate ${i + 1}`, hue: (slot.order * 97 + i * 53) % 360, selected: auto && i === 0, source: { kind: slot.provider === "inline-svg" ? "diagram" : "generated", provider: slot.provider }, createdAt: Date.now() });
			if (i === 0) first = id;
		}
		await ctx.db.patch(slotId, { status: auto ? "selected" : "candidates", generatedAt: Date.now(), ...(auto && first ? { selectedCandidateId: first } : {}) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: post._id, actor: { system: VISUAL_AGENT }, action: auto ? "selected asset" : "returned candidates", target: slot.name, detail: auto ? `${post.title} · autopost` : `${candidates} candidate${candidates === 1 ? "" : "s"} · ${post.title}` });
	},
});

/**
 * End of the pipeline. Autopost on → the autopost gate decides (ship or hold), unless a person pinned a slot as
 * human-only (then the post waits for them, as in the prototype). Autopost off: all slots selected → In review and
 * "Approval requested"; otherwise it waits in Needs assets for a person to pick or fill images.
 */
export const finishPipeline = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs") },
	handler: async (ctx, { siteId, postId, runId }) => {
		const { post, site } = await load(ctx, siteId, postId);
		const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50);
		const waiting = slots.filter((s) => s.status !== "selected");
		await finishRun(ctx, runId, { status: "succeeded", output: waiting.length ? `Draft v${post.currentVersion} · ${waiting.length} image slot${waiting.length === 1 ? "" : "s"} need a person` : `Draft v${post.currentVersion} · ready for review` });
		if (post.state !== "needs-assets") return;
		if (site.publishing.autopost && !slots.some((s) => s.status === "human-only" && s.humanPinned) && !slots.some((s) => s.status === "generating")) {
			await ctx.db.patch(postId, { progress: { label: "Autopost gate", value: 80 } });
			await workflow.start(ctx, internal.workflows.autopostGate.autopostGate, { siteId, postId }, { startAsync: true });
			return;
		}
		if (waiting.length) {
			await ctx.db.patch(postId, { progress: undefined, updatedAt: Date.now() });
			await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudience(ctx, site), tone: "human", title: "Images need you", body: `${post.title} · ${waiting.length} slot${waiting.length === 1 ? "" : "s"} to pick or fill`, href: `/posts/${postId}/assets`, dedupeKey: `assets:${postId}` });
			return;
		}
		await mustTransition(ctx, post, "in-review");
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: actorFor(site), action: "moved to In review", target: post.title, detail: "All images selected" });
		await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudience(ctx, site), tone: "human", title: "Approval requested", body: post.title, href: `/posts/${postId}`, dedupeKey: `review:${postId}:${post.currentVersion}` });
	},
});

/** onComplete for postPipeline: clears the workflow pointer; failures settle the run and say so. */
export const pipelineDone = internalMutation({
	args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ siteId: v.id("sites"), postId: v.id("posts"), runId: v.id("runs") }) },
	handler: async (ctx, { workflowId, result, context }) => {
		const post = await ctx.db.get(context.postId);
		if (post && post.workflowId === workflowId) await ctx.db.patch(post._id, { workflowId: undefined, ...(result.kind === "success" ? {} : { progress: undefined }) });
		if (result.kind === "success") return;
		const message = result.kind === "failed" ? result.error : "Cancelled";
		// A first draft that failed before writing anything returns to Briefed, so Generate now can run it again.
		if (post && post.state === "drafting" && post.blocks.length === 0) await transitionPost(ctx, post, "briefed");
		await finishRun(ctx, context.runId, { status: result.kind === "canceled" ? "cancelled" : "failed", output: result.kind === "canceled" ? "Cancelled" : "Generation failed", error: message });
		const site = await ctx.db.get(context.siteId);
		if (site && post) {
			await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: { system: WRITER }, action: result.kind === "canceled" ? "cancelled run" : "run failed", target: post.title, detail: message.slice(0, 200) });
			if (result.kind === "failed") await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), tone: "block", title: "Post generation failed", body: `${post.title} · ${message.slice(0, 140)}`, href: "/runs", dedupeKey: `genfail:${post._id}` });
		}
	},
});

/** Repair: give a post's existing slots their image blocks (posts drafted before image blocks were inserted). */
export const attachImageBlocks = internalMutation({
	args: { postId: v.id("posts") },
	handler: async (ctx, { postId }) => {
		const post = await ctx.db.get(postId);
		if (!post) return { ok: false as const, reason: "Post not found" };
		const slots = (await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50)).sort((a, b) => a.order - b.order);
		const blocks = placeImageBlocks(post.blocks, slots.map((x) => ({ id: x._id, type: x.type, placement: x.placement })), (slotId) => ({ id: `img-${slotId}`, kind: "image" as const, text: slotId }));
		const added = blocks.length - post.blocks.length;
		if (added) await ctx.db.patch(postId, { blocks, updatedAt: Date.now() });
		return { ok: true as const, added };
	},
});
