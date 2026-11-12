// Pure domain rules for the Agentic CMS. No React, no storage — safe to port to server queries as-is.
import { DAY, TIME_ZONE, now as clockNow } from "./clock";
import type {
	IFactMarker,
	IGateCheck,
	IImageSlot,
	IKeyword,
	ILedgerItem,
	IPillar,
	IPost,
	IPublishing,
	ISite,
	ITemplateManifest,
	IWeekPoint,
	TBudgetKind,
	TIntent,
	TModelTier,
	TOwner,
	TPostState,
	TRole,
	TRunKind,
	TTemplateStructure,
	TTone,
} from "./types";

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Post state machine ──────────────────────────────────────────────────────

export const POST_STATES: TPostState[] = ["idea", "briefed", "drafting", "needs-assets", "in-review", "mr-open", "live", "decaying"];

export const POST_STATE_LABEL: Record<TPostState, string> = {
	idea: "Idea",
	briefed: "Briefed",
	drafting: "Drafting",
	"needs-assets": "Needs assets",
	"in-review": "In review",
	"mr-open": "MR open",
	live: "Live",
	decaying: "Decaying",
};

/** PRD Module 1 owner per state. Ideas wait on a person since C10 (only ideas need approval). */
export const STATE_OWNER: Record<TPostState, TOwner> = {
	idea: "human",
	briefed: "agent",
	drafting: "agent",
	"needs-assets": "human",
	"in-review": "human",
	"mr-open": "developer",
	live: "system",
	decaying: "agent",
};

/** What moves each state forward (PRD "Exits when"). */
export const STATE_EXIT: Record<TPostState, string> = {
	idea: "Specialist approves the idea",
	briefed: "Draft generation completes",
	drafting: "Draft and image slots produced",
	"needs-assets": "Every slot filled",
	"in-review": "Specialist approves or sends back (under autopost: only posts the agent held)",
	"mr-open": "Merged or closed",
	live: "Scored and indexed",
	decaying: "Refresh cycle picks it up",
};

/** Tone per state (IA doc). Needs assets is human (amber) only when a human-only slot exists. */
export function stateTone(state: TPostState, hasHumanOnlySlot = false): TTone {
	switch (state) {
		case "idea":
			return "human";
		case "needs-assets":
			return hasHumanOnlySlot ? "human" : "agent";
		case "in-review":
			return "human";
		case "mr-open":
			return "ink";
		case "live":
			return "pass";
		default:
			return "agent";
	}
}

/** Allowed transitions. The only way into `mr-open` is the human gate; the only way into `live` is a merge. */
export const TRANSITIONS: Record<TPostState, TPostState[]> = {
	idea: ["briefed"],
	briefed: ["drafting", "idea"],
	drafting: ["needs-assets", "in-review"],
	"needs-assets": ["in-review", "drafting"],
	"in-review": ["mr-open", "drafting", "needs-assets"],
	"mr-open": ["live", "in-review"],
	live: ["decaying"],
	decaying: ["drafting"],
};

export const canTransition = (from: TPostState, to: TPostState) => TRANSITIONS[from].includes(to);

export type TTransition = { ok: true; state: TPostState } | { ok: false; reason: string };

export function nextState(from: TPostState, to: TPostState): TTransition {
	if (canTransition(from, to)) return { ok: true, state: to };
	if (to === "live") return { ok: false, reason: "Only a merged MR makes a post Live. Approve it to open one." };
	if (to === "mr-open") return { ok: false, reason: "An MR opens only through the approval gate, from In review." };
	return { ok: false, reason: `${POST_STATE_LABEL[from]} can't move to ${POST_STATE_LABEL[to]}.` };
}

// ─── Keyword Attribution Score ───────────────────────────────────────────────

/** Business value multiplier V by intent (PRD Module 7). */
export const INTENT_VALUE: Record<TIntent, number> = { transactional: 1.5, commercial: 1.25, informational: 1.0, navigational: 0.75 };

export const INTENT_LABEL: Record<TIntent, string> = { transactional: "Transactional", commercial: "Commercial", informational: "Informational", navigational: "Navigational" };

/** Modeled industry CTR curve, positions 1..20. Configurable per client (ISiteData.ctrCurve). */
export const DEFAULT_CTR_CURVE: number[] = [
	0.278, 0.157, 0.11, 0.08, 0.061, 0.046, 0.036, 0.028, 0.022, 0.018, 0.0155, 0.013, 0.011, 0.0095, 0.008, 0.007, 0.006, 0.005, 0.0045, 0.004,
];
/** CTR beyond the end of the curve (page 3+). */
export const CTR_TAIL = 0.002;

