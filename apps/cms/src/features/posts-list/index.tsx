"use client";
// S04 /posts — every post in every state, searchable. Desktop DataTable; mobile Card list.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
	AgentBadge,
	Avatar,
	Button,
	Callout,
	Card,
	DataTable,
	EmptyState,
	IconButton,
	PageHeader,
	RoleGate,
	Select,
	Skeleton,
	SourceNote,
	STATE_LABEL,
	StateChip,
	TextField,
	type IDataTableColumn,
	type IDataTableSort,
} from "@/ds";
import { NewIdeaSheet } from "@/features/plan/new-idea-sheet";
import { TopBarCta } from "@/features/shared/app-shell";
import { addDays, now } from "@/lib/clock";
import { fmtDateTime, POST_STATES, STATE_OWNER } from "@/lib/logic";
import { useCms, useSite } from "@/lib/store";
import type { IPost, TPostState } from "@/lib/types";
import { sitePath } from "@/lib/routes";

interface IRow {
	id: string;
	post: IPost;
	keyword: string;
	pillar: string;
	updated: string;
}

/** Latest known touch: newest version/comment, else the day the post entered its state. */
function updatedAt(p: IPost): string {
	const stamps = [...p.versions.map((v) => v.at), ...p.comments.map((c) => c.at)].sort();
	return stamps[stamps.length - 1] ?? addDays(now(), -p.daysInState);
}

const SORTERS: Record<string, (a: IRow, b: IRow) => number> = {
	title: (a, b) => a.post.title.localeCompare(b.post.title),
	state: (a, b) => POST_STATES.indexOf(a.post.state) - POST_STATES.indexOf(b.post.state),
	keyword: (a, b) => a.keyword.localeCompare(b.keyword),
	pillar: (a, b) => a.pillar.localeCompare(b.pillar),
	week: (a, b) => a.post.week - b.post.week,
	days: (a, b) => a.post.daysInState - b.post.daysInState,
	updated: (a, b) => a.updated.localeCompare(b.updated),
};

