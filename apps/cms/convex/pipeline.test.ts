// @vitest-environment edge-runtime
// Handoff 02: ideas, generateNow, postPipeline with stub steps, run rows, cap refusals, transitions (slice 1);
// autopost gate, shipPost, CI and merge events, human approval (slice 2).
import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
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

async function world(t: T, opts: { autopost?: boolean; autoMerge?: boolean; hero?: "higgsfield" | "human"; textSpentUsd?: number } = {}) {
	return t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name: sub, initials: "XX", email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner");
		const kemi = await user("kemi");
		const dev = await user("dev");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: kemi, role: "member", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: dev, role: "member", status: "active", addedAt: 0 });
		const mk = (slug: string) =>
			ctx.db.insert("sites", {
				workspaceId: ws, slug, name: slug === "lumen" ? "Lumen Dental" : "Other", domain: `${slug}.co`, industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3,
				searchConsole: "missing", rankSource: null, budgetCaps: { textCapUsd: 100, imageCapUsd: 50 },
				spend: { month: "2026-11", textMicroUsd: Math.round((opts.textSpentUsd ?? 0) * 1e6), imageMicroUsd: 0 },
				publishing: { autopost: opts.autopost ?? false, autoMergeOnGreenCi: opts.autoMerge ?? false },
				routing: { hero: opts.hero ?? "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
				modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" },
				brandPack: { voice: "", palette: [], styleKeywords: ["soft light"], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
			});
		const site = await mk("lumen");
		const other = await mk("other");
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: kemi, role: "stakeholder", addedAt: 0, addedBy: owner });
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: dev, role: "developer", addedAt: 0, addedBy: owner });
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

/** A GitHub repo and a confirmed template manifest (mappings cover the stub draft's structures). */
async function connect(t: T, siteId: Id<"sites">, opts: { repo?: boolean; manifest?: boolean } = {}) {
	await t.run(async (ctx) => {
		const site = (await ctx.db.get(siteId))!;
		const owner = (await ctx.db.query("users").withIndex("by_clerkUser", (q) => q.eq("clerkUserId", "owner")).unique())!;
		if (opts.repo !== false)
			await ctx.db.insert("repoConnections", { workspaceId: site.workspaceId, siteId, host: "github", repo: "lumen/lumendental.co", baseBranch: "main", contentDir: "content/blog", assetDir: "public/images/blog", branchPattern: "content/{slug}", installedAs: "agentic-cms", installationId: "1", status: "active", connectedBy: owner._id, connectedAt: 0 });
		if (opts.manifest !== false)
			await ctx.db.insert("templateManifests", { siteId, version: 3, source: "lumen-site.zip", kind: "zip", output: "mdx", status: "confirmed", mappings: [{ id: "m1", selector: "article", role: "content-region", status: "mapped", detail: "" }], bundleFiles: 1, bundleBytes: 1, uploadedBy: owner._id, uploadedAt: 0 });
	});
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

	test("approveIdea under autopost runs the agents, then the gate holds it (no repo connected)", async () => {
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
			"CMS agent (autopost) · held autopost",
		]);
		const out = await t.run(async (ctx) => ({ notes: (await ctx.db.query("notifications").collect()).map((n) => n.title), ledger: (await ctx.db.query("ledgerItems").collect()).map((l) => l.title) }));
		expect(out.notes).toContain("Autopost held a post");
		expect(out.ledger).toEqual(["Autopost held: No repo connected · the MR has nowhere to open"]);
	});

	test("a human-only hero (not pinned) goes to the gate under autopost, which would fill it", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true, hero: "human" });
		await connect(t, site);
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await settle(t);
		const { post, slots } = await as(t).query(api.posts.get, { siteId: site, postId: id });
		expect(post.state).toBe("mr-open");
		expect(slots.map((s) => [s.name, s.status])).toEqual([["Hero", "selected"], ["Data chart", "selected"]]);
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

// ─── Slice 2: autopost gate, ship, CI, merge, human approval ──────────────────

type TCheck = { checkId: string; label: string; section: number; status: "pass" | "fail" | "warn"; value: string; severity: "hard" | "soft" };