export const FRAGILE_THRESHOLD = 60; // top-5 share above this = fragile
export const UNEARNED_THRESHOLD = 5; // plan pillar under this share = claimed but unearned

/** C(p): click-through at a (possibly fractional) average position. Not ranking = 0. */
export function ctr(position: number | null, curve: number[] = DEFAULT_CTR_CURVE): number {
	if (position === null || !Number.isFinite(position)) return 0;
	const at = (p: number) => (p <= curve.length ? curve[p - 1] : CTR_TAIL);
	if (position <= 1) return curve[0];
	const lo = Math.floor(position);
	const frac = position - lo;
	return at(lo) + (at(lo + 1) - at(lo)) * frac;
}

/** raw(k) = I × C(p) × V(intent) */
export function kasRawWeight(k: Pick<IKeyword, "impressions" | "position" | "intent">, curve?: number[]): number {
	return k.impressions * ctr(k.position, curve) * INTENT_VALUE[k.intent];
}

export interface IKasShare {
	keywordId: string;
	raw: number;
	share: number; // unrounded %, all shares sum to 100 (or all 0 when there is no data)
}

export function computeKas(keywords: Pick<IKeyword, "id" | "impressions" | "position" | "intent">[], curve?: number[]): IKasShare[] {
	const raws = keywords.map((k) => ({ keywordId: k.id, raw: kasRawWeight(k, curve) }));
	const total = raws.reduce((s, r) => s + r.raw, 0);
	return raws.map((r) => ({ ...r, share: total > 0 ? (r.raw / total) * 100 : 0 }));
}

/** Recalculate: returns keywords with fresh kasShare (1dp) and kasDelta vs their previous share. */
export function applyKas(keywords: IKeyword[], curve?: number[]): IKeyword[] {
	const shares = new Map(computeKas(keywords, curve).map((s) => [s.keywordId, s.share]));
	return keywords.map((k) => {
		const share = round1(shares.get(k.id) ?? 0);
		return { ...k, kasShare: share, kasDelta: round1(share - k.kasShare) };
	});
}

/** Keywords that currently rank (the KAS table rows). */
export const rankingKeywords = (keywords: IKeyword[]) => keywords.filter((k) => k.position !== null && k.impressions > 0).sort((a, b) => b.kasShare - a.kasShare);

export function concentration(keywords: Pick<IKeyword, "id" | "kasShare">[], topN = 5): { top: number; fragile: boolean; keywordIds: string[] } {
	const top = [...keywords].sort((a, b) => b.kasShare - a.kasShare).slice(0, topN);
	const share = round1(top.reduce((s, k) => s + k.kasShare, 0));
	return { top: share, fragile: share > FRAGILE_THRESHOLD, keywordIds: top.map((k) => k.id) };
}

export interface IPillarShare {
	pillarId: string;
	name: string;
	share: number;
	claimedButUnearned: boolean;
}

export function pillarDistribution(keywords: Pick<IKeyword, "pillarId" | "kasShare">[], pillars: Pick<IPillar, "id" | "name" | "plannedPosts">[]): IPillarShare[] {
	return pillars
		.map((p) => {
			const share = round1(keywords.filter((k) => k.pillarId === p.id).reduce((s, k) => s + k.kasShare, 0));
			return { pillarId: p.id, name: p.name, share, claimedButUnearned: p.plannedPosts > 0 && share < UNEARNED_THRESHOLD };
		})
		.sort((a, b) => b.share - a.share);
}

/** Score resting on keywords with exactly one ranking page — the single points of failure. */
export function orphanWeight(keywords: IKeyword[]): { share: number; keywordIds: string[] } {
	const orphans = keywords.filter((k) => k.rankingPages === 1 && k.position !== null && k.kasShare > 0);
	return { share: round1(orphans.reduce((s, k) => s + k.kasShare, 0)), keywordIds: orphans.map((k) => k.id) };
}

export const claimedButUnearned = (pillars: IPillar[]) => pillars.filter((p) => p.plannedPosts > 0 && p.kasShare < UNEARNED_THRESHOLD);

export const postUrl = (post: Pick<IPost, "slug">) => `/blog/${post.slug}`;

/** Page attribution: the sum of the scores of keywords whose ranking URL is this post. */
export function postKas(post: Pick<IPost, "slug">, keywords: IKeyword[]): number {
	const url = postUrl(post);
	return round1(keywords.filter((k) => k.rankingUrl === url).reduce((s, k) => s + k.kasShare, 0));
}

// ─── Approval gate ───────────────────────────────────────────────────────────

export const HARD_SECTIONS = 5; // failing items in sections 1–5 are hard blocks

export const isHardFail = (c: IGateCheck) => c.status === "fail" && (c.section <= HARD_SECTIONS || c.severity === "hard");
export const isFilled = (s: IImageSlot) => s.status === "selected";

