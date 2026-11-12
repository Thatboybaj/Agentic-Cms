// Starting site discovery (prd-site-discovery F1, F2, F4): automatically when a site is added, or on demand by a
// specialist or admin (Plan empty state, the report, Runs "Run now"). Same workflow either way.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { audit } from "../lib/audit";
import { siteMutation } from "../lib/functions";
import { workflow } from "../workflows/manager";
import { openDiscoveryRun, settingsOf } from "./data";

type TResult = { ok: true; runId: Id<"runs"> } | { ok: false; reason: string };

/** Whether this deployment can run discovery at all; the reason when it can't. */
export function discoveryBlocked(): string | null {
	if (process.env.CMS_AGENTS !== "live") return "Live agents are off on this deployment";
	if (!process.env.FIRECRAWL_API_KEY) return "Firecrawl isn't set up on this deployment (FIRECRAWL_API_KEY)";
	return null;
}

export async function startDiscovery(ctx: MutationCtx, site: Doc<"sites">, o: { mode: "full" | "more-ideas" | "interview"; trigger: "manual" | "workflow"; user?: Doc<"users">; interview?: { question: string; answer: string }[] }): Promise<TResult> {
	const blocked = discoveryBlocked();
	if (blocked) return { ok: false, reason: blocked };
	if (site.status === "paused") return { ok: false, reason: "This site is paused · resume it to run discovery" };
	const opened = await openDiscoveryRun(ctx, site, { mode: o.mode, trigger: o.trigger, ...(o.user ? { userId: o.user._id } : {}), ...(o.interview ? { interview: o.interview } : {}) });
	if (!opened.ok) return opened;
	const context = { siteId: site._id, runId: opened.runId, reportId: opened.reportId };
	const workflowId = await workflow.start(ctx, internal.workflows.discovery.discovery, { ...context, mode: o.mode }, { startAsync: true, onComplete: internal.workflows.discovery.discoveryDone, context });
	await ctx.db.patch(opened.runId, { workflowId });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: o.user ?? { system: "Site discovery agent" }, action: "started site discovery", target: site.domain, detail: o.mode === "full" ? `Up to ${settingsOf(site).maxPages} pages` : o.mode === "interview" ? "From the discovery interview" : "Another batch of ideas from the current plan" });
	return { ok: true, runId: opened.runId };
}

/** F1: called by sites.add. Quietly does nothing when "Discover on add" is off or the deployment can't run it. */
export async function discoverOnAdd(ctx: MutationCtx, site: Doc<"sites">) {
	if (!settingsOf(site).onAdd || discoveryBlocked()) return;
	await startDiscovery(ctx, site, { mode: "full", trigger: "workflow" });
}

/** F2 / F27: Run discovery (full) or Generate more ideas, from the Plan, the report or Runs. */
export const run = siteMutation({
	permission: "discovery.run",
	args: { mode: v.union(v.literal("full"), v.literal("more-ideas")) },
	handler: async (ctx, { mode }): Promise<TResult> => startDiscovery(ctx, ctx.access.site, { mode, trigger: "manual", user: ctx.access.user }),
});
