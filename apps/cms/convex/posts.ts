// Posts: ideas, approval, generation (api-map §3). Wording and refusals match src/lib/store.tsx so the UI copy holds.
// State changes go through lib/transition.ts only; generation runs as the postPipeline workflow.
import { v } from "convex/values";
import { AUTOPOST_ACTOR, checkCap, estimateRun, evaluateGate, waitingForSetup } from "../src/lib/logic";
import type { TPostState } from "../src/lib/types";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { loadPostInSite } from "./lib/access";
import { approveAndShip } from "./lib/approval";
import { gateInputs } from "./lib/gateInputs";
import { readinessOf } from "./lib/readiness";
import { audit } from "./lib/audit";
import { capSite, fmtUsd } from "./lib/budget";
import { siteMutation, siteQuery } from "./lib/functions";
import { notify, siteAudience, siteAudienceWith } from "./lib/notify";
import { createRun, refuseRun } from "./lib/runs";
import { transitionPost } from "./lib/transition";
import { NOT_ENTITLED, siteEntitled } from "./billing";
import { scheduleBackfill } from "./gsc";
import { workflow } from "./workflows/manager";
import { resolvePostAuthor } from "./authors";

type TResult = { ok: true; id?: string } | { ok: false; reason: string };
const fail = (reason: string): TResult => ({ ok: false, reason });

const WEEK_MS = 7 * 86_400_000;
/** ISO week number (1–53) of a date, in UTC. */
export function isoWeek(at: number): number {
	const d = new Date(at);
	const day = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - day + 3);
	const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	return 1 + Math.round((d.getTime() - firstThu.getTime()) / WEEK_MS - ((firstThu.getUTCDay() + 6) % 7 - 3) / 7);
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "post";

// ─── Reads ─────────────────────────────────────────────────────────────────────

/** Plan board: every live (non-rejected) post on the site, newest week first, bounded. */
export const board = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx) => {
		const { site } = ctx.access;
		const posts = await ctx.db
			.query("posts")
			.withIndex("by_site_week", (q) => q.eq("siteId", site._id))
			.order("desc")
			.take(500);
		return posts.filter((p) => p.ideaStatus !== "rejected");
	},
});

export const get = siteQuery({
	permission: "plan.view",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const post = await loadPostInSite(ctx, siteId, postId);
		const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50);
		const versions = await ctx.db.query("postVersions").withIndex("by_post_n", (q) => q.eq("postId", postId)).order("desc").take(20);
		const facts = await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", postId)).take(100);
		return { post, slots, versions, facts };
	},
});

// ─── Ideas ─────────────────────────────────────────────────────────────────────