/** Soft checks derived from the post itself when the optimizer hasn't emitted them. */
export function derivedChecks(post: IPost): IGateCheck[] {
	const have = new Set(post.gate.map((c) => c.id));
	const out: IGateCheck[] = [];
	if (!have.has("word-count") && post.wordTarget > 0 && post.words < post.wordTarget)
		out.push({ id: "word-count", label: "Word count", section: 7, status: "warn", severity: "soft", value: `${fmtInt(post.words)} / ${fmtInt(post.wordTarget)}` });
	if (!have.has("disclaimer") && post.regulated && !post.blocks.some((b) => b.kind === "disclaimer"))
		out.push({ id: "disclaimer", label: `${cap(post.regulated)} disclaimer`, section: 7, status: "fail", severity: "soft", value: "Missing · regulated topic" });
	return out;
}

export const gateChecks = (post: IPost): IGateCheck[] => [...post.gate, ...derivedChecks(post)];

/** Structures the post needs from the template: explicit `requires` plus what its blocks imply. */
export function requiredStructures(post: IPost): TTemplateStructure[] {
	const set = new Set<TTemplateStructure>(post.requires ?? []);
	for (const b of post.blocks) {
		if (b.kind === "ul") set.add("list");
		if (b.kind === "quote") set.add("quote");
		if (b.kind === "image") set.add("image");
	}
	return [...set];
}

/** Structures the manifest can't render (fidelity rule: the renderer never invents markup). */
export function missingStructures(post: IPost, manifest: ITemplateManifest | null | undefined): TTemplateStructure[] {
	if (!manifest) return requiredStructures(post);
	return requiredStructures(post).filter((s) => !manifest.mappings.some((m) => m.role === s && m.status === "mapped"));
}

export interface IGateResult {
	hard: string[];
	soft: IGateCheck[]; // soft blocks; each needs `override.reason` (or an entry in `overrides`) to approve
	canApprove: boolean;
	passed: number; // optimizer checklist items passing
	total: number;
	openFacts: IFactMarker[];
	unfilledSlots: IImageSlot[];
	failingHard: IGateCheck[];
	missingStructures: TTemplateStructure[];
}

/**
 * The one human gate. Hard blocks (open fact markers, unfilled slots, failing checks in sections 1–5,
 * a template that can't render the post) can never be overridden. Soft blocks need a logged reason.
 */
export function evaluateGate(post: IPost, slots: IImageSlot[], manifest: ITemplateManifest | null | undefined, overrides: Record<string, string> = {}): IGateResult {
	const hard: string[] = [];
	const openFacts = post.facts.filter((f) => f.status === "open");
	if (openFacts.length) hard.push(`${openFacts.length} unresolved fact marker${openFacts.length > 1 ? "s" : ""}`);

	const postSlots = slots.filter((s) => s.postId === post.id);
	const unfilledSlots = postSlots.filter((s) => !isFilled(s));
	if (unfilledSlots.length) hard.push(`${unfilledSlots.length} image slot${unfilledSlots.length > 1 ? "s" : ""} unfilled`);

	const checks = gateChecks(post);
	const failingHard = checks.filter(isHardFail);
	for (const c of failingHard) hard.push(`${c.label} · section ${c.section}`);

	const missing = !manifest ? [] : missingStructures(post, manifest);
	if (!manifest) hard.push("No confirmed template manifest");
	for (const s of missing) hard.push(`Template has no ${s} · developer must extend it`);

	const soft = checks
		.filter((c) => !isHardFail(c) && c.status !== "pass")
		.map((c) => {
			const reason = overrides[c.id]?.trim();
			return reason ? { ...c, override: { reason, by: c.override?.by ?? "", at: c.override?.at ?? "" } } : c;
		});
	const canApprove = hard.length === 0 && soft.every((c) => !!c.override?.reason?.trim());
	return {
		hard,
		soft,
		canApprove,
		// Score of the optimizer's checklist ("On-page gate 10/12"); derived soft blocks are listed in `soft` only.
		passed: post.gate.filter((c) => c.status === "pass").length,
		total: post.gate.length,
		openFacts,
		unfilledSlots,
		failingHard,
		missingStructures: missing,
	};
}

// ─── Idea approval + autopost (founder direction C10–C11) ────────────────────

export type TIdeaStatus = "pending" | "approved" | "rejected";

/** Absent approval on an Idea = pending; anything past Idea was approved (or predates the field). */
export function ideaStatus(post: Pick<IPost, "state" | "ideaApproval">): TIdeaStatus {
	if (post.ideaApproval) return post.ideaApproval.status;
	return post.state === "idea" ? "pending" : "approved";
}

