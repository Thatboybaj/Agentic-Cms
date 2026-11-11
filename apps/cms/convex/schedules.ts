// Schedules and runs (handoff 02 step 9; api-map §8, §12). `tick` (cron, every 5 min) starts every due run once:
// the run's idempotency key is the schedule slot, so a retried tick finds the row it already made. Paused and
// onboarding sites skip (their next slot still advances). "Per publish slot" picks the oldest due briefed post and
// generates it; "on slot creation" is event-driven and never ticks. runNow starts the same workflow by hand.
import { vResultValidator } from "@convex-dev/workpool";
import { vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { RUN_META, checkCap, estimateRun } from "../src/lib/logic";
import type { TRunKind } from "../src/lib/types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { capSite, fmtUsd } from "./lib/budget";
import { nextAtFor } from "./lib/defaults";
import { siteMutation, siteQuery } from "./lib/functions";
import { createRun, finishRun, refuseRun } from "./lib/runs";
import { isoWeek, startGeneration } from "./posts";
import { workflow } from "./workflows/manager";

type TResult = { ok: true; id?: string } | { ok: false; reason: string };
const vRunKind = v.union(...(Object.keys(RUN_META) as TRunKind[]).map((k) => v.literal(k)));
const DAY = 86_400_000;
/** Kinds that run through scheduledRun (post and image generation have their own workflows). */
const SCHEDULED_KINDS = new Set<TRunKind>(["keyword-swarm", "technical-monitor", "qa-sweep", "content-refresh", "link-prospecting", "biweekly-report", "kas-recalc"]);

/** Cap check → run row → scheduledRun workflow. Returns the run id, or the refusal. */
async function startScheduledRun(ctx: MutationCtx, site: Doc<"sites">, kind: TRunKind, opts: { trigger: "scheduled" | "manual"; idempotencyKey: string; user?: Doc<"users"> }): Promise<TResult> {
	const est = estimateRun(kind, capSite(site));
	const cap = checkCap(capSite(site), kind, est);
	const base = { site, kind, trigger: opts.trigger, estimate: est, idempotencyKey: opts.idempotencyKey, output: "Queued", ...(opts.user ? { triggeredBy: opts.user._id } : {}) };
	if (cap.status === "refused") {
		await refuseRun(ctx, base, cap, opts.user ?? { system: RUN_META[kind].agent });
		return { ok: false, reason: cap.message };
	}
	const existing = await ctx.db.query("runs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", opts.idempotencyKey)).unique();
	if (existing) return { ok: true, id: existing._id }; // this slot already started
	const runId = await createRun(ctx, base);
	const workflowId = await workflow.start(ctx, internal.workflows.scheduledRun.scheduledRun, { siteId: site._id, runId, kind }, { startAsync: true, onComplete: internal.schedules.runDone, context: { runId } });
	await ctx.db.patch(runId, { workflowId });
	if (opts.user) await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: opts.user, action: "triggered run", target: RUN_META[kind].label, detail: `${est.tier} model · est. ${fmtUsd(est.usd)}` });
	return { ok: true, id: runId };
}

// ─── Public ───────────────────────────────────────────────────────────────────

export const list = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", siteId)).take(20),
});

export const runs = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId)).order("desc").take(100),
});

export const toggle = siteMutation({
	permission: "schedule.toggle",
	args: { kind: vRunKind },
	handler: async (ctx, { siteId, kind }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const s = (await ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", siteId).eq("kind", kind)).take(1))[0];
		if (!s) return { ok: false, reason: "Schedule not found" };
		const enabled = !s.enabled;
		await ctx.db.patch(s._id, { enabled, ...(enabled ? { nextAt: nextAtFor(s.rule, Date.now()) } : {}) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: enabled ? "resumed schedule" : "paused schedule", target: s.label });
		return { ok: true };
	},
});

export const runNow = siteMutation({
	permission: "run.trigger",
	args: { kind: vRunKind },
	handler: async (ctx, { siteId, kind }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.status === "paused") return { ok: false, reason: "This site is paused · resume it to run agents" };
		if (kind === "post-generation") {
			const briefed = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "briefed")).take(200)).sort((a, b) => a.week - b.week)[0];
			if (!briefed) return { ok: false, reason: "No briefed posts to generate. Promote an idea first" };
			return startGeneration(ctx, site, briefed, { user, trigger: "manual" });
		}
		if (kind === "image-generation") return { ok: false, reason: "Images regenerate from the post's image sheet" };
		return startScheduledRun(ctx, site, kind, { trigger: "manual", user, idempotencyKey: `run:${siteId}:${kind}:manual:${Date.now()}` });
	},
});

// ─── Cron ─────────────────────────────────────────────────────────────────────

