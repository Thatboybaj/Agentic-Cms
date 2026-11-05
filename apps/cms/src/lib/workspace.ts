// Workspace selectors (multi-site, multi-user) — pure functions over ICmsState, shared by the store hooks and tests.
// Tenant isolation lives here: every selector takes the current user and never returns a site they can't access.
// See docs/multi-site-contract.md §2–3.
import { now } from "./clock";
import { concentration, evaluateGate, gapToProjection, isPendingIdea, ledgerAge, ledgerStatus, lockReason, roleCan, type IGap, type TPermission } from "./logic";
import { sitePath, WORKSPACE_ROUTES } from "./routes";
import type { IAuditEvent, ICmsState, IMember, IPost, IPresence, ISite, ISiteData, ITemplateManifest, IUser, TBudgetKind, TPostState, TRole, TTone, TWorkspaceRole } from "./types";

/** Each new tab starts as Tolu B. (content specialist) until someone signs in as another person. */
export const DEFAULT_USER_ID = "m-tb";
/** A soft edit lock older than this is stale and anyone may take it. */
export const EDIT_LOCK_MS = 2 * 60_000;
/** Presence entries older than this are hidden. */
export const PRESENCE_FRESH_MS = 15 * 60_000;

type TAccessState = Pick<ICmsState, "users" | "workspaceRoles" | "memberships">;

export const userById = (s: Pick<ICmsState, "users">, id: string | null | undefined): IUser | undefined => (id ? s.users.find((u) => u.id === id) : undefined);

export function workspaceRoleOf(s: TAccessState, userId: string | null | undefined): TWorkspaceRole | null {
	const u = userById(s, userId);
	if (!u || u.status === "suspended") return null;
	return s.workspaceRoles[u.id] ?? "member";
}

/**
 * Effective role on a site: workspace owner/admin → admin; otherwise the site membership's role; otherwise null
 * (no access). Suspended or unknown users have no access anywhere.
 */
export function effectiveRole(s: TAccessState, userId: string | null | undefined, siteId: string): TRole | null {
	const wr = workspaceRoleOf(s, userId);
	if (!wr) return null;
	if (wr === "owner" || wr === "admin") return "admin";
	return s.memberships.find((m) => m.userId === userId && m.siteId === siteId)?.role ?? null;
}

export const canAccessSite = (s: TAccessState, userId: string | null | undefined, siteId: string) => effectiveRole(s, userId, siteId) !== null;

/** Sites the user can open, in workspace order (the site switcher list). */
export function accessibleSites(s: TAccessState & Pick<ICmsState, "sites">, userId: string | null | undefined): ISite[] {
	return s.sites.filter((x) => canAccessSite(s, userId, x.id));
}

export type TWorkspacePermission = "members.manage" | "site.add" | "billing.view";

export function canWorkspace(s: TAccessState, userId: string | null | undefined, _p: TWorkspacePermission): boolean {
	const wr = workspaceRoleOf(s, userId);
	return wr === "owner" || wr === "admin";
}

export function workspaceLockReason(s: TAccessState, userId: string | null | undefined, p: TWorkspacePermission): string | null {
	if (canWorkspace(s, userId, p)) return null;
	if (!userById(s, userId)) return "Sign in first";
	return p === "billing.view" ? "Only a workspace owner or admin sees billing" : "Only a workspace owner or admin can change this";
}

/** can()/why() for a site role that may be null (no access). */
export const roleAllows = (role: TRole | null, p: TPermission) => (role ? roleCan(role, p) : false);
export const roleWhy = (role: TRole | null, p: TPermission, siteName = "this site") => (role ? lockReason(role, p) : `You don't have access to ${siteName}`);

/** People who can work on a site, with their effective role there (IMember shape, for the existing features). */
export function siteMembers(s: TAccessState, siteId: string): IMember[] {
	const out: IMember[] = [];
	for (const u of s.users) {
		if (u.status === "suspended") continue;
		const role = effectiveRole(s, u.id, siteId);
		if (role) out.push({ id: u.id, name: u.name, initials: u.initials, role, email: u.email });
	}
	// Explicit site members first, workspace admins after (so "the specialist" is a real site member).
	return out.sort((a, b) => Number(!s.memberships.some((m) => m.userId === a.id && m.siteId === siteId)) - Number(!s.memberships.some((m) => m.userId === b.id && m.siteId === siteId)));
}

