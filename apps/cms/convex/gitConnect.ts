// Repo connection (handoff 06 step 1): beginInstall → GitHub → /github/setup (state verified, installation recorded)
// → the developer picks a repo the installation can see → scan suggests paths → connectRepo verifies access and writes
// the path-scoped connection. Wording is the prototype's (store.tsx connectRepo).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { siteAction, siteMutation, siteQuery } from "./lib/functions";
import { signState } from "./lib/github";
import { scopeError } from "./lib/pathScope";
import { githubConfig } from "./appConfig";
import type { IScan } from "./gitNode";

type TResult = { ok: true; url?: string } | { ok: false; reason: string };
const NOT_CONFIGURED = "The GitHub App isn't set up on this deployment yet · create it from Connect a site → Repo";

export const status = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => ({
		configured: (await githubConfig(ctx)) !== null,
		installations: (await ctx.db.query("gitInstallations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(10)).map((i) => ({ installationId: i.installationId, account: i.account ?? null })),
	}),
});

export const beginInstall = siteMutation({
	permission: "repo.connect",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		const cfg = await githubConfig(ctx);
		if (!cfg) return { ok: false, reason: NOT_CONFIGURED };
		const state = await signState(cfg.webhookSecret, { siteId, userId: ctx.access.user._id, exp: Date.now() + 15 * 60_000 });
		return { ok: true, url: `https://github.com/apps/${cfg.slug}/installations/new?state=${encodeURIComponent(state)}` };
	},
});

/** One-click App creation (GitHub App Manifest flow): returns the Convex page that posts the manifest to GitHub. */
export const beginAppManifest = siteMutation({
	permission: "repo.connect",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		if (await githubConfig(ctx)) return { ok: false, reason: "The GitHub App is already set up on this deployment" };
		const key = process.env.CMS_SECRETS_KEY_V1;
		if (!key) return { ok: false, reason: "The deployment's secrets key isn't set" };
		const state = await signState(key, { siteId, userId: ctx.access.user._id, exp: Date.now() + 30 * 60_000 });
		return { ok: true, url: `${process.env.CONVEX_SITE_URL}/github/manifest/start?state=${encodeURIComponent(state)}` };
	},
});

async function ownInstallation(ctx: { runQuery: (q: typeof internal.gitConnect.installationFor, a: { siteId: Id<"sites">; installationId: string }) => Promise<boolean> }, siteId: Id<"sites">, installationId: string) {
	return ctx.runQuery(internal.gitConnect.installationFor, { siteId, installationId });
}

