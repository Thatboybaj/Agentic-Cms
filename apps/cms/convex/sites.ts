// Sites (api-map §1). /s/[site] resolves (active Clerk org, slug).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { siteRoleFor } from "./lib/access";
import { siteQuery, workspaceQuery } from "./lib/functions";

/** The fields the site switcher needs. Settings, spend and routing stay behind site-scoped queries. */
function summary(site: Doc<"sites">, role: string) {
	return { _id: site._id, slug: site.slug, name: site.name, domain: site.domain, icon: site.icon, accent: site.accent, status: site.status, role };
}

/** Sites in the active workspace that this person can open, with their effective role. */
export const list = workspaceQuery({
	args: {},
	handler: async (ctx) => {
		const { workspace, user } = ctx.access;
		const sites = await ctx.db
			.query("sites")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
			.take(500);
		const out = [];
		for (const site of sites) {
			const role = await siteRoleFor(ctx, site, user._id);
			if (role) out.push(summary(site, role));
		}
		return out;
	},
});

/**
 * Slug lookup inside the active workspace. "no-access" is only ever returned for a site in the caller's own
 * workspace (the UI shows "Request access"); slugs from other workspaces are "not-found".
 */
export const bySlug = workspaceQuery({
	args: { slug: v.string() },
	handler: async (ctx, { slug }) => {
		const { workspace, user } = ctx.access;
		const site = await ctx.db
			.query("sites")
			.withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspace._id).eq("slug", slug))
			.unique();
		if (!site) return { status: "not-found" as const };
		const role = await siteRoleFor(ctx, site, user._id);
		if (!role) return { status: "no-access" as const, name: site.name };
		return { status: "ok" as const, site: summary(site, role) };
	},
});

/** Full site record for members of the site. */
export const get = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx) => ({ ...ctx.access.site, role: ctx.access.role }),
});