export const tick = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const due = await ctx.db.query("schedules").withIndex("by_enabled_next", (q) => q.eq("enabled", true).lte("nextAt", now)).take(100);
		let started = 0;
		for (const s of due) {
			const slot = s.nextAt;
			const next = s.rule === "per-publish-slot" ? now + DAY : nextAtFor(s.rule, now);
			if (s.rule === "on-slot-creation") {
				await ctx.db.patch(s._id, { nextAt: now + 365 * DAY });
				continue;
			}
			const site = await ctx.db.get(s.siteId);
			if (!site || site.status !== "active") {
				await ctx.db.patch(s._id, { nextAt: next });
				continue;
			}
			let runId: Id<"runs"> | undefined;
			if (s.kind === "post-generation") {
				const week = isoWeek(now);
				const post = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", site._id).eq("state", "briefed")).take(200)).filter((p) => p.week <= week && !p.workflowId).sort((a, b) => a.week - b.week)[0];
				if (post) {
					const r = await startGeneration(ctx, site, post, { trigger: "workflow" });
					if (r.ok && r.id) runId = r.id as Id<"runs">;
				}
			} else if (SCHEDULED_KINDS.has(s.kind)) {
				const r = await startScheduledRun(ctx, site, s.kind, { trigger: "scheduled", idempotencyKey: `run:${site._id}:${s.kind}:slot:${slot}` });
				if (r.ok && r.id) runId = r.id as Id<"runs">;
			}
			await ctx.db.patch(s._id, { nextAt: next, lastRunAt: now, ...(runId ? { lastRunId: runId } : {}) });
			if (runId) started++;
		}
		return { due: due.length, started };
	},
});

// ─── scheduledRun steps ──────────────────────────────────────────────────────

export const beginScheduled = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	handler: async (ctx, { siteId, runId }) => {
		const site = await ctx.db.get(siteId);
		const run = await ctx.db.get(runId);
		if (!site || !run || run.siteId !== siteId) return { stop: true as const };
		if (site.status === "paused") {
			await finishRun(ctx, runId, { status: "cancelled", output: "Site paused · run skipped" });
			return { stop: true as const };
		}
		return { stop: false as const, input: { siteId, kind: run.kind, siteName: site.name, searchConsole: site.searchConsole, rankSource: site.rankSource, industry: site.industry } };
	},
});

const vIdea = v.object({ term: v.string(), intent: v.union(v.literal("informational"), v.literal("commercial"), v.literal("transactional"), v.literal("navigational")), difficulty: v.number(), evidence: v.string() });

/** Persists the run's artifact. keyword-swarm: new ideas (deduped against every term on the site) land in Idea. */
export const finishScheduled = internalMutation({
	args: { siteId: v.id("sites"), runId: v.id("runs"), status: v.union(v.literal("succeeded"), v.literal("failed")), output: v.string(), ideas: v.array(vIdea) },
	handler: async (ctx, { siteId, runId, status, output, ideas }) => {
		const site = await ctx.db.get(siteId);
		const run = await ctx.db.get(runId);
		if (!site || !run || run.siteId !== siteId) return;
		let summary = output;
		if (run.kind === "keyword-swarm") {
			const pillars = (await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100)).sort((a, b) => a.kasShare - b.kasShare);
			let fresh = 0;
			if (pillars.length) {
				const now = Date.now();
				for (const idea of ideas) {
					const term = idea.term.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?:]/g, "");
					const dupe = await ctx.db.query("keywords").withIndex("by_site_term", (q) => q.eq("siteId", siteId).eq("termNormalized", term)).unique();
					if (dupe) continue;
					const pillar = pillars[fresh % pillars.length]!;
					const keywordId = await ctx.db.insert("keywords", { workspaceId: site.workspaceId, siteId, term, termNormalized: term, pillarId: pillar._id, intent: idea.intent, difficulty: idea.difficulty, difficultyEvidence: idea.evidence, impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
					await ctx.db.insert("posts", {
						workspaceId: site.workspaceId, siteId, slug: term.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80), title: term, seoTitle: term, keywordId, pillarId: pillar._id,
						intent: idea.intent, contentType: "guide", source: "keyword-swarm", state: "idea", stateChangedAt: now, owner: "human", week: isoWeek(now) + 1, strongModel: false,
						words: 0, wordTarget: 1500, blocks: [], currentVersion: 0, ideaApproval: { status: "pending" }, ideaStatus: "pending", createdAt: now, updatedAt: now,
					});
					fresh++;
				}
			}
			summary = pillars.length ? `${ideas.length} ideas · ${ideas.length - fresh} deduplicated against live and planned · ${fresh} new in Idea` : "No pillars in the plan yet · ideas not added";
		}
		await finishRun(ctx, runId, { status, output: summary });
	},
});

export const runDone = internalMutation({
	args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ runId: v.id("runs") }) },
	handler: async (ctx, { result, context }) => {
		if (result.kind === "success") return;
		await finishRun(ctx, context.runId, { status: result.kind === "canceled" ? "cancelled" : "failed", output: result.kind === "canceled" ? "Cancelled" : "Run failed", ...(result.kind === "failed" ? { error: result.error } : {}) });
	},
});
