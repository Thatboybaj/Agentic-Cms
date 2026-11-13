// Agentic CMS domain model — mirrors PRD "Data model" (Site owns TemplateManifest, Pillar, Keyword, Post, Asset, Run).
// UI-facing shapes only; the backend slice maps its rows onto these.

export type TRole = "specialist" | "developer" | "stakeholder" | "admin";

export type TPostState = "idea" | "briefed" | "drafting" | "needs-assets" | "in-review" | "mr-open" | "live" | "decaying";

/** Who is expected to move a post / item forward. Drives the tone system (Agent-blue rule). */
export type TOwner = "agent" | "human" | "developer" | "system";

/** Semantic tones used by chips, dots, callouts. `agent` = blue, `human` = amber, `block` = red, `pass` = green. */
export type TTone = "neutral" | "ink" | "agent" | "human" | "block" | "pass" | "info";

export type TIntent = "transactional" | "commercial" | "informational" | "navigational";
export type TContentType = "guide" | "comparison" | "listicle" | "how-to" | "faq" | "pillar" | "money-page";
export type TIdeaSource = "keyword-swarm" | "kas-gap" | "manual" | "refresh" | "site-discovery";

export interface ISite {
	id: string;
	name: string;
	domain: string;
	icon: string; // phosphor icon name for the tenant avatar, e.g. "tooth"
	ageMonths: number;
	cadenceTarget: number; // posts per week
	repo: IRepoConnection | null;
	searchConsole: "connected" | "missing" | "expired";
	rankSource: "ahrefs" | "semrush" | null;
	budgets: { textUsd: number; textCapUsd: number; imageUsd: number; imageCapUsd: number };
	/** Founder direction C10/C11: only ideas need approval; generated content autoposts unless disabled per site. */
	publishing: IPublishing;
	/** URL segment: /s/<slug>/… (docs/multi-site-contract.md). Immutable once created. */
	slug: string;
	industry: string;
	status: TSiteStatus;
	createdAt: string;
	/** Hue (0–359) for the site avatar. */
	accent?: number;
}

export type TSiteStatus = "active" | "onboarding" | "paused";

export interface IPublishing {
	/** On: approved ideas flow Briefed → Drafting → assets → agent auto-gate → MR, with no human review. Off: In review gate. */
	autopost: boolean;
	/** On: MRs the agent shipped under autopost merge themselves when the repo's CI passes. Human-approved MRs never do. */
	autoMergeOnGreenCi: boolean;
	/** On: the visual-asset agent never fills human-only image slots; autopost holds the post instead. */
	humanOnlyAssets?: boolean;
}

/** Idea approval (C10). Absent on an Idea = pending; absent on later states = approved before this field existed. */
export interface IIdeaApproval {
	status: "pending" | "approved" | "rejected";
	by?: string;
	at?: string;
	note?: string;
}

export interface IRepoConnection {
	host: "github" | "gitlab";
	repo: string; // "lumen/lumendental.co"
	baseBranch: string; // "main"
	contentDir: string; // "content/blog"
	assetDir: string; // "public/images/blog"
	branchPattern: string; // "content/{slug}"
	installedAs: string; // app installation name
}

export interface IPillar {
	id: string;
	name: string;
	plannedPosts: number; // planned coverage
	livePosts: number;
	kasShare: number; // 0..100
	claimedButUnearned: boolean; // < 5% of score while in plan
}

export interface IKeyword {
	id: string;
	term: string;
	pillarId: string;
	intent: TIntent;
	difficulty: number; // 0..100
	difficultyEvidence: string; // "KD 31 · Ahrefs"
	impressions: number;
	position: number | null;
	positionTrend: number[]; // oldest → newest, 8 points
	kasShare: number; // % of total site search weight
	kasDelta: number; // period over period, percentage points
	rankingUrl: string | null;
	rankingPages: number; // 1 = orphan weight
	decaying: boolean;
}

export type TVersionOrigin = "agent-generation" | "agent-edit" | "human-edit" | "refresh";

export interface IVersion {
	id: string;
	n: number; // v1, v2…
	origin: TVersionOrigin;
	actor: string; // "Blog writer agent" | "Tolu B."
	at: string; // ISO
	words: number;
	note?: string;
	/** Snapshot of the content at this version (enables restore + diff). */
	blocks?: IPostBlock[];
	seoTitle?: string;
}

export type TGateSection = 1 | 2 | 3 | 4 | 5 | 6 | 7; // first five sections are hard-blocking

export interface IGateCheck {
	id: string;
	label: string; // "Title front-loaded"
	section: TGateSection;
	status: "pass" | "fail" | "warn";
	value: string; // "54 ch" · "1.1% · 9 uses"
	severity: "hard" | "soft";
	override?: { reason: string; by: string; at: string };
}

