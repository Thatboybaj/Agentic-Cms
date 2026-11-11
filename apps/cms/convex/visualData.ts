// Inputs and writes for the live visual-asset agent (agents/visual.ts): one slot's prototype-shaped inputs (via
// gateInputs), the stored asset rows (deduped on sha256 per site), and the agent's result as candidates. The only
// candidate writer for agent results (api-map §5 "slotsInternal.setCandidates").
import { v } from "convex/values";
import { AUTOPOST_ACTOR, VISUAL_AGENT } from "../src/lib/logic";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { gateInputs } from "./lib/gateInputs";
import { advanceAssets } from "./slots";
import { vCandidateSource } from "./schema";

export const forSlot = internalQuery({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots") },
	handler: async (ctx, { siteId, slotId }) => {
		const slot = await ctx.db.get(slotId);
		const site = await ctx.db.get(siteId);
		if (!slot || !site || slot.siteId !== siteId) return null;
		const post = await ctx.db.get(slot.postId);
		if (!post || post.siteId !== siteId) return null;
		const inputs = await gateInputs(ctx, site, post);
		const s = inputs.slots.find((x) => x.id === slotId);
		if (!s) return null;
		return {
			slot: s,
			post: inputs.post,
			keyword: inputs.keyword,
			brandPack: site.brandPack,
			remainingImageUsd: Math.max(0, site.budgetCaps.imageCapUsd - site.spend.imageMicroUsd / 1e6),
			autopost: site.publishing.autopost,
			humanOnlyAssets: !!site.publishing.humanOnlyAssets,
		};
	},
});

export const insertAsset = internalMutation({
	args: { siteId: v.id("sites"), storageId: v.id("_storage"), contentType: v.string(), bytes: v.number(), sha256: v.string(), width: v.optional(v.number()), height: v.optional(v.number()), kind: v.union(v.literal("original"), v.literal("svg"), v.literal("upload")), format: v.optional(v.string()), provenance: v.optional(vCandidateSource), createdBy: v.string() },
	handler: async (ctx, a): Promise<Id<"assets">> => {
		const dupe = await ctx.db.query("assets").withIndex("by_site_sha", (q) => q.eq("siteId", a.siteId).eq("sha256", a.sha256)).first();
		if (dupe) {
			await ctx.storage.delete(a.storageId); // same bytes already stored for this site
			return dupe._id;
		}
		const site = (await ctx.db.get(a.siteId))!;
		return ctx.db.insert("assets", { workspaceId: site.workspaceId, ...a, createdAt: Date.now() });
	},
});

const vCand = v.object({ label: v.string(), hue: v.number(), assetId: v.id("assets"), source: vCandidateSource });

/** The agent's candidates (or its hold). Autopost selects the first; otherwise a person picks. */
export const agentResult = internalMutation({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), runId: v.optional(v.id("runs")), candidates: v.array(vCand), held: v.optional(v.string()), detail: v.string(), provider: v.optional(v.string()), model: v.optional(v.string()) },
	handler: async (ctx, { siteId, slotId, runId, candidates, held, detail, provider, model }) => {
		const slot = await ctx.db.get(slotId);
		const site = await ctx.db.get(siteId);
		if (!slot || !site || slot.siteId !== siteId) return;
		for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(50)) await ctx.db.delete(c._id);
		if (held || !candidates.length) {
			await ctx.db.patch(slotId, { status: "failed" });
			const dedupeKey = `slot-held:${slotId}`;
			const open = await ctx.db.query("ledgerItems").withIndex("by_site_dedupe", (q) => q.eq("siteId", siteId).eq("dedupeKey", dedupeKey)).first();
			if (!open || open.done) await ctx.db.insert("ledgerItems", { siteId, title: `${slot.name} · the visual agent couldn't fill it`, owner: "Content specialist", createdAt: Date.now(), downstream: (held ?? "No route could fill this slot").slice(0, 200), postId: slot.postId, slotId, origin: "system", dedupeKey, done: false });
			await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: { system: VISUAL_AGENT }, action: "held slot", target: slot.name, detail: (held ?? detail).slice(0, 200) });
			return;
		}
		const auto = site.publishing.autopost;
		let first: Id<"candidates"> | undefined;
		for (let i = 0; i < candidates.length; i++) {
			const c = candidates[i]!;
			const id = await ctx.db.insert("candidates", { siteId, postId: slot.postId, slotId, label: c.label, hue: c.hue, selected: auto && i === 0, assetId: c.assetId, source: c.source, ...(runId ? { runId } : {}), createdAt: Date.now() });
			if (i === 0) first = id;
		}
		await ctx.db.patch(slotId, { status: auto ? "selected" : "candidates", generatedAt: Date.now(), ...(auto && first ? { selectedCandidateId: first } : {}), ...(provider ? { provider: provider as never } : {}), ...(model ? { model } : {}) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: { system: VISUAL_AGENT }, action: auto ? "selected asset" : "returned candidates", target: slot.name, detail: `${candidates.length} · ${detail}${auto ? ` · ${AUTOPOST_ACTOR}` : ""}`.slice(0, 200) });
		if (auto) await advanceAssets(ctx, site, slot.postId);
	},
});

/** A person's own upload, stored and checked (content type + size) before it becomes the slot's selected candidate. */
export const attachUpload = internalMutation({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), assetId: v.id("assets"), fileName: v.string(), by: v.string() },
	handler: async (ctx, { siteId, slotId, assetId, fileName, by }) => {
		const slot = await ctx.db.get(slotId);
		const site = await ctx.db.get(siteId);
		if (!slot || !site || slot.siteId !== siteId) return;
		for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", slotId)).take(50)) await ctx.db.delete(c._id);
		const id = await ctx.db.insert("candidates", { siteId, postId: slot.postId, slotId, label: fileName, hue: 200, selected: true, assetId, source: { kind: "upload", provider: "human", creator: by }, createdAt: Date.now() });
		await ctx.db.patch(slotId, { provider: "human", model: "upload", status: "selected", generatedAt: Date.now(), selectedCandidateId: id });
		for (const l of await ctx.db.query("ledgerItems").withIndex("by_post", (q) => q.eq("postId", slot.postId)).take(100)) if (!l.done && l.slotId === slotId) await ctx.db.patch(l._id, { done: true, doneAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId: slot.postId, actor: { system: by }, action: "uploaded asset", target: slot.name, detail: `${fileName} → ${slot.filename}` });
		await advanceAssets(ctx, site, slot.postId);
	},
});
