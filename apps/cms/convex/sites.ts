// Sites (api-map §1). /s/[site] resolves (active Clerk org, slug).
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { siteRoleFor } from "./lib/access";
import { audit } from "./lib/audit";
import { DEFAULT_SCHEDULES, DOMAIN_RE, newSiteFields, nextAtFor, slugify } from "./lib/defaults";
import { siteMutation, siteQuery, workspaceMutation, workspaceQuery } from "./lib/functions";
import { notify, siteAudience } from "./lib/notify";

type TResult = { ok: true; id?: string; slug?: string } | { ok: false; reason: string };

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

/** A free slug in this workspace: "lumen", then "lumen-2", "lumen-3"… (api-map: slug collision → suffix). */
async function freeSlug(ctx: MutationCtx, workspaceId: Id<"workspaces">, base: string): Promise<string> {
	for (let n = 1; n < 100; n++) {
		const slug = n === 1 ? base : `${base}-${n}`;
		const taken = await ctx.db
			.query("sites")
			.withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspaceId).eq("slug", slug))
			.unique();
		if (!taken) return slug;
	}
	return `${base}-${Date.now().toString(36)}`;
}

/** addSite: status onboarding, default publishing/routing/schedules. Returns the new id and slug. */
export const add = workspaceMutation({
	permission: "site.add",
	args: { name: v.string(), domain: v.string(), industry: v.optional(v.string()), icon: v.optional(v.string()) },
	handler: async (ctx, args): Promise<TResult> => {
		const { workspace, user } = ctx.access;
		const name = args.name.trim();
		const domain = args.domain.trim().toLowerCase();
		if (!name || !DOMAIN_RE.test(domain)) return { ok: false, reason: "Add a name and a domain like example.com" };
		const sameDomain = (await ctx.db.query("sites").withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id)).take(500)).some((s) => s.domain === domain);
		if (sameDomain) return { ok: false, reason: "That site already exists" };
		const slug = await freeSlug(ctx, workspace._id, slugify(name) || "site");
		const at = Date.now();
		const siteId = await ctx.db.insert("sites", newSiteFields({ workspaceId: workspace._id, slug, name, domain, industry: args.industry?.trim() || "Other", icon: args.icon ?? "globe" }, at));
		for (const s of DEFAULT_SCHEDULES) {
			await ctx.db.insert("schedules", { siteId, kind: s.kind, label: s.label, cadence: s.cadence, rule: s.rule, produces: s.produces, nextAt: nextAtFor(s.rule, at), enabled: true });
		}
		await audit(ctx, { workspaceId: workspace._id, siteId, actor: user, action: "added site", target: name, detail: domain });
		await audit(ctx, { workspaceId: workspace._id, actor: user, action: "added site", target: name, detail: domain });
		return { ok: true, id: siteId, slug };
	},
});

/** pauseSite / resumeSite. Paused: schedules skip and agents stop at their next step; data stays. */
export const setStatus = siteMutation({
	permission: "site.add",
	args: { status: v.union(v.literal("paused"), v.literal("active")) },
	handler: async (ctx, { status }): Promise<TResult> => {
		const { site, user, workspaceId } = ctx.access;
		if (site.status === status) return { ok: true };
		if (status === "active" && site.status !== "paused") return { ok: true };
		await ctx.db.patch(site._id, { status });
		const paused = status === "paused";
		await audit(ctx, { workspaceId, siteId: site._id, actor: user, action: paused ? "paused site" : "resumed site", target: site.name, detail: paused ? "Agents and schedules stop · data stays" : "Agents and schedules run again" });
		await audit(ctx, { workspaceId, actor: user, action: paused ? "paused site" : "resumed site", target: site.name });
		if (paused) {
			await notify(ctx, { workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), except: user._id, tone: "neutral", title: "Site paused", body: "Agents and schedules are stopped until an admin resumes the site.", href: "/settings" });
		}
		return { ok: true };
	},
});
