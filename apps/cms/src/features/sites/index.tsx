"use client";
// /sites — the portfolio (default landing). Every site I can access: what needs me, what the agents are holding,
// spend vs cap, gap to projection. Grid of widget cards (visual-aid anatomy) or a dense sortable table.

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	AvatarStack,
	Button,
	Card,
	Chip,
	DataGap,
	DataTable,
	EmptyState,
	formatRelative,
	formatUsd,
	Icon,
	IconButton,
	LockedAction,
	Meter,
	PageHeader,
	ROLE_SHORT,
	SegmentedControl,
	Select,
	SiteAvatar,
	Skeleton,
	Sparkline,
	StatStrip,
	Toggle,
	type IDataTableColumn,
	type IDataTableSort,
} from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { AddSiteSheet } from "@/features/workspace/add-site-sheet";
import { LiveSignInPrompt } from "@/features/workspace/live-sign-in";
import { PAGES_ON_CONVEX, usePageSiteRows, usePageWorkspaceView, useSitePresence, type ISiteRow } from "@/features/workspace/data";
import { STATUS_ICON, STATUS_LABEL, STATUS_TONE, plural, type TSiteStatus } from "@/features/workspace/labels";
import { sitePath } from "@/lib/routes";
import type { TRole } from "@/lib/types";

type TView = "grid" | "table";
type TStatusFilter = "all" | TSiteStatus;
type TRoleFilter = "all" | TRole;

const PIPE: { key: keyof ISiteRow["pipeline"]; label: string }[] = [
	{ key: "idea", label: "Ideas" },
	{ key: "drafting", label: "Drafting" },
	{ key: "review", label: "Review" },
	{ key: "mr", label: "MR" },
	{ key: "live", label: "Live" },
];

function readView(): TView {
	try {
		return sessionStorage.getItem("cms:sites-view") === "table" ? "table" : "grid";
	} catch {
		return "grid";
	}
}

