// @vitest-environment edge-runtime
// Handoff 01 test plan, "Clerk sync": replay no-op, invitation applies siteRoles, org deletion suspends.
import { convexTest } from "convex-test";
import { Webhook } from "svix";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";
const SECRET = "whsec_" + btoa("agentic-cms-test-signing-secret-32b");

beforeAll(() => {
	process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
	process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
});

const org = { id: "org_1", name: "Lumen Agency", slug: "lumen-agency" };
const membership = (userId: string, role: string, id = `orgmem_${userId}`) => ({
	id,
	role,
	organization: org,
	public_user_data: { user_id: userId, first_name: "Amaka", last_name: "Okafor", identifier: `${userId}@x.test` },
});

let n = 0;
const apply = (t: ReturnType<typeof convexTest>, type: string, data: unknown, deliveryId = `msg_${++n}`) => t.mutation(internal.clerkSync.apply, { deliveryId, type, data });

describe("clerkSync", () => {
	test("org + first admin membership → workspace with an owner; user can sign in to it", async () => {
		const t = convexTest(schema, modules);
		await apply(t, "organization.created", org);
		await apply(t, "organizationMembership.created", membership("user_a", "org:admin"));
		await apply(t, "organizationMembership.created", membership("user_b", "org:admin"));
		await apply(t, "organizationMembership.created", membership("user_c", "org:member"));
		const roles = await t.run(async (ctx) => {
			const rows = await ctx.db.query("workspaceMembers").collect();
			return Promise.all(rows.map(async (r) => [(await ctx.db.get(r.userId))!.clerkUserId, r.role]));
		});
		expect(roles).toEqual([["user_a", "owner"], ["user_b", "admin"], ["user_c", "member"]]);
		const ws = await t.withIdentity({ subject: "user_a", issuer: ISSUER, tokenIdentifier: `${ISSUER}|user_a`, org_id: "org_1" }).query(api.workspace.current, {});
		expect(ws).toMatchObject({ name: "Lumen Agency", role: "owner" });
	});

	test("an owner is never demoted by a later org:admin update", async () => {
		const t = convexTest(schema, modules);
		await apply(t, "organizationMembership.created", membership("user_a", "org:admin"));
		await apply(t, "organizationMembership.updated", membership("user_a", "org:admin"));
		const [row] = await t.run((ctx) => ctx.db.query("workspaceMembers").collect());
		expect(row.role).toBe("owner");
	});

	test("replayed delivery (same svix id) is a no-op", async () => {
		const t = convexTest(schema, modules);
		await apply(t, "organization.created", org, "msg_same");
		const again = await apply(t, "organization.updated", { ...org, name: "Renamed" }, "msg_same");
		expect(again).toMatchObject({ duplicate: true });
		const [w] = await t.run((ctx) => ctx.db.query("workspaces").collect());
		expect(w.name).toBe("Lumen Agency");
	});

	test("invitation accepted → per-site roles applied once the membership arrives, in either order", async () => {
		for (const order of ["invite-first", "membership-first"] as const) {
			const t = convexTest(schema, modules);
			await apply(t, "organizationMembership.created", membership("user_owner", "org:admin"));
			const { siteId } = await t.run(async (ctx) => {
				const w = (await ctx.db.query("workspaces").first())!;
				const owner = (await ctx.db.query("users").first())!;
				const siteId = await ctx.db.insert("sites", {
					workspaceId: w._id, slug: "lumen", name: "Lumen", domain: "lumen.example", industry: "dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 4,
					searchConsole: "missing", rankSource: null, budgetCaps: { textCapUsd: 1, imageCapUsd: 1 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 },
					publishing: { autopost: false, autoMergeOnGreenCi: false },
					routing: { hero: "openai", lifestyle: "openai", diagram: "inline-svg", screenshot: "human", chart: "inline-svg", photo: "web-source" },
					modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" },
					brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
				});
				await ctx.db.insert("invites", {
					workspaceId: w._id, email: "user_tolu@x.test", workspaceRole: "member", siteRoles: [{ siteId, role: "specialist" }], invitedBy: owner._id,
					clerkInvitationId: "orginv_1", status: "pending", expiresAt: Date.now() + 1e9, createdAt: 0,
				});
				return { siteId };
			});
			const accept = () => apply(t, "organizationInvitation.accepted", { id: "orginv_1", email_address: "user_tolu@x.test", organization_id: "org_1" });
			const join = () => apply(t, "organizationMembership.created", membership("user_tolu", "org:member"));
			if (order === "invite-first") {
				await accept();
				await join();
			} else {
				await join();
				await accept();
			}
			const tolu = t.withIdentity({ subject: "user_tolu", issuer: ISSUER, tokenIdentifier: `${ISSUER}|user_tolu`, org_id: "org_1" });
			expect((await tolu.query(api.sites.get, { siteId })).role, order).toBe("specialist");
			const memberships = await t.run((ctx) => ctx.db.query("memberships").collect());
			expect(memberships, order).toHaveLength(1);
		}
	});

	test("org deleted → members suspended, no data deleted; membership deleted → refused", async () => {
		const t = convexTest(schema, modules);
		await apply(t, "organizationMembership.created", membership("user_a", "org:admin"));
		await apply(t, "organizationMembership.created", membership("user_c", "org:member"));
		await apply(t, "organizationMembership.deleted", membership("user_c", "org:member"));
		const c = t.withIdentity({ subject: "user_c", issuer: ISSUER, tokenIdentifier: `${ISSUER}|user_c`, org_id: "org_1" });
		await expect(c.query(api.workspace.current, {})).rejects.toThrow();
		await apply(t, "organization.deleted", { id: "org_1", deleted: true });
		const state = await t.run(async (ctx) => ({ workspaces: (await ctx.db.query("workspaces").collect()).length, statuses: (await ctx.db.query("workspaceMembers").collect()).map((m) => m.status) }));
		expect(state).toEqual({ workspaces: 1, statuses: ["suspended", "suspended"] });
	});

	test("/clerk/webhook refuses unsigned and tampered bodies, accepts a valid svix signature", async () => {
		const t = convexTest(schema, modules);
		const body = JSON.stringify({ type: "organization.created", data: org });
		expect((await t.fetch("/clerk/webhook", { method: "POST", body })).status).toBe(400);
		const wh = new Webhook(SECRET);
		const id = "msg_http_1";
		const ts = new Date();
		const sig = wh.sign(id, ts, body);
		const headers = { "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": sig };
		expect((await t.fetch("/clerk/webhook", { method: "POST", body: body.replace("Lumen", "Evil"), headers })).status).toBe(400);
		const ok = await t.fetch("/clerk/webhook", { method: "POST", body, headers });
		expect(ok.status).toBe(200);
		expect(await ok.json()).toMatchObject({ duplicate: false, status: "processed" });
		const [w] = await t.run((ctx) => ctx.db.query("workspaces").collect());
		expect(w).toMatchObject({ clerkOrgId: "org_1", name: "Lumen Agency" });
	});
});
