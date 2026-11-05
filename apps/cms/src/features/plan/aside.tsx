"use client";
// S02 aside: Human ledger (P1, first) · Programme headline (C5: gap to projection + KAS concentration, 0 clicks) · Next runs.
// Each card fails and loads on its own.

import { clsx } from "clsx";
import Link from "next/link";
import { useState } from "react";
import {
	Button,
	Callout,
	Card,
	CardHeader,
	ConcentrationGauge,
	DataGap,
	Dialog,
	KeyValue,
	LedgerItem,
	LockedAction,
	Meter,
	RoleGate,
	Skeleton,
	SourceNote,
	Sparkline,
	StatTile,
} from "@/ds";
import { budgetFor, checkCap, estimateRun, fmtDay, fmtSignedPct, fmtTime, fmtUsd, RUN_META, TIER_LABEL } from "@/lib/logic";
import { useCms, type ILedgerView, useSite } from "@/lib/store";
import type { ISchedule, TRunKind } from "@/lib/types";
import { usePlanHeadline } from "./model";
import { sitePath } from "@/lib/routes";

export type TRegionState = "ready" | "loading" | "error";

function RegionError({ thing, onRetry }: { thing: string; onRetry: () => void }) {
	return (
		<Card variant="solid" padding="md">
			<Callout
				tone="block"
				title={`Couldn't load ${thing}.`}
				action={
					<Button variant="secondary" size="sm" onClick={onRetry}>
						Try again
					</Button>
				}
			/>
		</Card>
	);
}

function AsideSkeleton() {
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3">
			<Skeleton className="h-6 w-32" />
			<Skeleton className="h-14 w-full" radius={16} />
			<Skeleton className="h-14 w-full" radius={16} />
		</Card>
	);
}

export function PlanAside({ state = "ready", onRetry }: { state?: TRegionState; onRetry: () => void }) {
	if (state === "loading")
		return (
			<>
				<AsideSkeleton />
				<AsideSkeleton />
				<AsideSkeleton />
			</>
		);
	return (
		<>
			<LedgerCard />
			{state === "error" ? <RegionError thing="the programme numbers" onRetry={onRetry} /> : <ProgrammeCard />}
			{state === "error" ? <RegionError thing="next runs" onRetry={onRetry} /> : <NextRunsCard />}
		</>
	);
}

/** Deep link for a ledger item: the slot it holds, else its post, else the full ledger. */
export function ledgerHref(item: ILedgerView, siteSlug: string): string {
	if (item.postId && item.slotId) return sitePath(siteSlug, `/posts/${item.postId}/assets?slot=${item.slotId}`);
	if (item.postId) return sitePath(siteSlug, `/posts/${item.postId}`);
	return sitePath(siteSlug, "/runs#ledger");
}

export function LedgerLink({ item, className }: { item: ILedgerView; className?: string }) {
	const { slug } = useSite();
	return (
		<Link href={ledgerHref(item, slug)} className={clsx("press block rounded-lg hover:shadow-raised", className)} aria-label={`${item.title} · day ${item.age} · ${item.downstream}`}>
			<LedgerItem item={item} />
		</Link>
	);
}

function LedgerCard() {
	const { slug } = useSite();
	const { ledger } = usePlanHeadline();
	const shown = ledger.slice(0, 3);
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3">
			<CardHeader icon="HourglassMedium" title="Human ledger" meta={ledger.length ? `${ledger.length} open` : undefined} href={sitePath(slug, "/runs#ledger")} />
			{shown.length === 0 ? (
				<p className="py-2 text-sm text-ink-3">No human items open</p>
			) : (
				<div className="flex flex-col gap-2">
					{shown.map((l) => (
						<LedgerLink key={l.id} item={l} />
					))}
				</div>
			)}
			{ledger.length > shown.length && (
				<Button variant="ghost" size="sm" href={sitePath(slug, "/runs#ledger")} className="-ms-1 self-start">
					View all {ledger.length}
				</Button>
			)}
		</Card>
	);
}

function ProgrammeCard() {
	const { slug } = useSite();
	const { stats, site } = usePlanHeadline();
	const { data } = useCms();
	const { cadence, gap, concentration } = stats;
	const under = cadence.shipped < cadence.target;
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-4">
			<CardHeader icon="Target" title="Programme" meta={`W${cadence.week}`} href={sitePath(slug, "/seo")} />
			<div className="grid grid-cols-2 gap-3">
				<StatTile label="Cadence" value={`${cadence.shipped} / ${cadence.target}`} caption={under ? "this week · under target" : "this week · on target"} />
				{gap ? (
					<div className="flex min-w-0 flex-col gap-1">
						<StatTile label="Gap to projection" value={fmtSignedPct(gap.pct)} />
						<Sparkline values={data.trajectory.map((p) => p.sessions)} tone={gap.pct < 0 ? "block" : "pass"} className="w-full" />
					</div>
				) : (
					<StatTile label="Gap to projection" value={<span className="text-ink-4">—</span>} caption="No data" />
				)}
			</div>
			{stats.dataGap ? (
				<DataGap
					label="Search Console not connected"
					reason="Gap and KAS concentration can't be sourced until it is."
					action={
						<Button variant="secondary" size="sm" href={sitePath(slug, "/settings")}>
							Connect
						</Button>
					}
				/>
			) : gap ? (
				<ConcentrationGauge value={concentration.top} threshold={60} label="KAS top-5 concentration" />
			) : (
				<DataGap label="Latest week has no data" reason="Search Console hasn't returned this week yet · lags 2–3 days." />
			)}
			<div className="flex flex-wrap items-center gap-2">
				<SourceNote>Search Console · lags 2–3 days</SourceNote>
				<Button variant="ghost" size="sm" href={sitePath(slug, "/seo")} trailing={<span aria-hidden>↗</span>} className="ms-auto">
					Open trajectory
				</Button>
			</div>
		</Card>
	);
}