export function PostsList() {
	const { slug } = useSite();
	const params = useSearchParams();
	const router = useRouter();
	const { data, state, role } = useCms();
	const counts = useCountsWithBaseline();
	const demo = params.get("demo");
	const initialState = params.get("state");
	const [q, setQ] = useState("");
	const [stateF, setStateF] = useState<TPostState | "all">(POST_STATES.includes(initialState as TPostState) ? (initialState as TPostState) : "all");
	const [pillarF, setPillarF] = useState<string>("all");
	const [sort, setSort] = useState<IDataTableSort>({ key: "updated", dir: "desc" });
	const [sheet, setSheet] = useState(false);

	const specialist = state.members.find((m) => m.role === "specialist");
	const developer = state.members.find((m) => m.role === "developer");

	const rows: IRow[] = useMemo(() => {
		const all = data.posts.map((p) => {
			const k = data.keywords.find((x) => x.id === p.keywordId);
			return { id: p.id, post: p, keyword: k?.term ?? "—", pillar: data.pillars.find((x) => x.id === p.pillarId)?.name ?? "—", updated: updatedAt(p) };
		});
		const needle = q.trim().toLowerCase();
		const filtered = all.filter(
			(r) => (stateF === "all" || r.post.state === stateF) && (pillarF === "all" || r.post.pillarId === pillarF) && (!needle || r.post.title.toLowerCase().includes(needle) || r.keyword.toLowerCase().includes(needle)),
		);
		const cmp = SORTERS[sort.key] ?? SORTERS.updated;
		return filtered.sort((a, b) => (sort.dir === "asc" ? cmp(a, b) : -cmp(a, b)));
	}, [data, q, stateF, pillarF, sort]);

	const owner = (p: IPost) => {
		const o = STATE_OWNER[p.state];
		if (o === "agent") return <AgentBadge />;
		if (o === "system") return <span className="text-sm text-ink-3">System</span>;
		const m = o === "developer" ? developer : specialist;
		return m ? (
			<span className="inline-flex items-center gap-2">
				<Avatar name={m.name} initials={m.initials} size={24} />
				<span className="text-sm">{m.name}</span>
			</span>
		) : (
			<span className="text-sm text-ink-3">Unassigned</span>
		);
	};

	const columns: IDataTableColumn<IRow>[] = [
		{ key: "title", header: "Title", render: (r) => <span className="font-display text-md">{r.post.title}</span> },
		{ key: "state", header: "State", width: 128, render: (r) => <StateChip state={r.post.state} humanOnly={data.slots.some((s) => s.postId === r.id && s.status === "human-only")} /> },
		{ key: "keyword", header: "Keyword", render: (r) => <span className="text-sm text-ink-2">{r.keyword}</span> },
		{ key: "pillar", header: "Pillar", width: 140, render: (r) => <span className="text-sm">{r.pillar}</span> },
		{ key: "week", header: "Week", width: 72, render: (r) => <span className="tabular text-sm">W{r.post.week}</span> },
		{ key: "owner", header: "Owner", width: 150, sortable: false, render: (r) => owner(r.post) },
		{ key: "days", header: "Days in state", width: 112, align: "end", render: (r) => <span className="tabular text-sm">{r.post.daysInState} d</span> },
		{ key: "updated", header: "Updated", width: 184, align: "end", render: (r) => <span className="tabular text-sm text-ink-3">{fmtDateTime(r.updated)}</span> },
	];

	const filtered = q.trim() !== "" || stateF !== "all" || pillarF !== "all";
	const clear = () => {
		setQ("");
		setStateF("all");
		setPillarF("all");
	};
	const emptyNode =
		data.posts.length === 0 ? (
			<EmptyState icon="FileText" title="No posts yet" body="Ideas appear after the keyword swarm runs." />
		) : (
			<EmptyState
				icon="MagnifyingGlass"
				title={q.trim() ? `No post matches “${q.trim()}”` : "No post matches these filters"}
				body="Try a keyword, another state or another pillar."
				action={
					<Button variant="ghost" onClick={clear}>
						Clear filters
					</Button>
				}
			/>
		);

	const tracked = data.posts.filter((p) => p.state === "live").length;
	const baseline = counts.live - tracked;

	return (
		<>
			<TopBarCta>
				<RoleGate role={role} allow={["specialist", "admin"]} action="add ideas">
					<Button variant="primary" icon="Plus" onClick={() => setSheet(true)} className="max-md:hidden">
						New idea
					</Button>
					<IconButton icon="Plus" label="New idea" variant="ink" onClick={() => setSheet(true)} className="md:hidden" />
				</RoleGate>
			</TopBarCta>

			<PageHeader
				title="Posts"
				subtitle={`${counts.total} posts · ${counts.live} live`}
				actions={baseline > 0 ? <SourceNote>{baseline} live posts predate the CMS and aren't listed</SourceNote> : undefined}
			/>

			<div className="flex flex-wrap items-end gap-2.5">
				<TextField label="Search" hideLabel value={q} onChange={setQ} placeholder="Search titles and keywords" icon="MagnifyingGlass" className="min-w-[240px] flex-1 md:max-w-sm" />
				<Select<TPostState | "all">
					label="State"
					value={stateF}
					onChange={setStateF}
					options={[{ value: "all", label: "All states" }, ...POST_STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }))]}
				/>
				<Select<string> label="Pillar" value={pillarF} onChange={setPillarF} options={[{ value: "all", label: "All pillars" }, ...data.pillars.map((p) => ({ value: p.id, label: p.name }))]} />
				{filtered && (
					<Button variant="ghost" onClick={clear}>
						Clear
					</Button>
				)}
			</div>

			{demo === "loading" ? (
				<Card variant="solid" padding="md" className="flex flex-col gap-3">
					{Array.from({ length: 8 }, (_, i) => (
						<Skeleton key={i} className="h-9 w-full" />
					))}
				</Card>
			) : demo === "error" ? (
				<Card variant="solid" padding="md">
					<Callout
						tone="block"
						title="Couldn't load posts."
						action={
							<Button variant="secondary" size="sm" onClick={() => router.replace(sitePath(slug, "/posts"))}>
								Try again
							</Button>
						}
					/>
				</Card>
			) : (
				<>
					<Card variant="solid" padding="sm" className="thin-scrollbar overflow-x-auto max-md:hidden">
						<DataTable
							caption="Posts"
							columns={columns}
							rows={rows}
							sort={sort}
							onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
							onRowClick={(r) => router.push(sitePath(slug, `/posts/${r.id}`))}
							empty={emptyNode}
							className="min-w-[960px]"
						/>
					</Card>
					<div className="flex flex-col gap-2.5 md:hidden">
						{rows.length === 0 ? (
							<Card variant="solid">{emptyNode}</Card>
						) : (
							rows.map((r) => (
								<Link key={r.id} href={sitePath(slug, `/posts/${r.id}`)} className="press block rounded-xl">
									<Card variant="solid" padding="md" className="flex flex-col gap-2">
										<span className="flex items-start gap-2">
											<span className="min-w-0 flex-1 font-display text-lg leading-snug">{r.post.title}</span>
											<StateChip state={r.post.state} humanOnly={data.slots.some((s) => s.postId === r.id && s.status === "human-only")} />
										</span>
										<span className="text-sm text-ink-3">
											{r.pillar} · W{r.post.week} · {r.post.daysInState} {r.post.daysInState === 1 ? "day" : "days"}
										</span>
									</Card>
								</Link>
							))
						)}
					</div>
				</>
			)}

			<NewIdeaSheet open={sheet} onClose={() => setSheet(false)} />
		</>
	);
}

/** Totals with the pre-CMS live baseline folded in (same rule as the plan's StatStrip). */
function useCountsWithBaseline() {
	const { data } = useCms();
	return useMemo(() => {
		const live = data.liveBaseline + data.posts.filter((p) => p.state === "live").length;
		return { total: data.posts.length + data.liveBaseline, live };
	}, [data]);
}
