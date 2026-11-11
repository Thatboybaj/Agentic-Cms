// Editor actions beyond editBlock (api-map §4): post detail, SEO title, restore, fact sources, overrides, comments,
// edit locks, and agent suggestions (instruct, fix a check, rewrite without a claim, accept, reject). Wording and
// refusals are the prototype's (src/lib/store.tsx). Agent proposals are the deterministic ports in
// pipeline/proposals.ts and cost $0 until 03 makes them model calls; they still go through the cap check.
import { v } from "convex/values";
import { RUN_META, checkCap, gateChecks, isHardFail, postUrl, type IEstimate } from "../src/lib/logic";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { loadPostInSite } from "./lib/access";
import { audit } from "./lib/audit";
import { capSite, fmtUsd } from "./lib/budget";
import { siteMutation, siteQuery } from "./lib/functions";
import { gateInputs } from "./lib/gateInputs";
import { notify, siteAudienceWith } from "./lib/notify";
import { createRun, finishRun, refuseRun } from "./lib/runs";
import { transitionPost } from "./lib/transition";
import { rewriteWithout } from "./pipeline/fixes";
import { internal } from "./_generated/api";
import { agentsLive, refreshOnPage } from "./lib/onpage";
import type { TEditTask } from "./agents/editorCore";
import { lastContentBlock, proposeEdit, textBlocks, type IProposal } from "./pipeline/proposals";

type TResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): TResult => ({ ok: false, reason });
const LOCK_MS = 2 * 60_000;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
const SUGGESTION_ESTIMATE: IEstimate = { usd: 0.06, budget: "text", tier: "workhorse" };

async function lockHeldByOther(ctx: MutationCtx, postId: Id<"posts">, userId: Id<"users">) {
	const lock = (await ctx.db.query("editLocks").withIndex("by_post", (q) => q.eq("postId", postId)).take(1))[0];
	if (!lock || lock.userId === userId || Date.now() - lock.heartbeatAt >= LOCK_MS) return null;
	return { lock, holder: await ctx.db.get(lock.userId) };
}

/** A new version after an approval makes the approval stale: an open MR goes back to In review. */
async function newVersion(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, user: Doc<"users">, fields: { blocks: Doc<"posts">["blocks"]; words: number; seoTitle: string; note?: string; origin?: "human-edit" | "agent-edit"; actor?: string }) {
	const n = post.currentVersion + 1;
	await ctx.db.insert("postVersions", { siteId: site._id, postId: post._id, n, origin: fields.origin ?? "human-edit", actor: fields.actor ?? user.name, ...(fields.origin === "agent-edit" ? {} : { actorUserId: user._id }), at: Date.now(), words: fields.words, blocks: fields.blocks, seoTitle: fields.seoTitle, ...(fields.note ? { note: fields.note } : {}) });
	await ctx.db.patch(post._id, { blocks: fields.blocks, words: fields.words, seoTitle: fields.seoTitle, currentVersion: n, updatedAt: Date.now() });
	if (post.state === "mr-open" && post.approvedVersion !== undefined && post.approvedVersion < n) {
		const r = await transitionPost(ctx, { ...post, currentVersion: n }, "in-review");
		if (r.ok) await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: user, action: "moved to In review", target: post.title, detail: `Edited after approval (v${post.approvedVersion} → v${n}) · the open MR updates on the next approval` });
	}
	return n;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Everything the editor shows for one post beyond the plan bundle: versions, suggestions, comments, lock, activity. */
