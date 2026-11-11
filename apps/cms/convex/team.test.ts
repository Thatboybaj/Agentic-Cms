// @vitest-environment edge-runtime
// Sites, members, invites, dev seed (handoff 01 steps 5, 6, 8). Store parity: audit wording from src/lib/store.tsx.
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { nextAtFor, slugify } from "./lib/defaults";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";
type T = ReturnType<typeof convexTest>;

beforeEach(() => {
	vi.useFakeTimers(); // scheduled Clerk calls stay queued (never hit the network)
});
afterEach(() => {
	vi.useRealTimers();
	delete process.env.CMS_DEV_TOOLS;
});

async function world(t: T) {
	return t.run(async (ctx) => {
		const w1 = await ctx.db.insert("workspaces", { clerkOrgId: "org_w1", name: "W1", slug: "w1", plan: "pilot", seats: 4, createdAt: 0 });
		const w2 = await ctx.db.insert("workspaces", { clerkOrgId: "org_w2", name: "W2", slug: "w2", plan: "pilot", seats: 4, createdAt: 0 });
		const user = (sub: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name: sub[0].toUpperCase() + sub.slice(1), initials: sub.slice(0, 2).toUpperCase(), email: `${sub}@x.test`, avatarHue: 1, status: "active" });
		const owner = await user("owner");
		const admin = await user("admin");
		const tolu = await user("tolu");
		const other = await user("other");
		const wm = (workspaceId: Id<"workspaces">, userId: Id<"users">, role: "owner" | "admin" | "member") => ctx.db.insert("workspaceMembers", { workspaceId, userId, role, status: "active", addedAt: 0 });
		await wm(w1, owner, "owner");
		await wm(w1, admin, "admin");
		await wm(w1, tolu, "member");
		await wm(w2, other, "owner");
		return { w1, w2, owner, admin, tolu, other };
	});
}

const as = (t: T, sub: string, org = "org_w1") => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: org });

async function codeOf(p: Promise<unknown>) {
	try {
		await p;
		return "OK";
	} catch (e) {
		if (e instanceof ConvexError) return (e.data as { code: string }).code;
		throw e;
	}
}

describe("sites.add / setStatus", () => {
	test("adds an onboarding site with 9 schedules and audit rows; slug collisions get a suffix", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		const a = await as(t, "admin").mutation(api.sites.add, { name: "Lumen Dental", domain: "LumenDental.co" });
		expect(a).toMatchObject({ ok: true, slug: "lumen-dental" });
		const b = await as(t, "admin").mutation(api.sites.add, { name: "Lumen Dental", domain: "lumen-two.co" });
		expect(b).toMatchObject({ ok: true, slug: "lumen-dental-2" });
		expect(await as(t, "admin").mutation(api.sites.add, { name: "Dup", domain: "lumendental.co" })).toEqual({ ok: false, reason: "That site already exists" });
		expect(await as(t, "admin").mutation(api.sites.add, { name: "", domain: "nope" })).toEqual({ ok: false, reason: "Add a name and a domain like example.com" });
		const state = await t.run(async (ctx) => {
			const site = (await ctx.db.query("sites").first())!;
			return {
				site: { status: site.status, domain: site.domain, publishing: site.publishing, pillarPages: site.modelRouting.pillarPages },
				schedules: (await ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", site._id)).collect()).length,
				audit: (await ctx.db.query("auditEvents").collect()).filter((e) => e.target === "Lumen Dental").map((e) => [e.action, e.siteId ? "site" : "workspace"]),
			};
		});
		expect(state.site).toEqual({ status: "onboarding", domain: "lumendental.co", publishing: { autopost: true, autoMergeOnGreenCi: true }, pillarPages: "strongest" });
		expect(state.schedules).toBe(9);
		expect(state.audit).toEqual(expect.arrayContaining([["added site", "site"], ["added site", "workspace"]]));
	});

	test("only workspace owners/admins can add sites", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		expect(await codeOf(as(t, "tolu").mutation(api.sites.add, { name: "X", domain: "x.co" }))).toBe("FORBIDDEN");
	});

	test("pausing notifies the site's people except the actor; resuming is audited", async () => {
		const t = convexTest(schema, modules);
		const { tolu, owner } = await world(t);
		const { id } = (await as(t, "admin").mutation(api.sites.add, { name: "Harbor", domain: "harbor.co" })) as unknown as { id: Id<"sites"> };
		await as(t, "admin").mutation(api.members.setMembership, { siteId: id, userId: tolu, role: "specialist" });
		expect(await as(t, "admin").mutation(api.sites.setStatus, { siteId: id, status: "paused" })).toEqual({ ok: true });
		expect(await codeOf(as(t, "tolu").mutation(api.sites.setStatus, { siteId: id, status: "active" }))).toBe("FORBIDDEN");
		await as(t, "admin").mutation(api.sites.setStatus, { siteId: id, status: "active" });
		const out = await t.run(async (ctx) => ({
			status: (await ctx.db.get(id))!.status,
			notified: (await ctx.db.query("notifications").collect()).map((n) => n.userId).sort(),
			actions: (await ctx.db.query("auditEvents").collect()).filter((e) => e.siteId === id).map((e) => e.action),
		}));
		expect(out.status).toBe("active");
		expect(out.notified).toEqual([owner, tolu].sort());
		expect(out.actions).toEqual(expect.arrayContaining(["paused site", "resumed site"]));
	});
});

