// @vitest-environment edge-runtime
// Content plan on Convex: dev content seed, plan.bundle (+ its mapping to the prototype shapes), moveToWeek.
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { toPlanData } from "../src/lib/adapter";
import { evaluateGate } from "../src/lib/logic";
import { computeStats } from "../src/lib/workspace";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isoWeek } from "./posts";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";
afterEach(() => void delete process.env.CMS_DEV_TOOLS);

async function world() {
	const t = convexTest(schema, modules);
	await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const owner = await ctx.db.insert("users", { clerkUserId: "owner", tokenIdentifier: `${ISSUER}|owner`, name: "Owner", initials: "OW", email: "o@x.co", avatarHue: 1, status: "active" });
		const kemi = await ctx.db.insert("users", { clerkUserId: "kemi", tokenIdentifier: `${ISSUER}|kemi`, name: "Kemi", initials: "KE", email: "k@x.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: kemi, role: "member", status: "active", addedAt: 0 });
	});
	const as = (sub = "owner") => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	process.env.CMS_DEV_TOOLS = "1";
	await as().mutation(api.devSeed.seedSites, {});
	const lumen = (await as().query(api.sites.list, {})).find((s) => s.slug === "lumen")!._id as Id<"sites">;
	return { t, as, lumen };
}

describe("content seed + plan bundle", () => {
	test("seeds pillars, keywords and posts once; the bundle maps to the prototype's shapes and gate", async () => {
		const { t, as, lumen } = await world();
		const first = await as().mutation(api.devSeed.seedContent, {});
		expect(first.filled).toContain("Lumen Dental");
		expect((await as().mutation(api.devSeed.seedContent, {})).filled).toEqual([]);

		const bundle = await as().query(api.plan.bundle, { siteId: lumen });
		const { site, data, role, members } = toPlanData(bundle);
		expect(role).toBe("admin");
		expect(site.slug).toBe("lumen");
		expect(data.pillars.length).toBeGreaterThan(0);
		expect(data.posts.length).toBeGreaterThan(10);
		const states = new Set(data.posts.map((p) => p.state));
		for (const s of ["idea", "briefed", "drafting", "in-review", "live"]) expect(states.has(s as never), s).toBe(true);
		// Every post's keyword and pillar resolve inside the bundle (no dangling ids after the seed's id remap).
		const kw = new Set(data.keywords.map((k) => k.id));
		const pl = new Set(data.pillars.map((p) => p.id));
		expect(data.posts.every((p) => kw.has(p.keywordId) && pl.has(p.pillarId))).toBe(true);
		// The gate runs on mapped data exactly as the UI does; with no confirmed manifest it names that block.
		const inReview = data.posts.find((p) => p.state === "in-review")!;
		expect(evaluateGate(inReview, data.slots, null).hard).toContain("No confirmed template manifest");
		expect(computeStats(site, data).counts.live).toBeGreaterThanOrEqual(data.liveBaseline);
		expect(members.map((m) => m.role)).toContain("admin");
		expect(data.modelRouting["pillar-pages"]).toBeDefined();
		void t;
	});

	test("bundle is site-scoped: someone without a membership gets NOT_FOUND", async () => {
		const { as, lumen } = await world();
		await expect(as("kemi").query(api.plan.bundle, { siteId: lumen })).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
	});
});

describe("moveToWeek", () => {
	test("only Idea/Briefed, not in the past; audited with the prototype's wording", async () => {
		const { t, as, lumen } = await world();
		await as().mutation(api.devSeed.seedContent, {});
		const bundle = await as().query(api.plan.bundle, { siteId: lumen });
		const ideaPost = bundle.posts.find((p) => p.state === "idea")!;
		const live = bundle.posts.find((p) => p.state === "live")!;
		const week = isoWeek(Date.now());
		expect(await as().mutation(api.plan.moveToWeek, { siteId: lumen, postId: live._id, week: week + 1 })).toEqual({ ok: false, reason: "Only planned posts (Idea, Briefed) can be rescheduled" });
		expect(await as().mutation(api.plan.moveToWeek, { siteId: lumen, postId: ideaPost._id, week: week - 1 })).toEqual({ ok: false, reason: "Pick this week or a later one" });
		expect(await as().mutation(api.plan.moveToWeek, { siteId: lumen, postId: ideaPost._id, week: week + 2 })).toEqual({ ok: true });
		const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).find((a) => a.action === "rescheduled")!);
		expect(audit.detail).toBe(`W${ideaPost.week} → W${week + 2} · generation run moves with it`);
	});
});
