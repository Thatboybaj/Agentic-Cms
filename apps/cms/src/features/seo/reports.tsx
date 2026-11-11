"use client";
// S14 /seo/reports — every stored bi-weekly edition + reader (?edition=n). Stored data only; nothing back-filled.
import { Button, Callout, Card, Chip, DataGap, EmptyState, KasTable, LedgerItem, PageHeader, Section, Select, SourceNote, StatTile, StatusLight, TrajectoryChart } from "@/ds";
import { fmtDateTime, fmtDay, fmtInt, fmtSignedPct } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteLedger } from "@/features/shared/site-source";
import type { IReportEdition } from "@/lib/types";
import { clsx } from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { frozenPoints, headlineGap, kasRows, snapshotLabel, snapshotsOf, weekOf } from "./model";
import { sitePath } from "@/lib/routes";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function EditionRow({ e, active, onOpen }: { e: IReportEdition; active: boolean; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-current={active ? "true" : undefined}
			className={clsx("press flex w-full flex-col gap-1.5 rounded-lg px-3.5 py-3 text-start", active ? "bg-ink text-on-ink" : "hover:bg-sunken-2")}
		>
			<span className="flex items-baseline gap-2">
				<span className="font-display text-md">#{e.n}</span>
				<span className={clsx("min-w-0 flex-1 truncate text-sm", active ? "text-on-ink/80" : "text-ink-2")}>{e.period}</span>
			</span>
			<span className={clsx("line-clamp-2 font-sans text-xs", active ? "text-on-ink/70" : "text-ink-3")}>{e.headline}</span>
			<span className="flex items-center gap-2">
				<span className={clsx("text-2xs", active ? "text-on-ink/60" : "text-ink-4")}>Published {fmtDay(e.publishedAt)}</span>
				{e.pivotTriggers.length > 0 && (
					<Chip size="sm" tone="human" className="ms-auto">
						{plural(e.pivotTriggers.length, "pivot trigger")}
					</Chip>
				)}
			</span>
		</button>
	);
}

function Reader({ e, latest }: { e: IReportEdition; latest: boolean }) {
	const { data } = useSiteCms();
	const ledger = useSiteLedger();
	const points = frozenPoints(data.trajectory, e.publishedAt);
	const gap = headlineGap(points);
	// KAS snapshot as stored at publish time (the latest snapshot not after the edition).
	const snap = snapshotsOf(data).find((s) => +new Date(s.at) <= +new Date(e.publishedAt));
	const rows = snap ? kasRows(data, snap.id) : [];

	return (
		<Card padding="none" as="article" className="flex min-w-0 flex-1 flex-col gap-5 rounded-3xl px-6 py-5.5 max-md:p-4">
			<header className="flex flex-col gap-2">
				<span className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
					<span className="font-display text-ink">Edition #{e.n}</span>· {e.period} · published {fmtDateTime(e.publishedAt)}
					{latest && (
						<Chip size="sm" tone="pass">
							Latest
						</Chip>
					)}
				</span>
				<h2 className="font-display text-2xl leading-display">{e.headline}</h2>
			</header>

			{e.pivotTriggers.length > 0 && (
				<Section title="Pivot triggers" count={e.pivotTriggers.length} meta="fired into the plan view as alerts">
					<div className="flex flex-col gap-2">
						{e.pivotTriggers.map((t) => (
							<Callout key={t} tone="human" icon="Flag" title={t} />
						))}
					</div>
				</Section>
			)}

			<Section title="Trajectory" meta={`frozen at ${weekOf(e.publishedAt)}`}>
				{gap && points.length > 1 ? (
					<div className="flex flex-col gap-3">
						<div className="flex flex-wrap gap-x-8 gap-y-3">
							<StatTile size="lg" label="Gap to phase projection" value={fmtSignedPct(gap.pct)} />
							<StatTile label={`Organic sessions · ${gap.week}`} value={fmtInt(gap.actual)} caption={`of ${fmtInt(gap.projected)} projected`} />
						</div>
						<TrajectoryChart points={points} height={150} projectionLabel="Phase projection" fitDomain />
					</div>
				) : (
					<DataGap label="No trajectory stored with this edition" reason="Search Console had no complete week at publish time. The gap stays a gap." />
				)}
			</Section>

			<Section title="Plan status">
				{latest ? (
					<div className="grid gap-2 md:grid-cols-2">
						{data.planStatus.map((s) => (
							<StatusLight key={s.id} light={s.light} label={s.label} value={s.value} detail={s.detail} />
						))}
					</div>
				) : (
					<DataGap label="Plan status not stored for this edition" reason="Only the latest edition carries the traffic lights. Older values aren't reconstructed." />
				)}
			</Section>

			<Section title="Keyword Attribution Score" meta={snap ? snapshotLabel(snap, data) : undefined}>
				{snap && rows.length ? (
					<KasTable keywords={rows.slice(0, 6)} className="thin-scrollbar" />
				) : (
					<DataGap label="No KAS snapshot stored at publish time" reason="The first snapshot was recorded after this edition. Nothing here is back-filled." />
				)}
			</Section>

			<Section title="Human ledger" count={latest ? ledger.length : undefined}>
				{latest ? (
					ledger.length ? (
						<div className="flex flex-col gap-2">
							{ledger.map((l) => (
								<LedgerItem key={l.id} item={l} className="bg-sunken-2" />
							))}
						</div>
					) : (
						<span className="px-1.5 text-sm text-ink-3">Nothing waiting on a person.</span>
					)
				) : (
					<DataGap label="Ledger not stored for this edition" reason="Named blockers are listed on the latest edition only." />
				)}
			</Section>

			<SourceNote icon="Robot" className="self-start">
				Generated by the visualization agent · {fmtDateTime(e.publishedAt)}
			</SourceNote>
		</Card>
	);
}

