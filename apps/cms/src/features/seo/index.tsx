"use client";
// S13 /seo — SEO trajectory + Keyword Attribution Score (ref 06, flow F8, PRD modules 6 and 7).
import {
	Button,
	Callout,
	Card,
	CardHeader,
	Chip,
	ConcentrationGauge,
	DataGap,
	DataTable,
	EmptyState,
	KasTable,
	LedgerItem,
	SegmentedControl,
	Select,
	ShareBar,
	Skeleton,
	SourceNote,
	Sparkline,
	StatTile,
	StatusLight,
	TrajectoryChart,
	type IDataTableColumn,
	type IDataTableSort,
} from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { concentration, DEFAULT_CTR_CURVE, fmtDay, fmtDelta, fmtInt, fmtShare, fmtSignedPct, orphanWeight, pillarDistribution, RUN_META } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteLedger } from "@/features/shared/site-source";
import type { IKeyword, IWeekPoint } from "@/lib/types";
import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { KeywordSheet } from "./keyword-sheet";
import { headlineGap, kasRows, performanceRows, pointsFor, RANGE_OPTIONS, snapshotLabel, snapshotsOf, type IPerfRow, type TMetric, type TRange } from "./model";
import { sitePath } from "@/lib/routes";

const SC_NOTE = "Search Console · lags 2–3 days · modeled CTR curve";

/** Search Console missing → explicit gap + Connect for developer/admin; everyone else sees why they can't. */
function ScGap({ what, compact }: { what: string; compact?: boolean }) {
	const { site, actions, can, why } = useSiteCms();
	const label = site.searchConsole === "expired" ? "Search Console access expired" : "Search Console not connected";
	const allowed = can("searchConsole.connect");
	const reason = why("searchConsole.connect");
	const button = (
		<Button variant="secondary" size="sm" icon="PlugsConnected" disabled={!allowed} title={reason ?? undefined} onClick={() => actions.connectSearchConsole(site.id)}>
			Connect Search Console
		</Button>
	);
	const stacked = (
		<div className="flex flex-col items-start gap-2">
			<DataGap label={label} reason={`${what} Nothing here is estimated.`} className="w-full" />
			{button}
			{!allowed && <span className="text-xs text-ink-4">{reason} · ask a developer to connect it.</span>}
		</div>
	);
	if (compact) return stacked;
	return (
		<>
			<div className="md:hidden">{stacked}</div>
			<DataGap
				className="max-md:hidden"
				label={label}
				reason={
					<>
						{what} No positions or impressions — nothing here is estimated.
						{!allowed && <span className="block text-xs text-ink-4">{reason} · ask a developer to connect it.</span>}
					</>
				}
				action={button}
			/>
		</>
	);
}

// ---- Trajectory -------------------------------------------------------------

