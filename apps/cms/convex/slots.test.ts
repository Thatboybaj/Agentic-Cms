// @vitest-environment edge-runtime
// Image pipeline (api-map §5) and the developer's MR actions (§6) on Convex: pick / use, human-only, upload,
// regenerate (budget), visual-agent results, routing; mergeMr / rebaseMr refusals. Autopost is off here, so no
// workflow starts (the autopost hand-off is covered in pipeline.test.ts).
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

async function world(opts: { imageCapUsd?: number } = {}) {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string, name: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name, initials: name.slice(0, 2).toUpperCase(), email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner", "Amaka E.");
		const tolu = await user("tolu", "Tolu B.");
		const dev = await user("dev", "Dayo D.");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		for (const u of [tolu, dev]) await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: u, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen Dental", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: opts.imageCapUsd ?? 50 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: dev, role: "developer", addedAt: 0, addedBy: owner });
		const pillarId = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keywordId = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId, term: "implant cost", termNormalized: "implant cost", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const postId = await ctx.db.insert("posts", {
			workspaceId: ws, siteId: site, slug: "implant-cost", title: "implant cost", seoTitle: "Implant cost", keywordId, pillarId, intent: "commercial", contentType: "guide", source: "manual",
			state: "needs-assets", stateChangedAt: 0, owner: "agent", week: 40, strongModel: false, words: 10, wordTarget: 800, blocks: [{ id: "b1", kind: "p", text: "Implants." }], currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0,
		});
		const slot = (name: string, type: "hero" | "diagram" | "chart", status: "candidates" | "selected", order: number) =>
			ctx.db.insert("imageSlots", { siteId: site, postId, name, type, placement: "top", width: 1600, height: 900, format: type === "chart" ? "svg" : "webp", breakpoints: [], filename: `implant-cost-${name}.webp`, alt: name, prompt: "a smile", styleKeywords: [], provider: type === "chart" ? "inline-svg" : "higgsfield", model: "higgsfield-preset", status, estimateUsd: type === "chart" ? 0 : 0.18, order });
		const hero = await slot("hero", "hero", "candidates", 0);
		const diagram = await slot("diagram", "diagram", "selected", 1);
		const chart = await slot("chart", "chart", "selected", 2);
		const c1 = await ctx.db.insert("candidates", { siteId: site, postId, slotId: hero, label: "candidate 1", hue: 10, selected: false, createdAt: 0 });
		const c2 = await ctx.db.insert("candidates", { siteId: site, postId, slotId: hero, label: "candidate 2", hue: 20, selected: false, createdAt: 0 });
		const repo = await ctx.db.insert("repoConnections", { workspaceId: ws, siteId: site, host: "github", repo: "lumen/lumendental.co", baseBranch: "main", contentDir: "content/blog", assetDir: "public/images/blog", branchPattern: "content/{slug}", installedAs: "agentic-cms", installationId: "1", status: "active", connectedBy: owner, connectedAt: 0 });
		const mr = (status: "open" | "conflict", ci: "pending" | "passing" | "failing", number: number) =>
			ctx.db.insert("mergeRequests", { workspaceId: ws, siteId: site, repoConnectionId: repo, host: "github", repo: "lumen/lumendental.co", number, branch: `content/p${number}`, base: "main", status, ci, files: [], openedAt: 0, overrides: [], ...(status === "conflict" ? { conflictDetail: "index.ts" } : {}) });
		return { site, postId, hero, diagram, chart, c1, c2, conflicted: await mr("conflict", "failing", 7), pending: await mr("open", "pending", 8), green: await mr("open", "passing", 9) };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	const audit = () => t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((a) => `${a.actor} · ${a.action}`));
	return { t, as, audit, ...ids };
}

