// Autopost gate steps (handoff 02 step 5; ported from the prototype's runAutopostGate). evaluateGate → autopostDecision
// → agent fixes (as AUTOPOST_ACTOR, each audited) → re-evaluate → approve + shipPost, or hold. Never ships around a
// block: the decision is recomputed on fresh rows right before the fixes, and the gate is re-checked after them.
import { v } from "convex/values";
import { AUTOPOST_ACTOR, AUTOPOST_SOFT_REASON, VISUAL_AGENT, autopostDecision, evaluateGate, gateChecks, type IAutopostFix } from "../../src/lib/logic";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { approveAndShip, holdPost } from "../lib/approval";
import { audit } from "../lib/audit";
import { gateInputs } from "../lib/gateInputs";
import { createRun, finishRun } from "../lib/runs";
import { transitionPost } from "../lib/transition";
import { countWords, fixCheck, rewriteWithout } from "./fixes";
import { vSafeEdits } from "../agentEdits";
import { agentsLive, refreshOnPage } from "../lib/onpage";

/** The plan's text fixes as CMS agent tasks (fact rewrites + agent-fixable checks). */
function tasksFor(plan: IAutopostFix[], facts: Doc<"factMarkers">[], post: Doc<"posts">, checks: Doc<"gateChecks">[]) {
	const out: ({ id: string; type: "rewrite-claim"; claim: string; blockId: string } | { id: string; type: "fix-check"; checkId: string; label: string; value: string })[] = [];
	for (const f of plan) {
		if (f.kind === "fact") {
			const m = facts.find((x) => x._id === f.id);
			const b = m && (post.blocks.find((x) => x.factMarkerIds?.includes(m._id)) ?? post.blocks.find((x) => x.text.includes(m.claim)) ?? post.blocks.find((x) => x.id === m.blockId));
			if (m && b) out.push({ id: `fact:${m._id}`, type: "rewrite-claim", claim: m.claim, blockId: b.id });
		} else if (f.kind === "check") {
			const row = checks.find((c) => c.checkId === f.id);
			out.push({ id: `check:${f.id}`, type: "fix-check", checkId: f.id, label: row?.label ?? f.label, value: row?.value ?? "" });
		}
	}
	return out;
}

const AUTOPOST = { system: AUTOPOST_ACTOR };
const GATE_STATES = new Set(["needs-assets", "in-review"]);

async function loadInSite(ctx: MutationCtx, siteId: Id<"sites">, postId: Id<"posts">) {
	const post = await ctx.db.get(postId);
	const site = await ctx.db.get(siteId);
	if (!post || !site || post.siteId !== siteId) return null;
	return { post, site };
}

/** Step 1: decide. Holds right away when the decision is hold; otherwise returns the fix plan for fixStep. */
export const decide = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const got = await loadInSite(ctx, siteId, postId);
		if (!got || !GATE_STATES.has(got.post.state)) return { action: "stop" as const, plan: [] as IAutopostFix[], tasks: [] };
		const { post, site } = got;
		if (agentsLive()) await refreshOnPage(ctx, post);
		const inputs = await gateInputs(ctx, site, post);
		const decision = autopostDecision(inputs.post, evaluateGate(inputs.post, inputs.slots, inputs.manifest), inputs.site);
		if (decision.action === "hold") {
			await holdPost(ctx, site, post, decision.reason!);
			return { action: "hold" as const, plan: [] as IAutopostFix[], tasks: [] };
		}
		return { action: "ship" as const, plan: decision.plan, tasks: agentsLive() ? tasksFor(decision.plan, inputs.factDocs, post, inputs.checkDocs) : [] };
	},
});

