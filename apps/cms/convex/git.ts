// Merge requests: CI and merge events + the developer's merge (handoff 02 step 7; api-map §6). onCi / onMerged are the
// seams 06's GitHub webhook calls (check_suite / pull_request closed). Until 06, requestMerge is a stub that reports
// the merge back as if GitHub had done it. Auto-merge happens only for autopost MRs, on green CI, for the head the gate
// approved (Forbidden moves: never merge without autopost, never on anything but green CI for the current head).
import { v } from "convex/values";
import { AUTOPOST_ACTOR, estimateRun } from "../src/lib/logic";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { activeManifest } from "./lib/gateInputs";
import { capSite } from "./lib/budget";
import { siteMutation, siteQuery } from "./lib/functions";
import { notify, siteAudience, siteAudienceWith } from "./lib/notify";
import { createRun } from "./lib/runs";
import { transitionPost } from "./lib/transition";

type TResult = { ok: true } | { ok: false; reason: string };
const mrRef = (mr: Pick<Doc<"mergeRequests">, "host" | "number">) => `${mr.host === "gitlab" ? "!" : "#"}${mr.number}`;
const HOUR = 3_600_000;

/** True when the MR's head is exactly the version the gate approved and nothing has been edited since. */
async function headIsApproved(ctx: MutationCtx, mr: Doc<"mergeRequests">) {
	if (!mr.postId) return false;
	const post = await ctx.db.get(mr.postId);
	return !!post && post.state === "mr-open" && post.approvedVersion === mr.postVersion && post.currentVersion === mr.postVersion;
}

export const onCi = internalMutation({
	args: { mrId: v.id("mergeRequests"), ci: v.union(v.literal("passing"), v.literal("failing")), detail: v.optional(v.string()), headSha: v.optional(v.string()) },
	handler: async (ctx, { mrId, ci, detail, headSha }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.status !== "open") return;
		if (headSha && mr.headSha && headSha !== mr.headSha) return; // a result for an older head
		const site = (await ctx.db.get(mr.siteId))!;
		await ctx.db.patch(mrId, { ci, ...(ci === "passing" ? { ciDetail: undefined } : { ciDetail: detail ?? "CI failed" }) });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudienceWith(ctx, site, "mr.merge"), tone: ci === "passing" ? "pass" : "block", title: `CI ${ci} on ${mrRef(mr)}`, body: mr.title ?? mr.branch, href: "/merge-requests", dedupeKey: `ci:${mrId}:${mr.headSha ?? ""}:${ci}` });
		if (ci === "failing") {
			if (mr.autopost) await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, ...(mr.postId ? { postId: mr.postId } : {}), actor: { system: AUTOPOST_ACTOR }, action: "stopped at red CI", target: `${mrRef(mr)} ${mr.branch}`, detail: "The MR stays open until the build is fixed" });
			return;
		}
		if (!mr.autopost) return; // human-approved MRs always wait for a developer
		if (!site.publishing.autopost || !site.publishing.autoMergeOnGreenCi) {
			await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudienceWith(ctx, site, "mr.merge"), tone: "ink", title: `${mrRef(mr)} is green · waiting for a developer`, body: `Auto-merge is off. ${mr.title ?? mr.branch}`, href: "/merge-requests", dedupeKey: `green-wait:${mrId}` });
			return;
		}
		if (!(await headIsApproved(ctx, mr))) return;
		await ctx.scheduler.runAfter(0, internal.git.requestMerge, { mrId, by: AUTOPOST_ACTOR });
	},
});

/** Asks GitHub to merge (live connections, gitNode.mergePr at the CI-validated head); the stub reports the merge itself. */
export const requestMerge = internalAction({
	args: { mrId: v.id("mergeRequests"), by: v.string() },
	handler: async (ctx, { mrId, by }) => {
		const live = await ctx.runQuery(internal.gitHooks.mrForSync, { mrId });
		if (live && (await ctx.runQuery(internal.appConfig.githubConfigured, {}))) {
			await ctx.runAction(internal.gitNode.mergePr, { mrId, by });
			return;
		}
		await ctx.runMutation(internal.git.onMerged, { mrId, sha: `stub-merge-${mrId.slice(-8)}`, by });
	},
});

