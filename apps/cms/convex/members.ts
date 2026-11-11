// Team: workspace members, per-site roles, workspace roles (api-map §1). Per-site roles are Convex-only (README §5);
// workspace roles are mirrored to Clerk through clerkApi.updateOrgRole. Audit wording matches src/lib/store.tsx.
import { v } from "convex/values";
import { ROLE_LABEL } from "../src/lib/logic";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { workspaceMutation, workspaceQuery } from "./lib/functions";

type TResult = { ok: true } | { ok: false; reason: string };

const vRole = v.union(v.literal("specialist"), v.literal("developer"), v.literal("stakeholder"), v.literal("admin"));
const vWorkspaceRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));

async function memberRow(ctx: MutationCtx, workspaceId: Id<"workspaces">, userId: Id<"users">) {
	return ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
		.unique();
}

/**
 * The Team page. Admins (members.manage) see everyone, their site roles and pending invites; other members see
 * only themselves (api-map §1 `useWorkspace`).
 */
export const team = workspaceQuery({
	args: {},
	handler: async (ctx) => {
		const { workspace, user, workspaceRole } = ctx.access;
		const canManage = workspaceRole === "owner" || workspaceRole === "admin";
		const rows = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id))
			.take(1000);
		const visible = canManage ? rows : rows.filter((r) => r.userId === user._id);
		const people = [];
		for (const r of visible) {
			const u = await ctx.db.get(r.userId);
			if (!u) continue;
			const memberships = await ctx.db
				.query("memberships")
				.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id).eq("userId", u._id))
				.take(500);
			people.push({
				userId: u._id,
				name: u.name,
				initials: u.initials,
				email: u.email,
				avatarHue: u.avatarHue,
				status: r.status === "suspended" ? ("suspended" as const) : u.status,
				workspaceRole: r.role,
				sites: memberships.map((m) => ({ siteId: m.siteId, role: m.role })),
			});
		}
		const invites = canManage
			? (
					await ctx.db
						.query("invites")
						.withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspace._id).eq("status", "pending"))
						.take(200)
				).map((i) => ({ inviteId: i._id, email: i.email, workspaceRole: i.workspaceRole, siteRoles: i.siteRoles, createdAt: i.createdAt, expiresAt: i.expiresAt, sent: Boolean(i.clerkInvitationId) }))
			: [];
		return { canManage, seats: workspace.seats, seatsUsed: rows.filter((r) => r.status === "active").length, people, invites };
	},
});

/** setMembership(userId, siteId, role | null). Removing a role releases that person's edit locks on the site. */
export const setMembership = workspaceMutation({
	permission: "members.manage",
	args: { siteId: v.id("sites"), userId: v.id("users"), role: v.union(vRole, v.null()) },
	handler: async (ctx, { siteId, userId, role }): Promise<TResult> => {
		const { workspace, user } = ctx.access;
		const site = await ctx.db.get(siteId);
		if (!site || site.workspaceId !== workspace._id) return { ok: false, reason: "Unknown site" };
		const member = await memberRow(ctx, workspace._id, userId);
		const person = member && (await ctx.db.get(userId));
		if (!member || !person) return { ok: false, reason: "Person not found" };
		const cur = await ctx.db
			.query("memberships")
			.withIndex("by_site_user", (q) => q.eq("siteId", siteId).eq("userId", userId))
			.unique();
		if ((cur?.role ?? null) === role) return { ok: true };
		if (role && cur) await ctx.db.patch(cur._id, { role });
		else if (role) await ctx.db.insert("memberships", { workspaceId: workspace._id, siteId, userId, role, addedAt: Date.now(), addedBy: user._id });
		else if (cur) {
			await ctx.db.delete(cur._id);
			const locks = await ctx.db.query("editLocks").withIndex("by_user", (q) => q.eq("userId", userId)).take(200);
			for (const lock of locks) if (lock.siteId === siteId) await ctx.db.delete(lock._id);
		}
		const detail = role ? (cur ? `${ROLE_LABEL[cur.role]} → ${ROLE_LABEL[role]}` : ROLE_LABEL[role]) : `was ${cur ? ROLE_LABEL[cur.role] : "—"}`;
		await audit(ctx, { workspaceId: workspace._id, siteId, actor: user, action: role ? (cur ? "changed role" : "added member") : "removed member", target: person.name, detail });
		await audit(ctx, { workspaceId: workspace._id, actor: user, action: role ? "set site role" : "removed from site", target: person.name, detail: `${site.name} · ${detail}` });
		return { ok: true };
	},
});

/** setWorkspaceRole(userId, role). Owner changes need an owner; the last owner can't be demoted. Synced to Clerk. */
export const setWorkspaceRole = workspaceMutation({
	permission: "members.manage",
	args: { userId: v.id("users"), role: vWorkspaceRole },
	handler: async (ctx, { userId, role }): Promise<TResult> => {
		const { workspace, user, workspaceRole } = ctx.access;
		const row = await memberRow(ctx, workspace._id, userId);
		const person = row && (await ctx.db.get(userId));
		if (!row || !person || row.status !== "active") return { ok: false, reason: "Person not found" };
		if (row.role === role) return { ok: true };
		if ((role === "owner" || row.role === "owner") && workspaceRole !== "owner") return { ok: false, reason: "Only an owner can grant or remove the owner role" };
		if (row.role === "owner") {
			const rows = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id))
				.take(1000);
			if (rows.filter((r: Doc<"workspaceMembers">) => r.role === "owner" && r.status === "active").length <= 1) return { ok: false, reason: "The workspace needs at least one owner" };
		}
		const from = row.role;
		await ctx.db.patch(row._id, { role });
		await audit(ctx, { workspaceId: workspace._id, actor: user, action: "changed workspace role", target: person.name, detail: `${from} → ${role}` });
		// Clerk knows only org:admin / org:member; owner is Convex-only on top of org:admin.
		const clerkRole = role === "member" ? "org:member" : "org:admin";
		const fromClerk = from === "member" ? "org:member" : "org:admin";
		if (clerkRole !== fromClerk) {
			await ctx.scheduler.runAfter(0, internal.clerkApi.updateOrgRole, { clerkOrgId: workspace.clerkOrgId, clerkUserId: person.clerkUserId, role: clerkRole });
		}
		return { ok: true };
	},
});
