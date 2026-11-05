"use client";
// Settings · Members & roles — who is on this site, and the PRD roles table (can do / cannot do). Permissions are per site.
import { Avatar, Callout, Card, CardHeader, Chip, DataTable, EmptyState, type IDataTableColumn, type TIconName } from "@/ds";
import { ROLE_LABEL } from "@/lib/logic";
import { useCms } from "@/lib/store";
import type { IMember, TRole } from "@/lib/types";
import { LockLine } from "./shared";

const ROLE_ICON: Record<TRole, TIconName> = { specialist: "NotePencil", developer: "Code", stakeholder: "ChatCircle", admin: "Key" };

const ROLES: { role: TRole; job: string; can: string[]; cannot: string[] }[] = [
	{ role: "specialist", job: "Runs the programme day to day", can: ["Approve posts", "Trigger runs", "Edit drafts", "Upload images", "Sign off prune lists"], cannot: ["Merge MRs", "Change repo config", "Alter model budgets"] },
	{ role: "developer", job: "Guards the codebase", can: ["Connect repo", "Ingest templates", "Review and merge MRs", "Set branch rules"], cannot: ["Approve content quality gates"] },
	{ role: "stakeholder", job: "Reviews and comments", can: ["View plan", "Comment on drafts", "View SEO trajectory"], cannot: ["Approve, trigger or edit"] },
	{ role: "admin", job: "Owns the account", can: ["Everything above", "Billing and budgets", "Model routing", "Adding sites and users"], cannot: ["Bypass the approval gate on content"] },
];

export function MembersTab() {
	const { state, me } = useCms();
	const members = state.members;

	const columns: IDataTableColumn<IMember>[] = [
		{
			key: "name",
			header: "Member",
			render: (m) => (
				<span className="flex items-center gap-2.5 py-1.5">
					<Avatar name={m.name} initials={m.initials} size={32} />
					<span className="font-display text-md">{m.name}</span>
					{m.id === me.id && (
						<Chip tone="neutral" size="sm">
							You
						</Chip>
					)}
				</span>
			),
		},
		{ key: "email", header: "Email", render: (m) => <span className="text-sm text-ink-3">{m.email}</span> },
		{
			key: "role",
			header: "Role",
			render: (m) => (
				<Chip tone="neutral" size="sm" icon={ROLE_ICON[m.role]}>
					{ROLE_LABEL[m.role]}
				</Chip>
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<p className="px-1 text-sm text-ink-3">Permissions are per site, not global. One mandatory human approval per post; nobody can bypass it.</p>
			<Card className="flex flex-col gap-3">
				<CardHeader icon="Users" title="Members" meta={`${members.length} on this site`} />
				{members.length <= 1 ? (
					<EmptyState icon="UserPlus" title="Just you so far" body="An agency admin adds the specialist, developer and client stakeholder." />
				) : (
					<>
						<div className="max-md:hidden">
							<DataTable columns={columns} rows={members} caption="Members" />
						</div>
						<ul className="flex flex-col md:hidden">
							{members.map((m) => (
								<li key={m.id} className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0">
									<Avatar name={m.name} initials={m.initials} size={32} />
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="font-display text-md">
											{m.name}
											{m.id === me.id ? " · you" : ""}
										</span>
										<span className="truncate text-xs text-ink-3">{m.email}</span>
									</span>
									<Chip tone="neutral" size="sm" icon={ROLE_ICON[m.role]}>
										{ROLE_LABEL[m.role]}
									</Chip>
								</li>
							))}
						</ul>
					</>
				)}
				<LockLine perm="members.manage" />
			</Card>
			<Callout tone="info" title="Roles">
				Four roles, one workspace per client site. The specialist is the primary user; the developer touches the system at setup and to merge.
			</Callout>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-4">
				{ROLES.map((r) => (
					<Card key={r.role} className="flex flex-col gap-3">
						<CardHeader icon={ROLE_ICON[r.role]} title={ROLE_LABEL[r.role]} />
						<span className="text-xs text-ink-3">{r.job}</span>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-ink-3">Can do</span>
							<ul className="flex flex-wrap gap-1.5">
								{r.can.map((c) => (
									<li key={c}>
										<Chip tone="neutral" size="sm" icon="Check">
											{c}
										</Chip>
									</li>
								))}
							</ul>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs text-ink-3">Cannot do</span>
							<ul className="flex flex-wrap gap-1.5">
								{r.cannot.map((c) => (
									<li key={c}>
										<Chip tone="neutral" size="sm" icon="Minus">
											{c}
										</Chip>
									</li>
								))}
							</ul>
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}
