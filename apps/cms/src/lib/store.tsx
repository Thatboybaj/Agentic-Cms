"use client";

// Client store for the prototype. Simulates the agents, the Git host and Search Console with deterministic timers so
// every PRD state is demonstrable. Every action maps 1:1 to a future server mutation; screens only use the hooks below.
// Multi-site, multi-user (docs/multi-site-contract.md): domain data is shared (localStorage, synced across tabs via the
// `storage` event, one tab runs the job runner); the signed-in person is per tab (sessionStorage); the site comes from
// <SiteScope> (the URL), never from shared state. Tenant isolation: every hook only returns sites the user can access.
import { usePathname } from "next/navigation";
import { Fragment, createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { addHours, anchorClock, isoWeek, now, nowIso } from "./clock";
import {
	AUTOPOST_ACTOR,
	AUTOPOST_SOFT_REASON,
	applyKas,
	autopostDecision,
	checkCap,
	concentration,
	countWords,
	estimateRun,
	evaluateGate,
	fmtDate,
	fmtUsd,
	gapToProjection,
	gateChecks,
	ideaGate,
	isFilled,
	isHardFail,
	isPendingIdea,
	ledgerAge,
	ledgerStatus,
	lockReason,
	nextState,
	pillarDistribution,
	postUrl,
	RUN_META,
	ROLE_LABEL,
	roleCan,
	round2,
	STATE_OWNER,
	VISUAL_AGENT,
	type ICapCheck,
	type IEstimate,
	type IGateResult,
	type TLedgerStatus,
	type TPermission,
	mrRef,
} from "./logic";
import { peekLiveDraft, requestLiveDraft, takeLiveDraft, type ILiveDraft } from "./live-drafts";
import { loadPersisted, normalizeV2, STATE_KEY, V1_STATE_KEY } from "./migrate";
import { sitePath, WORKSPACE_ROUTES } from "./routes";
import { STATE_VERSION, candidates as makeCandidates, createSeed, gate12, schedules as defaultSchedules, slot as makeSlot, standardMappings } from "./seed";
import {
	absHref,
	accessibleSites,
	activeManifest,
	canAccessSite,
	canWorkspace,
	computeStats,
	DEFAULT_USER_ID,
	effectiveRole,
	inboxFor,
	isLockFresh,
	isolatedState,
	memberNameFor,
	otherEditor,
	portfolioFor,
	presenceFor,
	roleWhy,
	siteMembers,
	userById,
	workspaceLockReason,
	workspaceRoleOf,
	type ICmsStateView,
	type ICmsStats,
	type IEditLockHolder,
	type IInboxItem,
	type IPortfolioRow,
	type IPresenceView,
	type TWorkspacePermission,
} from "./workspace";
import type {
	IAgentSuggestion,
	ICandidate,
	ICmsState,
	IGateCheck,
	IImageSlot,
	IJob,
	IKeyword,
	ILedgerItem,
	IMember,
	IMembership,
	IMergeRequest,
	IPost,
	IFactMarker,
	IPostBlock,
	IRepoConnection,
	IRun,
	ISite,
	ISiteData,
	ITemplateManifest,
	ITemplateMapping,
	TBudgetKind,
	TModelTier,
	TPostState,
	TProvider,
	TRole,
	TRunKind,
	TSlotType,
	TTone,
	IUser,
	IWorkspace,
	TWorkspaceRole,
} from "./types";

/** Simulation timings (ms). Short enough to watch, long enough to see the in-between state. */
export const SIM_MS = { tick: 900, suggestion: 1400, candidates: 2400, parse: 2200, run: 2600, ci: 2500, revise: 3000, gate: 1600, merge: 1400, brief: 1200 } as const;

export interface IToast {
	id: string;
	text: string;
	tone: TTone;
	href?: string;
	undo?: boolean; // show an Undo button wired to actions.undo()
}

export type TResult = { ok: true; id?: string } | { ok: false; reason: string };

type TToastIn = Omit<IToast, "id">;
type TListener = () => void;

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const clone = <T,>(v: T): T => structuredClone(v);
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const hueFor = (s: string, i: number) => ([...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 37 + i * 83) % 360;

// ─── Draft helpers (operate on a mutable draft) ──────────────────────────────

const siteOf = (d: ICmsState, siteId: string) => d.sites.find((s) => s.id === siteId)!;
const dataOf = (d: ICmsState, siteId: string) => d.data[siteId];

export { activeManifest };

function audit(data: ISiteData, who: string, action: string, target: string, detail?: string) {
	data.audit.unshift({ id: uid("a"), at: nowIso(), actor: who, action, target, ...(detail ? { detail } : {}) });
}

function notify(data: ISiteData, tone: TTone, title: string, body: string, href?: string) {
	data.notifications.unshift({ id: uid("n"), at: nowIso(), tone, title, body, ...(href ? { href } : {}), read: false });
}

function pushJob(d: ICmsState, siteId: string, kind: IJob["kind"], delayMs: number, payload: IJob["payload"]) {
	d.jobs.push({ id: uid("job"), at: now().getTime() + delayMs, siteId, kind, payload });
}

function startRun(data: ISiteData, kind: TRunKind, trigger: IRun["trigger"], est: IEstimate, extra: Partial<IRun> = {}): IRun {
	const r: IRun = {
		id: uid("r"),
		kind,
		trigger,
		status: "running",
		agent: RUN_META[kind].agent,
		model: est.tier,
		tier: est.tier,
		tokens: 0,
		costUsd: 0,
		estimateUsd: est.usd,
		startedAt: nowIso(),
		output: "Running",
		budget: est.budget,
		...extra,
	};
	data.runs.unshift(r);
	return r;
}

function refuseRun(data: ISiteData, kind: TRunKind, trigger: IRun["trigger"], est: IEstimate, c: ICapCheck, who: string, extra: Partial<IRun> = {}) {
	startRun(data, kind, trigger, est, { status: "refused-over-cap", output: c.message, ...extra });
	audit(data, who, "run refused over cap", RUN_META[kind].label, `${c.budget} ${fmtUsd(c.spentUsd)} / ${fmtUsd(c.capUsd)} · est. ${fmtUsd(est.usd)}`);
	notify(data, "block", `Run refused: over ${c.budget} cap`, c.message, "/runs");
}

function finishRun(site: ISite, data: ISiteData, runId: string, output: string, status: IRun["status"] = "succeeded") {
	const r = data.runs.find((x) => x.id === runId);
	if (!r || (r.status !== "running" && r.status !== "queued")) return;
	r.status = status;
	r.output = output;
	r.durationSec = Math.max(1, Math.round((now().getTime() - new Date(r.startedAt).getTime()) / 1000));
	r.costUsd = status === "succeeded" ? round2(r.estimateUsd * 0.94) : round2(r.estimateUsd * 0.1);
	r.tokens = r.budget === "image" ? 0 : Math.round(r.costUsd * 52000);
	if (r.budget === "image") site.budgets.imageUsd = round2(site.budgets.imageUsd + r.costUsd);
	else site.budgets.textUsd = round2(site.budgets.textUsd + r.costUsd);
}

function warnIfNearCap(data: ISiteData, c: ICapCheck) {
	if (c.status === "warn") notify(data, "human", `${cap1(c.budget)} budget at ${c.pct}% of cap`, `${fmtUsd(c.afterUsd)} of ${fmtUsd(c.capUsd)} after this run. Runs over the cap are refused.`, "/settings");
}

function addVersion(post: IPost, origin: IPost["versions"][number]["origin"], who: string, note?: string) {
	const n = post.versions.reduce((m, v) => Math.max(m, v.n), 0) + 1;
	post.versions.push({ id: uid("v"), n, origin, actor: who, at: nowIso(), words: post.words, blocks: clone(post.blocks), seoTitle: post.seoTitle, ...(note ? { note } : {}) });
}

function setState(post: IPost, to: TPostState) {
	post.state = to;
	post.owner = STATE_OWNER[to];
	post.daysInState = 0;
	if (to !== "drafting" && to !== "needs-assets") delete post.progress;
}

const autopostOn = (site: ISite) => !!site.publishing?.autopost;

/**
 * Needs assets exits when every slot is filled (autopost off → In review). Under autopost the CMS agent's gate runs
 * as soon as nothing is still generating and no person is holding a human-only slot; the gate fills the rest.
 */
function maybeAdvanceAssets(d: ICmsState, siteId: string, postId: string, toasts: TToastIn[]) {
	const data = d.data[siteId];
	const post = data.posts.find((p) => p.id === postId);
	if (!post || post.state !== "needs-assets") return;
	const slots = data.slots.filter((s) => s.postId === postId);
	if (autopostOn(siteOf(d, siteId))) {
		if (slots.some((s) => s.status === "generating" || (s.status === "human-only" && s.humanPinned))) return;
		scheduleAutopostGate(d, siteId, post);
		return;
	}
	if (!slots.length || !slots.every(isFilled)) return;
	setState(post, "in-review");
	notify(data, "human", "Approval requested", `${post.title} has every slot filled and is ready for review.`, `/approvals?post=${post.id}`);
	audit(data, "CMS agent", "moved to In review", post.title, "Every image slot filled");
	toasts.push({ text: `Every slot filled · ${post.title} moved to In review`, tone: "pass", href: `/approvals?post=${post.id}` });
}

function closeLedgerFor(data: ISiteData, match: (l: ILedgerItem) => boolean) {
	for (const l of data.ledger) if (!l.done && match(l)) l.done = true;
}

// ─── Autopost pipeline (C10/C11) ─────────────────────────────────────────────

function scheduleAutopostGate(d: ICmsState, siteId: string, post: IPost) {
	if (d.jobs.some((j) => j.kind === "autopost-gate" && j.siteId === siteId && j.payload.postId === post.id)) return;
	post.progress = { label: "Autopost · the CMS agent is running the gate", value: 95 };
	pushJob(d, siteId, "autopost-gate", SIM_MS.gate, { postId: post.id });
}

/** The visual-asset agent picks a candidate (the one already selected, else the first) and records provenance. */
function agentPickCandidate(data: ISiteData, slot: IImageSlot) {
	if (!slot.candidates.length) return;
	const pick = slot.candidates.find((c) => c.selected) ?? slot.candidates[0];
	for (const c of slot.candidates) {
		c.selected = c.id === pick.id;
		if (!c.source) c.source = { kind: slot.provider === "inline-svg" ? "diagram" : "generated", provider: slot.provider, model: slot.model };
	}
	slot.status = "selected";
	closeLedgerFor(data, (l) => l.slotId === slot.id);
	audit(data, VISUAL_AGENT, "selected asset", slot.name, `${pick.label} · ${slot.provider} · ${slot.model} · autopost`);
}

/** The visual-asset agent fills an empty or human-only slot itself (generate → pick). Charts never reach here. */
function agentFillSlot(data: ISiteData, slot: IImageSlot) {
	const routed = data.routing[slot.type];
	const provider: TProvider = slot.type === "diagram" ? "inline-svg" : routed && routed !== "human" && routed !== "inline-svg" ? routed : "open-source";
	slot.provider = provider;
	slot.model = provider === "higgsfield" ? "higgsfield-preset" : provider === "openai" ? "openai-image" : provider === "inline-svg" ? "inline-svg" : "flux-dev";
	slot.candidates = makeCandidates(`${slot.id}-auto`, [0, 1, 2].map((i) => hueFor(slot.id + slot.prompt, i)), 0).map((c) => ({
		...c,
		source: { kind: provider === "inline-svg" ? ("diagram" as const) : ("generated" as const), provider, model: slot.model },
	}));
	slot.status = "selected";
	slot.generatedAt = nowIso();
	delete slot.humanPinned;
	closeLedgerFor(data, (l) => l.slotId === slot.id);
	audit(data, VISUAL_AGENT, provider === "inline-svg" ? "drew diagram" : "generated and selected asset", slot.name, `${provider} · ${slot.model} · autopost`);
}

/** Candidates just landed on a slot: under autopost the visual-asset agent picks one and the pipeline moves on. */
function onCandidatesArrived(d: ICmsState, siteId: string, slot: IImageSlot, toasts: TToastIn[]) {
	const data = d.data[siteId];
	const post = data.posts.find((p) => p.id === slot.postId);
	if (!autopostOn(siteOf(d, siteId)) || !post || post.state !== "needs-assets") return;
	agentPickCandidate(data, slot);
	maybeAdvanceAssets(d, siteId, post.id, toasts);
}

/** Autopost degrades to human review: the post waits In review with a ledger item. It never ships around a block. */
function holdPost(d: ICmsState, siteId: string, post: IPost, reason: string, toasts: TToastIn[]) {
	const data = d.data[siteId];
	delete post.progress;
	if (post.state !== "in-review") setState(post, "in-review");
	closeLedgerFor(data, (l) => l.postId === post.id && l.kind === "autopost-hold");
	data.ledger.unshift({ id: uid("l"), title: `Autopost held: ${reason}`, owner: memberNameFor(d, siteId, "specialist"), createdAt: nowIso(), ageDays: 0, downstream: "holds 1 post in In review", postId: post.id, kind: "autopost-hold" });
	audit(data, AUTOPOST_ACTOR, "held autopost", post.title, reason);
	notify(data, "human", "Autopost held a post", `${post.title} · ${reason}. It waits in Approvals for a person.`, `/approvals?post=${post.id}`);
	toasts.push({ text: `Autopost held · ${reason}`, tone: "human", href: `/approvals?post=${post.id}` });
}

/** Apply one agent fix to a failing hard on-page check (only the ones AGENT_FIXABLE_CHECKS lists). */
function agentFixCheck(post: IPost, checkId: string, keyword: string) {
	const c = post.gate.find((x) => x.id === checkId);
	if (checkId === "kw-first-100") {
		const intro = post.blocks.find((b) => b.kind === "p");
		if (intro && !intro.text.toLowerCase().includes(keyword.toLowerCase())) {
			intro.text = `If you're searching for ${keyword}, here's the short answer. ${intro.text}`;
			post.words += 9;
		}
		if (c) Object.assign(c, { status: "pass", value: "Word 9" });
	} else if (checkId === "title-length") {
		let t = "";
		for (const w of post.seoTitle.split(/\s+/)) if (`${t} ${w}`.trim().length <= 60) t = `${t} ${w}`.trim();
		post.seoTitle = t || post.seoTitle.slice(0, 60);
		if (c) Object.assign(c, { status: "pass", value: `${post.seoTitle.length} / 60` });
	} else if (c) Object.assign(c, { status: "pass", value: checkId === "meta-description" ? "148 ch" : c.value });
}

/**
 * The auto-gate, run by the CMS agent on behalf of nobody: fixes what it can (rewrite unsourced claims, on-page fixes,
 * fill slots, accept soft blocks with a logged reason), then approves and opens the MR — or holds the post for a person.
 */
function runAutopostGate(d: ICmsState, siteId: string, postId: string, toasts: TToastIn[]): TResult {
	const data = d.data[siteId];
	const site = siteOf(d, siteId);
	const post = data.posts.find((p) => p.id === postId);
	if (!post) return { ok: false, reason: "Post not found" };
	delete post.progress;
	const manifest = activeManifest(data);
	const decision = autopostDecision(post, evaluateGate(post, data.slots, manifest), site);
	if (decision.action === "hold") {
		holdPost(d, siteId, post, decision.reason!, toasts);
		return { ok: false, reason: `Autopost held: ${decision.reason}` };
	}
	const at = nowIso();
	const keyword = data.keywords.find((k) => k.id === post.keywordId)?.term ?? post.title;
	let textUsd = 0;
	let imageUsd = 0;
	let edits = 0;
	let accepted = 0;
	for (const fix of decision.plan) {
		if (fix.budget === "text") textUsd += fix.usd;
		else imageUsd += fix.usd;
		switch (fix.kind) {
			case "fact": {
				const f = post.facts.find((x) => x.id === fix.id);
				if (!f) break;
				const b = post.blocks.find((x) => x.factMarkerIds?.includes(f.id)) ?? post.blocks.find((x) => x.text.includes(f.claim));
				if (b) {
					const before = b.text;
					b.text = rewriteWithout(b.text, f.claim);
					post.words = Math.max(0, post.words + countWords(b.text) - countWords(before));
				}
				f.status = "resolved";
				f.note = `No citable source found · rewritten without the claim by the ${AUTOPOST_ACTOR}.`;
				for (const x of post.blocks) if (x.factMarkerIds) x.factMarkerIds = x.factMarkerIds.filter((id) => id !== f.id);
				audit(data, AUTOPOST_ACTOR, "rewrote unsourced claim", post.title, `"${f.claim}" · autopost`);
				edits++;
				break;
			}
			case "check":
				agentFixCheck(post, fix.id, keyword);
				audit(data, AUTOPOST_ACTOR, "fixed check", post.title, `${fix.label} · autopost`);
				edits++;
				break;
			case "soft-fix": {
				const text = (post.regulated && data.brandPack.disclaimers[post.regulated]) || `This article is general information, not ${post.regulated ?? "professional"} advice.`;
				post.blocks.push({ id: uid("b"), kind: "disclaimer", text });
				audit(data, AUTOPOST_ACTOR, "fixed check", post.title, `${fix.label} · autopost`);
				edits++;
				break;
			}
			case "soft-accept": {
				const check = gateChecks(post).find((c) => c.id === fix.id);
				if (!check) break;
				const override = { reason: AUTOPOST_SOFT_REASON, by: AUTOPOST_ACTOR, at };
				const existing = post.gate.find((c) => c.id === fix.id);
				if (existing) existing.override = override;
				else post.gate.push({ ...check, override });
				audit(data, AUTOPOST_ACTOR, "accepted soft block", post.title, `${check.label} ${check.value} · "${AUTOPOST_SOFT_REASON}"`);
				accepted++;
				break;
			}
			case "slot": {
				const slot = data.slots.find((s) => s.id === fix.id);
				if (!slot) break;
				if (slot.status === "candidates") agentPickCandidate(data, slot);
				else agentFillSlot(data, slot);
				break;
			}
		}
	}
	if (edits) addVersion(post, "agent-edit", AUTOPOST_ACTOR, `Autopost · ${edits} fix${edits > 1 ? "es" : ""} before shipping`);
	if (textUsd > 0) {
		const r = startRun(data, "post-generation", "scheduled", { usd: round2(textUsd), budget: "text", tier: "workhorse" }, { postId, agent: "CMS agent", output: "Autopost gate fixes" });
		finishRun(site, data, r.id, `Autopost gate · ${edits} fix${edits === 1 ? "" : "es"}`);
	}
	if (imageUsd > 0) {
		const r = startRun(data, "image-generation", "scheduled", { usd: round2(imageUsd), budget: "image", tier: "workhorse" }, { postId, agent: VISUAL_AGENT, output: "Filling slots for autopost" });
		finishRun(site, data, r.id, "Slots filled for autopost");
	}
	// Re-check after the fixes: never ship around a block.
	const after = evaluateGate(post, data.slots, manifest);
	if (!after.canApprove || !manifest) {
		const reason = after.hard[0] ?? "A soft block has no logged reason";
		holdPost(d, siteId, post, reason, toasts);
		return { ok: false, reason: `Autopost held: ${reason}` };
	}
	if (post.state !== "in-review") setState(post, "in-review");
	const detail = [`${decision.fixes.length - accepted} agent fix${decision.fixes.length - accepted === 1 ? "" : "es"}`, `${accepted} soft block${accepted === 1 ? "" : "s"} accepted`].join(" · ");
	const mr = openMergeRequest(d, siteId, postId, after, manifest, AUTOPOST_ACTOR, { explicit: {}, autopost: true, approvalDetail: `Autopost · ${detail}` });
	toasts.push({ text: `Autopost shipped · MR ${mrRef({ number: mr.number, host: mr.host })} opened · ${post.title}`, tone: "agent", href: "/merge-requests" });
	return { ok: true, id: mr.id };
}

/** Opens the MR for an approved post (human approval or autopost). Mutates the draft; returns the MR. */
function openMergeRequest(
	d: ICmsState,
	siteId: string,
	postId: string,
	gate: IGateResult,
	manifest: ITemplateManifest,
	who: string,
	opts: { explicit: Record<string, string>; autopost?: boolean; approvalDetail?: string },
): IMergeRequest {
	const dd = d.data[siteId];
	const s = siteOf(d, siteId);
	const repo = s.repo!;
	const p = dd.posts.find((x) => x.id === postId)!;
	const at = nowIso();
	// Persist the overrides onto the post (derived checks get upserted) and log each one typed at approval.
	for (const c of gate.soft) {
		const reason = c.override!.reason;
		const existing = p.gate.find((x) => x.id === c.id);
		if (existing && !existing.override) existing.override = { reason, by: who, at };
		if (!existing) p.gate.push({ ...c, override: { reason, by: who, at } });
		if (opts.explicit[c.id]) audit(dd, who, "overrode soft block", p.title, `${c.label} ${c.value} · "${reason}"`);
	}
	const number = dd.mergeRequests.reduce((m, x) => Math.max(m, x.number), 0) + 1;
	const ext = { mdx: "mdx", html: "html", json: "json", component: "tsx" }[manifest.output];
	const slots = dd.slots.filter((x) => x.postId === postId && isFilled(x));
	const raster = slots.filter((x) => x.format !== "svg").length;
	const files: IMergeRequest["files"] = [{ path: `${repo.contentDir}/${p.slug}.${ext}`, change: `+${Math.max(40, Math.round(p.words / 7.6))}`, kind: "post" }];
	if (slots.length) files.push({ path: `${repo.assetDir}/ · ${raster} WebP${slots.length > raster ? ` · ${slots.length - raster} SVG` : ""}`, change: `${raster * 78} KB`, kind: "assets" });
	files.push({ path: "public/sitemap.xml", change: "+1", kind: "index" });
	const overrideLines = gate.soft.map((c) => `${c.label} ${c.value}: ${c.override!.reason}`);
	const kw = dd.keywords.find((k) => k.id === p.keywordId);
	const schema = p.gate.find((c) => c.id === "schema")?.value ?? "Article";
	const internal = p.gate.find((c) => c.id === "internal-links")?.value.replace(" · soft", "") ?? "—";
	const branch = repo.branchPattern.replace("{slug}", p.slug);
	const mr: IMergeRequest = {
		id: uid("mr"),
		number,
		host: repo.host,
		branch,
		base: repo.baseBranch,
		status: "open",
		ci: "pending",
		previewUrl: `https://${s.domain.split(".")[0]}-git-${branch.replace(/\//g, "-")}.vercel.app${postUrl(p)}`,
		files,
		openedAt: at,
		overrides: overrideLines,
		postId,
		title: `content: add ${p.title}`,
		description: [
			`**Keyword** ${kw?.term ?? p.title}  `,
			`**Intent** ${cap1(p.intent)}  `,
			`**On-page** ${gate.passed} / ${gate.total}${overrideLines.length ? ` · ${overrideLines.length} override${overrideLines.length > 1 ? "s" : ""}` : ""}  `,
			`**Internal links** ${internal}  `,
			`**Schema** ${schema}`,
			opts.autopost ? `**Shipped by** ${AUTOPOST_ACTOR} · no human review (site autopost is on)` : "",
			overrideLines.length ? `\n**Unresolved (soft gate overridden)**\n${overrideLines.map((o) => `- ${o}`).join("\n")}` : "",
			`\nWrites only to \`${repo.contentDir}\` and \`${repo.assetDir}\`. Never pushes to ${repo.baseBranch}. CI runs the repo's own checks.`,
		]
			.filter(Boolean)
			.join("\n"),
		manifestVersion: manifest.version,
		...(opts.autopost ? { autopost: true } : {}),
	};
	dd.mergeRequests.unshift(mr);
	setState(p, "mr-open");
	p.mrId = mr.id;
	closeLedgerFor(dd, (l) => l.postId === postId && (/review/i.test(l.title) || l.kind === "autopost-hold"));
	audit(dd, who, "approved", p.title, opts.approvalDetail ?? `Facts, voice and brand asserted · ${overrideLines.length} override${overrideLines.length === 1 ? "" : "s"}`);
	audit(dd, opts.autopost ? AUTOPOST_ACTOR : "CMS agent", "opened MR", `${mrRef({ number, host: repo.host })} ${branch}`, `${repo.host === "github" ? "GitHub" : "GitLab"} · ${repo.baseBranch} · manifest v${manifest.version}`);
	notify(dd, "ink", `MR #${number} opened${opts.autopost ? " by autopost" : ""}`, `${p.title} · ${branch} → ${repo.baseBranch}`, "/merge-requests");
	pushJob(d, siteId, "ci-result", SIM_MS.ci, { mrId: mr.id, result: "passing" });
	return mr;
}

/** Merge an open, green MR (developer, or autopost on green CI). The post goes Live; KAS recalculates in 24 h. */
function mergeInDraft(d: ICmsState, siteId: string, mrId: string, who: string) {
	const dd = d.data[siteId];
	const s = siteOf(d, siteId);
	const m = dd.mergeRequests.find((x) => x.id === mrId)!;
	const at = nowIso();
	m.status = "merged";
	m.mergedAt = at;
	m.mergedBy = who;
	const p = m.postId ? dd.posts.find((x) => x.id === m.postId) : undefined;
	if (p) {
		setState(p, "live");
		const pl = dd.pillars.find((x) => x.id === p.pillarId);
		if (pl) pl.livePosts++;
	}
	const est = estimateRun("kas-recalc", s);
	const r = startRun(dd, "kas-recalc", "scheduled", est, { status: "queued", startedAt: addHours(at, 24), postId: p?.id, output: "Scheduled · 24 h after merge" });
	pushJob(d, siteId, "run-complete", 24 * 3600000, { runId: r.id, postId: p?.id ?? null, long: true });
	const sched = dd.schedules.find((x) => x.kind === "kas-recalc");
	if (sched) sched.nextAt = addHours(at, 24);
	audit(dd, who, "merged", `${mrRef(m)} ${m.branch}`, `Post is Live · scoring run scheduled for ${fmtDate(addHours(at, 24))}${m.autopost ? " · auto-merged on green CI" : ""}`);
	notify(
		dd,
		"pass",
		`${mrRef(m)} merged · ${p?.title ?? m.branch} is Live`,
		`Attribution recalculates in 24 h. ${s.searchConsole === "connected" ? "URL submitted for indexing." : "Search Console not connected: indexing request skipped."}`,
		"/seo",
	);
}

/** Start a draft run (manual Generate now, or the agents after an approved idea under autopost). */
function startGeneration(d: ICmsState, siteId: string, postId: string, est: IEstimate, c: ICapCheck, who: string, trigger: IRun["trigger"]) {
	const dd = d.data[siteId];
	const p = dd.posts.find((x) => x.id === postId)!;
	const refresh = p.state === "decaying";
	setState(p, "drafting");
	if (refresh) p.source = "refresh";
	p.progress = { label: "Reading brief and brand pack", value: 4 };
	const r = startRun(dd, "post-generation", trigger, est, { postId, output: p.progress.label });
	pushJob(d, siteId, "draft-progress", SIM_MS.tick, { postId, runId: r.id, step: 1, refresh });
	audit(dd, who, "triggered run", "Post generation", `${p.title} · ${est.tier} model · est. ${fmtUsd(est.usd)}`);
	warnIfNearCap(dd, c);
}

// ─── Deterministic "agent" text ──────────────────────────────────────────────

const FILLER: [RegExp, string][] = [
	[/Once the anaesthetic starts to wear off, which for most people is somewhere between two and four hours after you leave, you may/, "As the anaesthetic wears off, two to four hours later, you may"],
	[/,? which for most people is somewhere/g, ""],
	[/\bin order to\b/g, "to"],
	[/\b(really|very|just|actually|basically) /g, ""],
	[/\bstarts to wear off\b/g, "wears off"],
	[/\bit is important to note that /gi, ""],
];

export function tighten(text: string): string {
	let out = text;
	for (const [re, rep] of FILLER) out = out.replace(re, rep);
	if (out !== text) return out;
	const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
	if (sentences.length > 1) return sentences.slice(0, -1).join("").trim();
	const words = text.split(/\s+/);
	return `${words.slice(0, Math.max(6, Math.ceil(words.length * 0.8))).join(" ").replace(/[,;:]$/, "")}.`;
}

type TProposal = Pick<IAgentSuggestion, "instruction" | "blockId" | "before" | "after"> & Partial<Pick<IAgentSuggestion, "fixesCheckId" | "resolvesFactId" | "insertKind">>;

const textBlocks = (post: IPost) => post.blocks.filter((b) => b.kind === "p");
const lastContentBlock = (post: IPost) => [...post.blocks].reverse().find((b) => b.kind !== "disclaimer" && b.kind !== "image") ?? post.blocks[post.blocks.length - 1];

/** What the agent proposes for a free-text instruction. Never applied until accepted. */
export function proposeEdit(post: IPost, keyword: string, instruction: string, blockId?: string): TProposal | null {
	const target = (blockId && post.blocks.find((b) => b.id === blockId)) || [...textBlocks(post)].sort((a, b) => b.text.length - a.text.length)[0];
	const i = instruction.toLowerCase();
	if (/faq/.test(i)) {
		const anchor = lastContentBlock(post);
		if (!anchor) return null;
		return {
			instruction,
			blockId: anchor.id,
			before: "",
			after: `What does ${keyword} involve?\nYour clinician explains every step at the first consultation, with a written plan and price.\nHow soon can I start?\nMost patients start within two weeks of the consultation.`,
			insertKind: "faq",
			fixesCheckId: post.gate.some((c) => c.id === "faq" && c.status !== "pass") ? "faq" : undefined,
		};
	}
	if (/keyword|intro/.test(i)) {
		const intro = textBlocks(post)[0];
		if (!intro) return null;
		return { instruction, blockId: intro.id, before: intro.text, after: `If you're searching for ${keyword}, here's the short answer. ${intro.text}`, fixesCheckId: "kw-first-100" };
	}
	if (!target) return null;
	if (/angle/.test(i)) return { instruction, blockId: target.id, before: target.text, after: `From the patient's side of the chair: ${target.text[0].toLowerCase()}${target.text.slice(1)}` };
	const after = tighten(target.text);
	if (after === target.text) return null;
	// Diff only the changed prefix when possible, so the UI can show a tight before/after.
	const seededPhrase = FILLER[0][0].exec(target.text)?.[0];
	if (seededPhrase) return { instruction, blockId: target.id, before: seededPhrase, after: FILLER[0][1] };
	return { instruction, blockId: target.id, before: target.text, after };
}

function rewriteWithout(text: string, claim: string): string {
	const softened = claim.replace(/^(around|about|over|nearly|almost)?\s*\d+(\.\d+)?%\s+of\s+/i, "Most ");
	if (softened !== claim) return text.replace(claim, softened);
	const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
	return sentences.filter((s) => !s.includes(claim)).join("").trim() || text.replace(claim, "").trim();
}

function generatedBlocks(post: IPost, keyword: string, disclaimer: string | undefined, heroSlot: string, chartSlot: string): IPostBlock[] {
	const sections: Record<IPost["contentType"], string[]> = {
		guide: ["The short answer", "What it involves", "What it costs", "How to choose a clinic", "Frequently asked questions"],
		comparison: ["The short answer", "Side by side", "Cost over time", "Which one suits you", "Frequently asked questions"],
		listicle: ["How we chose", "Our picks", "What to avoid", "Frequently asked questions"],
		"how-to": ["Before you start", "Step by step", "Common mistakes", "Frequently asked questions"],
		faq: ["The quick answers", "When to see a dentist", "Frequently asked questions"],
		pillar: ["What it is", "Who it's for", "The process", "Costs and payment", "Risks and recovery", "Choosing a clinic", "Frequently asked questions"],
		"money-page": ["Prices", "What's included", "Payment plans", "Book a consultation"],
	};
	const id = (s: string) => uid(`${post.id}-${s}`);
	const blocks: IPostBlock[] = [
		{ id: id("intro"), kind: "p", text: `${cap1(keyword)}: here is what our clinicians tell patients every week, in plain language, with current prices and what to expect.` },
		{ id: id("img"), kind: "image", text: heroSlot },
	];
	for (const h of sections[post.contentType]) {
		blocks.push({ id: id("h2"), kind: "h2", text: h });
		if (h === "Frequently asked questions")
			blocks.push({ id: id("faq"), kind: "faq", text: `How long does it take?\nMost patients finish within a few weeks.\nIs it painful?\nYou'll be numb for the procedure; mild tenderness afterwards is normal.` });
		else blocks.push({ id: id("p"), kind: "p", text: `${h}. What it means for you, what it costs, and the questions worth asking before you commit.` });
	}
	blocks.splice(4, 0, { id: id("chart"), kind: "image", text: chartSlot });
	if (post.requires?.includes("table")) blocks.push({ id: id("table"), kind: "p", text: "[Comparison table: rendered from the post's structured data]" });
	if (disclaimer) blocks.push({ id: id("disc"), kind: "disclaimer", text: disclaimer });
	return blocks;
}

/** Blocks from a real Claude draft: direct answer, hero after it, chart after the first section's first paragraph. */
function liveBlocks(post: IPost, draft: ILiveDraft, disclaimer: string | undefined, heroSlot: string, chartSlot: string): IPostBlock[] {
	const id = (s: string) => uid(`${post.id}-${s}`);
	const clean = (t: string) => t.replace(/\*\*|^#+\s*/gm, "").trim();
	const blocks: IPostBlock[] = [
		{ id: id("intro"), kind: "p", text: clean(draft.direct_answer) },
		{ id: id("img"), kind: "image", text: heroSlot },
	];
	for (const b of draft.blocks) if (b.text.trim()) blocks.push({ id: id(b.kind), kind: b.kind, text: clean(b.text) });
	const firstH2 = blocks.findIndex((b) => b.kind === "h2");
	const afterFirst = firstH2 >= 0 ? blocks.findIndex((b, i) => i > firstH2 && b.kind !== "h2" && b.kind !== "h3") : -1;
	blocks.splice(afterFirst >= 0 ? afterFirst + 1 : blocks.length, 0, { id: id("chart"), kind: "image", text: chartSlot });
	if (disclaimer) blocks.push({ id: id("disc"), kind: "disclaimer", text: disclaimer });
	return blocks;
}

/** Claims Claude couldn't attribute become open [VERIFY] markers on the block that contains them (max 5). */
function liveFacts(blocks: IPostBlock[], draft: ILiveDraft): IFactMarker[] {
	const facts: IFactMarker[] = [];
	for (const claim of draft.unverified_claims.slice(0, 5)) {
		const c = claim.trim();
		const block = c ? blocks.find((b) => b.kind !== "image" && b.text.includes(c)) : undefined;
		if (!block) continue;
		const fid = uid("f");
		block.factMarkerIds = [...(block.factMarkerIds ?? []), fid];
		facts.push({ id: fid, claim: c, status: "open", note: `Claude couldn't attribute "${c}" to a source. Verify it or rewrite without it.` });
	}
	return facts;
}

const countBlockWords = (blocks: IPostBlock[]) => blocks.filter((b) => b.kind !== "image").reduce((n, b) => n + (b.text.match(/\S+/g)?.length ?? 0), 0);

const SWARM_POOL: Record<string, [string, string, IKeyword["intent"], IPost["contentType"]][]> = {
	lumen: [
		["pediatric dental sealants: are they worth it?", "p-pediatric", "informational", "faq"],
		["dental bonding cost in lagos", "p-cosmetic", "commercial", "money-page"],
		["invisalign attachments explained", "p-ortho", "informational", "guide"],
		["tooth extraction aftercare", "p-general", "informational", "how-to"],
		["bone graft for implants: cost and recovery", "p-implants", "commercial", "guide"],
		["kids' first orthodontic check", "p-pediatric", "informational", "guide"],
	],
	northwind: [
		["redundancy pay calculator explained", "pl-employment", "informational", "how-to"],
		["section 21 notice changes", "pl-property", "informational", "guide"],
		["spouse visa financial requirement", "pl-immigration", "commercial", "guide"],
	],
};

// ─── Job reducer (the simulated outside world) ───────────────────────────────

function applyJob(d: ICmsState, job: IJob, toasts: TToastIn[]) {
	const data = d.data[job.siteId];
	const site = siteOf(d, job.siteId);
	if (!data || !site) return;
	const p = job.payload;
	const post = typeof p.postId === "string" ? data.posts.find((x) => x.id === p.postId) : undefined;

	switch (job.kind) {
		case "draft-progress": {
			if (!post || post.state !== "drafting") return;
			const step = Number(p.step);
			const run = data.runs.find((r) => r.id === p.runId);
			if (step === 1) {
				const kw = data.keywords.find((k) => k.id === post.keywordId)?.term ?? post.title;
				requestLiveDraft(post.id, {
					siteName: site.name,
					industry: site.industry,
					voice: data.brandPack.voice,
					keyword: kw,
					title: post.seoTitle || post.title,
					contentType: post.contentType,
					intent: post.intent,
					wordTarget: post.wordTarget,
					regulated: post.regulated,
					disclaimer: post.regulated ? data.brandPack.disclaimers[post.regulated] : undefined,
				});
			}
			if (step > 7 && peekLiveDraft(post.id) === "waiting") {
				post.progress = { label: "Claude is writing the draft", value: 85 };
				pushJob(d, job.siteId, "draft-progress", SIM_MS.tick * 2, { ...p, step: 8 });
			} else if (step <= 7) {
				post.progress = { label: `Writing section ${step} of 7`, value: Math.round((step / 7) * 80) };
				pushJob(d, job.siteId, "draft-progress", SIM_MS.tick, { ...p, step: step + 1 });
			} else {
				post.progress = { label: "Image sheet · 2 slots", value: 90 };
				pushJob(d, job.siteId, "draft-complete", SIM_MS.tick, p);
			}
			if (run) run.output = post.progress.label;
			return;
		}
		case "draft-complete": {
			if (!post || post.state !== "drafting") return;
			const keyword = data.keywords.find((k) => k.id === post.keywordId)?.term ?? post.title;
			const heroId = uid("s-hero");
			const chartId = uid("s-chart");
			const heroProvider: TProvider = data.routing.hero;
			const hero = makeSlot({
				id: heroId,
				postId: post.id,
				name: "Hero",
				type: "hero",
				placement: "Top of post",
				filename: `${post.slug}-hero.webp`,
				alt: `${cap1(keyword)} at Lumen-style clinic, illustrative`.replace("Lumen-style", site.name),
				prompt: `${cap1(keyword)}, ${data.brandPack.styleKeywords.join(", ")}, no identifiable real person.`,
				styleKeywords: data.brandPack.styleKeywords,
				provider: heroProvider,
				model: heroProvider === "higgsfield" ? "higgsfield-preset" : heroProvider === "openai" ? "openai-image" : heroProvider === "open-source" ? "flux-dev" : "—",
				status: heroProvider === "human" ? "human-only" : "generating",
			});
			const chart = makeSlot({
				id: chartId,
				postId: post.id,
				name: "Data chart",
				type: "chart",
				placement: "After the first section",
				filename: `${post.slug}-chart.svg`,
				alt: `Chart for ${keyword}, rendered from the post's data`,
				prompt: "Rendered from the post's own data. Never generated.",
				provider: "inline-svg",
				model: "inline-svg",
				status: "selected",
				candidates: [{ id: `${chartId}-c1`, label: "rendered from post data", hue: 174, selected: true }],
				generatedAt: nowIso(),
			});
			data.slots.push(hero, chart);
			const disclaimer = post.regulated ? data.brandPack.disclaimers[post.regulated] ?? `This article is general information, not ${post.regulated} advice.` : undefined;
			const live = takeLiveDraft(post.id);
			if (live.status === "failed" && !live.silent) toasts.push({ text: `Live draft unavailable (${live.reason}) · used a simulated draft`, tone: "block" });
			const liveDraft = live.status === "done" ? live.draft : undefined;
			post.blocks = liveDraft ? liveBlocks(post, liveDraft, disclaimer, heroId, chartId) : generatedBlocks(post, keyword, disclaimer, heroId, chartId);
			// Regulated topics: the writer leaves a statistic it couldn't source as an open fact marker (never invented).
			post.facts = liveDraft ? liveFacts(post.blocks, liveDraft) : [];
			if (liveDraft && liveDraft.seo_title.length <= 70) post.seoTitle = liveDraft.seo_title;
			const statBlock = !liveDraft && post.regulated ? post.blocks.filter((b) => b.kind === "p")[1] : undefined;
			if (statBlock) {
				const claim = "9 in 10 patients";
				const fid = uid("f");
				statBlock.text = `${statBlock.text} ${cap1(claim)} are back to their normal routine within 48 hours.`;
				statBlock.factMarkerIds = [fid];
				post.facts.push({ id: fid, claim: cap1(claim), status: "open", note: `The agent found no citable source for "${claim}".` });
			}
			post.words = liveDraft ? countBlockWords(post.blocks) : post.wordTarget + 40;
			post.gate = gate12({ titleCh: Math.min(60, post.seoTitle.length), density: "1.1% · 9 uses", headings: `H1 · ${post.blocks.filter((b) => b.kind === "h2").length}×H2`, internal: 1, faq: 2, schema: "Article, FAQPage", images: 2 });
			post.slotIds = [heroId, chartId];
			post.suggestions = [];
			addVersion(post, p.refresh ? "refresh" : "agent-generation", RUN_META["post-generation"].agent, p.refresh ? "Refresh cycle draft" : "First draft from brief");
			setState(post, "needs-assets");
			if (hero.status === "generating") {
				post.progress = { label: `${hero.provider === "higgsfield" ? "Higgsfield" : hero.provider === "openai" ? "OpenAI" : "Flux"} returning 4 candidates`, value: 60 };
				const imgRun = startRun(data, "image-generation", "scheduled", { usd: hero.estimateUsd, budget: "image", tier: "workhorse" }, { postId: post.id, slotId: heroId, model: hero.model, output: "Generating candidates" });
				pushJob(d, job.siteId, "slot-candidates", SIM_MS.candidates, { slotId: heroId, runId: imgRun.id });
			}
			finishRun(site, data, String(p.runId), `Draft v${post.versions.length} · ${post.words.toLocaleString("en-US")} words · 2 slots${liveDraft ? ` · ${liveDraft.model} · ${(liveDraft.inputTokens + liveDraft.outputTokens).toLocaleString("en-US")} tokens` : ""}`);
			audit(data, RUN_META["post-generation"].agent, "generated draft", post.title, `${post.words} words · 2 image slots${post.facts.length ? ` · ${post.facts.length} fact marker${post.facts.length > 1 ? "s" : ""}` : ""}${liveDraft ? ` · written by ${liveDraft.model} · information gain: ${liveDraft.information_gain}` : ""}`);
			toasts.push({ text: `Draft ready · ${post.title}`, tone: "agent", href: `/posts/${post.id}` });
			if (hero.status !== "generating") maybeAdvanceAssets(d, job.siteId, post.id, toasts);
			return;
		}
		case "suggestion-ready": {
			if (!post) return;
			const s: IAgentSuggestion = {
				id: uid("sg"),
				instruction: String(p.instruction),
				blockId: String(p.blockId),
				before: String(p.before ?? ""),
				after: String(p.after),
				status: "pending",
				createdAt: nowIso(),
			};
			if (typeof p.fixesCheckId === "string") s.fixesCheckId = p.fixesCheckId;
			if (typeof p.resolvesFactId === "string") s.resolvesFactId = p.resolvesFactId;
			if (typeof p.insertKind === "string") s.insertKind = p.insertKind as IPostBlock["kind"];
			post.suggestions.push(s);
			finishRun(site, data, String(p.runId), `Agent edit ready · "${s.instruction}"`);
			toasts.push({ text: `Agent edit ready · "${s.instruction}"`, tone: "agent", href: `/posts/${post.id}` });
			return;
		}
		case "slot-candidates": {
			const s = data.slots.find((x) => x.id === p.slotId);
			if (!s || s.status !== "generating") return;
			s.candidates = makeCandidates(`${s.id}-${Date.now().toString(36)}`, [0, 1, 2, 3].map((i) => hueFor(s.id + s.prompt, i)));
			s.status = "candidates";
			s.generatedAt = nowIso();
			const owner = data.posts.find((x) => x.id === s.postId);
			if (owner?.progress && /candidates/.test(owner.progress.label)) delete owner.progress;
			for (const c of s.candidates) c.source = { kind: "generated", provider: s.provider, model: s.model };
			finishRun(site, data, String(p.runId), `4 candidates · ${s.name}`);
			toasts.push({ text: `4 candidates ready · ${s.name}`, tone: "agent", href: `/posts/${s.postId}/assets?slot=${s.id}` });
			onCandidatesArrived(d, job.siteId, s, toasts);
			return;
		}
		case "autopost-brief": {
			if (!post || post.state !== "briefed" || !autopostOn(site)) return;
			const strong = post.strongModel || post.contentType === "pillar" || post.contentType === "money-page";
			const est = estimateRun("post-generation", site, { strongModel: strong });
			const c = checkCap(site, "post-generation", est);
			if (c.status === "refused") {
				refuseRun(data, "post-generation", "scheduled", est, c, AUTOPOST_ACTOR, { postId: post.id });
				data.ledger.unshift({ id: uid("l"), title: `Autopost held: over the text cap · ${post.title}`, owner: memberNameFor(d, job.siteId, "admin"), createdAt: nowIso(), ageDays: 0, downstream: "holds 1 post in Briefed", postId: post.id, kind: "autopost-refused" });
				toasts.push({ text: `Drafting held · ${c.message}`, tone: "block", href: "/runs" });
				return;
			}
			startGeneration(d, job.siteId, post.id, est, c, AUTOPOST_ACTOR, "scheduled");
			toasts.push({ text: `Drafting · ${post.title}`, tone: "agent", href: `/posts/${post.id}` });
			return;
		}
		case "autopost-gate": {
			// A person may have moved the post on meanwhile (sent it to review, marked a slot human-only).
			if (!post || post.state !== "needs-assets") return;
			if (!autopostOn(site)) {
				delete post.progress;
				maybeAdvanceAssets(d, job.siteId, post.id, toasts);
				return;
			}
			if (data.slots.some((x) => x.postId === post.id && (x.status === "generating" || (x.status === "human-only" && x.humanPinned)))) {
				delete post.progress;
				return;
			}
			runAutopostGate(d, job.siteId, post.id, toasts);
			return;
		}
		case "auto-merge": {
			const mr = data.mergeRequests.find((x) => x.id === p.mrId);
			if (!mr || mr.status !== "open" || mr.ci !== "passing" || !mr.autopost) return;
			if (!site.publishing?.autoMergeOnGreenCi) {
				notify(data, "ink", `${mrRef(mr)} is green · waiting for a developer`, `Auto-merge was turned off. ${mr.title ?? mr.branch}`, "/merge-requests");
				return;
			}
			mergeInDraft(d, job.siteId, mr.id, AUTOPOST_ACTOR);
			toasts.push({ text: `${mrRef(mr)} merged on green CI · post is Live · KAS recalculates in 24 h`, tone: "pass", href: "/seo" });
			return;
		}
		case "template-parsed": {
			const m = data.manifests.find((x) => x.id === p.manifestId);
			if (!m || m.status !== "parsing") return;
			m.status = "needs-confirmation";
			m.mappings = standardMappings(m.id);
			const needs = m.mappings.filter((x) => x.status === "needs-you").length;
			const mapped = m.mappings.filter((x) => x.status === "mapped").length;
			audit(data, "CMS agent", "parsed template", `Template manifest v${m.version}`, `${mapped} mapped · ${needs} need you`);
			toasts.push({ text: `Parsed · ${mapped} mapped · ${needs} need you`, tone: "agent", href: "/templates/ingest" });
			return;
		}
		case "ci-result": {
			const mr = data.mergeRequests.find((x) => x.id === p.mrId);
			if (!mr || mr.status !== "open" || mr.ci !== "pending") return;
			mr.ci = p.result === "failing" ? "failing" : "passing";
			if (mr.ci === "passing") delete mr.ciDetail;
			notify(data, mr.ci === "passing" ? "pass" : "block", `CI ${mr.ci} on #${mr.number}`, mr.title ?? mr.branch, "/merge-requests");
			if (mr.autopost && mr.ci === "passing" && site.publishing?.autoMergeOnGreenCi) pushJob(d, job.siteId, "auto-merge", SIM_MS.merge, { mrId: mr.id });
			if (mr.autopost && mr.ci === "failing") audit(data, AUTOPOST_ACTOR, "stopped at red CI", `${mrRef(mr)} ${mr.branch}`, "The MR stays open until the build is fixed");
			return;
		}
		case "revise-complete": {
			if (!post || post.state !== "drafting") return;
			addVersion(post, "agent-edit", RUN_META["post-generation"].agent, `Revised from note: "${post.sendBackNote ?? ""}"`);
			setState(post, "in-review");
			delete post.sendBackNote;
			finishRun(site, data, String(p.runId), "Revision ready for review");
			notify(data, "human", "Revision ready", `${post.title} is back in review.`, `/posts/${post.id}`);
			toasts.push({ text: `Revision ready · ${post.title}`, tone: "agent", href: `/posts/${post.id}` });
			return;
		}
		case "run-complete": {
			const run = data.runs.find((r) => r.id === p.runId);
			if (!run || (run.status !== "running" && run.status !== "queued")) return;
			const out = completeRunEffects(d, job.siteId, run, p);
			finishRun(site, data, run.id, out.output, out.status);
			toasts.push({ text: `${RUN_META[run.kind].label} · ${out.output}`, tone: out.status === "failed" ? "block" : "agent", href: "/runs" });
			return;
		}
	}
}

function completeRunEffects(d: ICmsState, siteId: string, run: IRun, p: IJob["payload"]): { output: string; status: IRun["status"] } {
	const data = d.data[siteId];
	const site = siteOf(d, siteId);
	switch (run.kind) {
		case "keyword-swarm": {
			const pool = SWARM_POOL[siteId] ?? [];
			const existing = new Set([...data.posts, ...(data.rejectedIdeas ?? [])].map((x) => x.title.toLowerCase()));
			const fresh = pool.filter(([t]) => !existing.has(t)).slice(0, 3);
			for (const [title, pillarId, intent, contentType] of fresh) {
				const kid = uid("k");
				data.keywords.push({ id: kid, term: title.replace(/[:?]/g, "").replace(/ explained| worth it/g, ""), pillarId, intent, difficulty: 0, difficultyEvidence: "KD pending · SERP", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
				const unearned = data.pillars.find((x) => x.id === pillarId)?.claimedButUnearned;
				data.posts.push(makePost({ id: uid("p"), title, keywordId: kid, pillarId, intent, contentType, source: unearned ? "kas-gap" : "keyword-swarm", week: isoWeek() + 1 }));
			}
			const found = 11 + fresh.length;
			return { output: `${found} ideas · ${found - fresh.length} deduplicated against live and planned · ${fresh.length} new in Idea`, status: "succeeded" };
		}
		case "kas-recalc": {
			if (site.searchConsole !== "connected") return { output: "Data gap: Search Console not connected. No scores written.", status: "succeeded" };
			const shipped = typeof p.postId === "string" ? data.posts.find((x) => x.id === p.postId) : undefined;
			if (shipped) {
				// First impressions for the newly live page (simulated Search Console read).
				const k = data.keywords.find((x) => x.id === shipped.keywordId);
				if (k && k.position === null) {
					k.position = 18;
					k.positionTrend = [18];
					k.impressions = 1400;
					k.rankingUrl = postUrl(shipped);
					k.rankingPages = 1;
				}
			}
			data.keywords = applyKas(data.keywords, data.ctrCurve);
			const dist = new Map(pillarDistribution(data.keywords, data.pillars).map((x) => [x.pillarId, x]));
			for (const pl of data.pillars) {
				pl.kasShare = dist.get(pl.id)?.share ?? 0;
				pl.claimedButUnearned = dist.get(pl.id)?.claimedButUnearned ?? false;
			}
			const conc = concentration(data.keywords);
			data.kasSnapshots.unshift({
				id: uid("kas"),
				at: nowIso(),
				trigger: shipped ? "post-merge" : run.trigger === "manual" ? "manual" : "weekly",
				label: `Recalculated ${fmtDate(nowIso())}${shipped ? " · after 1 merge" : ""}`,
				...(shipped ? { postId: shipped.id, mrId: shipped.mrId } : {}),
				concentration: conc.top,
				shares: data.keywords.filter((k) => k.position !== null).map((k) => ({ keywordId: k.id, share: k.kasShare, position: k.position })),
			});
			return { output: `Concentration ${Math.round(conc.top)}% · ${conc.fragile ? "fragile" : "healthy"}`, status: "succeeded" };
		}
		case "technical-monitor":
			return { output: `Health ${site.searchConsole === "connected" ? 96 : 88} · 0 new issues`, status: "succeeded" };
		case "qa-sweep":
			return { output: "Light sweep · scorecard 11/12 · ledger unchanged", status: "succeeded" };
		case "content-refresh": {
			const decaying = data.posts.filter((x) => x.state === "decaying");
			return { output: `Prune list refreshed · ${decaying.length} decaying posts ranked for refresh`, status: "succeeded" };
		}
		case "link-prospecting":
			if (!site.rankSource) return { output: "Failed: no Ahrefs or Semrush connection for backlink data.", status: "failed" };
			return { output: "12 prospects · 5 outreach drafts", status: "succeeded" };
		case "biweekly-report": {
			const gap = gapToProjection(data.trajectory);
			const conc = concentration(data.keywords);
			const triggers = [
				...(conc.fragile ? [`Concentration ${Math.round(conc.top)}% · above the 60% fragile line`] : []),
				...data.pillars.filter((x) => x.claimedButUnearned).map((x) => `${x.name} ${x.kasShare}% of score · claimed but unearned`),
				...data.keywords.filter((k) => k.decaying && k.kasShare >= 5).map((k) => `${k.term} decaying (pos ${k.position}) carrying ${k.kasShare}%`),
			];
			const n = (data.reports[0]?.n ?? 0) + 1;
			data.reports.unshift({
				id: uid("rep"),
				n,
				period: `to ${fmtDate(nowIso())}`,
				publishedAt: nowIso(),
				headline: gap ? `Sessions ${Math.abs(gap.pct)}% ${gap.pct < 0 ? "under" : "over"} the month-${site.ageMonths} projection.` : "Data gap: Search Console not connected, trajectory can't be sourced.",
				pivotTriggers: triggers,
			});
			if (triggers.length) notify(data, "block", `Pivot trigger: ${triggers[0]}`, `${triggers.length} pivot trigger${triggers.length > 1 ? "s" : ""} in edition ${n}.`, "/plan");
			return { output: `Edition ${n} stored · ${triggers.length} pivot triggers`, status: "succeeded" };
		}
		default:
			return { output: "Done", status: "succeeded" };
	}
}

function makePost(p: Pick<IPost, "id" | "title" | "keywordId" | "pillarId" | "intent" | "contentType" | "source" | "week">): IPost {
	return {
		...p,
		slug: p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
		seoTitle: cap1(p.title),
		state: "idea",
		owner: STATE_OWNER.idea,
		ideaApproval: { status: "pending" },
		strongModel: p.contentType === "pillar" || p.contentType === "money-page",
		words: 0,
		wordTarget: p.contentType === "pillar" ? 3200 : 1600,
		blocks: [],
		gate: [],
		facts: [],
		suggestions: [],
		versions: [],
		slotIds: [],
		daysInState: 0,
		comments: [],
		...(p.contentType === "comparison" ? { requires: ["table" as const] } : {}),
	};
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Workspace-level actions (not site-scoped). Available on every actions object and on useWorkspace(). */
export interface IWorkspaceActions {
	/** Invites a person by email with a role per site ({ [siteId]: role }). Workspace owner/admin only. → id = new user id. */
	inviteUser(email: string, siteRoles: Record<string, TRole>): TResult;
	/** Sets (or with null removes) a person's role on one site. Workspace owner/admin only. */
	setMembership(userId: string, siteId: string, role: TRole | null): TResult;
	/** owner/admin → admin on every site; member → per-site memberships. Only an owner grants or removes "owner". */
	setWorkspaceRole(userId: string, role: TWorkspaceRole): TResult;
	/** New site in `onboarding` status. → id = the new site's slug (also its id). */
	addSite(input: { name: string; domain: string; industry?: string; icon?: string }): TResult;
	pauseSite(siteId: string): TResult;
	resumeSite(siteId: string): TResult;
	/** From the no-access state: asks the workspace admins for access (shows in their inbox). */
	requestAccess(siteId: string): TResult;
	/** Per tab (sessionStorage). Signing in as an invited person accepts their invite. */
	signInAs(userId: string): TResult;
	signOut(): TResult;
}

export interface IEditLockResultFail {
	ok: false;
	reason: string;
	/** Present when another person holds a fresh lock (the "view only / take over" state). */
	heldBy?: IEditLockHolder;
}
export type TLockResult = { ok: true; id?: string } | IEditLockResultFail;

export interface ICmsActions extends IWorkspaceActions {
	/** Remembers the site as this tab's last-used site (old flat routes redirect there). Navigation is the router's job. */
	setSite(siteId: string): TResult;
	/** Compat "View as <role>": signs this tab in as a person who holds that role on the scoped site. */
	setRole(role: TRole): TResult;
	/** Assign a post to someone with access to this site (null = unassign). Needs post.edit. */
	assignPost(postId: string, userId: string | null): TResult;
	/**
	 * Soft edit lock. Refused with `heldBy` while someone else holds a fresh lock (< EDIT_LOCK_MS); `takeOver` takes it.
	 * Call again at least every minute while the editor is open to keep the lock fresh.
	 */
	startEditing(postId: string, opts?: { takeOver?: boolean }): TLockResult;
	stopEditing(postId: string): TResult;
	addIdea(topicOrKeyword: string, pillarId?: string): TResult;
	/** Idea → Briefed with a recorded approval. Under autopost the agents start drafting immediately. */
	approveIdea(postId: string): TResult;
	/** Takes the idea out of the plan (kept in `data.rejectedIdeas` for dedup). A note is required. */
	rejectIdea(postId: string, note: string): TResult;
	/** Runs the autopost gate now for a Needs assets / In review post (autopost sites). Ships or holds. */
	shipNow(postId: string): TResult;
	setAutopost(siteId: string, on: boolean): TResult;
	setAutoMerge(siteId: string, on: boolean): TResult;
	/** Replaces a slot's candidates (visual-asset agent), status → "candidates", provenance recorded per candidate. */
	setSlotCandidates(slotId: string, candidates: ICandidate[], meta?: { provider: TProvider; model?: string }): TResult;
	/** Promotes an idea; a pending idea is approved on the way (same as approveIdea). */
	promoteToBrief(postId: string): TResult;
	generateNow(postId: string): TResult;
	movePostToWeek(postId: string, week: number): TResult;
	acceptSuggestion(postId: string, suggestionId: string): TResult;
	rejectSuggestion(postId: string, suggestionId: string): TResult;
	instructAgent(postId: string, instruction: string, blockId?: string): TResult;
	editBlock(postId: string, blockId: string, text: string): TResult;
	editSeoTitle(postId: string, seoTitle: string): TResult;
	restoreVersion(postId: string, versionId: string): TResult;
	addFactSource(postId: string, markerId: string, url: string): TResult;
	rewriteFactWithout(postId: string, markerId: string): TResult;
	fixCheck(postId: string, checkId: string): TResult;
	overrideCheck(postId: string, checkId: string, reason: string): TResult;
	pickCandidate(slotId: string, candidateId: string): TResult;
	useCandidate(slotId: string): TResult;
	regenerateSlot(slotId: string, prompt?: string): TResult;
	uploadOwn(slotId: string, fileName: string): TResult;
	markHumanOnly(slotId: string): TResult;
	sendToReview(postId: string): TResult;
	sendBack(postId: string, note: string): TResult;
	approve(postId: string, overrides?: Record<string, string>): TResult;
	mergeMr(mrId: string): TResult;
	rebaseMr(mrId: string): TResult;
	confirmManifest(manifestId: string): TResult;
	mapTemplateItem(manifestId: string, mappingId: string, role: ITemplateMapping["role"], label?: string): TResult;
	/** Without `parsed`: simulated parse (timer). With `parsed`: a real client-side parse is stored as needs-confirmation. */
	ingestTemplate(fileName: string, kind: ITemplateManifest["kind"], parsed?: { mappings: ITemplateMapping[]; sampleHtml?: string; source?: string }): TResult;
	setOutputFormat(manifestId: string, output: ITemplateManifest["output"]): TResult;
	connectRepo(siteId: string, conn: IRepoConnection): TResult;
	connectSearchConsole(siteId: string): TResult;
	runNow(kind: TRunKind): TResult;
	toggleSchedule(kind: TRunKind): TResult;
	setBudget(kind: TBudgetKind, capUsd: number): TResult;
	setRouting(slotType: TSlotType, provider: TProvider): TResult;
	setModelRouting(task: keyof ISiteData["modelRouting"], tier: TModelTier): TResult;
	addComment(postId: string, text: string): TResult;
	resolveLedgerItem(itemId: string): TResult;
	markNotificationRead(id: string): TResult;
	markAllNotificationsRead(): TResult;
	dismissToast(id: string): void;
	undo(): TResult;
	resetDemo(): void;
}

type TActions = ICmsActions;

// ─── Storage environment (per-tab session, shared local, cross-tab feed) ─────

export interface IStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/**
 * Where the store keeps things. Browser: localStorage (domain data, shared by every tab), sessionStorage (who this
 * tab is signed in as) and the `storage` event (another tab changed something). Tests pass a memory bus instead.
 */
export interface ICmsEnv {
	local: IStorageLike | null;
	session: IStorageLike | null;
	/** Called with the key another tab changed (null = cleared). Returns an unsubscribe. */
	subscribe?(fn: (key: string | null) => void): () => void;
	tabId?: string;
}

export interface ICmsStoreOptions {
	/** Browser storage (default env) when true. Ignored when `env` is given. */
	persist?: boolean;
	env?: ICmsEnv;
}

export const SESSION_KEY = "cms.session.v1";
export const LEADER_KEY = "cms.leader.v1";
export const CLOCK_KEY = "cms.clock.v1";
/** A job-runner lease older than this is up for grabs (the leader tab renews it every LEADER_HEARTBEAT_MS). */
export const LEADER_LEASE_MS = 5000;
export const LEADER_HEARTBEAT_MS = 2000;
/** Presence is re-recorded this often while a SiteScope is mounted. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
/** Tabs share one demo clock for this long; after that the next tab re-pins it to DEMO_NOW. */
const CLOCK_ANCHOR_TTL_MS = 6 * 3600_000;

const safeStorage = (get: () => Storage): IStorageLike | null => {
	try {
		const s = get();
		return {
			getItem: (k) => {
				try {
					return s.getItem(k);
				} catch {
					return null;
				}
			},
			setItem: (k, v) => {
				try {
					s.setItem(k, v);
				} catch {
					/* quota / private mode */
				}
			},
			removeItem: (k) => {
				try {
					s.removeItem(k);
				} catch {
					/* ignore */
				}
			},
		};
	} catch {
		return null;
	}
};

function browserEnv(): ICmsEnv | null {
	if (typeof window === "undefined") return null;
	return {
		local: safeStorage(() => window.localStorage),
		session: safeStorage(() => window.sessionStorage),
		subscribe(fn) {
			const h = (e: StorageEvent) => {
				if (e.storageArea === null || e.storageArea === window.localStorage) fn(e.key);
			};
			window.addEventListener("storage", h);
			return () => window.removeEventListener("storage", h);
		},
	};
}

const mapStorage = (m: Map<string, string>, onWrite?: (k: string | null) => void): IStorageLike => ({
	getItem: (k) => m.get(k) ?? null,
	setItem: (k, v) => {
		const changed = m.get(k) !== v;
		m.set(k, v);
		if (changed) onWrite?.(k);
	},
	removeItem: (k) => {
		const had = m.has(k);
		m.delete(k);
		if (had) onWrite?.(k);
	},
});

/**
 * In-memory stand-in for localStorage + the `storage` event, shared by several simulated tabs (tests, scripts).
 * `bus.tab()` gives each tab its own sessionStorage; a write in one tab notifies the others synchronously.
 */
export function createMemoryStorageBus() {
	const shared = new Map<string, string>();
	const subs = new Set<{ tab: string; fn: (k: string | null) => void }>();
	let n = 0;
	return {
		shared,
		tab(): ICmsEnv {
			const tabId = `tab-${++n}`;
			const notify = (k: string | null) => {
				for (const s of [...subs]) if (s.tab !== tabId) s.fn(k);
			};
			return {
				tabId,
				local: mapStorage(shared, notify),
				session: mapStorage(new Map()),
				subscribe(fn) {
					const e = { tab: tabId, fn };
					subs.add(e);
					return () => void subs.delete(e);
				},
			};
		},
	};
}

// ─── Store ───────────────────────────────────────────────────────────────────

export interface ISession {
	/** Signed-in person for this tab (null = signed out). */
	userId: string | null;
	/** Last site this tab worked on (old flat routes redirect to it). */
	lastSiteId: string | null;
}

/** What hooks subscribe to: replaced on every change to the shared state or this tab's session. */
export interface ICmsSnapshot {
	state: ICmsState;
	session: ISession;
}

const GUEST: IUser = { id: "guest", name: "Signed out", initials: "–", email: "", avatarHue: 0, status: "active" };

export function emptySiteData(): ISiteData {
	return {
		pillars: [],
		keywords: [],
		posts: [],
		slots: [],
		manifests: [],
		mergeRequests: [],
		runs: [],
		schedules: defaultSchedules({}),
		ledger: [],
		trajectory: [],
		planStatus: [],
		reports: [],
		kasSnapshots: [],
		audit: [],
		notifications: [],
		liveBaseline: 0,
		routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
		modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", "pillar-pages": "strongest" },
		brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} },
	};
}

/** Notification hrefs are written site-relative by the reducers; stored absolute (/s/<slug>/…). */
function normalizeHrefs(s: ICmsState) {
	for (const site of s.sites) {
		const data = s.data[site.id];
		if (!data) continue;
		for (const n of data.notifications) if (n.href) n.href = absHref(site.slug, n.href);
	}
}

class CmsStore {
	state: ICmsState;
	session: ISession = { userId: DEFAULT_USER_ID, lastSiteId: null };
	toasts: IToast[] = [];
	readonly workspaceActions: IWorkspaceActions;
	readonly tabId: string;
	private readonly env: ICmsEnv | null;
	private snap: ICmsSnapshot;
	private actionsBySite = new Map<string, ICmsActions>();
	private listeners = new Set<TListener>();
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private toastTimers = new Set<ReturnType<typeof setTimeout>>();
	private undoSnapshot: { siteId: string; data: ISiteData; label: string } | null = null;
	private hydrated = false;
	private running = false;
	private leader = false;
	private lastRaw: string | null = null;
	private heartbeat: ReturnType<typeof setInterval> | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(opts: boolean | ICmsStoreOptions = false) {
		const o = typeof opts === "boolean" ? { persist: opts } : opts;
		this.env = o.env ?? (o.persist ? browserEnv() : null);
		this.tabId = this.env?.tabId ?? uid("tab");
		this.state = createSeed();
		normalizeHrefs(this.state);
		this.snap = { state: this.state, session: this.session };
		this.workspaceActions = createWorkspaceActions(this);
	}

	getState = () => this.state;
	getToasts = () => this.toasts;
	getSnapshot = () => this.snap;

	// ── Who and where (per tab) ──
	userId = (): string | null => this.session.userId;
	user = (): IUser | undefined => userById(this.state, this.session.userId);
	userName = (): string => this.user()?.name ?? GUEST.name;
	isLeader = () => this.leader;

	/** The site actions outside a SiteScope act on: last-used if accessible, else the first site the user can open. */
	unscopedSiteId(): string {
		const me = this.session.userId;
		const last = this.session.lastSiteId;
		if (last && canAccessSite(this.state, me, last)) return last;
		return accessibleSites(this.state, me)[0]?.id ?? "";
	}

	/** Actions bound to one site (every existing action resolves its site from here, never from shared state). */
	actionsFor(siteId: string): ICmsActions {
		let a = this.actionsBySite.get(siteId);
		if (!a) {
			a = createActions(this, siteId);
			this.actionsBySite.set(siteId, a);
		}
		return a;
	}

	/** Headless convenience: actions for the unscoped site (tests, scripts). Components use the hooks. */
	get actions(): ICmsActions {
		return this.actionsFor(this.unscopedSiteId());
	}

	setUser(userId: string | null) {
		this.session = { ...this.session, userId };
		this.undoSnapshot = null;
		this.saveSession();
		this.publish();
	}

	/**
	 * Adds a site the backend knows but this store doesn't (one created after the seed, e.g. through sites.add), so
	 * /s/<slug> resolves. Identity only, with empty site data: the site's real content comes from Convex. No-op when
	 * the slug is already here.
	 */
	adoptSite(site: Pick<ISite, "slug" | "name" | "domain" | "icon" | "status"> & { industry?: string; accent?: number; role?: TRole }) {
		const me = this.session.userId;
		const id = this.state.sites.find((s) => s.slug === site.slug)?.id ?? site.slug;
		const known = this.state.sites.some((s) => s.slug === site.slug);
		const member = !me || !site.role || canAccessSite(this.state, me, id);
		if (known && member) return;
		this.set((d) => {
			// The server already decided this person may open the site (sites.bySlug), so mirror that role here.
			if (me && site.role && !canAccessSite(d, me, id)) d.memberships.push({ userId: me, siteId: id, role: site.role, addedAt: nowIso(), addedBy: "system" });
			if (d.sites.some((s) => s.slug === site.slug)) return;
			d.sites.push({
				id: site.slug,
				slug: site.slug,
				name: site.name,
				domain: site.domain,
				industry: site.industry ?? "Other",
				status: site.status,
				createdAt: nowIso(),
				accent: site.accent ?? hueFor(site.slug, 0),
				icon: site.icon ?? "globe",
				ageMonths: 0,
				cadenceTarget: 2,
				repo: null,
				searchConsole: "missing",
				rankSource: null,
				budgets: { textUsd: 0, textCapUsd: 100, imageUsd: 0, imageCapUsd: 50 },
				publishing: { autopost: true, autoMergeOnGreenCi: true },
			});
			d.data[site.slug] = emptySiteData();
		});
	}

	setLastSite(siteId: string) {
		if (this.session.lastSiteId === siteId) return;
		this.session = { ...this.session, lastSiteId: siteId };
		this.saveSession();
		this.publish();
	}

	/** Upserts this user's presence (one entry per user) and prunes entries older than an hour. Throttled to 30 s per spot. */
	recordPresence(siteId: string, path: string) {
		const me = this.session.userId;
		if (!me || !canAccessSite(this.state, me, siteId)) return;
		const t = now().getTime();
		const cur = this.state.presence.find((p) => p.userId === me);
		if (cur && cur.siteId === siteId && cur.path === path && t - new Date(cur.at).getTime() < 30_000) return;
		this.set((d) => {
			d.presence = d.presence.filter((p) => p.userId !== me && t - new Date(p.at).getTime() < 3600_000);
			d.presence.push({ userId: me, siteId, path, at: new Date(t).toISOString() });
		});
	}

	// ── Lifecycle ──
	hydrate() {
		if (!this.hydrated) {
			this.hydrated = true;
			if (this.env?.local) this.load(this.env.local);
		}
		if (this.running) return;
		this.running = true;
		if (this.env) {
			this.unsubscribe = this.env.subscribe?.((k) => this.onExternal(k)) ?? null;
			this.heartbeat = setInterval(() => this.tickLeader(), LEADER_HEARTBEAT_MS);
		}
		this.leader = this.claimLease();
		this.arm();
		this.publish();
	}

	private load(local: IStorageLike) {
		// One demo clock for every tab: the first tab pins DEMO_NOW to its real start; later tabs reuse that anchor.
		const t = Date.now();
		const stored = Number(local.getItem(CLOCK_KEY));
		const anchor = Number.isFinite(stored) && stored > 0 && t - stored < CLOCK_ANCHOR_TTL_MS ? stored : t;
		if (anchor === t) local.setItem(CLOCK_KEY, String(t));
		anchorClock(anchor);
		// Session (per tab).
		try {
			const raw = this.env?.session?.getItem(SESSION_KEY);
			if (raw) {
				const s = JSON.parse(raw) as Partial<ISession>;
				this.session = { userId: s.userId === undefined ? DEFAULT_USER_ID : s.userId, lastSiteId: s.lastSiteId ?? null };
			}
		} catch {
			/* keep the default */
		}
		const raw = local.getItem(STATE_KEY);
		const res = loadPersisted(raw, raw ? null : local.getItem(V1_STATE_KEY));
		if (res.note) console.info(`[cms] ${res.note}`);
		// The pinned clock may have restarted: pull short in-flight work back into view; leave long waits (24 h recalcs) alone.
		const at = now().getTime();
		res.state.jobs = res.state.jobs.map((j) => (j.payload.long ? j : { ...j, at: Math.min(j.at, at + 1500) }));
		normalizeHrefs(res.state);
		this.state = res.state;
		if (res.lastSiteId && !this.session.lastSiteId) this.session = { ...this.session, lastSiteId: res.lastSiteId };
		if (this.session.userId && !userById(this.state, this.session.userId)) this.session = { ...this.session, userId: DEFAULT_USER_ID };
		this.saveSession();
		if (res.outcome === "loaded") this.lastRaw = raw;
		else {
			this.save();
			if (res.outcome === "migrated") local.removeItem(V1_STATE_KEY);
		}
	}

	/** Clears every timer (unmount) and hands the job runner to another tab. Jobs stay in state. */
	stop() {
		this.running = false;
		for (const t of this.timers.values()) clearTimeout(t);
		this.timers.clear();
		for (const t of this.toastTimers) clearTimeout(t);
		this.toastTimers.clear();
		if (this.heartbeat) clearInterval(this.heartbeat);
		this.heartbeat = null;
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.releaseLease();
		this.leader = false;
	}

	subscribe = (fn: TListener) => {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	};

	private publish() {
		this.snap = { state: this.state, session: this.session };
		for (const fn of this.listeners) fn();
	}

	private saveSession() {
		this.env?.session?.setItem(SESSION_KEY, JSON.stringify(this.session));
	}

	private save() {
		const local = this.env?.local;
		if (!local) return;
		const raw = JSON.stringify(this.state);
		this.lastRaw = raw;
		local.setItem(STATE_KEY, raw);
	}

	/** Re-reads shared state if another tab wrote since we last looked (so a mutation re-applies to the fresh state). */
	private fresh(): ICmsState {
		const local = this.env?.local;
		if (!local) return this.state;
		const raw = local.getItem(STATE_KEY);
		if (raw && raw !== this.lastRaw) {
			try {
				const parsed = JSON.parse(raw) as ICmsState;
				if (parsed.version === STATE_VERSION) {
					this.state = normalizeV2(parsed);
					this.lastRaw = raw;
				}
			} catch {
				/* keep ours */
			}
		}
		return this.state;
	}

	/** Another tab changed shared storage: re-read and re-render (the simulated realtime backend). */
	private onExternal(key: string | null) {
		if (key === LEADER_KEY) return this.tickLeader();
		if (key !== null && key !== STATE_KEY) return;
		const raw = this.env?.local?.getItem(STATE_KEY) ?? null;
		if (raw === this.lastRaw) return;
		if (!raw) {
			// Another tab reset the demo.
			this.state = createSeed();
			normalizeHrefs(this.state);
			this.lastRaw = null;
			this.undoSnapshot = null;
		} else this.fresh();
		this.arm();
		this.publish();
	}

	set(mut: (draft: ICmsState) => void, undoLabel?: string, undoSiteId?: string) {
		const base = this.fresh();
		if (undoLabel && undoSiteId && base.data[undoSiteId]) this.undoSnapshot = { siteId: undoSiteId, data: clone(base.data[undoSiteId]), label: undoLabel };
		const next = clone(base);
		mut(next);
		normalizeHrefs(next);
		this.state = next;
		this.save();
		this.arm();
		this.publish();
	}

	// ── Job runner (one tab at a time) ──
	private claimLease(): boolean {
		const local = this.env?.local;
		if (!local) return true;
		const t = Date.now();
		let lease: { tabId: string; until: number } | null = null;
		try {
			lease = JSON.parse(local.getItem(LEADER_KEY) ?? "null");
		} catch {
			lease = null;
		}
		if (lease && lease.tabId !== this.tabId && lease.until > t) return false;
		local.setItem(LEADER_KEY, JSON.stringify({ tabId: this.tabId, until: t + LEADER_LEASE_MS }));
		try {
			return JSON.parse(local.getItem(LEADER_KEY) ?? "null")?.tabId === this.tabId;
		} catch {
			return false;
		}
	}

	private releaseLease() {
		const local = this.env?.local;
		if (!local || !this.leader) return;
		try {
			if (JSON.parse(local.getItem(LEADER_KEY) ?? "null")?.tabId === this.tabId) local.removeItem(LEADER_KEY);
		} catch {
			/* ignore */
		}
	}

	private tickLeader() {
		if (!this.running) return;
		const was = this.leader;
		this.leader = this.claimLease();
		if (was !== this.leader) this.arm();
	}

	private arm() {
		if (!this.running) return;
		if (!this.leader) {
			for (const t of this.timers.values()) clearTimeout(t);
			this.timers.clear();
			return;
		}
		const paused = new Set(this.state.sites.filter((s) => s.status === "paused").map((s) => s.id));
		const live = new Set(this.state.jobs.filter((j) => !paused.has(j.siteId)).map((j) => j.id));
		for (const [id, t] of this.timers)
			if (!live.has(id)) {
				clearTimeout(t);
				this.timers.delete(id);
			}
		for (const job of this.state.jobs) {
			if (this.timers.has(job.id) || !live.has(job.id)) continue;
			const delay = Math.max(0, job.at - now().getTime());
			if (delay > 2 ** 31 - 1) continue; // beyond setTimeout range; re-armed on a later mount
			this.timers.set(
				job.id,
				setTimeout(() => this.fire(job.id), delay),
			);
		}
	}

	private fire(jobId: string) {
		this.timers.delete(jobId);
		if (!this.leader || !this.running) return;
		// Another tab may already have run it (lease hand-over): only run what is still queued in the fresh state.
		if (!this.fresh().jobs.some((j) => j.id === jobId)) return;
		const toasts: TToastIn[] = [];
		let siteId = "";
		this.set((d) => {
			const job = d.jobs.find((j) => j.id === jobId);
			if (!job || d.sites.find((s) => s.id === job.siteId)?.status === "paused") return;
			siteId = job.siteId;
			d.jobs = d.jobs.filter((j) => j.id !== jobId);
			applyJob(d, job, toasts);
		});
		const slug = this.state.sites.find((s) => s.id === siteId)?.slug ?? siteId;
		for (const t of toasts) this.toast({ ...t, ...(t.href ? { href: absHref(slug, t.href) } : {}) });
	}

	toast(t: TToastIn) {
		const toast: IToast = { id: uid("t"), ...t };
		this.toasts = [...this.toasts, toast];
		this.emitToasts();
		const timer = setTimeout(() => {
			this.toastTimers.delete(timer);
			this.dismiss(toast.id);
		}, t.undo ? 6000 : 4200);
		this.toastTimers.add(timer);
	}

	private emitToasts() {
		for (const fn of this.listeners) fn();
	}

	dismiss(id: string) {
		if (!this.toasts.some((t) => t.id === id)) return;
		this.toasts = this.toasts.filter((t) => t.id !== id);
		this.emitToasts();
	}

	/** Restores the site data from before this tab's last undoable mutation (runs, audit and jobs are kept). */
	undo(): TResult {
		const snap = this.undoSnapshot;
		if (!snap) return { ok: false, reason: "Nothing to undo" };
		this.undoSnapshot = null;
		this.set((d) => {
			const cur = d.data[snap.siteId];
			d.data[snap.siteId] = { ...snap.data, runs: cur.runs, audit: cur.audit, notifications: cur.notifications };
			audit(d.data[snap.siteId], this.userName(), "undid", snap.label);
		});
		this.toast({ text: `Undone · ${snap.label}`, tone: "neutral" });
		return { ok: true };
	}

	reset() {
		this.undoSnapshot = null;
		for (const t of this.timers.values()) clearTimeout(t);
		this.timers.clear();
		this.state = createSeed();
		normalizeHrefs(this.state);
		this.lastRaw = null;
		this.env?.local?.removeItem(STATE_KEY);
		this.toasts = [];
		this.arm();
		this.publish();
	}
}

// ─── Workspace actions ───────────────────────────────────────────────────────

function createWorkspaceActions(store: CmsStore): IWorkspaceActions {
	const st = () => store.state;
	const who = () => store.userName();
	const ok = (id?: string): TResult => (id ? { ok: true, id } : { ok: true });
	const fail = (reason: string): TResult => {
		store.toast({ text: reason, tone: "block" });
		return { ok: false, reason };
	};
	const guard = (p: TWorkspacePermission): TResult | null => {
		const r = workspaceLockReason(st(), store.userId(), p);
		return r ? fail(r) : null;
	};
	const wsAudit = (d: ICmsState, action: string, target: string, detail?: string) => {
		d.audit.unshift({ id: uid("a"), at: nowIso(), actor: who(), action, target, ...(detail ? { detail } : {}) });
	};
	const seats = (d: ICmsState) => d.users.filter((u) => u.status !== "suspended").length;
	const siteName = (id: string) => st().sites.find((s) => s.id === id)?.name ?? id;

	const ws: IWorkspaceActions = {
		inviteUser(email, siteRoles) {
			const g = guard("members.manage");
			if (g) return g;
			const e = email.trim().toLowerCase();
			if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail("Enter a valid email address");
			if (st().users.some((u) => u.email.toLowerCase() === e)) return fail(`${e} is already in the workspace`);
			const entries = Object.entries(siteRoles).filter(([sid]) => st().sites.some((s) => s.id === sid));
			if (!entries.length) return fail("Pick at least one site and a role");
			const w = st().workspace;
			if (seats(st()) >= w.seats) return fail(`All ${w.seats} seats are in use · upgrade the plan or remove someone`);
			const id = uid("u");
			const parts = e.split("@")[0].split(/[._-]+/).filter(Boolean);
			const name = parts.map(cap1).join(" ") || e;
			const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
			const at = nowIso();
			const me = store.userId() ?? "system";
			store.set((d) => {
				d.users.push({ id, name, initials, email: e, avatarHue: hueFor(e, 0), status: "invited", invitedBy: me, invitedAt: at });
				d.workspaceRoles[id] = "member";
				for (const [siteId, role] of entries) {
					d.memberships.push({ userId: id, siteId, role, addedAt: at, addedBy: me });
					audit(d.data[siteId], who(), "invited", e, ROLE_LABEL[role]);
				}
				d.workspace.seatsUsed = seats(d);
				wsAudit(d, "invited", e, entries.map(([sid, role]) => `${ROLE_LABEL[role]} · ${siteName(sid)}`).join(", "));
			});
			store.toast({ text: `Invite sent to ${e} · ${entries.length} site${entries.length > 1 ? "s" : ""}`, tone: "pass", href: WORKSPACE_ROUTES.team });
			return ok(id);
		},

		setMembership(userId, siteId, role) {
			const g = guard("members.manage");
			if (g) return g;
			const u = userById(st(), userId);
			if (!u) return fail("Person not found");
			if (!st().sites.some((s) => s.id === siteId)) return fail("Unknown site");
			const cur = st().memberships.find((m) => m.userId === userId && m.siteId === siteId);
			if ((cur?.role ?? null) === role) return ok();
			store.set((d) => {
				d.memberships = d.memberships.filter((m) => !(m.userId === userId && m.siteId === siteId));
				if (role) d.memberships.push({ userId, siteId, role, addedAt: nowIso(), addedBy: store.userId() ?? "system" });
				if (role) for (const r of d.accessRequests) if (r.userId === userId && r.siteId === siteId && r.status === "open") r.status = "granted";
				const detail = role ? (cur ? `${ROLE_LABEL[cur.role]} → ${ROLE_LABEL[role]}` : ROLE_LABEL[role]) : `was ${cur ? ROLE_LABEL[cur.role] : "—"}`;
				audit(d.data[siteId], who(), role ? (cur ? "changed role" : "added member") : "removed member", u.name, detail);
				wsAudit(d, role ? "set site role" : "removed from site", u.name, `${siteName(siteId)} · ${detail}`);
			});
			store.toast({ text: role ? `${u.name} is ${ROLE_LABEL[role].toLowerCase()} on ${siteName(siteId)}` : `${u.name} removed from ${siteName(siteId)}`, tone: "neutral", href: WORKSPACE_ROUTES.team });
			return ok();
		},

		setWorkspaceRole(userId, role) {
			const g = guard("members.manage");
			if (g) return g;
			const u = userById(st(), userId);
			if (!u) return fail("Person not found");
			const cur = st().workspaceRoles[userId] ?? "member";
			if (cur === role) return ok();
			if ((role === "owner" || cur === "owner") && workspaceRoleOf(st(), store.userId()) !== "owner") return fail("Only an owner can grant or remove the owner role");
			if (cur === "owner" && Object.entries(st().workspaceRoles).filter(([id, r]) => r === "owner" && userById(st(), id)?.status === "active").length <= 1) return fail("The workspace needs at least one owner");
			store.set((d) => {
				d.workspaceRoles[userId] = role;
				wsAudit(d, "changed workspace role", u.name, `${cur} → ${role}`);
			});
			store.toast({ text: `${u.name} is now workspace ${role}${role === "member" ? " · per-site roles apply" : " · admin on every site"}`, tone: "neutral", href: WORKSPACE_ROUTES.team });
			return ok();
		},

		addSite({ name, domain, industry, icon }) {
			const g = guard("site.add");
			if (g) return g;
			if (!name.trim() || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain.trim())) return fail("Add a name and a domain like example.com");
			const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || uid("site");
			if (st().sites.some((s) => s.id === slug || s.slug === slug)) return fail("That site already exists");
			store.set((d) => {
				d.sites.push({
					id: slug,
					slug,
					name: name.trim(),
					domain: domain.trim().toLowerCase(),
					industry: industry?.trim() || "Other",
					status: "onboarding",
					createdAt: nowIso(),
					accent: hueFor(slug, 0),
					icon: icon ?? "globe",
					ageMonths: 0,
					cadenceTarget: 2,
					repo: null,
					searchConsole: "missing",
					rankSource: null,
					budgets: { textUsd: 0, textCapUsd: 100, imageUsd: 0, imageCapUsd: 50 },
					publishing: { autopost: true, autoMergeOnGreenCi: true },
				});
				const empty = emptySiteData();
				d.data[slug] = empty;
				audit(empty, who(), "added site", name.trim(), domain.trim());
				wsAudit(d, "added site", name.trim(), domain.trim());
			});
			store.setLastSite(slug);
			store.toast({ text: `${name.trim()} added · finish onboarding`, tone: "pass", href: sitePath(slug, "/onboarding") });
			return ok(slug);
		},

		pauseSite(siteId) {
			const g = guard("site.add");
			if (g) return g;
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (s.status === "paused") return ok();
			store.set((d) => {
				d.sites.find((x) => x.id === siteId)!.status = "paused";
				audit(d.data[siteId], who(), "paused site", s.name, "Agents and schedules stop · data stays");
				notify(d.data[siteId], "neutral", "Site paused", "Agents and schedules are stopped until an admin resumes the site.", "/settings");
				wsAudit(d, "paused site", s.name);
			});
			store.toast({ text: `${s.name} paused · agents stopped, data kept`, tone: "neutral" });
			return ok();
		},

		resumeSite(siteId) {
			const g = guard("site.add");
			if (g) return g;
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (s.status !== "paused") return ok();
			store.set((d) => {
				d.sites.find((x) => x.id === siteId)!.status = "active";
				audit(d.data[siteId], who(), "resumed site", s.name, "Agents and schedules run again");
				wsAudit(d, "resumed site", s.name);
			});
			store.toast({ text: `${s.name} resumed · agents pick up where they stopped`, tone: "pass" });
			return ok();
		},

		requestAccess(siteId) {
			const me = store.userId();
			if (!me) return fail("Sign in first");
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (canAccessSite(st(), me, siteId)) return ok();
			const owner = st().users.find((u) => workspaceRoleOf(st(), u.id) === "owner")?.name ?? "A workspace admin";
			if (st().accessRequests.some((r) => r.userId === me && r.siteId === siteId && r.status === "open")) {
				store.toast({ text: `Already requested · ${owner} will see it in their inbox`, tone: "neutral" });
				return ok();
			}
			const id = uid("req");
			store.set((d) => {
				d.accessRequests.push({ id, userId: me, siteId, at: nowIso(), status: "open" });
				wsAudit(d, "requested access", s.name);
			});
			store.toast({ text: `Access requested · ${owner} will see it in their inbox`, tone: "pass" });
			return ok(id);
		},

		signInAs(userId) {
			const u = userById(st(), userId);
			if (!u) return fail("Person not found");
			if (u.status === "suspended") return fail(`${u.name}'s account is suspended`);
			store.setUser(userId);
			if (u.status === "invited")
				store.set((d) => {
					const x = d.users.find((y) => y.id === userId);
					if (x) x.status = "active";
					wsAudit(d, "accepted invite", u.name, u.email);
				});
			store.toast({ text: `Signed in as ${u.name}${u.title ? ` · ${u.title}` : ""}`, tone: "neutral" });
			return ok(userId);
		},

		signOut() {
			store.setUser(null);
			store.toast({ text: "Signed out", tone: "neutral", href: WORKSPACE_ROUTES.signIn });
			return ok();
		},
	};
	return ws;
}

// ─── Site-scoped actions ─────────────────────────────────────────────────────

function createActions(store: CmsStore, SID: string): ICmsActions {
	const st = () => store.state;
	const data = () => st().data[SID];
	const site = () => siteOf(st(), SID);
	const slug = () => st().sites.find((s) => s.id === SID)?.slug ?? SID;
	const who = () => store.userName();
	const roleNow = (): TRole => effectiveRole(st(), store.userId(), SID) ?? "stakeholder";
	const ok = (id?: string): TResult => (id ? { ok: true, id } : { ok: true });
	/** Site-scoped toast: hrefs are site-relative in this file and made absolute (/s/<slug>/…) here. */
	const toast = (t: TToastIn) => store.toast({ ...t, ...(t.href ? { href: absHref(slug(), t.href) } : {}) });
	const set = (mut: (d: ICmsState) => void, undoLabel?: string) => store.set(mut, undoLabel, SID);
	const fail = (reason: string): TResult => {
		toast({ text: reason, tone: "block" });
		return { ok: false, reason };
	};
	/** Permission on a site, evaluated with the current user's effective role there. No access = refused. */
	const guardOn = (siteId: string, p: TPermission): TResult | null => {
		const s = st().sites.find((x) => x.id === siteId);
		if (!s) return fail("Unknown site");
		const r = roleWhy(effectiveRole(st(), store.userId(), siteId), p, s.name);
		return r ? fail(r) : null;
	};
	const guard = (p: TPermission): TResult | null => guardOn(SID, p);
	/** Paused sites keep their data but run no agents. */
	const pausedGuard = (): TResult | null => (site()?.status === "paused" ? fail(`${site().name} is paused · resume it to run agents`) : null);
	/** Soft edit lock: direct edits are refused while someone else holds a fresh lock on the post. */
	const lockGuard = (postId: string): TResult | null => {
		const other = otherEditor(st(), data()?.posts.find((p) => p.id === postId), store.userId());
		return other ? fail(`${other.name} is editing · view only`) : null;
	};
	const getPost = (id: string) => data().posts.find((p) => p.id === id);
	const getSlot = (id: string) => data().slots.find((s) => s.id === id);
	const getMr = (id: string) => data().mergeRequests.find((m) => m.id === id);
	/** Mutate the current site's post inside a draft. */
	const withPost = (postId: string, fn: (post: IPost, d: ICmsState, data: ISiteData) => void, undoLabel?: string) =>
		set((d) => {
			const dd = dataOf(d, SID);
			const post = dd.posts.find((p) => p.id === postId);
			if (post) fn(post, d, dd);
		}, undoLabel);
	const keywordOf = (post: IPost) => data().keywords.find((k) => k.id === post.keywordId)?.term ?? post.title;

	/** Small agent call (edit, fix, rewrite): cap-checked text run, then a pending suggestion after a delay. */
	function queueSuggestion(post: IPost, proposal: TProposal, label: string): TResult {
		const est: IEstimate = { usd: 0.06, budget: "text", tier: "workhorse" };
		const c = checkCap(site(), "post-generation", est);
		if (c.status === "refused") {
			set((d) => refuseRun(dataOf(d, SID), "post-generation", "manual", est, c, who(), { postId: post.id }));
			return fail(c.message);
		}
		set((d) => {
			const dd = dataOf(d, SID);
			const r = startRun(dd, "post-generation", "manual", est, { postId: post.id, output: `Agent edit · "${proposal.instruction}"` });
			const payload: IJob["payload"] = { postId: post.id, runId: r.id, instruction: proposal.instruction, blockId: proposal.blockId, before: proposal.before, after: proposal.after };
			if (proposal.fixesCheckId) payload.fixesCheckId = proposal.fixesCheckId;
			if (proposal.resolvesFactId) payload.resolvesFactId = proposal.resolvesFactId;
			if (proposal.insertKind) payload.insertKind = proposal.insertKind;
			pushJob(d, SID, "suggestion-ready", SIM_MS.suggestion, payload);
			audit(dd, who(), label, post.title, `"${proposal.instruction}" · est. ${fmtUsd(est.usd)}`);
			warnIfNearCap(dd, c);
		});
		toast({ text: `Agent is working on "${proposal.instruction}" · every change comes back as a diff`, tone: "agent" });
		return ok();
	}

	const actions: ICmsActions = {
		setSite(siteId) {
			if (!canAccessSite(st(), store.userId(), siteId)) return fail(st().sites.some((s) => s.id === siteId) ? "You don't have access to that site" : "Unknown site");
			store.setLastSite(siteId);
			return ok();
		},

		setRole(role) {
			// Compat "View as": switch this tab to a person who holds `role` on this site (roles live on people now).
			const target = siteMembers(st(), SID).find((m) => m.role === role && userById(st(), m.id)?.status === "active");
			if (!target) return fail(`Nobody holds the ${ROLE_LABEL[role].toLowerCase()} role on ${site()?.name ?? "this site"}`);
			if (target.id === store.userId()) return ok();
			return store.workspaceActions.signInAs(target.id);
		},

		addIdea(topicOrKeyword, pillarId) {
			const g = guard("idea.create");
			if (g) return g;
			const title = topicOrKeyword.trim().replace(/\s+/g, " ");
			if (title.length < 3) return fail("Type a topic or paste a keyword");
			const dupe = data().posts.find((p) => p.title.toLowerCase() === title.toLowerCase());
			if (dupe) return fail(`Already in the plan (${dupe.state.replace("-", " ")}): ${dupe.title}`);
			const pillars = data().pillars;
			if (!pillars.length) return fail("Add a pillar to the plan first");
			const pillar = (pillarId && pillars.find((p) => p.id === pillarId)) || [...pillars].sort((a, b) => a.kasShare - b.kasShare)[0];
			const lower = title.toLowerCase();
			const contentType: IPost["contentType"] = / vs\.? /.test(lower) ? "comparison" : /^how to /.test(lower) ? "how-to" : /\b(cost|price|prices)\b/.test(lower) ? "money-page" : /\?$/.test(lower) ? "faq" : "guide";
			const intent: IKeyword["intent"] = /\b(cost|price|vs|best)\b/.test(lower) ? "commercial" : /\b(near me|book|emergency)\b/.test(lower) ? "transactional" : "informational";
			const id = uid("p");
			set((d) => {
				const dd = dataOf(d, SID);
				const existing = dd.keywords.find((k) => k.term.toLowerCase() === lower);
				const kid = existing?.id ?? uid("k");
				if (!existing)
					dd.keywords.push({ id: kid, term: lower.replace(/[?:]/g, ""), pillarId: pillar.id, intent, difficulty: 0, difficultyEvidence: "KD pending · next keyword swarm", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
				dd.posts.push(makePost({ id, title: lower, keywordId: kid, pillarId: pillar.id, intent: existing?.intent ?? intent, contentType, source: "manual", week: isoWeek() + 1 }));
				audit(dd, who(), "added idea", lower, `${pillar.name} · manual`);
			});
			toast({ text: `Idea added to ${pillar.name}`, tone: "neutral", href: `/posts/${id}` });
			return ok(id);
		},

		approveIdea(postId) {
			const g = guard("idea.approve");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (post.state !== "idea") return fail("Only ideas wait for approval");
			if (!isPendingIdea(post)) return fail(ideaGate(post) ?? "This idea is already approved");
			const auto = autopostOn(site());
			set(
				(d) => {
					const dd = dataOf(d, SID);
					const p = dd.posts.find((x) => x.id === postId)!;
					p.ideaApproval = { status: "approved", by: who(), at: nowIso() };
					setState(p, "briefed");
					audit(dd, who(), "approved idea", p.title, auto ? "Autopost on · the agents take it from here" : `Briefed · the writer picks it up in W${p.week}`);
					// Under autopost the blog writer briefs it and starts drafting straight away (cap-checked when it starts).
					if (auto) pushJob(d, SID, "autopost-brief", SIM_MS.brief, { postId });
				},
				auto ? undefined : "Approve idea",
			);
			if (auto) toast({ text: "Idea approved · the agents take it from here: draft, images, gate, merge request", tone: "agent", href: `/posts/${postId}` });
			else toast({ text: `Idea approved · briefed for W${post.week}`, tone: "neutral", undo: true });
			return ok();
		},

		rejectIdea(postId, note) {
			const g = guard("idea.approve");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (post.state !== "idea") return fail("Only ideas can be rejected. Later posts are sent back instead");
			const why = note.trim();
			if (why.length < 3) return fail("Add a short note: why not this idea?");
			set((d) => {
				const dd = dataOf(d, SID);
				const p = dd.posts.find((x) => x.id === postId)!;
				dd.posts = dd.posts.filter((x) => x.id !== postId);
				dd.rejectedIdeas = [{ ...p, ideaApproval: { status: "rejected", by: who(), at: nowIso(), note: why } }, ...(dd.rejectedIdeas ?? [])];
				audit(dd, who(), "rejected idea", p.title, `"${why}"`);
			}, "Reject idea");
			toast({ text: `Idea rejected · ${post.title}`, tone: "neutral", undo: true });
			return ok();
		},

		shipNow(postId) {
			const g = guard("post.approve");
			if (g) return g;
			const pz = pausedGuard();
			if (pz) return pz;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (!autopostOn(site())) return fail("Autopost is off for this site. Approve it in Approvals");
			if (post.state !== "needs-assets" && post.state !== "in-review") return fail("Ship now works once the draft exists (Needs assets or In review)");
			const inFlight = (slotId: string) => st().jobs.some((j) => j.kind === "slot-candidates" && j.siteId === SID && j.payload.slotId === slotId);
			if (data().slots.some((x) => x.postId === postId && x.status === "generating" && inFlight(x.id))) return fail("Wait for image generation to finish");
			const toasts: TToastIn[] = [];
			let res: TResult = { ok: false, reason: "Not run" };
			set((d) => {
				d.jobs = d.jobs.filter((j) => !(j.kind === "autopost-gate" && j.siteId === SID && j.payload.postId === postId));
				// A "generating" slot with no provider call in flight is stalled: the visual-asset agent re-queues and fills it.
				for (const x of dataOf(d, SID).slots) if (x.postId === postId && x.status === "generating" && !inFlight(x.id)) x.status = "queued";
				audit(dataOf(d, SID), who(), "ran autopost gate", post.title, "Ship now");
				res = runAutopostGate(d, SID, postId, toasts);
			});
			for (const t of toasts) toast(t);
			return res;
		},

		setAutopost(siteId, on) {
			const g = guardOn(siteId, "publishing.set");
			if (g) return g;
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (autopostOn(s) === on) return ok();
			set((d) => {
				const x = siteOf(d, siteId);
				x.publishing = { ...(x.publishing ?? { autoMergeOnGreenCi: false }), autopost: on };
				audit(dataOf(d, siteId), who(), on ? "turned autopost on" : "turned autopost off", s.name, on ? "Content ships without review · hard blocks still hold the post" : "Every post stops at In review for a person");
			}, "Autopost");
			toast({ text: on ? `Autopost on · ${s.name} ships approved ideas without review` : `Autopost off · ${s.name} posts stop at In review`, tone: on ? "agent" : "neutral", undo: true });
			return ok();
		},

		setAutoMerge(siteId, on) {
			const g = guardOn(siteId, "publishing.autoMerge");
			if (g) return g;
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (!!s.publishing?.autoMergeOnGreenCi === on) return ok();
			set((d) => {
				const x = siteOf(d, siteId);
				x.publishing = { ...(x.publishing ?? { autopost: false }), autoMergeOnGreenCi: on };
				audit(dataOf(d, siteId), who(), on ? "turned auto-merge on" : "turned auto-merge off", s.name, on ? "Autopost MRs merge when the repo's CI passes" : "A developer merges every MR");
			}, "Auto-merge");
			toast({ text: on ? "Auto-merge on · autopost MRs merge on green CI" : "Auto-merge off · a developer merges every MR", tone: "neutral", undo: true });
			return ok();
		},

		setSlotCandidates(slotId, candidates, meta) {
			const g = guard("asset.manage");
			if (g) return g;
			const s = getSlot(slotId);
			if (!s) return fail("Slot not found");
			if (s.type === "chart") return fail("Charts are rendered from the post's data, never generated");
			if (!candidates.length) return fail("No candidates to show");
			const toasts: TToastIn[] = [];
			set((d) => {
				const dd = dataOf(d, SID);
				const slot = dd.slots.find((x) => x.id === slotId)!;
				if (meta) {
					slot.provider = meta.provider;
					if (meta.model) slot.model = meta.model;
				}
				slot.candidates = candidates.map((c, i) => ({
					...c,
					id: c.id || `${slotId}-c${i + 1}`,
					label: c.label || `candidate ${i + 1}`,
					source: c.source ?? { kind: slot.provider === "inline-svg" ? "diagram" : "generated", provider: slot.provider, ...(slot.model ? { model: slot.model } : {}) },
				}));
				slot.status = "candidates";
				slot.generatedAt = nowIso();
				delete slot.humanPinned;
				closeLedgerFor(dd, (l) => l.slotId === slotId);
				const kinds = [...new Set(slot.candidates.map((c) => c.source!.kind))].join(", ");
				audit(dd, VISUAL_AGENT, "returned candidates", slot.name, `${slot.candidates.length} · ${kinds} · ${slot.provider}${slot.model ? ` · ${slot.model}` : ""}`);
				onCandidatesArrived(d, SID, slot, toasts);
			});
			toast({ text: `${candidates.length} candidate${candidates.length > 1 ? "s" : ""} ready · ${s.name}`, tone: "agent", href: `/posts/${s.postId}/assets?slot=${slotId}` });
			for (const t of toasts) toast(t);
			return ok();
		},

		promoteToBrief(postId) {
			const g = guard("post.promote");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (isPendingIdea(post)) return actions.approveIdea(postId);
			const blocked = ideaGate(post);
			if (blocked) return fail(blocked);
			const t = nextState(post.state, "briefed");
			if (!t.ok) return fail(t.reason);
			withPost(postId, (p, d, dd) => {
				setState(p, "briefed");
				audit(dd, who(), "promoted to brief", p.title);
			});
			toast({ text: "Promoted to brief · the blog writer picks it up at the next publish slot", tone: "agent" });
			return ok();
		},

		generateNow(postId) {
			const g = guard("post.generate");
			if (g) return g;
			const pz = pausedGuard();
			if (pz) return pz;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			// Only an approved idea becomes a brief (C10): approve it first, then generate.
			const blocked = ideaGate(post);
			if (blocked) return fail(blocked);
			if (!["briefed", "decaying"].includes(post.state)) return fail(`Generate now works on Briefed or Decaying posts, not ${post.state.replace("-", " ")}`);
			const strong = post.strongModel || post.contentType === "pillar" || post.contentType === "money-page";
			const est = estimateRun("post-generation", site(), { strongModel: strong });
			const c = checkCap(site(), "post-generation", est);
			if (c.status === "refused") {
				set((d) => refuseRun(dataOf(d, SID), "post-generation", "manual", est, c, who(), { postId }));
				return fail(c.message);
			}
			set((d) => startGeneration(d, SID, postId, est, c, who(), "manual"));
			toast({ text: `Generating · ${c.message}`, tone: "agent" });
			return ok();
		},

		movePostToWeek(postId, week) {
			const g = guard("post.schedule");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (post.state !== "idea" && post.state !== "briefed") return fail("Only planned posts (Idea, Briefed) can be rescheduled");
			if (!Number.isInteger(week) || week < isoWeek() || week > 53) return fail("Pick this week or a later one");
			if (week === post.week) return ok();
			withPost(
				postId,
				(p, d, dd) => {
					audit(dd, who(), "rescheduled", p.title, `W${p.week} → W${week} · generation run moves with it`);
					p.week = week;
				},
				`Move to W${week}`,
			);
			toast({ text: `Moved to W${week} · generation run rescheduled`, tone: "neutral", undo: true });
			return ok();
		},

		acceptSuggestion(postId, suggestionId) {
			const g = guard("post.edit");
			if (g) return g;
			const s = getPost(postId)?.suggestions.find((x) => x.id === suggestionId);
			if (!s || s.status !== "pending") return fail("This suggestion is no longer pending");
			withPost(
				postId,
				(p, d, dd) => {
					const sg = p.suggestions.find((x) => x.id === suggestionId)!;
					const idx = p.blocks.findIndex((b) => b.id === sg.blockId);
					if (sg.insertKind) {
						const block: IPostBlock = { id: uid("b"), kind: sg.insertKind, text: sg.after };
						p.blocks.splice(idx >= 0 ? idx + 1 : p.blocks.length, 0, block);
						p.words += countWords(sg.after);
					} else if (idx >= 0) {
						const b = p.blocks[idx];
						const before = b.text;
						b.text = sg.before && b.text.includes(sg.before) ? b.text.replace(sg.before, sg.after) : sg.after;
						p.words = Math.max(0, p.words + countWords(b.text) - countWords(before));
					}
					if (sg.fixesCheckId) {
						const c = p.gate.find((x) => x.id === sg.fixesCheckId);
						if (c) {
							c.status = "pass";
							c.value = c.id === "kw-first-100" ? "Word 9" : c.id === "internal-links" ? "2 of 2" : c.id === "faq" ? "2 questions" : c.value;
						}
						if (sg.fixesCheckId === "word-count") p.words = Math.max(p.words, p.wordTarget);
					}
					if (sg.resolvesFactId) {
						const f = p.facts.find((x) => x.id === sg.resolvesFactId);
						if (f) {
							f.status = "resolved";
							f.note = "Rewritten without the claim.";
						}
						for (const b of p.blocks) if (b.factMarkerIds) b.factMarkerIds = b.factMarkerIds.filter((x) => x !== sg.resolvesFactId);
					}
					sg.status = "accepted";
					addVersion(p, "agent-edit", RUN_META["post-generation"].agent, `"${sg.instruction}" · accepted by ${who()}`);
					audit(dd, who(), "accepted agent edit", p.title, `"${sg.instruction}"`);
				},
				"Accept agent edit",
			);
			toast({ text: "Agent edit accepted", tone: "neutral", undo: true });
			return ok();
		},

		rejectSuggestion(postId, suggestionId) {
			const g = guard("post.edit");
			if (g) return g;
			const s = getPost(postId)?.suggestions.find((x) => x.id === suggestionId);
			if (!s || s.status !== "pending") return fail("This suggestion is no longer pending");
			withPost(
				postId,
				(p, d, dd) => {
					p.suggestions.find((x) => x.id === suggestionId)!.status = "rejected";
					audit(dd, who(), "rejected agent edit", p.title, `"${s.instruction}"`);
				},
				"Reject agent edit",
			);
			toast({ text: "Agent edit rejected · content unchanged", tone: "neutral", undo: true });
			return ok();
		},

		instructAgent(postId, instruction, blockId) {
			const g = guard("post.edit");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (!instruction.trim()) return fail("Tell the agent what to change");
			if (!post.blocks.length) return fail("There's no draft yet. Generate one first");
			const proposal = proposeEdit(post, keywordOf(post), instruction.trim(), blockId);
			if (!proposal) return fail("The agent found nothing to change for that instruction");
			return queueSuggestion(post, proposal, "instructed agent");
		},

		editBlock(postId, blockId, text) {
			const g = guard("post.edit");
			if (g) return g;
			const lk = lockGuard(postId);
			if (lk) return lk;
			const block = getPost(postId)?.blocks.find((b) => b.id === blockId);
			if (!block) return fail("Block not found");
			if (block.text === text) return ok();
			withPost(
				postId,
				(p, d, dd) => {
					const b = p.blocks.find((x) => x.id === blockId)!;
					p.words = Math.max(0, p.words + countWords(text) - countWords(b.text));
					b.text = text;
					// Deleting an unsourced claim resolves its marker; keeping it keeps the block.
					for (const fid of b.factMarkerIds ?? []) {
						const f = p.facts.find((x) => x.id === fid);
						if (f && f.status === "open" && !text.includes(f.claim)) {
							f.status = "resolved";
							f.note = `Removed by ${who()}.`;
						}
					}
					b.factMarkerIds = (b.factMarkerIds ?? []).filter((fid) => p.facts.find((x) => x.id === fid)?.status === "open");
					if (!b.factMarkerIds.length) delete b.factMarkerIds;
					addVersion(p, "human-edit", who());
					audit(dd, who(), "edited", p.title, `v${p.versions[p.versions.length - 1].n} · human edit`);
				},
				"Edit",
			);
			toast({ text: "Saved as a new version", tone: "neutral", undo: true });
			return ok();
		},

		editSeoTitle(postId, seoTitle) {
			const g = guard("post.edit");
			if (g) return g;
			const lk = lockGuard(postId);
			if (lk) return lk;
			const t = seoTitle.trim();
			if (!t) return fail("The SEO title can't be empty");
			withPost(
				postId,
				(p, d, dd) => {
					p.seoTitle = t;
					for (const c of p.gate)
						if (c.id === "title-length") {
							c.value = `${t.length} / 60`;
							c.status = t.length <= 60 ? "pass" : "fail";
						} else if (c.id === "title-front") c.value = `${t.length} ch`;
					audit(dd, who(), "edited SEO title", p.title, t);
				},
				"SEO title",
			);
			return ok();
		},

		restoreVersion(postId, versionId) {
			const g = guard("post.edit");
			if (g) return g;
			const v = getPost(postId)?.versions.find((x) => x.id === versionId);
			if (!v) return fail("Version not found");
			if (!v.blocks) return fail("This version predates stored content and can only be viewed");
			withPost(
				postId,
				(p, d, dd) => {
					p.blocks = clone(v.blocks!);
					p.words = v.words;
					if (v.seoTitle) p.seoTitle = v.seoTitle;
					addVersion(p, "human-edit", who(), `Restored v${v.n}`);
					audit(dd, who(), "restored version", p.title, `v${v.n}`);
				},
				`Restore v${v.n}`,
			);
			toast({ text: `Restored v${v.n} as a new version`, tone: "neutral", undo: true });
			return ok();
		},

		addFactSource(postId, markerId, url) {
			const g = guard("post.edit");
			if (g) return g;
			const f = getPost(postId)?.facts.find((x) => x.id === markerId);
			if (!f) return fail("Fact marker not found");
			if (!/^https?:\/\/[^\s/]+\.[^\s]+$/.test(url.trim())) return fail("Paste a full source URL (https://…)");
			withPost(
				postId,
				(p, d, dd) => {
					const m = p.facts.find((x) => x.id === markerId)!;
					m.status = "resolved";
					m.source = url.trim();
					m.note = `Source added by ${who()}.`;
					for (const b of p.blocks) if (b.factMarkerIds) b.factMarkerIds = b.factMarkerIds.filter((x) => x !== markerId);
					audit(dd, who(), "added source", p.title, `"${m.claim}" · ${m.source}`);
				},
				"Add source",
			);
			toast({ text: "Source added · marker resolved", tone: "pass", undo: true });
			return ok();
		},

		rewriteFactWithout(postId, markerId) {
			const g = guard("post.edit");
			if (g) return g;
			const post = getPost(postId);
			const f = post?.facts.find((x) => x.id === markerId);
			if (!post || !f) return fail("Fact marker not found");
			if (f.status !== "open") return fail("This marker is already resolved");
			const block = post.blocks.find((b) => b.factMarkerIds?.includes(markerId)) ?? post.blocks.find((b) => b.text.includes(f.claim));
			if (!block) return fail("The claim is no longer in the draft");
			return queueSuggestion(post, { instruction: "rewrite without the unsourced claim", blockId: block.id, before: block.text, after: rewriteWithout(block.text, f.claim), resolvesFactId: markerId }, "asked agent to rewrite");
		},

		fixCheck(postId, checkId) {
			const g = guard("post.edit");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			const check = gateChecks(post).find((c) => c.id === checkId);
			if (!check) return fail("Check not found");
			if (check.status === "pass") return fail("Already passing");
			const kwTerm = keywordOf(post);
			if (checkId === "schema") {
				withPost(postId, (p, d, dd) => {
					const c = p.gate.find((x) => x.id === "schema");
					if (c) Object.assign(c, { status: "pass", value: "Article" });
					audit(dd, "On-page optimizer", "fixed check", p.title, "Schema ready · Article");
				});
				return ok();
			}
			let proposal: TProposal | null = null;
			if (checkId === "kw-first-100") proposal = proposeEdit(post, kwTerm, "put keyword in intro");
			else if (checkId === "faq") proposal = proposeEdit(post, kwTerm, "add an FAQ");
			else if (checkId === "internal-links") {
				const related = data().posts.find((x) => x.id !== post.id && x.pillarId === post.pillarId && (x.state === "live" || x.state === "decaying"));
				const target = textBlocks(post)[textBlocks(post).length - 1];
				if (!related || !target) return fail("No related live page in this pillar to link to yet");
				proposal = { instruction: "add an internal link", blockId: target.id, before: target.text, after: `${target.text} See [${related.title}](${postUrl(related)}) for more.`, fixesCheckId: "internal-links" };
			} else if (checkId === "word-count") {
				const anchor = lastContentBlock(post);
				if (!anchor) return fail("There's no draft yet");
				proposal = { instruction: "expand to the word target", blockId: anchor.id, before: "", after: `What to ask at your consultation. Bring your questions about ${kwTerm}: how long it takes, what it costs in total, what happens if you need a follow-up, and how the clinic handles aftercare.`, insertKind: "p", fixesCheckId: "word-count" };
			} else if (checkId === "disclaimer") {
				const text = post.regulated ? data().brandPack.disclaimers[post.regulated] : undefined;
				proposal = { instruction: "add the regulated-topic disclaimer", blockId: post.blocks[post.blocks.length - 1]?.id ?? "", before: "", after: text ?? `This article is general information, not ${post.regulated ?? "professional"} advice.`, insertKind: "disclaimer" };
			} else proposal = proposeEdit(post, kwTerm, `fix: ${check.label.toLowerCase()}`);
			if (!proposal) return fail("The agent can't fix this automatically. Edit it directly");
			if (!proposal.fixesCheckId && post.gate.some((c) => c.id === checkId)) proposal.fixesCheckId = checkId;
			return queueSuggestion(post, proposal, "asked agent to fix");
		},

		overrideCheck(postId, checkId, reason) {
			const g = guard("gate.override");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			const check = gateChecks(post).find((c) => c.id === checkId);
			if (!check) return fail("Check not found");
			if (isHardFail(check)) return fail("Hard blocks can't be overridden. Fix them to approve");
			if (check.status === "pass") return fail("This check is already passing");
			const why = reason.trim();
			if (why.length < 8) return fail("Add a reason. It's logged to the audit trail and listed in the MR");
			withPost(
				postId,
				(p, d, dd) => {
					const override = { reason: why, by: who(), at: nowIso() };
					const existing = p.gate.find((c) => c.id === checkId);
					if (existing) existing.override = override;
					else p.gate.push({ ...check, override });
					audit(dd, who(), "overrode soft block", p.title, `${check.label} ${check.value} · "${why}"`);
				},
				"Override",
			);
			toast({ text: "Override logged to the audit trail and listed in the MR", tone: "human", undo: true });
			return ok();
		},

		pickCandidate(slotId, candidateId) {
			const g = guard("asset.manage");
			if (g) return g;
			const s = getSlot(slotId);
			if (!s?.candidates.some((c) => c.id === candidateId)) return fail("Candidate not found");
			set((d) => {
				const slot = dataOf(d, SID).slots.find((x) => x.id === slotId)!;
				for (const c of slot.candidates) c.selected = c.id === candidateId;
			}, "Pick candidate");
			return ok();
		},

		useCandidate(slotId) {
			const g = guard("asset.manage");
			if (g) return g;
			const s = getSlot(slotId);
			if (!s) return fail("Slot not found");
			const pick = s.candidates.find((c) => c.selected);
			if (!pick) return fail("Pick a candidate first");
			const toasts: TToastIn[] = [];
			set((d) => {
				const dd = dataOf(d, SID);
				const slot = dd.slots.find((x) => x.id === slotId)!;
				slot.status = "selected";
				audit(dd, who(), "selected asset", slot.name, `${pick.label} · ${slot.provider} · ${slot.model} · ${slot.filename}`);
				maybeAdvanceAssets(d, SID, slot.postId, toasts);
			}, "Use candidate");
			toast({ text: "Compressed, resized and committed with the post", tone: "pass", undo: true });
			for (const t of toasts) toast(t);
			return ok();
		},

		regenerateSlot(slotId, prompt) {
			const g = guard("asset.manage");
			if (g) return g;
			const pz = pausedGuard();
			if (pz) return pz;
			const s = getSlot(slotId);
			if (!s) return fail("Slot not found");
			if (s.provider === "inline-svg") return fail("Charts are rendered from the post's data, never generated");
			if (s.status === "generating") return fail("Already generating");
			const provider: TProvider = s.provider === "human" ? (data().routing[s.type] === "human" ? "open-source" : data().routing[s.type]) : s.provider;
			const est: IEstimate = { usd: s.estimateUsd || estimateRun("image-generation", site()).usd, budget: "image", tier: "workhorse" };
			const c = checkCap(site(), "image-generation", est);
			if (c.status === "refused") {
				set((d) => refuseRun(dataOf(d, SID), "image-generation", "manual", est, c, who(), { postId: s.postId, slotId }));
				return fail(c.message);
			}
			set((d) => {
				const dd = dataOf(d, SID);
				const slot = dd.slots.find((x) => x.id === slotId)!;
				if (prompt?.trim()) slot.prompt = prompt.trim();
				slot.provider = provider;
				if (slot.model === "—" || slot.model === "upload") slot.model = provider === "higgsfield" ? "higgsfield-preset" : provider === "openai" ? "openai-image" : "flux-dev";
				slot.status = "generating";
				slot.candidates = [];
				if (!slot.estimateUsd) slot.estimateUsd = est.usd;
				const r = startRun(dd, "image-generation", "manual", est, { postId: slot.postId, slotId, model: slot.model, output: "Generating candidates" });
				pushJob(d, SID, "slot-candidates", SIM_MS.candidates, { slotId, runId: r.id });
				closeLedgerFor(dd, (l) => l.slotId === slotId);
				audit(dd, who(), "regenerated slot", slot.name, `${slot.model} · est. ${fmtUsd(est.usd)}${prompt?.trim() ? " · edited prompt" : ""}`);
				warnIfNearCap(dd, c);
			});
			toast({ text: `Regenerating · ${c.message}`, tone: "agent" });
			return ok();
		},

		uploadOwn(slotId, fileName) {
			const g = guard("asset.manage");
			if (g) return g;
			const s = getSlot(slotId);
			if (!s) return fail("Slot not found");
			if (!/\.(png|jpe?g|webp|avif|svg)$/i.test(fileName.trim())) return fail("Upload a PNG, JPG, WebP, AVIF or SVG");
			const toasts: TToastIn[] = [];
			set((d) => {
				const dd = dataOf(d, SID);
				const slot = dd.slots.find((x) => x.id === slotId)!;
				for (const c of slot.candidates) c.selected = false;
				slot.candidates.push({ id: uid("up"), label: fileName.trim(), hue: hueFor(fileName, 0), selected: true });
				slot.provider = "human";
				slot.model = "upload";
				slot.status = "selected";
				slot.generatedAt = nowIso();
				closeLedgerFor(dd, (l) => l.slotId === slotId);
				audit(dd, who(), "uploaded asset", slot.name, `${fileName.trim()} → ${slot.filename}`);
				maybeAdvanceAssets(d, SID, slot.postId, toasts);
			}, "Upload");
			toast({ text: `Uploaded · converted to ${s.format.toUpperCase()} and renamed ${s.filename}`, tone: "pass", undo: true });
			for (const t of toasts) toast(t);
			return ok();
		},

		markHumanOnly(slotId) {
			const g = guard("asset.manage");
			if (g) return g;
			const s = getSlot(slotId);
			if (!s) return fail("Slot not found");
			if (s.status === "human-only") return ok();
			set((d) => {
				const dd = dataOf(d, SID);
				const slot = dd.slots.find((x) => x.id === slotId)!;
				const post = dd.posts.find((p) => p.id === slot.postId);
				slot.status = "human-only";
				slot.humanPinned = true;
				slot.provider = "human";
				slot.model = "—";
				for (const c of slot.candidates) c.selected = false;
				dd.ledger.unshift({ id: uid("l"), title: `${slot.name} · ${post?.title ?? "post"}`, owner: who(), createdAt: nowIso(), ageDays: 0, downstream: "holds 1 post in Needs assets", postId: slot.postId, slotId });
				if (post && post.state === "in-review") setState(post, "needs-assets");
				audit(dd, who(), "marked human-only", slot.name, post?.title);
			}, "Mark human-only");
			toast({ text: "Sent to your task queue with the brief attached · the post holds in Needs assets", tone: "human", undo: true });
			return ok();
		},

		sendToReview(postId) {
			const g = guard("post.sendToReview");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			const t = nextState(post.state, "in-review");
			if (!t.ok) return fail(t.reason);
			if (post.state === "drafting" && !post.blocks.length) return fail("The draft isn't ready yet");
			const unfilled = data().slots.filter((s) => s.postId === postId && !isFilled(s)).length;
			withPost(postId, (p, d, dd) => {
				setState(p, "in-review");
				notify(dd, "human", "Approval requested", `${p.title} is ready for review.`, `/approvals?post=${p.id}`);
				audit(dd, who(), "sent to review", p.title, unfilled ? `${unfilled} slot(s) still unfilled · blocks approval` : undefined);
			});
			toast({ text: unfilled ? `In review · ${unfilled} unfilled slot${unfilled > 1 ? "s" : ""} will block approval` : "In review", tone: unfilled ? "human" : "neutral" });
			return ok();
		},

		sendBack(postId, note) {
			const g = guard("post.sendBack");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (post.state !== "in-review") return fail("Only posts in review can be sent back");
			if (!note.trim()) return fail("Tell the agent what to change");
			const est: IEstimate = { usd: 0.4, budget: "text", tier: "workhorse" };
			const c = checkCap(site(), "post-generation", est);
			if (c.status === "refused") {
				set((d) => refuseRun(dataOf(d, SID), "post-generation", "manual", est, c, who(), { postId }));
				return fail(c.message);
			}
			withPost(postId, (p, d, dd) => {
				setState(p, "drafting");
				p.sendBackNote = note.trim();
				p.progress = { label: "Revising from your note", value: 20 };
				p.comments.push({ id: uid("c"), by: who(), role: roleNow(), text: `Sent back: ${note.trim()}`, at: nowIso() });
				const r = startRun(dd, "post-generation", "manual", est, { postId, output: "Revising from note" });
				pushJob(d, SID, "revise-complete", SIM_MS.revise, { postId, runId: r.id });
				closeLedgerFor(dd, (l) => l.postId === postId && (/review/i.test(l.title) || l.kind === "autopost-hold"));
				audit(dd, who(), "sent back", p.title, `"${note.trim()}"`);
			});
			toast({ text: "Sent back · the agent is revising", tone: "agent" });
			return ok();
		},

		approve(postId, overrides = {}) {
			const g = guard("post.approve");
			if (g) return g;
			const post = getPost(postId);
			if (!post) return fail("Post not found");
			if (post.state !== "in-review") return fail("Only posts in review can be approved");
			const s = site();
			if (!s.repo) return fail("Connect a repo first. The MR needs somewhere to open");
			const manifest = activeManifest(data());
			const gate = evaluateGate(post, data().slots, manifest, overrides);
			if (!gate.canApprove || !manifest) {
				if (gate.hard.length) return fail(`${gate.hard.length} hard block${gate.hard.length > 1 ? "s" : ""}: ${gate.hard.join(" · ")}`);
				return fail("Soft blocks need a logged reason to override");
			}
			const repo = s.repo;
			let mr: IMergeRequest | null = null;
			set((d) => {
				mr = openMergeRequest(d, SID, postId, gate, manifest, who(), { explicit: overrides });
			});
			const opened = mr as IMergeRequest | null;
			toast({ text: `MR #${opened?.number ?? ""} opened on ${repo.host === "github" ? "GitHub" : "GitLab"}`, tone: "pass", href: "/merge-requests" });
			return ok(opened?.id);
		},

		mergeMr(mrId) {
			const g = guard("mr.merge");
			if (g) return g;
			const mr = getMr(mrId);
			if (!mr) return fail("Merge request not found");
			if (mr.status === "conflict") return fail("Conflict with the base branch. Rebase first");
			if (mr.status !== "open") return fail(`This MR is ${mr.status}`);
			if (mr.ci === "failing") return fail("CI is failing. Fix the build before merging");
			if (mr.ci === "pending") return fail("CI is still running");
			set((d) => mergeInDraft(d, SID, mrId, who()));
			toast({ text: `${mrRef(mr)} merged · post is Live · KAS recalculates in 24 h`, tone: "pass" });
			return ok();
		},

		rebaseMr(mrId) {
			const g = guard("mr.rebase");
			if (g) return g;
			const mr = getMr(mrId);
			if (!mr) return fail("Merge request not found");
			if (mr.status !== "conflict" && mr.ci !== "failing") return fail("Nothing to rebase: the MR applies cleanly");
			const manifest = activeManifest(data());
			set((d) => {
				const dd = dataOf(d, SID);
				const m = dd.mergeRequests.find((x) => x.id === mrId)!;
				m.status = "open";
				m.ci = "pending";
				delete m.conflictDetail;
				delete m.ciDetail;
				if (manifest) m.manifestVersion = manifest.version;
				audit(dd, who(), "rebased and re-rendered", `${mrRef(m)} ${m.branch}`, `onto ${m.base} · manifest v${manifest?.version ?? "?"}`);
				pushJob(d, SID, "ci-result", SIM_MS.ci, { mrId, result: "passing" });
			});
			toast({ text: `${mrRef(mr)} rebased and re-rendered · CI running`, tone: "agent" });
			return ok();
		},

		confirmManifest(manifestId) {
			const g = guard("template.confirm");
			if (g) return g;
			const m = data().manifests.find((x) => x.id === manifestId);
			if (!m) return fail("Manifest not found");
			if (m.status !== "needs-confirmation") return fail(m.status === "parsing" ? "Still parsing" : `Manifest v${m.version} is ${m.status}`);
			const left = m.mappings.filter((x) => x.status === "needs-you").length;
			if (left) return fail(`Map ${left} item${left > 1 ? "s" : ""} first`);
			set((d) => {
				const dd = dataOf(d, SID);
				for (const x of dd.manifests) if (x.status === "confirmed") x.status = "superseded";
				const mm = dd.manifests.find((x) => x.id === manifestId)!;
				mm.status = "confirmed";
				mm.confirmedBy = who();
				mm.confirmedAt = nowIso();
				audit(dd, who(), "confirmed manifest", `Template manifest v${mm.version}`, `${mm.source} · output ${mm.output.toUpperCase()}`);
			});
			toast({ text: `Manifest v${m.version} confirmed · new posts render into it`, tone: "pass" });
			return ok();
		},

		mapTemplateItem(manifestId, mappingId, role, label) {
			const g = guard("template.confirm");
			if (g) return g;
			const m = data().manifests.find((x) => x.id === manifestId);
			const map = m?.mappings.find((x) => x.id === mappingId);
			if (!m || !map) return fail("Mapping not found");
			if (m.status === "confirmed" || m.status === "superseded") return fail("Confirmed manifests are versioned. Re-ingest to change them");
			set((d) => {
				const dd = dataOf(d, SID);
				const mp = dd.manifests.find((x) => x.id === manifestId)!.mappings.find((x) => x.id === mappingId)!;
				mp.role = role;
				mp.status = "mapped";
				if (label) mp.label = label;
				audit(dd, who(), "mapped template item", mp.selector, label ?? role);
			}, "Map item");
			return ok();
		},

		ingestTemplate(fileName, kind, parsed) {
			const g = guard("template.ingest");
			if (g) return g;
			const name = fileName.trim();
			if (kind === "zip" && !/\.zip$/i.test(name)) return fail("Upload a .zip with the template, partials, CSS and a sample post");
			if (kind === "html" && !/\.html?$/i.test(name)) return fail("Upload one rendered blog post as .html");
			const id = uid("tm");
			if (parsed) {
				if (!parsed.mappings.length) return fail("The parser found nothing to map. Upload one rendered blog post");
				const mapped = parsed.mappings.filter((x) => x.status === "mapped").length;
				const needs = parsed.mappings.filter((x) => x.status === "needs-you").length;
				set((d) => {
					const dd = dataOf(d, SID);
					const version = dd.manifests.reduce((mx, x) => Math.max(mx, x.version), 0) + 1;
					dd.manifests.push({
						id,
						version,
						source: parsed.source?.trim() || `${name} · ${kind === "zip" ? "archive" : "1 file"}`,
						kind,
						output: activeManifest(dd)?.output ?? "mdx",
						status: "needs-confirmation",
						mappings: clone(parsed.mappings),
						...(parsed.sampleHtml ? { sampleHtml: parsed.sampleHtml } : {}),
					});
					audit(dd, who(), "uploaded template", name, `v${version} · parsed in the browser`);
					audit(dd, "CMS agent", "parsed template", `Template manifest v${version}`, `${mapped} mapped · ${needs} need you`);
				});
				toast({ text: `Parsed · ${mapped} mapped · ${needs} need you`, tone: "agent", href: "/templates/ingest" });
				return ok(id);
			}
			set((d) => {
				const dd = dataOf(d, SID);
				const version = dd.manifests.reduce((mx, x) => Math.max(mx, x.version), 0) + 1;
				dd.manifests.push({ id, version, source: `${name} · ${kind === "zip" ? "38 files" : "1 file"}`, kind, output: activeManifest(dd)?.output ?? "mdx", status: "parsing", mappings: [] });
				pushJob(d, SID, "template-parsed", SIM_MS.parse, { manifestId: id });
				audit(dd, who(), "uploaded template", name, `v${version} · parsing`);
			});
			return ok(id);
		},

		setOutputFormat(manifestId, output) {
			const g = guard("template.confirm");
			if (g) return g;
			if (!data().manifests.some((x) => x.id === manifestId)) return fail("Manifest not found");
			set((d) => {
				const dd = dataOf(d, SID);
				const m = dd.manifests.find((x) => x.id === manifestId)!;
				m.output = output;
				audit(dd, who(), "set output format", `Template manifest v${m.version}`, output.toUpperCase());
			}, "Output format");
			return ok();
		},

		connectRepo(siteId, conn) {
			const g = guardOn(siteId, "repo.connect");
			if (g) return g;
			if (!st().sites.some((s) => s.id === siteId)) return fail("Unknown site");
			if (!conn.repo.includes("/")) return fail("Use owner/repo");
			if (!conn.contentDir.trim() || !conn.assetDir.trim()) return fail("Declare the content and asset directories");
			if (!conn.branchPattern.includes("{slug}")) return fail("The branch pattern must include {slug}");
			if (!conn.baseBranch.trim()) return fail("Name the base branch");
			set((d) => {
				siteOf(d, siteId).repo = { ...conn };
				const dd = dataOf(d, siteId);
				audit(dd, who(), "connected repo", `${conn.host === "github" ? "GitHub" : "GitLab"} ${conn.repo}`, `Writes only to ${conn.contentDir} and ${conn.assetDir} · never pushes to ${conn.baseBranch}`);
				notify(dd, "pass", "Repo connected", `${conn.repo} · path-scoped to ${conn.contentDir} and ${conn.assetDir}`, "/settings");
			});
			toast({ text: `Connected ${conn.repo} · scope: ${conn.contentDir}, ${conn.assetDir}`, tone: "pass" });
			return ok();
		},

		connectSearchConsole(siteId) {
			const g = guardOn(siteId, "searchConsole.connect");
			if (g) return g;
			const s = st().sites.find((x) => x.id === siteId);
			if (!s) return fail("Unknown site");
			if (s.searchConsole === "connected") return ok();
			set((d) => {
				siteOf(d, siteId).searchConsole = "connected";
				const dd = dataOf(d, siteId);
				closeLedgerFor(dd, (l) => /search console/i.test(l.title));
				audit(dd, who(), "connected Search Console", s.domain, "OAuth · positions, impressions, indexing");
			});
			toast({ text: "Search Console connected · first data lands in 2–3 days. Past gaps stay gaps", tone: "pass" });
			return ok();
		},

		runNow(kind) {
			const g = guard("run.trigger");
			if (g) return g;
			const pz = pausedGuard();
			if (pz) return pz;
			if (kind === "post-generation") {
				const next = data()
					.posts.filter((p) => p.state === "briefed")
					.sort((a, b) => a.week - b.week)[0];
				if (!next) return fail("No briefed posts to generate. Promote an idea first");
				return actions.generateNow(next.id);
			}
			if (kind === "image-generation") {
				const next = data().slots.find((s) => s.status === "queued" || s.status === "failed");
				if (!next) return fail("No slots waiting for generation");
				return actions.regenerateSlot(next.id);
			}
			const est = estimateRun(kind, site());
			const c = checkCap(site(), kind, est);
			if (c.status === "refused") {
				set((d) => refuseRun(dataOf(d, SID), kind, "manual", est, c, who()));
				return fail(c.message);
			}
			set((d) => {
				const dd = dataOf(d, SID);
				const r = startRun(dd, kind, "manual", est);
				pushJob(d, SID, "run-complete", SIM_MS.run, { runId: r.id });
				audit(dd, who(), "triggered run", RUN_META[kind].label, c.message);
				warnIfNearCap(dd, c);
			});
			toast({ text: `${RUN_META[kind].label} running · ${c.message}`, tone: "agent" });
			return ok();
		},

		toggleSchedule(kind) {
			const g = guard("schedule.toggle");
			if (g) return g;
			if (!data().schedules.some((s) => s.kind === kind)) return fail("Schedule not found");
			set((d) => {
				const dd = dataOf(d, SID);
				const s = dd.schedules.find((x) => x.kind === kind)!;
				s.enabled = !s.enabled;
				audit(dd, who(), s.enabled ? "resumed schedule" : "paused schedule", s.label);
			}, "Schedule");
			return ok();
		},

		setBudget(kind, capUsd) {
			const g = guard("budget.set");
			if (g) return g;
			if (!Number.isFinite(capUsd) || capUsd < 0) return fail("Enter a monthly cap in dollars");
			const before = kind === "text" ? site().budgets.textCapUsd : site().budgets.imageCapUsd;
			set((d) => {
				const s = siteOf(d, SID);
				if (kind === "text") s.budgets.textCapUsd = round2(capUsd);
				else s.budgets.imageCapUsd = round2(capUsd);
				audit(dataOf(d, SID), who(), "changed budget", `${cap1(kind)} generation cap`, `${fmtUsd(before)} → ${fmtUsd(capUsd)} / month`);
			}, "Budget");
			toast({ text: `${cap1(kind)} cap set to ${fmtUsd(capUsd)} / month`, tone: "neutral", undo: true });
			return ok();
		},

		setRouting(slotType, provider) {
			const g = guard("routing.set");
			if (g) return g;
			if (slotType === "chart" && provider !== "inline-svg") return fail("Charts are never generated. They render as inline SVG");
			set((d) => {
				const dd = dataOf(d, SID);
				dd.routing[slotType] = provider;
				audit(dd, who(), "changed image routing", slotType, provider);
			}, "Routing");
			return ok();
		},

		setModelRouting(task, tier) {
			const g = guard("routing.set");
			if (g) return g;
			set((d) => {
				const dd = dataOf(d, SID);
				dd.modelRouting[task] = tier;
				audit(dd, who(), "changed model routing", task, tier);
			}, "Model routing");
			return ok();
		},

		addComment(postId, text) {
			const g = guard("post.comment");
			if (g) return g;
			if (!text.trim()) return fail("Write a comment first");
			if (!getPost(postId)) return fail("Post not found");
			withPost(postId, (p, d, dd) => {
				p.comments.push({ id: uid("c"), by: who(), role: roleNow(), text: text.trim(), at: nowIso() });
				audit(dd, who(), "commented", p.title);
			});
			return ok();
		},

		resolveLedgerItem(itemId) {
			const g = guard("post.edit");
			if (g) return g;
			const item = data().ledger.find((l) => l.id === itemId);
			if (!item) return fail("Item not found");
			set((d) => {
				const dd = dataOf(d, SID);
				dd.ledger.find((l) => l.id === itemId)!.done = true;
				audit(dd, who(), "resolved ledger item", item.title, `after ${ledgerAge(item)} days`);
			}, "Resolve item");
			toast({ text: "Done · removed from the ledger", tone: "pass", undo: true });
			return ok();
		},

		addSite: (input) => store.workspaceActions.addSite(input),

		markNotificationRead(id) {
			set((d) => {
				const n = dataOf(d, SID).notifications.find((x) => x.id === id);
				if (n) n.read = true;
			});
			return ok();
		},

		markAllNotificationsRead() {
			set((d) => {
				for (const n of dataOf(d, SID).notifications) n.read = true;
			});
			return ok();
		},

		assignPost(postId, userId) {
			const g = guard("post.edit");
			if (g) return g;
			const p = getPost(postId);
			if (!p) return fail("Post not found");
			const u = userId ? userById(st(), userId) : undefined;
			if (userId && (!u || !canAccessSite(st(), userId, SID))) return fail("Assign someone who has access to this site");
			if ((p.assigneeId ?? null) === (userId ?? null)) return ok();
			withPost(
				postId,
				(x, _d, dd) => {
					if (userId) x.assigneeId = userId;
					else delete x.assigneeId;
					audit(dd, who(), userId ? "assigned" : "unassigned", x.title, u?.name);
				},
				"Assign",
			);
			toast({ text: u ? `Assigned to ${u.id === store.userId() ? "you" : u.name} · ${p.title}` : `Unassigned · ${p.title}`, tone: "neutral", href: `/posts/${postId}`, undo: true });
			return ok();
		},

		startEditing(postId, opts) {
			const r = roleWhy(effectiveRole(st(), store.userId(), SID), "post.edit", site()?.name);
			if (r) return { ok: false, reason: r };
			const p = getPost(postId);
			if (!p) return { ok: false, reason: "Post not found" };
			const me = store.userId()!;
			const other = otherEditor(st(), p, me);
			if (other && !opts?.takeOver) return { ok: false, reason: `${other.name} is editing`, heldBy: other };
			set((d) => {
				const x = dataOf(d, SID).posts.find((y) => y.id === postId);
				if (!x) return;
				// Re-check against the fresh state: another tab may have taken the lock meanwhile (last write wins on take-over only).
				const fresh = otherEditor(d, x, me);
				if (fresh && !opts?.takeOver) return;
				x.editingBy = { userId: me, since: nowIso() };
				if (fresh) audit(dataOf(d, SID), who(), "took over editing", x.title, `from ${fresh.name}`);
			});
			if (other) toast({ text: `You took over editing from ${other.name}`, tone: "human" });
			const now = getPost(postId)?.editingBy;
			if (now?.userId !== me) {
				const holder = otherEditor(st(), getPost(postId), me);
				return { ok: false, reason: `${holder?.name ?? "Someone"} is editing`, ...(holder ? { heldBy: holder } : {}) };
			}
			return ok();
		},

		stopEditing(postId) {
			const p = getPost(postId);
			if (!p) return { ok: false, reason: "Post not found" };
			if (p.editingBy?.userId !== store.userId()) return ok();
			set((d) => {
				const x = dataOf(d, SID).posts.find((y) => y.id === postId);
				if (x?.editingBy?.userId === store.userId()) delete x.editingBy;
			});
			return ok();
		},

		requestAccess: (siteId) => store.workspaceActions.requestAccess(siteId),
		inviteUser: (email, siteRoles) => store.workspaceActions.inviteUser(email, siteRoles),
		setMembership: (userId, siteId, role) => store.workspaceActions.setMembership(userId, siteId, role),
		setWorkspaceRole: (userId, role) => store.workspaceActions.setWorkspaceRole(userId, role),
		pauseSite: (siteId) => store.workspaceActions.pauseSite(siteId),
		resumeSite: (siteId) => store.workspaceActions.resumeSite(siteId),
		signInAs: (userId) => store.workspaceActions.signInAs(userId),
		signOut: () => store.workspaceActions.signOut(),
		dismissToast: (id) => store.dismiss(id),
		undo: () => store.undo(),
		resetDemo: () => store.reset(),
	};
	return actions;
}

/**
 * Headless store (tests, scripts). `createCmsStore()` / `createCmsStore(false)`: memory only, this "tab" always runs
 * the jobs. `createCmsStore({ env: bus.tab() })`: shared memory storage for multi-tab tests (createMemoryStorageBus).
 */
export function createCmsStore(opts: boolean | ICmsStoreOptions = false) {
	return new CmsStore(opts);
}
export type { CmsStore };

// ─── React bindings ──────────────────────────────────────────────────────────

const StoreCtx = createContext<CmsStore | null>(null);
interface IScope {
	siteId: string;
	slug: string;
}
const ScopeCtx = createContext<IScope | null>(null);

/** Client-owned demo data: renders `fallback` until storage is read. Clears every timer on unmount. */
export function CmsProvider({ children, fallback = null, persist = true, store }: { children: ReactNode; fallback?: ReactNode; persist?: boolean; store?: CmsStore }) {
	const ref = useRef<CmsStore>(null);
	if (!ref.current) ref.current = store ?? new CmsStore(persist);
	const [ready, setReady] = useState(false);
	useEffect(() => {
		const s = ref.current!;
		s.hydrate();
		setReady(true);
		return () => s.stop();
	}, []);
	// createElement (not JSX) keeps this module importable by vitest without a JSX transform.
	return createElement(StoreCtx.Provider, { value: ref.current }, ready ? children : fallback);
}

function useStore(): CmsStore {
	const s = useContext(StoreCtx);
	if (!s) throw new Error("CmsProvider missing");
	return s;
}

function useSnap(): ICmsSnapshot {
	const store = useStore();
	return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

// Derived views are cached per snapshot so every component reading the same thing shares one object.
const viewCache = new WeakMap<ICmsSnapshot, Map<string, unknown>>();
function cached<T>(snap: ICmsSnapshot, key: string, make: () => T): T {
	let m = viewCache.get(snap);
	if (!m) {
		m = new Map();
		viewCache.set(snap, m);
	}
	if (!m.has(key)) m.set(key, make());
	return m.get(key) as T;
}

const PLACEHOLDER_SITE: ISite = {
	id: "",
	slug: "",
	name: "No site",
	domain: "",
	icon: "globe",
	industry: "",
	status: "active",
	createdAt: "1970-01-01T00:00:00.000Z",
	ageMonths: 0,
	cadenceTarget: 0,
	repo: null,
	searchConsole: "missing",
	rankSource: null,
	budgets: { textUsd: 0, textCapUsd: 0, imageUsd: 0, imageCapUsd: 0 },
	publishing: { autopost: false, autoMergeOnGreenCi: false },
};
const PLACEHOLDER_DATA = emptySiteData();

export interface ICmsContext {
	/** Isolated view: only sites (data, jobs, presence) the current user can access, plus compat siteId/role/members. */
	state: ICmsStateView;
	site: ISite;
	slug: string;
	data: ISiteData;
	/** Effective role on `site` (contract §2). "stakeholder" when the user has no access (then can() is always false). */
	role: TRole;
	/** Compat IMember for the current user, with their effective role on `site`. */
	me: IMember;
	user: IUser;
	/** True inside <SiteScope>. Outside it, `site` is the user's last-used (or first accessible) site. */
	scoped: boolean;
	actions: ICmsActions;
	can: (p: TPermission) => boolean;
	/** Reason an action is locked for the current role (LockedAction copy), or null. */
	why: (p: TPermission) => string | null;
}

function buildContext(store: CmsStore, snap: ICmsSnapshot, scopedId: string | null): ICmsContext {
	const s = snap.state;
	const userId = snap.session.userId;
	const siteId = scopedId ?? store.unscopedSiteId();
	const roleOrNull = effectiveRole(s, userId, siteId);
	const site = (roleOrNull && s.sites.find((x) => x.id === siteId)) || PLACEHOLDER_SITE;
	const allowed = !!roleOrNull && site !== PLACEHOLDER_SITE;
	const data = allowed ? s.data[site.id] : PLACEHOLDER_DATA;
	const role: TRole = roleOrNull ?? "stakeholder";
	const user = userById(s, userId) ?? GUEST;
	const view: ICmsStateView = { ...isolatedState(s, userId), siteId: site.id, role, members: allowed ? siteMembers(s, site.id) : [] };
	return {
		state: view,
		site,
		slug: site.slug,
		data,
		role,
		me: { id: user.id, name: user.name, initials: user.initials, role, email: user.email },
		user,
		scoped: scopedId !== null,
		actions: store.actionsFor(site.id),
		can: (p) => allowed && roleCan(role, p),
		why: (p) => (allowed ? lockReason(role, p) : roleWhy(null, p, site.name)),
	};
}

/**
 * Site context. Inside <SiteScope>: the scoped site, its data, the effective role and site-bound actions. Outside:
 * never throws — the user's last-used (or first accessible) site with `scoped: false`, so workspace pages stay safe.
 */
export function useCms(): ICmsContext {
	const store = useStore();
	const snap = useSnap();
	const scope = useContext(ScopeCtx);
	return cached(snap, `cms:${scope?.siteId ?? "*"}`, () => buildContext(store, snap, scope?.siteId ?? null));
}

export interface ISiteContext {
	site: ISite;
	slug: string;
	data: ISiteData;
	role: TRole;
	can: (p: TPermission) => boolean;
	why: (p: TPermission) => string | null;
	actions: ICmsActions;
	me: IUser;
}

/** The scoped site (throws outside <SiteScope>). Build URLs with sitePath(slug, …). */
export function useSite(): ISiteContext {
	const scope = useContext(ScopeCtx);
	if (!scope) throw new Error("useSite() must be used inside <SiteScope>");
	const c = useCms();
	return useMemo(() => ({ site: c.site, slug: c.slug, data: c.data, role: c.role, can: c.can, why: c.why, actions: c.actions, me: c.user }), [c]);
}

/** The scope's site slug, or null outside <SiteScope> (for components that render on both levels). */
export function useSiteSlug(): string | null {
	return useContext(ScopeCtx)?.slug ?? null;
}

export function useActions(): ICmsActions {
	return useCms().actions;
}

/**
 * Actions bound to any site (workspace pages acting on one row: approve an idea from /inbox). Every action still
 * checks the current user's effective role on that site, so a site they can't access refuses ("You don't have access").
 * Returns a stable object per site; `actionsForSite(siteId)` is the same lookup for event handlers.
 */
export function useSiteActions(siteId: string): ICmsActions {
	return useStore().actionsFor(siteId);
}

/** Non-hook variant for handlers that pick the site at call time: `const forSite = useActionsForSite(); forSite(id).approveIdea(p)`. */
export function useActionsForSite(): (siteId: string) => ICmsActions {
	const store = useStore();
	return useMemo(() => (siteId: string) => store.actionsFor(siteId), [store]);
}

export function useToasts(): IToast[] {
	const store = useStore();
	return useSyncExternalStore(store.subscribe, store.getToasts, store.getToasts);
}

/** Show a toast from code that doesn't go through store actions (the Convex-backed workspace actions). */
export function useToast(): (t: Omit<IToast, "id">) => void {
	const store = useStore();
	return useCallback((t: Omit<IToast, "id">) => store.toast(t), [store]);
}

/** store.adoptSite for code outside this file (SiteGate brings in sites created on the backend). */
export function useAdoptSite(): CmsStore["adoptSite"] {
	const store = useStore();
	return useCallback((site) => store.adoptSite(site), [store]);
}

// ─── SiteScope ───────────────────────────────────────────────────────────────

export type TSiteStatus = "ready" | "not-found" | "no-access" | "signed-out";

export interface ISiteStatus {
	status: TSiteStatus;
	slug: string;
	/** Identity only (never the site's data). Null when not found. Present on no-access so the page can name the site. */
	site: Pick<ISite, "id" | "slug" | "name" | "domain" | "icon" | "accent" | "status"> | null;
	/** True when the current user already has an open access request for this site. */
	requested: boolean;
	requestAccess(): TResult;
}

/** Resolves a slug for the current user. Use it to render not-found / no-access with DS components. */
export function useSiteStatus(slug: string): ISiteStatus {
	const store = useStore();
	const snap = useSnap();
	return cached(snap, `status:${slug}`, () => {
		const s = snap.state;
		const userId = snap.session.userId;
		const site = s.sites.find((x) => x.slug === slug) ?? null;
		const ident = site ? { id: site.id, slug: site.slug, name: site.name, domain: site.domain, icon: site.icon, accent: site.accent, status: site.status } : null;
		const status: TSiteStatus = !userById(s, userId) ? "signed-out" : !site ? "not-found" : canAccessSite(s, userId, site.id) ? "ready" : "no-access";
		const requested = !!site && s.accessRequests.some((r) => r.userId === userId && r.siteId === site.id && r.status === "open");
		return { status, slug, site: ident, requested, requestAccess: () => (site ? store.workspaceActions.requestAccess(site.id) : { ok: false, reason: "Unknown site" }) };
	});
}

function DefaultSiteStatus({ status }: { status: ISiteStatus }) {
	const msg =
		status.status === "signed-out"
			? "Sign in to open this site."
			: status.status === "not-found"
				? `There's no site called "${status.slug}" in this workspace.`
				: `You don't have access to ${status.site?.name ?? status.slug}.`;
	return createElement(
		"div",
		{ role: "alert", "data-site-status": status.status, style: { padding: 32 } },
		createElement("p", null, msg),
		status.status === "no-access" ? createElement("button", { type: "button", onClick: () => status.requestAccess(), disabled: status.requested }, status.requested ? "Access requested" : "Request access") : null,
	);
}

/**
 * Scopes everything below to one site (app/(app)/s/[site]/layout.tsx). Resolves the slug, provides the site to
 * useSite()/useCms(), records presence for the current path, and renders `fallback(status)` (or a plain default)
 * for not-found / no-access / signed-out. No site data reaches children unless the user has access.
 */
export function SiteScope({ slug, children, fallback, path }: { slug: string; children: ReactNode; fallback?: (status: ISiteStatus) => ReactNode; path?: string }) {
	const store = useStore();
	const status = useSiteStatus(slug);
	const pathname = usePathname();
	const where = path ?? pathname ?? sitePath(slug);
	const siteId = status.status === "ready" ? status.site!.id : null;
	useEffect(() => {
		if (!siteId) return;
		store.setLastSite(siteId);
		store.recordPresence(siteId, where);
		const t = setInterval(() => store.recordPresence(siteId, where), PRESENCE_HEARTBEAT_MS);
		return () => clearInterval(t);
	}, [store, siteId, where]);
	const scope = useMemo(() => (siteId ? { siteId, slug } : null), [siteId, slug]);
	if (!scope) return fallback ? createElement(Fragment, null, fallback(status)) : createElement(DefaultSiteStatus, { status });
	return createElement(ScopeCtx.Provider, { value: scope }, children);
}

// ─── Workspace hooks ─────────────────────────────────────────────────────────

export interface IWorkspaceContext {
	workspace: IWorkspace;
	/** The signed-in person (a "Signed out" guest when signedIn is false). */
	me: IUser;
	signedIn: boolean;
	workspaceRole: TWorkspaceRole | null;
	users: IUser[];
	/** Workspace role per user id (owner / admin / member). */
	workspaceRoles: Record<string, TWorkspaceRole>;
	/** All memberships for workspace admins; otherwise only memberships on sites the user can access. */
	memberships: IMembership[];
	sitesForMe: ISite[];
	roleOn(siteId: string): TRole | null;
	canWorkspace(p: TWorkspacePermission): boolean;
	whyWorkspace(p: TWorkspacePermission): string | null;
	/** Slug of this tab's last-used accessible site (redirect target for `/` and old flat routes), or null. */
	lastSiteSlug: string | null;
	signInAs(userId: string): TResult;
	signOut(): TResult;
	actions: IWorkspaceActions;
}

export function useWorkspace(): IWorkspaceContext {
	const store = useStore();
	const snap = useSnap();
	return cached(snap, "workspace", () => {
		const s = snap.state;
		const userId = snap.session.userId;
		const me = userById(s, userId);
		const iso = isolatedState(s, userId);
		const lastId = store.unscopedSiteId();
		return {
			workspace: s.workspace,
			me: me ?? GUEST,
			signedIn: !!me,
			workspaceRole: workspaceRoleOf(s, userId),
			users: s.users,
			workspaceRoles: s.workspaceRoles,
			memberships: iso.memberships,
			sitesForMe: iso.sites,
			roleOn: (siteId: string) => effectiveRole(s, userId, siteId),
			canWorkspace: (p: TWorkspacePermission) => canWorkspace(s, userId, p),
			whyWorkspace: (p: TWorkspacePermission) => workspaceLockReason(s, userId, p),
			lastSiteSlug: s.sites.find((x) => x.id === lastId)?.slug ?? null,
			signInAs: store.workspaceActions.signInAs,
			signOut: store.workspaceActions.signOut,
			actions: store.workspaceActions,
		};
	});
}

/** One row per site the user can access: pipeline, needs-me, held, ideas, spend vs cap, gap, last activity. */
export function usePortfolio(): IPortfolioRow[] {
	const snap = useSnap();
	return cached(snap, "portfolio", () => portfolioFor(snap.state, snap.session.userId));
}

/** Work across the user's sites that needs them (role-aware), newest first. */
export function useInbox(): IInboxItem[] {
	const snap = useSnap();
	return cached(snap, "inbox", () => inboxFor(snap.state, snap.session.userId));
}

/**
 * Who else is where (fresh entries only, never on a site the viewer can't access). `siteId` narrows to a site,
 * `path` to a page (exact, or a prefix ending with "*"). The viewer is excluded unless `opts.includeMe`.
 */
export function usePresence(siteId?: string, path?: string, opts?: { includeMe?: boolean }): IPresenceView[] {
	const snap = useSnap();
	const includeMe = !!opts?.includeMe;
	return cached(snap, `presence:${siteId ?? "*"}:${path ?? "*"}:${includeMe}`, () => presenceFor(snap.state, snap.session.userId, siteId, path, includeMe));
}

/** Soft edit lock state for a post on the scoped site: `holder` is someone else's fresh lock (view only), `mine` = I hold it. */
export function useEditLock(postId: string | undefined): { holder: IEditLockHolder | null; mine: boolean } {
	const { data, user, state } = useCms();
	return useMemo(() => {
		const post = postId ? data.posts.find((p) => p.id === postId) : undefined;
		return { holder: otherEditor(state, post, user.id), mine: !!post?.editingBy && post.editingBy.userId === user.id && isLockFresh(post.editingBy) };
	}, [data, postId, user.id, state]);
}

// ─── Site selectors (read the scoped site) ───────────────────────────────────

export function usePost(id: string | undefined): IPost | undefined {
	const { data } = useCms();
	return useMemo(() => (id ? data.posts.find((p) => p.id === id) : undefined), [data, id]);
}

export function useSlotsForPost(postId: string | undefined): IImageSlot[] {
	const { data } = useCms();
	return useMemo(() => {
		if (!postId) return [];
		const post = data.posts.find((p) => p.id === postId);
		const order = post?.slotIds ?? [];
		return data.slots.filter((s) => s.postId === postId).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
	}, [data, postId]);
}

export function useSlot(slotId: string | undefined): IImageSlot | undefined {
	const { data } = useCms();
	return useMemo(() => (slotId ? data.slots.find((s) => s.id === slotId) : undefined), [data, slotId]);
}

/** Ideas waiting for approval, planned week first (Approvals · Ideas tab, plan Idea column). */
export function usePendingIdeas(): IPost[] {
	const { data } = useCms();
	return useMemo(() => data.posts.filter(isPendingIdea).sort((a, b) => a.week - b.week), [data]);
}

/** The open "Autopost held" ledger item for a post, if the agent held it. */
export function useAutopostHold(postId: string | undefined): ILedgerItem | undefined {
	const { data } = useCms();
	return useMemo(() => (postId ? data.ledger.find((l) => !l.done && l.postId === postId && l.kind === "autopost-hold") : undefined), [data, postId]);
}

export function useKeyword(id: string | undefined): IKeyword | undefined {
	const { data } = useCms();
	return useMemo(() => (id ? data.keywords.find((k) => k.id === id) : undefined), [data, id]);
}

export function useMergeRequest(id: string | undefined): IMergeRequest | undefined {
	const { data } = useCms();
	return useMemo(() => (id ? data.mergeRequests.find((m) => m.id === id) : undefined), [data, id]);
}

export function useMrForPost(postId: string | undefined): IMergeRequest | undefined {
	const { data } = useCms();
	return useMemo(() => {
		if (!postId) return undefined;
		const post = data.posts.find((p) => p.id === postId);
		return data.mergeRequests.find((m) => m.id === post?.mrId) ?? data.mergeRequests.find((m) => m.postId === postId);
	}, [data, postId]);
}

export function useActiveManifest(): ITemplateManifest | null {
	const { data } = useCms();
	return useMemo(() => activeManifest(data), [data]);
}

export interface IGateView extends IGateResult {
	manifest: ITemplateManifest | null;
	post: IPost;
}

export function useGate(postId: string | undefined): IGateView | null {
	const { data } = useCms();
	return useMemo(() => {
		const post = postId ? data.posts.find((p) => p.id === postId) : undefined;
		if (!post) return null;
		const manifest = activeManifest(data);
		return { ...evaluateGate(post, data.slots, manifest), manifest, post };
	}, [data, postId]);
}

export interface ILedgerView extends ILedgerItem {
	age: number;
	status: TLedgerStatus;
}

/** Open ledger items with live age and status, oldest (most blocking) first. */
export function useLedger(): ILedgerView[] {
	const { data } = useCms();
	return useMemo(
		() =>
			data.ledger
				.filter((l) => !l.done)
				.map((l) => {
					const age = ledgerAge(l);
					return { ...l, age, ageDays: age, status: ledgerStatus(age) };
				})
				.sort((a, b) => b.age - a.age),
		[data],
	);
}

export type { ICmsStats };

export function useStats(): ICmsStats {
	const { data, site } = useCms();
	return useMemo(() => computeStats(site, data), [data, site]);
}

export type { TPermission } from "./logic";
export type { IGateCheck };
export type { ICmsStateView, IEditLockHolder, IInboxItem, IPortfolioRow, IPresenceView, TInboxKind, TWorkspacePermission } from "./workspace";
export { DEFAULT_USER_ID, EDIT_LOCK_MS, PRESENCE_FRESH_MS } from "./workspace";
export { STATE_KEY, V1_STATE_KEY } from "./migrate";
