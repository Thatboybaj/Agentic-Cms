"use client";
// /team — people × sites. Members with workspace role + status, and a per-site role matrix (rows people, columns
// sites). Owner/admin rows are admin everywhere. Invite people; change or remove access with a confirm.
// Non-admins see everything read-only with the reason.

import { useMemo, useState } from "react";
import {
	Avatar,
	Button,
	Callout,
	Card,
	Chip,
	Dialog,
	EmptyState,
	LockedAction,
	Meter,
	PageHeader,
	ROLE_LABEL,
	ROLE_SHORT,
	Section,
	Select,
	SiteAvatar,
	Tooltip,
	WORKSPACE_ROLE_LABEL,
	formatRelative,
} from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { useWorkspaceActions, useWorkspaceView } from "@/features/workspace/data";
import { plural } from "@/features/workspace/labels";
import type { ISite, IUser, TRole, TWorkspaceRole } from "@/lib/types";
import { InviteSheet } from "./invite-sheet";

type TCell = TRole | "none";

const SITE_ROLES: TRole[] = ["specialist", "developer", "stakeholder", "admin"];
const CELL_OPTIONS = [
	...SITE_ROLES.map((r) => ({
		value: r as TCell,
		label: ROLE_SHORT[r],
		hint: ROLE_LABEL[r],
	})),
	{ value: "none" as TCell, label: "No access" },
];

interface IPending {
	title: string;
	body: string;
	confirm: string;
	danger?: boolean;
	run: () => void;
}

