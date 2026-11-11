"use client";
// Workspace-level view model. The only place the workspace UI touches the store's multi-site API
// (docs/multi-site-contract.md §3) — screens consume these shapes, so a store signature change is fixed here once.

import { useCallback, useMemo } from "react";
import type { ICommandItem } from "@/ds";
import { useActions, useActionsForSite, useCms, useInbox, usePortfolio, usePresence, useToasts, useWorkspace, type IToast, type TResult } from "@/lib/store";
import { sitePath } from "@/lib/routes";
import { computeStats, type IInboxItem, type TInboxKind } from "@/lib/workspace";
import type { IMembership, ISite, IUser, IWorkspace, TRole, TSiteStatus, TTone, TWorkspaceRole } from "@/lib/types";
import { BACKEND_ENABLED } from "@/lib/backend";
import { useLiveSiteRows, useLiveWorkspaceActions, useLiveWorkspaceView } from "./live";

// ---- Workspace + me -----------------------------------------------------------

export interface IWorkspaceView {
	signedIn: boolean;
	workspace: IWorkspace;
	me: IUser;
	users: IUser[];
	workspaceRoles: Record<string, TWorkspaceRole>;
	memberships: IMembership[];
	/** Sites I can access (the tenant-isolated list). */
	sites: ISite[];
	myWorkspaceRole: TWorkspaceRole;
	canManageMembers: boolean;
	membersWhy: string | null;
	canAddSite: boolean;
	addSiteWhy: string | null;
}

export function useWorkspaceView(): IWorkspaceView {
	const ws = useWorkspace();
	const roles = ws.workspaceRoles;
	return useMemo(() => {
		const workspaceRoles = Object.fromEntries(ws.users.map((u) => [u.id, roles[u.id] ?? "member"])) as Record<string, TWorkspaceRole>;
		return {
			signedIn: ws.signedIn,
			workspace: ws.workspace,
			me: ws.me,
			users: ws.users,
			workspaceRoles,
			memberships: ws.memberships,
			sites: ws.sitesForMe,
			myWorkspaceRole: ws.workspaceRole ?? "member",
			canManageMembers: ws.canWorkspace("members.manage"),
			membersWhy: ws.whyWorkspace("members.manage"),
			canAddSite: ws.canWorkspace("site.add"),
			addSiteWhy: ws.whyWorkspace("site.add"),
		};
	}, [ws, roles]);
}

// ---- Actions -------------------------------------------------------------------

export type TAddSiteResult = { ok: true; slug: string } | { ok: false; reason: string };

export function useWorkspaceActions() {
	const ws = useWorkspace();
	const actions = useActions();
	const forSite = useActionsForSite();
	return useMemo(
		() => ({
			signInAs: (userId: string) => ws.signInAs(userId),
			signOut: () => ws.signOut(),
			resetDemo: () => actions.resetDemo(),
			addSite: (input: { name: string; domain: string; industry: string }): TAddSiteResult => {
				const r = ws.actions.addSite(input);
				if (!r.ok) return r;
				return { ok: true, slug: r.id ?? "" };
			},
			/** inviteUser takes per-site roles only; an admin invite is invited on one site, then promoted. */
			inviteUsers: (emails: string[], workspaceRole: TWorkspaceRole, siteRoles: Record<string, TRole>, fallbackSiteId?: string): TResult => {
				const roles = workspaceRole === "member" ? siteRoles : fallbackSiteId ? { [fallbackSiteId]: "admin" as TRole } : siteRoles;
				for (const email of emails) {
					const r = ws.actions.inviteUser(email, roles);
					if (!r.ok) return r;
					if (workspaceRole !== "member" && r.id) {
						const w = ws.actions.setWorkspaceRole(r.id, workspaceRole);
						if (!w.ok) return w;
					}
				}
				return { ok: true };
			},
			setMembership: (userId: string, siteId: string, role: TRole | null) => ws.actions.setMembership(userId, siteId, role),
			setWorkspaceRole: (userId: string, role: TWorkspaceRole) => ws.actions.setWorkspaceRole(userId, role),
			approveIdea: (siteId: string, postId: string) => forSite(siteId).approveIdea(postId),
			rejectIdea: (siteId: string, postId: string, note: string) => forSite(siteId).rejectIdea(postId, note),
		}),
		[ws, actions, forSite],
	);
}