export const detail = siteQuery({
	permission: "plan.view",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		await loadPostInSite(ctx, siteId, postId);
		const versions = await ctx.db.query("postVersions").withIndex("by_post_n", (q) => q.eq("postId", postId)).order("desc").take(30);
		const suggestions = await ctx.db.query("suggestions").withIndex("by_post_status", (q) => q.eq("postId", postId)).take(100);
		const comments = await ctx.db.query("comments").withIndex("by_post_at", (q) => q.eq("postId", postId)).take(200);
		const lock = (await ctx.db.query("editLocks").withIndex("by_post", (q) => q.eq("postId", postId)).take(1))[0];
		const holder = lock ? await ctx.db.get(lock.userId) : null;
		const activity = (await ctx.db.query("auditEvents").withIndex("by_site_at", (q) => q.eq("siteId", siteId)).order("desc").take(300)).filter((a) => a.postId === postId).slice(0, 50);
		return {
			versions: versions.map((x) => ({ id: x._id, n: x.n, origin: x.origin, actor: x.actor, at: x.at, words: x.words, note: x.note, blocks: x.blocks, seoTitle: x.seoTitle })),
			suggestions,
			comments,
			lock: lock && holder ? { userId: lock.userId, name: holder.name, initials: holder.initials, since: lock.since, heartbeatAt: lock.heartbeatAt, fresh: Date.now() - lock.heartbeatAt < LOCK_MS } : null,
			activity: activity.map((a) => ({ id: a._id, at: a.at, actor: a.actor, action: a.action, target: a.target, detail: a.detail })),
		};
	},
});

// ─── Direct edits ─────────────────────────────────────────────────────────────

export const editSeoTitle = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), seoTitle: v.string() },
	handler: async (ctx, { siteId, postId, seoTitle }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const held = await lockHeldByOther(ctx, postId, user._id);
		if (held) return fail(`${held.holder?.name ?? "Someone"} is editing`);
		const t = seoTitle.trim();
		if (!t) return fail("The SEO title can't be empty");
		await ctx.db.patch(postId, { seoTitle: t, updatedAt: Date.now() });
		for (const c of await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", postId)).take(60)) {
			if (c.checkId === "title-length") await ctx.db.patch(c._id, { value: `${t.length} / 60`, status: t.length <= 60 ? "pass" : "fail" });
			else if (c.checkId === "title-front") await ctx.db.patch(c._id, { value: `${t.length} ch` });
		}
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "edited SEO title", target: post.title, detail: t });
		return { ok: true };
	},
});

export const restoreVersion = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), versionId: v.id("postVersions") },
	handler: async (ctx, { siteId, postId, versionId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const ver = await ctx.db.get(versionId);
		if (!ver || ver.postId !== postId) return fail("Version not found");
		if (post.workflowId) return fail("An agent is working on this post · wait for it to finish");
		await newVersion(ctx, site, post, user, { blocks: ver.blocks, words: ver.words, seoTitle: ver.seoTitle ?? post.seoTitle, note: `Restored v${ver.n}` });
		if (agentsLive()) await refreshOnPage(ctx, (await ctx.db.get(postId))!);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "restored version", target: post.title, detail: `v${ver.n}` });
		return { ok: true };
	},
});

export const addFactSource = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), markerId: v.id("factMarkers"), url: v.string() },
	handler: async (ctx, { siteId, postId, markerId, url }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const f = await ctx.db.get(markerId);
		if (!f || f.postId !== postId) return fail("Fact marker not found");
		const source = url.trim();
		if (!/^https?:\/\/[^\s/]+\.[^\s]+$/.test(source)) return fail("Paste a full source URL (https://…)");
		await ctx.db.patch(markerId, { status: "resolved", resolution: "sourced", source, resolvedBy: user.name, resolvedAt: Date.now(), note: `Source added by ${user.name}.` });
		const blocks = post.blocks.map((b) => (b.factMarkerIds ? { ...b, factMarkerIds: b.factMarkerIds.filter((x) => x !== markerId) } : b));
		await ctx.db.patch(postId, { blocks });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "added source", target: post.title, detail: `"${f.claim}" · ${source}` });
		return { ok: true };
	},
});