describe("members", () => {
	test("setMembership adds, changes and removes a site role with store-parity audit; releases locks on removal", async () => {
		const t = convexTest(schema, modules);
		const { tolu, w1 } = await world(t);
		const { id: siteId } = (await as(t, "admin").mutation(api.sites.add, { name: "Lumen", domain: "lumen.co" })) as unknown as { id: Id<"sites"> };
		await as(t, "admin").mutation(api.members.setMembership, { siteId, userId: tolu, role: "specialist" });
		expect((await as(t, "tolu").query(api.sites.get, { siteId })).role).toBe("specialist");
		await as(t, "admin").mutation(api.members.setMembership, { siteId, userId: tolu, role: "developer" });
		await t.run(async (ctx) => {
			const pillarId = await ctx.db.insert("pillars", { workspaceId: w1, siteId, name: "p", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
			const keywordId = await ctx.db.insert("keywords", { workspaceId: w1, siteId, pillarId, term: "k", termNormalized: "k", intent: "informational", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
			const postId = await ctx.db.insert("posts", { workspaceId: w1, siteId, slug: "x", title: "x", seoTitle: "x", keywordId, pillarId, intent: "informational", contentType: "guide", source: "manual", state: "drafting", stateChangedAt: 0, owner: "human", week: 1, strongModel: false, words: 0, wordTarget: 1000, blocks: [], currentVersion: 0, ideaStatus: "n/a", createdAt: 0, updatedAt: 0 });
			await ctx.db.insert("editLocks", { siteId, postId, userId: tolu, sessionId: "s1", since: 0, heartbeatAt: 0 });
		});
		await as(t, "admin").mutation(api.members.setMembership, { siteId, userId: tolu, role: null });
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId }))).toBe("NOT_FOUND");
		const out = await t.run(async (ctx) => ({
			locks: (await ctx.db.query("editLocks").collect()).length,
			site: (await ctx.db.query("auditEvents").collect()).filter((e) => e.siteId === siteId && e.target === "Tolu").map((e) => `${e.action} | ${e.detail}`),
		}));
		expect(out.locks).toBe(0);
		expect(out.site).toEqual(["added member | Content specialist", "changed role | Content specialist → Developer", "removed member | was Developer"]);
	});

	test("cannot grant roles on another workspace's site, or to someone outside the workspace", async () => {
		const t = convexTest(schema, modules);
		const { tolu, other } = await world(t);
		const { id: foreign } = (await as(t, "other", "org_w2").mutation(api.sites.add, { name: "Foreign", domain: "foreign.co" })) as unknown as { id: Id<"sites"> };
		const { id: mine } = (await as(t, "admin").mutation(api.sites.add, { name: "Mine", domain: "mine.co" })) as unknown as { id: Id<"sites"> };
		expect(await as(t, "admin").mutation(api.members.setMembership, { siteId: foreign, userId: tolu, role: "admin" })).toEqual({ ok: false, reason: "Unknown site" });
		expect(await as(t, "admin").mutation(api.members.setMembership, { siteId: mine, userId: other, role: "admin" })).toEqual({ ok: false, reason: "Person not found" });
		expect(await codeOf(as(t, "tolu").mutation(api.members.setMembership, { siteId: mine, userId: tolu, role: "admin" }))).toBe("FORBIDDEN");
	});

	test("setWorkspaceRole: owner rules, last owner protected, Clerk sync scheduled only when the Clerk role changes", async () => {
		const t = convexTest(schema, modules);
		const { owner, admin, tolu } = await world(t);
		expect(await as(t, "admin").mutation(api.members.setWorkspaceRole, { userId: tolu, role: "owner" })).toEqual({ ok: false, reason: "Only an owner can grant or remove the owner role" });
		expect(await as(t, "owner").mutation(api.members.setWorkspaceRole, { userId: owner, role: "admin" })).toEqual({ ok: false, reason: "The workspace needs at least one owner" });
		expect(await as(t, "admin").mutation(api.members.setWorkspaceRole, { userId: tolu, role: "admin" })).toEqual({ ok: true });
		expect(await as(t, "owner").mutation(api.members.setWorkspaceRole, { userId: admin, role: "owner" })).toEqual({ ok: true }); // org:admin → org:admin: no Clerk call
		const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
		expect(scheduled.map((s) => [s.name, (s.args[0] as { role: string }).role])).toEqual([["clerkApi:updateOrgRole", "org:admin"]]);
	});

	test("team: admins see everyone and invites; members see only themselves", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		const forAdmin = await as(t, "admin").query(api.members.team, {});
		expect(forAdmin.people.map((p) => p.name).sort()).toEqual(["Admin", "Owner", "Tolu"]);
		expect(forAdmin).toMatchObject({ canManage: true, seats: 4, seatsUsed: 3 });
		const forTolu = await as(t, "tolu").query(api.members.team, {});
		expect(forTolu.people.map((p) => p.name)).toEqual(["Tolu"]);
		expect(forTolu.canManage).toBe(false);
	});
});

