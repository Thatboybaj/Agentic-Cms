// Publish-readiness gate (prd-site-discovery F22–F25): repo connected, content and asset folders set, article
// template confirmed, and on a regulated site the drafted profile accepted (SD3). Read by startGeneration (no
// drafting, image or model spend until ready) and by the screens' readiness banner.
import { publishReadiness, type IPublishReadiness } from "../../src/lib/logic";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function readinessOf(ctx: QueryCtx, site: Doc<"sites">): Promise<IPublishReadiness> {
	const repo = (await ctx.db.query("repoConnections").withIndex("by_site", (q) => q.eq("siteId", site._id)).take(10)).find((c) => c.status === "active") ?? null;
	const templateConfirmed = (await ctx.db.query("templateManifests").withIndex("by_site_status", (q) => q.eq("siteId", site._id).eq("status", "confirmed")).take(1)).length > 0;
	const profile = (await ctx.db.query("siteProfiles").withIndex("by_site_version", (q) => q.eq("siteId", site._id)).order("desc").take(1))[0];
	const profileAcceptanceNeeded = !!profile && profile.regulated.category !== "none" && !profile.acceptedAt;
	return publishReadiness({ repo: repo ? { active: true, contentDir: repo.contentDir, assetDir: repo.assetDir } : null, templateConfirmed, profileAcceptanceNeeded });
}