export const installationFor = internalQuery({
	args: { siteId: v.id("sites"), installationId: v.string() },
	handler: async (ctx, { siteId, installationId }) => (await ctx.db.query("gitInstallations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(20)).some((i) => i.installationId === installationId),
});

export const installRepos = siteAction({
	permission: "repo.connect",
	args: { installationId: v.string() },
	handler: async (ctx, { siteId, installationId }): Promise<{ ok: true; account: string; repos: { repo: string; defaultBranch: string; private: boolean }[] } | { ok: false; reason: string }> => {
		if (!(await ctx.runQuery(internal.appConfig.githubConfigured, {}))) return { ok: false, reason: NOT_CONFIGURED };
		if (!(await ownInstallation(ctx, siteId, installationId))) return { ok: false, reason: "That installation wasn't completed for this site · install the app again" };
		try {
			const r = await ctx.runAction(internal.gitNode.installRepos, { installationId });
			await ctx.runMutation(internal.gitConnect.setAccount, { siteId, installationId, account: r.account });
			return { ok: true, ...r };
		} catch (e) {
			return { ok: false, reason: (e as Error).message };
		}
	},
});

export const setAccount = internalMutation({
	args: { siteId: v.id("sites"), installationId: v.string(), account: v.string() },
	handler: async (ctx, { siteId, installationId, account }) => {
		const row = (await ctx.db.query("gitInstallations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(20)).find((i) => i.installationId === installationId);
		if (row && row.account !== account) await ctx.db.patch(row._id, { account });
	},
});

export const scanRepo = siteAction({
	permission: "repo.connect",
	args: { installationId: v.string(), repo: v.string() },
	handler: async (ctx, { siteId, installationId, repo }): Promise<({ ok: true } & IScan) | { ok: false; reason: string }> => {
		if (!(await ctx.runQuery(internal.appConfig.githubConfigured, {}))) return { ok: false as const, reason: NOT_CONFIGURED };
		if (!(await ownInstallation(ctx, siteId, installationId))) return { ok: false as const, reason: "That installation wasn't completed for this site" };
		try {
			return { ok: true as const, ...(await ctx.runAction(internal.gitNode.scanRepo, { installationId, repo })) };
		} catch (e) {
			return { ok: false as const, reason: (e as Error).message };
		}
	},
});

const vPaths = { baseBranch: v.string(), contentDir: v.string(), assetDir: v.string(), branchPattern: v.string(), indexFiles: v.optional(v.array(v.string())) };

export const connectRepo = siteAction({
	permission: "repo.connect",
	args: { installationId: v.string(), repo: v.string(), ...vPaths },
	handler: async (ctx, a): Promise<TResult> => {
		if (!(await ctx.runQuery(internal.appConfig.githubConfigured, {}))) return { ok: false, reason: NOT_CONFIGURED };
		for (const d of [a.contentDir, a.assetDir]) {
			const why = scopeError(d);
			if (why) return { ok: false, reason: why };
		}
		if (!a.branchPattern.includes("{slug}")) return { ok: false, reason: "Include {slug} so each post gets its own branch" };
		if (a.branchPattern.replace("{slug}", "x") === a.baseBranch) return { ok: false, reason: "The branch pattern can't resolve to the base branch" };
		if (!(await ownInstallation(ctx, a.siteId, a.installationId))) return { ok: false, reason: "That installation wasn't completed for this site" };
		let visible: { repos: { repo: string }[]; account: string };
		try {
			visible = await ctx.runAction(internal.gitNode.installRepos, { installationId: a.installationId });
		} catch (e) {
			return { ok: false, reason: (e as Error).message };
		}
		if (!visible.repos.some((r) => r.repo === a.repo)) return { ok: false, reason: `The installation can't see ${a.repo} · add it to the app on GitHub` };
		await ctx.runMutation(internal.gitConnect.writeConnection, { siteId: a.siteId, userId: ctx.access.userId, installationId: a.installationId, installedAs: visible.account, repo: a.repo, baseBranch: a.baseBranch, contentDir: a.contentDir, assetDir: a.assetDir, branchPattern: a.branchPattern, ...(a.indexFiles ? { indexFiles: a.indexFiles } : {}) });
		return { ok: true };
	},
});

export const writeConnection = internalMutation({
	args: { siteId: v.id("sites"), userId: v.id("users"), installationId: v.string(), installedAs: v.string(), repo: v.string(), ...vPaths },
	handler: async (ctx, a) => {
		const site = (await ctx.db.get(a.siteId))!;
		const user = (await ctx.db.get(a.userId))!;
		for (const c of await ctx.db.query("repoConnections").withIndex("by_site", (q) => q.eq("siteId", a.siteId)).take(10)) if (c.status === "active") await ctx.db.patch(c._id, { status: "removed" });
		await ctx.db.insert("repoConnections", { workspaceId: site.workspaceId, siteId: a.siteId, host: "github", repo: a.repo, baseBranch: a.baseBranch, contentDir: a.contentDir, assetDir: a.assetDir, branchPattern: a.branchPattern, installedAs: a.installedAs, installationId: a.installationId, ...(a.indexFiles?.length ? { indexFiles: a.indexFiles } : {}), status: "active", live: true, connectedBy: a.userId, connectedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId: a.siteId, actor: user, action: "connected repo", target: a.repo, detail: `Writes only to ${a.contentDir} and ${a.assetDir} · never pushes to ${a.baseBranch}` });
	},
});

/**
 * Detaches the site's repo: the connection stops being active, so no post on this site can open a PR there. Open
 * PRs on GitHub are left alone (close them there). The GitHub App installation itself stays installed.
 */
export const disconnect = siteMutation({
	permission: "repo.connect",
	args: {},
	handler: async (ctx, { siteId }): Promise<{ ok: true; repo: string | null }> => {
		const site = ctx.access.site;
		let repo: string | null = null;
		for (const c of await ctx.db.query("repoConnections").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(10)) {
			if (c.status !== "active") continue;
			await ctx.db.patch(c._id, { status: "removed" });
			repo = c.repo;
		}
		if (repo) await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: ctx.access.user, action: "disconnected repo", target: repo, detail: "Posts on this site can't open pull requests until a repo is connected again" });
		return { ok: true, repo };
	},
});