function TrajectoryCard({ range }: { range: TRange }) {
	const { site, data } = useSiteCms();
	const [metric, setMetric] = useState<TMetric>("sessions");
	const [table, setTable] = useState(false);
	const { points, wanted, short } = pointsFor(data.trajectory, range);
	const gap = headlineGap(points);
	const connected = site.searchConsole === "connected";
	const complete = points.filter((p) => p.sessions !== null).length;
	const projLabel = `Month ${Math.max(1, site.ageMonths)} projection`;

	if (!connected)
		return (
			<Card padding="lg" className="flex min-w-0 flex-1 flex-col gap-4 rounded-3xl">
				<div className="flex flex-col gap-1">
					<span className="text-sm text-ink-3">Gap to phase projection</span>
					<span className="font-display text-2xl text-ink-4">No data</span>
				</div>
				<ScGap what="The trajectory can't be sourced." />
			</Card>
		);

	if (complete < 2)
		return (
			<Card padding="lg" className="flex-1 rounded-3xl">
				<EmptyState icon="ChartLineUp" title="Not enough data yet" body="The first trajectory needs 2 weeks of Search Console data." />
			</Card>
		);

	return (
		<Card padding="none" className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl px-6 py-5.5 max-md:px-4.5 max-md:py-4.5">
			<div className="flex flex-wrap items-start gap-x-6 gap-y-3">
				<StatTile size="lg" label="Gap to phase projection" value={gap ? fmtSignedPct(gap.pct) : "No data"} />
				{gap && (
					<StatTile
						className="pt-1"
						label={`Organic sessions · ${gap.week}`}
						value={
							<span className="text-xl">
								{fmtInt(gap.actual)} <span className="font-sans text-sm text-ink-4">of {fmtInt(gap.projected)} projected</span>
							</span>
						}
					/>
				)}
				<div className="ms-auto flex items-center gap-2 max-md:ms-0">
					<SegmentedControl
						size="sm"
						label="Trajectory metric"
						value={metric}
						onChange={setMetric}
						options={[
							{ value: "sessions", label: "Sessions" },
							{ value: "impressions", label: "Impressions" },
						]}
						className="bg-sunken"
					/>
				</div>
			</div>
			{gap && gap.skipped.length > 0 && (
				<Callout tone="info" icon="Warning" title={`No data for ${gap.skipped.join(", ")}`}>
					The headline uses {gap.week}, the last complete week. Missing weeks stay gaps.
				</Callout>
			)}
			{table ? (
				<DataTable
					dense
					caption={`${metric === "sessions" ? "Organic sessions" : "Impressions"} by week`}
					rows={points.map((p) => ({ ...p, id: p.week }))}
					columns={(
						[
						{ key: "w", header: "Week", render: (p) => p.week },
						{ key: "a", header: "Actual", align: "end", render: (p) => (p[metric] === null ? <span className="text-ink-4">No data</span> : fmtInt(p[metric] as number)) },
						{ key: "p", header: "Projected", align: "end", render: (p) => fmtInt(p.projected) },
					] satisfies IDataTableColumn<IWeekPoint & { id: string }>[]
					).filter((c) => metric === "sessions" || c.key !== "p")}
				/>
			) : (
				<TrajectoryChart points={points} metric={metric} height={170} projection={metric === "sessions"} projectionLabel={projLabel} fitDomain />
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="ghost" size="sm" icon={table ? "ChartLineUp" : "ListBullets"} onClick={() => setTable((t) => !t)}>
					{table ? "Show as chart" : "Show as table"}
				</Button>
				{metric === "impressions" && <span className="text-xs text-ink-3">The action plan projects sessions only · no impressions projection is drawn.</span>}
				{short && (
					<span className="text-xs text-ink-3">
						{range === "quarter" ? `Quarter needs ${wanted} weeks` : "Since launch"} · {points.length} weeks of Search Console data stored ({points[0]?.week}–{points[points.length - 1]?.week})
					</span>
				)}
				{range === "launch" && <span className="text-xs text-ink-3">Stored history starts {points[0]?.week} · earlier weeks predate the connection</span>}
				<SourceNote className="ms-auto md:hidden">Search Console · lags 2–3 days</SourceNote>
			</div>
		</Card>
	);
}

// ---- Plan status ------------------------------------------------------------

function PlanStatusCard() {
	const { data } = useSiteCms();
	return (
		<Card padding="lg" className="flex flex-col gap-3 rounded-3xl lg:w-[340px] lg:shrink-0 max-md:bg-transparent max-md:p-0">
			<h2 className="font-display text-lg max-md:sr-only">Plan status</h2>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-2 max-md:grid-cols-2">
				{data.planStatus.map((s) => (
					<StatusLight key={s.id} light={s.light} label={s.label} value={s.value} detail={s.detail} className="max-md:bg-surface" />
				))}
			</div>
		</Card>
	);
}

// ---- KAS -------------------------------------------------------------------

function KasCard({ onSelect }: { onSelect: (id: string) => void }) {
	const { site, data } = useSiteCms();
	const snaps = snapshotsOf(data);
	const [snap, setSnap] = useState("latest");
	const [all, setAll] = useState(false);
	const rows = useMemo(() => kasRows(data, snap), [data, snap]);
	const conc = concentration(rows);
	const latest = snaps[0];
	const selected = snaps.find((s) => s.id === snap);
	const prev = selected ? snaps[snaps.indexOf(selected) + 1] : undefined;
	const connected = site.searchConsole === "connected";

	const header = (
		<div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
			<h2 className="font-display text-xl max-md:text-lg">
				<span className="md:hidden">Attribution</span>
				<span className="max-md:hidden">Keyword Attribution Score</span>
			</h2>
			{connected && latest && <span className="text-sm text-ink-4 max-md:hidden">{selected ? (prev ? `${snapshotLabel(selected, data)} · Δ vs ${snapshotLabel(prev, data)}` : "Oldest stored snapshot · no earlier Δ") : latest.label}</span>}
			{connected && rows.length > 0 && (
				<>
					<span className={clsx("ms-auto inline-flex h-6 items-center rounded-pill px-2.5 font-display text-xs", conc.fragile ? "bg-block text-on-ink" : "bg-pass-soft text-pass-ink")}>
						<span className="max-md:hidden">Concentration {Math.round(conc.top)}% · {conc.fragile ? "fragile" : "spread"}</span>
						<span className="md:hidden">{Math.round(conc.top)}% top 5</span>
					</span>
					<Select
						value={snap}
						onChange={setSnap}
						icon="ClockCounterClockwise"
						align="end"
						className="max-md:hidden"
						options={[{ value: "latest", label: "Latest snapshot", hint: latest?.label }, ...snaps.map((s) => ({ value: s.id, label: snapshotLabel(s, data), hint: `${fmtDay(s.at)} · stored` }))]}
					/>
				</>
			)}
		</div>
	);

	if (!connected)
		return (
			<Card padding="none" className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl px-6 py-5.5 max-md:p-4">
				{header}
				<ScGap what="Keyword shares can't be calculated." />
			</Card>
		);

	if (!rows.length)
		return (
			<Card padding="none" className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl px-6 py-5.5 max-md:p-4">
				{header}
				<EmptyState icon="Target" title="No keyword ranks yet" body="Scores appear 24 h after the first merge, then recalculate weekly." />
			</Card>
		);

	const top5 = rows.slice(0, 5);
	return (
		<Card padding="none" className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl px-6 py-5.5 max-md:p-4">
			{header}
			<div className="flex items-end gap-6">
				<div className="flex min-w-0 flex-1 flex-col gap-2">
					{/* Top-5 stack: each segment is one keyword's share (ref). */}
					<div className="flex h-3.5 gap-0.5 overflow-hidden rounded-pill" role="img" aria-label={`Top 5 keywords hold ${fmtShare(conc.top)} of search weight`}>
						{top5.map((k, i) => (
							<span key={k.id} className={clsx("block h-full", ["bg-ink", "bg-ink-2", "bg-ink-3", "bg-ink-4", "bg-ink-5"][i])} style={{ width: `${k.kasShare}%` }} title={`${k.term} · ${fmtShare(k.kasShare)}`} />
						))}
						<span className="block h-full flex-1 bg-line" />
					</div>
					<span className="truncate text-xs text-ink-3 max-md:hidden">Top 5 of {rows.length} ranking keywords · shares sum to 100% · recalculated 24 h after each merge, then weekly</span>
				</div>
				<ConcentrationGauge value={conc.top} label="Concentration" className="w-60 shrink-0 max-md:hidden" />
			</div>
			{/* Desktop/tablet: full table. Mobile: top 2 rows, rest behind "All keywords". */}
			<KasTable keywords={rows} onSelect={onSelect} className="thin-scrollbar max-md:hidden" />
			<ul className="m-0 flex list-none flex-col p-0 md:hidden">
				{(all ? rows : rows.slice(0, 2)).map((k) => (
					<li key={k.id}>
						<button type="button" onClick={() => onSelect(k.id)} className="press flex min-h-11 w-full items-center gap-2 border-t border-line text-start text-md first:border-t-0">
							<span className="min-w-0 flex-1 truncate font-sans">{k.term}</span>
							{k.rankingPages === 1 && <Chip size="sm" tone="human">orphan</Chip>}
							<span className="tabular font-display">{fmtShare(k.kasShare)}</span>
							<span className={clsx("tabular w-10 text-end font-sans", k.kasDelta > 0.04 ? "text-pass-ink" : k.kasDelta < -0.04 ? "text-block-ink" : "text-ink-4")}>{fmtDelta(k.kasDelta)}</span>
						</button>
					</li>
				))}
			</ul>
			<Button variant="ghost" size="sm" icon={all ? "CaretUp" : "CaretDown"} onClick={() => setAll((a) => !a)} className="self-start md:hidden">
				{all ? "Top 2 only" : `All keywords · ${rows.length}`}
			</Button>
		</Card>
	);
}

// ---- Pillar distribution ----------------------------------------------------

function PillarCard() {
	const { site, data } = useSiteCms();
	const dist = pillarDistribution(data.keywords, data.pillars);
	const unearned = dist.filter((d) => d.claimedButUnearned);
	const swarm = data.schedules.find((s) => s.kind === "keyword-swarm");
	const day = swarm ? fmtDay(swarm.nextAt).split(" ")[0] : "";
	const dayName = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[day] ?? day;
	return (
		<Card padding="lg" className="flex flex-col gap-3.5 rounded-3xl lg:w-[340px] lg:shrink-0">
			<div className="flex items-center gap-2">
				<h2 className="font-display text-lg">Pillar distribution</h2>
				<span className="ms-auto text-xs text-ink-4">share of score</span>
			</div>
			{site.searchConsole !== "connected" ? (
				<ScGap what="Pillar shares can't be sourced." compact />
			) : !data.keywords.some((k) => k.position !== null && k.kasShare > 0) ? (
				<DataGap label="No keyword scores yet" reason="Pillar shares appear with the first KAS snapshot, 24 h after the first merge." />
			) : (
				<>
					<ShareBar
						max={50}
						rows={dist.map((d) => ({ id: d.pillarId, label: d.name, value: Math.round(d.share), tone: d.claimedButUnearned ? "human" : "ink", note: d.claimedButUnearned ? "claimed, unearned" : undefined }))}
					/>
					<span className="mt-auto text-xs leading-body text-ink-3">
						{unearned.length ? (
							<>
								<span className="text-agent-ink">Keyword swarm</span> prioritises {unearned.map((u) => u.name).join(" and ")} in {dayName}&apos;s run.
							</>
						) : (
							"Every plan pillar holds at least 5% of score."
						)}
					</span>
				</>
			)}
		</Card>
	);
}

// ---- Derived indicators ------------------------------------------------------

function Indicators() {
	const { site, data } = useSiteCms();
	const ranking = data.keywords.filter((k) => k.position !== null && k.kasShare > 0);
	if (site.searchConsole !== "connected" || !ranking.length)
		return (
			<section aria-labelledby="seo-derived" className="flex flex-col gap-2.5">
				<h2 id="seo-derived" className="px-1.5 font-display text-base">
					Derived indicators
				</h2>
				{site.searchConsole !== "connected" ? (
					<ScGap what="Concentration, orphan weight, claimed-but-unearned and movement need keyword scores." />
				) : (
					<DataGap label="No keyword scores yet" reason="Indicators appear with the first KAS snapshot, 24 h after the first merge." />
				)}
			</section>
		);
	const conc = concentration(ranking);
	const orphan = orphanWeight(data.keywords);
	const unearned = pillarDistribution(data.keywords, data.pillars).filter((d) => d.claimedButUnearned);
	const byDelta = [...ranking].sort((a, b) => b.kasDelta - a.kasDelta);
	const gain = byDelta[0];
	const loss = byDelta[byDelta.length - 1];
	const noise = ranking.filter((k) => Math.abs(k.kasDelta) < 0.05 && k.positionTrend.length > 1 && k.positionTrend[k.positionTrend.length - 2] !== k.position).length;
	const tiles = [
		{ id: "conc", label: "Concentration", value: fmtShare(conc.top), note: conc.fragile ? "Top 5 keywords · above 60% is fragile" : "Top 5 keywords · healthy spread", tone: conc.fragile ? "text-block-ink" : "text-ink" },
		{ id: "orphan", label: "Orphan weight", value: fmtShare(orphan.share), note: `${orphan.keywordIds.length} keywords rest on one page`, tone: "text-ink" },
		{ id: "unearned", label: "Claimed but unearned", value: unearned.length ? unearned.map((u) => `${u.name} ${Math.round(u.share)}%`).join(", ") : "None", note: "Plan pillars under 5% of score", tone: unearned.length ? "text-human-ink" : "text-ink" },
		{ id: "move", label: "Movement", value: `${fmtDelta(gain.kasDelta)} / ${fmtDelta(loss.kasDelta)}`, note: `${gain.term} took share · ${loss.term} lost it${noise ? ` · ${noise} moved position without share change` : ""}`, tone: "text-ink" },
	];
	return (
		<section aria-labelledby="seo-derived" className="flex flex-col gap-2.5">
			<h2 id="seo-derived" className="px-1.5 font-display text-base">
				Derived indicators
			</h2>
			<div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
				{tiles.map((t) => (
					<Card key={t.id} padding="md" className={clsx("flex flex-col gap-1", t.id === "unearned" && unearned.length > 0 && "bg-human-soft")}>
						<span className={clsx("text-xs", t.id === "unearned" && unearned.length ? "text-human-ink" : "text-ink-3")}>{t.label}</span>
						<span className={clsx("tabular font-display text-xl leading-snug", t.tone)}>{t.value}</span>
						<span className="text-xs text-ink-3">{t.note}</span>
					</Card>
				))}
			</div>
		</section>
	);
}

// ---- Content performance ------------------------------------------------------

type TPerfKey = "post" | "position" | "impressions" | "clicks" | "kas";

function PerformanceCard() {
	const { slug } = useSite();
	const { site, data } = useSiteCms();
	const [filter, setFilter] = useState<"all" | "page2">("all");
	const [sort, setSort] = useState<IDataTableSort>({ key: "kas", dir: "desc" });
	const rows = useMemo(() => performanceRows(data), [data]);
	const refresh = data.schedules.find((s) => s.kind === "content-refresh");
	const connected = site.searchConsole === "connected";
	const page2 = rows.filter((r) => r.page2).length;

	const sorted = useMemo(() => {
		const list = filter === "page2" ? rows.filter((r) => r.page2) : rows;
		const val = (r: IPerfRow, k: string): number | string => (k === "post" ? r.post.title : k === "position" ? (r.position ?? 999) : (r[k as Exclude<TPerfKey, "post">] as number));
		const dir = sort.dir === "asc" ? 1 : -1;
		return [...list].sort((a, b) => {
			const x = val(a, sort.key);
			const y = val(b, sort.key);
			return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * dir;
		});
	}, [rows, filter, sort]);

	const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "position" || key === "post" ? "asc" : "desc" }));
	const router = useRouter();

	const columns: IDataTableColumn<IPerfRow>[] = [
		{
			key: "post",
			header: "Post",
			render: (r) => (
				<span className="flex min-w-0 flex-col py-1.5">
					<span className="truncate font-display text-md">{r.post.title}</span>
					<span className="flex items-center gap-1.5 text-xs text-ink-3">
						{r.post.state === "decaying" ? <span className="text-block-ink">Decaying</span> : <span>Live</span>}
						{r.page2 && (
							<Chip size="sm" tone="agent" icon="Robot">
								Page 2 · refresh picks this up
							</Chip>
						)}
					</span>
				</span>
			),
		},
		{
			key: "position",
			header: "Position",
			width: 150,
			render: (r) =>
				r.position === null ? (
					<span className="text-xs text-ink-4">Not ranking</span>
				) : (
					<span className="flex items-center gap-2">
						<Sparkline values={r.trend} invert tone={r.post.state === "decaying" ? "block" : "ink"} />
						<span className={clsx("tabular font-display", r.post.state === "decaying" && "text-block-ink")}>{r.position}</span>
					</span>
				),
		},
		{ key: "impressions", header: "Impressions", align: "end", width: 110, render: (r) => fmtInt(r.impressions) },
		{ key: "clicks", header: "Est. clicks", align: "end", width: 100, render: (r) => fmtInt(r.clicks) },
		{ key: "kas", header: "KAS contribution", align: "end", width: 130, render: (r) => <span className="font-display">{fmtShare(r.kas)}</span> },
	];

	return (
		<Card padding="none" className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-3xl px-6 py-5.5 max-md:p-4">
			<div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
				<h2 className="font-display text-lg">Content performance</h2>
				<span className="text-sm text-ink-3">{rows.length} live posts shipped through the CMS</span>
				{connected && (
						<SegmentedControl
							size="sm"
							label="Filter posts"
							value={filter}
							onChange={setFilter}
							className="ms-auto bg-sunken max-md:ms-0"
							options={[
								{ value: "all", label: "All live" },
								{ value: "page2", label: `Page 2 posts · ${page2}` },
							]}
						/>
				)}
			</div>
			{!connected ? (
				<ScGap what="Positions, impressions and clicks can&apos;t be sourced." />
			) : (
				<>
					{filter === "page2" && (
						<Callout tone="agent" icon="Robot" title="Positions 11–20 · the refresh agent picks these up automatically">
							{RUN_META["content-refresh"].agent} runs {refresh ? `next ${fmtDay(refresh.nextAt)}` : "monthly"} and ranks decaying, high-score pages first. Nothing to do here.
						</Callout>
					)}
					<DataTable
						caption="Live posts with position trend, impressions, estimated clicks and KAS contribution"
						columns={columns}
						rows={sorted}
						sort={sort}
						onSort={onSort}
						onRowClick={(r) => router.push(sitePath(slug, `/posts/${r.post.id}`))}
						empty={<EmptyState icon="FileText" title={filter === "page2" ? "No page-2 posts" : "No live posts yet"} body={filter === "page2" ? "No live post sits in positions 11–20 right now." : "Posts appear here once a merge makes them Live."} />}
					/>
					<span className="text-xs text-ink-3">Est. clicks = impressions × C(position) on the {data.ctrCurve ? "client" : "modeled industry"} CTR curve. Search Console click counts replace the estimate once the site has enough of its own data.</span>
				</>
			)}
		</Card>
	);
}

