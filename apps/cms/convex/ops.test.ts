// @vitest-environment edge-runtime
// Handoff 09 step 8: deleting a site needs the slug typed, is admin-only, and leaves no rows behind (children too).
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

test("delete site: confirm slug, admin only, every row removed (posts' children included), audit kept at workspace level", async () => {
	vi.useFakeTimers();
	const t = convexTest(schema, modules);
	const { site } = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const owner = await ctx.db.insert("users", { clerkUserId: "owner", tokenIdentifier: `${ISSUER}|owner`, name: "Owner", initials: "OW", email: "o@x.co", avatarHue: 1, status: "active" });
		const tolu = await ctx.db.insert("users", { clerkUserId: "tolu", tokenIdentifier: `${ISSUER}|tolu`, name: "Tolu", initials: "TB", email: "t@x.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: tolu, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		const pillar = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "P", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keyword = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId: pillar, term: "k", termNormalized: "k", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		for (let i = 0; i < 30; i++) {
			const post = await ctx.db.insert("posts", { workspaceId: ws, siteId: site, slug: `p${i}`, title: "P", seoTitle: "P", keywordId: keyword, pillarId: pillar, intent: "commercial", contentType: "guide", source: "manual", state: "in-review", stateChangedAt: 0, owner: "human", week: 40, strongModel: false, words: 1, wordTarget: 800, blocks: [], currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0 });
			await ctx.db.insert("postVersions", { siteId: site, postId: post, n: 1, origin: "agent-generation", actor: "a", at: 0, words: 1, blocks: [], seoTitle: "P" });
			await ctx.db.insert("factMarkers", { siteId: site, postId: post, blockId: "b1", claim: "c", status: "open", note: "n" });
		}
		await ctx.db.insert("positionHistory", { siteId: site, keywordId: keyword, date: "2026-11-01", position: 3, impressions: 1, clicks: 0, source: "gsc" });
		return { site };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	await expect(as("tolu").mutation(api.ops.deleteSite, { siteId: site, confirmSlug: "lumen" })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
	expect(await as("owner").mutation(api.ops.deleteSite, { siteId: site, confirmSlug: "nope" })).toEqual({ ok: false, reason: "Type the site's slug (lumen) to confirm" });
	expect(await as("owner").mutation(api.ops.deleteSite, { siteId: site, confirmSlug: "lumen" })).toEqual({ ok: true });
	await t.finishAllScheduledFunctions(vi.runAllTimers);
	const left = await t.run(async (ctx) => ({
		site: await ctx.db.get(site),
		posts: (await ctx.db.query("posts").collect()).length,
		versions: (await ctx.db.query("postVersions").collect()).length,
		facts: (await ctx.db.query("factMarkers").collect()).length,
		history: (await ctx.db.query("positionHistory").collect()).length,
		keywords: (await ctx.db.query("keywords").collect()).length,
		memberships: (await ctx.db.query("memberships").collect()).length,
		audit: (await ctx.db.query("auditEvents").collect()).map((a) => a.action),
	}));
	expect(left).toMatchObject({ site: null, posts: 0, versions: 0, facts: 0, history: 0, keywords: 0, memberships: 0 });
	expect(left.audit).toEqual(["deleted site"]); // the workspace-level record survives
	vi.useRealTimers();
});