/** Name of the person who holds `role` on the site (ledger owners), falling back to the role label. */
export function memberNameFor(s: TAccessState, siteId: string, role: TRole): string {
	const m = siteMembers(s, siteId).filter((x) => x.role === role && userById(s, x.id)?.status === "active");
	if (m[0]) return m[0].name;
	return { specialist: "The content specialist", developer: "A developer", stakeholder: "The client", admin: "An admin" }[role];
}

const WORKSPACE_PREFIXES = Object.values(WORKSPACE_ROUTES);

/** Makes a site-relative href ("/posts/p-1") absolute ("/s/lumen/posts/p-1"). Absolute, workspace and external hrefs pass through. */
export function absHref(slug: string, href: string | undefined): string | undefined {
	if (!href) return href;
	if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/s/") || href.startsWith("/preview/") || href.startsWith("/styleguide")) return href;
	if (WORKSPACE_PREFIXES.some((w) => href === w || href.startsWith(`${w}/`) || href.startsWith(`${w}?`))) return href;
	return sitePath(slug, href);
}

// ─── Edit lock ───────────────────────────────────────────────────────────────

export interface IEditLockHolder {
	userId: string;
	name: string;
	since: string;
}

export const isLockFresh = (lock: IPost["editingBy"], at: Date = now()) => !!lock && at.getTime() - new Date(lock.since).getTime() < EDIT_LOCK_MS;

/** Who else holds a fresh edit lock on the post (null when free, stale or held by `userId`). */
export function otherEditor(s: Pick<ICmsState, "users">, post: Pick<IPost, "editingBy"> | undefined, userId: string | null | undefined): IEditLockHolder | null {
	const lock = post?.editingBy;
	if (!lock || lock.userId === userId || !isLockFresh(lock)) return null;
	return { userId: lock.userId, name: userById(s, lock.userId)?.name ?? "Someone", since: lock.since };
}

// ─── Per-site stats (shared by useStats and usePortfolio) ────────────────────

export interface ICmsStats {
	counts: Record<TPostState, number>;
	total: number;
	needsHuman: number; // open ledger items ("4 items need a human")
	overdue: number;
	blockers: number;
	approvalsWaiting: number;
	/** Ideas waiting for a person's approval (C10). */
	ideasPending: number;
	/** In-review posts the autopost gate held for a person. */
	held: number;
	hardBlocked: number; // in-review posts with ≥1 hard block
	humanOnlySlots: number;
	agentsRunning: number; // distinct agents with a running run ("2 agents running")
	runningRuns: number;
	openMrs: number;
	failingMrs: number;
	cadence: { shipped: number; target: number; week: number }; // MRs opened this ISO week vs target
	unread: number;
	budgets: Record<TBudgetKind, { spent: number; cap: number; pct: number }>;
	gap: ReturnType<typeof gapToProjection>;
	concentration: ReturnType<typeof concentration>;
	dataGap: boolean; // Search Console not connected
}

export const activeManifest = (data: ISiteData): ITemplateManifest | null =>
	data.manifests.filter((m) => m.status === "confirmed").sort((a, b) => b.version - a.version)[0] ?? null;

const isoWeekOf = (d: string | Date) => {
	const l = new Date(new Date(d).getTime() + 3600000);
	const t = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
	const dow = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - dow);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const isHeld = (data: ISiteData, postId: string) => data.ledger.some((l) => !l.done && l.postId === postId && l.kind === "autopost-hold");

