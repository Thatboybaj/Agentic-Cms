// @vitest-environment edge-runtime
// Handoff 02, first slice: ideas, generateNow, postPipeline with stub steps, run rows, cap refusals, transitions.
import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { transitionPost } from "./lib/transition";
import schema from "./schema";

// Eager: workflow handlers run with `process` hidden (determinism), and a lazy module import inside one would need
// process.platform. Loading everything up front keeps convex-test's loader out of the workflow sandbox.
const eager = import.meta.glob(["./**/*.*s", "!./convex.config.ts", "!./**/*.test.ts"], { eager: true });
const modules = Object.fromEntries(Object.entries(eager).map(([k, m]) => [k, async () => m]));
const ISSUER = "https://clerk.test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type TModules = Record<string, () => Promise<unknown>>;
const preload = async (mods: TModules): Promise<TModules> => {
	// convex.config.ts files only describe the component tree (batch-worker's has an import that breaks outside a
	// bundler) and components ship their own *.test.ts; both stay lazy (never loaded inside a workflow).
	const loaded = await Promise.all(Object.entries(mods).map(async ([k, f]) => [k, /(convex\.config|\.test)\.ts$/.test(k) ? null : await f()] as const));
	return Object.fromEntries(loaded.map(([k, m]) => [k, m === null ? mods[k]! : async () => m]));
};

/** Registers the workflow component (and its nested workpool + batch-worker) with every module preloaded, for the same reason. */
async function setup() {
	const t = convexTest(schema, modules);
	const calls: [string, unknown, TModules][] = [];
	const register = t.registerComponent.bind(t);
	(t as unknown as { registerComponent: (n: string, s: unknown, m: TModules) => void }).registerComponent = (n, s, m) => void calls.push([n, s, m]);
	workflowTest.register(t, "workflow");
	(t as unknown as { registerComponent: typeof register }).registerComponent = register;
	for (const [n, s, m] of calls) register(n, s as Parameters<typeof register>[1], await preload(m));
	return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function world(t: T, opts: { autopost?: boolean; hero?: "higgsfield" | "human"; textSpentUsd?: number } = {}) {
	return t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name: sub, initials: "XX", email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner");
		const kemi = await user("kemi");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: kemi, role: "member", status: "active", addedAt: 0 });
		const mk = (slug: string) =>
			ctx.db.insert("sites", {
				workspaceId: ws, slug, name: slug === "lumen" ? "Lumen Dental" : "Other", domain: `${slug}.co`, industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3,
				searchConsole: "missing", rankSource: null, budgetCaps: { textCapUsd: 100, imageCapUsd: 50 },
				spend: { month: "2026-11", textMicroUsd: Math.round((opts.textSpentUsd ?? 0) * 1e6), imageMicroUsd: 0 },
				publishing: { autopost: opts.autopost ?? false, autoMergeOnGreenCi: false },
				routing: { hero: opts.hero ?? "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
				modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" },
				brandPack: { voice: "", palette: [], styleKeywords: ["soft light"], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
			});
		const site = await mk("lumen");
		const other = await mk("other");
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: kemi, role: "stakeholder", addedAt: 0, addedBy: owner });
		await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 4, livePosts: 0, kasShare: 10, claimedButUnearned: false });
		await ctx.db.insert("pillars", { workspaceId: ws, siteId: other, name: "Other", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		return { site, other };
	});
}

const as = (t: T, sub = "owner") => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
const settle = (t: T) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function idea(t: T, siteId: Id<"sites">, topic = "how long do dental implants last") {
	const r = await as(t).mutation(api.posts.addIdea, { siteId, topic });
	if (!r.ok) throw new Error(r.reason);
	return r.id as Id<"posts">;
}

const actions = (t: T, postId: Id<"posts">) => t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((a) => a.postId === postId).map((a) => `${a.actor} · ${a.action}`));