export interface IFactMarker {
	id: string;
	claim: string; // the highlighted text
	status: "open" | "resolved";
	source?: string; // url when resolved
	note: string; // "The agent found no citable source for "95%"."
}

export interface IAgentSuggestion {
	id: string;
	instruction: string; // "tighten this section"
	before: string;
	after: string;
	blockId: string;
	status: "pending" | "accepted" | "rejected";
	/** Accepting passes this gate check (e.g. "Fix" on keyword-in-first-100-words). */
	fixesCheckId?: string;
	/** Accepting resolves this fact marker ("Rewrite without it"). */
	resolvesFactId?: string;
	/** When set, accepting inserts a new block of this kind after `blockId` instead of replacing text. */
	insertKind?: IPostBlock["kind"];
	createdAt?: string;
}

export interface IPostBlock {
	id: string;
	kind: "h2" | "h3" | "p" | "ul" | "quote" | "image" | "faq" | "disclaimer";
	text: string; // for ul: items joined by "\n"; for image: slot id
	factMarkerIds?: string[];
}

export type TProvider = "higgsfield" | "openai" | "open-source" | "web-source" | "inline-svg" | "human";
export type TSlotType = "hero" | "lifestyle" | "diagram" | "screenshot" | "chart" | "photo";

export interface ICandidate {
	id: string;
	label: string; // "candidate 1"
	hue: number; // placeholder art hue (no real images in the prototype)
	selected: boolean;
	/** Real image: an https URL or a data URI. Absent = placeholder art from `hue`. */
	url?: string;
	/** Provenance recorded by the visual-asset agent (C13). Sourced images always carry license + attribution. */
	source?: ICandidateSource;
}

export interface ICandidateSource {
	kind: "generated" | "diagram" | "sourced" | "upload";
	provider: string; // "higgsfield" · "openai" · "inline-svg" · "unsplash" · "human"
	model?: string;
	license?: string;
	attribution?: string;
	sourceUrl?: string;
	creator?: string;
}

export interface IImageSlot {
	id: string;
	postId: string;
	name: string; // "Lifestyle · inline 2"
	type: TSlotType;
	placement: string; // 'After "Is it worth the cost?"'
	width: number;
	height: number;
	format: "webp" | "avif" | "svg";
	breakpoints: number[];
	filename: string;
	alt: string;
	prompt: string;
	styleKeywords: string[];
	provider: TProvider;
	model: string; // "flux-dev"
	status: "queued" | "generating" | "candidates" | "selected" | "human-only" | "failed";
	candidates: ICandidate[];
	estimateUsd: number;
	generatedAt?: string;
	/** A person marked this slot human-only; autopost waits for them instead of letting the visual-asset agent fill it. */
	humanPinned?: boolean;
}

export interface IMergeRequest {
	id: string;
	number: number;
	host: "github" | "gitlab";
	branch: string;
	base: string;
	status: "open" | "merged" | "closed" | "conflict";
	ci: "pending" | "passing" | "failing" | "none";
	previewUrl?: string;
	files: { path: string; change: string; kind: "post" | "assets" | "index" }[];
	openedAt: string;
	mergedAt?: string;
	overrides: string[];
	postId?: string;
	title?: string; // commit/MR title
	description?: string; // markdown MR description
	ciDetail?: string; // failing job summary surfaced in the post timeline
	conflictDetail?: string;
	mergedBy?: string;
	manifestVersion?: number;
	/** Opened by the CMS agent under autopost (no human approval). Only these auto-merge on green CI. */
	autopost?: boolean;
}

export interface IPost {
	id: string;
	slug: string;
	title: string; // working title (lowercase keyword-style in plan, like refs)
	seoTitle: string;
	keywordId: string;
	pillarId: string;
	intent: TIntent;
	contentType: TContentType;
	source: TIdeaSource;
	state: TPostState;
	owner: TOwner;
	week: number; // ISO week scheduled
	strongModel: boolean; // pillar/money pages route to stronger model
	progress?: { label: string; value: number }; // "Writing section 4 of 7"; value is a percent 0–100
	words: number;
	wordTarget: number;
	blocks: IPostBlock[];
	gate: IGateCheck[];
	facts: IFactMarker[];
	suggestions: IAgentSuggestion[];
	versions: IVersion[];
	slotIds: string[];
	mr?: IMergeRequest;
	daysInState: number;
	kasContribution?: number; // live posts
	regulated?: "health" | "finance" | "legal";
	comments: { id: string; by: string; role: TRole; text: string; at: string }[];
	/** Canonical MR lives in ISiteData.mergeRequests; this is its id. (`mr` above is not populated by the store.) */
	mrId?: string;
	/** Structures the post needs from the template beyond what its blocks imply (e.g. a comparison table). */
	requires?: TTemplateStructure[];
	sendBackNote?: string;
	/** Only ideas need a human decision (C10). See IIdeaApproval. */
	ideaApproval?: IIdeaApproval;
	/** Person responsible for moving this post forward (IUser.id). */
	assigneeId?: string;
	/** Soft edit lock. Fresh while `since` is under EDIT_LOCK_MS old; the holder refreshes it by calling startEditing again. */
	editingBy?: { userId: string; since: string };
	/** Site discovery idea (prd-site-discovery F19): the pages/queries it came from, the angle, links to add. */
	discovery?: { evidence: string[]; angle?: string; secondaryKeywords: string[]; internalLinkTargets: string[] };
	/** Approved but waiting until the site can publish (F25): the readiness items still missing. */
	waitingFor?: string[];
	/** Rubrics and authors: the credited author and how they were resolved. */
	author?: { id: string; source: "override" | "rubric" | "default"; reviewerId?: string; rubricId?: string };
}

