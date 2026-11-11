// Notifications (api-map §9): one row per recipient. Recipients are resolved here so callers name an audience, not a
// list. dedupeKey suppresses a repeat while the earlier one is still unread.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { TTone } from "../../src/lib/types";
import { PERMISSIONS, type TPermission } from "../../src/lib/logic";
import { siteRoleFor } from "./access";

/** Active people who can open the site: its members plus workspace owners/admins. */
export async function siteAudience(ctx: MutationCtx, site: Doc<"sites">): Promise<Id<"users">[]> {
	const ids = new Set<Id<"users">>();
	const members = await ctx.db
		.query("memberships")
		.withIndex("by_site_user", (q) => q.eq("siteId", site._id))
		.take(500);
	for (const m of members) ids.add(m.userId);
	const ws = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) => q.eq("workspaceId", site.workspaceId))
		.take(1000);
	const active = new Set(ws.filter((w) => w.status === "active").map((w) => w.userId));
	for (const w of ws) if (w.status === "active" && (w.role === "owner" || w.role === "admin")) ids.add(w.userId);
	return [...ids].filter((id) => active.has(id));
}

/** The site's people whose effective role has this permission (api-map §9 fan-out: approvers, mergers…). */
export async function siteAudienceWith(ctx: MutationCtx, site: Doc<"sites">, permission: TPermission): Promise<Id<"users">[]> {
	const out: Id<"users">[] = [];
	for (const userId of await siteAudience(ctx, site)) {
		const role = await siteRoleFor(ctx, site, userId);
		if (role && PERMISSIONS[permission].includes(role)) out.push(userId);
	}
	return out;
}

export interface INotifyInput {
	workspaceId: Id<"workspaces">;
	siteId?: Id<"sites">;
	userIds: Id<"users">[];
	tone: TTone;
	title: string;
	body: string;
	href?: string;
	dedupeKey?: string;
	/** Usually the actor: people aren't notified about their own actions. */
	except?: Id<"users">;
}

export async function notify(ctx: MutationCtx, n: INotifyInput): Promise<void> {
	const at = Date.now();
	for (const userId of new Set(n.userIds)) {
		if (userId === n.except) continue;
		if (n.dedupeKey) {
			const unread = await ctx.db
				.query("notifications")
				.withIndex("by_user_read_at", (q) => q.eq("userId", userId).eq("read", false))
				.order("desc")
				.take(50);
			if (unread.some((x) => x.dedupeKey === n.dedupeKey)) continue;
		}
		await ctx.db.insert("notifications", {
			workspaceId: n.workspaceId,
			...(n.siteId ? { siteId: n.siteId } : {}),
			userId,
			at,
			tone: n.tone,
			title: n.title,
			body: n.body,
			...(n.href ? { href: n.href } : {}),
			read: false,
			...(n.dedupeKey ? { dedupeKey: n.dedupeKey } : {}),
		});
	}
}
