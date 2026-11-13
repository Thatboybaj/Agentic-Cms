// Site blog categories (every site that has a fixed list). Imported from the repo's blog config when it declares one
// (blog.config.json → categories: [{ key, en | label, ar?, covers? }]), or set directly. Each pillar is filed under
// one category: the one set on it, otherwise the closest match (lib/categories.ts), saved so it stays put.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { categoryOf } from "./lib/categories";
import { activeRepo } from "./lib/gateInputs";
import { vSiteCategory } from "./schema";

export const repoFor = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const conn = await activeRepo(ctx, siteId);
		return conn && conn.host === "github" && conn.live ? { installationId: conn.installationId, repo: conn.repo, ref: conn.baseBranch } : null;
	},
});

/** Saves the site's categories and files every pillar without one under its closest category. */
export const set = internalMutation({
	args: { siteId: v.id("sites"), categories: v.array(vSiteCategory), pillarKeys: v.optional(v.array(v.object({ name: v.string(), key: v.string() }))) },
	handler: async (ctx, { siteId, categories, pillarKeys }) => {
		await ctx.db.patch(siteId, { categories });
		const out: { pillar: string; key: string }[] = [];
		for (const p of await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(200)) {
			const want = pillarKeys?.find((x) => x.name === p.name)?.key;
			const key = want && categories.some((c) => c.key === want) ? want : p.categoryKey && categories.some((c) => c.key === p.categoryKey) ? p.categoryKey : categoryOf(categories, { name: p.name })!.key;
			if (key !== p.categoryKey) await ctx.db.patch(p._id, { categoryKey: key });
			out.push({ pillar: p.name, key });
		}
		return out;
	},
});

/** Reads the categories from the repo's blog config and saves them. */
export const importFromRepo = internalAction({
	args: { siteId: v.id("sites"), path: v.optional(v.string()), pillarKeys: v.optional(v.array(v.object({ name: v.string(), key: v.string() }))) },
	handler: async (ctx, { siteId, path, pillarKeys }): Promise<{ ok: boolean; reason?: string; pillars?: { pillar: string; key: string }[] }> => {
		const repo = await ctx.runQuery(internal.categories.repoFor, { siteId });
		if (!repo) return { ok: false, reason: "No repo connected through the GitHub App" };
		const text = await ctx.runAction(internal.gitNode.readFile, { ...repo, path: path ?? "blog.config.json" });
		if (!text) return { ok: false, reason: `${path ?? "blog.config.json"} isn't in the repo` };
		let raw: { categories?: { key?: string; en?: string; label?: string; ar?: string; covers?: string }[] };
		try {
			raw = JSON.parse(text) as typeof raw;
		} catch {
			return { ok: false, reason: "The blog config isn't valid JSON" };
		}
		const categories = (raw.categories ?? [])
			.filter((c) => c.key && (c.en || c.label))
			.map((c) => ({ key: c.key!, label: (c.en ?? c.label)!, ...(c.covers ? { covers: c.covers } : {}), ...(c.ar ? { labels: [{ lang: "ar", label: c.ar }] } : {}) }));
		if (!categories.length) return { ok: false, reason: "The blog config lists no categories" };
		const pillars = await ctx.runMutation(internal.categories.set, { siteId, categories, ...(pillarKeys ? { pillarKeys } : {}) });
		return { ok: true, pillars };
	},
});
