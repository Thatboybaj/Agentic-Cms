"use client";
// Convex-backed workspace view model for the Sites and Team pages (handoff 01 step 11, first slice). Same shapes as
// ./data.ts (IWorkspaceView, ISiteRow, actions) so the screens don't change; actions are async and call Convex.
// Only used when the real backend is on (BACKEND_ENABLED); the shell and /s/[site] pages still run on the demo store.

import { useClerk } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo } from "react";
import { inviteIdOf, isInviteId, pipelineOf, toSite, toUsers, toWorkspace } from "@/lib/adapter";
import { ROLE_LABEL } from "@/lib/logic";
import { useToast, type TResult } from "@/lib/store";
import type { TRole, TWorkspaceRole } from "@/lib/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ISiteRow, IWorkspaceView, TAddSiteResult } from "./data";

const MANAGE_WHY = "Only a workspace owner or admin can change this";

export interface ILiveWorkspaceView extends IWorkspaceView {
	loading: boolean;
}

const EMPTY_ME = { id: "", name: "", initials: "", email: "", avatarHue: 0, status: "active" as const };

export function useLiveWorkspaceView(): ILiveWorkspaceView {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const on = isAuthenticated ? {} : "skip";
	const current = useQuery(api.workspace.current, on);
	const team = useQuery(api.members.team, on);
	const portfolio = useQuery(api.portfolio.list, on);

	return useMemo(() => {
		const loading = isLoading || (isAuthenticated && (current === undefined || team === undefined || portfolio === undefined));
		const people = team ? toUsers(team) : { users: [], workspaceRoles: {}, memberships: [] };
		const me = people.users.find((u) => u.id === current?.userId) ?? EMPTY_ME;
		const role = current?.role ?? "member";
		const canManage = role === "owner" || role === "admin";
		return {
			loading,
			signedIn: isLoading || isAuthenticated,
			workspace: current ? toWorkspace(current, team) : { id: "", name: "", plan: "pilot", seats: 0, seatsUsed: 0 },
			me,
			users: people.users,
			workspaceRoles: people.workspaceRoles,
			memberships: people.memberships,
			sites: (portfolio ?? []).map((r) => toSite(r)),
			myWorkspaceRole: role,
			canManageMembers: canManage,
			membersWhy: canManage ? null : MANAGE_WHY,
			canAddSite: canManage,
			addSiteWhy: canManage ? null : MANAGE_WHY,
		};
	}, [isLoading, isAuthenticated, current, team, portfolio]);
}

export function useLiveSiteRows(): ISiteRow[] {
	const { isAuthenticated } = useConvexAuth();
	const portfolio = useQuery(api.portfolio.list, isAuthenticated ? {} : "skip");
	return useMemo(
		() =>
			(portfolio ?? []).map((r) => {
				const site = toSite(r);
				const canApprove = r.role === "specialist" || r.role === "admin";
				return {
					id: site.id,
					slug: site.slug,
					name: site.name,
					domain: site.domain,
					industry: site.industry,
					status: site.status,
					hue: site.accent,
					site,
					role: r.role,
					autopost: r.publishing.autopost,
					// Held posts, approvals, CI, slots and ledger come with handoffs 02–07; until then only ideas count.
					needsMe: (canApprove ? r.ideasPending + (r.counts["in-review"] ?? 0) : 0) + r.attention.held + r.attention.humanOnly,
					ideasPending: r.ideasPending,
					held: r.attention.held,
					approvalsWaiting: r.counts["in-review"] ?? 0,
					failingCi: r.attention.failingCi,
					humanOnly: r.attention.humanOnly,
					overdue: r.attention.overdue,
					unread: r.attention.unread,
					agentsRunning: r.attention.agentsRunning,
					pipeline: pipelineOf(r.counts),
					spend: { spent: r.spend.textUsd + r.spend.imageUsd, cap: r.spend.textCapUsd + r.spend.imageCapUsd },
					gap: null,
					lastActivity: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : undefined,
				};
			}),
		[portfolio],
	);
}