export const overrideCheck = siteMutation({
	permission: "gate.override",
	args: { postId: v.id("posts"), checkId: v.string(), reason: v.string() },
	handler: async (ctx, { siteId, postId, checkId, reason }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const inputs = await gateInputs(ctx, site, post);
		const check = gateChecks(inputs.post).find((c) => c.id === checkId);
		if (!check) return fail("Check not found");
		if (isHardFail(check)) return fail("Hard blocks can't be overridden. Fix them to approve");
		if (check.status === "pass") return fail("This check is already passing");
		const why = reason.trim();
		if (why.length < 8) return fail("Add a reason. It's logged to the audit trail and listed in the MR");
		const override = { reason: why, by: user.name, byUserId: user._id, at: Date.now() };
		const row = inputs.checkDocs.find((c) => c.checkId === checkId);
		if (row) await ctx.db.patch(row._id, { override });
		else await ctx.db.insert("gateChecks", { siteId, postId, checkId, label: check.label, section: check.section, status: check.status, value: check.value, severity: check.severity, override, evaluatedAt: Date.now(), evaluatedForVersion: post.currentVersion });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "overrode soft block", target: post.title, detail: `${check.label} ${check.value} · "${why}"` });
		return { ok: true };
	},
});

export const addComment = siteMutation({
	permission: "post.comment",
	args: { postId: v.id("posts"), text: v.string() },
	handler: async (ctx, { siteId, postId, text }): Promise<TResult> => {
		const { site, user, role } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const body = text.trim();
		if (!body) return fail("Write a comment first");
		await ctx.db.insert("comments", { siteId, postId, byUserId: user._id, by: user.name, role, text: body, at: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "commented", target: post.title });
		// Fan-out (api-map §9): the assignee + specialists on the site, minus the author.
		const recipients = await siteAudienceWith(ctx, site, "post.approve");
		if (post.assigneeId) recipients.push(post.assigneeId);
		await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: recipients, except: user._id, tone: "neutral", title: `${user.name} commented`, body: `${post.title} · ${body.slice(0, 120)}`, href: `/posts/${postId}` });
		return { ok: true };
	},
});

// ─── Edit locks (api-map §1) ──────────────────────────────────────────────────

export const startEditing = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), sessionId: v.string(), takeOver: v.optional(v.boolean()) },
	handler: async (ctx, { siteId, postId, sessionId, takeOver }): Promise<TResult & { heldBy?: string }> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const now = Date.now();
		const lock = (await ctx.db.query("editLocks").withIndex("by_post", (q) => q.eq("postId", postId)).take(1))[0];
		if (lock && lock.userId === user._id) {
			await ctx.db.patch(lock._id, { heartbeatAt: now, sessionId });
			return { ok: true };
		}
		const fresh = lock && now - lock.heartbeatAt < LOCK_MS;
		if (lock && fresh && !takeOver) {
			const holder = await ctx.db.get(lock.userId);
			return { ok: false, reason: `${holder?.name ?? "Someone"} is editing`, heldBy: holder?.name ?? "Someone" };
		}
		if (lock) {
			const previous = await ctx.db.get(lock.userId);
			await ctx.db.delete(lock._id);
			if (fresh && previous) {
				await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "took over editing", target: post.title, detail: `from ${previous.name}` });
				await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: [previous._id], tone: "human", title: `${user.name} took over editing`, body: post.title, href: `/posts/${postId}` });
			}
		}
		await ctx.db.insert("editLocks", { siteId, postId, userId: user._id, sessionId, since: now, heartbeatAt: now });
		return { ok: true };
	},
});

export const stopEditing = siteMutation({
	permission: "plan.view",
	args: { postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }): Promise<TResult> => {
		await loadPostInSite(ctx, siteId, postId);
		const lock = (await ctx.db.query("editLocks").withIndex("by_post", (q) => q.eq("postId", postId)).take(1))[0];
		if (lock && lock.userId === ctx.access.user._id) await ctx.db.delete(lock._id);
		return { ok: true };
	},
});

// ─── Agent suggestions ────────────────────────────────────────────────────────

