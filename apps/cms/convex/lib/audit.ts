// Audit (api-map §9, README §5): append-only, one helper for every mutation. Action strings match the prototype store
// (src/lib/store.tsx) so the UI and tests read the same words. There is no update or delete function for this table.
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export interface IAuditInput {
	workspaceId: Id<"workspaces">;
	/** Omit for workspace-level events (team, sites list). */
	siteId?: Id<"sites">;
	actor: Pick<Doc<"users">, "_id" | "name"> | { system: string };
	action: string;
	target: string;
	detail?: string;
	postId?: Id<"posts">;
}

export async function audit(ctx: MutationCtx, e: IAuditInput): Promise<void> {
	const isSystem = "system" in e.actor;
	await ctx.db.insert("auditEvents", {
		workspaceId: e.workspaceId,
		...(e.siteId ? { siteId: e.siteId } : {}),
		at: Date.now(),
		actor: isSystem ? (e.actor as { system: string }).system : (e.actor as Doc<"users">).name,
		actorKind: isSystem ? "system" : "user",
		...(isSystem ? {} : { actorUserId: (e.actor as Doc<"users">)._id }),
		action: e.action,
		target: e.target,
		...(e.detail ? { detail: e.detail } : {}),
		...(e.postId ? { postId: e.postId } : {}),
	});
}