// ---- Portfolio rows ------------------------------------------------------------

export interface ISiteRow {
	id: string;
	slug: string;
	name: string;
	domain: string;
	industry: string;
	status: TSiteStatus;
	hue?: number;
	site: ISite;
	role: TRole | null;
	autopost: boolean;
	needsMe: number;
	ideasPending: number;
	held: number;
	approvalsWaiting: number;
	failingCi: number;
	humanOnly: number;
	overdue: number;
	unread: number;
	agentsRunning: number;
	pipeline: {
		idea: number;
		drafting: number;
		review: number;
		mr: number;
		live: number;
	};
	spend: { spent: number; cap: number };
	gap: { pct: number; week: string; series: number[] } | null;
	lastActivity?: string;
}

export function useSiteRows(): ISiteRow[] {
	const portfolio = usePortfolio();
	const { state } = useCms();
	return useMemo(
		() =>
			portfolio.map((p) => {
				const data = state.data[p.site.id];
				const stats = data ? computeStats(p.site, data) : null;
				const c = p.counts;
				const series = (data?.trajectory ?? []).filter((w) => w.sessions !== null && w.projected > 0).map((w) => ((w.sessions! - w.projected) / w.projected) * 100);
				return {
					id: p.site.id,
					slug: p.slug,
					name: p.site.name,
					domain: p.site.domain,
					industry: p.site.industry,
					status: p.status,
					hue: p.site.accent,
					site: p.site,
					role: p.role,
					autopost: p.autopost,
					needsMe: p.needsMe,
					ideasPending: p.ideasPending,
					held: p.held,
					approvalsWaiting: p.approvalsWaiting,
					failingCi: p.failingMrs,
					humanOnly: stats?.humanOnlySlots ?? 0,
					overdue: stats?.overdue ?? 0,
					unread: stats?.unread ?? 0,
					agentsRunning: stats?.agentsRunning ?? 0,
					pipeline: {
						idea: c.idea,
						drafting: c.briefed + c.drafting + c["needs-assets"],
						review: c["in-review"],
						mr: c["mr-open"],
						live: c.live + c.decaying,
					},
					spend: {
						spent: p.spend.text.spent + p.spend.image.spent,
						cap: p.spend.text.cap + p.spend.image.cap,
					},
					gap: p.gap ? { pct: p.gap.pct, week: p.gap.week, series: series.slice(-8) } : null,
					lastActivity: p.lastActivity?.at,
				};
			}),
		[portfolio, state],
	);
}

// ---- Inbox ----------------------------------------------------------------------

export type TInboxGroup = "ideas" | "held" | "review" | "images" | "ledger" | "ci" | "assigned" | "invites";

const GROUP_OF: Record<TInboxKind, TInboxGroup> = {
	idea: "ideas",
	held: "held",
	review: "review",
	"human-slot": "images",
	"ledger-overdue": "ledger",
	"ci-failing": "ci",
	assigned: "assigned",
	invite: "invites",
	"access-request": "invites",
};

export interface IInboxRow extends IInboxItem {
	group: TInboxGroup;
	hue?: number;
	/** Inline approve/reject is allowed (ideas only). */
	canDecide: boolean;
}

export function useInboxRows(): IInboxRow[] {
	const items = useInbox();
	const { sites } = useWorkspaceView();
	return useMemo(() => {
		const hue = new Map(sites.map((s) => [s.id, s.accent]));
		// Within a group: blockers first, then oldest first.
		const rank = (t: TTone) => (t === "block" ? 0 : t === "human" ? 1 : 2);
		return items
			.map((i) => ({
				...i,
				group: GROUP_OF[i.kind],
				hue: i.siteId ? hue.get(i.siteId) : undefined,
				canDecide: i.kind === "idea",
			}))
			.sort((a, b) => rank(a.tone) - rank(b.tone) || a.at.localeCompare(b.at));
	}, [items, sites]);
}