function reasonOf(e: unknown): string {
	if (e instanceof ConvexError) return String((e.data as { reason?: string })?.reason ?? "Something went wrong");
	return "Couldn't reach the server. Try again.";
}

export function useLiveWorkspaceActions() {
	const toast = useToast();
	const clerk = useClerk();
	const addSiteM = useMutation(api.sites.add);
	const inviteM = useMutation(api.invites.create);
	const revokeM = useMutation(api.invites.revoke);
	const setMembershipM = useMutation(api.members.setMembership);
	const setWorkspaceRoleM = useMutation(api.members.setWorkspaceRole);

	return useMemo(() => {
		/** Runs a Convex mutation that returns TResult; refusals and thrown access errors both toast and come back as {ok:false}. */
		const run = async (fn: () => Promise<TResult>, success?: { text: string; href?: string }): Promise<TResult> => {
			try {
				const r = await fn();
				if (!r.ok) toast({ text: r.reason, tone: "block" });
				else if (success) toast({ ...success, tone: "pass" });
				return r;
			} catch (e) {
				const reason = reasonOf(e);
				toast({ text: reason, tone: "block" });
				return { ok: false, reason };
			}
		};

		return {
			signOut: () => void clerk.signOut({ redirectUrl: "/sign-in" }),
			addSite: async (input: { name: string; domain: string; industry: string }): Promise<TAddSiteResult> => {
				const r = (await run(() => addSiteM(input) as Promise<TResult>, { text: `${input.name} added · onboarding comes with the next backend step` })) as TResult & { slug?: string };
				return r.ok ? { ok: true, slug: r.slug ?? "" } : r;
			},
			inviteUsers: async (emails: string[], workspaceRole: TWorkspaceRole, siteRoles: Record<string, TRole>): Promise<TResult> => {
				const roles = Object.entries(siteRoles).map(([siteId, role]) => ({ siteId: siteId as Id<"sites">, role }));
				const wr = workspaceRole === "owner" ? "admin" : workspaceRole; // owner is granted after they join
				for (const email of emails) {
					const r = await run(() => inviteM({ email, workspaceRole: wr, siteRoles: roles }) as Promise<TResult>);
					if (!r.ok) return r;
				}
				toast({ text: emails.length > 1 ? `${emails.length} invites sent` : `Invite sent to ${emails[0]}`, tone: "pass" });
				return { ok: true };
			},
			revokeInvite: (userId: string) => run(() => revokeM({ inviteId: inviteIdOf(userId) as Id<"invites"> }) as Promise<TResult>, { text: "Invite revoked" }),
			setMembership: (userId: string, siteId: string, role: TRole | null): Promise<TResult> => {
				if (isInviteId(userId)) {
					const reason = "They haven't accepted yet · revoke the invite and send a new one to change their access";
					toast({ text: reason, tone: "block" });
					return Promise.resolve({ ok: false, reason });
				}
				return run(() => setMembershipM({ siteId: siteId as Id<"sites">, userId: userId as Id<"users">, role }) as Promise<TResult>, {
					text: role ? `Role set · ${ROLE_LABEL[role]}` : "Access removed",
				});
			},
			setWorkspaceRole: (userId: string, role: TWorkspaceRole): Promise<TResult> => {
				if (isInviteId(userId)) {
					const reason = "They haven't accepted yet · change their workspace role after they join";
					toast({ text: reason, tone: "block" });
					return Promise.resolve({ ok: false, reason });
				}
				return run(() => setWorkspaceRoleM({ userId: userId as Id<"users">, role }) as Promise<TResult>, {
					text: `Workspace role is now ${role}${role === "member" ? " · per-site roles apply" : " · admin on every site"}`,
				});
			},
		};
	}, [toast, clerk, addSiteM, inviteM, revokeM, setMembershipM, setWorkspaceRoleM]);
}
