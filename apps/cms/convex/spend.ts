// Spend ledger (handoff 03 step 2 / README §11): the wallet behind cappedInference, keyed by site + budget. Integer
// micro-dollars only. A hold debits the call's upper bound after checking the cap; settle swaps it for the real cost
// (credit the difference or debit the overage). Both are idempotent on the key, so a retried action can't double-charge.
// sites.spend is the month cache the caps read; every change to it goes through here or lib/runs.finishRun.
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { spendMonth } from "./lib/defaults";
import { notify, siteAudienceWith } from "./lib/notify";

const vBudget = v.union(v.literal("text"), v.literal("image"));
type TBudget = "text" | "image";

const fmt = (micro: number) => `$${(micro / 1e6).toFixed(2)}`;

function monthSpend(site: Doc<"sites">, month: string) {
	return site.spend.month === month ? site.spend : { month, textMicroUsd: 0, imageMicroUsd: 0 };
}

async function bump(ctx: MutationCtx, site: Doc<"sites">, budget: TBudget, month: string, deltaMicro: number) {
	const s = monthSpend(site, month);
	const next = budget === "image" ? { ...s, imageMicroUsd: Math.max(0, s.imageMicroUsd + deltaMicro) } : { ...s, textMicroUsd: Math.max(0, s.textMicroUsd + deltaMicro) };
	if (site.spend.month === month || month === spendMonth(Date.now())) await ctx.db.patch(site._id, { spend: next });
	return budget === "image" ? next.imageMicroUsd : next.textMicroUsd;
}

const entry = (ctx: MutationCtx, key: string) => ctx.db.query("spendEntries").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).unique();

export const hold = internalMutation({
	args: { siteId: v.id("sites"), budget: vBudget, key: v.string(), microUsd: v.number(), runId: v.optional(v.id("runs")) },
	handler: async (ctx, { siteId, budget, key, microUsd, runId }): Promise<{ ok: true } | { ok: false; message: string }> => {
		// A settled key means this exact call already ran and was paid for: a replay must not call the model unmetered.
		if (await entry(ctx, `${key}:settle`)) return { ok: false, message: "This model call already ran (replayed step)" };
		if (await entry(ctx, key)) return { ok: true };
		const site = await ctx.db.get(siteId);
		if (!site) return { ok: false, message: "Site not found" };
		const month = spendMonth(Date.now());
		const s = monthSpend(site, month);
		const spent = budget === "image" ? s.imageMicroUsd : s.textMicroUsd;
		const cap = Math.round((budget === "image" ? site.budgetCaps.imageCapUsd : site.budgetCaps.textCapUsd) * 1e6);
		const amount = Math.max(0, Math.ceil(microUsd));
		if (spent + amount > cap) return { ok: false, message: `Refused: this call could cost up to ${fmt(amount)} and the ${budget} budget has ${fmt(Math.max(0, cap - spent))} left of ${fmt(cap)}.` };
		const after = await bump(ctx, site, budget, month, amount);
		// Crossing 80% of the cap: tell the admins once this month (the run still goes ahead; over the cap it can't).
		if (spent < cap * 0.8 && after >= cap * 0.8) await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudienceWith(ctx, site, "budget.set"), tone: "human", title: `${budget === "text" ? "Text" : "Image"} budget at 80% of cap`, body: `${fmt(after)} of ${fmt(cap)} this month. Runs over the cap are refused.`, href: "/settings", dedupeKey: `cap80:${siteId}:${month}:${budget}` });
		await ctx.db.insert("spendEntries", { workspaceId: site.workspaceId, siteId, budget, month, type: "debit", amountMicroUsd: amount, reason: "hold", idempotencyKey: key, ...(runId ? { runId } : {}), spentAfterMicroUsd: after, createdAt: Date.now() });
		return { ok: true };
	},
});

export const settle = internalMutation({
	args: { key: v.string(), actualMicroUsd: v.number() },
	handler: async (ctx, { key, actualMicroUsd }) => {
		const h = await entry(ctx, key);
		if (!h) return;
		const sKey = `${key}:settle`;
		if (await entry(ctx, sKey)) return;
		const site = await ctx.db.get(h.siteId);
		if (!site) return;
		const actual = Math.max(0, Math.ceil(actualMicroUsd));
		const diff = actual - h.amountMicroUsd;
		const after = await bump(ctx, site, h.budget, h.month, diff);
		await ctx.db.insert("spendEntries", { workspaceId: h.workspaceId, siteId: h.siteId, budget: h.budget, month: h.month, type: diff > 0 ? "debit" : "credit", amountMicroUsd: Math.abs(diff), reason: `settle · actual ${fmt(actual)}`, idempotencyKey: sKey, ...(h.runId ? { runId: h.runId } : {}), spentAfterMicroUsd: after, createdAt: Date.now() });
	},
});

/** Records a run's measured usage on its row (the ledger already moved the money). */
export const recordUsage = internalMutation({
	args: { runId: v.id("runs"), model: v.string(), tier: v.union(v.literal("fast"), v.literal("workhorse"), v.literal("strongest")), escalated: v.boolean(), inputTokens: v.number(), outputTokens: v.number(), costMicroUsd: v.number() },
	handler: async (ctx, a) => {
		const run = await ctx.db.get(a.runId);
		if (!run) return;
		// A run with several calls (research + structuring) shows its highest tier and that tier's model.
		const ORDER = ["fast", "workhorse", "strongest"];
		const keep = run.tier && run.costUsd > 0 && ORDER.indexOf(run.tier) > ORDER.indexOf(a.tier);
		await ctx.db.patch(a.runId, { ...(keep ? {} : { model: a.model, tier: a.tier }), escalated: (run.escalated ?? false) || a.escalated, inputTokens: run.inputTokens + a.inputTokens, outputTokens: run.outputTokens + a.outputTokens, costUsd: Math.round((run.costUsd + a.costMicroUsd / 1e6) * 10000) / 10000 });
	},
});

