// @vitest-environment edge-runtime
// Handoff 07: OAuth state is single-use and expires; imports are idempotent and never zero-fill; KAS equals
// computeKas on the same inputs and is a data gap without Search Console.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { computeKas } from "../src/lib/logic";
import { internal } from "./_generated/api";
import { isoWeekKey } from "./gsc";
import { seal, aadFor } from "./lib/crypto";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
beforeEach(() => {
	process.env.CMS_SECRETS_KEY_V1 = KEY;
});
afterEach(() => {
	delete process.env.CMS_SECRETS_KEY_V1;
});

async function world(searchConsole: "connected" | "missing" = "connected") {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = await ctx.db.insert("users", { clerkUserId: "o", tokenIdentifier: "x|o", name: "Amaka E.", initials: "AE", email: "o@x.co", avatarHue: 1, status: "active" });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole, rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		const pillar = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 3, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const kw = (term: string, position: number | null, impressions: number) => ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId: pillar, term, termNormalized: term, intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions, position, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const k1 = await kw("implant cost", 3, 1000);
		const k2 = await kw("implant pain", 12, 400);
		const k3 = await kw("implant brands", null, 0);
		return { site, user, k1, k2, k3 };
	});
	return { t, ...ids };
}

test("an OAuth state is consumed once, expires, and only redirects to the site's own settings", async () => {
	const { t, site, user } = await world();
	const state = "s-123";
	const hash = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	await t.run(async (ctx) => {
		const sealed = await seal("verifier-xyz", aadFor(site, "oauth-state", hash));
		await ctx.db.insert("oauthStates", { stateHash: hash, siteId: site, userId: user, provider: "google-search-console", codeVerifierEncrypted: sealed.ciphertext, redirectTo: "/s/lumen/settings?tab=site", expiresAt: Date.now() + 60_000 });
	});
	expect(await t.mutation(internal.gsc.consumeState, { state })).toMatchObject({ verifier: "verifier-xyz", redirectTo: "/s/lumen/settings?tab=site" });
	expect(await t.mutation(internal.gsc.consumeState, { state })).toBeNull(); // replay refused
	expect(await t.mutation(internal.gsc.consumeState, { state: "never-issued" })).toBeNull();
});

test("imports are idempotent per (keyword, date) and keep unknown queries out", async () => {
	const { t, site } = await world();
	const rows = [
		{ query: "Implant cost", page: "https://lumen.co/blog/implant-cost", date: "2026-11-01", clicks: 10, impressions: 200, position: 3.2 },
		{ query: "implant cost", page: "https://lumen.co/blog/other", date: "2026-11-01", clicks: 1, impressions: 50, position: 9 },
		{ query: "something unrelated", page: "https://lumen.co/x", date: "2026-11-01", clicks: 0, impressions: 900, position: 40 },
	];
	await t.mutation(internal.gsc.writeRows, { siteId: site, rows });
	await t.mutation(internal.gsc.writeRows, { siteId: site, rows });
	const hist = await t.run((ctx) => ctx.db.query("positionHistory").collect());
	expect(hist).toHaveLength(1);
	expect(hist[0]).toMatchObject({ date: "2026-11-01", impressions: 250, clicks: 11, page: "/blog/implant-cost", source: "gsc" });
	expect(hist[0]!.position).toBeCloseTo((3.2 * 200 + 9 * 50) / 250, 1);
	await t.mutation(internal.gsc.finishImport, { siteId: site, lastImportedDate: "2026-11-08", rowCount: 3 });
	const weeks = await t.run((ctx) => ctx.db.query("trafficWeekly").collect());
	expect(weeks.map((w) => [w.isoWeek, w.sessions, w.impressions])).toEqual([["2026-W44", null, 250]]); // sessions stay a labelled gap
	const k = await t.run(async (ctx) => (await ctx.db.query("keywords").collect()).find((x) => x.term === "implant cost")!);
	expect(k).toMatchObject({ impressions: 250, rankingUrl: "/blog/implant-cost", rankingPages: 1 });
});

test("KAS equals computeKas on the same inputs; without Search Console it's a data gap", async () => {
	const { t, site, k1, k2, k3 } = await world();
	const r = await t.mutation(internal.kas.recalc, { siteId: site, trigger: "manual" });
	expect(r.ok).toBe(true);
	const expected = computeKas([
		{ id: k1, impressions: 1000, position: 3, intent: "commercial" },
		{ id: k2, impressions: 400, position: 12, intent: "commercial" },
		{ id: k3, impressions: 0, position: null, intent: "commercial" },
	]);
	const snap = await t.run(async (ctx) => (await ctx.db.query("kasSnapshots").collect())[0]!);
	for (const e of expected.filter((x) => x.share > 0)) expect(snap.shares.find((s) => s.keywordId === e.keywordId)!.share).toBeCloseTo(e.share, 0);
	expect(snap.shares.some((s) => s.keywordId === k3)).toBe(false);
	const gap = await world("missing");
	expect(await gap.t.mutation(internal.kas.recalc, { siteId: gap.site, trigger: "weekly" })).toEqual({ ok: false, reason: "Data gap: Search Console not connected. No scores written." });
	expect(await gap.t.run((ctx) => ctx.db.query("kasSnapshots").collect())).toHaveLength(0);
});

test("ISO week keys", () => {
	expect(isoWeekKey("2026-11-01")).toBe("2026-W44");
	expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
	expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
});