export function Team() {
	const { workspace, me, users, workspaceRoles, memberships, sites, canManageMembers, membersWhy } = useWorkspaceView();
	const { setMembership, setWorkspaceRole } = useWorkspaceActions();
	const [inviting, setInviting] = useState(false);
	const [pending, setPending] = useState<IPending | null>(null);

	const roleOf = useMemo(() => {
		const m = new Map<string, TRole>();
		for (const ms of memberships) m.set(`${ms.userId}:${ms.siteId}`, ms.role);
		return (userId: string, siteId: string) => m.get(`${userId}:${siteId}`);
	}, [memberships]);

	const ordered = useMemo(() => {
		const rank: Record<TWorkspaceRole, number> = {
			owner: 0,
			admin: 1,
			member: 2,
		};
		return [...users]
			.filter((u) => u.status !== "suspended")
			.sort(
				(a, b) =>
					rank[workspaceRoles[a.id] ?? "member"] - rank[workspaceRoles[b.id] ?? "member"] || (a.status === "invited" ? 1 : 0) - (b.status === "invited" ? 1 : 0) || a.name.localeCompare(b.name),
			);
	}, [users, workspaceRoles]);

	const isAdminRow = (u: IUser) => (workspaceRoles[u.id] ?? "member") !== "member";
	const siteCount = (u: IUser) => (isAdminRow(u) ? sites.length : memberships.filter((m) => m.userId === u.id).length);

	const changeCell = (u: IUser, s: ISite, next: TCell) => {
		const cur = roleOf(u.id, s.id);
		if ((cur ?? "none") === next) return;
		if (next === "none")
			setPending({
				title: `Remove ${u.name} from ${s.name}?`,
				body: `${u.name.split(" ")[0]} loses access to ${s.name} right away — the site disappears from their switcher and open tabs show "no access". Their past work and comments stay.`,
				confirm: "Remove access",
				danger: true,
				run: () => setMembership(u.id, s.id, null),
			});
		else
			setPending({
				title: cur ? `Change ${u.name.split(" ")[0]}'s role on ${s.name}?` : `Give ${u.name.split(" ")[0]} access to ${s.name}?`,
				body: cur ? `${ROLE_LABEL[cur]} → ${ROLE_LABEL[next]}. What they can do on ${s.name} changes immediately.` : `They join ${s.name} as ${ROLE_LABEL[next]} and see it in their site switcher.`,
				confirm: cur ? "Change role" : "Give access",
				run: () => setMembership(u.id, s.id, next),
			});
	};

	const changeWorkspaceRole = (u: IUser, next: TWorkspaceRole) => {
		const cur = workspaceRoles[u.id] ?? "member";
		if (cur === next) return;
		setPending({
			title: `Make ${u.name} ${WORKSPACE_ROLE_LABEL[next].toLowerCase()}?`,
			body:
				next === "member"
					? `${u.name.split(" ")[0]} stops being admin on every site and keeps only the per-site roles set below.`
					: `${WORKSPACE_ROLE_LABEL[next]}s are admin on all ${plural(sites.length, "site")}, can invite people and add sites.`,
			confirm: "Change workspace role",
			run: () => setWorkspaceRole(u.id, next),
		});
	};

	const lockedNote = !canManageMembers ? (membersWhy ?? "Only workspace owners and admins can change who has access.") : null;

	return (
		<>
			<TopBarCta>
				{canManageMembers ? (
					<Button variant="primary" icon="UserPlus" onClick={() => setInviting(true)}>
						Invite people
					</Button>
				) : (
					<LockedAction label="Invite people" summary="Admins only" reasons={[lockedNote ?? ""]} />
				)}
			</TopBarCta>
			<PageHeader title={`Team · ${ordered.length}`} subtitle={`People in ${workspace.name} and what they can do on each client site`} />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
				<Section title="Members" count={ordered.length}>
					<Card padding="sm">
						{ordered.length === 0 ? (
							<EmptyState icon="Users" title="No one here yet" body="Invite the people who work on your client sites." />
						) : (
							<ul className="flex flex-col" aria-label="Members">
								{ordered.map((u) => {
									const wr = workspaceRoles[u.id] ?? "member";
									const owner = wr === "owner";
									const self = u.id === me.id;
									return (
										<li key={u.id} className="flex min-h-14 flex-wrap items-center gap-3 border-b border-line-2 px-2 py-2 last:border-b-0">
											<Avatar name={u.name} initials={u.initials} size={32} />
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="flex items-center gap-1.5 truncate font-display text-md font-medium text-ink">
													{u.name}
													{self && <span className="text-xs font-normal text-ink-3">(you)</span>}
												</span>
												<span className="truncate text-xs text-ink-3">{[u.title, u.email].filter(Boolean).join(" · ")}</span>
											</span>
											{u.status === "invited" ? (
												<Chip size="sm" tone="human" icon="EnvelopeSimple">
													Invited
													{u.invitedAt ? ` ${formatRelative(u.invitedAt)}` : ""}
												</Chip>
											) : (
												<Chip size="sm" tone="pass">
													Active
												</Chip>
											)}
											<span className="tabular w-16 text-end text-xs text-ink-3">{plural(siteCount(u), "site")}</span>
											{canManageMembers && !owner && !self ? (
												<Select<TWorkspaceRole>
													label={`Workspace role for ${u.name}`}
													value={wr}
													onChange={(v) => changeWorkspaceRole(u, v)}
													options={(["admin", "member"] as TWorkspaceRole[]).map((r) => ({
														value: r,
														label: WORKSPACE_ROLE_LABEL[r],
													}))}
													align="end"
													className="w-32 [&>span:first-child]:sr-only"
												/>
											) : (
												<Tooltip label={owner ? "The owner's role can't be changed here" : self ? "You can't change your own workspace role" : (lockedNote ?? "")}>
													<span tabIndex={0} className="inline-flex w-32 justify-end">
														<Chip size="sm" tone={wr === "member" ? "neutral" : "ink"}>
															{WORKSPACE_ROLE_LABEL[wr]}
														</Chip>
													</span>
												</Tooltip>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</Card>
				</Section>

				<aside className="flex flex-col gap-4" aria-label="Seats and permissions">
					<Card className="flex flex-col gap-3">
						<h3 className="font-display text-lg leading-display">Seats</h3>
						<Meter label={`${workspace.plan[0]!.toUpperCase()}${workspace.plan.slice(1)} plan`} value={workspace.seatsUsed} max={workspace.seats} warnAt={0.85} />
						<p className="text-xs text-ink-3">Invited people hold a seat until they accept or the invite is withdrawn.</p>
					</Card>
					{lockedNote ? (
						<Callout tone="info" icon="LockSimple" title="View only">
							{lockedNote}
						</Callout>
					) : (
						<Callout tone="info" icon="Info" title="How access works">
							Owners and admins are admin on every site. Everyone else gets a role per site — no role means the site is hidden from them.
						</Callout>
					)}
				</aside>
			</div>

			<Section className="shrink-0" title="Access by site" meta={`${plural(ordered.length, "person", "people")} × ${plural(sites.length, "site")}`}>
				<Card padding="none" className="overflow-hidden">
					<div className="thin-scrollbar overflow-x-auto">
						<table className="w-full min-w-[56rem] border-collapse text-md">
							<caption className="sr-only">Site role per person</caption>
							<thead>
								<tr className="border-b border-line-2 bg-sunken-2">
									<th scope="col" className="sticky start-0 z-10 min-w-56 bg-sunken-2 px-4 py-2.5 text-start text-xs font-normal text-ink-3">
										Person
									</th>
									{sites.map((s) => (
										<th key={s.id} scope="col" className="min-w-36 px-2 py-2.5 text-start font-normal">
											<span className="flex items-center gap-2">
												<SiteAvatar name={s.name} hue={s.accent} size={24} />
												<span className="flex min-w-0 flex-col">
													<span className="truncate font-display text-sm font-medium text-ink">{s.name}</span>
													<span className="truncate text-2xs text-ink-3">{s.status === "active" ? s.domain : s.status}</span>
												</span>
											</span>
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{ordered.map((u) => (
									<tr key={u.id} className="border-b border-line-2 last:border-b-0">
										<th scope="row" className="sticky start-0 z-10 bg-surface px-4 py-2 text-start font-normal">
											<span className="flex items-center gap-2.5">
												<Avatar name={u.name} initials={u.initials} size={24} />
												<span className="flex min-w-0 flex-col">
													<span className="truncate font-display text-md font-medium text-ink">{u.name}</span>
													<span className="text-2xs text-ink-3">{WORKSPACE_ROLE_LABEL[workspaceRoles[u.id] ?? "member"]}</span>
												</span>
											</span>
										</th>
										{isAdminRow(u) ? (
											<td colSpan={sites.length} className="px-2 py-2">
												<Chip size="sm" tone="ink" icon="ShieldCheck">
													Admin on all sites
												</Chip>
											</td>
										) : (
											sites.map((s) => {
												const cur = roleOf(u.id, s.id);
												return (
													<td key={s.id} className="px-2 py-1.5">
														{canManageMembers ? (
															<Select<TCell>
																label={`${u.name} on ${s.name}`}
																value={cur ?? "none"}
																options={CELL_OPTIONS}
																onChange={(v) => changeCell(u, s, v)}
																className={`w-full [&>span:first-child]:sr-only ${cur ? "" : "[&_button]:text-ink-3"}`}
															/>
														) : (
															<span className="ps-1 text-md text-ink">{cur ? ROLE_SHORT[cur] : <span className="text-ink-3">—</span>}</span>
														)}
													</td>
												);
											})
										)}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			</Section>

			<InviteSheet open={inviting} onClose={() => setInviting(false)} />

			<Dialog
				open={!!pending}
				onClose={() => setPending(null)}
				title={pending?.title ?? ""}
				footer={
					<>
						<Button variant="ghost" onClick={() => setPending(null)}>
							Cancel
						</Button>
						<Button
							variant={pending?.danger ? "danger" : "primary"}
							onClick={() => {
								pending?.run();
								setPending(null);
							}}
						>
							{pending?.confirm}
						</Button>
					</>
				}
			>
				<p>{pending?.body}</p>
			</Dialog>
		</>
	);
}