export const isPendingIdea = (post: Pick<IPost, "state" | "ideaApproval">) => post.state === "idea" && ideaStatus(post) === "pending";

/** Why an idea can't advance to a brief yet; null when it can. Only an approved idea becomes a brief. */
export function ideaGate(post: Pick<IPost, "state" | "ideaApproval">): string | null {
	if (post.state !== "idea") return null;
	const s = ideaStatus(post);
	if (s === "rejected") return "This idea was rejected";
	if (s === "pending") return "Approve the idea first. Only approved ideas become briefs";
	return null;
}

export const AUTOPOST_ACTOR = "CMS agent (autopost)";
export const VISUAL_AGENT = "Visual-asset agent";
export const AUTOPOST_SOFT_REASON = "Autopost · agent accepted soft block";
export const NO_MANIFEST = "No confirmed template manifest";

/** Hard on-page checks (sections 1–5) the agent can repair itself. Anything else needs a person. */
export const AGENT_FIXABLE_CHECKS = ["kw-first-100", "title-length", "meta-description", "alt-text"] as const;
/** Soft checks the agent fixes instead of accepting (a regulated topic always gets its disclaimer). */
export const AGENT_FIXED_SOFT = ["disclaimer"] as const;
/** Est. cost of one small agent fix (same as an instructed edit). */
export const AGENT_FIX_USD = 0.06;
export const IMAGE_FILL_USD = 0.12;

export interface IAutopostFix {
	kind: "fact" | "check" | "slot" | "soft-fix" | "soft-accept";
	id: string; // fact id · check id · slot id
	label: string;
	usd: number;
	budget: TBudgetKind;
}

export interface IAutopostDecision {
	action: "ship" | "hold";
	/** Human-readable list of what the agent does before shipping (logged to the audit trail). */
	fixes: string[];
	/** Why the post is held (hold only). */
	reason?: string;
	/** Structured plan the store executes; `fixes` is its label list. */
	plan: IAutopostFix[];
}

type TAutopostSite = Pick<ISite, "budgets" | "repo"> & { publishing: IPublishing };

/**
 * The auto-gate. Pure: decides whether the CMS agent may ship this post without a person, and what it must fix first.
 * Guardrails (C11): open fact markers are rewritten without the claim, never shipped; hard blocks the agent can't clear
 * (template can't render, over budget cap, provider failure, a person's human-only slot) hold the post in review.
 */
export function autopostDecision(post: IPost, gate: IGateResult, site: TAutopostSite): IAutopostDecision {
	const plan: IAutopostFix[] = [];
	const hold = (reason: string): IAutopostDecision => ({ action: "hold", reason, fixes: plan.map((f) => f.label), plan });

	if (!site.publishing.autopost) return hold("Autopost is off · a person reviews every post");
	if (!site.repo) return hold("No repo connected · the MR has nowhere to open");
	if (gate.hard.includes(NO_MANIFEST)) return hold("Template can't render the post · no confirmed manifest");
	if (gate.missingStructures.length) return hold(`Template can't render the post · no ${gate.missingStructures.join(", ")} in the manifest`);

	for (const s of gate.unfilledSlots) {
		if (s.postId !== post.id) continue;
		if (s.status === "failed") return hold(`Image provider failed · ${s.name}`);
		if (s.status === "generating") return hold(`Image still generating · ${s.name}`);
		if (s.status === "human-only" && s.humanPinned) return hold(`Waiting on a human-made image · ${s.name}`);
		if (s.status === "human-only" && site.publishing.humanOnlyAssets) return hold(`Site requires human-made images · ${s.name}`);
		if (s.status === "candidates") plan.push({ kind: "slot", id: s.id, label: `${VISUAL_AGENT} picks a candidate · ${s.name}`, usd: 0, budget: "image" });
		else plan.push({ kind: "slot", id: s.id, label: `${VISUAL_AGENT} fills ${s.name}`, usd: s.estimateUsd || IMAGE_FILL_USD, budget: "image" });
	}

	for (const f of gate.openFacts) plan.push({ kind: "fact", id: f.id, label: `Rewrite without unsourced claim · "${f.claim}"`, usd: AGENT_FIX_USD, budget: "text" });

	for (const c of gate.failingHard) {
		if (!(AGENT_FIXABLE_CHECKS as readonly string[]).includes(c.id)) return hold(`On-page check needs a person · ${c.label} (section ${c.section})`);
		plan.push({ kind: "check", id: c.id, label: `Agent fix · ${c.label}`, usd: AGENT_FIX_USD, budget: "text" });
	}

	for (const c of gate.soft) {
		if (c.override?.reason?.trim()) continue;
		if ((AGENT_FIXED_SOFT as readonly string[]).includes(c.id)) plan.push({ kind: "soft-fix", id: c.id, label: `Agent fix · ${c.label}`, usd: AGENT_FIX_USD, budget: "text" });
		else plan.push({ kind: "soft-accept", id: c.id, label: `Accepted soft block · ${c.label} ${c.value.replace(/ · soft$/, "")}`, usd: 0, budget: "text" });
	}

	for (const budget of ["text", "image"] as const) {
		const usd = round2(plan.filter((f) => f.budget === budget).reduce((sum, f) => sum + f.usd, 0));
		if (usd <= 0) continue;
		const { spent, cap: capUsd } = budgetFor(site, budget);
		if (spent + usd > capUsd) return hold(`Over the ${budget} budget cap · fixes need ${fmtUsd(usd)}, ${fmtUsd(Math.max(0, capUsd - spent))} left`);
	}

	return { action: "ship", fixes: plan.map((f) => f.label), plan };
}

