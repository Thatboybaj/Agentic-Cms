// Invites (api-map §1 `inviteUser`). Clerk sends the email (organization invitation); Convex keeps the per-site roles
// and applies them when the person joins (clerkSync.applyInvites). One pending row per (workspace, email).
import { v } from "convex/values";
import { ROLE_LABEL } from "../src/lib/logic";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { workspaceMutation } from "./lib/functions";

type TResult = { ok: true; id?: string } | { ok: false; reason: string };

const vRole = v.union(v.literal("specialist"), v.literal("developer"), v.literal("stakeholder"), v.literal("admin"));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 30 * 86_400_000; // Clerk organization invitations stay open until revoked; we expire ours at 30 days

export const create = workspaceMutation({
	permission: "members.manage",
	args: {
		email: v.string(),
		workspaceRole: v.optional(v.union(v.literal("admin"), v.literal("member"))),
		siteRoles: v.array(v.object({ siteId: v.id("sites"), role: vRole })),
	},
	handler: async (ctx, args): Promise<TResult> => {
		const { workspace, user } = ctx.access;
		const email = args.email.trim().toLowerCase();
		if (!EMAIL_RE.test(email)) return { ok: false, reason: "Enter a valid email address" };

		const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
		if (existing) {
			const m = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id).eq("userId", existing._id))
				.unique();
			if (m && m.status === "active") return { ok: false, reason: `${email} is already in the workspace` };
		}

		const siteRoles = [];
		const names: string[] = [];
		for (const sr of args.siteRoles) {
			const site = await ctx.db.get(sr.siteId);
			if (!site || site.workspaceId !== workspace._id) continue; // never grant across workspaces
			siteRoles.push(sr);
			names.push(`${ROLE_LABEL[sr.role]} · ${site.name}`);
		}
		const workspaceRole = args.workspaceRole ?? "member";
		if (!siteRoles.length && workspaceRole === "member") return { ok: false, reason: "Pick at least one site and a role" };

		const pending = await ctx.db
			.query("invites")
			.withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspace._id).eq("status", "pending"))
			.take(500);
		const same = pending.find((i) => i.email === email);
		if (!same) {
			const members = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id))
				.take(1000);
			const used = members.filter((m) => m.status === "active").length + pending.length;
			if (used >= workspace.seats) return { ok: false, reason: `All ${workspace.seats} seats are in use · upgrade the plan or remove someone` };
		}

		const now = Date.now();
		let inviteId;
		if (same) {
			await ctx.db.patch(same._id, { siteRoles, workspaceRole, expiresAt: now + INVITE_TTL_MS });
			inviteId = same._id;
		} else {
			inviteId = await ctx.db.insert("invites", { workspaceId: workspace._id, email, workspaceRole, siteRoles, invitedBy: user._id, status: "pending", expiresAt: now + INVITE_TTL_MS, createdAt: now });
		}
		await audit(ctx, { workspaceId: workspace._id, actor: user, action: "invited", target: email, detail: names.join(", ") || `workspace ${workspaceRole}` });
		for (const sr of siteRoles) await audit(ctx, { workspaceId: workspace._id, siteId: sr.siteId, actor: user, action: "invited", target: email, detail: ROLE_LABEL[sr.role] });
		if (!same?.clerkInvitationId) await ctx.scheduler.runAfter(0, internal.clerkApi.sendInvitation, { inviteId });
		return { ok: true, id: inviteId };
	},
});

export const revoke = workspaceMutation({
	permission: "members.manage",
	args: { inviteId: v.id("invites") },
	handler: async (ctx, { inviteId }): Promise<TResult> => {
		const { workspace, user } = ctx.access;
		const invite = await ctx.db.get(inviteId);
		if (!invite || invite.workspaceId !== workspace._id) return { ok: false, reason: "Invite not found" };
		if (invite.status !== "pending") return { ok: true };
		await ctx.db.patch(inviteId, { status: "revoked" });
		await audit(ctx, { workspaceId: workspace._id, actor: user, action: "revoked invite", target: invite.email });
		if (invite.clerkInvitationId) {
			await ctx.scheduler.runAfter(0, internal.clerkApi.revokeInvitation, { clerkOrgId: workspace.clerkOrgId, clerkInvitationId: invite.clerkInvitationId, requestingClerkUserId: user.clerkUserId });
		}
		return { ok: true };
	},
});

// ─── Internal: used by clerkApi.sendInvitation ────────────────────────────────

export const forSending = internalQuery({
	args: { inviteId: v.id("invites") },
	handler: async (ctx, { inviteId }) => {
		const invite = await ctx.db.get(inviteId);
		if (!invite || invite.status !== "pending") return null;
		const workspace = await ctx.db.get(invite.workspaceId);
		const inviter = await ctx.db.get(invite.invitedBy);
		if (!workspace) return null;
		return { email: invite.email, workspaceRole: invite.workspaceRole, clerkOrgId: workspace.clerkOrgId, inviterClerkUserId: inviter?.clerkUserId ?? null, already: invite.clerkInvitationId ?? null };
	},
});

export const markSent = internalMutation({
	args: { inviteId: v.id("invites"), clerkInvitationId: v.string() },
	handler: async (ctx, { inviteId, clerkInvitationId }) => {
		await ctx.db.patch(inviteId, { clerkInvitationId });
	},
});