export const addIdea = siteMutation({
	permission: "idea.create",
	args: { topic: v.string(), pillarId: v.optional(v.id("pillars")) },
	handler: async (ctx, { topic, pillarId }): Promise<TResult> => {
		const { site, user, workspaceId } = ctx.access;
		const title = normalize(topic);
		if (title.length < 3) return fail("Type a topic or paste a keyword");
		const existingKw = await ctx.db.query("keywords").withIndex("by_site_term", (q) => q.eq("siteId", site._id).eq("termNormalized", title.replace(/[?:]/g, ""))).unique();
		if (existingKw) {
			const dupe = (await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", site._id)).take(500)).find((p) => p.keywordId === existingKw._id && p.ideaStatus !== "rejected");
			if (dupe) return fail(`Already in the plan (${dupe.state.replace("-", " ")}): ${dupe.title}`);
		}
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", site._id)).take(100);
		if (!pillars.length) return fail("Add a pillar to the plan first");
		const pillar = (pillarId && pillars.find((p) => p._id === pillarId)) || [...pillars].sort((a, b) => a.kasShare - b.kasShare)[0]!;
		const contentType = (/ vs\.? /.test(title) ? "comparison" : /^how to /.test(title) ? "how-to" : /\b(cost|price|prices)\b/.test(title) ? "money-page" : /\?$/.test(title) ? "faq" : "guide") as Doc<"posts">["contentType"];
		const intent: Doc<"posts">["intent"] = /\b(cost|price|vs|best)\b/.test(title) ? "commercial" : /\b(near me|book|emergency)\b/.test(title) ? "transactional" : "informational";
		const term = title.replace(/[?:]/g, "");
		const keywordId =
			existingKw?._id ??
			(await ctx.db.insert("keywords", { workspaceId, siteId: site._id, term, termNormalized: term, pillarId: pillar._id, intent, difficulty: 0, difficultyEvidence: "KD pending · next keyword swarm", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false }));
		if (!existingKw) await scheduleBackfill(ctx, site._id); // its Search Console history, if the site has it
		const now = Date.now();
		const postId = await ctx.db.insert("posts", {
			workspaceId,
			siteId: site._id,
			slug: slugOf(title),
			title,
			seoTitle: title,
			keywordId,
			pillarId: pillar._id,
			intent: existingKw?.intent ?? intent,
			contentType,
			source: "manual",
			state: "idea",
			stateChangedAt: now,
			owner: "human",
			week: isoWeek(now) + 1,
			strongModel: contentType === "pillar" || contentType === "money-page",
			words: 0,
			wordTarget: contentType === "pillar" ? 3000 : 1500,
			blocks: [],
			currentVersion: 0,
			ideaApproval: { status: "pending" },
			ideaStatus: "pending",
			createdAt: now,
			updatedAt: now,
		});
		await audit(ctx, { workspaceId, siteId: site._id, postId, actor: user, action: "added idea", target: title, detail: `${pillar.name} · manual` });
		return { ok: true, id: postId };
	},
});

/** Starts postPipeline for a briefed/decaying post after a cap check. Refused → run row, audit, notify (+ ledger under autopost). */
export async function startGeneration(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, by: { user?: Doc<"users">; trigger: "manual" | "workflow" }): Promise<TResult> {
	if (post.workflowId) return fail("Already generating · wait for the current run to finish");
	if (!(await siteEntitled(ctx, site._id))) return fail(NOT_ENTITLED);
	// Publish-readiness gate (prd-site-discovery F23): nothing is drafted that can't ship. The post waits in Briefed.
	const ready = await readinessOf(ctx, site);
	if (!ready.ready) {
		if (post.hold?.missing.join() !== ready.missing.join()) await ctx.db.patch(post._id, { hold: { reason: "waiting-for-setup", missing: ready.missing, since: post.hold?.since ?? Date.now() } });
		return fail(waitingForSetup(ready.missing));
	}
	if (post.hold) await ctx.db.patch(post._id, { hold: undefined });
	const strong = post.strongModel || post.contentType === "pillar" || post.contentType === "money-page";
	const est = estimateRun("post-generation", capSite(site), { strongModel: strong });
	const cap = checkCap(capSite(site), "post-generation", est);
	const actor = by.user ?? { system: AUTOPOST_ACTOR };
	// Same key = same run (no double start). After a failed, cancelled or refused run, a retry gets its own key.
	const baseKey = `run:${site._id}:post-generation:${post._id}:${post.currentVersion}`;
	let idempotencyKey = baseKey;
	for (let n = 1; n < 20; n++) {
		const prev = await ctx.db.query("runs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
		if (!prev || (prev.status !== "failed" && prev.status !== "cancelled" && prev.status !== "refused-over-cap")) break;
		idempotencyKey = `${baseKey}:retry${n}`;
	}
	const base = { site, kind: "post-generation" as const, trigger: by.trigger, estimate: est, idempotencyKey, postId: post._id, output: "Reading brief and brand pack", ...(by.user ? { triggeredBy: by.user._id } : {}) };
	if (cap.status === "refused") {
		await refuseRun(ctx, base, cap, actor);
		if (!by.user) {
			const dedupeKey = `autopost-refused:${post._id}`;
			const open = await ctx.db.query("ledgerItems").withIndex("by_site_dedupe", (q) => q.eq("siteId", site._id).eq("dedupeKey", dedupeKey)).first();
			if (!open || open.done) await ctx.db.insert("ledgerItems", { siteId: site._id, title: `Autopost held: over the text cap · ${post.title}`, owner: "Agency admin", createdAt: Date.now(), downstream: "holds 1 post in Briefed", postId: post._id, kind: "autopost-refused", origin: "autopost", dedupeKey, done: false });
		}
		return fail(cap.message);
	}
	const runId = await createRun(ctx, base);
	// startAsync: the workflow begins in its own transaction right after this one commits.
	const workflowId = await workflow.start(ctx, internal.workflows.postPipeline.postPipeline, { siteId: site._id, postId: post._id, runId }, { startAsync: true, onComplete: internal.pipeline.persist.pipelineDone, context: { siteId: site._id, postId: post._id, runId } });
	await ctx.db.patch(post._id, { workflowId, updatedAt: Date.now() });
	await ctx.db.patch(runId, { workflowId });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor, action: "triggered run", target: "Post generation", detail: `${post.title} · ${est.tier} model · est. ${fmtUsd(est.usd)}` });
	if (cap.status === "warn") {
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), tone: "human", title: `${cap.budget[0]!.toUpperCase()}${cap.budget.slice(1)} budget at ${cap.pct}% of cap`, body: `${fmtUsd(cap.afterUsd)} of ${fmtUsd(cap.capUsd)} after this run. Runs over the cap are refused.`, href: "/settings", dedupeKey: `cap80:${site._id}:${site.spend.month}:${cap.budget}` });
	}
	return { ok: true, id: runId };
}

