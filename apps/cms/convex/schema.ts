/**
 * Agentic CMS Convex schema (own deployment, backend decision D1).
 *
 * Adopted from docs/backend/convex-schema.draft.ts; keep the two in sync (handoff 01 "Interfaces it must honour").
 * Field-by-field mapping, derived fields and index rationale: docs/backend/schema.md.
 *
 * Conventions
 *  - TENANT-SCOPED tables carry `workspaceId` + `siteId`, and their first index starts with `siteId`.
 *    Every public function resolves access through `requireSiteRole(ctx, siteId, permission)` before reading them.
 *  - Times are epoch milliseconds (`v.number()`). The client adapter formats them into the ISO strings types.ts uses.
 *  - Display names for actors are denormalised (`actor`) next to the id (`actorUserId`) so audit rows survive user deletion.
 *  - Secrets live ONLY in `secrets` (ciphertext). No other table stores a key, token or password.
 *  - Large blobs (template files, images, report HTML) live in R2; tables hold the key + metadata.
 */
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared validators (mirror the TS unions in src/lib/types.ts) ─────────────

export const vRole = v.union(v.literal("specialist"), v.literal("developer"), v.literal("stakeholder"), v.literal("admin"));
export const vWorkspaceRole = v.union(v.literal("owner"), v.literal("admin"), v.literal("member"));
export const vPostState = v.union(
	v.literal("idea"),
	v.literal("briefed"),
	v.literal("drafting"),
	v.literal("needs-assets"),
	v.literal("in-review"),
	v.literal("mr-open"),
	v.literal("live"),
	v.literal("decaying"),
);
export const vOwner = v.union(v.literal("agent"), v.literal("human"), v.literal("developer"), v.literal("system"));
export const vTone = v.union(v.literal("neutral"), v.literal("ink"), v.literal("agent"), v.literal("human"), v.literal("block"), v.literal("pass"), v.literal("info"));
export const vIntent = v.union(v.literal("transactional"), v.literal("commercial"), v.literal("informational"), v.literal("navigational"));
export const vContentType = v.union(
	v.literal("guide"),
	v.literal("comparison"),
	v.literal("listicle"),
	v.literal("how-to"),
	v.literal("faq"),
	v.literal("pillar"),
	v.literal("money-page"),
);
/** Site discovery settings (prd-site-discovery F1, F6, F17, SD5). Absent = DISCOVERY_DEFAULTS. */
export const vDiscoverySettings = v.object({ onAdd: v.boolean(), maxPages: v.number(), depth: v.number(), exclude: v.array(v.string()), subdomains: v.boolean(), competitorCheck: v.boolean(), batchSize: v.number() });
/** Volume tier: discovery uses low · medium · high; the keyword swarm v0.3 adds the in-between tiers. */
export const vVolumeTier = v.union(v.literal("low"), v.literal("low-med"), v.literal("medium"), v.literal("med-high"), v.literal("high"), v.literal("very-high"));
export const vFunnel = v.union(v.literal("awareness"), v.literal("consideration"), v.literal("decision"));
export const vPageType = v.union(v.literal("home"), v.literal("service"), v.literal("product"), v.literal("blog-post"), v.literal("category"), v.literal("location"), v.literal("about"), v.literal("contact"), v.literal("legal"), v.literal("other"));
export const vRegulatedCategory = v.union(v.literal("health"), v.literal("finance"), v.literal("legal"), v.literal("none"));
/** A claim and the evidence it rests on: crawled page URLs, "gsc:<query>", or competitor URLs. */
export const vCited = v.object({ value: v.string(), evidence: v.array(v.string()) });

export const vIdeaSource = v.union(v.literal("keyword-swarm"), v.literal("kas-gap"), v.literal("manual"), v.literal("refresh"), v.literal("site-discovery"));
export const vModelTier = v.union(v.literal("fast"), v.literal("workhorse"), v.literal("strongest"));
export const vBudgetKind = v.union(v.literal("text"), v.literal("image"));
export const vRunKind = v.union(
	v.literal("keyword-swarm"),
	v.literal("post-generation"),
	v.literal("technical-monitor"),
	v.literal("qa-sweep"),
	v.literal("content-refresh"),
	v.literal("link-prospecting"),
	v.literal("site-discovery"),
	v.literal("biweekly-report"),
	v.literal("kas-recalc"),
	v.literal("image-generation"),
);
export const vProvider = v.union(
	v.literal("higgsfield"),
	v.literal("openai"),
	v.literal("open-source"),
	v.literal("web-source"),
	v.literal("inline-svg"),
	v.literal("human"),
);
export const vSlotType = v.union(v.literal("hero"), v.literal("lifestyle"), v.literal("diagram"), v.literal("screenshot"), v.literal("chart"), v.literal("photo"));
export const vTemplateStructure = v.union(v.literal("table"), v.literal("list"), v.literal("quote"), v.literal("image"), v.literal("schema"));
export const vGitHost = v.union(v.literal("github"), v.literal("gitlab"));
export const vRegulated = v.union(v.literal("health"), v.literal("finance"), v.literal("legal"));

export const vPublishing = v.object({
	autopost: v.boolean(),
	autoMergeOnGreenCi: v.boolean(),
	humanOnlyAssets: v.optional(v.boolean()),
});

export const vIdeaApproval = v.object({
	status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
	by: v.optional(v.string()),
	byUserId: v.optional(v.id("users")),
	at: v.optional(v.number()),
	note: v.optional(v.string()),
});

export const vBlock = v.object({
	id: v.string(),
	kind: v.union(
		v.literal("h2"),
		v.literal("h3"),
		v.literal("p"),
		v.literal("ul"),
		v.literal("quote"),
		v.literal("image"),
		v.literal("faq"),
		v.literal("disclaimer"),
	),
	text: v.string(), // ul: items joined by "\n"; image: slot id (string form of Id<"imageSlots">)
	factMarkerIds: v.optional(v.array(v.string())),
});

export const vCandidateSource = v.object({
	kind: v.union(v.literal("generated"), v.literal("diagram"), v.literal("sourced"), v.literal("upload")),
	provider: v.string(),
	model: v.optional(v.string()),
	license: v.optional(v.string()),
	attribution: v.optional(v.string()),
	sourceUrl: v.optional(v.string()),
	licenseUrl: v.optional(v.string()),
	creator: v.optional(v.string()),
	/** How the agent made it ("Numbers taken verbatim from the post"). */
	note: v.optional(v.string()),
});

