// @vitest-environment edge-runtime
// Handoff 01 acceptance bar: tenant isolation, role matrix, effective role, wrapper coverage.
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { PERMISSIONS, lockReason, type TPermission } from "../src/lib/logic";
import type { TRole } from "../src/lib/types";
import { findViolations } from "../scripts/check-cms-convex-auth.mjs";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { effectiveRole, loadPostInSite } from "./lib/access";
import { ACCESS_KIND } from "./lib/functions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

type T = ReturnType<typeof convexTest>;

function site(workspaceId: Id<"workspaces">, slug: string) {
	return {
		workspaceId,
		slug,
		name: slug[0].toUpperCase() + slug.slice(1),
		domain: `${slug}.example`,
		industry: "dental",
		icon: "tooth",
		status: "active" as const,
		createdAt: 0,
		cadenceTarget: 4,
		searchConsole: "missing" as const,
		rankSource: null,
		budgetCaps: { textCapUsd: 100, imageCapUsd: 50 },
		spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 },
		publishing: { autopost: false, autoMergeOnGreenCi: false },
		routing: { hero: "openai" as const, lifestyle: "openai" as const, diagram: "inline-svg" as const, screenshot: "human" as const, chart: "inline-svg" as const, photo: "web-source" as const },
		modelRouting: { mechanical: "fast" as const, writing: "workhorse" as const, strategy: "strongest" as const, pillarPages: "strongest" as const },
		brandPack: { voice: "plain", palette: [], styleKeywords: [], disclaimers: {} },
		liveBaseline: 0,
		timezone: "Africa/Lagos",
	};
}

/** Two workspaces. W1 has sites A and B; W2 has site C. Users: owner/admin/member of W1, owner of W2. */
async function world(t: T) {
	return t.run(async (ctx) => {
		const ws = async (org: string) => ctx.db.insert("workspaces", { clerkOrgId: org, name: org, slug: org, plan: "pilot", seats: 10, createdAt: 0 });
		const w1 = await ws("org_w1");
		const w2 = await ws("org_w2");
		const user = async (sub: string) =>
			ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name: sub, initials: sub.slice(0, 2).toUpperCase(), email: `${sub}@x.test`, avatarHue: 1, status: "active" });
		const owner = await user("owner");
		const admin = await user("admin");
		const tolu = await user("tolu"); // member: specialist on A only
		const dev = await user("dev"); // member: developer on A
		const kemi = await user("kemi"); // member: stakeholder on A
		const bare = await user("bare"); // member with no site membership
		const other = await user("other"); // owner of W2
		const member = (workspaceId: Id<"workspaces">, userId: Id<"users">, role: "owner" | "admin" | "member") =>
			ctx.db.insert("workspaceMembers", { workspaceId, userId, role, status: "active", addedAt: 0 });
		await member(w1, owner, "owner");
		await member(w1, admin, "admin");
		await member(w1, tolu, "member");
		await member(w1, dev, "member");
		await member(w1, kemi, "member");
		await member(w1, bare, "member");
		await member(w2, other, "owner");
		const a = await ctx.db.insert("sites", site(w1, "lumen"));
		const b = await ctx.db.insert("sites", site(w1, "harbor"));
		const c = await ctx.db.insert("sites", site(w2, "foreign"));
		const ms = (siteId: Id<"sites">, userId: Id<"users">, role: TRole) => ctx.db.insert("memberships", { workspaceId: w1, siteId, userId, role, addedAt: 0, addedBy: owner });
		await ms(a, tolu, "specialist");
		await ms(a, dev, "developer");
		await ms(a, kemi, "stakeholder");
		return { w1, w2, a, b, c, users: { owner, admin, tolu, dev, kemi, bare, other } };
	});
}

const as = (t: T, sub: string, org: string | null = "org_w1") => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, ...(org ? { org_id: org } : {}) });

async function codeOf(p: Promise<unknown>): Promise<string> {
	try {
		await p;
		return "OK";
	} catch (e) {
		if (e instanceof ConvexError) return (e.data as { code: string }).code;
		throw e;
	}
}

async function reasonOf(p: Promise<unknown>): Promise<string | null> {
	try {
		await p;
		return null;
	} catch (e) {
		if (e instanceof ConvexError) return (e.data as { reason: string }).reason;
		throw e;
	}
}

