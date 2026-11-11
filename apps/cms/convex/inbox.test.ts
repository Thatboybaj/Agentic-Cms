// @vitest-environment edge-runtime
// Runs & ledger page on Convex: resolving ledger items (specialist+, audited) and notifications (your own, this site).
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string, name: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name, initials: "XX", email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner", "Amaka E.");
		const tolu = await user("tolu", "Tolu B.");
		const kemi = await user("kemi", "Kemi A.");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		for (const u of [tolu, kemi]) await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: u, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: kemi, role: "stakeholder", addedAt: 0, addedBy: owner });
		const item = await ctx.db.insert("ledgerItems", { siteId: site, title: "Sign off prune list", owner: "Tolu B.", createdAt: Date.now() - 3 * 86_400_000, downstream: "x", origin: "qa-agent", done: false });
		const note = (userId: typeof tolu, read = false) => ctx.db.insert("notifications", { workspaceId: ws, siteId: site, userId, at: Date.now(), tone: "human", title: "Images need you", body: "b", href: "/assets", read });
		return { site, item, toluNote: await note(tolu), toluNote2: await note(tolu), kemiNote: await note(kemi) };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	return { t, as, ...ids };
}

test("a specialist resolves a ledger item (audited); a stakeholder can't", async () => {
	const { t, as, site, item } = await world();
	await expect(as("kemi").mutation(api.inbox.resolveLedgerItem, { siteId: site, itemId: item })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
	expect(await as("tolu").mutation(api.inbox.resolveLedgerItem, { siteId: site, itemId: item })).toEqual({ ok: true });
	const out = await t.run(async (ctx) => ({ item: await ctx.db.get(item), audit: (await ctx.db.query("auditEvents").collect()).map((a) => [a.action, a.detail]) }));
	expect(out.item!.done).toBe(true);
	expect(out.audit).toEqual([["resolved ledger item", "after 3 days"]]);
});

test("notifications: the bundle carries only yours with full hrefs; mark one / all read touches only yours", async () => {
	const { t, as, site, toluNote, kemiNote } = await world();
	const b = await as("tolu").query(api.plan.bundle, { siteId: site });
	expect(b.notifications).toHaveLength(2);
	expect(await as("tolu").mutation(api.inbox.markNotificationRead, { siteId: site, notificationId: kemiNote })).toEqual({ ok: false, reason: "Notification not found" });
	expect(await as("tolu").mutation(api.inbox.markNotificationRead, { siteId: site, notificationId: toluNote })).toEqual({ ok: true });
	await as("tolu").mutation(api.inbox.markAllNotificationsRead, { siteId: site });
	const read = await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).map((n) => n.read));
	expect(read).toEqual([true, true, false]);
});
