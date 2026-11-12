// @vitest-environment edge-runtime
// Live CMS-agent path without the network: instructAgent queues a running run (the model call is a scheduled action
// we don't run here), saveSuggestions turns guarded edits into pending diffs, accepting a meta-description diff
// updates the post, and the on-page audit re-runs (keeping a logged override while the check still warns).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { refreshOnPage } from "./lib/onpage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

beforeEach(() => {
	process.env.CMS_AGENTS = "live";
});
afterEach(() => {
	delete process.env.CMS_AGENTS;
});

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const tolu = await ctx.db.insert("users", { clerkUserId: "tolu", tokenIdentifier: `${ISSUER}|tolu`, name: "Tolu B.", initials: "TB", email: "t@x.co", avatarHue: 1, status: "active" });
		const owner = await ctx.db.insert("users", { clerkUserId: "owner", tokenIdentifier: `${ISSUER}|owner`, name: "Amaka E.", initials: "AE", email: "o@x.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: tolu, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen Dental", domain: "lumendental.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		const pillarId = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keywordId = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId, term: "implant cost", termNormalized: "implant cost", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const postId = await ctx.db.insert("posts", {
			workspaceId: ws, siteId: site, slug: "implant-cost", title: "implant cost", seoTitle: "Implant cost in Lagos", keywordId, pillarId, intent: "commercial", contentType: "guide", source: "manual",
			state: "in-review", stateChangedAt: 0, owner: "human", week: 40, strongModel: false, words: 12, wordTarget: 800, blocks: [{ id: "b1", kind: "p", text: "Implant cost in Lagos depends on the implant and the crown." }, { id: "b2", kind: "h2", text: "What affects implant cost?" }], currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0,
		});
		return { site, postId };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	return { t, as, ...ids };
}

test("instructAgent (live) queues one running run; asking twice while it works is refused", async () => {
	const { t, as, site, postId } = await world();
	expect(await as("tolu").mutation(api.postEdits.instructAgent, { siteId: site, postId, instruction: "tighten the intro" })).toEqual({ ok: true });
	expect(await as("tolu").mutation(api.postEdits.instructAgent, { siteId: site, postId, instruction: "tighten the intro" })).toEqual({ ok: false, reason: "The agent is already working on that" });
	const runs = await t.run((ctx) => ctx.db.query("runs").collect());
	expect(runs.map((r) => [r.status, r.output])).toEqual([["running", 'Agent working · "tighten the intro"']]);
	expect(await t.run((ctx) => ctx.db.query("suggestions").collect())).toHaveLength(0); // nothing until the model answers
	await t.run(async (ctx) => {
		for (const j of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(j._id);
	});
});

test("guarded edits become pending diffs; a meta-description diff applies on accept and the audit re-runs", async () => {
	const { t, as, site, postId } = await world();
	const runId = await t.run(async (ctx) => (await ctx.db.insert("runs", { workspaceId: (await ctx.db.get(site))!.workspaceId, siteId: site, kind: "post-generation", trigger: "manual", status: "running", agent: "Blog writer agent", agentId: "post-generation", model: "qwen3.7-plus", inputTokens: 0, outputTokens: 0, costUsd: 0, estimateUsd: 0.06, budget: "text", startedAt: 0, output: "", idempotencyKey: "k", attempt: 1 })));
	const meta = "What implant cost in Lagos depends on, from the implant system to the crown, and the questions to ask before you book a consultation.";
	await t.mutation(internal.agentEdits.saveSuggestions, {
		siteId: site, postId, runId, version: 1, notes: "",
		meta: [{ taskId: "t1", instruction: "fix: meta description", fixesCheckId: "meta-description" }],
		result: { edits: [{ taskId: "t1", blockId: "b1", op: "replace", kind: "p", text: "Implant cost in Lagos depends on the implant system and the crown you choose." }], metaDescription: meta, dropped: [] },
	});
	const sg = await t.run((ctx) => ctx.db.query("suggestions").collect());
	expect(sg.map((s) => [s.field ?? "block", s.blockId, s.status])).toEqual([["block", "b1", "pending"], ["metaDescription", "", "pending"]]);
	expect((await t.run((ctx) => ctx.db.get(runId)))!).toMatchObject({ status: "succeeded", output: '2 suggestions ready · "fix: meta description"' });

	expect(await as("tolu").mutation(api.postEdits.acceptSuggestion, { siteId: site, postId, suggestionId: sg[1]!._id })).toEqual({ ok: true });
	const post = (await t.run((ctx) => ctx.db.get(postId)))!;
	expect(post.metaDescription).toBe(meta);
	expect(post.currentVersion).toBe(2);
	const checks = await t.run((ctx) => ctx.db.query("gateChecks").collect());
	expect(checks).toHaveLength(12);
	expect(checks.find((c) => c.checkId === "meta-description")).toMatchObject({ status: "pass", evaluatedForVersion: 2 });
});

test("a stale answer (the draft moved on) is cancelled, not offered", async () => {
	const { t, site, postId } = await world();
	const runId = await t.run(async (ctx) => (await ctx.db.insert("runs", { workspaceId: (await ctx.db.get(site))!.workspaceId, siteId: site, kind: "post-generation", trigger: "manual", status: "running", agent: "a", agentId: "post-generation", model: "qwen3.7-plus", inputTokens: 0, outputTokens: 0, costUsd: 0, estimateUsd: 0.06, budget: "text", startedAt: 0, output: "", idempotencyKey: "k2", attempt: 1 })));
	await t.mutation(internal.agentEdits.saveSuggestions, { siteId: site, postId, runId, version: 0, notes: "", meta: [{ taskId: "t1", instruction: "x" }], result: { edits: [], dropped: [] } });
	expect((await t.run((ctx) => ctx.db.get(runId)))!.status).toBe("cancelled");
});

test("refresh keeps a logged override while the check still warns, and drops it once it passes", async () => {
	const { t, postId } = await world();
	await t.run(async (ctx) => {
		const post = (await ctx.db.get(postId))!;
		await refreshOnPage(ctx, post);
		const row = (await ctx.db.query("gateChecks").withIndex("by_post_check", (q) => q.eq("postId", postId).eq("checkId", "faq")).unique())!;
		await ctx.db.patch(row._id, { override: { reason: "FAQ comes in the refresh", by: "Tolu B.", at: 0 } });
		await ctx.db.patch(postId, { currentVersion: 2 });
		await refreshOnPage(ctx, (await ctx.db.get(postId))!);
		expect((await ctx.db.get(row._id))!.override?.reason).toBe("FAQ comes in the refresh");
		const faqs = ["A?\nB.", "C?\nD.", "E?\nF.", "G?\nH."].map((text, i) => ({ id: `f${i}`, kind: "faq" as const, text }));
		await ctx.db.patch(postId, { blocks: [...post.blocks, ...faqs], currentVersion: 3 });
		await refreshOnPage(ctx, (await ctx.db.get(postId))!);
		const after = (await ctx.db.get(row._id))!;
		expect(after.status).toBe("pass");
		expect(after.override).toBeUndefined();
	});
});
