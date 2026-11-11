// Image pipeline (api-map §5): pick / use candidates, mark human-only, regenerate, upload, the visual agent's results,
// and image routing. Ported from src/lib/store.tsx with its wording. Generation is the stub fillSlotStep until 04 (real
// providers + R2); placeholder candidates carry a hue (as in the prototype) and no file. Uploads record the file name;
// the bytes arrive with 04's R2 upload URL. When the last slot is filled the post moves on (maybeAdvanceAssets).
import { v } from "convex/values";
import { VISUAL_AGENT, checkCap, estimateRun, type IEstimate } from "../src/lib/logic";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { capSite, fmtUsd } from "./lib/budget";
import { siteMutation } from "./lib/functions";
import { notify, siteAudienceWith } from "./lib/notify";
import { createRun, finishRun, refuseRun } from "./lib/runs";
import { transitionPost } from "./lib/transition";
import { workflow } from "./workflows/manager";

type TResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): TResult => ({ ok: false, reason });
const vProvider = v.union(v.literal("higgsfield"), v.literal("openai"), v.literal("open-source"), v.literal("web-source"), v.literal("inline-svg"), v.literal("human"));
const vSlotType = v.union(v.literal("hero"), v.literal("lifestyle"), v.literal("diagram"), v.literal("screenshot"), v.literal("chart"), v.literal("photo"));
const MAX_URL = 200_000; // data URIs above this are dropped (Convex documents are capped at 1 MB; real files go to R2 in 04)

const hueOf = (seed: string) => {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return h % 360;
};

async function slotInSite(ctx: MutationCtx, siteId: Id<"sites">, slotId: Id<"imageSlots">) {
	const slot = await ctx.db.get(slotId);
	if (!slot || slot.siteId !== siteId) return null;
	return slot;
}

async function closeSlotLedger(ctx: MutationCtx, siteId: Id<"sites">, slot: Doc<"imageSlots">) {
	for (const l of await ctx.db.query("ledgerItems").withIndex("by_post", (q) => q.eq("postId", slot.postId)).take(100)) {
		if (!l.done && l.siteId === siteId && l.slotId === slot._id) await ctx.db.patch(l._id, { done: true, doneAt: Date.now() });
	}
}

/** The prototype's maybeAdvanceAssets: autopost → gate (unless a pinned slot or generation is pending); else In review once every slot is filled. */
export async function advanceAssets(ctx: MutationCtx, site: Doc<"sites">, postId: Id<"posts">) {
	const post = await ctx.db.get(postId);
	if (!post || post.state !== "needs-assets") return;
	const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50);
	if (site.publishing.autopost) {
		if (slots.some((s) => s.status === "generating" || (s.status === "human-only" && s.humanPinned))) return;
		await workflow.start(ctx, internal.workflows.autopostGate.autopostGate, { siteId: site._id, postId }, { startAsync: true });
		return;
	}
	if (!slots.length || !slots.every((s) => s.status === "selected")) return;
	const r = await transitionPost(ctx, post, "in-review");
	if (!r.ok) return;
	await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudienceWith(ctx, site, "post.approve"), tone: "human", title: "Approval requested", body: `${post.title} has every slot filled and is ready for review.`, href: `/approvals?post=${postId}`, dedupeKey: `review:${postId}:${post.currentVersion}` });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId, actor: { system: "CMS agent" }, action: "moved to In review", target: post.title, detail: "Every image slot filled" });
}

