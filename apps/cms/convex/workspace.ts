// Workspace reads (api-map §1). The active workspace is the JWT's active Clerk org.
import { workspaceQuery } from "./lib/functions";

export const current = workspaceQuery({
	args: {},
	handler: async (ctx) => {
		const { workspace, workspaceRole, user } = ctx.access;
		return { _id: workspace._id, name: workspace.name, slug: workspace.slug, plan: workspace.plan, seats: workspace.seats, role: workspaceRole, userId: user._id };
	},
});