export const vTemplateMapping = v.object({
	id: v.string(),
	selector: v.string(),
	role: v.union(
		v.literal("content-region"),
		v.literal("heading"),
		v.literal("list"),
		v.literal("quote"),
		v.literal("table"),
		v.literal("image"),
		v.literal("meta"),
		v.literal("schema"),
		v.literal("unclassified"),
	),
	status: v.union(v.literal("mapped"), v.literal("needs-you"), v.literal("absent")),
	detail: v.string(),
	group: v.optional(v.union(v.literal("content"), v.literal("images"), v.literal("meta"))),
	label: v.optional(v.string()),
	options: v.optional(v.array(v.string())),
});

const vSlotRouting = v.object({
	hero: vProvider,
	lifestyle: vProvider,
	diagram: vProvider,
	screenshot: vProvider,
	chart: vProvider,
	photo: vProvider,
});

const vModelRouting = v.object({
	mechanical: vModelTier,
	writing: vModelTier,
	strategy: vModelTier,
	pillarPages: vModelTier, // types.ts key "pillar-pages"; Convex field names allow only [A-Za-z0-9_], the adapter maps it
});

const vBrandPack = v.object({
	voice: v.string(),
	palette: v.array(v.string()),
	styleKeywords: v.array(v.string()),
	disclaimers: v.object({
		health: v.optional(v.string()),
		finance: v.optional(v.string()),
		legal: v.optional(v.string()),
	}),
});

const vSpendCache = v.object({
	month: v.string(), // "2026-09" (site-local calendar month, Africa/Lagos for the pilot workspace)
	textMicroUsd: v.number(), // integer micro-dollars (1 USD = 1_000_000); UI shows round2(x / 1e6)
	imageMicroUsd: v.number(),
});

// ─── Schema ───────────────────────────────────────────────────────────────────