/** Cap-checked small agent call → a pending suggestion (the prototype's queueSuggestion; no delay, $0 until 03). */
async function queueSuggestion(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, user: Doc<"users">, proposal: IProposal, label: string): Promise<TResult> {
	const cap = checkCap(capSite(site), "post-generation", SUGGESTION_ESTIMATE);
	const key = `run:${site._id}:suggestion:${post._id}:${post.currentVersion}:${proposal.instruction}:${proposal.blockId}`;
	const base = { site, kind: "post-generation" as const, trigger: "manual" as const, estimate: SUGGESTION_ESTIMATE, idempotencyKey: key, postId: post._id, triggeredBy: user._id, output: `Agent edit · "${proposal.instruction}"` };
	if (cap.status === "refused") {
		await refuseRun(ctx, base, cap, user);
		return fail(cap.message);
	}
	const pending = await ctx.db.query("suggestions").withIndex("by_post_status", (q) => q.eq("postId", post._id).eq("status", "pending")).take(100);
	if (pending.some((s) => s.instruction === proposal.instruction && s.blockId === proposal.blockId)) return fail("The agent already has a pending edit for that");
	const runId = await createRun(ctx, base);
	await ctx.db.insert("suggestions", {
		siteId: site._id,
		postId: post._id,
		instruction: proposal.instruction,
		before: proposal.before,
		after: proposal.after,
		blockId: proposal.blockId,
		status: "pending",
		...(proposal.fixesCheckId ? { fixesCheckId: proposal.fixesCheckId } : {}),
		...(proposal.resolvesFactId ? { resolvesFactId: proposal.resolvesFactId as Id<"factMarkers"> } : {}),
		...(proposal.insertKind ? { insertKind: proposal.insertKind } : {}),
		runId,
		createdAt: Date.now(),
	});
	await finishRun(ctx, runId, { status: "succeeded", output: `Suggestion ready · "${proposal.instruction}"` });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: user, action: label, target: post.title, detail: `"${proposal.instruction}" · est. ${fmtUsd(SUGGESTION_ESTIMATE.usd)}` });
	return { ok: true };
}

/**
 * Live CMS agent (CMS_AGENTS=live): cap check, a running run, and the model call scheduled in agents/editor.ts. The
 * suggestion arrives when it's ready; the editor shows it through its subscription.
 */
async function queueAgent(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, user: Doc<"users">, task: TEditTask, meta: { instruction: string; fixesCheckId?: string; resolvesFactId?: Id<"factMarkers"> }, label: string): Promise<TResult> {
	const cap = checkCap(capSite(site), "post-generation", SUGGESTION_ESTIMATE);
	const key = `run:${site._id}:agent-edit:${post._id}:${post.currentVersion}:${task.type}:${meta.instruction}:${"blockId" in task ? (task.blockId ?? "") : ""}`;
	const base = { site, kind: "post-generation" as const, trigger: "manual" as const, estimate: SUGGESTION_ESTIMATE, idempotencyKey: key, postId: post._id, triggeredBy: user._id, output: `Agent working · "${meta.instruction}"` };
	if (cap.status === "refused") {
		await refuseRun(ctx, base, cap, user);
		return fail(cap.message);
	}
	// One request at a time per task and version; asking again after an answer is fine (each answer is a new run).
	const recent = await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", site._id)).order("desc").take(50);
	if (recent.some((r) => r.idempotencyKey.startsWith(key) && (r.status === "running" || r.status === "queued"))) return fail("The agent is already working on that");
	const runId = await createRun(ctx, { ...base, idempotencyKey: `${key}:${Date.now()}` });
	await ctx.scheduler.runAfter(0, internal.agents.editor.suggest, { siteId: site._id, postId: post._id, runId, tasks: [task], meta: [{ taskId: task.id, ...meta }] });
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: user, action: label, target: post.title, detail: `"${meta.instruction}" · est. ${fmtUsd(SUGGESTION_ESTIMATE.usd)}` });
	return { ok: true };
}

const MODEL_FIXABLE = new Set(["kw-first-100", "title-length", "meta-description", "faq", "internal-links", "word-count", "headings", "density", "title-front"]);

async function keywordOf(ctx: MutationCtx, post: Doc<"posts">) {
	return (await ctx.db.get(post.keywordId))?.term ?? post.title;
}