describe("ideas", () => {
	test("addIdea: dedup, pillar required, store wording", async () => {
		const t = await setup();
		const { site } = await world(t);
		const id = await idea(t, site);
		expect(await as(t).mutation(api.posts.addIdea, { siteId: site, topic: "How long do  dental implants last" })).toEqual({ ok: false, reason: "Already in the plan (idea): how long do dental implants last" });
		expect(await as(t).mutation(api.posts.addIdea, { siteId: site, topic: "x" })).toEqual({ ok: false, reason: "Type a topic or paste a keyword" });
		const post = await t.run((ctx) => ctx.db.get(id));
		expect(post).toMatchObject({ state: "idea", owner: "human", ideaStatus: "pending", source: "manual" });
		expect(await actions(t, id)).toEqual(["owner · added idea"]);
	});

	test("approve (autopost off) briefs it and starts nothing; reject needs a note; stakeholders can't approve", async () => {
		const t = await setup();
		const { site } = await world(t);
		const id = await idea(t, site);
		const stakeholder = t.withIdentity({ subject: "kemi", issuer: ISSUER, tokenIdentifier: `${ISSUER}|kemi`, org_id: "org_1" });
		await expect(stakeholder.mutation(api.posts.approveIdea, { siteId: site, postId: id })).rejects.toMatchObject({ data: { code: "FORBIDDEN", reason: "Stakeholders can view and comment only" } });
		expect(await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id })).toEqual({ ok: true });
		expect(await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id })).toEqual({ ok: false, reason: "Only ideas wait for approval" });
		const post = await t.run((ctx) => ctx.db.get(id));
		expect(post).toMatchObject({ state: "briefed", owner: "agent", ideaStatus: "approved" });
		expect(post?.workflowId).toBeUndefined();
		const id2 = await idea(t, site, "teeth whitening sensitivity");
		expect(await as(t).mutation(api.posts.rejectIdea, { siteId: site, postId: id2, note: "no" })).toEqual({ ok: false, reason: "Add a short note: why not this idea?" });
		expect(await as(t).mutation(api.posts.rejectIdea, { siteId: site, postId: id2, note: "off brand" })).toEqual({ ok: true });
		expect((await as(t).query(api.posts.board, { siteId: site })).map((p) => p.title)).toEqual(["how long do dental implants last"]);
	});
});