/** Replaces a slot's candidates (placeholder hues, or real URLs from the visual agent). */
async function writeCandidates(ctx: MutationCtx, slot: Doc<"imageSlots">, list: { label?: string; hue?: number; url?: string; selected?: boolean; source?: Doc<"candidates">["source"] }[], runId?: Id<"runs">) {
	for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slot._id)).take(50)) await ctx.db.delete(c._id);
	const ids: Id<"candidates">[] = [];
	for (let i = 0; i < list.length; i++) {
		const c = list[i]!;
		// A real image URL rides on the candidate's source until 04 stores the file as an asset in R2.
		const url = c.url && c.url.length <= MAX_URL ? c.url : undefined;
		const base = c.source ?? { kind: slot.provider === "inline-svg" ? ("diagram" as const) : ("generated" as const), provider: slot.provider, ...(slot.model && slot.model !== "—" ? { model: slot.model } : {}) };
		ids.push(
			await ctx.db.insert("candidates", {
				siteId: slot.siteId,
				postId: slot.postId,
				slotId: slot._id,
				label: c.label || `candidate ${i + 1}`,
				hue: c.hue ?? hueOf(`${slot._id}-${i}`),
				selected: !!c.selected,
				source: url ? { ...base, sourceUrl: url } : base,
				...(runId ? { runId } : {}),
				createdAt: Date.now(),
			}),
		);
	}
	return ids;
}

// ─── Public ───────────────────────────────────────────────────────────────────

export const pickCandidate = siteMutation({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots"), candidateId: v.id("candidates") },
	handler: async (ctx, { siteId, slotId, candidateId }): Promise<TResult> => {
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		const list = await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(50);
		if (!list.some((c) => c._id === candidateId)) return fail("Candidate not found");
		for (const c of list) if (c.selected !== (c._id === candidateId)) await ctx.db.patch(c._id, { selected: c._id === candidateId });
		return { ok: true };
	},
});

export const useCandidate = siteMutation({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots") },
	handler: async (ctx, { siteId, slotId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		const pick = (await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(50)).find((c) => c.selected);
		if (!pick) return fail("Pick a candidate first");
		await ctx.db.patch(slotId, { status: "selected", selectedCandidateId: pick._id });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: user, action: "selected asset", target: slot.name, detail: `${pick.label} · ${slot.provider} · ${slot.model} · ${slot.filename}` });
		await advanceAssets(ctx, site, slot.postId);
		return { ok: true };
	},
});

export const markHumanOnly = siteMutation({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots") },
	handler: async (ctx, { siteId, slotId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		if (slot.status === "human-only") return { ok: true };
		const post = await ctx.db.get(slot.postId);
		await ctx.db.patch(slotId, { status: "human-only", humanPinned: true, provider: "human", model: "—", selectedCandidateId: undefined });
		for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(50)) if (c.selected) await ctx.db.patch(c._id, { selected: false });
		await ctx.db.insert("ledgerItems", { siteId, title: `${slot.name} · ${post?.title ?? "post"}`, owner: user.name, ownerUserId: user._id, createdAt: Date.now(), downstream: "holds 1 post in Needs assets", postId: slot.postId, slotId, origin: "human", done: false });
		if (post && post.state === "in-review") await transitionPost(ctx, post, "needs-assets");
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: user, action: "marked human-only", target: slot.name, ...(post ? { detail: post.title } : {}) });
		return { ok: true };
	},
});

