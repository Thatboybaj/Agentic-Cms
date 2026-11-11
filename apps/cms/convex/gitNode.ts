"use node";
// GitHub App client (handoff 06): the CMS agent's hands in a site repo. App JWT (RS256) → a short-lived installation
// token scoped to the one repo, minted per call and never stored. Every write goes through assertWritable. One branch
// and one PR per post; the branch is rebuilt on the current base each ship (so an update is also a rebase) and is the
// only ref ever force-moved. Never pushes to the base branch. Configure with GITHUB_APP_ID, GITHUB_APP_SLUG,
// GITHUB_APP_PRIVATE_KEY and GITHUB_WEBHOOK_SECRET on the Convex deployment.
import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, internalAction } from "./_generated/server";
import { rollUpCi } from "./lib/github";
import { assertWritable, normDir } from "./lib/pathScope";

const API = "https://api.github.com";

export class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly retryAfterMs?: number,
	) {
		super(message);
		this.name = "GitHubError";
	}
}

type TCfg = { appId: string; privateKey: string };

async function cfgOf(ctx: { runQuery: ActionCtx["runQuery"] }): Promise<TCfg> {
	const c = await ctx.runQuery(internal.appConfig.github, {});
	if (!c) throw new GitHubError(0, "The GitHub App isn't set up on this deployment yet");
	return c;
}

function appJwt(cfg: TCfg): string {
	const appId = cfg.appId;
	const pem = cfg.privateKey;
	const now = Math.floor(Date.now() / 1000);
	const b64u = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
	const unsigned = `${b64u({ alg: "RS256", typ: "JWT" })}.${b64u({ iat: now - 60, exp: now + 540, iss: appId })}`;
	const sig = createSign("RSA-SHA256").update(unsigned).sign(pem).toString("base64url");
	return `${unsigned}.${sig}`;
}

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "agentic-cms", ...(body ? { "Content-Type": "application/json" } : {}) },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
	if (res.status === 204) return undefined as T;
	const text = await res.text();
	if (!res.ok) {
		const ra = Number(res.headers.get("retry-after") ?? "0") * 1000 || (res.headers.get("x-ratelimit-remaining") === "0" ? Math.max(1000, Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000 - Date.now()) : 0);
		let msg = text.slice(0, 300);
		try {
			msg = (JSON.parse(text) as { message?: string }).message ?? msg;
		} catch {
			/* not json */
		}
		throw new GitHubError(res.status, `GitHub ${method} ${path.split("?")[0]} → ${res.status}: ${msg}`, ra || undefined);
	}
	return (text ? JSON.parse(text) : undefined) as T;
}

/** A token for one installation, optionally narrowed to one repository (least privilege per call). */
async function installationToken(cfg: TCfg, installationId: string, repoName?: string): Promise<string> {
	const r = await gh<{ token: string }>(appJwt(cfg), "POST", `/app/installations/${installationId}/access_tokens`, repoName ? { repositories: [repoName] } : undefined);
	return r.token;
}

const split = (full: string) => {
	const [owner, name] = full.split("/");
	if (!owner || !name) throw new GitHubError(0, `Not an owner/repo name: ${full}`);
	return { owner, name };
};

// ─── Install + connect ───────────────────────────────────────────────────────

export const installRepos = internalAction({
	args: { installationId: v.string() },
	handler: async (ctx, { installationId }): Promise<{ account: string; repos: { repo: string; defaultBranch: string; private: boolean }[] }> => {
		const cfg = await cfgOf(ctx);
		const token = await installationToken(cfg, installationId);
		const r = await gh<{ repositories: { full_name: string; default_branch: string; private: boolean }[] }>(token, "GET", "/installation/repositories?per_page=100");
		const inst = await gh<{ account: { login: string } }>(appJwt(cfg), "GET", `/app/installations/${installationId}`);
		return { account: inst.account.login, repos: r.repositories.map((x) => ({ repo: x.full_name, defaultBranch: x.default_branch, private: x.private })) };
	},
});