export function SitesPortfolio() {
	const router = useRouter();
	const { canAddSite, addSiteWhy, loading, signedIn } = usePageWorkspaceView();
	const rows = usePageSiteRows();
	const [view, setViewState] = useState<TView>(readView);
	const [status, setStatus] = useState<TStatusFilter>("all");
	const [role, setRole] = useState<TRoleFilter>("all");
	const [needsMe, setNeedsMe] = useState(false);
	const [sort, setSort] = useState<IDataTableSort>({
		key: "needsMe",
		dir: "desc",
	});
	const [adding, setAdding] = useState(false);

	const setView = (v: TView) => {
		setViewState(v);
		try {
			sessionStorage.setItem("cms:sites-view", v);
		} catch {
			// Storage can be blocked (private mode); the view choice just isn't remembered.
		}
	};

	const totals = useMemo(() => {
		const sum = (f: (r: ISiteRow) => number) => rows.reduce((a, r) => a + f(r), 0);
		return {
			needsMe: sum((r) => r.needsMe),
			ideas: sum((r) => r.ideasPending),
			held: sum((r) => r.held),
			ci: sum((r) => r.failingCi),
			spent: sum((r) => r.spend.spent),
			cap: sum((r) => r.spend.cap),
		};
	}, [rows]);

	const filtered = useMemo(() => {
		const list = rows.filter((r) => (status === "all" || r.status === status) && (role === "all" || r.role === role) && (!needsMe || r.needsMe > 0));
		const dir = sort.dir === "asc" ? 1 : -1;
		const val = (r: ISiteRow): number | string => {
			switch (sort.key) {
				case "name":
					return r.name.toLowerCase();
				case "status":
					return r.status;
				case "role":
					return r.role ?? "";
				case "spend":
					return r.spend.cap ? r.spend.spent / r.spend.cap : 0;
				case "gap":
					return r.gap?.pct ?? -999;
				case "last":
					return r.lastActivity ?? "";
				default:
					return (r as unknown as Record<string, number>)[sort.key] ?? 0;
			}
		};
		return [...list].sort((a, b) => {
			const x = val(a);
			const y = val(b);
			return (x < y ? -1 : x > y ? 1 : 0) * dir || a.name.localeCompare(b.name);
		});
	}, [rows, status, role, needsMe, sort]);

	const addButton = canAddSite ? (
		<Button variant="primary" icon="Plus" onClick={() => setAdding(true)}>
			Add site
		</Button>
	) : (
		<LockedAction label="Add site" summary="Admins only" reasons={[addSiteWhy ?? "Only a workspace owner or admin can add sites"]} />
	);

	if (loading) {
		return (
			<>
				<PageHeader title="Sites" subtitle="Loading your sites…" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading sites">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-48 w-full" />
					))}
				</div>
			</>
		);
	}

	if (PAGES_ON_CONVEX && !signedIn) return <LiveSignInPrompt what="your sites" />;

	if (rows.length === 0) {
		return (
			<>
				<TopBarCta>{addButton}</TopBarCta>
				<PageHeader title="Sites · 0" subtitle="Client sites you work on in this workspace" />
				<Card className="flex flex-1 items-center justify-center">
					<EmptyState
						icon="Globe"
						title="You don't have access to any site yet"
						body={canAddSite ? "Add the first client site to start its onboarding." : "Ask a workspace admin to add you to a site. You'll see it here as soon as they do."}
						action={
							canAddSite ? (
								<Button variant="secondary" icon="Plus" onClick={() => setAdding(true)}>
									Add site
								</Button>
							) : (
								<Button variant="secondary" icon="UsersThree" href="/team">
									See who's an admin
								</Button>
							)
						}
					/>
				</Card>
				<AddSiteSheet open={adding} onClose={() => setAdding(false)} />
			</>
		);
	}

	const toggleSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

	return (
		<>
			<TopBarCta>{addButton}</TopBarCta>
			<PageHeader
				title={`Sites · ${rows.length}`}
				subtitle={
					PAGES_ON_CONVEX
						? "Every client site you can open · live from the backend (post counts and approvals fill in as posts move to it)"
						: "Every client site you can open, with what's waiting on you first"
				}
				actions={
					<SegmentedControl
						label="Layout"
						value={view}
						onChange={setView}
						options={[
							{ value: "grid", label: "Grid", icon: "SquaresFour" },
							{ value: "table", label: "Table", icon: "Table" },
						]}
					/>
				}
			/>

			<StatStrip
				className="shrink-0"
				items={[
					{
						id: "needs",
						label: "Needs you",
						value: totals.needsMe,
						tone: totals.needsMe ? "human" : undefined,
						active: needsMe,
						onClick: () => setNeedsMe((v) => !v),
					},
					{
						id: "ideas",
						label: "Ideas awaiting approval",
						value: totals.ideas,
						tone: totals.ideas ? "human" : undefined,
						onClick: () => router.push("/inbox?kind=idea"),
					},
					{
						id: "held",
						label: "Held by autopost",
						value: totals.held,
						tone: totals.held ? "human" : undefined,
						onClick: () => router.push("/inbox?kind=held"),
					},
					{
						id: "ci",
						label: "Failing CI",
						value: totals.ci,
						tone: totals.ci ? "block" : undefined,
						onClick: () => router.push("/inbox?kind=ci"),
					},
					{
						id: "spend",
						label: "Spend vs cap · this month",
						value: totals.cap ? `${formatUsd(totals.spent)} / ${formatUsd(totals.cap)}` : "No caps set",
					},
				]}
			/>

			<div className="flex shrink-0 flex-wrap items-center gap-2.5 px-1">
				<Select<TStatusFilter>
					label="Status"
					value={status}
					onChange={setStatus}
					icon="Funnel"
					options={[
						{ value: "all", label: "All statuses" },
						{ value: "active", label: "Active" },
						{ value: "onboarding", label: "Onboarding" },
						{ value: "paused", label: "Paused" },
					]}
					className="w-44"
				/>
				<Select<TRoleFilter>
					label="My role"
					value={role}
					onChange={setRole}
					icon="User"
					options={[{ value: "all", label: "Any role" }, ...(["admin", "specialist", "developer", "stakeholder"] as TRole[]).map((r) => ({ value: r, label: ROLE_SHORT[r] }))]}
					className="w-44"
				/>
				<Toggle checked={needsMe} onChange={setNeedsMe} label="Needs me" className="self-end pb-2.5" />
				<span className="tabular ms-auto self-end pb-3 text-sm text-ink-3">{filtered.length === rows.length ? plural(rows.length, "site") : `${filtered.length} of ${rows.length} sites`}</span>
			</div>

			{filtered.length === 0 ? (
				<Card>
					<EmptyState
						icon="Funnel"
						title="No sites match these filters"
						body={needsMe ? "Nothing is waiting on you on the sites in this filter." : "Try another status or role."}
						action={
							<Button
								variant="secondary"
								onClick={() => {
									setStatus("all");
									setRole("all");
									setNeedsMe(false);
								}}
							>
								Clear filters
							</Button>
						}
					/>
				</Card>
			) : view === "grid" ? (
				<ul className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="Sites">
					{filtered.map((r) => (
						<li key={r.id} className="min-w-0">
							<SiteCard row={r} />
						</li>
					))}
				</ul>
			) : (
				<>
					<Card padding="sm" className="shrink-0 max-md:hidden">
						<SitesTable rows={filtered} sort={sort} onSort={toggleSort} onOpen={(r) => router.push(sitePath(r.slug))} />
					</Card>
					{/* Under 768 the dense table becomes card rows (design-system §6). */}
					<ul className="grid shrink-0 grid-cols-1 gap-4 md:hidden" aria-label="Sites">
						{filtered.map((r) => (
							<li key={r.id} className="min-w-0">
								<SiteCard row={r} />
							</li>
						))}
					</ul>
				</>
			)}

			<AddSiteSheet open={adding} onClose={() => setAdding(false)} />
		</>
	);
}