async function approveIdeaFor(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, user: Doc<"users">): Promise<TResult> {
	if (post.state !== "idea") return fail("Only ideas wait for approval");
	if (post.ideaStatus !== "pending") return fail("This idea is already approved");
	if (site.status === "paused") return fail("This site is paused · resume it to approve ideas");
	const r = await transitionPost(ctx, post, "briefed", { extra: { ideaApproval: { status: "approved", by: user.name, byUserId: user._id, at: Date.now() }, ideaStatus: "approved" } });
	if (!r.ok) return fail(r.reason);
	// Rubrics and authors (P1): the author is resolved and stored before drafting, so it's visible and editable.
	await resolvePostAuthor(ctx, r.post);
	const auto = site.publishing.autopost;
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: user, action: "approved idea", target: post.title, detail: auto ? "Autopost on · the agents take it from here" : `Briefed · the writer picks it up in W${post.week}` });
	// Under autopost the writer starts straight away (cap-checked; a refusal leaves it Briefed with a ledger item).
	if (auto) await startGeneration(ctx, site, r.post, { trigger: "workflow" });
	return { ok: true };
}

export const approveIdea = siteMutation({
	permission: "idea.approve",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => approveIdeaFor(ctx, ctx.access.site, await loadPostInSite(ctx, siteId, postId), ctx.access.user),
});

export const rejectIdea = siteMutation({
	permission: "idea.approve",
	args: { postId: v.id("posts"), note: v.string() },
	handler: async (ctx, { siteId, postId, note }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state !== "idea") return fail("Only ideas can be rejected. Later posts are sent back instead");
		const why = note.trim();
		if (why.length < 3) return fail("Add a short note: why not this idea?");
		await ctx.db.patch(postId, { ideaStatus: "rejected", ideaApproval: { status: "rejected", by: user.name, byUserId: user._id, at: Date.now(), note: why }, updatedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "rejected idea", target: post.title, detail: `"${why}"` });
		return { ok: true };
	},
});