export function SeoReports() {
	const { slug } = useSite();
	const { data } = useSiteCms();
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const editions = [...data.reports].sort((a, b) => b.n - a.n);
	const want = Number(params.get("edition"));
	const current = editions.find((e) => e.n === want) ?? editions[0];
	const schedule = data.schedules.find((s) => s.kind === "biweekly-report");
	const missing = params.get("edition") !== null && !editions.some((e) => e.n === want);

	const open = useCallback((n: number) => router.replace(`${pathname}?edition=${n}`, { scroll: false }), [pathname, router]);

	return (
		<>
			<PageHeader
				back={{ href: sitePath(slug, "/seo"), label: "SEO trajectory" }}
				title="Reports"
				subtitle={`Every edition is stored · alternate Fridays${schedule ? ` · next ${fmtDay(schedule.nextAt)}` : ""}`}
			/>
			{!editions.length ? (
				<Card padding="lg" className="rounded-3xl">
					<EmptyState icon="FileText" title="No reports yet" body={`The first report publishes ${schedule ? fmtDay(schedule.nextAt) : "on the next alternate Friday"}.`} action={<Button variant="secondary" href={sitePath(slug, "/seo")}>Back to trajectory</Button>} />
				</Card>
			) : (
				<div className="flex min-h-0 flex-col gap-4 lg:flex-row lg:items-start">
					<Card padding="md" className="flex flex-col gap-2 rounded-3xl max-lg:hidden lg:sticky lg:top-0 lg:w-[320px] lg:shrink-0">
						<div className="flex items-center gap-2 px-1.5 pt-1">
							<h2 className="font-display text-lg">Editions</h2>
							<span className="tabular text-sm text-ink-3">{editions.length}</span>
							<Button variant="primary" size="sm" className="ms-auto" disabled={current?.n === editions[0].n} onClick={() => open(editions[0].n)}>
								Open latest
							</Button>
						</div>
						{current?.n === editions[0].n && <span className="px-1.5 text-xs text-ink-4">The latest edition is open.</span>}
						<nav aria-label="Report editions" className="flex flex-col gap-1">
							{editions.map((e) => (
								<EditionRow key={e.id} e={e} active={e.n === current?.n} onOpen={() => open(e.n)} />
							))}
						</nav>
					</Card>
					<div className="lg:hidden">
						<Select label="Edition" value={current?.n ?? null} onChange={open} icon="FileText" options={editions.map((e) => ({ value: e.n, label: `#${e.n} · ${e.period}`, hint: e.pivotTriggers.length ? plural(e.pivotTriggers.length, "pivot trigger") : undefined }))} />
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-3">
						{missing && <Callout tone="block" title={`Couldn't open edition #${params.get("edition")}.`}>It isn't stored for this site. Showing #{current?.n}.</Callout>}
						{current && <Reader e={current} latest={current.n === editions[0].n} />}
					</div>
				</div>
			)}
		</>
	);
}
