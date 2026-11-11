// Clerk → Convex sync (handoff 01 step 4). Clerk is the truth for users, workspaces and workspace roles
// (README §5); per-site roles stay Convex-only. Called by /clerk/webhook after the svix signature check.
//
// Rules
//  - Replays are no-ops: one webhookEvents row per svix-id.
//  - Convex never invents an org: workspaces only come from organization.* events.
//  - org:admin → admin, org:member → member. The first admin of a workspace with no owner becomes its owner, and the
//    webhook never demotes an owner (owner is kept in Convex; README §4).
//  - Deletion suspends, never deletes tenant data (Forbidden moves).
//  - Invites: invitation.accepted marks the invite; the per-site roles are applied when the membership for that
//    email arrives (the invitation payload has no Clerk user id), whichever event comes second.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { hueOf, initialsOf } from "./users";

type TClerkRole = "owner" | "admin" | "member";

interface IClerkEmail {
	id: string;
	email_address: string;
}
interface IClerkUser {
	id: string;
	first_name?: string | null;
	last_name?: string | null;
	username?: string | null;
	primary_email_address_id?: string | null;
	email_addresses?: IClerkEmail[];
}
interface IClerkOrg {
	id: string;
	name: string;
	slug?: string | null;
}
interface IClerkMembership {
	id: string;
	role: string;
	organization: IClerkOrg;
	public_user_data: { user_id: string; first_name?: string | null; last_name?: string | null; identifier?: string | null };
}
interface IClerkInvitation {
	id: string;
	email_address: string;
	organization_id: string;
	status?: string;
}

/** Convex's tokenIdentifier is `${iss}|${sub}`; iss is the Clerk issuer the auth config trusts. */
export function tokenIdentifierFor(clerkUserId: string): string {
	const issuer = (process.env.CLERK_JWT_ISSUER_DOMAIN ?? "").replace(/\/+$/, "");
	return `${issuer}|${clerkUserId}`;
}

export function mapOrgRole(role: string): Exclude<TClerkRole, "owner"> {
	return role === "org:admin" || role === "admin" ? "admin" : "member";
}

const fullName = (first?: string | null, last?: string | null, fallback = "New user") => [first, last].filter(Boolean).join(" ").trim() || fallback;

function primaryEmail(u: IClerkUser): string {
	const list = u.email_addresses ?? [];
	return (list.find((e) => e.id === u.primary_email_address_id) ?? list[0])?.email_address?.toLowerCase() ?? "";
}

async function userByClerkId(ctx: MutationCtx, clerkUserId: string) {
	return ctx.db
		.query("users")
		.withIndex("by_clerkUser", (q) => q.eq("clerkUserId", clerkUserId))
		.unique();
}

async function upsertUser(ctx: MutationCtx, clerkUserId: string, fields: { name: string; email: string }): Promise<Id<"users">> {
	const existing = await userByClerkId(ctx, clerkUserId);
	if (existing) {
		await ctx.db.patch(existing._id, { name: fields.name, initials: initialsOf(fields.name), ...(fields.email ? { email: fields.email } : {}) });
		return existing._id;
	}
	return ctx.db.insert("users", {
		clerkUserId,
		tokenIdentifier: tokenIdentifierFor(clerkUserId),
		name: fields.name,
		initials: initialsOf(fields.name),
		email: fields.email,
		avatarHue: hueOf(clerkUserId),
		status: "active",
	});
}

async function workspaceByOrg(ctx: MutationCtx, clerkOrgId: string) {
	return ctx.db
		.query("workspaces")
		.withIndex("by_clerkOrg", (q) => q.eq("clerkOrgId", clerkOrgId))
		.unique();
}

async function upsertWorkspace(ctx: MutationCtx, org: IClerkOrg): Promise<Id<"workspaces">> {
	const existing = await workspaceByOrg(ctx, org.id);
	const slug = org.slug || org.id;
	if (existing) {
		await ctx.db.patch(existing._id, { name: org.name, slug });
		return existing._id;
	}
	// Plan and seats are billing's (handoff 08, decision D3); start every new workspace on the pilot plan.
	return ctx.db.insert("workspaces", { clerkOrgId: org.id, name: org.name, slug, plan: "pilot", seats: 5, createdAt: Date.now() });
}

/** Applies the per-site roles of open invites for this email in this workspace. Idempotent (acceptedBy marks done). */
async function applyInvites(ctx: MutationCtx, workspaceId: Id<"workspaces">, userId: Id<"users">, email: string) {
	if (!email) return;
	for (const status of ["pending", "accepted"] as const) {
		const invites = await ctx.db
			.query("invites")
			.withIndex("by_email_status", (q) => q.eq("email", email).eq("status", status))
			.take(50);
		for (const invite of invites) {
			if (invite.workspaceId !== workspaceId || invite.acceptedBy) continue;
			for (const { siteId, role } of invite.siteRoles) {
				const site = await ctx.db.get(siteId);
				if (!site || site.workspaceId !== workspaceId) continue; // never grant across workspaces
				const current = await ctx.db
					.query("memberships")
					.withIndex("by_site_user", (q) => q.eq("siteId", siteId).eq("userId", userId))
					.unique();
				if (current) await ctx.db.patch(current._id, { role });
				else await ctx.db.insert("memberships", { workspaceId, siteId, userId, role, addedAt: Date.now(), addedBy: invite.invitedBy });
			}
			await ctx.db.patch(invite._id, { status: "accepted", acceptedAt: invite.acceptedAt ?? Date.now(), acceptedBy: userId });
		}
	}
}

