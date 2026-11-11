// Dev-only seed (api-map §9 `devSeed.reset`; handoff 01 step "devSeed"). Refuses unless CMS_DEV_TOOLS=1 on the
// deployment, so it can never run on staging or prod. Loads the prototype's demo sites (src/lib/seed.ts) into the
// CALLER's active workspace, with schedules. People are not seeded: per-site roles need real Clerk users, so the
// caller (an owner/admin) is admin on every seeded site by the workspace-role rule. Posts, keywords etc. land in 02.
import { ConvexError } from "convex/values";
import { createSeed } from "../src/lib/seed";
import { audit } from "./lib/audit";
import { DEFAULT_SCHEDULES, nextAtFor, spendMonth } from "./lib/defaults";
import { workspaceMutation, workspaceQuery } from "./lib/functions";

function requireDevTools() {
	if (process.env.CMS_DEV_TOOLS !== "1") throw new ConvexError({ code: "FORBIDDEN", reason: "Dev tools are off on this deployment" });
}

export const seedSites = workspaceMutation({
	permission: "site.add",
	args: {},
	handler: async (ctx) => {
		requireDevTools();
		const { workspace, user } = ctx.access;
		const seed = createSeed();
		const now = Date.now();
		const added: string[] = [];
		for (const s of seed.sites) {
			const taken = await ctx.db
				.query("sites")
				.withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspace._id).eq("slug", s.slug))
				.unique();
			if (taken) continue;
			const data = seed.data[s.id];
			const { "pillar-pages": pillarPages, ...restRouting } = data.modelRouting;
			const createdAt = Date.parse(s.createdAt) || now;
			const siteId = await ctx.db.insert("sites", {
				workspaceId: workspace._id,
				slug: s.slug,
				name: s.name,
				domain: s.domain,
				industry: s.industry,
				icon: s.icon,
				...(s.accent !== undefined ? { accent: s.accent } : {}),
				status: s.status,
				createdAt,
				siteStartedAt: now - s.ageMonths * 30 * 86_400_000,
				cadenceTarget: s.cadenceTarget,
				searchConsole: s.searchConsole,
				rankSource: s.rankSource,
				budgetCaps: { textCapUsd: s.budgets.textCapUsd, imageCapUsd: s.budgets.imageCapUsd },
				spend: { month: spendMonth(now), textMicroUsd: Math.round(s.budgets.textUsd * 1e6), imageMicroUsd: Math.round(s.budgets.imageUsd * 1e6) },
				publishing: s.publishing,
				routing: data.routing,
				modelRouting: { ...restRouting, pillarPages },
				brandPack: data.brandPack,
				...(data.ctrCurve ? { ctrCurve: data.ctrCurve } : {}),
				liveBaseline: data.liveBaseline,
				timezone: "Africa/Lagos",
			});
			const enabledByKind = new Map(data.schedules.map((x) => [x.kind, x.enabled]));
			for (const d of DEFAULT_SCHEDULES) {
				await ctx.db.insert("schedules", { siteId, kind: d.kind, label: d.label, cadence: d.cadence, rule: d.rule, produces: d.produces, nextAt: nextAtFor(d.rule, now), enabled: enabledByKind.get(d.kind) ?? true });
			}
			added.push(s.name);
		}
		if (added.length) await audit(ctx, { workspaceId: workspace._id, actor: user, action: "seeded demo sites", target: `${added.length} sites`, detail: added.join(", ") });
		return { ok: true as const, added };
	},
});

/** Lets the UI show dev-only controls. Says nothing beyond on/off. */
export const enabled = workspaceQuery({
	args: {},
	handler: async () => process.env.CMS_DEV_TOOLS === "1",
});