export default defineSchema({
	// ── Identity & tenancy (workspace-level) ──────────────────────────────────

	/** IWorkspace. One per Clerk organization. Workspace-level (not site-scoped). */
	workspaces: defineTable({
		clerkOrgId: v.string(),
		name: v.string(),
		slug: v.string(),
		plan: v.union(v.literal("pilot"), v.literal("agency"), v.literal("enterprise")),
		seats: v.number(), // seatsUsed is derived: count(workspaceMembers where status = active)
		autumnCustomerId: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_clerkOrg", ["clerkOrgId"])
		.index("by_slug", ["slug"]),

	/** IUser. Global (a Clerk user can belong to several workspaces). Upserted from Clerk webhook + first sign-in. */
	users: defineTable({
		clerkUserId: v.string(),
		tokenIdentifier: v.string(),
		name: v.string(),
		initials: v.string(),
		email: v.string(),
		title: v.optional(v.string()),
		avatarHue: v.number(),
		status: v.union(v.literal("active"), v.literal("invited"), v.literal("suspended")),
		lastSeenAt: v.optional(v.number()),
	})
		.index("by_token", ["tokenIdentifier"])
		.index("by_clerkUser", ["clerkUserId"])
		.index("by_email", ["email"]),

	/** ICmsState.workspaceRoles. Mirrors Clerk org membership; the Convex row is what authz reads. */
	workspaceMembers: defineTable({
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		role: vWorkspaceRole,
		status: v.union(v.literal("active"), v.literal("suspended")),
		clerkMembershipId: v.optional(v.string()),
		addedAt: v.number(),
		addedBy: v.optional(v.id("users")),
	})
		.index("by_workspace_user", ["workspaceId", "userId"])
		.index("by_user", ["userId"]),

	/** IMembership. TENANT-SCOPED. One row per user per site; absence = no access (unless workspace owner/admin). */
	memberships: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		userId: v.id("users"),
		role: vRole,
		addedAt: v.number(),
		addedBy: v.id("users"),
	})
		.index("by_site_user", ["siteId", "userId"])
		.index("by_user", ["userId"])
		.index("by_workspace_user", ["workspaceId", "userId"]),

	/** inviteUser(email, siteRoles). Workspace-level. Clerk sends the email; we keep the per-site roles to apply on accept. */
	invites: defineTable({
		workspaceId: v.id("workspaces"),
		email: v.string(),
		workspaceRole: vWorkspaceRole,
		siteRoles: v.array(v.object({ siteId: v.id("sites"), role: vRole })),
		invitedBy: v.id("users"),
		clerkInvitationId: v.optional(v.string()),
		status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("expired")),
		expiresAt: v.number(),
		createdAt: v.number(),
		acceptedAt: v.optional(v.number()),
		acceptedBy: v.optional(v.id("users")),
	})
		.index("by_workspace_status", ["workspaceId", "status"])
		.index("by_email_status", ["email", "status"])
		.index("by_clerkInvitation", ["clerkInvitationId"]),

	// ── Sites (the tenant boundary) ───────────────────────────────────────────

	/** ISite + the per-site settings that types.ts keeps on ISiteData (routing, modelRouting, brandPack, ctrCurve, liveBaseline). */
	sites: defineTable({
		workspaceId: v.id("workspaces"),
		slug: v.string(), // unique within the workspace; /s/[site] resolves (active Clerk org, slug)
		name: v.string(),
		domain: v.string(),
		industry: v.string(),
		icon: v.string(),
		accent: v.optional(v.number()),
		status: v.union(v.literal("active"), v.literal("onboarding"), v.literal("paused")),
		createdAt: v.number(),
		siteStartedAt: v.optional(v.number()), // ageMonths is derived from this
		cadenceTarget: v.number(),
		searchConsole: v.union(v.literal("connected"), v.literal("missing"), v.literal("expired")), // cache of oauthConnections.status
		rankSource: v.union(v.literal("ahrefs"), v.literal("semrush"), v.null()),
		budgetCaps: v.object({ textCapUsd: v.number(), imageCapUsd: v.number() }),
		spend: vSpendCache, // cache of spendEntries for the current month; written in the same mutation as the ledger row
		publishing: vPublishing,
		routing: vSlotRouting,
		modelRouting: vModelRouting,
		brandPack: vBrandPack,
		ctrCurve: v.optional(v.array(v.number())),
		liveBaseline: v.number(),
		timezone: v.string(), // "Africa/Lagos"; drives cron-local schedules and the spend month
		discovery: v.optional(vDiscoverySettings),
	})
		.index("by_workspace", ["workspaceId"])
		.index("by_workspace_slug", ["workspaceId", "slug"]),

	/** IRepoConnection. TENANT-SCOPED. One active row per site. Webhooks resolve the site via installation + repo. */
	repoConnections: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		host: vGitHost,
		repo: v.string(), // "lumen/lumendental.co"
		baseBranch: v.string(),
		contentDir: v.string(),
		assetDir: v.string(),
		branchPattern: v.string(), // "content/{slug}"
		installedAs: v.string(),
		installationId: v.string(), // GitHub App installation id / GitLab app integration id (string for both hosts)
		indexFiles: v.optional(v.array(v.string())), // manually maintained index/sitemap files the CMS may also write
		status: v.union(v.literal("active"), v.literal("suspended"), v.literal("removed")),
		/** Connected through the real GitHub App (gitConnect.connectRepo). Seeded/test rows lack it and keep the stub. */
		live: v.optional(v.boolean()),
		connectedBy: v.id("users"),
		connectedAt: v.number(),
	})
		.index("by_site", ["siteId"])
		.index("by_installation", ["host", "installationId"])
		.index("by_repo", ["host", "repo"]),

	/** A GitHub App installation a developer completed for a site (the /github/setup round-trip), before a repo is picked. */
	gitInstallations: defineTable({
		siteId: v.id("sites"),
		host: vGitHost,
		installationId: v.string(),
		account: v.optional(v.string()),
		createdBy: v.id("users"),
		createdAt: v.number(),
	}).index("by_site", ["siteId"]),

	// ── Plan & SEO data ───────────────────────────────────────────────────────

	/** IPillar. TENANT-SCOPED. livePosts / kasShare / claimedButUnearned are caches written by kas-recalc. */
	pillars: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		name: v.string(),
		plannedPosts: v.number(),
		livePosts: v.number(),
		kasShare: v.number(),
		claimedButUnearned: v.boolean(),
	}).index("by_site", ["siteId"]),

	/** IKeyword. TENANT-SCOPED. positionTrend + kasShare/kasDelta are caches (positionHistory / kasSnapshots are truth). */
	keywords: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		term: v.string(),
		termNormalized: v.string(), // lowercased, whitespace-collapsed: swarm dedup + GSC join
		pillarId: v.id("pillars"),
		intent: vIntent,
		difficulty: v.number(),
		difficultyEvidence: v.string(),
		impressions: v.number(),
		position: v.union(v.number(), v.null()),
		positionTrend: v.array(v.number()),
		kasShare: v.number(),
		kasDelta: v.number(),
		rankingUrl: v.union(v.string(), v.null()),
		rankingPages: v.number(),
		decaying: v.boolean(),
		/** Site discovery: what this keyword rests on (crawled URLs, "gsc:<query>", competitor URLs). */
		evidence: v.optional(v.array(v.string())),
		/** Where the volume came from; "estimate" means a tier only, never a number (F15). */
		volumeSource: v.optional(v.union(v.literal("gsc"), v.literal("import"), v.literal("estimate"))),
		volumeTier: v.optional(vVolumeTier),
		funnel: v.optional(vFunnel),
		/** Search Console position 8 to 20: a quick win. */
		quickWin: v.optional(v.boolean()),
		/** Already targeted by this crawled page (cannibalisation check, F16): no new idea for it. */
		existingPageId: v.optional(v.id("crawledPages")),
		// ── Keyword LTM (harness v0.3 keyword_ltm): the durable keyword store. Append and update only. ──
		/** candidate → qualified → in-plan → live → retired. Unset on rows from before v0.3 (read as in-plan). */
		status: v.optional(v.union(v.literal("candidate"), v.literal("qualified"), v.literal("in-plan"), v.literal("live"), v.literal("retired"))),
		cluster: v.optional(v.string()),
		lengthClass: v.optional(v.union(v.literal("seed"), v.literal("short-tail"), v.literal("long-tail"))),
		/** One primary per page, ever (cannibalisation rule); secondaries support that page. */
		role: v.optional(v.union(v.literal("primary"), v.literal("secondary"))),
		/** Precise volume only when volumeSource is gsc or import. */
		volume: v.optional(v.number()),
		difficultyTier: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
		serpFeatures: v.optional(v.array(v.string())),
		aeoPotential: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
		priorityScore: v.optional(v.number()),
		whyWeWin: v.optional(v.string()),
		sourceAgent: v.optional(v.string()),
		/** The post built for this keyword (primary) or that it supports (secondary). */
		targetPostId: v.optional(v.id("posts")),
		lastVerifiedAt: v.optional(v.number()),
		retiredReason: v.optional(v.string()),
	})
		.index("by_site", ["siteId"])
		.index("by_site_term", ["siteId", "termNormalized"])
		.index("by_site_pillar", ["siteId", "pillarId"]),

	/** PRD "Keyword owns PositionHistory". TENANT-SCOPED. One row per keyword per day per source. */
	positionHistory: defineTable({
		siteId: v.id("sites"),
		keywordId: v.id("keywords"),
		date: v.string(), // "2026-09-24"
		position: v.union(v.number(), v.null()),
		impressions: v.number(),
		clicks: v.number(),
		page: v.optional(v.string()),
		source: v.union(v.literal("gsc"), v.literal("ahrefs"), v.literal("semrush"), v.literal("csv")),
	})
		.index("by_keyword_date", ["keywordId", "date"])
		.index("by_site_date", ["siteId", "date"]),

	/** IWeekPoint (ISiteData.trajectory). TENANT-SCOPED. Written by the GSC weekly rollup; null = data gap. */
	trafficWeekly: defineTable({
		siteId: v.id("sites"),
		isoWeek: v.string(), // "2026-W32"; UI label "W32"
		sessions: v.union(v.number(), v.null()),
		impressions: v.union(v.number(), v.null()),
		projected: v.number(),
	}).index("by_site_week", ["siteId", "isoWeek"]),

	/** IKasSnapshot. TENANT-SCOPED. Append-only. */
	kasSnapshots: defineTable({
		siteId: v.id("sites"),
		at: v.number(),
		trigger: v.union(v.literal("post-merge"), v.literal("weekly"), v.literal("manual")),
		label: v.string(),
		mrId: v.optional(v.id("mergeRequests")),
		postId: v.optional(v.id("posts")),
		concentration: v.number(),
		shares: v.array(v.object({ keywordId: v.id("keywords"), share: v.number(), position: v.union(v.number(), v.null()) })),
		ctrCurveVersion: v.optional(v.string()),
	}).index("by_site_at", ["siteId", "at"]),

	/** IReportEdition. TENANT-SCOPED. The HTML edition lives in R2 (assets row). */
	reports: defineTable({
		siteId: v.id("sites"),
		n: v.number(),
		period: v.string(),
		publishedAt: v.number(),
		headline: v.string(),
		pivotTriggers: v.array(v.string()),
		htmlAssetId: v.optional(v.id("assets")),
		runId: v.optional(v.id("runs")),
	}).index("by_site_n", ["siteId", "n"]),

	// ── Posts and their children ──────────────────────────────────────────────

	/**
	 * IPost. TENANT-SCOPED. Children (versions, facts, gate checks, suggestions, slots, comments) are separate tables
	 * so agent writes and human edits don't contend on one document. `editingBy` lives in editLocks.
	 */
	posts: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		slug: v.string(),
		title: v.string(),
		seoTitle: v.string(),
		metaDescription: v.optional(v.string()),
		/** Why content-refresh picked this live post (the writer's refresh brief). */
		refreshReason: v.optional(v.string()),
		keywordId: v.id("keywords"),
		pillarId: v.id("pillars"),
		intent: vIntent,
		contentType: vContentType,
		source: vIdeaSource,
		state: vPostState,
		stateChangedAt: v.number(), // daysInState is derived
		owner: vOwner,
		week: v.number(),
		strongModel: v.boolean(),
		progress: v.optional(v.object({ label: v.string(), value: v.number() })),
		words: v.number(),
		wordTarget: v.number(),
		blocks: v.array(vBlock),
		currentVersion: v.number(), // n of the latest postVersions row
		kasContribution: v.optional(v.number()),
		regulated: v.optional(vRegulated),
		requires: v.optional(v.array(vTemplateStructure)),
		sendBackNote: v.optional(v.string()),
		ideaApproval: v.optional(vIdeaApproval),
		ideaStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"), v.literal("n/a")), // indexed mirror of ideaApproval
		assigneeId: v.optional(v.id("users")),
		mrId: v.optional(v.id("mergeRequests")),
		workflowId: v.optional(v.string()), // the in-flight @convex-dev/workflow run for this post, if any
		approvedVersion: v.optional(v.number()), // the version the human gate (or autopost gate) asserted
		liveAt: v.optional(v.number()),
		mergeCommitSha: v.optional(v.string()),
		/** Site discovery idea: evidence, angle, secondary keywords and internal link targets (F19). */
		discoveryEvidence: v.optional(v.array(v.string())),
		angle: v.optional(v.string()),
		secondaryKeywords: v.optional(v.array(v.string())),
		internalLinkTargets: v.optional(v.array(v.string())),
		discoveryRunId: v.optional(v.id("runs")),
		/** Approved but not drafted because the site is not ready to publish yet (F23). Cleared when drafting starts. */
		hold: v.optional(v.object({ reason: v.literal("waiting-for-setup"), missing: v.array(v.string()), since: v.number() })),
		/** Rubrics and authors: resolved when the idea is approved (override · rubric · default). */
		authorId: v.optional(v.id("authors")),
		reviewerId: v.optional(v.id("authors")),
		authorSource: v.optional(v.union(v.literal("override"), v.literal("rubric"), v.literal("default"))),
		rubricId: v.optional(v.id("rubrics")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_site_state", ["siteId", "state"])
		.index("by_site_week", ["siteId", "week"])
		.index("by_site_slug", ["siteId", "slug"])
		.index("by_site_keyword", ["siteId", "keywordId"])
		.index("by_site_idea", ["siteId", "ideaStatus"])
		.index("by_assignee_state", ["assigneeId", "state"]),

	/** IVersion. TENANT-SCOPED. Append-only snapshot per agent generation / edit / human edit / refresh. */
	postVersions: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		n: v.number(),
		origin: v.union(v.literal("agent-generation"), v.literal("agent-edit"), v.literal("human-edit"), v.literal("refresh")),
		actor: v.string(),
		actorUserId: v.optional(v.id("users")),
		runId: v.optional(v.id("runs")),
		at: v.number(),
		words: v.number(),
		note: v.optional(v.string()),
		blocks: v.array(vBlock),
		seoTitle: v.optional(v.string()),
	}).index("by_post_n", ["postId", "n"]),

	/** IFactMarker. TENANT-SCOPED. Open markers make the gate hard-fail; nothing overrides them. */
	factMarkers: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		blockId: v.optional(v.string()),
		claim: v.string(),
		status: v.union(v.literal("open"), v.literal("resolved")),
		source: v.optional(v.string()),
		note: v.string(),
		resolution: v.optional(v.union(v.literal("sourced"), v.literal("rewritten"))),
		resolvedBy: v.optional(v.string()),
		resolvedAt: v.optional(v.number()),
	})
		.index("by_post", ["postId"])
		.index("by_site_status", ["siteId", "status"]),

	/** IGateCheck. TENANT-SCOPED. One row per (post, checkId); rewritten by each on-page optimizer run. */
	gateChecks: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		checkId: v.string(),
		label: v.string(),
		section: v.number(), // TGateSection 1..7; sections 1–5 hard-block
		status: v.union(v.literal("pass"), v.literal("fail"), v.literal("warn")),
		value: v.string(),
		severity: v.union(v.literal("hard"), v.literal("soft")),
		override: v.optional(v.object({ reason: v.string(), by: v.string(), byUserId: v.optional(v.id("users")), at: v.number() })),
		evaluatedAt: v.number(),
		evaluatedForVersion: v.number(),
		runId: v.optional(v.id("runs")),
	})
		.index("by_post", ["postId"])
		.index("by_post_check", ["postId", "checkId"]),

	/** IAgentSuggestion. TENANT-SCOPED. Every agent edit is a diff a person (or autopost) accepts. */
	suggestions: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		instruction: v.string(),
		before: v.string(),
		after: v.string(),
		blockId: v.string(),
		status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
		fixesCheckId: v.optional(v.string()),
		resolvesFactId: v.optional(v.id("factMarkers")),
		insertKind: v.optional(vBlock.fields.kind),
		/** Set when the diff is to a post field instead of a block (blockId is then ""). */
		field: v.optional(v.union(v.literal("seoTitle"), v.literal("metaDescription"))),
		runId: v.optional(v.id("runs")),
		createdAt: v.number(),
		decidedBy: v.optional(v.string()),
		decidedAt: v.optional(v.number()),
	}).index("by_post_status", ["postId", "status"]),

	/** IPost.comments. TENANT-SCOPED. */
	comments: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		byUserId: v.id("users"),
		by: v.string(),
		role: vRole,
		text: v.string(),
		at: v.number(),
	}).index("by_post_at", ["postId", "at"]),

	// ── Images & assets ───────────────────────────────────────────────────────

	/** IImageSlot. TENANT-SCOPED. Created from the blog-writing-agent's image production sheet. */
	imageSlots: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		name: v.string(),
		type: vSlotType,
		placement: v.string(),
		width: v.number(),
		height: v.number(),
		format: v.union(v.literal("webp"), v.literal("avif"), v.literal("svg")),
		breakpoints: v.array(v.number()),
		filename: v.string(),
		alt: v.string(),
		prompt: v.string(),
		styleKeywords: v.array(v.string()),
		provider: vProvider,
		model: v.string(),
		status: v.union(
			v.literal("queued"),
			v.literal("generating"),
			v.literal("candidates"),
			v.literal("selected"),
			v.literal("human-only"),
			v.literal("failed"),
		),
		selectedCandidateId: v.optional(v.id("candidates")),
		estimateUsd: v.number(),
		generatedAt: v.optional(v.number()),
		humanPinned: v.optional(v.boolean()),
		order: v.number(),
	})
		.index("by_post", ["postId", "order"])
		.index("by_site_status", ["siteId", "status"]),

	/** ICandidate. TENANT-SCOPED. `hue` stays for placeholder art; real pixels are an assets row. */
	candidates: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		slotId: v.id("imageSlots"),
		label: v.string(),
		hue: v.number(),
		selected: v.boolean(),
		assetId: v.optional(v.id("assets")),
		source: v.optional(vCandidateSource),
		runId: v.optional(v.id("runs")),
		createdAt: v.number(),
	}).index("by_slot", ["slotId"]),

	/** Stored objects in R2 (images, variants, SVGs, uploads, report HTML). TENANT-SCOPED; R2 key is prefixed with siteId. */
	assets: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		r2Key: v.optional(v.string()), // R2 later; today the bytes live in Convex storage
		storageId: v.optional(v.id("_storage")),
		contentType: v.string(),
		bytes: v.number(),
		sha256: v.string(),
		width: v.optional(v.number()),
		height: v.optional(v.number()),
		kind: v.union(v.literal("original"), v.literal("variant"), v.literal("svg"), v.literal("upload"), v.literal("report")),
		parentAssetId: v.optional(v.id("assets")), // variants point at their original
		breakpoint: v.optional(v.number()),
		format: v.optional(v.string()),
		provenance: v.optional(vCandidateSource),
		createdBy: v.string(),
		createdAt: v.number(),
	})
		.index("by_site", ["siteId"])
		.index("by_site_sha", ["siteId", "sha256"])
		.index("by_parent", ["parentAssetId"]),

	// ── Templates ─────────────────────────────────────────────────────────────

	/** ITemplateManifest. TENANT-SCOPED. sampleHtml lives in R2 via templateFiles (samplePath). */
	templateManifests: defineTable({
		siteId: v.id("sites"),
		version: v.number(),
		source: v.string(),
		kind: v.union(v.literal("html"), v.literal("zip")),
		output: v.union(v.literal("mdx"), v.literal("html"), v.literal("json"), v.literal("component")),
		status: v.union(v.literal("parsing"), v.literal("needs-confirmation"), v.literal("confirmed"), v.literal("superseded")),
		samplePath: v.optional(v.string()),
		/** The original upload (.html or .zip) in Convex storage; parsed server-side (authoritative). */
		uploadStorageId: v.optional(v.id("_storage")),
		/** Set when the server parse failed (the manifest stays in parsing; a developer re-uploads). */
		parseError: v.optional(v.string()),
		mappings: v.array(vTemplateMapping),
		bundleFiles: v.number(),
		bundleBytes: v.number(),
		uploadedBy: v.id("users"),
		uploadedAt: v.number(),
		confirmedBy: v.optional(v.string()),
		confirmedByUserId: v.optional(v.id("users")),
		confirmedAt: v.optional(v.number()),
	})
		.index("by_site_version", ["siteId", "version"])
		.index("by_site_status", ["siteId", "status"]),

	/** Template bundle files (html/css/images/fonts). TENANT-SCOPED. Paths sanitised by render/bundle.ts safeBundlePath(). */
	templateFiles: defineTable({
		siteId: v.id("sites"),
		manifestId: v.id("templateManifests"),
		path: v.string(),
		r2Key: v.optional(v.string()), // R2 later; today the bytes live in Convex storage
		storageId: v.optional(v.id("_storage")),
		contentType: v.string(),
		bytes: v.number(),
		kind: v.union(v.literal("html"), v.literal("css"), v.literal("image"), v.literal("font")),
	}).index("by_manifest_path", ["manifestId", "path"]),

	// ── Git ───────────────────────────────────────────────────────────────────

	/** IMergeRequest. TENANT-SCOPED. Webhooks find rows via by_repo_number. */
	mergeRequests: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		postId: v.optional(v.id("posts")),
		repoConnectionId: v.id("repoConnections"),
		host: vGitHost,
		repo: v.string(),
		number: v.number(),
		externalId: v.optional(v.string()), // PR node id / MR iid
		branch: v.string(),
		base: v.string(),
		headSha: v.optional(v.string()),
		status: v.union(v.literal("open"), v.literal("merged"), v.literal("closed"), v.literal("conflict")),
		ci: v.union(v.literal("pending"), v.literal("passing"), v.literal("failing"), v.literal("none")),
		previewUrl: v.optional(v.string()),
		/** The PR on GitHub (live connections). */
		url: v.optional(v.string()),
		files: v.array(v.object({ path: v.string(), change: v.string(), kind: v.union(v.literal("post"), v.literal("assets"), v.literal("index")) })),
		openedAt: v.number(),
		mergedAt: v.optional(v.number()),
		mergeCommitSha: v.optional(v.string()),
		overrides: v.array(v.string()),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		ciDetail: v.optional(v.string()),
		conflictDetail: v.optional(v.string()),
		mergedBy: v.optional(v.string()),
		manifestVersion: v.optional(v.number()),
		postVersion: v.optional(v.number()),
		autopost: v.optional(v.boolean()),
	})
		.index("by_site_status", ["siteId", "status"])
		.index("by_post", ["postId"])
		.index("by_repo_number", ["host", "repo", "number"]),

	// ── Agent runs, schedules, artifacts, spend ───────────────────────────────

	/** IRun. TENANT-SCOPED. One row per agent execution (inputs ref, model, tokens, cost): the billable, auditable unit. */
	runs: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		kind: vRunKind,
		trigger: v.union(v.literal("scheduled"), v.literal("manual"), v.literal("workflow")),
		triggeredBy: v.optional(v.id("users")),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("succeeded"),
			v.literal("failed"),
			v.literal("refused-over-cap"),
			v.literal("cancelled"),
		),
		agent: v.string(), // display: "Keyword swarm agent"
		agentId: v.string(), // TAgentId from @studio/seo-harness, or "cms-agent"
		model: v.string(), // model id actually called (from harness MODELS, verified)
		tier: v.optional(vModelTier),
		escalated: v.optional(v.boolean()),
		inputTokens: v.number(),
		outputTokens: v.number(),
		costUsd: v.number(),
		estimateUsd: v.number(),
		budget: v.optional(vBudgetKind),
		startedAt: v.number(),
		finishedAt: v.optional(v.number()),
		postId: v.optional(v.id("posts")),
		slotId: v.optional(v.id("imageSlots")),
		output: v.string(), // one-line human summary
		error: v.optional(v.string()),
		langfuseTraceId: v.optional(v.string()),
		workflowId: v.optional(v.string()),
		idempotencyKey: v.string(),
		attempt: v.number(),
		/** Multi-step runs (site discovery): the current step and page counts, for progress cards. */
		stage: v.optional(v.string()),
		progress: v.optional(v.object({ pagesTotal: v.number(), pagesCrawled: v.number(), pagesSkipped: v.number() })),
	})
		.index("by_site_started", ["siteId", "startedAt"])
		.index("by_site_status", ["siteId", "status"])
		.index("by_post", ["postId"])
		.index("by_idempotency", ["idempotencyKey"]),

	/** ISchedule. TENANT-SCOPED. The global cron tick reads by_enabled_next. */
	schedules: defineTable({
		siteId: v.id("sites"),
		kind: vRunKind,
		label: v.string(),
		cadence: v.string(), // display: "Monday weekly"
		rule: v.string(), // machine rule: "weekly:mon@07:00" | "biweekly:fri@16:00" | "monthly:1@07:00" | "per-publish-slot"
		produces: v.string(),
		nextAt: v.number(),
		enabled: v.boolean(),
		lastRunAt: v.optional(v.number()),
		lastRunId: v.optional(v.id("runs")),
	})
		.index("by_site_kind", ["siteId", "kind"])
		.index("by_enabled_next", ["enabled", "nextAt"]),

	/** Harness data contracts ("every agent writes a dated artifact"). TENANT-SCOPED. Inline ≤ 64 KB, else R2. */
	artifacts: defineTable({
		siteId: v.id("sites"),
		agentId: v.string(),
		kind: v.string(), // output name from harness-config.yaml, e.g. "pipeline_csv", "scorecard_md", "provenance_log"
		runId: v.id("runs"),
		postId: v.optional(v.id("posts")),
		content: v.optional(v.string()),
		assetId: v.optional(v.id("assets")),
		createdAt: v.number(),
	})
		.index("by_site_agent_kind", ["siteId", "agentId", "kind", "createdAt"])
		.index("by_run", ["runId"]),

	/** Effect-fenced spend ledger per site and budget (the wallet, keyed by site not user). TENANT-SCOPED. */
	spendEntries: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		budget: vBudgetKind,
		month: v.string(),
		type: v.union(v.literal("debit"), v.literal("credit")),
		amountMicroUsd: v.number(), // positive integer micro-dollars; `type` says direction. No floats on the money path.
		reason: v.string(),
		idempotencyKey: v.string(),
		runId: v.optional(v.id("runs")),
		spentAfterMicroUsd: v.number(),
		createdAt: v.number(),
	})
		.index("by_idempotency", ["idempotencyKey"])
		.index("by_site_month_budget", ["siteId", "month", "budget"]),

	/** ILedgerItem (the human ledger). TENANT-SCOPED. ageDays + open/overdue/blocker are derived (logic.ts ledgerStatus). */
	ledgerItems: defineTable({
		siteId: v.id("sites"),
		title: v.string(),
		owner: v.string(),
		ownerUserId: v.optional(v.id("users")),
		createdAt: v.number(),
		downstream: v.string(),
		postId: v.optional(v.id("posts")),
		slotId: v.optional(v.id("imageSlots")),
		kind: v.optional(v.union(v.literal("autopost-hold"), v.literal("autopost-refused"))),
		origin: v.union(v.literal("qa-agent"), v.literal("autopost"), v.literal("system"), v.literal("human")),
		dedupeKey: v.optional(v.string()), // e.g. "autopost-hold:<postId>" so a re-run doesn't duplicate
		done: v.boolean(),
		doneAt: v.optional(v.number()),
		doneBy: v.optional(v.id("users")),
	})
		.index("by_site_done", ["siteId", "done", "createdAt"])
		.index("by_post", ["postId"])
		.index("by_site_dedupe", ["siteId", "dedupeKey"]),

	// ── Audit & notifications ─────────────────────────────────────────────────

	/** IAuditEvent. Append-only. siteId absent = workspace-level event (invite, role change, site added). */
	auditEvents: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.optional(v.id("sites")),
		at: v.number(),
		actor: v.string(), // "Tolu B." | "CMS agent (autopost)" | "Visual-asset agent"
		actorKind: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
		actorUserId: v.optional(v.id("users")),
		action: v.string(),
		target: v.string(),
		detail: v.optional(v.string()),
		postId: v.optional(v.id("posts")),
		runId: v.optional(v.id("runs")),
		inputs: v.optional(v.any()), // redacted inputs (never secrets, never full prompts)
	})
		.index("by_site_at", ["siteId", "at"])
		.index("by_workspace_at", ["workspaceId", "at"])
		.index("by_post_at", ["postId", "at"]),

	/** INotification. Per RECIPIENT (the prototype keeps one shared list per site). */
	notifications: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.optional(v.id("sites")),
		userId: v.id("users"),
		at: v.number(),
		tone: vTone,
		title: v.string(),
		body: v.string(),
		href: v.optional(v.string()), // site-relative path; the client prefixes sitePath(slug, href)
		read: v.boolean(),
		dedupeKey: v.optional(v.string()),
	})
		.index("by_user_read_at", ["userId", "read", "at"])
		.index("by_user_site", ["userId", "siteId", "at"]),

	// ── Connections & secrets ─────────────────────────────────────────────────

	/** IConnection (features/connections/catalog.ts). TENANT-SCOPED. No stdio transport in production. */
	connections: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		kind: v.union(v.literal("mcp"), v.literal("image-api"), v.literal("web-source"), v.literal("llm")),
		provider: v.string(), // TConnectionProvider; kept open so the catalog can grow without a migration
		label: v.string(),
		transport: v.optional(v.union(v.literal("streamable-http"), v.literal("sse"))),
		url: v.optional(v.string()),
		model: v.optional(v.string()),
		toolName: v.optional(v.string()),
		tools: v.optional(v.array(v.object({ name: v.string(), description: v.optional(v.string()) }))),
		usedFor: v.array(v.string()),
		enabled: v.boolean(),
		status: v.union(v.literal("untested"), v.literal("ok"), v.literal("failed")),
		statusNote: v.optional(v.string()),
		lastTestedAt: v.optional(v.number()),
		lastError: v.optional(v.string()),
		secretId: v.optional(v.id("secrets")),
		secretHint: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_site", ["siteId"])
		.index("by_site_provider", ["siteId", "provider"]),

	/** Per-tenant encrypted secrets. TENANT-SCOPED. Read ONLY by internal functions in Node actions; never returned. */
	secrets: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		ownerKind: v.union(v.literal("connection"), v.literal("oauth-access"), v.literal("oauth-refresh"), v.literal("repo")),
		ownerId: v.string(),
		ciphertext: v.string(), // AES-256-GCM "<keyVersion>.<iv>.<ciphertext>" (base64url)
		keyVersion: v.number(), // CMS_SECRETS_KEY_V<n> in Convex env; enables rotation
		hint: v.string(), // "••••a1b2"
		createdAt: v.number(),
		rotatedAt: v.optional(v.number()),
	})
		.index("by_site", ["siteId"])
		.index("by_owner", ["ownerKind", "ownerId"]),

	/** Google Search Console OAuth connection (port of apps/web googleConnections). TENANT-SCOPED. */
	oauthConnections: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		provider: v.literal("google-search-console"),
		status: v.union(v.literal("connected"), v.literal("reconnect_required"), v.literal("revoked"), v.literal("missing_scope")),
		email: v.optional(v.string()),
		scopes: v.array(v.string()),
		propertyUri: v.optional(v.string()), // "sc-domain:lumendental.co" or URL-prefix property
		accessTokenSecretId: v.optional(v.id("secrets")),
		refreshTokenSecretId: v.optional(v.id("secrets")),
		accessTokenExpiresAt: v.optional(v.number()),
		lastImportAt: v.optional(v.number()),
		lastImportedDate: v.optional(v.string()),
		lastErrorCode: v.optional(v.string()),
		connectedBy: v.id("users"),
		updatedAt: v.number(),
	}).index("by_site_provider", ["siteId", "provider"]),

	/** OAuth PKCE state (port of apps/web googleOAuthStates). Single-use, short TTL. */
	oauthStates: defineTable({
		stateHash: v.string(),
		siteId: v.id("sites"),
		userId: v.id("users"),
		provider: v.literal("google-search-console"),
		codeVerifierEncrypted: v.string(),
		redirectTo: v.string(),
		expiresAt: v.number(),
		consumedAt: v.optional(v.number()),
	}).index("by_stateHash", ["stateHash"]),

	// ── Collaboration ─────────────────────────────────────────────────────────

	/** IPresence. Heartbeat rows; a cron deletes rows older than the TTL. */
	presence: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.optional(v.id("sites")),
		userId: v.id("users"),
		sessionId: v.string(), // one per browser tab
		path: v.string(),
		at: v.number(),
	})
		.index("by_site_at", ["siteId", "at"])
		.index("by_user_session", ["userId", "sessionId"])
		.index("by_at", ["at"]),

	/** IPost.editingBy: soft edit lock. One row per post at most. */
	editLocks: defineTable({
		siteId: v.id("sites"),
		postId: v.id("posts"),
		userId: v.id("users"),
		sessionId: v.string(),
		since: v.number(),
		heartbeatAt: v.number(),
	})
		.index("by_post", ["postId"])
		.index("by_heartbeat", ["heartbeatAt"])
		.index("by_user", ["userId"]), // release a removed member's locks (clerkSync)

	// ── Billing & webhooks ────────────────────────────────────────────────────

	/** Polar subscription per site (open decision D3: per site vs per workspace). TENANT-SCOPED. */
	siteSubscriptions: defineTable({
		workspaceId: v.id("workspaces"),
		siteId: v.id("sites"),
		provider: v.literal("polar"),
		polarSubscriptionId: v.string(),
		polarProductId: v.optional(v.string()),
		status: v.string(), // provider status verbatim; entitlement derived in billing.ts
		currentPeriodEnd: v.optional(v.number()),
		updatedAt: v.number(),
	})
		.index("by_site", ["siteId"])
		.index("by_polarSubscription", ["polarSubscriptionId"]),

	/** Idempotent webhook intake (GitHub / GitLab / Clerk / Polar / Autumn). Workspace-agnostic until resolved. */
	/** Deployment-level integration credentials created in-app (GitHub App manifest flow), sealed with CMS_SECRETS_KEY. */
	// ── Site discovery (prd-site-discovery §8) ────────────────────────────────

	/** One crawled page. TENANT-SCOPED. Text is PII-stripped before storage; long text in file storage (90-day expiry). */
	crawledPages: defineTable({
		siteId: v.id("sites"),
		url: v.string(),
		canonical: v.optional(v.string()),
		status: v.number(),
		type: v.optional(vPageType),
		title: v.string(),
		metaDescription: v.optional(v.string()),
		outline: v.array(v.object({ level: v.number(), text: v.string() })),
		textStorageId: v.optional(v.id("_storage")),
		textExpiresAt: v.optional(v.number()),
		wordCount: v.number(),
		publishedAt: v.optional(v.string()),
		modifiedAt: v.optional(v.string()),
		schemaTypes: v.array(v.string()),
		internalLinks: v.array(v.string()),
		hash: v.string(),
		/** Page extraction (F10); absent until the extract step ran on this hash. */
		extract: v.optional(
			v.object({
				topic: v.string(),
				entities: v.array(v.string()),
				targetQuery: v.optional(v.string()),
				funnel: vFunnel,
				refreshCandidate: v.boolean(),
				refreshReason: v.optional(v.string()),
				hash: v.string(),
			}),
		),
		lastCrawledAt: v.number(),
		runId: v.id("runs"),
	})
		.index("by_site_url", ["siteId", "url"])
		.index("by_site_type", ["siteId", "type"])
		.index("by_text_expiry", ["textExpiresAt"]),

	/** The site profile and brand pack draft. TENANT-SCOPED, versioned (one row per run); the latest is current. */
	siteProfiles: defineTable({
		siteId: v.id("sites"),
		runId: v.id("runs"),
		version: v.number(),
		confidence: v.union(v.literal("normal"), v.literal("low")),
		sells: vCited,
		offerings: v.array(vCited),
		audience: vCited,
		regions: v.array(vCited),
		pricePositioning: v.optional(vCited),
		differentiators: v.array(vCited),
		competitorsNamed: v.array(vCited),
		regulated: v.object({ category: vRegulatedCategory, evidence: v.array(v.string()) }),
		blogCoverage: v.array(vCited),
		brandPackDraft: v.object({ voice: v.string(), voiceExamples: v.array(vCited), styleKeywords: v.array(v.string()), disclaimers: v.array(v.string()) }),
		gaps: v.array(v.string()),
		/** Interview answers when the crawl could not read the site (robots-blocked, tiny site). */
		interview: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
		acceptedBy: v.optional(v.id("users")),
		acceptedAt: v.optional(v.number()),
		editedBy: v.optional(v.id("users")),
		createdAt: v.number(),
	}).index("by_site_version", ["siteId", "version"]),

	/** What one discovery run found, for the report (F26): coverage, pillars and keywords, competitors, the ideas. */
	discoveryReports: defineTable({
		siteId: v.id("sites"),
		runId: v.id("runs"),
		status: v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed"), v.literal("needs-interview")),
		stage: v.string(),
		error: v.optional(v.string()),
		mode: v.union(v.literal("full"), v.literal("more-ideas"), v.literal("interview")),
		/** Answers to the discovery interview (robots-blocked or tiny site, §11); the profile step reads them. */
		interview: v.optional(v.array(v.object({ question: v.string(), answer: v.string() }))),
		coverage: v.object({ crawled: v.number(), skipped: v.array(v.object({ url: v.string(), reason: v.string() })), limitHit: v.boolean() }),
		pillars: v.array(
			v.object({
				name: v.string(),
				why: v.string(),
				evidence: v.array(v.string()),
				keywords: v.array(v.object({ term: v.string(), intent: v.string(), funnel: v.string(), volume: v.string(), volumeSource: v.string(), quickWin: v.boolean(), existingPageUrl: v.optional(v.string()), evidence: v.array(v.string()) })),
			}),
		),
		competitorNotes: v.array(v.object({ keyword: v.string(), ranking: v.array(v.string()), difficulty: v.string() })),
		refreshCandidates: v.array(v.object({ url: v.string(), reason: v.string() })),
		ideaIds: v.array(v.id("posts")),
		dropped: v.array(v.string()),
		costUsd: v.number(),
		createdAt: v.number(),
		finishedAt: v.optional(v.number()),
	})
		.index("by_site_created", ["siteId", "createdAt"])
		.index("by_run", ["runId"]),

	/** Site discovery eval results (prd-site-discovery §13), stored with the behaviour hash they were graded under. */
	discoveryEvals: defineTable({
		siteId: v.id("sites"),
		reportId: v.id("discoveryReports"),
		goldenId: v.string(),
		goldenConfirmed: v.boolean(),
		behaviourHash: v.string(),
		models: v.string(),
		checks: v.array(v.object({ id: v.string(), label: v.string(), passed: v.boolean(), score: v.number(), detail: v.string() })),
		judge: v.optional(v.object({ model: v.string(), mean: v.number(), passed: v.boolean(), ideas: v.array(v.object({ title: v.string(), score: v.number(), reason: v.string() })), costUsd: v.number() })),
		passed: v.boolean(),
		createdAt: v.number(),
	})
		.index("by_site_created", ["siteId", "createdAt"])
		.index("by_report", ["reportId"]),

	// ── Rubrics and authors (prd-rubrics-and-authors §8) ──
	/** A person credited on a site's posts. Workspace-level; enabled per site through siteAuthors. */
	authors: defineTable({
		workspaceId: v.id("workspaces"),
		name: v.string(),
		slug: v.string(),
		/** Square photo in Convex storage: the original and the 96/192/400 px WebP sizes. */
		photo: v.optional(v.object({ original: v.optional(v.id("_storage")), s96: v.optional(v.id("_storage")), s192: v.optional(v.id("_storage")), s400: v.optional(v.id("_storage")), alt: v.string() })),
		jobTitle: v.optional(v.string()),
		bioShort: v.optional(v.string()),
		bioLong: v.optional(v.string()),
		credentials: v.array(v.string()),
		sameAs: v.array(v.string()),
		userId: v.optional(v.id("users")),
		status: v.union(v.literal("active"), v.literal("retired")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_workspace_slug", ["workspaceId", "slug"]),

	/** An author enabled on a site, with site-specific overrides. Exactly one isDefault per site. TENANT-SCOPED. */
	siteAuthors: defineTable({
		siteId: v.id("sites"),
		authorId: v.id("authors"),
		titleOverride: v.optional(v.string()),
		bioOverride: v.optional(v.string()),
		authorPageUrl: v.optional(v.string()),
		isDefault: v.boolean(),
	})
		.index("by_site", ["siteId"])
		.index("by_site_author", ["siteId", "authorId"]),

	/** A named topic area on one site: covers pillars and/or clusters. TENANT-SCOPED. */
	rubrics: defineTable({
		siteId: v.id("sites"),
		name: v.string(),
		slug: v.string(),
		pillarIds: v.array(v.id("pillars")),
		/** Cluster names ("<pillar id>|<cluster>"); a cluster belongs to at most one rubric. */
		clusters: v.array(v.string()),
		rotation: v.union(v.literal("rotate"), v.literal("primary-only")),
		signoff: v.union(v.literal("none"), v.literal("author"), v.literal("reviewer")),
		firstPerson: v.boolean(),
		createdAt: v.number(),
	}).index("by_site", ["siteId"]),

	rubricDesignations: defineTable({
		siteId: v.id("sites"),
		rubricId: v.id("rubrics"),
		authorId: v.id("authors"),
		role: v.union(v.literal("author"), v.literal("reviewer")),
		primary: v.boolean(),
	})
		.index("by_rubric", ["rubricId"])
		.index("by_site", ["siteId"]),

	appConfig: defineTable({
		key: v.string(),
		ciphertext: v.string(),
		keyVersion: v.number(),
		updatedAt: v.number(),
	}).index("by_key", ["key"]),

	webhookEvents: defineTable({
		source: v.union(v.literal("github"), v.literal("gitlab"), v.literal("clerk"), v.literal("polar"), v.literal("autumn")),
		deliveryId: v.string(), // X-GitHub-Delivery / svix-id / provider event id
		type: v.string(),
		receivedAt: v.number(),
		status: v.union(v.literal("received"), v.literal("processed"), v.literal("ignored"), v.literal("failed")),
		siteId: v.optional(v.id("sites")),
		error: v.optional(v.string()),
	}).index("by_source_delivery", ["source", "deliveryId"]),
});