export function computeStats(site: ISite, data: ISiteData): ICmsStats {
	const counts = { idea: 0, briefed: 0, drafting: 0, "needs-assets": 0, "in-review": 0, "mr-open": 0, live: data.liveBaseline, decaying: 0 } as Record<TPostState, number>;
	for (const p of data.posts) counts[p.state]++;
	const open = data.ledger.filter((l) => !l.done).map((l) => ledgerStatus(ledgerAge(l)));
	const manifest = activeManifest(data);
	const inReview = data.posts.filter((p) => p.state === "in-review");
	const running = data.runs.filter((r) => r.status === "running");
	const week = isoWeekOf(now());
	const pct = (spent: number, capUsd: number) => (capUsd > 0 ? Math.round((spent / capUsd) * 100) : 100);
	return {
		counts,
		total: Object.values(counts).reduce((a, b) => a + b, 0),
		needsHuman: open.length,
		overdue: open.filter((s) => s !== "open").length,
		blockers: open.filter((s) => s === "blocker").length,
		approvalsWaiting: inReview.length,
		ideasPending: data.posts.filter(isPendingIdea).length,
		held: inReview.filter((p) => isHeld(data, p.id)).length,
		hardBlocked: inReview.filter((p) => evaluateGate(p, data.slots, manifest).hard.length > 0).length,
		humanOnlySlots: data.slots.filter((s) => s.status === "human-only").length,
		agentsRunning: new Set(running.map((r) => r.agent)).size,
		runningRuns: running.length,
		openMrs: data.mergeRequests.filter((m) => m.status === "open" || m.status === "conflict").length,
		failingMrs: data.mergeRequests.filter((m) => m.status === "conflict" || (m.status === "open" && m.ci === "failing")).length,
		cadence: { shipped: data.mergeRequests.filter((m) => isoWeekOf(m.openedAt) === week).length, target: site.cadenceTarget, week },
		unread: data.notifications.filter((n) => !n.read).length,
		budgets: {
			text: { spent: site.budgets.textUsd, cap: site.budgets.textCapUsd, pct: pct(site.budgets.textUsd, site.budgets.textCapUsd) },
			image: { spent: site.budgets.imageUsd, cap: site.budgets.imageCapUsd, pct: pct(site.budgets.imageUsd, site.budgets.imageCapUsd) },
		},
		gap: site.searchConsole === "connected" ? gapToProjection(data.trajectory) : null,
		concentration: concentration(data.keywords),
		dataGap: site.searchConsole !== "connected",
	};
}

// ─── Inbox (cross-site work for me) ──────────────────────────────────────────

export type TInboxKind = "idea" | "review" | "held" | "human-slot" | "ledger-overdue" | "ci-failing" | "assigned" | "invite" | "access-request";

export interface IInboxItem {
	id: string;
	kind: TInboxKind;
	/** Absent on workspace-level items (invites, access requests). */
	siteId?: string;
	siteSlug?: string;
	siteName?: string;
	title: string;
	detail: string;
	at: string;
	/** Absolute app path (already site-prefixed). */
	href: string;
	tone: TTone;
	postId?: string;
}

const daysAgoIso = (days: number) => new Date(now().getTime() - days * 86400000).toISOString();

