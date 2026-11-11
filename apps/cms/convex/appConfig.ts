// GitHub App credentials: from the Convex env when all four are set, otherwise from the App Manifest flow
// (gitConnect.beginAppManifest → GitHub → /github/manifest/callback), where GitHub returns the App id, slug,
// private key and webhook secret directly to Convex and they're sealed here. Nobody copies a key by hand.
import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { open, seal } from "./lib/crypto";

export interface IGithubConfig {
	appId: string;
	slug: string;
	privateKey: string;
	webhookSecret: string;
}

const KEYS = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"] as const;
const aad = (key: string) => `platform:${key}`;

export async function githubConfig(ctx: QueryCtx): Promise<IGithubConfig | null> {
	const env = KEYS.map((k) => process.env[k]);
	if (env.every(Boolean)) return { appId: env[0]!, slug: env[1]!, privateKey: env[2]!.replace(/\\n/g, "\n"), webhookSecret: env[3]! };
	const vals: string[] = [];
	for (const k of KEYS) {
		const row = await ctx.db.query("appConfig").withIndex("by_key", (q) => q.eq("key", k)).unique();
		if (!row) return null;
		vals.push(await open(row.ciphertext, aad(k)));
	}
	return { appId: vals[0]!, slug: vals[1]!, privateKey: vals[2]!, webhookSecret: vals[3]! };
}

/** For actions and HTTP routes (internal only: never exposed to a client). */
export const github = internalQuery({ args: {}, handler: async (ctx): Promise<IGithubConfig | null> => githubConfig(ctx) });

export const githubConfigured = internalQuery({
	args: {},
	handler: async (ctx) => KEYS.every((k) => !!process.env[k]) || (await ctx.db.query("appConfig").withIndex("by_key", (q) => q.eq("key", "GITHUB_APP_ID")).unique()) !== null,
});

export const storeGithub = internalMutation({
	args: { appId: v.string(), slug: v.string(), privateKey: v.string(), webhookSecret: v.string() },
	handler: async (ctx, a) => {
		const values: Record<(typeof KEYS)[number], string> = { GITHUB_APP_ID: a.appId, GITHUB_APP_SLUG: a.slug, GITHUB_APP_PRIVATE_KEY: a.privateKey, GITHUB_WEBHOOK_SECRET: a.webhookSecret };
		for (const k of KEYS) {
			const sealed = await seal(values[k], aad(k));
			const row = await ctx.db.query("appConfig").withIndex("by_key", (q) => q.eq("key", k)).unique();
			if (row) await ctx.db.patch(row._id, { ciphertext: sealed.ciphertext, keyVersion: sealed.keyVersion, updatedAt: Date.now() });
			else await ctx.db.insert("appConfig", { key: k, ciphertext: sealed.ciphertext, keyVersion: sealed.keyVersion, updatedAt: Date.now() });
		}
	},
});

export const siteSlug = internalQuery({ args: { siteId: v.id("sites") }, handler: async (ctx, { siteId }) => (await ctx.db.get(siteId))?.slug ?? null });