/** A pending idea is approved on the way (same path as approveIdea); otherwise idea → briefed. */
export const promoteToBrief = siteMutation({
	permission: "post.promote",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state === "idea" && post.ideaStatus === "pending") return approveIdeaFor(ctx, site, post, user);
		if (post.ideaStatus === "rejected") return fail("This idea was rejected · add it again to reconsider");
		const r = await transitionPost(ctx, post, "briefed");
		if (!r.ok) return fail(r.reason);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "promoted to brief", target: post.title });
		return { ok: true };
	},
});

export const generateNow = siteMutation({
	permission: "post.generate",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.status === "paused") return fail("This site is paused · resume it to run agents");
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state === "idea") return fail("Approve the idea first · only an approved idea becomes a brief");
		const allowed: TPostState[] = ["briefed", "decaying"];
		// A first draft that failed before writing anything (Drafting, nothing running, no blocks) goes back to Briefed.
		const stuck = post.state === "drafting" && !post.workflowId && post.blocks.length === 0;
		if (!allowed.includes(post.state) && !stuck) return fail(`Generate now works on Briefed or Decaying posts, not ${post.state.replace("-", " ")}`);
		const ready = stuck ? await transitionPost(ctx, post, "briefed") : null;
		if (ready && !ready.ok) return fail(ready.reason);
		return startGeneration(ctx, site, ready?.ok ? ready.post : post, { user, trigger: "manual" });
	},
});

// ─── Review, approval, ship (handoff 02 step 8) ───────────────────────────────

/** Server-side gate for the editor and Approvals (api-map `gate.evaluate`): same evaluateGate() the UI runs. */
export const gate = siteQuery({
	permission: "plan.view",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const post = await loadPostInSite(ctx, siteId, postId);
		const inputs = await gateInputs(ctx, ctx.access.site, post);
		return evaluateGate(inputs.post, inputs.slots, inputs.manifest);
	},
});

export const sendToReview = siteMutation({
	permission: "post.sendToReview",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state === "drafting" && !post.blocks.length) return fail("The draft isn't ready yet");
		const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50);
		const unfilled = slots.filter((s) => s.status !== "selected").length;
		const r = await transitionPost(ctx, post, "in-review");
		if (!r.ok) return fail(r.reason);
		await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudienceWith(ctx, site, "post.approve"), except: user._id, tone: "human", title: "Approval requested", body: `${post.title} is ready for review.`, href: `/approvals?post=${postId}`, dedupeKey: `review:${postId}:${post.currentVersion}` });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "sent to review", target: post.title, ...(unfilled ? { detail: `${unfilled} slot(s) still unfilled · blocks approval` } : {}) });
		return { ok: true };
	},
});

/** Human approval: the gate is re-checked here with the person's soft-override reasons; then shipPost opens the MR. */
export const approve = siteMutation({
	permission: "post.approve",
	args: { postId: v.id("posts"), overrides: v.optional(v.array(v.object({ checkId: v.string(), reason: v.string() }))) },
	handler: async (ctx, { siteId, postId, overrides }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state !== "in-review") return fail("Only posts in review can be approved");
		const inputs = await gateInputs(ctx, site, post);
		if (!inputs.repo) return fail("Connect a repo first. The MR needs somewhere to open");
		const explicit: Record<string, string> = {};
		for (const o of overrides ?? []) {
			if (o.reason.trim().length < 8) return fail("Give each override a reason (8+ characters)");
			explicit[o.checkId] = o.reason.trim();
		}
		const result = evaluateGate(inputs.post, inputs.slots, inputs.manifest, explicit);
		if (!result.canApprove || !inputs.manifest) {
			if (result.hard.length) return fail(`${result.hard.length} hard block${result.hard.length > 1 ? "s" : ""}: ${result.hard.join(" · ")}`);
			return fail("Soft blocks need a logged reason to override");
		}
		await approveAndShip(ctx, site, post, result, user, { explicit, autopost: false });
		return { ok: true };
	},
});