// ---- Presence ---------------------------------------------------------------------

export function useSitePresence(siteId: string | undefined, path?: string): { name: string; initials: string }[] {
	const list = usePresence(siteId, path);
	return useMemo(() => (siteId ? list.map((p) => ({ name: p.user.name, initials: p.user.initials })) : []), [list, siteId]);
}

// ---- Command palette search for the current site ---------------------------------

export function useSiteSearch(siteId: string | undefined): {
	editorHref?: string;
	posts: ICommandItem[];
	keywords: ICommandItem[];
} {
	const { state } = useCms();
	return useMemo(() => {
		const site = siteId ? state.sites.find((s) => s.id === siteId) : undefined;
		const data = siteId ? state.data[siteId] : undefined;
		if (!site || !data) return { posts: [], keywords: [] };
		const last = data.posts.find((p) => p.state === "in-review") ?? data.posts[0];
		return {
			editorHref: last ? sitePath(site.slug, `/posts/${last.id}`) : undefined,
			posts: data.posts.slice(0, 40).map((p) => ({
				id: p.id,
				label: p.title,
				hint: p.state,
				icon: "FileText",
				href: sitePath(site.slug, `/posts/${p.id}`),
			})),
			keywords: data.keywords.map((k) => ({
				id: k.id,
				label: k.term,
				hint: `${k.kasShare.toFixed(1)}%`,
				icon: "Target",
				href: `${sitePath(site.slug, "/seo")}?keyword=${k.id}`,
			})),
		};
	}, [state, siteId]);
}

// ---- Toasts -------------------------------------------------------------------------

export function useShellToasts(): {
	toasts: IToast[];
	dismiss: (id: string) => void;
	undo: () => void;
} {
	const toasts = useToasts();
	const actions = useActions();
	const dismiss = useCallback((id: string) => actions.dismissToast(id), [actions]);
	const undo = useCallback(() => void actions.undo(), [actions]);
	return { toasts, dismiss, undo };
}

// ---- Page-level data source (Sites, Team, invite + add-site sheets) ------------------
// With the real backend on (NEXT_PUBLIC_CMS_BACKEND=convex) these pages read and write Convex; otherwise the demo
// store. BACKEND_ENABLED is a build-time constant, so each binding picks one hook for the whole app run.

export type TMaybeAsync<T> = T | Promise<T>;

export interface IPageWorkspaceActions {
	addSite: (input: { name: string; domain: string; industry: string }) => TMaybeAsync<TAddSiteResult>;
	inviteUsers: (emails: string[], workspaceRole: TWorkspaceRole, siteRoles: Record<string, TRole>, fallbackSiteId?: string) => TMaybeAsync<TResult>;
	setMembership: (userId: string, siteId: string, role: TRole | null) => TMaybeAsync<TResult>;
	setWorkspaceRole: (userId: string, role: TWorkspaceRole) => TMaybeAsync<TResult>;
	/** Convex only: pending invites are listed as people; the demo store has no revoke. */
	revokeInvite?: (userId: string) => TMaybeAsync<TResult>;
}

/** Where pages read from. `loading` is only ever true on the Convex path. */
export const usePageWorkspaceView: () => IWorkspaceView & { loading?: boolean } = BACKEND_ENABLED ? useLiveWorkspaceView : useWorkspaceView;
export const usePageSiteRows: () => ISiteRow[] = BACKEND_ENABLED ? useLiveSiteRows : useSiteRows;
export const usePageWorkspaceActions: () => IPageWorkspaceActions = BACKEND_ENABLED ? useLiveWorkspaceActions : useWorkspaceActions;
/** True when these pages show Convex data: they show a "Live data" chip, and add-site returns to /sites. */
export const PAGES_ON_CONVEX = BACKEND_ENABLED;