export type TRunKind = "keyword-swarm" | "post-generation" | "technical-monitor" | "qa-sweep" | "content-refresh" | "link-prospecting" | "biweekly-report" | "kas-recalc" | "image-generation" | "site-discovery" | "translation";

export interface ISchedule {
	kind: TRunKind;
	label: string; // "Keyword swarm"
	cadence: string; // "Monday weekly"
	produces: string; // "New ideas in the plan"
	nextAt: string;
	enabled: boolean;
}

export interface IRun {
	id: string;
	kind: TRunKind;
	trigger: "scheduled" | "manual";
	status: "queued" | "running" | "succeeded" | "failed" | "refused-over-cap";
	agent: string; // "Keyword swarm agent"
	model: string; // tier label: "fast" | "workhorse" | "strongest" + id
	tokens: number;
	costUsd: number;
	estimateUsd: number;
	startedAt: string;
	durationSec?: number;
	postId?: string;
	output: string;
	tier?: TModelTier;
	slotId?: string;
	budget?: TBudgetKind;
	/** Site discovery: the step it's on and the crawl count (prd-site-discovery §9). */
	stage?: string;
	pages?: { total: number; crawled: number; skipped: number };
}

export interface ILedgerItem {
	id: string;
	title: string;
	owner: string;
	createdAt: string;
	ageDays: number; // overdue ≥ 7, named blocker ≥ 14
	downstream: string; // "holds 1 post in Needs assets"
	postId?: string;
	slotId?: string;
	done?: boolean;
	/** "autopost-hold": the agent held this post in In review because of a block it can't clear. */
	kind?: "autopost-hold" | "autopost-refused";
}

export interface ITemplateMapping {
	id: string;
	selector: string; // "h2.post__heading"
	role: "content-region" | "heading" | "list" | "quote" | "table" | "image" | "meta" | "schema" | "unclassified";
	status: "mapped" | "needs-you" | "absent";
	detail: string;
	group?: "content" | "images" | "meta"; // Content structures · Image containers · Metadata and schema
	label?: string; // developer-chosen meaning for a hand-mapped item, e.g. "CTA block", "Author bio", "Ignored"
	options?: string[]; // suggested labels for unclassified items
}

export interface ITemplateManifest {
	id: string;
	version: number;
	source: string; // "lumen-site.zip · 38 files"
	kind: "html" | "zip";
	output: "mdx" | "html" | "json" | "component";
	status: "parsing" | "needs-confirmation" | "confirmed" | "superseded";
	confirmedBy?: string;
	confirmedAt?: string;
	mappings: ITemplateMapping[];
	/** Sample post HTML from a real client-side parse (rendered in the ingest preview). */
	sampleHtml?: string;
	/** Convex: the sample's path in the bundle and the absolute URL its relative CSS/images resolve against. */
	samplePath?: string;
	assetBase?: string;
	/** Convex: why the server parse failed (the manifest stays in parsing). */
	parseError?: string;
}

export interface IWeekPoint {
	week: string; // "W32"
	sessions: number | null; // null = data gap
	impressions: number | null;
	projected: number;
}

export interface IPlanStatus {
	id: "cadence" | "pillar-coverage" | "technical-health" | "human-execution";
	label: string;
	value: string;
	light: "green" | "amber" | "red";
	detail: string;
}

export interface IReportEdition {
	id: string;
	n: number;
	period: string;
	publishedAt: string;
	headline: string;
	pivotTriggers: string[];
}

export interface IAuditEvent {
	id: string;
	at: string;
	actor: string;
	action: string; // "approved", "overrode soft block", "merged"
	target: string;
	detail?: string;
}

export interface IMember {
	id: string;
	name: string;
	initials: string;
	role: TRole;
	email: string;
}