// ---- Honest limit + ledger -----------------------------------------------------

function HonestLimit() {
	const { data } = useSiteCms();
	const curve = data.ctrCurve ?? DEFAULT_CTR_CURVE;
	const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
	return (
		<Card padding="lg" className="flex flex-col gap-2.5 rounded-3xl">
			<div className="flex items-center gap-2">
				<h2 className="font-display text-lg">Honest limit</h2>
				<span className="ms-auto text-xs text-ink-4">assumptions, stated</span>
			</div>
			<ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-ink-2">
				<li className="flex gap-2">
					<span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-4" />
					Positions and impressions come from Search Console, which samples and lags by 2–3 days. This week&apos;s numbers will still move.
				</li>
				<li className="flex gap-2">
					<span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-4" />
					<span>
						C(p) is {data.ctrCurve ? "this client's own fitted curve" : "a modeled industry CTR curve"}: position 1 {pct(curve[0])} · 3 {pct(curve[2])} · 10 {pct(curve[9])}. It&apos;s configurable per client once the site has enough of its own click data.
					</span>
				</li>
			</ul>
		</Card>
	);
}

function LedgerStrip() {
	const { slug } = useSite();
	const ledger = useSiteLedger().slice(0, 3);
	return (
		<Card padding="lg" className="flex flex-col gap-2.5 rounded-3xl">
			<CardHeader title="Human ledger" meta={`${ledger.length} open`} href={sitePath(slug, "/runs")} />
			{ledger.length ? ledger.map((l) => <LedgerItem key={l.id} item={l} className="bg-sunken-2" />) : <span className="text-sm text-ink-3">Nothing waiting on a person.</span>}
		</Card>
	);
}

