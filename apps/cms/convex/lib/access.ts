// Tenant access: the one helper every public function goes through (backend README §4, rules I1–I8).
//
//   identity → user (by tokenIdentifier) → site → workspace from the JWT's active org → effective role → PERMISSIONS
//
// Errors are ConvexError({ code, reason }) with code UNAUTHENTICATED | NOT_FOUND | FORBIDDEN. A missing site and a
// site in another workspace both give the same NOT_FOUND (I8: no existence oracle). FORBIDDEN carries
// lockReason(role, permission) so the UI copy matches today's LockedAction.
import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";
import { PERMISSIONS, lockReason, type TPermission } from "../../src/lib/logic";
import type { TRole } from "../../src/lib/types";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type TReadCtx = QueryCtx | MutationCtx;

export type TAccessCode = "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN";

export interface ISiteAccess {
	user: Doc<"users">;
	site: Doc<"sites">;
	role: TRole;
	workspaceId: Id<"workspaces">;
}

export interface IWorkspaceAccess {
	user: Doc<"users">;
	workspace: Doc<"workspaces">;
	workspaceRole: Doc<"workspaceMembers">["role"];
}

export function accessError(code: TAccessCode, reason?: string): ConvexError<{ code: TAccessCode; reason: string }> {
	const fallback = code === "UNAUTHENTICATED" ? "Not authenticated" : code === "NOT_FOUND" ? "Not found" : "Not allowed";
	return new ConvexError({ code, reason: reason ?? fallback });
}

/**
 * The active Clerk organization from the JWT. The Clerk JWT template "convex" must carry it as a custom claim:
 *   { "org_id": "{{org.id}}", "org_role": "{{org.role}}" }
 * (handoff 00 step 3). No active org = not signed in to a workspace = UNAUTHENTICATED (handoff 01 test d).
 */
export function activeOrgId(identity: UserIdentity): string | null {
	const claim = (identity as Record<string, unknown>).org_id;
	return typeof claim === "string" && claim.length > 0 ? claim : null;
}

export async function requireIdentity(ctx: { auth: QueryCtx["auth"] }): Promise<UserIdentity> {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw accessError("UNAUTHENTICATED");
	return identity;
}

/** The signed-in user's row. Refuses missing and suspended users. Mutations can lazily create it: see `users.ensure`. */
export async function currentUser(ctx: TReadCtx, identity?: UserIdentity): Promise<Doc<"users">> {
	const id = identity ?? (await requireIdentity(ctx));
	const user = await ctx.db
		.query("users")
		.withIndex("by_token", (q) => q.eq("tokenIdentifier", id.tokenIdentifier))
		.unique();
	if (!user || user.status === "suspended") throw accessError("UNAUTHENTICATED", "Not authenticated");
	return user;
}

/** The workspace for the JWT's active org. Convex never invents an org (README §5): no row = UNAUTHENTICATED. */
export async function currentWorkspace(ctx: TReadCtx, identity?: UserIdentity): Promise<Doc<"workspaces">> {
	const id = identity ?? (await requireIdentity(ctx));
	const orgId = activeOrgId(id);
	if (!orgId) throw accessError("UNAUTHENTICATED", "No active workspace");
	const workspace = await ctx.db
		.query("workspaces")
		.withIndex("by_clerkOrg", (q) => q.eq("clerkOrgId", orgId))
		.unique();
	if (!workspace) throw accessError("UNAUTHENTICATED", "No active workspace");
	return workspace;
}

export async function workspaceMember(ctx: TReadCtx, workspaceId: Id<"workspaces">, userId: Id<"users">): Promise<Doc<"workspaceMembers"> | null> {
	const row = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
		.unique();
	return row && row.status === "active" ? row : null;
}

/**
 * Effective site role (multi-site contract §2): workspace owner/admin → admin on every site; otherwise the
 * membership role; no membership → null (no access).
 */
export function effectiveRole(member: Pick<Doc<"workspaceMembers">, "role"> | null, membership: Pick<Doc<"memberships">, "role"> | null): TRole | null {
	if (!member) return null;
	if (member.role === "owner" || member.role === "admin") return "admin";
	return membership?.role ?? null;
}

export async function siteRoleFor(ctx: TReadCtx, site: Doc<"sites">, userId: Id<"users">): Promise<TRole | null> {
	const member = await workspaceMember(ctx, site.workspaceId, userId);
	if (!member) return null;
	const membership = await ctx.db
		.query("memberships")
		.withIndex("by_site_user", (q) => q.eq("siteId", site._id).eq("userId", userId))
		.unique();
	return effectiveRole(member, membership);
}

function assertPermission(role: TRole, permission: TPermission): void {
	if (!PERMISSIONS[permission].includes(role)) {
		throw accessError("FORBIDDEN", lockReason(role, permission) ?? "Not allowed");
	}
}

/** README §4 "The one helper". Signature is a contract for handoffs 02–09: don't change it without updating them. */
export async function requireSiteRole(ctx: TReadCtx, siteId: Id<"sites">, permission: TPermission): Promise<ISiteAccess> {
	const identity = await requireIdentity(ctx);
	const user = await currentUser(ctx, identity);
	const workspace = await currentWorkspace(ctx, identity);
	const site = await ctx.db.get(siteId);
	// Same answer for "doesn't exist", "other workspace" and "no membership" (I8).
	if (!site || site.workspaceId !== workspace._id) throw accessError("NOT_FOUND");
	const role = await siteRoleFor(ctx, site, user._id);
	if (!role) throw accessError("NOT_FOUND");
	assertPermission(role, permission);
	return { user, site, role, workspaceId: workspace._id };
}

/**
 * Workspace-level check. With a permission, the caller's workspace role is mapped like a site role (owner/admin →
 * admin; member → no workspace-level admin rights). Without one, any active member passes.
 */
export async function requireWorkspaceRole(ctx: TReadCtx, permission: TPermission | null): Promise<IWorkspaceAccess> {
	const identity = await requireIdentity(ctx);
	const user = await currentUser(ctx, identity);
	const workspace = await currentWorkspace(ctx, identity);
	const member = await workspaceMember(ctx, workspace._id, user._id);
	if (!member) throw accessError("UNAUTHENTICATED", "No active workspace");
	if (permission) {
		if (member.role === "member") throw accessError("FORBIDDEN", lockReason("specialist", permission) ?? "Only an agency admin can change this");
		assertPermission("admin", permission);
	}
	return { user, workspace, workspaceRole: member.role };
}

/** I2: child reads go through the parent. A post id from another site is NOT_FOUND, never a cross-tenant read. */
export async function loadPostInSite(ctx: TReadCtx, siteId: Id<"sites">, postId: Id<"posts">): Promise<Doc<"posts">> {
	const post = await ctx.db.get(postId);
	if (!post || post.siteId !== siteId) throw accessError("NOT_FOUND");
	return post;
}