function RoleChip({ role }: { role: TRole | null }) {
	return role ? (
		<Chip size="sm" icon="User">
			{ROLE_SHORT[role]}
		</Chip>
	) : null;
}

function SiteCard({ row: r }: { row: ISiteRow }) {
	const people = useSitePresence(r.id);
	const href = sitePath(r.slug, r.status === "onboarding" ? "/onboarding" : "/plan");
	return (
		<Card className="flex h-full flex-col gap-3.5">
			<div className="flex min-h-8 items-center gap-2.5">
				<SiteAvatar name={r.name} hue={r.hue} size={32} />
				<div className="flex min-w-0 flex-1 flex-col">
					<h3 className="truncate font-display text-lg leading-display text-ink">{r.name}</h3>
					<span className="truncate text-sm text-ink-3">
						{r.domain}
						{r.industry ? ` · ${r.industry}` : ""}
					</span>
				</div>
				<IconButton icon="ArrowUpRight" label={`Open ${r.name}`} variant="outline" size="sm" href={href} />
			</div>

			<div className="flex flex-wrap items-center gap-1.5">
				<Chip size="sm" tone={STATUS_TONE[r.status]} icon={STATUS_ICON[r.status]}>
					{STATUS_LABEL[r.status]}
				</Chip>
				{r.autopost ? (
					<Chip size="sm" tone="agent" icon="Robot">
						Autopost
					</Chip>
				) : (
					<Chip size="sm" icon="Eye">
						Review every post
					</Chip>
				)}
				<RoleChip role={r.role} />
				{r.needsMe > 0 && (
					<Chip size="sm" tone="human" icon="Hand" className="ms-auto">
						{r.needsMe} need you
					</Chip>
				)}
			</div>

			<dl className="grid grid-cols-5 gap-1 rounded-md bg-sunken p-1.5" aria-label="Pipeline">
				{PIPE.map((p) => (
					<div key={p.key} className="flex min-w-0 flex-col items-center gap-0.5 py-1">
						<dt className="truncate text-2xs text-ink-3">{p.label}</dt>
						<dd className="tabular font-display text-lg leading-snug text-ink">{r.pipeline[p.key]}</dd>
					</div>
				))}
			</dl>

			{r.gap ? (
				<div className="flex items-end gap-3">
					<div className="flex min-w-0 flex-col">
						<span className="text-xs text-ink-3">Gap to projection</span>
						<span className="tabular font-display text-2xl leading-none tracking-display text-ink">
							{r.gap.pct > 0 ? "+" : ""}
							{r.gap.pct}%
						</span>
						<span className="mt-1 text-2xs text-ink-3">Search Console · {r.gap.week}</span>
					</div>
					{r.gap.series.length > 1 && <Sparkline values={r.gap.series} tone="ink" className="h-10 min-w-0 flex-1" />}
				</div>
			) : (
				<DataGap label="Gap to projection" reason={r.status === "onboarding" ? "Search Console connects during onboarding" : "Search Console isn't connected"} className="py-2.5" />
			)}

			<Meter label="Spend this month" value={r.spend.spent} max={r.spend.cap} format={formatUsd} />

			<div className="mt-auto flex items-center gap-2 border-t border-line-2 pt-3 text-xs text-ink-3">
				{people.length > 0 ? (
					<>
						<AvatarStack people={people} max={3} />
						<span className="truncate">{people.length === 1 ? `${people[0]!.name.split(" ")[0]} is here` : `${people.length} people here`}</span>
					</>
				) : (
					<span className="flex items-center gap-1.5">
						<Icon name="Users" size={13} />
						No one here now
					</span>
				)}
				<span className="tabular ms-auto shrink-0">{r.lastActivity ? `Active ${formatRelative(r.lastActivity)}` : "No activity yet"}</span>
			</div>
		</Card>
	);
}