describe("isolation", () => {
	test("(a) membership on site A only: site B is NOT_FOUND, same as a missing site", async () => {
		const t = convexTest(schema, modules);
		const { a, b } = await world(t);
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId: a }))).toBe("OK");
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId: b }))).toBe("NOT_FOUND");
		const gone = await t.run(async (ctx) => {
			const id = await ctx.db.insert("sites", site((await ctx.db.get(a))!.workspaceId, "gone"));
			await ctx.db.delete(id);
			return id;
		});
		expect(await reasonOf(as(t, "tolu").query(api.sites.get, { siteId: gone }))).toBe(await reasonOf(as(t, "tolu").query(api.sites.get, { siteId: b })));
	});

	test("(b) a post id from site B passed with site A's id is refused (I2)", async () => {
		const t = convexTest(schema, modules);
		const { w1, a, b } = await world(t);
		await t.run(async (ctx) => {
			const pillarId = await ctx.db.insert("pillars", { workspaceId: w1, siteId: b, name: "p", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
			const keywordId = await ctx.db.insert("keywords", {
				workspaceId: w1, siteId: b, pillarId, term: "k", termNormalized: "k", intent: "informational", difficulty: 1, difficultyEvidence: "", impressions: 0,
				position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false,
			});
			const postId = await ctx.db.insert("posts", {
				workspaceId: w1, siteId: b, slug: "x", title: "x", seoTitle: "x", keywordId, pillarId, intent: "informational", contentType: "guide", source: "manual",
				state: "idea", stateChangedAt: 0, owner: "human", week: 1, strongModel: false, words: 0, wordTarget: 1000, blocks: [], currentVersion: 0, ideaStatus: "pending", createdAt: 0, updatedAt: 0,
			});
			await expect(loadPostInSite(ctx, a, postId)).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
			await expect(loadPostInSite(ctx, b, postId)).resolves.toMatchObject({ _id: postId });
		});
	});

	test("(c) workspace admin of W1 calling a site in W2 is NOT_FOUND", async () => {
		const t = convexTest(schema, modules);
		const { c } = await world(t);
		expect(await codeOf(as(t, "owner").query(api.sites.get, { siteId: c }))).toBe("NOT_FOUND");
		expect(await codeOf(as(t, "admin").query(api.sites.get, { siteId: c }))).toBe("NOT_FOUND");
	});

	test("a JWT for W2 cannot reach W1's sites, even for a W1 member (active org decides)", async () => {
		const t = convexTest(schema, modules);
		const { a } = await world(t);
		expect(await codeOf(as(t, "owner", "org_w2").query(api.sites.get, { siteId: a }))).toBe("NOT_FOUND");
	});

	test("(d) no active org → UNAUTHENTICATED; no identity → UNAUTHENTICATED", async () => {
		const t = convexTest(schema, modules);
		const { a } = await world(t);
		expect(await codeOf(as(t, "tolu", null).query(api.sites.get, { siteId: a }))).toBe("UNAUTHENTICATED");
		expect(await codeOf(t.query(api.sites.get, { siteId: a }))).toBe("UNAUTHENTICATED");
		expect(await codeOf(as(t, "tolu", "org_unknown").query(api.sites.list, {}))).toBe("UNAUTHENTICATED");
	});

	test("(e) membership removed mid-session → next call refused", async () => {
		const t = convexTest(schema, modules);
		const { a, users } = await world(t);
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId: a }))).toBe("OK");
		await t.run(async (ctx) => {
			const m = await ctx.db.query("memberships").withIndex("by_site_user", (q) => q.eq("siteId", a).eq("userId", users.tolu)).unique();
			await ctx.db.delete(m!._id);
		});
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId: a }))).toBe("NOT_FOUND");
	});

	test("suspended users and suspended workspace members are refused", async () => {
		const t = convexTest(schema, modules);
		const { a, users } = await world(t);
		await t.run(async (ctx) => ctx.db.patch(users.tolu, { status: "suspended" }));
		expect(await codeOf(as(t, "tolu").query(api.sites.get, { siteId: a }))).toBe("UNAUTHENTICATED");
		await t.run(async (ctx) => {
			const wm = await ctx.db.query("workspaceMembers").withIndex("by_user", (q) => q.eq("userId", users.dev)).unique();
			await ctx.db.patch(wm!._id, { status: "suspended" });
		});
		expect(await codeOf(as(t, "dev").query(api.sites.get, { siteId: a }))).toBe("NOT_FOUND");
	});

	test("(f) every exported public function is built from an access wrapper", async () => {
		const loaded = await Promise.all(Object.entries(modules).filter(([p]) => !p.includes("_generated") && !p.endsWith(".test.ts") && !p.endsWith("convex.config.ts") && !p.endsWith("auth.config.ts")).map(async ([p, load]) => [p, (await load()) as Record<string, unknown>] as const));
		const unwrapped: string[] = [];
		let publicCount = 0;
		for (const [path, mod] of loaded) {
			for (const [name, fn] of Object.entries(mod)) {
				const f = fn as { isPublic?: boolean; isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isHttp?: boolean };
				if (!f || typeof f !== "function" && typeof f !== "object") continue;
				if (!f.isPublic || f.isHttp) continue;
				publicCount++;
				if (!(ACCESS_KIND in (fn as object))) unwrapped.push(`${path}:${name}`);
			}
		}
		expect(publicCount).toBeGreaterThan(0);
		expect(unwrapped).toEqual([]);
		expect(findViolations()).toEqual([]);
	});

	test("sites.list shows only openable sites; bySlug never reveals other workspaces", async () => {
		const t = convexTest(schema, modules);
		await world(t);
		expect((await as(t, "tolu").query(api.sites.list, {})).map((s) => [s.slug, s.role])).toEqual([["lumen", "specialist"]]);
		expect((await as(t, "owner").query(api.sites.list, {})).map((s) => [s.slug, s.role])).toEqual([["lumen", "admin"], ["harbor", "admin"]]);
		expect(await as(t, "bare").query(api.sites.list, {})).toEqual([]);
		expect(await as(t, "tolu").query(api.sites.bySlug, { slug: "harbor" })).toEqual({ status: "no-access", name: "Harbor" });
		expect(await as(t, "tolu").query(api.sites.bySlug, { slug: "foreign" })).toEqual({ status: "not-found" });
		expect((await as(t, "tolu").query(api.sites.bySlug, { slug: "lumen" })).status).toBe("ok");
	});
});

