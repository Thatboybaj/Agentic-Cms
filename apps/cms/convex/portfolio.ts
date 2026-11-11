// Portfolio (api-map §1 `usePortfolio()` → `portfolio.list`): one row per site the caller can open, with what the
// Sites page shows. Counts read posts by `by_site_state` (bounded); posts land in Convex in handoff 02, so they are 0
// until then. Spend is the month cache on the site row (micro-USD → USD).
import type { TPostState } from "../src/lib/types";
import { siteRoleFor } from "./lib/access";
import { workspaceQuery } from "./lib/functions";

const STATES: TPostState[] = ["idea", "briefed", "drafting", "needs-assets", "in-review", "mr-open", "live", "decaying"];
const PER_STATE_CAP = 500;

export const list = workspaceQuery({
	args: {},
	handler: async (ctx) => {
		const { workspace, user } = ctx.access;
		const sites = await ctx.db
			.query("sites")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
			.take(500);
		const rows = [];
		for (const site of sites) {
			const role = await siteRoleFor(ctx, site, user._id);
			if (!role) continue;
			const counts = {} as Record<TPostState, number>;
			for (const state of STATES) {
				counts[state] = (
					await ctx.db
						.query("posts")
						.withIndex("by_site_state", (q) => q.eq("siteId", site._id).eq("state", state))
						.take(PER_STATE_CAP)
				).length;
			}
			counts.live += site.liveBaseline;
			const ideasPending = (await ctx.db.query("posts").withIndex("by_site_idea", (q) => q.eq("siteId", site._id).eq("ideaStatus", "pending")).take(PER_STATE_CAP)).length;
			const last = await ctx.db
				.query("auditEvents")
				.withIndex("by_site_at", (q) => q.eq("siteId", site._id))
				.order("desc")
				.first();
			rows.push({
				siteId: site._id,
				slug: site.slug,
				name: site.name,
				domain: site.domain,
				industry: site.industry,
				icon: site.icon,
				accent: site.accent,
				status: site.status,
				createdAt: site.createdAt,
				siteStartedAt: site.siteStartedAt,
				cadenceTarget: site.cadenceTarget,
				searchConsole: site.searchConsole,
				rankSource: site.rankSource,
				publishing: site.publishing,
				role,
				counts,
				ideasPending,
				spend: {
					textUsd: site.spend.textMicroUsd / 1e6,
					imageUsd: site.spend.imageMicroUsd / 1e6,
					textCapUsd: site.budgetCaps.textCapUsd,
					imageCapUsd: site.budgetCaps.imageCapUsd,
				},
				lastActivityAt: last?.at ?? null,
			});
		}
		return rows;
	},
});
