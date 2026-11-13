// An author's slug follows their display name (photo files and links are named from it), unique per workspace.
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { slugify } from "./authorsCore";

export async function uniqueAuthorSlug(ctx: MutationCtx, workspaceId: Id<"workspaces">, name: string, self?: Id<"authors">): Promise<string> {
	const base = slugify(name) || "author";
	let slug = base;
	for (let i = 2; ; i++) {
		const taken = await ctx.db.query("authors").withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspaceId).eq("slug", slug)).first();
		if (!taken || taken._id === self) return slug;
		slug = `${base}-${i}`;
	}
}