/** A post already drafted, in `state`, with one hero slot, optional gate checks and an open fact marker. */
async function seedPost(t: T, siteId: Id<"sites">, opts: { state: "needs-assets" | "in-review"; checks?: TCheck[]; claim?: string; pinned?: boolean }) {
	return t.run(async (ctx) => {
		const site = (await ctx.db.get(siteId))!;
		const pillar = (await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).first())!;
		const keywordId = await ctx.db.insert("keywords", { workspaceId: site.workspaceId, siteId, pillarId: pillar._id, term: "implant cost", termNormalized: "implant cost", intent: "commercial", difficulty: 10, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const text = opts.claim ? `Implants are common. ${opts.claim} at our clinic. Ask us anything.` : "Implant cost explained for adults.";
		const postId = await ctx.db.insert("posts", {
			workspaceId: site.workspaceId, siteId, slug: "implant-cost", title: "implant cost", seoTitle: "Implant cost in Lagos", keywordId, pillarId: pillar._id, intent: "commercial", contentType: "guide", source: "manual",
			state: opts.state, stateChangedAt: 0, owner: "agent", week: 40, strongModel: false, words: 900, wordTarget: 800,
			blocks: [{ id: "b1", kind: "p", text }], currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0,
		});
		await ctx.db.insert("postVersions", { siteId, postId, n: 1, origin: "agent-generation", actor: "Blog writer agent", at: 0, words: 900, blocks: [{ id: "b1", kind: "p", text }] });
		for (const c of opts.checks ?? []) await ctx.db.insert("gateChecks", { siteId, postId, ...c, evaluatedAt: 0, evaluatedForVersion: 1 });
		if (opts.claim) await ctx.db.insert("factMarkers", { siteId, postId, blockId: "b1", claim: opts.claim, status: "open", note: "No source" });
		await ctx.db.insert("imageSlots", { siteId, postId, name: "Hero", type: "hero", placement: "Top", width: 1600, height: 900, format: "webp", breakpoints: [640], filename: "h.webp", alt: "a", prompt: "p", styleKeywords: [], provider: "higgsfield", model: "m", status: opts.pinned ? "human-only" : "selected", ...(opts.pinned ? { humanPinned: true } : {}), estimateUsd: 0.18, order: 0 });
		return postId;
	});
}

const mrOf = (t: T, postId: Id<"posts">) => t.run(async (ctx) => (await ctx.db.query("mergeRequests").withIndex("by_post", (q) => q.eq("postId", postId)).first())!);
const postOf = (t: T, postId: Id<"posts">) => t.run(async (ctx) => (await ctx.db.get(postId))!);
const openLedger = (t: T) => t.run(async (ctx) => (await ctx.db.query("ledgerItems").collect()).filter((l) => !l.done).map((l) => l.title));
const asDev = (t: T) => t.withIdentity({ subject: "dev", issuer: ISSUER, tokenIdentifier: `${ISSUER}|dev`, org_id: "org_1" });

describe("autopost gate → ship → CI → merge", () => {
	test("golden: approve idea → … → MR → green CI → auto-merged → Live, with the prototype's audit trail", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true, autoMerge: true });
		await connect(t, site);
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await settle(t);
		expect((await postOf(t, id)).state).toBe("mr-open");
		const mr = await mrOf(t, id);
		expect(mr).toMatchObject({ status: "open", ci: "pending", autopost: true, number: 1, branch: "content/how-long-do-dental-implants-last", base: "main", postVersion: 1, manifestVersion: 3 });
		expect(mr.description).toContain("**Shipped by** CMS agent (autopost)");
		await t.mutation(internal.git.onCi, { mrId: mr._id, ci: "passing" });
		await settle(t);
		const post = await postOf(t, id);
		expect(post.state).toBe("live");
		expect(post.liveAt).toEqual(expect.any(Number));
		expect((await mrOf(t, id)).status).toBe("merged");
		// The stub draft is under its word target, so the derived "Word count" soft block is accepted with the autopost reason.
		expect((await actions(t, id)).slice(-5)).toEqual(["Visual-asset agent · selected asset", "CMS agent (autopost) · accepted soft block", "CMS agent (autopost) · approved", "CMS agent (autopost) · opened MR", "CMS agent (autopost) · merged"]);
		const merged = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).find((a) => a.action === "merged")!);
		expect(merged.detail).toContain("auto-merged on green CI");
		const kas = await t.run(async (ctx) => (await ctx.db.query("runs").collect()).filter((r) => r.kind === "kas-recalc").map((r) => r.status));
		expect(kas).toEqual(["queued"]);
	});

	test("holds: no repo, no manifest, unfixable hard check, pinned human-only slot — In review + ledger, no MR", async () => {
		const cases: [string, (t: T, s: Id<"sites">) => Promise<Id<"posts">>, string][] = [
			["no repo", async (t, s) => (await connect(t, s, { repo: false }), seedPost(t, s, { state: "needs-assets" })), "Autopost held: No repo connected · the MR has nowhere to open"],
			["no manifest", async (t, s) => (await connect(t, s, { manifest: false }), seedPost(t, s, { state: "needs-assets" })), "Autopost held: Template can't render the post · no confirmed manifest"],
			["hard check", async (t, s) => (await connect(t, s), seedPost(t, s, { state: "needs-assets", checks: [{ checkId: "schema", label: "Article schema", section: 3, status: "fail", value: "Missing", severity: "hard" }] })), "Autopost held: On-page check needs a person · Article schema (section 3)"],
			["pinned slot", async (t, s) => (await connect(t, s), seedPost(t, s, { state: "needs-assets", pinned: true })), "Autopost held: Waiting on a human-made image · Hero"],
		];
		for (const [name, make, title] of cases) {
			const t = await setup();
			const { site } = await world(t, { autopost: true, autoMerge: true });
			const id = await make(t, site);
			expect(await as(t).mutation(api.posts.shipNow, { siteId: site, postId: id }), name).toEqual({ ok: true });
			await settle(t);
			expect((await postOf(t, id)).state, name).toBe("in-review");
			expect(await openLedger(t), name).toEqual([title]);
			expect(await t.run((ctx) => ctx.db.query("mergeRequests").collect()), name).toEqual([]);
		}
	});

	test("open fact marker: rewritten without the claim (agent-edit version), then ships; never ships with it open", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true });
		await connect(t, site);
		const id = await seedPost(t, site, { state: "needs-assets", claim: "95% of patients heal in a week" });
		await as(t).mutation(api.posts.shipNow, { siteId: site, postId: id });
		await settle(t);
		const post = await postOf(t, id);
		expect(post.state).toBe("mr-open");
		expect(post.currentVersion).toBe(2);
		expect(post.blocks[0]!.text).toContain("Most patients heal in a week");
		const facts = await t.run((ctx) => ctx.db.query("factMarkers").collect());
		expect(facts.map((f) => [f.status, f.resolution])).toEqual([["resolved", "rewritten"]]);
		expect(await actions(t, id)).toContain("CMS agent (autopost) · rewrote unsourced claim");
		const versions = await t.run((ctx) => ctx.db.query("postVersions").collect());
		expect(versions.map((v) => v.origin)).toEqual(["agent-generation", "agent-edit"]);
		expect((await mrOf(t, id)).postVersion).toBe(2);
	});

	test("a fixable hard check is fixed; a soft warn is accepted with the autopost reason", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true });
		await connect(t, site);
		const id = await seedPost(t, site, {
			state: "needs-assets",
			checks: [
				{ checkId: "kw-first-100", label: "Keyword in first 100 words", section: 2, status: "fail", value: "Missing", severity: "hard" },
				{ checkId: "internal-links", label: "Internal links", section: 6, status: "warn", value: "1 · soft", severity: "soft" },
			],
		});
		await as(t).mutation(api.posts.shipNow, { siteId: site, postId: id });
		await settle(t);
		expect((await postOf(t, id)).state).toBe("mr-open");
		const checks = await t.run((ctx) => ctx.db.query("gateChecks").collect());
		expect(checks.map((c) => [c.checkId, c.status, c.override?.reason ?? null])).toEqual([["kw-first-100", "pass", null], ["internal-links", "warn", "Autopost · agent accepted soft block"]]);
		expect(await actions(t, id)).toEqual(expect.arrayContaining(["CMS agent (autopost) · fixed check", "CMS agent (autopost) · accepted soft block", "CMS agent (autopost) · approved"]));
	});

	test("red CI: stays open with the CI detail, audited, never merged", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true, autoMerge: true });
		await connect(t, site);
		const id = await seedPost(t, site, { state: "needs-assets" });
		await as(t).mutation(api.posts.shipNow, { siteId: site, postId: id });
		await settle(t);
		const mr = await mrOf(t, id);
		await t.mutation(internal.git.onCi, { mrId: mr._id, ci: "failing", detail: "lint: 2 errors" });
		await settle(t);
		expect(await mrOf(t, id)).toMatchObject({ status: "open", ci: "failing", ciDetail: "lint: 2 errors" });
		expect((await postOf(t, id)).state).toBe("mr-open");
		expect(await actions(t, id)).toContain("CMS agent (autopost) · stopped at red CI");
	});

	test("green CI for a stale head (post edited after approval) does not auto-merge", async () => {
		const t = await setup();
		const { site } = await world(t, { autopost: true, autoMerge: true });
		await connect(t, site);
		const id = await seedPost(t, site, { state: "needs-assets" });
		await as(t).mutation(api.posts.shipNow, { siteId: site, postId: id });
		await settle(t);
		await t.run((ctx) => ctx.db.patch(id, { currentVersion: 2 }));
		await t.mutation(internal.git.onCi, { mrId: (await mrOf(t, id))._id, ci: "passing" });
		await settle(t);
		expect((await mrOf(t, id)).status).toBe("open");
	});
});