describe("effective role", () => {
	test("owner/admin → admin everywhere; member → membership role; no membership → none", () => {
		expect(effectiveRole({ role: "owner" }, null)).toBe("admin");
		expect(effectiveRole({ role: "admin" }, { role: "stakeholder" })).toBe("admin");
		expect(effectiveRole({ role: "member" }, { role: "developer" })).toBe("developer");
		expect(effectiveRole({ role: "member" }, null)).toBeNull();
		expect(effectiveRole(null, { role: "specialist" })).toBeNull();
	});
});

describe("role matrix", () => {
	// Exercises requireSiteRole for every TPermission × role through the internal check actions use.
	const users: Record<TRole, string> = { specialist: "tolu", developer: "dev", stakeholder: "kemi", admin: "admin" };
	test("allowed iff PERMISSIONS says so; refusal reason = lockReason()", async () => {
		const t = convexTest(schema, modules);
		const { a } = await world(t);
		const { internal } = await import("./_generated/api");
		for (const permission of Object.keys(PERMISSIONS) as TPermission[]) {
			for (const role of Object.keys(users) as TRole[]) {
				const p = as(t, users[role]).query(internal.access.assertSiteRole, { siteId: a, permission });
				if (PERMISSIONS[permission].includes(role)) {
					expect(await p, `${role} ${permission}`).toMatchObject({ role, siteId: a });
				} else {
					expect(await reasonOf(p), `${role} ${permission}`).toBe(lockReason(role, permission));
				}
			}
		}
	});
});

describe("users.ensure", () => {
	test("creates the user once, computes initials, and is idempotent", async () => {
		const t = convexTest(schema, modules);
		const me = t.withIdentity({ subject: "user_new", issuer: ISSUER, tokenIdentifier: `${ISSUER}|user_new`, name: "Amaka Okafor", email: "amaka@x.test" });
		const id1 = await me.mutation(api.users.ensure, {});
		const id2 = await me.mutation(api.users.ensure, {});
		expect(id1).toBe(id2);
		expect(await me.query(api.users.me, {})).toMatchObject({ initials: "AO", email: "amaka@x.test", status: "active" });
		expect(await codeOf(t.mutation(api.users.ensure, {}))).toBe("UNAUTHENTICATED");
	});
});
