// @vitest-environment edge-runtime
// GitHub webhooks (handoff 06 step 4): replays are no-ops, unknown repos are ignored, CI events only touch MRs at
// that head, a PR closed without merging puts the post back in review, and tenant = installation + repo only.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const owner = await ctx.db.insert("users", { clerkUserId: "o", tokenIdentifier: "x|o", name: "Amaka E.", initials: "AE", email: "o@x.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		const mkSite = (slug: string) =>
			ctx.db.insert("sites", {
				workspaceId: ws, slug, name: slug, domain: `${slug}.co`, industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
				budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
				routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
				modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
			});
		const site = await mkSite("lumen");
		const other = await mkSite("other");
		const conn = await ctx.db.insert("repoConnections", { workspaceId: ws, siteId: site, host: "github", repo: "lumen/site", baseBranch: "main", contentDir: "content/blog", assetDir: "public/images/blog", branchPattern: "content/{slug}", installedAs: "lumen", installationId: "42", status: "active", live: true, connectedBy: owner, connectedAt: 0 });
		const pillarId = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keywordId = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId, term: "k", termNormalized: "k", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const postId = await ctx.db.insert("posts", { workspaceId: ws, siteId: site, slug: "p", title: "Implants", seoTitle: "Implants", keywordId, pillarId, intent: "commercial", contentType: "guide", source: "manual", state: "mr-open", stateChangedAt: 0, owner: "human", week: 40, strongModel: false, words: 1, wordTarget: 800, blocks: [], currentVersion: 2, approvedVersion: 2, ideaStatus: "approved", createdAt: 0, updatedAt: 0 });
		const mr = await ctx.db.insert("mergeRequests", { workspaceId: ws, siteId: site, postId, repoConnectionId: conn, host: "github", repo: "lumen/site", number: 7, branch: "content/p", base: "main", headSha: "abc", status: "open", ci: "pending", files: [], openedAt: 0, overrides: [] });
		return { site, other, postId, mr };
	});
	return { t, ...ids };
}

const pr = (action: string, merged = false) => ({ installation: { id: 42 }, repository: { full_name: "lumen/site" }, action, pull_request: { number: 7, merged, merge_commit_sha: merged ? "m1" : null } });

test("a replayed delivery is a no-op; an unknown repo or a wrong installation is ignored", async () => {
	const { t, mr } = await world();
	expect(await t.mutation(internal.gitHooks.onEvent, { deliveryId: "d1", event: "check_suite", payload: { installation: { id: 42 }, repository: { full_name: "lumen/site" }, check_suite: { head_sha: "abc" } } })).toEqual({ status: "processed" });
	expect(await t.mutation(internal.gitHooks.onEvent, { deliveryId: "d1", event: "check_suite", payload: {} })).toEqual({ status: "duplicate" });
	expect(await t.mutation(internal.gitHooks.onEvent, { deliveryId: "d2", event: "pull_request", payload: { ...pr("closed"), repository: { full_name: "evil/site" } } })).toEqual({ status: "ignored" });
	expect(await t.mutation(internal.gitHooks.onEvent, { deliveryId: "d3", event: "pull_request", payload: { ...pr("closed"), installation: { id: 99 } } })).toEqual({ status: "ignored" });
	expect((await t.run((ctx) => ctx.db.get(mr)))!.status).toBe("open");
	const events = await t.run((ctx) => ctx.db.query("webhookEvents").collect());
	expect(events.map((e) => e.status)).toEqual(["processed", "ignored", "ignored"]);
	await t.run(async (ctx) => {
		for (const j of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(j._id);
	});
});

test("CI results for an older head are ignored; the current head's roll-up lands", async () => {
	const { t, mr } = await world();
	await t.mutation(internal.gitHooks.ciResult, { mrId: mr, headSha: "old", ci: "failing", detail: "x" });
	expect((await t.run((ctx) => ctx.db.get(mr)))!.ci).toBe("pending");
	await t.mutation(internal.gitHooks.ciResult, { mrId: mr, headSha: "abc", ci: "none" });
	expect((await t.run((ctx) => ctx.db.get(mr)))!).toMatchObject({ ci: "none", ciDetail: "No CI checks configured on this repo · a developer merges" });
});

test("a PR closed without merging puts the post back in review and tells the team", async () => {
	const { t, mr, postId } = await world();
	await t.mutation(internal.gitHooks.onEvent, { deliveryId: "d9", event: "pull_request", payload: pr("closed") });
	const out = await t.run(async (ctx) => ({ mr: await ctx.db.get(mr), post: await ctx.db.get(postId), audit: (await ctx.db.query("auditEvents").collect()).map((a) => a.action) }));
	expect(out.mr!.status).toBe("closed");
	expect(out.post!.state).toBe("in-review");
	expect(out.audit).toContain("closed MR without merging");
});

test("uninstalling the app disconnects the repo", async () => {
	const { t } = await world();
	await t.mutation(internal.gitHooks.onEvent, { deliveryId: "u1", event: "installation", payload: { action: "deleted", installation: { id: 42 } } });
	const conns = await t.run((ctx) => ctx.db.query("repoConnections").collect());
	expect(conns[0]!.status).toBe("removed");
});