/** Autopost sites: run the gate now instead of waiting (api-map `shipNow`). */
export const shipNow = siteMutation({
	permission: "post.approve",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }): Promise<TResult> => {
		const { site } = ctx.access;
		if (site.status === "paused") return fail("This site is paused · resume it to run agents");
		if (!site.publishing.autopost) return fail("Autopost is off for this site. Approve it in Approvals");
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state !== "needs-assets" && post.state !== "in-review") return fail("Ship now works once the draft exists (Needs assets or In review)");
		const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50);
		if (slots.some((s) => s.status === "generating")) return fail("Wait for image generation to finish");
		await workflow.start(ctx, internal.workflows.autopostGate.autopostGate, { siteId, postId }, { startAsync: true });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: ctx.access.user, action: "ran autopost gate", target: post.title });
		return { ok: true };
	},
});

export type { Id };

/**
 * F24: when the readiness gate passes, posts waiting for setup start in plan order (week, then oldest): the first
 * cadenceTarget start drafting now, cap-checked like a publish slot; the rest leave the hold and go to the normal
 * publish-slot schedule. Called after the repo connects, a template is confirmed, or the profile is accepted.
 */
export async function releaseWaiting(ctx: MutationCtx, siteId: Id<"sites">): Promise<number> {
	const site = await ctx.db.get(siteId);
	if (!site || !(await readinessOf(ctx, site)).ready) return 0;
	const waiting = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "briefed")).take(500)).filter((p) => p.hold?.reason === "waiting-for-setup").sort((a, b) => a.week - b.week || a.createdAt - b.createdAt);
	let started = 0;
	for (const p of waiting) {
		if (started < Math.max(1, site.cadenceTarget)) {
			const r = await startGeneration(ctx, site, p, { trigger: "workflow" });
			if (r.ok) started++;
			else await ctx.db.patch(p._id, { hold: undefined }); // e.g. over the cap: the publish slot retries it
		} else await ctx.db.patch(p._id, { hold: undefined });
	}
	if (waiting.length) await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: { system: AUTOPOST_ACTOR }, action: "readiness gate passed", target: site.domain, detail: `${started} post${started === 1 ? "" : "s"} drafting now · ${waiting.length - started} on the publish schedule` });
	return started;
}

/**
 * Update live post (every site): re-publish a live post's current content through the normal ship flow (render →
 * PR → CI → merge), e.g. after renderer fixes or an author change (prd-rubrics-and-authors RA3: manual, never
 * automatic). Snapshots the content as a new version; a hard gate block stops it. Auto-merge follows the site's setting.
 */
export const republishLive = siteMutation({
	permission: "post.approve",
	args: { postId: v.id("posts"), reason: v.string() },
	handler: async (ctx, { siteId, postId, reason }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (post.state !== "live") return fail("Only a live post can be updated this way");
		if (post.workflowId) return fail("This post is already being worked on");
		const why = reason.trim().slice(0, 200);
		if (why.length < 3) return fail("Say what this update changes");
		const inputs = await gateInputs(ctx, site, post);
		const gate = evaluateGate(inputs.post, inputs.slots, inputs.manifest);
		if (gate.hard.length) return fail(`Can't re-publish: ${gate.hard.join(" · ")}`);
		const n = post.currentVersion + 1;
		await ctx.db.insert("postVersions", { siteId, postId, n, origin: "human-edit", actor: user.name, at: Date.now(), words: post.words, blocks: post.blocks, seoTitle: post.seoTitle });
		const t = await transitionPost(ctx, post, "in-review", { extra: { currentVersion: n, approvedVersion: n, progress: { label: "Rendering into the template", value: 85 } } });
		if (!t.ok) return fail(t.reason);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "updated live post", target: post.title, detail: `v${n} · ${why}` });
		const workflowId = await workflow.start(ctx, internal.workflows.shipPost.shipPost, { siteId, postId, version: n, autopost: site.publishing.autopost, overrides: [] }, { startAsync: true });
		return { ok: true, id: workflowId };
	},
});