/** Reads the repo layout to suggest contentDir / assetDir (the most common Markdown dir; an images dir under public/static). */
export const scanRepo = internalAction({
	args: { installationId: v.string(), repo: v.string() },
	handler: async (ctx, { installationId, repo }): Promise<IScan> => {
		const { owner, name } = split(repo);
		const token = await installationToken(await cfgOf(ctx), installationId, name);
		const meta = await gh<{ default_branch: string }>(token, "GET", `/repos/${owner}/${name}`);
		const tree = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(token, "GET", `/repos/${owner}/${name}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`);
		const count = new Map<string, number>();
		for (const t of tree.tree) {
			if (t.type !== "blob" || !/\.(mdx?|html)$/i.test(t.path) || /(^|\/)(node_modules|\.github|README)/i.test(t.path)) continue;
			const dir = t.path.includes("/") ? t.path.slice(0, t.path.lastIndexOf("/")) : "";
			if (dir) count.set(dir, (count.get(dir) ?? 0) + 1);
		}
		const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
		const imgDirs = tree.tree.filter((t) => t.type === "tree" && /^(public|static|src\/assets|assets)\/(images|img)(\/blog)?$/i.test(t.path)).map((t) => t.path);
		const indexFiles = tree.tree.filter((t) => t.type === "blob" && /^(public\/)?sitemap\.xml$/i.test(t.path)).map((t) => t.path);
		return { defaultBranch: meta.default_branch, contentDir: top?.[0] ?? "content/blog", contentFiles: top?.[1] ?? 0, assetDir: imgDirs.find((d) => /blog$/i.test(d)) ?? imgDirs[0] ?? "public/images/blog", indexFiles, truncated: tree.truncated };
	},
});

export interface IScan {
	defaultBranch: string;
	contentDir: string;
	contentFiles: number;
	assetDir: string;
	indexFiles: string[];
	truncated: boolean;
}

// ─── Open / update the PR ────────────────────────────────────────────────────

const vFile = v.object({ path: v.string(), content: v.optional(v.string()), storageId: v.optional(v.id("_storage")) });

export const openPr = internalAction({
	args: {
		installationId: v.string(),
		repo: v.string(),
		base: v.string(),
		branch: v.string(),
		scope: v.object({ contentDir: v.string(), assetDir: v.string(), indexFiles: v.optional(v.array(v.string())) }),
		files: v.array(vFile),
		message: v.string(),
		title: v.string(),
		body: v.string(),
	},
	returns: v.object({ number: v.number(), externalId: v.string(), headSha: v.string(), url: v.string() }),
	handler: async (ctx, a): Promise<{ number: number; externalId: string; headSha: string; url: string }> => {
		if (normDir(a.branch) === normDir(a.base) || !a.branch.trim()) throw new GitHubError(0, "Refusing to write to the base branch");
		const { owner, name } = split(a.repo);
		const token = await installationToken(await cfgOf(ctx), a.installationId, name);
		const repoPath = `/repos/${owner}/${name}`;
		const baseRef = await gh<{ object: { sha: string } }>(token, "GET", `${repoPath}/git/ref/heads/${encodeURIComponent(a.base)}`);
		const baseCommit = await gh<{ tree: { sha: string } }>(token, "GET", `${repoPath}/git/commits/${baseRef.object.sha}`);
		const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
		for (const f of a.files) {
			const path = assertWritable(f.path, a.scope); // every byte checked against the allowlist
			let content: string;
			if (f.content !== undefined) content = Buffer.from(f.content, "utf8").toString("base64");
			else if (f.storageId) {
				const blob = await ctx.storage.get(f.storageId);
				if (!blob) throw new GitHubError(0, `The file for ${path} is missing from storage`);
				content = Buffer.from(await blob.arrayBuffer()).toString("base64");
			} else throw new GitHubError(0, `No content for ${path}`);
			const b = await gh<{ sha: string }>(token, "POST", `${repoPath}/git/blobs`, { content, encoding: "base64" });
			tree.push({ path, mode: "100644", type: "blob", sha: b.sha });
		}
		const t = await gh<{ sha: string }>(token, "POST", `${repoPath}/git/trees`, { base_tree: baseCommit.tree.sha, tree });
		const commit = await gh<{ sha: string }>(token, "POST", `${repoPath}/git/commits`, { message: a.message, tree: t.sha, parents: [baseRef.object.sha] });
		// The post branch only: create it, or move it to the new commit (force: it is ours, rebuilt on the base).
		try {
			await gh(token, "PATCH", `${repoPath}/git/refs/heads/${a.branch.split("/").map(encodeURIComponent).join("/")}`, { sha: commit.sha, force: true });
		} catch (e) {
			if (!(e instanceof GitHubError) || (e.status !== 422 && e.status !== 404)) throw e;
			await gh(token, "POST", `${repoPath}/git/refs`, { ref: `refs/heads/${a.branch}`, sha: commit.sha });
		}
		const open = await gh<{ number: number; node_id: string; html_url: string }[]>(token, "GET", `${repoPath}/pulls?state=open&head=${encodeURIComponent(`${owner}:${a.branch}`)}`);
		const pr = open[0] ? await gh<{ number: number; node_id: string; html_url: string }>(token, "PATCH", `${repoPath}/pulls/${open[0].number}`, { title: a.title, body: a.body }) : await gh<{ number: number; node_id: string; html_url: string }>(token, "POST", `${repoPath}/pulls`, { title: a.title, head: a.branch, base: a.base, body: a.body, maintainer_can_modify: false });
		return { number: pr.number, externalId: pr.node_id, headSha: commit.sha, url: pr.html_url };
	},
});