const PLANNED_KINDS: TRunKind[] = ["keyword-swarm", "technical-monitor", "qa-sweep", "content-refresh", "link-prospecting", "biweekly-report", "kas-recalc"];

function NextRunsCard() {
	const { slug } = useSite();
	const { data, site, role, why } = useCms();
	const [dialog, setDialog] = useState<ISchedule | null>(null);
	const next = data.schedules
		.filter((s) => s.enabled && PLANNED_KINDS.includes(s.kind))
		.sort((a, b) => a.nextAt.localeCompare(b.nextAt))
		.slice(0, 2);
	const first = next[0];
	const cap = first ? checkCap(site, first.kind, estimateRun(first.kind, site)) : null;
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3">
			<CardHeader icon="ClockClockwise" title="Next runs" href={sitePath(slug, "/runs")} />
			{next.length === 0 ? (
				<p className="text-sm text-ink-3">No scheduled runs. Turn one on in Runs.</p>
			) : (
				<div className="grid grid-cols-2 gap-2">
					{next.map((s) => (
						<Card key={s.kind} variant="sunken" padding="sm" className="flex flex-col gap-1">
							<span className="text-xs text-ink-3">{fmtDay(s.nextAt)}</span>
							<span className="tabular font-display text-2xl leading-none tracking-display">{fmtTime(s.nextAt)}</span>
							<span className="text-sm text-ink-2">{s.label}</span>
						</Card>
					))}
				</div>
			)}
			{first && cap && (
				<div className="flex items-center gap-2">
					<span className={clsx("min-w-0 flex-1 text-xs", cap.status === "refused" ? "text-block-ink" : "text-ink-3")}>
						{cap.status === "refused" ? `Over ${cap.budget} cap · run refused` : cap.message}
					</span>
					<RoleGate role={role} allow={["specialist", "admin"]} action="trigger runs">
						<Button variant="secondary" size="sm" icon="Play" onClick={() => setDialog(first)}>
							Run now
						</Button>
					</RoleGate>
				</div>
			)}
			{first && !["specialist", "admin"].includes(role) && <span className="text-xs text-ink-3">{why("run.trigger")}</span>}
			<RunDialog schedule={dialog} onClose={() => setDialog(null)} />
		</Card>
	);
}

/** O4 — Run estimate. The run never starts without an estimate on screen. */
export function RunDialog({ schedule, kind, onClose }: { schedule?: ISchedule | null; kind?: TRunKind | null; onClose: () => void }) {
	const { site, actions } = useCms();
	const k = schedule?.kind ?? kind ?? null;
	const label = schedule?.label ?? (k ? RUN_META[k].label : "");
	const est = k ? estimateRun(k, site) : null;
	const cap = k && est ? checkCap(site, k, est) : null;
	const budget = est ? budgetFor(site, est.budget) : null;
	return (
		<Dialog
			open={!!k}
			onClose={onClose}
			title={`Run ${label.toLowerCase()} now?`}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					{cap?.status === "refused" ? (
						<LockedAction label="Run now · over cap" reasons={[]} />
					) : (
						<Button
							variant="primary"
							icon="Play"
							onClick={() => {
								if (k) actions.runNow(k);
								onClose();
							}}
						>
							Run now
						</Button>
					)}
				</>
			}
		>
			{est && cap && budget && (
				<div className="flex flex-col gap-4">
					<KeyValue
						rows={[
							{ k: "Estimate", v: fmtUsd(est.usd) },
							{ k: "Model tier", v: TIER_LABEL[est.tier] },
							{ k: `${est.budget === "text" ? "Text" : "Image"} cap`, v: `${fmtUsd(budget.spent)} used · ${fmtUsd(Math.max(0, budget.cap - budget.spent))} left` },
						]}
					/>
					<Meter value={cap.afterUsd} max={budget.cap} label="After this run" format={(n) => fmtUsd(n)} />
					{cap.status !== "allowed" && <Callout tone={cap.status === "refused" ? "block" : "human"} title={cap.status === "refused" ? "This run is over the cap" : "Near the cap"}>{cap.message}</Callout>}
				</div>
			)}
		</Dialog>
	);
}