describe("invites", () => {
	test("validates, reuses the pending row per email, enforces seats, and schedules one Clerk invitation", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		const { id: siteId } = (await as(t, "admin").mutation(api.sites.add, { name: "Lumen", domain: "lumen.co" })) as unknown as { id: Id<"sites"> };
		const inv = (email: string, role: "specialist" | "developer" = "specialist") => as(t, "admin").mutation(api.invites.create, { email, siteRoles: [{ siteId, role }] });
		expect(await inv("bad")).toEqual({ ok: false, reason: "Enter a valid email address" });
		expect(await inv("tolu@x.test")).toEqual({ ok: false, reason: "tolu@x.test is already in the workspace" });
		expect(await as(t, "admin").mutation(api.invites.create, { email: "new@x.test", siteRoles: [] })).toEqual({ ok: false, reason: "Pick at least one site and a role" });
		const first = await inv("New@X.test");
		const again = await inv("new@x.test", "developer");
		expect(again).toEqual(first);
		expect(await inv("second@x.test")).toEqual({ ok: false, reason: "All 4 seats are in use · upgrade the plan or remove someone" });
		const out = await t.run(async (ctx) => ({
			invites: (await ctx.db.query("invites").collect()).map((i) => [i.email, i.status, i.siteRoles[0].role]),
			scheduled: (await ctx.db.system.query("_scheduled_functions").collect()).map((s) => s.name),
		}));
		expect(out.invites).toEqual([["new@x.test", "pending", "developer"]]);
		expect(out.scheduled).toEqual(["clerkApi:sendInvitation", "clerkApi:sendInvitation"]); // not sent yet when re-invited, so both queue; the action no-ops once sent
		const team = await as(t, "admin").query(api.members.team, {});
		expect(team.invites.map((i) => i.email)).toEqual(["new@x.test"]);
	});

	test("an invite never carries roles on another workspace's sites", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		const { id: foreign } = (await as(t, "other", "org_w2").mutation(api.sites.add, { name: "Foreign", domain: "foreign.co" })) as unknown as { id: Id<"sites"> };
		expect(await as(t, "admin").mutation(api.invites.create, { email: "x@y.co", siteRoles: [{ siteId: foreign, role: "admin" }] })).toEqual({ ok: false, reason: "Pick at least one site and a role" });
	});

	test("revoke marks it revoked and drops it from the team view", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		const { id: siteId } = (await as(t, "admin").mutation(api.sites.add, { name: "Lumen", domain: "lumen.co" })) as unknown as { id: Id<"sites"> };
		const { id } = (await as(t, "admin").mutation(api.invites.create, { email: "n@x.test", siteRoles: [{ siteId, role: "stakeholder" }] })) as unknown as { id: Id<"invites"> };
		expect(await as(t, "admin").mutation(api.invites.revoke, { inviteId: id })).toEqual({ ok: true });
		expect((await as(t, "admin").query(api.members.team, {})).invites).toEqual([]);
	});
});

describe("devSeed", () => {
	test("refuses without CMS_DEV_TOOLS; with it, seeds the demo sites once into the caller's workspace", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		expect(await codeOf(as(t, "admin").mutation(api.devSeed.seedSites, {}))).toBe("FORBIDDEN");
		process.env.CMS_DEV_TOOLS = "1";
		expect(await codeOf(as(t, "tolu").mutation(api.devSeed.seedSites, {}))).toBe("FORBIDDEN");
		const first = await as(t, "admin").mutation(api.devSeed.seedSites, {});
		const second = await as(t, "admin").mutation(api.devSeed.seedSites, {});
		expect(first.added.length).toBeGreaterThanOrEqual(2);
		expect(second.added).toEqual([]);
		const list = await as(t, "admin").query(api.sites.list, {});
		expect(list.length).toBe(first.added.length);
		expect(list.every((s) => s.role === "admin")).toBe(true);
		expect(await as(t, "other", "org_w2").query(api.sites.list, {})).toEqual([]);
	});
});

describe("defaults", () => {
	test("slugify and nextAtFor (Lagos time)", () => {
		expect(slugify("  Lumen Dental & Co. ")).toBe("lumen-dental-co");
		const fri = Date.parse("2026-11-13T10:00:00Z"); // Friday 11:00 Lagos
		expect(new Date(nextAtFor("weekly:mon@07:00", fri)).toISOString()).toBe("2026-11-16T06:00:00.000Z");
		expect(new Date(nextAtFor("weekly:fri@07:00", fri)).toISOString()).toBe("2026-11-20T06:00:00.000Z");
		expect(new Date(nextAtFor("monthly:1@07:00", fri)).toISOString()).toBe("2026-12-01T06:00:00.000Z");
	});
});