async function setMembership(ctx: MutationCtx, m: IClerkMembership) {
	const workspaceId = await upsertWorkspace(ctx, m.organization);
	const p = m.public_user_data;
	const existingUser = await userByClerkId(ctx, p.user_id);
	const email = (p.identifier ?? "").toLowerCase();
	const userId = existingUser?._id ?? (await upsertUser(ctx, p.user_id, { name: fullName(p.first_name, p.last_name, p.identifier ?? "New user"), email }));
	const mapped = mapOrgRole(m.role);
	const row = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
		.unique();
	if (row) {
		const role: TClerkRole = row.role === "owner" ? "owner" : mapped;
		await ctx.db.patch(row._id, { role, status: "active", clerkMembershipId: m.id });
	} else {
		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId))
			.take(1000);
		const hasOwner = members.some((x: Doc<"workspaceMembers">) => x.role === "owner" && x.status === "active");
		const role: TClerkRole = mapped === "admin" && !hasOwner ? "owner" : mapped;
		await ctx.db.insert("workspaceMembers", { workspaceId, userId, role, status: "active", clerkMembershipId: m.id, addedAt: Date.now() });
	}
	await applyInvites(ctx, workspaceId, userId, existingUser?.email || email);
}

async function suspendMembership(ctx: MutationCtx, m: IClerkMembership) {
	const workspace = await workspaceByOrg(ctx, m.organization.id);
	const user = await userByClerkId(ctx, m.public_user_data.user_id);
	if (!workspace || !user) return;
	const row = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id).eq("userId", user._id))
		.unique();
	if (row) await ctx.db.patch(row._id, { status: "suspended" });
	// Edit locks held by this user in the workspace are released (handoff 01 isolation test e).
	const locks = await ctx.db.query("editLocks").withIndex("by_user", (q) => q.eq("userId", user._id)).take(200);
	for (const lock of locks) {
		const site = await ctx.db.get(lock.siteId);
		if (site?.workspaceId === workspace._id) await ctx.db.delete(lock._id);
	}
}

/** Returns what happened, for the webhookEvents row. */
async function handle(ctx: MutationCtx, type: string, data: any): Promise<"processed" | "ignored"> {
	switch (type) {
		case "user.created":
		case "user.updated": {
			const u = data as IClerkUser;
			await upsertUser(ctx, u.id, { name: fullName(u.first_name, u.last_name, u.username ?? primaryEmail(u) ?? "New user"), email: primaryEmail(u) });
			return "processed";
		}
		case "user.deleted": {
			const user = data?.id ? await userByClerkId(ctx, data.id) : null;
			if (user) await ctx.db.patch(user._id, { status: "suspended" });
			return "processed";
		}
		case "organization.created":
		case "organization.updated":
			await upsertWorkspace(ctx, data as IClerkOrg);
			return "processed";
		case "organization.deleted": {
			const workspace = data?.id ? await workspaceByOrg(ctx, data.id) : null;
			if (!workspace) return "ignored";
			const members = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspace._id))
				.take(1000);
			for (const m of members) await ctx.db.patch(m._id, { status: "suspended" });
			return "processed";
		}
		case "organizationMembership.created":
		case "organizationMembership.updated":
			await setMembership(ctx, data as IClerkMembership);
			return "processed";
		case "organizationMembership.deleted":
			await suspendMembership(ctx, data as IClerkMembership);
			return "processed";
		case "organizationInvitation.accepted": {
			const inv = data as IClerkInvitation;
			const invite = await ctx.db
				.query("invites")
				.withIndex("by_clerkInvitation", (q) => q.eq("clerkInvitationId", inv.id))
				.unique();
			if (!invite) return "ignored";
			if (invite.status === "pending") await ctx.db.patch(invite._id, { status: "accepted", acceptedAt: Date.now() });
			const user = await ctx.db
				.query("users")
				.withIndex("by_email", (q) => q.eq("email", inv.email_address.toLowerCase()))
				.first();
			if (user) await applyInvites(ctx, invite.workspaceId, user._id, user.email);
			return "processed";
		}
		case "organizationInvitation.revoked": {
			const invite = await ctx.db
				.query("invites")
				.withIndex("by_clerkInvitation", (q) => q.eq("clerkInvitationId", data?.id ?? ""))
				.unique();
			if (invite && invite.status === "pending") await ctx.db.patch(invite._id, { status: "revoked" });
			return invite ? "processed" : "ignored";
		}
		default:
			return "ignored";
	}
}

export const apply = internalMutation({
	args: { deliveryId: v.string(), type: v.string(), data: v.any() },
	handler: async (ctx, { deliveryId, type, data }) => {
		const seen = await ctx.db
			.query("webhookEvents")
			.withIndex("by_source_delivery", (q) => q.eq("source", "clerk").eq("deliveryId", deliveryId))
			.unique();
		if (seen) return { duplicate: true as const, status: seen.status };
		const status = await handle(ctx, type, data);
		await ctx.db.insert("webhookEvents", { source: "clerk", deliveryId, type, receivedAt: Date.now(), status });
		return { duplicate: false as const, status };
	},
});