export const instructAgent = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), instruction: v.string(), blockId: v.optional(v.string()) },
	handler: async (ctx, { siteId, postId, instruction, blockId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (!instruction.trim()) return fail("Tell the agent what to change");
		if (!post.blocks.length) return fail("There's no draft yet. Generate one first");
		if (agentsLive()) return queueAgent(ctx, site, post, user, { id: "t1", type: "instruct", instruction: instruction.trim(), ...(blockId ? { blockId } : {}) }, { instruction: instruction.trim() }, "instructed agent");
		const checks = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", postId)).take(60);
		const proposal = proposeEdit({ blocks: post.blocks, gate: checks.map((c) => ({ id: c.checkId, status: c.status })) }, await keywordOf(ctx, post), instruction.trim(), blockId);
		if (!proposal) return fail("The agent found nothing to change for that instruction");
		return queueSuggestion(ctx, site, post, user, proposal, "instructed agent");
	},
});

export const rewriteFactWithout = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), markerId: v.id("factMarkers") },
	handler: async (ctx, { siteId, postId, markerId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const f = await ctx.db.get(markerId);
		if (!f || f.postId !== postId) return fail("Fact marker not found");
		if (f.status !== "open") return fail("This marker is already resolved");
		const block = post.blocks.find((b) => b.factMarkerIds?.includes(markerId)) ?? post.blocks.find((b) => b.text.includes(f.claim));
		if (!block) return fail("The claim is no longer in the draft");
		if (agentsLive()) return queueAgent(ctx, site, post, user, { id: "t1", type: "rewrite-claim", claim: f.claim, blockId: block.id }, { instruction: "rewrite without the unsourced claim", resolvesFactId: markerId }, "asked agent to rewrite");
		return queueSuggestion(ctx, site, post, user, { instruction: "rewrite without the unsourced claim", blockId: block.id, before: block.text, after: rewriteWithout(block.text, f.claim), resolvesFactId: markerId }, "asked agent to rewrite");
	},
});

export const fixCheck = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), checkId: v.string() },
	handler: async (ctx, { siteId, postId, checkId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const inputs = await gateInputs(ctx, site, post);
		const check = gateChecks(inputs.post).find((c) => c.id === checkId);
		if (!check) return fail("Check not found");
		if (check.status === "pass") return fail("Already passing");
		const kw = inputs.keyword;
		if (agentsLive() && MODEL_FIXABLE.has(checkId)) return queueAgent(ctx, site, post, user, { id: "t1", type: "fix-check", checkId, label: check.label, value: check.value }, { instruction: `fix: ${check.label.toLowerCase()}`, fixesCheckId: checkId }, "asked agent to fix");
		if (agentsLive() && checkId === "external-links") return fail("The agent has no web access yet. Add 1–3 sources to the draft yourself");
		const simple = { blocks: post.blocks, gate: inputs.checkDocs.map((c) => ({ id: c.checkId, status: c.status })) };
		if (checkId === "schema") {
			const row = inputs.checkDocs.find((c) => c.checkId === "schema");
			if (row) await ctx.db.patch(row._id, { status: "pass", value: "Article" });
			await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: { system: "On-page optimizer" }, action: "fixed check", target: post.title, detail: "Schema ready · Article" });
			return { ok: true };
		}
		let proposal: IProposal | null = null;
		if (checkId === "kw-first-100") proposal = proposeEdit(simple, kw, "put keyword in intro");
		else if (checkId === "faq") proposal = proposeEdit(simple, kw, "add an FAQ");
		else if (checkId === "internal-links") {
			const related = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(200)).find((x) => x._id !== post._id && x.pillarId === post.pillarId);
			const blocks = textBlocks(simple);
			const target = blocks[blocks.length - 1];
			if (!related || !target) return fail("No related live page in this pillar to link to yet");
			proposal = { instruction: "add an internal link", blockId: target.id, before: target.text, after: `${target.text} See [${related.title}](${postUrl(related)}) for more.`, fixesCheckId: "internal-links" };
		} else if (checkId === "word-count") {
			const anchor = lastContentBlock(simple);
			if (!anchor) return fail("There's no draft yet");
			proposal = { instruction: "expand to the word target", blockId: anchor.id, before: "", after: `What to ask at your consultation. Bring your questions about ${kw}: how long it takes, what it costs in total, what happens if you need a follow-up, and how the clinic handles aftercare.`, insertKind: "p", fixesCheckId: "word-count" };
		} else if (checkId === "disclaimer") {
			const text = post.regulated ? site.brandPack.disclaimers[post.regulated] : undefined;
			proposal = { instruction: "add the regulated-topic disclaimer", blockId: post.blocks[post.blocks.length - 1]?.id ?? "", before: "", after: text ?? `This article is general information, not ${post.regulated ?? "professional"} advice.`, insertKind: "disclaimer" };
		} else proposal = proposeEdit(simple, kw, `fix: ${check.label.toLowerCase()}`);
		if (!proposal) return fail("The agent can't fix this automatically. Edit it directly");
		if (!proposal.fixesCheckId && inputs.checkDocs.some((c) => c.checkId === checkId)) proposal.fixesCheckId = checkId;
		return queueSuggestion(ctx, site, post, user, proposal, "asked agent to fix");
	},
});