// ---- Page ----------------------------------------------------------------------

export function SeoDashboard() {
	const { slug } = useSite();
	const { site, data } = useSiteCms();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const [range, setRange] = useState<TRange>("8w");
	const keywordId = params.get("keyword");
	const keyword: IKeyword | undefined = keywordId ? data.keywords.find((k) => k.id === keywordId) : undefined;

	const openKeyword = useCallback(
		(id: string | null) => {
			const next = new URLSearchParams(params.toString());
			if (id) next.set("keyword", id);
			else next.delete("keyword");
			const q = next.toString();
			router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
		},
		[params, pathname, router],
	);

	return (
		<>
			<TopBarCta>
				<Button variant="primary" icon="FileText" href={sitePath(slug, "/seo/reports")} aria-label="Bi-weekly report">
					<span className="max-sm:hidden">Bi-weekly report</span>
					<span className="sm:hidden">Report</span>
				</Button>
			</TopBarCta>
			<h1 className="sr-only">
				SEO trajectory · {site.name}
			</h1>
			<div className="flex flex-wrap items-center gap-2.5">
				<SegmentedControl label="Range" value={range} onChange={setRange} options={RANGE_OPTIONS} className="max-md:hidden" />
				<SegmentedControl label="Range" size="sm" value={range} onChange={setRange} options={RANGE_OPTIONS} className="md:hidden" />
				<div className="flex-1" />
				<span className="inline-flex h-11 items-center rounded-pill bg-surface px-2.5 max-md:hidden">
					<SourceNote>{SC_NOTE}</SourceNote>
				</span>
			</div>

			<div className="flex flex-col gap-4 lg:flex-row">
				<TrajectoryCard range={range} />
				<PlanStatusCard />
			</div>
			<div className="flex flex-col gap-4 lg:flex-row">
				<KasCard onSelect={(id) => openKeyword(id)} />
				<PillarCard />
			</div>
			<Indicators />
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
				<PerformanceCard />
				<div className="flex flex-col gap-4 lg:w-[340px] lg:shrink-0">
					<HonestLimit />
					<LedgerStrip />
				</div>
			</div>
			<KeywordSheet keyword={keyword} onClose={() => openKeyword(null)} />
		</>
	);
}

export function SeoSkeleton() {
	return (
		<div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading SEO trajectory">
			<Skeleton className="h-11 w-80 rounded-pill" />
			<div className="flex flex-col gap-4 lg:flex-row">
				<Skeleton className="h-72 flex-1" radius={28} />
				<Skeleton className="h-72 lg:w-[340px]" radius={28} />
			</div>
			<div className="flex flex-col gap-4 lg:flex-row">
				<div className="flex flex-1 flex-col gap-3 rounded-3xl bg-surface p-6">
					{[0, 1, 2, 3, 4].map((i) => (
						<Skeleton key={i} className="h-8 w-full" />
					))}
				</div>
				<Skeleton className="h-72 lg:w-[340px]" radius={28} />
			</div>
		</div>
	);
}
