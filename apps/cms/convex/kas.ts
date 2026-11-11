// Keyword Attribution Score recalculation (handoff 07 step 5). Deterministic, no model, no spend: logic.ts computeKas
// / concentration / pillarDistribution / postKas, unchanged, on this site's keywords. Writes a kasSnapshots row and
// the caches (keywords.kasShare/kasDelta, pillars.kasShare/claimedButUnearned, posts.kasContribution). Without
// Search Console there are no positions to score: a data gap, never zeros.
import { v } from "convex/values";
import { computeKas, concentration, pillarDistribution, postKas } from "../src/lib/logic";
import type { IKeyword } from "../src/lib/types";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { siteQuery } from "./lib/functions";

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtDay = (t: number) => new Date(t).toUTCString().slice(5, 11).trim();

export async function recalcFor(ctx: MutationCtx, siteId: Id<"sites">, trigger: "post-merge" | "weekly" | "manual", ref: { mrId?: Id<"mergeRequests">; postId?: Id<"posts"> } = {}): Promise<{ ok: true; label: string } | { ok: false; reason: string }> {
	const site = await ctx.db.get(siteId);
	if (!site) return { ok: false, reason: "Site not found" };
	if (site.searchConsole !== "connected") return { ok: false, reason: "Data gap: Search Console not connected. No scores written." };
	const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(5000);
	if (!keywords.some((k) => k.position !== null)) return { ok: false, reason: "Data gap: no positions imported yet. No scores written." };
	const shares = new Map(computeKas(keywords.map((k) => ({ id: k._id, impressions: k.impressions, position: k.position, intent: k.intent })), site.ctrCurve).map((s) => [s.keywordId, round1(s.share)]));
	const next = keywords.map((k) => ({ ...k, kasShare: shares.get(k._id) ?? 0 }));
	for (const k of next) {
		const prev = keywords.find((x) => x._id === k._id)!;
		if (prev.kasShare !== k.kasShare) await ctx.db.patch(k._id, { kasShare: k.kasShare, kasDelta: round1(k.kasShare - prev.kasShare) });
	}
	const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
	for (const p of pillarDistribution(next.map((k) => ({ pillarId: k.pillarId as string, kasShare: k.kasShare })), pillars.map((p) => ({ id: p._id as string, name: p.name, plannedPosts: p.plannedPosts })))) {
		const row = pillars.find((x) => x._id === p.pillarId)!;
		if (row.kasShare !== p.share || row.claimedButUnearned !== p.claimedButUnearned) await ctx.db.patch(row._id, { kasShare: p.share, claimedButUnearned: p.claimedButUnearned });
	}
	const asKeywords = next.map((k) => ({ id: k._id as string, rankingUrl: k.rankingUrl, kasShare: k.kasShare }) as unknown as IKeyword);
	for (const post of await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(1000)) {
		const contribution = postKas(post, asKeywords);
		if (post.kasContribution !== contribution) await ctx.db.patch(post._id, { kasContribution: contribution });
	}
	const conc = concentration(next.map((k) => ({ id: k._id as string, kasShare: k.kasShare })));
	const label = `Recalculated ${fmtDay(Date.now())}${trigger === "post-merge" ? " · after 1 merge" : trigger === "weekly" ? " · weekly" : " · manual"}`;
	await ctx.db.insert("kasSnapshots", { siteId, at: Date.now(), trigger, label, ...(ref.mrId ? { mrId: ref.mrId } : {}), ...(ref.postId ? { postId: ref.postId } : {}), concentration: conc.top, shares: next.filter((k) => k.kasShare > 0).map((k) => ({ keywordId: k._id, share: k.kasShare, position: k.position })), ...(site.ctrCurve ? { ctrCurveVersion: "site" } : { ctrCurveVersion: "default" }) });
	await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: { system: "CMS agent" }, action: "recalculated KAS", target: `${keywords.length} keywords`, detail: `Top-5 concentration ${conc.top}%${conc.fragile ? " · fragile" : ""}` });
	return { ok: true, label: `${label} · top-5 ${conc.top}%${conc.fragile ? " (fragile)" : ""}` };
}

export const recalc = internalMutation({
	args: { siteId: v.id("sites"), trigger: v.union(v.literal("post-merge"), v.literal("weekly"), v.literal("manual")), mrId: v.optional(v.id("mergeRequests")), postId: v.optional(v.id("posts")) },
	handler: async (ctx, { siteId, trigger, mrId, postId }) => recalcFor(ctx, siteId, trigger, { ...(mrId ? { mrId } : {}), ...(postId ? { postId } : {}) }),
});

export const history = siteQuery({
	permission: "seo.view",
	args: {},
	handler: async (ctx, { siteId }) => ctx.db.query("kasSnapshots").withIndex("by_site_at", (q) => q.eq("siteId", siteId)).order("desc").take(26),
});
