// @vitest-environment edge-runtime
// Spend ledger (handoff 03 step 2): holds check the cap atomically, settle swaps the hold for the real cost once,
// a settled key refuses a replay, and a run keeps the usage the agent recorded when it finishes.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import { finishRun } from "./lib/runs";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function world(textCapUsd = 1) {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd, imageCapUsd: 1 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		const runId = await ctx.db.insert("runs", { workspaceId: ws, siteId: site, kind: "post-generation", trigger: "manual", status: "running", agent: "Blog writer agent", agentId: "post-generation", model: "qwen3.7-plus", tier: "workhorse", inputTokens: 0, outputTokens: 0, costUsd: 0, estimateUsd: 1.8, budget: "text", startedAt: 0, output: "", idempotencyKey: "run1", attempt: 1 });
		return { site, runId };
	});
	const spent = () => t.run(async (ctx) => (await ctx.db.get(ids.site))!.spend.textMicroUsd);
	return { t, spent, ...ids };
}

test("hold refuses over the cap; settle credits the unused hold once; a settled key refuses a replay", async () => {
	const { t, spent, site, runId } = await world(1);
	expect(await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "k1", microUsd: 2_000_000 })).toMatchObject({ ok: false, message: expect.stringMatching(/up to \$2\.00 .* \$1\.00 left of \$1\.00/) });
	expect(await spent()).toBe(0);
	expect(await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "k1", microUsd: 600_000, runId })).toEqual({ ok: true });
	expect(await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "k1", microUsd: 600_000, runId })).toEqual({ ok: true }); // idempotent
	expect(await spent()).toBe(600_000);
	// A second concurrent call can't push past the cap while the first is held.
	expect((await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "k2", microUsd: 600_000 })).ok).toBe(false);
	await t.mutation(internal.spend.settle, { key: "k1", actualMicroUsd: 42_000 });
	await t.mutation(internal.spend.settle, { key: "k1", actualMicroUsd: 99_000 }); // no-op
	expect(await spent()).toBe(42_000);
	expect((await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "k1", microUsd: 1 })).ok).toBe(false);
	const entries = await t.run((ctx) => ctx.db.query("spendEntries").collect());
	expect(entries.map((e) => [e.type, e.amountMicroUsd, e.spentAfterMicroUsd])).toEqual([
		["debit", 600_000, 600_000],
		["credit", 558_000, 42_000],
	]);
});

test("a run keeps the usage the agent recorded when it finishes (no second debit)", async () => {
	const { t, spent, runId } = await world(5);
	await t.mutation(internal.spend.recordUsage, { runId, model: "qwen3.7-plus", tier: "workhorse", escalated: false, inputTokens: 4000, outputTokens: 3000, costMicroUsd: 38_000 });
	await t.run((ctx) => finishRun(ctx, runId, { status: "succeeded", output: "Draft ready" }));
	const run = (await t.run((ctx) => ctx.db.get(runId)))!;
	expect(run).toMatchObject({ status: "succeeded", costUsd: 0.038, inputTokens: 4000, outputTokens: 3000, model: "qwen3.7-plus" });
	expect(await spent()).toBe(0); // recordUsage never moves money; the ledger did
});