describe("human approval", () => {
	test("autopost off: soft blocks need a logged reason; the MR waits for a developer even on green CI", async () => {
		const t = await setup();
		const { site } = await world(t, { autoMerge: true });
		await connect(t, site);
		const id = await seedPost(t, site, { state: "in-review", checks: [{ checkId: "internal-links", label: "Internal links", section: 6, status: "warn", value: "1 · soft", severity: "soft" }] });
		expect(await as(t).mutation(api.posts.approve, { siteId: site, postId: id })).toEqual({ ok: false, reason: "Soft blocks need a logged reason to override" });
		expect(await as(t).mutation(api.posts.approve, { siteId: site, postId: id, overrides: [{ checkId: "internal-links", reason: "ok" }] })).toEqual({ ok: false, reason: "Give each override a reason (8+ characters)" });
		expect(await as(t).mutation(api.posts.approve, { siteId: site, postId: id, overrides: [{ checkId: "internal-links", reason: "Links added in the next refresh" }] })).toEqual({ ok: true });
		await settle(t);
		const mr = await mrOf(t, id);
		expect(mr.autopost).toBeUndefined();
		expect(mr.overrides).toEqual(["Internal links 1 · soft: Links added in the next refresh"]);
		await t.mutation(internal.git.onCi, { mrId: mr._id, ci: "passing" });
		await settle(t);
		expect((await mrOf(t, id)).status).toBe("open");
		await expect(as(t, "kemi").mutation(api.git.mergeMr, { siteId: site, mrId: mr._id })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
		expect(await asDev(t).mutation(api.git.mergeMr, { siteId: site, mrId: mr._id })).toEqual({ ok: true });
		await settle(t);
		expect((await postOf(t, id)).state).toBe("live");
		expect(await actions(t, id)).toEqual(expect.arrayContaining(["owner · overrode soft block", "owner · approved", "CMS agent · opened MR", "dev · merged"]));
	});

	test("hard blocks can't be approved around: an open fact marker is named", async () => {
		const t = await setup();
		const { site } = await world(t);
		await connect(t, site);
		const id = await seedPost(t, site, { state: "in-review", claim: "99% of people love it" });
		expect(await as(t).mutation(api.posts.approve, { siteId: site, postId: id })).toEqual({ ok: false, reason: "1 hard block: 1 unresolved fact marker" });
	});
});

// ─── Slice 3: send back + revise, edits after approval, schedules ─────────────

describe("send back → revise", () => {
	test("needs a note; drafting with the note and a comment; the writer returns it to review with a new version", async () => {
		const t = await setup();
		const { site } = await world(t);
		const id = await seedPost(t, site, { state: "in-review" });
		await t.run(async (ctx) => void (await ctx.db.insert("ledgerItems", { siteId: site, title: "Review implant cost", owner: "Content specialist", createdAt: 0, downstream: "", postId: id, origin: "human", done: false })));
		expect(await as(t).mutation(api.review.sendBack, { siteId: site, postId: id, note: "  " })).toEqual({ ok: false, reason: "Tell the agent what to change" });
		expect(await as(t).mutation(api.review.sendBack, { siteId: site, postId: id, note: "Add a cost table" })).toEqual({ ok: true });
		const mid = await postOf(t, id);
		expect(mid).toMatchObject({ state: "drafting", sendBackNote: "Add a cost table" });
		expect(await as(t).mutation(api.review.sendBack, { siteId: site, postId: id, note: "again" })).toEqual({ ok: false, reason: "Only posts in review can be sent back" });
		await settle(t);
		const post = await postOf(t, id);
		expect(post).toMatchObject({ state: "in-review", currentVersion: 2 });
		expect(post.sendBackNote).toBeUndefined();
		expect(post.workflowId).toBeUndefined();
		const out = await t.run(async (ctx) => ({
			versions: (await ctx.db.query("postVersions").collect()).map((v) => [v.n, v.origin, v.note ?? null]),
			comments: (await ctx.db.query("comments").collect()).map((c) => c.text),
			notes: (await ctx.db.query("notifications").collect()).map((n) => n.title),
			ledger: (await ctx.db.query("ledgerItems").collect()).map((l) => l.done),
			run: (await ctx.db.query("runs").collect()).map((r) => [r.status, r.output]),
		}));
		expect(out.versions).toEqual([[1, "agent-generation", null], [2, "agent-edit", 'Revised from note: "Add a cost table"']]);
		expect(out.comments).toEqual(["Sent back: Add a cost table"]);
		expect(out.notes).toContain("Revision ready");
		expect(out.ledger).toEqual([true]);
		expect(out.run).toEqual([["succeeded", "Revision ready for review"]]);
		expect(await actions(t, id)).toContain("owner · sent back");
	});
});

describe("editor", () => {
	test("an edit after the MR opened sends the post back to review; stale base versions are refused; removing a claim resolves it", async () => {
		const t = await setup();
		const { site } = await world(t);
		await connect(t, site);
		const id = await seedPost(t, site, { state: "in-review", claim: "90% of people agree" });
		expect(await as(t).mutation(api.editor.editBlock, { siteId: site, postId: id, blockId: "b1", text: "Implants are common. Ask us anything.", baseVersion: 1 })).toEqual({ ok: true });
		expect((await t.run((ctx) => ctx.db.query("factMarkers").collect())).map((f) => f.status)).toEqual(["resolved"]);
		expect(await as(t).mutation(api.editor.editBlock, { siteId: site, postId: id, blockId: "b1", text: "x", baseVersion: 1 })).toEqual({ ok: false, reason: "Someone changed this block" });
		expect(await as(t).mutation(api.posts.approve, { siteId: site, postId: id })).toEqual({ ok: true });
		await settle(t);
		const shipped = await postOf(t, id);
		expect(shipped.state).toBe("mr-open");
		expect(await as(t).mutation(api.editor.editBlock, { siteId: site, postId: id, blockId: "b1", text: "Implants are common. Book a consult.", baseVersion: shipped.currentVersion })).toEqual({ ok: true });
		const edited = await postOf(t, id);
		expect(edited.state).toBe("in-review");
		expect(edited.currentVersion).toBeGreaterThan(edited.approvedVersion!);
		expect((await mrOf(t, id)).status).toBe("open"); // the PR stays; the next approval updates it
		expect(await actions(t, id)).toContain("owner · moved to In review");
	});
});

describe("schedules", () => {
	async function schedule(t: T, siteId: Id<"sites">, kind: "keyword-swarm" | "post-generation" | "link-prospecting", opts: { due?: boolean; enabled?: boolean } = {}) {
		return t.run((ctx) =>
			ctx.db.insert("schedules", { siteId, kind, label: kind, cadence: "", rule: kind === "post-generation" ? "per-publish-slot" : "weekly:mon@07:00", produces: "", nextAt: opts.due === false ? Date.now() + 86_400_000 : Date.now() - 1000, enabled: opts.enabled ?? true }),
		);
	}

	test("tick starts a due keyword swarm once; its ideas land in Idea, deduped; the slot advances", async () => {
		const t = await setup();
		const { site } = await world(t);
		await idea(t, site, "dental cost guide"); // the stub swarm proposes this term too: deduped
		const sid = await schedule(t, site, "keyword-swarm");
		expect(await t.mutation(internal.schedules.tick, {})).toEqual({ due: 1, started: 1 });
		expect(await t.mutation(internal.schedules.tick, {})).toEqual({ due: 0, started: 0 });
		await settle(t);
		const out = await t.run(async (ctx) => ({
			sched: (await ctx.db.get(sid))!,
			runs: (await ctx.db.query("runs").collect()).map((r) => [r.kind, r.trigger, r.status, r.output]),
			ideas: (await ctx.db.query("posts").collect()).filter((p) => p.source === "keyword-swarm").map((p) => p.title).sort(),
		}));
		expect(out.sched.nextAt).toBeGreaterThan(Date.now());
		expect(out.runs).toEqual([["keyword-swarm", "scheduled", "succeeded", "3 ideas · 1 deduplicated against live and planned · 2 new in Idea"]]);
		expect(out.ideas).toEqual(["dental near me", "how to choose a dental provider"]);
	});

	test("paused sites and disabled schedules don't run; per-publish-slot generates the oldest due briefed post", async () => {
		const t = await setup();
		const { site } = await world(t);
		await schedule(t, site, "keyword-swarm", { enabled: false });
		const id = await idea(t, site);
		await as(t).mutation(api.posts.approveIdea, { siteId: site, postId: id });
		await t.run((ctx) => ctx.db.patch(id, { week: 1 }));
		await schedule(t, site, "post-generation");
		await t.run((ctx) => ctx.db.patch(site, { status: "paused" }));
		expect(await t.mutation(internal.schedules.tick, {})).toEqual({ due: 1, started: 0 });
		await t.run(async (ctx) => {
			await ctx.db.patch(site, { status: "active" });
			for (const s of await ctx.db.query("schedules").collect()) if (s.enabled) await ctx.db.patch(s._id, { nextAt: Date.now() - 1000 });
		});
		expect(await t.mutation(internal.schedules.tick, {})).toEqual({ due: 1, started: 1 });
		await settle(t);
		expect((await postOf(t, id)).state).toBe("needs-assets");
	});

	test("runNow: permission, refusals with the prototype's wording, and a failing artifact settles as failed", async () => {
		const t = await setup();
		const { site } = await world(t);
		await expect(as(t, "kemi").mutation(api.schedules.runNow, { siteId: site, kind: "qa-sweep" })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
		expect(await as(t).mutation(api.schedules.runNow, { siteId: site, kind: "post-generation" })).toEqual({ ok: false, reason: "No briefed posts to generate. Promote an idea first" });
		expect((await as(t).mutation(api.schedules.runNow, { siteId: site, kind: "link-prospecting" })).ok).toBe(true);
		await settle(t);
		const runs = await t.run((ctx) => ctx.db.query("runs").collect());
		expect(runs.map((r) => [r.kind, r.trigger, r.status, r.output])).toEqual([["link-prospecting", "manual", "failed", "Failed: no Ahrefs or Semrush connection for backlink data."]]);
		expect(await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((a) => a.action))).toContain("triggered run");
	});

	test("toggle pauses and resumes with the prototype's audit wording", async () => {
		const t = await setup();
		const { site } = await world(t);
		await schedule(t, site, "keyword-swarm");
		await as(t).mutation(api.schedules.toggle, { siteId: site, kind: "keyword-swarm" });
		await as(t).mutation(api.schedules.toggle, { siteId: site, kind: "keyword-swarm" });
		expect(await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((a) => a.action))).toEqual(["paused schedule", "resumed schedule"]);
	});
});

describe("spend", () => {
	test("stub runs cost $0; a measured cost is debited once, even if the run is settled twice", async () => {
		const t = await setup();
		const { site } = await world(t);
		await t.run(async (ctx) => {
			const s = (await ctx.db.get(site))!;
			const { createRun, finishRun } = await import("./lib/runs");
			const est = { usd: 1, budget: "text" as const, tier: "workhorse" as const };
			const free = await createRun(ctx, { site: s, kind: "qa-sweep", trigger: "manual", estimate: est, idempotencyKey: "k1", output: "" });
			await finishRun(ctx, free, { status: "succeeded", output: "ok" });
			const paid = await createRun(ctx, { site: s, kind: "qa-sweep", trigger: "manual", estimate: est, idempotencyKey: "k2", output: "" });
			await finishRun(ctx, paid, { status: "succeeded", output: "ok", costUsd: 0.42 });
			await finishRun(ctx, paid, { status: "succeeded", output: "again", costUsd: 0.42 });
			expect((await ctx.db.get(site))!.spend.textMicroUsd).toBe(420_000);
		});
	});
});