export const acceptSuggestion = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), suggestionId: v.id("suggestions") },
	handler: async (ctx, { siteId, postId, suggestionId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const sg = await ctx.db.get(suggestionId);
		if (!sg || sg.postId !== postId || sg.status !== "pending") return fail("This suggestion is no longer pending");
		let blocks = post.blocks.map((b) => ({ ...b }));
		let words = post.words;
		let seoTitle = post.seoTitle;
		const idx = blocks.findIndex((b) => b.id === sg.blockId);
		if (sg.field === "seoTitle") seoTitle = sg.after.trim();
		else if (sg.field === "metaDescription") await ctx.db.patch(postId, { metaDescription: sg.after.trim() });
		else if (sg.insertKind) {
			blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, { id: `b-${Date.now().toString(36)}`, kind: sg.insertKind, text: sg.after });
			words += countWords(sg.after);
		} else if (idx >= 0) {
			const b = blocks[idx]!;
			const before = b.text;
			b.text = sg.before && b.text.includes(sg.before) ? b.text.replace(sg.before, sg.after) : sg.after;
			words = Math.max(0, words + countWords(b.text) - countWords(before));
		}
		if (sg.fixesCheckId) {
			const row = (await ctx.db.query("gateChecks").withIndex("by_post_check", (q) => q.eq("postId", postId).eq("checkId", sg.fixesCheckId!)).take(1))[0];
			if (row) await ctx.db.patch(row._id, { status: "pass", value: row.checkId === "kw-first-100" ? "Word 9" : row.checkId === "internal-links" ? "2 of 2" : row.checkId === "faq" ? "2 questions" : row.value });
		}
		if (agentsLive()) words = blocks.reduce((n, b) => n + countWords(b.text), 0); // counted, never assumed
		if (sg.resolvesFactId) {
			await ctx.db.patch(sg.resolvesFactId, { status: "resolved", resolution: "rewritten", resolvedBy: user.name, resolvedAt: Date.now(), note: "Rewritten without the claim." });
			blocks = blocks.map((b) => (b.factMarkerIds ? { ...b, factMarkerIds: b.factMarkerIds.filter((x) => x !== sg.resolvesFactId) } : b));
		}
		await ctx.db.patch(suggestionId, { status: "accepted", decidedBy: user.name, decidedAt: Date.now() });
		await newVersion(ctx, site, post, user, { blocks, words, seoTitle, origin: "agent-edit", actor: RUN_META["post-generation"].agent, note: `"${sg.instruction}" · accepted by ${user.name}` });
		if (agentsLive()) await refreshOnPage(ctx, (await ctx.db.get(postId))!);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "accepted agent edit", target: post.title, detail: `"${sg.instruction}"` });
		return { ok: true };
	},
});

export const rejectSuggestion = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), suggestionId: v.id("suggestions") },
	handler: async (ctx, { siteId, postId, suggestionId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		const sg = await ctx.db.get(suggestionId);
		if (!sg || sg.postId !== postId || sg.status !== "pending") return fail("This suggestion is no longer pending");
		await ctx.db.patch(suggestionId, { status: "rejected", decidedBy: user.name, decidedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "rejected agent edit", target: post.title, detail: `"${sg.instruction}"` });
		return { ok: true };
	},
});