export const regenerateSlot = siteMutation({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots"), prompt: v.optional(v.string()), override: v.optional(v.union(v.literal("generate"), v.literal("diagram"), v.literal("source"))) },
	handler: async (ctx, { siteId, slotId, prompt, override }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.status === "paused") return fail("This site is paused · resume it to run agents");
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		if (slot.provider === "inline-svg") return fail("Charts are rendered from the post's data, never generated");
		if (slot.status === "generating") return fail("Already generating");
		const routed = site.routing[slot.type];
		const provider = slot.provider === "human" ? (routed === "human" ? "open-source" : routed) : slot.provider;
		const est: IEstimate = { usd: slot.estimateUsd || estimateRun("image-generation", capSite(site)).usd, budget: "image", tier: "workhorse" };
		const cap = checkCap(capSite(site), "image-generation", est);
		const base = { site, kind: "image-generation" as const, trigger: "manual" as const, estimate: est, idempotencyKey: `run:${siteId}:image:${slotId}:${Date.now()}`, postId: slot.postId, triggeredBy: user._id, output: "Generating candidates" };
		if (cap.status === "refused") {
			await refuseRun(ctx, base, cap, user);
			return fail(cap.message);
		}
		const model = slot.model === "—" || slot.model === "upload" ? (provider === "higgsfield" ? "higgsfield-preset" : provider === "openai" ? "openai-image" : "flux-dev") : slot.model;
		await ctx.db.patch(slotId, { status: "generating", provider, model, humanPinned: undefined, selectedCandidateId: undefined, ...(prompt?.trim() ? { prompt: prompt.trim() } : {}), ...(slot.estimateUsd ? {} : { estimateUsd: est.usd }) });
		await writeCandidates(ctx, slot, []);
		await closeSlotLedger(ctx, siteId, slot);
		const runId = await createRun(ctx, base);
		await ctx.db.patch(runId, { slotId });
		await ctx.scheduler.runAfter(0, internal.slots.generate, { siteId, slotId, runId, provider, ...(override ? { override } : {}) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: user, action: "regenerated slot", target: slot.name, detail: `${model} · est. ${fmtUsd(est.usd)}${prompt?.trim() ? " · edited prompt" : ""}` });
		return { ok: true };
	},
});

export const uploadOwn = siteMutation({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots"), fileName: v.string() },
	handler: async (ctx, { siteId, slotId, fileName }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		const name = fileName.trim();
		if (!/\.(png|jpe?g|webp|avif|svg)$/i.test(name)) return fail("Upload a PNG, JPG, WebP, AVIF or SVG");
		const [id] = await writeCandidates(ctx, slot, [{ label: name, hue: hueOf(name), selected: true, source: { kind: "upload", provider: "human", creator: user.name } }]);
		await ctx.db.patch(slotId, { provider: "human", model: "upload", status: "selected", generatedAt: Date.now(), selectedCandidateId: id });
		await closeSlotLedger(ctx, siteId, slot);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: user, action: "uploaded asset", target: slot.name, detail: `${name} → ${slot.filename}` });
		await advanceAssets(ctx, site, slot.postId);
		return { ok: true };
	},
});

/** Results from the visual-asset agent route (src/server/visual-agent, until 04 moves it into Convex). */
export const setSlotCandidates = siteMutation({
	permission: "asset.manage",
	args: {
		slotId: v.id("imageSlots"),
		candidates: v.array(v.object({ label: v.optional(v.string()), hue: v.optional(v.number()), url: v.optional(v.string()), source: v.optional(v.object({ kind: v.union(v.literal("generated"), v.literal("diagram"), v.literal("sourced"), v.literal("upload")), provider: v.string(), model: v.optional(v.string()), license: v.optional(v.string()), attribution: v.optional(v.string()), sourceUrl: v.optional(v.string()), creator: v.optional(v.string()) })) })),
		meta: v.optional(v.object({ provider: vProvider, model: v.optional(v.string()) })),
	},
	handler: async (ctx, { siteId, slotId, candidates, meta }): Promise<TResult> => {
		const { site } = ctx.access;
		const slot = await slotInSite(ctx, siteId, slotId);
		if (!slot) return fail("Slot not found");
		if (slot.type === "chart") return fail("Charts are rendered from the post's data, never generated");
		if (!candidates.length) return fail("No candidates to show");
		const next = { ...slot, ...(meta ? { provider: meta.provider, ...(meta.model ? { model: meta.model } : {}) } : {}) };
		await ctx.db.patch(slotId, { ...(meta ? { provider: meta.provider, ...(meta.model ? { model: meta.model } : {}) } : {}), status: "candidates", generatedAt: Date.now(), humanPinned: undefined });
		await writeCandidates(ctx, next, candidates);
		await closeSlotLedger(ctx, siteId, slot);
		const kinds = [...new Set(candidates.map((c) => c.source?.kind ?? (next.provider === "inline-svg" ? "diagram" : "generated")))].join(", ");
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: { system: VISUAL_AGENT }, action: "returned candidates", target: slot.name, detail: `${candidates.length} · ${kinds} · ${next.provider}${next.model ? ` · ${next.model}` : ""}` });
		await onCandidates(ctx, site, slotId);
		return { ok: true };
	},
});

