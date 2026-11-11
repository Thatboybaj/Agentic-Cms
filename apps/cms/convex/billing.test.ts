// @vitest-environment edge-runtime
// Handoff 08: Polar signatures, 80% alert once per month, admin-only budgets, the entitlement gate, spend report.
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { verifyPolar } from "./billing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";
afterEach(() => {
	delete process.env.BILLING_ENFORCED;
});

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string, name: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name, initials: "XX", email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner", "Amaka E.");
		const tolu = await user("tolu", "Tolu B.");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: tolu, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 10, imageCapUsd: 5 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 7_500_000, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		return { site };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	return { t, as, ...ids };
}

async function sign(secret: string, id: string, ts: string, body: string) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return `v1,${btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)))))}`;
}

test("Polar signatures: valid passes; tampered body, stale timestamp or wrong secret fail", async () => {
	const ts = String(Math.floor(Date.now() / 1000));
	const sig = await sign("polar-secret", "msg_1", ts, "{}");
	expect(await verifyPolar("polar-secret", { id: "msg_1", timestamp: ts, signature: sig }, "{}")).toBe(true);
	expect(await verifyPolar("polar-secret", { id: "msg_1", timestamp: ts, signature: sig }, "{ }")).toBe(false);
	expect(await verifyPolar("other", { id: "msg_1", timestamp: ts, signature: sig }, "{}")).toBe(false);
	expect(await verifyPolar("polar-secret", { id: "msg_1", timestamp: String(Number(ts) - 600), signature: sig }, "{}")).toBe(false);
});

test("crossing 80% of a cap notifies admins once a month", async () => {
	const { t, site } = await world();
	await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "a", microUsd: 600_000 }); // 7.5 → 8.1 of 10
	await t.mutation(internal.spend.hold, { siteId: site, budget: "text", key: "b", microUsd: 100_000 });
	const notes = await t.run(async (ctx) => (await ctx.db.query("notifications").collect()).filter((n) => n.title.startsWith("Text budget at 80%")));
	expect(notes.length).toBeGreaterThan(0);
	expect(new Set(notes.map((n) => n.dedupeKey)).size).toBe(1);
});

test("budgets are admin-only and audited; model routing too", async () => {
	const { t, as, site } = await world();
	await expect(as("tolu").mutation(api.billing.setBudget, { siteId: site, budget: "text", capUsd: 50 })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
	expect(await as("owner").mutation(api.billing.setBudget, { siteId: site, budget: "text", capUsd: -1 })).toEqual({ ok: false, reason: "Enter a monthly cap in dollars" });
	expect(await as("owner").mutation(api.billing.setBudget, { siteId: site, budget: "text", capUsd: 50 })).toEqual({ ok: true });
	expect(await as("owner").mutation(api.billing.setModelRouting, { siteId: site, task: "writing", tier: "strongest" })).toEqual({ ok: true });
	const s = (await t.run((ctx) => ctx.db.get(site)))!;
	expect(s.budgetCaps.textCapUsd).toBe(50);
	expect(s.modelRouting.writing).toBe("strongest");
	const audit = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((a) => a.detail));
	expect(audit).toContain("$10.00 → $50.00 / month");
});

test("with billing enforced, a site without an active subscription runs nothing; a Polar event entitles it", async () => {
	const { t, as, site } = await world();
	process.env.BILLING_ENFORCED = "1";
	expect(await as("tolu").mutation(api.schedules.runNow, { siteId: site, kind: "qa-sweep" })).toEqual({ ok: false, reason: "This site's subscription isn't active · an admin renews it in Settings → Billing" });
	await t.mutation(internal.billing.onPolarEvent, { deliveryId: "e1", type: "subscription.active", data: { id: "sub_1", status: "active", metadata: { siteId: site } } });
	expect(await t.mutation(internal.billing.onPolarEvent, { deliveryId: "e1", type: "subscription.active", data: {} })).toEqual({ status: "duplicate" });
	expect((await as("tolu").query(api.billing.status, { siteId: site })).entitled).toBe(true);
	await t.run(async (ctx) => {
		for (const j of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(j._id);
	});
});