/** Items across the user's sites that need *them*, given their effective role on each site. Newest first. */
export function inboxFor(s: ICmsState, userId: string | null | undefined): IInboxItem[] {
	const me = userById(s, userId);
	if (!me) return [];
	const items: IInboxItem[] = [];
	for (const site of accessibleSites(s, userId)) {
		const role = effectiveRole(s, userId, site.id)!;
		const data = s.data[site.id];
		if (!data) continue;
		const base = { siteId: site.id, siteSlug: site.slug, siteName: site.name };
		const href = (p: string) => sitePath(site.slug, p);
		if (roleCan(role, "idea.approve"))
			for (const p of data.posts.filter(isPendingIdea))
				items.push({ ...base, id: `idea:${site.id}:${p.id}`, kind: "idea", title: p.title, detail: `Idea waiting for approval · W${p.week}`, at: daysAgoIso(p.daysInState), href: href("/approvals?tab=ideas"), tone: "human", postId: p.id });
		if (roleCan(role, "post.approve"))
			for (const p of data.posts.filter((x) => x.state === "in-review")) {
				const hold = data.ledger.find((l) => !l.done && l.postId === p.id && l.kind === "autopost-hold");
				items.push({ ...base, id: `${hold ? "held" : "review"}:${site.id}:${p.id}`, kind: hold ? "held" : "review", title: p.title, detail: hold ? hold.title : "Ready for review", at: hold?.createdAt ?? daysAgoIso(p.daysInState), href: href(`/approvals?post=${p.id}`), tone: hold ? "block" : "human", postId: p.id });
			}
		if (roleCan(role, "asset.manage"))
			for (const sl of data.slots.filter((x) => x.status === "human-only")) {
				const p = data.posts.find((x) => x.id === sl.postId);
				if (!p) continue;
				items.push({ ...base, id: `slot:${site.id}:${sl.id}`, kind: "human-slot", title: `${sl.name} · ${p.title}`, detail: "Human-only image slot", at: sl.generatedAt ?? daysAgoIso(p.daysInState), href: href(`/posts/${p.id}/assets?slot=${sl.id}`), tone: "human", postId: p.id });
			}
		for (const l of data.ledger) {
			if (l.done || l.owner !== me.name) continue;
			const age = ledgerAge(l);
			if (ledgerStatus(age) === "open") continue;
			items.push({ ...base, id: `ledger:${site.id}:${l.id}`, kind: "ledger-overdue", title: l.title, detail: `Day ${age} · ${l.downstream}`, at: l.createdAt, href: href(l.postId ? (l.slotId ? `/posts/${l.postId}/assets?slot=${l.slotId}` : `/posts/${l.postId}`) : "/runs#ledger"), tone: ledgerStatus(age) === "blocker" ? "block" : "human", ...(l.postId ? { postId: l.postId } : {}) });
		}
		if (roleCan(role, "mr.rebase"))
			for (const m of data.mergeRequests.filter((x) => x.status === "conflict" || (x.status === "open" && x.ci === "failing")))
				items.push({ ...base, id: `ci:${site.id}:${m.id}`, kind: "ci-failing", title: m.title ?? m.branch, detail: m.status === "conflict" ? (m.conflictDetail ?? "Conflict with the base branch") : (m.ciDetail ?? "CI failing"), at: m.openedAt, href: href("/merge-requests"), tone: "block", ...(m.postId ? { postId: m.postId } : {}) });
		for (const p of data.posts.filter((x) => x.assigneeId === me.id && x.state !== "live" && x.state !== "decaying" && x.state !== "in-review" && !isPendingIdea(x)))
			items.push({ ...base, id: `assigned:${site.id}:${p.id}`, kind: "assigned", title: p.title, detail: `Assigned to you · ${p.state.replace("-", " ")}`, at: daysAgoIso(p.daysInState), href: href(`/posts/${p.id}`), tone: "neutral", postId: p.id });
	}
	if (canWorkspace(s, userId, "members.manage")) {
		for (const u of s.users.filter((x) => x.status === "invited"))
			items.push({ id: `invite:${u.id}`, kind: "invite", title: `${u.email} hasn't accepted the invite`, detail: `${s.memberships.filter((m) => m.userId === u.id).length} site(s) waiting`, at: u.invitedAt ?? now().toISOString(), href: WORKSPACE_ROUTES.team, tone: "neutral" });
		for (const r of (s.accessRequests ?? []).filter((x) => x.status === "open")) {
			const site = s.sites.find((x) => x.id === r.siteId);
			items.push({ id: `request:${r.id}`, kind: "access-request", ...(site ? { siteId: site.id, siteSlug: site.slug, siteName: site.name } : {}), title: `${userById(s, r.userId)?.name ?? "Someone"} requested access to ${site?.name ?? r.siteId}`, detail: "Grant a role on the Team page", at: r.at, href: WORKSPACE_ROUTES.team, tone: "human" });
		}
	}
	return items.sort((a, b) => b.at.localeCompare(a.at));
}

// ─── Portfolio (one row per site I can access) ───────────────────────────────

export interface IPortfolioRow {
	site: ISite;
	slug: string;
	role: TRole;
	status: ISite["status"];
	counts: Record<TPostState, number>;
	/** Posts in flight (everything but Live and Decaying). */
	pipeline: number;
	needsMe: number;
	held: number;
	ideasPending: number;
	approvalsWaiting: number;
	failingMrs: number;
	spend: ICmsStats["budgets"];
	gap: IGap | null;
	lastActivity: IAuditEvent | null;
	/** Other people on this site right now. */
	here: number;
	autopost: boolean;
}

