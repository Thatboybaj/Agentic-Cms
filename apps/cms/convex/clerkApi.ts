// Calls to the Clerk Backend API (internal actions only; CLERK_SECRET_KEY in the Convex env). The webhook
// (/clerk/webhook → clerkSync) brings the resulting changes back into Convex, so these only push.
// Endpoints: https://clerk.com/docs/reference/backend-api (organizations → invitations, memberships).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const CLERK_API = "https://api.clerk.com/v1";

async function clerk(path: string, init: { method: string; body?: unknown }): Promise<any> {
	const key = process.env.CLERK_SECRET_KEY;
	if (!key) throw new Error("CLERK_SECRET_KEY is not set on this Convex deployment");
	const res = await fetch(`${CLERK_API}${path}`, {
		method: init.method,
		headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
		...(init.body ? { body: JSON.stringify(init.body) } : {}),
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`Clerk ${init.method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
}

export const sendInvitation = internalAction({
	args: { inviteId: v.id("invites") },
	handler: async (ctx, { inviteId }) => {
		const inv = await ctx.runQuery(internal.invites.forSending, { inviteId });
		if (!inv || inv.already) return;
		const redirect = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/+$/, "")}/sign-in` : undefined;
		const created = await clerk(`/organizations/${inv.clerkOrgId}/invitations`, {
			method: "POST",
			body: {
				email_address: inv.email,
				role: inv.workspaceRole === "member" ? "org:member" : "org:admin",
				...(inv.inviterClerkUserId ? { inviter_user_id: inv.inviterClerkUserId } : {}),
				...(redirect ? { redirect_url: redirect } : {}),
			},
		});
		await ctx.runMutation(internal.invites.markSent, { inviteId, clerkInvitationId: created.id });
	},
});

export const revokeInvitation = internalAction({
	args: { clerkOrgId: v.string(), clerkInvitationId: v.string(), requestingClerkUserId: v.string() },
	handler: async (_ctx, a) => {
		await clerk(`/organizations/${a.clerkOrgId}/invitations/${a.clerkInvitationId}/revoke`, { method: "POST", body: { requesting_user_id: a.requestingClerkUserId } });
	},
});

export const updateOrgRole = internalAction({
	args: { clerkOrgId: v.string(), clerkUserId: v.string(), role: v.union(v.literal("org:admin"), v.literal("org:member")) },
	handler: async (_ctx, a) => {
		await clerk(`/organizations/${a.clerkOrgId}/memberships/${a.clerkUserId}`, { method: "PATCH", body: { role: a.role } });
	},
});

/**
 * One-off for a new deployment: Clerk only sends events going forward, so an org and members that already exist
 * never reach a fresh backend. Reads them from the Clerk API and runs each through clerkSync.apply, the same rules
 * the webhook uses (replay-safe: one delivery id per object version). Run: npx convex run clerkApi:backfill --prod
 */
export const backfill = internalAction({
	args: {},
	handler: async (ctx): Promise<{ users: number; orgs: number; memberships: number }> => {
		const page = async (path: string): Promise<any[]> => {
			const out: any[] = [];
			for (let offset = 0; offset < 2000; offset += 100) {
				const r = await clerk(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`, { method: "GET" });
				const rows: any[] = Array.isArray(r) ? r : (r?.data ?? []);
				out.push(...rows);
				if (rows.length < 100) break;
			}
			return out;
		};
		const send = (type: string, data: any) => ctx.runMutation(internal.clerkSync.apply, { deliveryId: `backfill:${type}:${data.id}:${data.updated_at ?? 0}`, type, data });
		const users = await page("/users");
		for (const u of users) await send("user.created", u);
		const orgs = await page("/organizations");
		let memberships = 0;
		for (const o of orgs) {
			await send("organization.created", o);
			for (const m of await page(`/organizations/${o.id}/memberships`)) {
				await send("organizationMembership.created", m);
				memberships++;
			}
		}
		return { users: users.length, orgs: orgs.length, memberships };
	},
});