function SitesTable({ rows, sort, onSort, onOpen }: { rows: ISiteRow[]; sort: IDataTableSort; onSort: (k: string) => void; onOpen: (r: ISiteRow) => void }) {
	const num = (n: number, tone?: "human" | "block") =>
		n > 0 ? (
			<span className={`tabular font-display font-medium ${tone === "block" ? "text-block-ink" : tone === "human" ? "text-human-ink" : "text-ink"}`}>{n}</span>
		) : (
			<span className="tabular text-ink-3">0</span>
		);
	const columns: IDataTableColumn<ISiteRow>[] = [
		{
			key: "name",
			header: "Site",
			render: (r) => (
				<span className="flex min-w-0 items-center gap-2.5">
					<SiteAvatar name={r.name} hue={r.hue} />
					<span className="flex min-w-0 flex-col">
						<span className="truncate font-display font-medium text-ink">{r.name}</span>
						<span className="truncate text-xs text-ink-3">{r.domain}</span>
					</span>
				</span>
			),
		},
		{
			key: "status",
			header: "Status",
			render: (r) => (
				<Chip size="sm" tone={STATUS_TONE[r.status]}>
					{STATUS_LABEL[r.status]}
				</Chip>
			),
		},
		{
			key: "role",
			header: "My role",
			render: (r) => (r.role ? ROLE_SHORT[r.role] : "—"),
		},
		{
			key: "needsMe",
			header: "Needs me",
			align: "end",
			render: (r) => num(r.needsMe, "human"),
		},
		{
			key: "ideasPending",
			header: "Ideas",
			align: "end",
			render: (r) => num(r.ideasPending, "human"),
		},
		{
			key: "held",
			header: "Held",
			align: "end",
			render: (r) => num(r.held, "human"),
		},
		{
			key: "failingCi",
			header: "Failing CI",
			align: "end",
			render: (r) => num(r.failingCi, "block"),
		},
		{
			key: "spend",
			header: "Spend / cap",
			align: "end",
			render: (r) => <span className="tabular">{`${formatUsd(r.spend.spent)} / ${formatUsd(r.spend.cap)}`}</span>,
		},
		{
			key: "gap",
			header: "Gap",
			align: "end",
			render: (r) => (r.gap ? <span className="tabular">{`${r.gap.pct > 0 ? "+" : ""}${r.gap.pct}%`}</span> : <span className="text-ink-3">No data</span>),
		},
		{
			key: "last",
			header: "Last activity",
			align: "end",
			render: (r) => <span className="tabular text-ink-3">{r.lastActivity ? formatRelative(r.lastActivity) : "—"}</span>,
		},
	];
	return <DataTable caption="Sites" columns={columns} rows={rows} sort={sort} onSort={onSort} onRowClick={onOpen} dense />;
}