export function portfolioFor(s: ICmsState, userId: string | null | undefined): IPortfolioRow[] {
	const inbox = inboxFor(s, userId);
	return accessibleSites(s, userId).map((site) => {
		const data = s.data[site.id];
		const stats = computeStats(site, data);
		const c = stats.counts;
		return {
			site,
			slug: site.slug,
			role: effectiveRole(s, userId, site.id)!,
			status: site.status,
			counts: c,
			pipeline: c.idea + c.briefed + c.drafting + c["needs-assets"] + c["in-review"] + c["mr-open"],
			needsMe: inbox.filter((i) => i.siteId === site.id && i.kind !== "access-request").length,
			held: stats.held,
			ideasPending: stats.ideasPending,
			approvalsWaiting: stats.approvalsWaiting,
			failingMrs: stats.failingMrs,
			spend: stats.budgets,
			gap: stats.gap,
			lastActivity: [...data.audit].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null,
			here: presenceFor(s, userId, site.id).length,
			autopost: !!site.publishing?.autopost,
		};
	});
}

// ─── Presence ────────────────────────────────────────────────────────────────

export interface IPresenceView extends IPresence {
	user: IUser;
	isMe: boolean;
	site: Pick<ISite, "id" | "slug" | "name">;
}

/**
 * Fresh presence on sites the viewer can access, optionally narrowed to a site and a path (exact, or prefix when the
 * path ends with "*"). Excludes the viewer unless `includeMe`. Most recent first.
 */
export function presenceFor(s: ICmsState, userId: string | null | undefined, siteId?: string, path?: string, includeMe = false): IPresenceView[] {
	const t = now().getTime();
	const out: IPresenceView[] = [];
	for (const p of s.presence ?? []) {
		if (siteId && p.siteId !== siteId) continue;
		if (!includeMe && p.userId === userId) continue;
		if (t - new Date(p.at).getTime() > PRESENCE_FRESH_MS) continue;
		if (path && !(path.endsWith("*") ? p.path.startsWith(path.slice(0, -1)) : p.path === path)) continue;
		if (!canAccessSite(s, userId, p.siteId)) continue;
		const user = userById(s, p.userId);
		const site = s.sites.find((x) => x.id === p.siteId);
		if (!user || !site || user.status === "suspended") continue;
		out.push({ ...p, user, isMe: p.userId === userId, site: { id: site.id, slug: site.slug, name: site.name } });
	}
	return out.sort((a, b) => b.at.localeCompare(a.at));
}

// ─── Isolated view of the state (what useCms().state exposes) ────────────────

export interface ICmsStateView extends ICmsState {
	/** Compat: the scoped (or fallback) site id. */
	siteId: string;
	/** Compat: the effective role on that site. */
	role: TRole;
	/** Compat: people on that site with their effective role there. */
	members: IMember[];
}

/** The state narrowed to the sites the user can access. Nothing from another tenant survives this. */
export function isolatedState(s: ICmsState, userId: string | null | undefined): ICmsState {
	const allowed = new Set(accessibleSites(s, userId).map((x) => x.id));
	const admin = canWorkspace(s, userId, "members.manage");
	const data: Record<string, ISiteData> = {};
	for (const id of allowed) if (s.data[id]) data[id] = s.data[id];
	return {
		...s,
		sites: s.sites.filter((x) => allowed.has(x.id)),
		data,
		jobs: s.jobs.filter((j) => allowed.has(j.siteId)),
		presence: (s.presence ?? []).filter((p) => allowed.has(p.siteId)),
		memberships: admin ? s.memberships : s.memberships.filter((m) => allowed.has(m.siteId)),
		accessRequests: admin ? (s.accessRequests ?? []) : (s.accessRequests ?? []).filter((r) => r.userId === userId),
		audit: admin ? (s.audit ?? []) : [],
	};
}