export const setRouting = siteMutation({
	permission: "routing.set",
	args: { slotType: vSlotType, provider: vProvider },
	handler: async (ctx, { siteId, slotType, provider }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (slotType === "chart" && provider !== "inline-svg") return fail("Charts are never generated. They render as inline SVG");
		await ctx.db.patch(siteId, { routing: { ...site.routing, [slotType]: provider } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "changed image routing", target: slotType, detail: provider });
		return { ok: true };
	},
});

// ─── Generation (stub until 04) ──────────────────────────────────────────────

/** Autopost picks the first candidate and moves the post on; otherwise a person picks (prototype onCandidatesArrived). */
async function onCandidates(ctx: MutationCtx, site: Doc<"sites">, slotId: Id<"imageSlots">) {
	const slot = (await ctx.db.get(slotId))!;
	const post = await ctx.db.get(slot.postId);
	if (!site.publishing.autopost || !post || post.state !== "needs-assets") return;
	const first = (await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(1))[0];
	if (!first) return;
	await ctx.db.patch(first._id, { selected: true });
	await ctx.db.patch(slotId, { status: "selected", selectedCandidateId: first._id });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: slot.postId, actor: { system: VISUAL_AGENT }, action: "selected asset", target: slot.name, detail: `${post.title} · autopost` });
	await advanceAssets(ctx, site, slot.postId);
}

export const generate = internalAction({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), runId: v.id("runs"), provider: v.string(), override: v.optional(v.union(v.literal("generate"), v.literal("diagram"), v.literal("source"))) },
	handler: async (ctx, a) => {
		const out = await ctx.runAction(internal.pipeline.steps.fillSlotStep, { siteId: a.siteId, slotId: a.slotId, provider: a.provider, runId: a.runId, ...(a.override ? { override: a.override } : {}) });
		await ctx.runMutation(internal.slots.candidatesReady, { siteId: a.siteId, slotId: a.slotId, runId: a.runId, ok: out.ok, count: out.candidates, note: out.note });
	},
});

export const candidatesReady = internalMutation({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), runId: v.id("runs"), ok: v.boolean(), count: v.number(), note: v.string() },
	handler: async (ctx, { siteId, slotId, runId, ok, count, note }) => {
		const slot = await ctx.db.get(slotId);
		const site = await ctx.db.get(siteId);
		if (!slot || !site || slot.siteId !== siteId) return;
		if (slot.status !== "generating") {
			// The live agent already wrote the slot (candidates, selection or hold): settle the run with its note.
			await finishRun(ctx, runId, { status: ok ? "succeeded" : "failed", output: ok ? `${count} candidate${count === 1 ? "" : "s"}` : note.slice(0, 200) });
			return;
		}
		if (!ok) {
			await ctx.db.patch(slotId, { status: "failed" });
			await finishRun(ctx, runId, { status: "failed", output: "Image provider failed" });
			return;
		}
		await writeCandidates(ctx, slot, Array.from({ length: count }, () => ({})), runId);
		await ctx.db.patch(slotId, { status: "candidates", generatedAt: Date.now() });
		await finishRun(ctx, runId, { status: "succeeded", output: `${count} candidate${count === 1 ? "" : "s"}` });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: { system: VISUAL_AGENT }, action: "returned candidates", target: slot.name, detail: `${count} · ${slot.provider === "inline-svg" ? "diagram" : "generated"} · ${slot.provider} · ${slot.model}` });
		await onCandidates(ctx, site, slotId);
	},
});

/** Signed upload URL for a person's own image (assetsNode.attachUpload checks and stores it). */
export const uploadUrl = siteMutation({
	permission: "asset.manage",
	args: {},
	handler: async (ctx) => ctx.storage.generateUploadUrl(),
});