/** Step 3: apply the fixes, re-check, then approve and start shipPost (or hold). */
export const applyAndShip = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), agentEdits: v.optional(vSafeEdits) },
	handler: async (ctx, { siteId, postId, agentEdits }) => {
		const agentEdit = (taskId: string) => agentEdits?.edits.find((e) => e.taskId === taskId && e.op === "replace");
		const got = await loadInSite(ctx, siteId, postId);
		if (!got || !GATE_STATES.has(got.post.state)) return { shipped: false };
		const { site } = got;
		let post: Doc<"posts"> = got.post;
		let inputs = await gateInputs(ctx, site, post);
		const decision = autopostDecision(inputs.post, evaluateGate(inputs.post, inputs.slots, inputs.manifest), inputs.site);
		if (decision.action === "hold") {
			await holdPost(ctx, site, post, decision.reason!);
			return { shipped: false };
		}
		let blocks = post.blocks.map((b) => ({ ...b }));
		let seoTitle = post.seoTitle;
		let words = post.words;
		let textUsd = 0;
		let imageUsd = 0;
		let edits = 0;
		let accepted = 0;
		const now = Date.now();
		const ws = site.workspaceId;
		for (const fix of decision.plan) {
			if (fix.budget === "text") textUsd += fix.usd;
			else imageUsd += fix.usd;
			if (fix.kind === "fact") {
				const f = inputs.factDocs.find((x) => x._id === fix.id);
				if (!f) continue;
				const b = blocks.find((x) => x.factMarkerIds?.includes(f._id)) ?? blocks.find((x) => x.text.includes(f.claim));
				if (b) {
					const before = b.text;
					const e = agentEdit(`fact:${f._id}`);
					b.text = e && e.blockId === b.id ? e.text : rewriteWithout(b.text, f.claim);
					words = Math.max(0, words + countWords(b.text) - countWords(before));
				}
				for (const x of blocks) if (x.factMarkerIds) x.factMarkerIds = x.factMarkerIds.filter((id) => id !== f._id);
				await ctx.db.patch(f._id, { status: "resolved", resolution: "rewritten", resolvedBy: AUTOPOST_ACTOR, resolvedAt: now, note: `No citable source found · rewritten without the claim by the ${AUTOPOST_ACTOR}.` });
				await audit(ctx, { workspaceId: ws, siteId, postId, actor: AUTOPOST, action: "rewrote unsourced claim", target: post.title, detail: `"${f.claim}" · autopost` });
				edits++;
			} else if (fix.kind === "check") {
				const row = inputs.checkDocs.find((c) => c.checkId === fix.id);
				const e = agentEdits?.edits.find((x) => x.taskId === `check:${fix.id}`);
				if (agentEdits && (e || (fix.id === "title-length" && agentEdits.seoTitle) || (fix.id === "meta-description" && agentEdits.metaDescription))) {
					// The model's fix; the audit below re-checks it instead of trusting it.
					if (e) {
						const i = blocks.findIndex((b) => b.id === e.blockId);
						if (e.op === "replace" && i >= 0) blocks[i] = { ...blocks[i]!, text: e.text };
						else if (e.op === "insert_after") blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, { id: `b-${fix.id}-${now}`, kind: e.kind, text: e.text });
					}
					if (fix.id === "title-length" && agentEdits.seoTitle) seoTitle = agentEdits.seoTitle;
					if (fix.id === "meta-description" && agentEdits.metaDescription) await ctx.db.patch(postId, { metaDescription: agentEdits.metaDescription });
					words = blocks.reduce((n, b) => n + countWords(b.text), 0);
				} else {
					const r = fixCheck(fix.id, blocks, seoTitle, inputs.keyword, row?.value ?? "");
					blocks = r.blocks;
					seoTitle = r.seoTitle;
					words += r.wordsDelta;
					if (row) await ctx.db.patch(row._id, { status: "pass", value: r.check.value ?? row.value, evaluatedAt: now });
				}
				await audit(ctx, { workspaceId: ws, siteId, postId, actor: AUTOPOST, action: "fixed check", target: post.title, detail: `${fix.label} · autopost` });
				edits++;
			} else if (fix.kind === "soft-fix") {
				const text = (post.regulated && site.brandPack.disclaimers[post.regulated]) || `This article is general information, not ${post.regulated ?? "professional"} advice.`;
				blocks.push({ id: `b-disclaimer-${now}`, kind: "disclaimer", text });
				await audit(ctx, { workspaceId: ws, siteId, postId, actor: AUTOPOST, action: "fixed check", target: post.title, detail: `${fix.label} · autopost` });
				edits++;
			} else if (fix.kind === "soft-accept") {
				const check = gateChecks(inputs.post).find((c) => c.id === fix.id);
				if (!check) continue;
				const override = { reason: AUTOPOST_SOFT_REASON, by: AUTOPOST_ACTOR, at: now };
				const row = inputs.checkDocs.find((c) => c.checkId === fix.id);
				if (row) await ctx.db.patch(row._id, { override });
				else await ctx.db.insert("gateChecks", { siteId, postId, checkId: check.id, label: check.label, section: check.section, status: check.status, value: check.value, severity: check.severity, override, evaluatedAt: now, evaluatedForVersion: post.currentVersion });
				await audit(ctx, { workspaceId: ws, siteId, postId, actor: AUTOPOST, action: "accepted soft block", target: post.title, detail: `${check.label} ${check.value} · "${AUTOPOST_SOFT_REASON}"` });
				accepted++;
			} else if (fix.kind === "slot") {
				const slot = inputs.slotDocs.find((s) => s._id === fix.id);
				if (!slot) continue;
				// STUB (04): the visual-asset agent picks the best candidate or fills the slot.
				await ctx.db.patch(slot._id, { status: "selected", generatedAt: now });
				await audit(ctx, { workspaceId: ws, siteId, postId, actor: { system: VISUAL_AGENT }, action: "selected asset", target: slot.name, detail: `${post.title} · autopost` });
			}
		}
		if (edits) {
			const n = post.currentVersion + 1;
			await ctx.db.insert("postVersions", { siteId, postId, n, origin: "agent-edit", actor: AUTOPOST_ACTOR, at: now, words, blocks, seoTitle, note: `Autopost · ${edits} fix${edits > 1 ? "es" : ""} before shipping` });
			await ctx.db.patch(postId, { blocks, seoTitle, words, currentVersion: n, updatedAt: now });
		}
		const runFor = async (kind: "post-generation" | "image-generation", usd: number, output: string) => {
			const runId = await createRun(ctx, { site, kind, trigger: "workflow", estimate: { usd: Math.round(usd * 100) / 100, budget: kind === "image-generation" ? "image" : "text", tier: "workhorse" }, idempotencyKey: `run:${siteId}:autopost-fix:${kind}:${postId}:${post.currentVersion}`, postId, output });
			await finishRun(ctx, runId, { status: "succeeded", output });
		};
		// Live: the agent's own run already carries the real cost; the placeholder estimate run is the stub world's record.
		if (textUsd > 0 && !agentEdits) await runFor("post-generation", textUsd, `Autopost gate · ${edits} fix${edits === 1 ? "" : "es"}`);
		if (imageUsd > 0) await runFor("image-generation", imageUsd, "Slots filled for autopost");

		post = (await ctx.db.get(postId))!;
		if (agentsLive()) await refreshOnPage(ctx, post);
		inputs = await gateInputs(ctx, site, post);
		const after = evaluateGate(inputs.post, inputs.slots, inputs.manifest);
		if (!after.canApprove || !inputs.manifest) {
			await holdPost(ctx, site, post, after.hard[0] ?? "A soft block has no logged reason");
			return { shipped: false };
		}
		// TRANSITIONS has no needs-assets → mr-open edge: autopost passes through In review, audited.
		if (post.state === "needs-assets") {
			await ctx.db.patch(postId, { progress: undefined });
			const r = await transitionPost(ctx, post, "in-review");
			if (!r.ok) return { shipped: false };
			post = r.post;
		}
		const fixes = decision.fixes.length - accepted;
		await approveAndShip(ctx, site, post, after, AUTOPOST, { explicit: {}, autopost: true, approvalDetail: `Autopost · ${fixes} agent fix${fixes === 1 ? "" : "es"} · ${accepted} soft block${accepted === 1 ? "" : "s"} accepted` });
		return { shipped: true };
	},
});