export interface INotification {
	id: string;
	at: string;
	tone: TTone;
	title: string;
	body: string;
	href?: string;
	read: boolean;
}

// ─── Store-level shapes (client data layer) ──────────────────────────────────

export type TModelTier = "fast" | "workhorse" | "strongest";
export type TBudgetKind = "text" | "image";
/** Structures a post can require from the template manifest (fidelity rule). */
export type TTemplateStructure = "table" | "list" | "quote" | "image" | "schema";

export interface IKasSnapshot {
	id: string;
	at: string;
	trigger: "post-merge" | "weekly" | "manual";
	label: string; // "Recalculated 24 Sep · after 1 merge"
	mrId?: string;
	postId?: string;
	concentration: number;
	shares: { keywordId: string; share: number; position: number | null }[];
}

export interface IBrandPack {
	voice: string;
	palette: string[];
	styleKeywords: string[];
	disclaimers: Partial<Record<"health" | "finance" | "legal", string>>;
}

/** A deferred simulation step. Serializable so in-flight work survives reloads. */
export interface IJob {
	id: string;
	at: number; // epoch ms on the demo clock
	siteId: string;
	kind: "draft-progress" | "draft-complete" | "suggestion-ready" | "slot-candidates" | "template-parsed" | "run-complete" | "ci-result" | "revise-complete" | "autopost-brief" | "autopost-gate" | "auto-merge";
	payload: Record<string, string | number | boolean | null>;
}

/** Everything one tenant owns. Tenant isolation = nothing crosses ISiteData boundaries. */
export interface ISiteData {
	pillars: IPillar[];
	keywords: IKeyword[];
	posts: IPost[];
	slots: IImageSlot[];
	manifests: ITemplateManifest[];
	mergeRequests: IMergeRequest[];
	runs: IRun[];
	schedules: ISchedule[];
	ledger: ILedgerItem[];
	trajectory: IWeekPoint[];
	planStatus: IPlanStatus[];
	reports: IReportEdition[];
	kasSnapshots: IKasSnapshot[];
	audit: IAuditEvent[];
	notifications: INotification[];
	liveBaseline: number; // live posts that predate the CMS (counted in stats, not seeded as objects)
	routing: Record<TSlotType, TProvider>;
	modelRouting: Record<"mechanical" | "writing" | "strategy" | "pillar-pages", TModelTier>;
	brandPack: IBrandPack;
	ctrCurve?: number[]; // per-client CTR curve override (position 1..n)
	/** Ideas a person rejected (kept out of the plan, kept for dedup and the audit trail). */
	rejectedIdeas?: IPost[];
}

// ─── Workspace (multi-site, multi-user) ──────────────────────────────────────

export type TUserStatus = "active" | "invited" | "suspended";

export interface IUser {
	id: string;
	name: string;
	initials: string;
	email: string;
	title?: string;
	avatarHue: number;
	status: TUserStatus;
	invitedBy?: string; // IUser.id
	invitedAt?: string;
}

export interface IWorkspace {
	id: string;
	name: string; // "Grandeur"
	plan: "pilot" | "agency" | "enterprise";
	seatsUsed: number;
	seats: number;
}

/** Workspace-level role. owner/admin → effective `admin` on every site; member → per-site IMembership. */
export type TWorkspaceRole = "owner" | "admin" | "member";

/** Site-level role, one per user per site. No membership (and not owner/admin) = no access. */
export interface IMembership {
	userId: string;
	siteId: string;
	role: TRole;
	addedAt: string;
	addedBy: string; // IUser.id or "system"
}

/** Who is where (simulated realtime; synced across tabs). One entry per user, last write wins. */
export interface IPresence {
	userId: string;
	siteId: string;
	path: string;
	at: string;
}

/** "Request access" from the no-access state. Workspace admins see open requests in their inbox. */
export interface IAccessRequest {
	id: string;
	userId: string;
	siteId: string;
	at: string;
	status: "open" | "granted" | "dismissed";
}

export interface ICmsState {
	version: 2;
	workspace: IWorkspace;
	users: IUser[];
	workspaceRoles: Record<string, TWorkspaceRole>;
	memberships: IMembership[];
	sites: ISite[];
	data: Record<string, ISiteData>;
	jobs: IJob[];
	presence: IPresence[];
	/** Workspace-level audit (invites, roles, sites). Site-level events stay in ISiteData.audit. */
	audit: IAuditEvent[];
	accessRequests: IAccessRequest[];
}

/** Persisted shape before multi-site (localStorage `cms.state.v1`). Only read by the migration. */
export interface ICmsStateV1 {
	version: 1;
	siteId: string;
	role: TRole;
	sites: Omit<ISite, "slug" | "industry" | "status" | "createdAt" | "accent">[];
	members: IMember[];
	data: Record<string, ISiteData>;
	jobs: IJob[];
}