/** Plain step list for "What happens to a new idea" under the current publishing mode. */
export function publishingSteps(p: IPublishing): { id: string; label: string; owner: "human" | "agent" | "developer" }[] {
	return [
		{ id: "approve", label: "You approve the idea", owner: "human" },
		{ id: "draft", label: "The blog writer agent drafts it from the brief", owner: "agent" },
		p.humanOnlyAssets
			? { id: "assets", label: "Image slots get agent candidates; human-only slots wait for you", owner: "human" }
			: { id: "assets", label: "The visual-asset agent fills the image slots", owner: "agent" },
		p.autopost
			? { id: "gate", label: "The CMS agent runs the gate: rewrites unsourced claims, fixes checks, holds on hard blocks", owner: "agent" }
			: { id: "gate", label: "You review it in Approvals and approve it", owner: "human" },
		{ id: "mr", label: "A merge request opens in the repo and CI runs", owner: "agent" },
		p.autopost && p.autoMergeOnGreenCi
			? { id: "merge", label: "It merges itself when CI passes, then goes Live", owner: "agent" }
			: { id: "merge", label: "A developer merges it, then it goes Live", owner: "developer" },
	];
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

export const LEDGER_OVERDUE_DAYS = 7;
export const LEDGER_BLOCKER_DAYS = 14;
export type TLedgerStatus = "open" | "overdue" | "blocker";

export function ledgerStatus(ageDays: number): TLedgerStatus {
	if (ageDays >= LEDGER_BLOCKER_DAYS) return "blocker";
	if (ageDays >= LEDGER_OVERDUE_DAYS) return "overdue";
	return "open";
}

export const LEDGER_LABEL: Record<TLedgerStatus, string> = { open: "To-do", overdue: "Overdue", blocker: "Blocker" };
export const LEDGER_TONE: Record<TLedgerStatus, TTone> = { open: "neutral", overdue: "human", blocker: "block" };

/** Age recomputed from createdAt so items age automatically. */
export const ledgerAge = (item: Pick<ILedgerItem, "createdAt">, at: Date = clockNow()) => Math.max(0, Math.floor((at.getTime() - new Date(item.createdAt).getTime()) / DAY));

// ─── Runs, estimates, cost caps ──────────────────────────────────────────────

export interface IRunMeta {
	label: string;
	agent: string;
	tier: TModelTier;
	budget: TBudgetKind;
	baseUsd: number;
	cadence: string;
	produces: string;
}

export const RUN_META: Record<TRunKind, IRunMeta> = {
	"keyword-swarm": { label: "Keyword swarm", agent: "Keyword swarm agent", tier: "fast", budget: "text", baseUsd: 4.2, cadence: "Monday weekly", produces: "New ideas in the plan" },
	"post-generation": { label: "Post generation", agent: "Blog writer agent", tier: "workhorse", budget: "text", baseUsd: 1.8, cadence: "Per publish slot", produces: "Drafts in review" },
	"technical-monitor": { label: "Technical monitor", agent: "Technical monitor agent", tier: "fast", budget: "text", baseUsd: 0.9, cadence: "Friday weekly", produces: "Health digest, issues in the queue" },
	"qa-sweep": { label: "QA sweep", agent: "QA agent", tier: "workhorse", budget: "text", baseUsd: 1.4, cadence: "Friday light, bi-weekly full", produces: "Scorecard and the human ledger" },
	"content-refresh": { label: "Content refresh", agent: "Refresh agent", tier: "workhorse", budget: "text", baseUsd: 6.5, cadence: "Monthly", produces: "Refresh drafts and a prune list" },
	"link-prospecting": { label: "Link prospecting", agent: "Link prospecting agent", tier: "workhorse", budget: "text", baseUsd: 3.1, cadence: "Monthly", produces: "Prospects and outreach drafts" },
	"biweekly-report": { label: "Bi-weekly report", agent: "Visualization agent", tier: "strongest", budget: "text", baseUsd: 2.4, cadence: "Alternate Fridays", produces: "The visual progress report" },
	"kas-recalc": { label: "KAS recalculation", agent: "CMS agent", tier: "fast", budget: "text", baseUsd: 0.3, cadence: "24 hours post-merge, then weekly", produces: "Updated attribution" },
	"image-generation": { label: "Image generation", agent: "Image pipeline agent", tier: "workhorse", budget: "image", baseUsd: 0.12, cadence: "On slot creation", produces: "Candidates for each image slot" },
	"site-discovery": { label: "Site discovery", agent: "Site discovery agent", tier: "workhorse", budget: "text", baseUsd: 1.6, cadence: "When a site is added, or on demand", produces: "Site profile, pillars, keywords and the first ideas" },
};

// ─── Site discovery (prd-site-discovery) ─────────────────────────────────────

export interface IDiscoverySettings {
	/** Start discovery automatically when the site is added (F1). */
	onAdd: boolean;
	maxPages: number;
	depth: number;
	exclude: string[];
	subdomains: boolean;
	/** Web search for who ranks, top 2 keywords per pillar (F17). */
	competitorCheck: boolean;
	/** Ideas per batch; 0 = four weeks at the site's cadence (SD5). */
	batchSize: number;
}

export const DISCOVERY_MAX_PAGES_CAP = 1000;
export const DISCOVERY_DEFAULTS: IDiscoverySettings = { onAdd: true, maxPages: 150, depth: 3, exclude: ["/cart", "/checkout", "/account", "/login", "/wp-admin", "?"], subdomains: false, competitorCheck: true, batchSize: 0 };

/** Ideas per batch (F18/SD5): four weeks at the site's cadence unless set; halved for a very small site (§11). */
export function discoveryBatchSize(site: Pick<ISite, "cadenceTarget">, settings: Pick<IDiscoverySettings, "batchSize">, contentPages?: number): number {
	const base = settings.batchSize > 0 ? settings.batchSize : Math.max(4, Math.round(site.cadenceTarget * 4));
	return contentPages !== undefined && contentPages < 5 ? Math.max(2, Math.ceil(base / 2)) : base;
}

export type TReadinessItem = "repo" | "paths" | "template" | "profile";
export const READINESS_LABEL: Record<TReadinessItem, string> = { repo: "connect the repo", paths: "confirm the content and image folders", template: "confirm the article template", profile: "accept the site profile (regulated site)" };
export const READINESS_STEP: Record<TReadinessItem, "/onboarding" | "/templates" | "/discovery"> = { repo: "/onboarding", paths: "/onboarding", template: "/templates", profile: "/discovery" };

export interface IPublishReadiness {
	ready: boolean;
	missing: TReadinessItem[];
}

/**
 * F22: a site is ready to publish when its repo connection is active, the content and asset folders are confirmed,
 * and an article template is confirmed. Search Console is recommended, not required.
 */
export function publishReadiness(i: { repo: { active: boolean; contentDir?: string | null; assetDir?: string | null } | null; templateConfirmed: boolean; /** SD3: a regulated site's first draft waits for the profile (disclaimers) to be accepted. */ profileAcceptanceNeeded?: boolean }): IPublishReadiness {
	const missing: TReadinessItem[] = [];
	if (!i.repo?.active) missing.push("repo");
	if (!i.repo?.active || !i.repo.contentDir?.trim() || !i.repo.assetDir?.trim()) missing.push("paths");
	if (!i.templateConfirmed) missing.push("template");
	if (i.profileAcceptanceNeeded) missing.push("profile");
	return { ready: missing.length === 0, missing };
}

/** "Waiting for setup: connect the repo, confirm the article template" (F23). */
export const waitingForSetup = (missing: TReadinessItem[]) => `Waiting for setup: ${missing.map((m) => READINESS_LABEL[m]).join(", ")}`;

export const TIER_LABEL: Record<TModelTier, string> = { fast: "Fast", workhorse: "Workhorse", strongest: "Strongest" };

export interface IEstimate {
	usd: number;
	budget: TBudgetKind;
	tier: TModelTier;
}

/** Cost estimate shown before any run starts. Pillar/money pages route to the strongest model (×2). */
export function estimateRun(kind: TRunKind, site: Pick<ISite, "cadenceTarget">, opts: { strongModel?: boolean; slots?: number } = {}): IEstimate {
	const meta = RUN_META[kind];
	let usd = meta.baseUsd;
	let tier = meta.tier;
	if (kind === "post-generation" && opts.strongModel) {
		usd *= 2;
		tier = "strongest";
	}
	if (kind === "image-generation") usd *= Math.max(1, opts.slots ?? 1);
	if (kind === "keyword-swarm" && site.cadenceTarget > 4) usd *= site.cadenceTarget / 4;
	return { usd: round2(usd), budget: meta.budget, tier };
}

export const CAP_WARN_RATIO = 0.8;
export type TCapStatus = "allowed" | "warn" | "refused";

export interface ICapCheck {
	status: TCapStatus;
	budget: TBudgetKind;
	spentUsd: number;
	capUsd: number;
	afterUsd: number;
	pct: number; // 0..100+ after this run
	message: string;
}

export function budgetFor(site: Pick<ISite, "budgets">, budget: TBudgetKind) {
	return budget === "text" ? { spent: site.budgets.textUsd, cap: site.budgets.textCapUsd } : { spent: site.budgets.imageUsd, cap: site.budgets.imageCapUsd };
}

/** Refuse above the cap with a clear message; warn at 80%. */
export function checkCap(site: Pick<ISite, "budgets">, kind: TRunKind, estimate: IEstimate | number): ICapCheck {
	const est = typeof estimate === "number" ? { usd: estimate, budget: RUN_META[kind].budget } : estimate;
	const { spent, cap: capUsd } = budgetFor(site, est.budget);
	const afterUsd = round2(spent + est.usd);
	const pct = capUsd > 0 ? Math.round((afterUsd / capUsd) * 100) : 100;
	const base = { budget: est.budget, spentUsd: spent, capUsd, afterUsd, pct };
	if (afterUsd > capUsd)
		return {
			...base,
			status: "refused",
			message: `Refused: est. ${fmtUsd(est.usd)} would take ${est.budget} spend to ${fmtUsd(afterUsd)}, over the ${fmtUsd(capUsd)} monthly cap. An admin can raise the cap.`,
		};
	if (afterUsd >= capUsd * CAP_WARN_RATIO) return { ...base, status: "warn", message: `Est. ${fmtUsd(est.usd)} · takes ${est.budget} spend to ${pct}% of cap` };
	return { ...base, status: "allowed", message: `Est. ${fmtUsd(est.usd)} · within ${est.budget} cap` };
}

// ─── Trajectory ──────────────────────────────────────────────────────────────

export interface IGap {
	pct: number; // signed, 1dp: −6.2
	actual: number;
	projected: number;
	week: string;
}

/** Headline number: latest week's actual vs projection. Null when the latest week has no data (never invent). */
export function gapToProjection(points: IWeekPoint[]): IGap | null {
	const last = points[points.length - 1];
	if (!last || last.sessions === null || last.projected <= 0) return null;
	return { pct: round1(((last.sessions - last.projected) / last.projected) * 100), actual: last.sessions, projected: last.projected, week: last.week };
}

// ─── Roles & permissions (PRD "Users and roles") ─────────────────────────────

export type TPermission =
	| "plan.view"
	| "seo.view"
	| "audit.view"
	| "idea.create"
	| "idea.approve"
	| "publishing.set"
	| "publishing.autoMerge"
	| "post.promote"
	| "post.generate"
	| "post.schedule"
	| "post.edit"
	| "post.comment"
	| "post.sendToReview"
	| "post.sendBack"
	| "post.approve"
	| "gate.override"
	| "asset.manage"
	| "mr.merge"
	| "mr.rebase"
	| "template.ingest"
	| "template.confirm"
	| "repo.connect"
	| "searchConsole.connect"
	| "run.trigger"
	| "schedule.toggle"
	| "budget.set"
	| "routing.set"
	| "members.manage"
	| "site.add"
	| "discovery.run"
	| "discovery.configure";

const S: TRole = "specialist";
const D: TRole = "developer";
const K: TRole = "stakeholder";
const A: TRole = "admin";

export const PERMISSIONS: Record<TPermission, TRole[]> = {
	"plan.view": [S, D, K, A],
	"seo.view": [S, D, K, A],
	"audit.view": [S, D, K, A],
	"idea.create": [S, A],
	"idea.approve": [S, A], // C10: the one human decision under autopost
	"publishing.set": [S, A], // autopost on/off per site
	"publishing.autoMerge": [A], // auto-merge on green CI is deploy policy: admin only
	"post.promote": [S, A],
	"post.generate": [S, A],
	"post.schedule": [S, A],
	"post.edit": [S, A],
	"post.comment": [S, D, K, A],
	"post.sendToReview": [S, A],
	"post.sendBack": [S, A],
	"post.approve": [S, A],
	"gate.override": [S, A],
	"asset.manage": [S, A],
	"mr.merge": [D, A],
	"mr.rebase": [D, A],
	"template.ingest": [D, A],
	"template.confirm": [D, A],
	"repo.connect": [D, A],
	"searchConsole.connect": [D, A],
	"run.trigger": [S, A],
	"schedule.toggle": [S, A],
	"budget.set": [A],
	"routing.set": [A],
	"members.manage": [A],
	"site.add": [A],
	"discovery.run": [S, A], // start or re-run site discovery, edit and accept the profile
	"discovery.configure": [A], // crawl limits and the discovery budget
};

export const ROLE_LABEL: Record<TRole, string> = { specialist: "Content specialist", developer: "Developer", stakeholder: "Client stakeholder", admin: "Agency admin" };

export const roleCan = (role: TRole, p: TPermission) => PERMISSIONS[p].includes(role);

/** Why an action is locked for this role — for LockedAction copy. Null when allowed. */
export function lockReason(role: TRole, p: TPermission): string | null {
	if (roleCan(role, p)) return null;
	if (role === "stakeholder") return "Stakeholders can view and comment only";
	if (p === "post.approve" || p === "gate.override" || p === "post.sendBack") return "Only the content specialist approves content";
	if (p === "idea.approve") return "Only the content specialist approves ideas";
	if (p === "mr.merge" || p === "mr.rebase") return "Only a developer merges merge requests";
	if (p === "repo.connect" || p === "template.ingest" || p === "template.confirm" || p === "searchConsole.connect") return "Repo and template setup belongs to the developer";
	if (p === "budget.set" || p === "routing.set" || p === "members.manage" || p === "site.add" || p === "publishing.autoMerge") return "Only an agency admin can change this";
	if (p === "publishing.set") return "Only the content specialist or an admin changes publishing";
	if (p === "discovery.run") return "Only the content specialist or an admin runs site discovery";
	if (p === "discovery.configure") return "Only an agency admin changes discovery limits";
	return `${ROLE_LABEL[role]}s can't do this`;
}

// ─── Formatting (Lagos time, en-GB) ──────────────────────────────────────────

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const MINUS = "−";

/** Host-native MR reference: GitHub "#45", GitLab "!45". */
export const mrRef = (mr: { number: number; host: "github" | "gitlab" } | undefined) => (mr ? `${mr.host === "gitlab" ? "!" : "#"}${mr.number}` : "");

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
/** "$142 / $200" style whole-dollar money. */
export const fmtUsdWhole = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const fmtShare = (n: number) => `${n.toFixed(1)}%`;
/** Signed delta with a true minus: "+2.1", "−1.3", "0.0". */
export function fmtDelta(n: number, digits = 1): string {
	if (Math.abs(n) < 0.5 * 10 ** -digits) return (0).toFixed(digits);
	return n > 0 ? `+${n.toFixed(digits)}` : `${MINUS}${Math.abs(n).toFixed(digits)}`;
}
export const fmtSignedPct = (n: number) => `${fmtDelta(n)}%`;

const dtf = (o: Intl.DateTimeFormatOptions) => {
	const f = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, ...o });
	// Newer ICU renders en-GB September as "Sept"; the content spec uses three-letter months everywhere.
	return { format: (d: Date) => f.format(d).replace("Sept", "Sep") };
};
/** "25 Sep 2026, 10:42" */
export const fmtDateTime = (iso: string) => `${dtf({ day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso))}, ${fmtTime(iso)}`;
/** "25 Sep" */
export const fmtDate = (iso: string) => dtf({ day: "2-digit", month: "short" }).format(new Date(iso));
/** "Mon 29 Sep" */
export const fmtDay = (iso: string) => dtf({ weekday: "short", day: "2-digit", month: "short" }).format(new Date(iso)).replace(",", "");
/** "09:00" */
export const fmtTime = (iso: string) => dtf({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** "just now" · "4 min ago" · "2 h ago" · "3 days ago"; future: "in 24 h". */
export function fmtAgo(iso: string, at: Date = clockNow()): string {
	const diff = at.getTime() - new Date(iso).getTime();
	const future = diff < 0;
	const m = Math.round(Math.abs(diff) / 60000);
	const s = m < 1 ? "" : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} day${Math.round(m / 1440) > 1 ? "s" : ""}`;
	if (!s) return "just now";
	return future ? `in ${s}` : `${s} ago`;
}

/** Compact age for version rails: "4m", "22m", "1h", "3d". */
export function fmtAgeShort(iso: string, at: Date = clockNow()): string {
	const m = Math.max(0, Math.round((at.getTime() - new Date(iso).getTime()) / 60000));
	if (m < 60) return `${m}m`;
	if (m < 1440) return `${Math.round(m / 60)}h`;
	return `${Math.round(m / 1440)}d`;
}

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);