/** afterMerge (api-map §10): mr-open → live, liveAt, merge sha, pillar count, KAS recalc queued for +24 h. */
export const onMerged = internalMutation({
	args: { mrId: v.id("mergeRequests"), sha: v.string(), by: v.string() },
	handler: async (ctx, { mrId, sha, by }) => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.status === "merged") return;
		const site = (await ctx.db.get(mr.siteId))!;
		const at = Date.now();
		await ctx.db.patch(mrId, { status: "merged", mergedAt: at, mergedBy: by, mergeCommitSha: sha });
		const post = mr.postId ? await ctx.db.get(mr.postId) : null;
		if (post && post.state === "mr-open") {
			const r = await transitionPost(ctx, post, "live", { extra: { liveAt: at, mergeCommitSha: sha } });
			if (r.ok) {
				const pillar = await ctx.db.get(post.pillarId);
				if (pillar) await ctx.db.patch(pillar._id, { livePosts: pillar.livePosts + 1 });
			}
		}
		// KAS recalc 24 h after merge (handoff 07 fills the run body); the queued row is the schedule's record.
		const est = estimateRun("kas-recalc", capSite(site));
		await createRun(ctx, { site, kind: "kas-recalc", trigger: "scheduled", estimate: est, idempotencyKey: `run:${site._id}:kas-recalc:merge:${mrId}`, ...(post ? { postId: post._id } : {}), output: "Scheduled · 24 h after merge", status: "queued" });
		const sched = (await ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", site._id).eq("kind", "kas-recalc")).take(1))[0];
		if (sched) await ctx.db.patch(sched._id, { nextAt: at + 24 * HOUR });
		const when = new Date(at + 24 * HOUR).toUTCString().slice(0, 16);
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, ...(post ? { postId: post._id } : {}), actor: { system: by }, action: "merged", target: `${mrRef(mr)} ${mr.branch}`, detail: `Post is Live · scoring run scheduled for ${when}${mr.autopost && by === AUTOPOST_ACTOR ? " · auto-merged on green CI" : ""}` });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), tone: "pass", title: `${mrRef(mr)} merged · ${post?.title ?? mr.branch} is Live`, body: `Attribution recalculates in 24 h. ${site.searchConsole === "connected" ? "URL submitted for indexing." : "Search Console not connected: indexing request skipped."}`, href: "/seo" });
	},
});

/** A developer merges an open, green MR (mergeMr). Same refusals as the prototype. */
export const mergeMr = siteMutation({
	permission: "mr.merge",
	args: { mrId: v.id("mergeRequests"), confirmNoCi: v.optional(v.boolean()) },
	handler: async (ctx, { siteId, mrId, confirmNoCi }): Promise<TResult> => {
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.siteId !== siteId) return { ok: false, reason: "Merge request not found" };
		if (mr.status === "conflict") return { ok: false, reason: "Conflict with the base branch. Rebase first" };
		if (mr.status !== "open") return { ok: false, reason: `This MR is ${mr.status}` };
		if (mr.ci === "failing") return { ok: false, reason: "CI is failing. Fix the build first" };
		if (mr.ci === "pending") return { ok: false, reason: "CI is still running" };
		if (mr.ci === "none" && !confirmNoCi) return { ok: false, reason: "This repo has no CI checks · confirm to merge without them" };
		await ctx.scheduler.runAfter(0, internal.git.requestMerge, { mrId, by: ctx.access.user.name });
		return { ok: true };
	},
});

/**
 * A developer rebases a conflicted or red MR and re-renders it with the current manifest (api-map §6). STUB (06):
 * the real branch rebase happens through the GitHub App; CI then reports back through onCi. No CI result is faked here.
 */
export const rebaseMr = siteMutation({
	permission: "mr.rebase",
	args: { mrId: v.id("mergeRequests") },
	handler: async (ctx, { siteId, mrId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const mr = await ctx.db.get(mrId);
		if (!mr || mr.siteId !== siteId) return { ok: false, reason: "Merge request not found" };
		if (mr.status !== "conflict" && mr.ci !== "failing") return { ok: false, reason: "Nothing to rebase: the MR applies cleanly" };
		const manifest = await activeManifest(ctx, siteId);
		await ctx.db.patch(mrId, { status: "open", ci: "pending", conflictDetail: undefined, ciDetail: undefined, ...(manifest ? { manifestVersion: manifest.version } : {}) });
		// Live: re-render on the current manifest and rebuild the post branch on the current base (gitNode.rebase).
		const conn = await ctx.db.get(mr.repoConnectionId);
		if (conn?.live && conn.status === "active") await ctx.scheduler.runAfter(0, internal.gitNode.rebase, { mrId });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, ...(mr.postId ? { postId: mr.postId } : {}), actor: user, action: "rebased and re-rendered", target: `${mrRef(mr)} ${mr.branch}`, detail: `onto ${mr.base} · manifest v${manifest?.version ?? "?"}` });
		return { ok: true };
	},
});

export const list = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", siteId)).order("desc").take(200),
});
