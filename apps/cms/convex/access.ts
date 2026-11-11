// Internal access check for actions (README §4): actions have no ctx.db, so siteAction calls this first.
// Internal only: never callable from the browser.
import { v } from "convex/values";
import { PERMISSIONS, type TPermission } from "../src/lib/logic";
import { internalQuery } from "./_generated/server";
import { accessError, requireSiteRole } from "./lib/access";

export const assertSiteRole = internalQuery({
	args: { siteId: v.id("sites"), permission: v.string() },
	handler: async (ctx, { siteId, permission }) => {
		if (!(permission in PERMISSIONS)) throw accessError("FORBIDDEN", "Unknown permission");
		const { user, role, workspaceId } = await requireSiteRole(ctx, siteId, permission as TPermission);
		return { siteId, userId: user._id, role, workspaceId };
	},
});