describe("image slots", () => {
	test("pick then use the last open slot moves the post to In review", async () => {
		const { t, as, audit, site, postId, hero, c2 } = await world();
		expect(await as("tolu").mutation(api.slots.useCandidate, { siteId: site, slotId: hero })).toEqual({ ok: false, reason: "Pick a candidate first" });
		expect(await as("tolu").mutation(api.slots.pickCandidate, { siteId: site, slotId: hero, candidateId: c2 })).toEqual({ ok: true });
		expect(await as("tolu").mutation(api.slots.useCandidate, { siteId: site, slotId: hero })).toEqual({ ok: true });
		const out = await t.run(async (ctx) => ({ slot: await ctx.db.get(hero), post: await ctx.db.get(postId) }));
		expect(out.slot).toMatchObject({ status: "selected", selectedCandidateId: c2 });
		expect(out.post!.state).toBe("in-review");
		expect(await audit()).toEqual(["Tolu B. · selected asset", "CMS agent · moved to In review"]);
	});

	test("human-only opens a ledger task; an upload fills the slot and closes it", async () => {
		const { t, as, site, postId, diagram } = await world();
		expect(await as("tolu").mutation(api.slots.markHumanOnly, { siteId: site, slotId: diagram })).toEqual({ ok: true });
		let ledger = await t.run((ctx) => ctx.db.query("ledgerItems").collect());
		expect(ledger.map((l) => [l.title, l.done])).toEqual([["diagram · implant cost", false]]);
		expect(await as("tolu").mutation(api.slots.uploadOwn, { siteId: site, slotId: diagram, fileName: "notes.pdf" })).toEqual({ ok: false, reason: "Upload a PNG, JPG, WebP, AVIF or SVG" });
		expect(await as("tolu").mutation(api.slots.uploadOwn, { siteId: site, slotId: diagram, fileName: "diagram.png" })).toEqual({ ok: true });
		const out = await t.run(async (ctx) => ({ slot: await ctx.db.get(diagram), cands: await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", diagram)).collect(), post: await ctx.db.get(postId) }));
		expect(out.slot).toMatchObject({ status: "selected", provider: "human", model: "upload" });
		expect(out.cands.map((c) => [c.label, c.selected, c.source?.kind])).toEqual([["diagram.png", true, "upload"]]);
		ledger = await t.run((ctx) => ctx.db.query("ledgerItems").collect());
		expect(ledger[0]!.done).toBe(true);
		expect(out.post!.state).toBe("needs-assets"); // the hero still waits
	});

	test("regenerate refuses charts and an exhausted image budget; otherwise it queues a run at $0 stub cost", async () => {
		const { t, as, site, hero, chart } = await world();
		expect(await as("tolu").mutation(api.slots.regenerateSlot, { siteId: site, slotId: chart })).toEqual({ ok: false, reason: "Charts are rendered from the post's data, never generated" });
		expect(await as("tolu").mutation(api.slots.regenerateSlot, { siteId: site, slotId: hero, prompt: "a brighter smile" })).toEqual({ ok: true });
		const out = await t.run(async (ctx) => ({ slot: await ctx.db.get(hero), cands: (await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", hero)).collect()).length, runs: await ctx.db.query("runs").collect() }));
		expect(out.slot).toMatchObject({ status: "generating", prompt: "a brighter smile" });
		expect(out.cands).toBe(0);
		expect(out.runs.map((r) => [r.kind, r.slotId])).toEqual([["image-generation", hero]]);
		expect(await as("tolu").mutation(api.slots.regenerateSlot, { siteId: site, slotId: hero })).toEqual({ ok: false, reason: "Already generating" });

		const broke = await world({ imageCapUsd: 0.01 });
		const r = await broke.as("tolu").mutation(api.slots.regenerateSlot, { siteId: broke.site, slotId: broke.hero });
		expect(r.ok).toBe(false);
		expect((await broke.t.run((ctx) => ctx.db.get(broke.hero)))!.status).toBe("candidates");
	});

	test("visual-agent results replace candidates; oversized data URIs are dropped; routing is admin-only", async () => {
		const { t, as, site, hero, chart } = await world();
		const big = `data:image/png;base64,${"A".repeat(200_001)}`;
		expect(await as("tolu").mutation(api.slots.setSlotCandidates, { siteId: site, slotId: chart, candidates: [{ label: "x" }] })).toEqual({ ok: false, reason: "Charts are rendered from the post's data, never generated" });
		expect(await as("tolu").mutation(api.slots.setSlotCandidates, { siteId: site, slotId: hero, candidates: [{ label: "a", url: "https://img.example/a.webp" }, { label: "b", url: big }], meta: { provider: "openai", model: "gpt-image" } })).toEqual({ ok: true });
		const out = await t.run(async (ctx) => ({ slot: await ctx.db.get(hero), cands: await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", hero)).collect() }));
		expect(out.slot).toMatchObject({ status: "candidates", provider: "openai", model: "gpt-image" });
		expect(out.cands.map((c) => [c.label, c.source?.sourceUrl ?? null])).toEqual([["a", "https://img.example/a.webp"], ["b", null]]);

		await expect(as("tolu").mutation(api.slots.setRouting, { siteId: site, slotType: "hero", provider: "openai" })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
		expect(await as("owner").mutation(api.slots.setRouting, { siteId: site, slotType: "chart", provider: "openai" })).toEqual({ ok: false, reason: "Charts are never generated. They render as inline SVG" });
		expect(await as("owner").mutation(api.slots.setRouting, { siteId: site, slotType: "hero", provider: "openai" })).toEqual({ ok: true });
		expect((await t.run((ctx) => ctx.db.get(site)))!.routing.hero).toBe("openai");
	});
});

describe("merge requests", () => {
	test("merge refuses conflicts and pending CI; rebase reopens a conflicted MR as pending; specialists can't", async () => {
		const { t, as, audit, site, conflicted, pending, green } = await world();
		await expect(as("tolu").mutation(api.git.rebaseMr, { siteId: site, mrId: conflicted })).rejects.toMatchObject({ data: { code: "FORBIDDEN", reason: "Only a developer merges merge requests" } });
		expect(await as("dev").mutation(api.git.mergeMr, { siteId: site, mrId: conflicted })).toEqual({ ok: false, reason: "Conflict with the base branch. Rebase first" });
		expect(await as("dev").mutation(api.git.mergeMr, { siteId: site, mrId: pending })).toEqual({ ok: false, reason: "CI is still running" });
		expect(await as("dev").mutation(api.git.rebaseMr, { siteId: site, mrId: green })).toEqual({ ok: false, reason: "Nothing to rebase: the MR applies cleanly" });
		expect(await as("dev").mutation(api.git.rebaseMr, { siteId: site, mrId: conflicted })).toEqual({ ok: true });
		const rebased = (await t.run((ctx) => ctx.db.get(conflicted)))!;
		expect(rebased).toMatchObject({ status: "open", ci: "pending" });
		expect(rebased.conflictDetail).toBeUndefined();
		expect(await audit()).toEqual(["Dayo D. · rebased and re-rendered"]);
		expect(await as("dev").mutation(api.git.mergeMr, { siteId: site, mrId: green })).toEqual({ ok: true });
	});
});