describe("postPipeline", () => {
	test("generateNow (autopost off): draft v1, slots wait for a person, run settled and debited, pointer cleared", async () => {
		const t = await setup();
		const { site } = await world(t);
		const id = await idea(t, site);
		expect(await as(t).mutation(api.posts.generateNow, { siteId: site, postId: id })).toEqual({ ok: false, reason: "Approve the idea first · only an approved idea becomes a brief" });
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		const r = await as(t).mutation(api.posts.generateNow, { siteId: site, postId: id });
		expect(r.ok).toBe(true);
		expect(await as(t).mutation(api.posts.generateNow, { siteId: site, postId: id })).toEqual({ ok: false, reason: "Already generating · wait for the current run to finish" });
		await settle(t);
		const { post, slots, versions } = await as(t).query(api.posts.get, { siteId: site, postId: id });
		expect(post).toMatchObject({ state: "needs-assets", currentVersion: 1 });
		expect(post.workflowId).toBeUndefined();
		expect(post.blocks.length).toBeGreaterThan(3);
		expect(versions.map((v) => [v.n, v.origin])).toEqual([[1, "agent-generation"]]);
		expect(slots.map((s) => [s.name, s.status])).toEqual([["Hero", "candidates"], ["Data chart", "candidates"]]);
		const state = await t.run(async (ctx) => ({ run: (await ctx.db.query("runs").collect())[0]!, site: (await ctx.db.get(site))!, notes: (await ctx.db.query("notifications").collect()).map((n) => n.title) }));
		expect(state.run).toMatchObject({ status: "succeeded", kind: "post-generation", trigger: "manual", model: "claude-sonnet-5" });
		expect(state.site.spend.textMicroUsd).toBe(Math.round(state.run.costUsd * 1e6));
		expect(state.notes).toContain("Images need you");
		expect(await actions(t, id)).toEqual(["owner · added idea", "owner · approved idea", "owner · triggered run", "Blog writer agent · generated draft", "Visual-asset agent · returned candidates", "Visual-asset agent · returned candidates"]);
	});

	test("approveIdea under autopost runs the agents to In review with the autopost actor", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true });
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await settle(t);
		const { post, slots } = await as(t).query(api.posts.get, { siteId: site, postId: id });
		expect(post.state).toBe("in-review");
		expect(slots.every((s) => s.status === "selected")).toBe(true);
		expect(await actions(t, id)).toEqual([
			"owner · added idea",
			"owner · approved idea",
			"CMS agent (autopost) · triggered run",
			"CMS agent (autopost) · generated draft",
			"Visual-asset agent · selected asset",
			"Visual-asset agent · selected asset",
			"CMS agent (autopost) · moved to In review",
		]);
		const notes = await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).map((n) => n.title));
		expect(notes).toContain("Approval requested");
	});

	test("a human-only hero keeps the post in Needs assets even under autopost", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true, hero: "human" });
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await settle(t);
		const { post, slots } = await as(t).query(api.posts.get, { siteId: site, postId: id });
		expect(post.state).toBe("needs-assets");
		expect(slots.map((s) => [s.name, s.status])).toEqual([["Hero", "human-only"], ["Data chart", "selected"]]);
	});

	test("over the text cap: generateNow refused with a run row; autopost approval leaves it Briefed with a ledger item", async () => {
		const t = await setup();
		const { site } = await world(t, { textSpentUsd: 99.5 });
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		const r = await as(t).mutation(api.posts.generateNow, { siteId: site, postId: id });
		expect(r.ok).toBe(false);
		const runs = await t.run((ctx) => ctx.db.query("runs").collect());
		expect(runs.map((x) => x.status)).toEqual(["refused-over-cap"]);
		expect(await actions(t, id)).toContain("owner · run refused over cap");

		const t2 = await setup();
		const w2 = await world(t2, { autopost: true, textSpentUsd: 99.5 });
		const id2 = await idea(t2, w2.site);
		expect(await as(t2).mutation(api.posts.approveIdea, { siteId: w2.site, postId: id2 })).toEqual({ ok: true });
		const out = await t2.run(async (ctx) => ({ post: (await ctx.db.get(id2))!, ledger: (await ctx.db.query("ledgerItems").collect()).map((l) => [l.kind, l.title]) }));
		expect(out.post.state).toBe("briefed");
		expect(out.ledger).toEqual([["autopost-refused", "Autopost held: over the text cap · how long do dental implants last"]]);
	});

	test("paused sites don't generate; posts from another site are NOT_FOUND", async () => {
		const t = await setup();
		const { site, other } = await world(t);
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await t.run((ctx) => ctx.db.patch(site, { status: "paused" }));
		expect(await as(t).mutation(api.posts.generateNow, { siteId: site, postId: id })).toEqual({ ok: false, reason: "This site is paused · resume it to run agents" });
		await expect(as(t).mutation(api.posts.generateNow, { siteId: other, postId: id })).rejects.toBeInstanceOf(ConvexError);
	});
});

describe("transitions", () => {
	test("only TRANSITIONS edges; a stale `from` is refused (a late workflow step can't move a moved post)", async () => {
		const t = await setup();
		const { site } = await world(t);
		const id = await idea(t, site);
		await t.run(async (ctx) => {
			const post = (await ctx.db.get(id))!;
			expect(await transitionPost(ctx, post, "live")).toEqual({ ok: false, reason: "Only a merged MR makes a post Live. Approve it to open one." });
			expect((await transitionPost(ctx, post, "briefed")).ok).toBe(true);
			expect(await transitionPost(ctx, post, "drafting", { from: "idea" })).toEqual({ ok: false, reason: "The post moved on (now briefed)" });
			const moved = (await ctx.db.get(id))!;
			expect(moved).toMatchObject({ state: "briefed", owner: "agent" });
		});
	});
});