// ─── CI + merge ──────────────────────────────────────────────────────────────

/** Reads every check run + status on the MR's head and reports the roll-up (webhooks only tell us something changed). */
export const refreshCi = internalAction({
	args: { mrId: v.id("mergeRequests") },
	handler: async (ctx, { mrId }) => {
		const m = await ctx.runQuery(internal.gitHooks.mrForSync, { mrId });
		if (!m || !m.headSha) return;
		const { owner, name } = split(m.repo);
		const token = await installationToken(await cfgOf(ctx), m.installationId, name);
		const runs = await gh<{ check_runs: { status: string; conclusion: string | null; name: string }[] }>(token, "GET", `/repos/${owner}/${name}/commits/${m.headSha}/check-runs?per_page=100`);
		const status = await gh<{ statuses: { state: string; context: string }[] }>(token, "GET", `/repos/${owner}/${name}/commits/${m.headSha}/status`);
		const r = rollUpCi(runs.check_runs, status.statuses);
		await ctx.runMutation(internal.gitHooks.ciResult, { mrId, headSha: m.headSha, ci: r.ci, ...(r.detail ? { detail: r.detail } : {}) });
	},
});

/** Merges at exactly the head SHA CI validated (GitHub refuses if the head moved). Merge method = what the repo allows. */
export const mergePr = internalAction({
	args: { mrId: v.id("mergeRequests"), by: v.string() },
	handler: async (ctx, { mrId, by }) => {
		const m = await ctx.runQuery(internal.gitHooks.mrForSync, { mrId });
		if (!m || !m.headSha) return;
		const { owner, name } = split(m.repo);
		const token = await installationToken(await cfgOf(ctx), m.installationId, name);
		const repo = await gh<{ allow_squash_merge?: boolean; allow_merge_commit?: boolean; allow_rebase_merge?: boolean }>(token, "GET", `/repos/${owner}/${name}`);
		const method = repo.allow_squash_merge ? "squash" : repo.allow_merge_commit ? "merge" : "rebase";
		try {
			const r = await gh<{ merged: boolean; sha: string }>(token, "PUT", `/repos/${owner}/${name}/pulls/${m.number}/merge`, { sha: m.headSha, merge_method: method });
			if (r.merged) await ctx.runMutation(internal.git.onMerged, { mrId, sha: r.sha, by });
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			await ctx.runMutation(internal.gitHooks.mergeRefused, { mrId, detail: msg.slice(0, 300) });
		}
	},
});


/** Rebase / re-render (handoff 06 step 7): render the post on the current manifest and rebuild its branch on the current base. */
export const rebase = internalAction({
	args: { mrId: v.id("mergeRequests") },
	handler: async (ctx, { mrId }): Promise<void> => {
		const m = await ctx.runQuery(internal.gitHooks.mrRebaseInput, { mrId });
		if (!m) return;
		try {
			const r = await ctx.runAction(internal.render.publish, { siteId: m.siteId, postId: m.postId });
			if (!r || r.held.length) throw new GitHubError(0, r ? `Template can't render: ${r.held.join(", ")}` : "No stored template to render with");
			const sc = await ctx.runQuery(internal.gitHooks.shipContext, { siteId: m.siteId, postId: m.postId, slotIds: r.assets.map((x) => x.slotId), autopost: m.autopost, overrides: m.overrides });
			if (!sc) throw new GitHubError(0, "The repo connection is gone");
			const missing = sc.assets.filter((x) => !x.storageId);
			if (missing.length) throw new GitHubError(0, `Image files aren't produced yet for: ${missing.map((x) => x.name).join(", ")}`);
			const files = [{ path: r.post.path, content: r.post.content }, ...r.assets.map((x) => ({ path: x.path, storageId: sc.assets.find((s) => s.slotId === x.slotId)!.storageId! }))];
			const pr = await ctx.runAction(internal.gitNode.openPr, { installationId: sc.installationId, repo: sc.repo, base: sc.base, branch: sc.branch, scope: sc.scope, files, message: `${sc.message} (rebased)`, title: sc.title, body: sc.body });
			await ctx.runMutation(internal.gitHooks.rebased, { mrId, headSha: pr.headSha, manifestVersion: r.manifestVersion });
		} catch (e) {
			await ctx.runMutation(internal.gitHooks.mergeRefused, { mrId, detail: `Rebase failed: ${(e as Error).message}`.slice(0, 300) });
		}
	},
});
