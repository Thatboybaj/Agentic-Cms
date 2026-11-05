"use client";
// Charts — section D of docs/uxer/05-component-inventory.md.
// Pure inline SVG + token CSS variables; no chart library. Data gaps (null) break the line and get an explicit
// "no data" marker — a missing connection is never plotted as zero (PRD M6).

import { clsx } from "clsx";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { IPillar, IWeekPoint, TPostState, TTone } from "@/lib/types";

// ---- Shared ---------------------------------------------------------------

const TONE_STROKE: Record<TTone, string> = {
	neutral: "var(--c-ink-4)",
	ink: "var(--c-ink)",
	agent: "var(--c-agent)",
	human: "var(--c-human)",
	block: "var(--c-block)",
	pass: "var(--c-pass)",
	info: "var(--c-ink-3)",
};

const TONE_FILL: Record<TTone, string> = {
	neutral: "bg-ink-4",
	ink: "bg-ink",
	agent: "bg-agent",
	human: "bg-human",
	block: "bg-block",
	pass: "bg-pass",
	info: "bg-ink-3",
};

const TONE_TEXT: Record<TTone, string> = {
	neutral: "text-ink-3",
	ink: "text-ink",
	agent: "text-agent-ink",
	human: "text-human-ink",
	block: "text-block-ink",
	pass: "text-pass-ink",
	info: "text-ink-3",
};

const TONE_SOFT: Record<TTone, string> = {
	neutral: "bg-sunken text-ink",
	ink: "bg-ink text-on-ink",
	agent: "bg-agent-soft text-agent-ink",
	human: "bg-human-soft text-human-ink",
	block: "bg-block-soft text-block-ink",
	pass: "bg-pass-soft text-pass-ink",
	info: "bg-info-soft text-ink-2",
};

const nf = new Intl.NumberFormat("en-US");
const fmt = (n: number) => nf.format(Math.round(n));
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Split a series into runs of consecutive non-null indices. */
function runs(values: (number | null)[]): number[][] {
	const out: number[][] = [];
	let cur: number[] = [];
	values.forEach((v, i) => {
		if (v === null || !Number.isFinite(v)) {
			if (cur.length) out.push(cur);
			cur = [];
		} else cur.push(i);
	});
	if (cur.length) out.push(cur);
	return out;
}

/** Round a max up to a friendly axis ceiling. */
function niceCeil(n: number) {
	if (n <= 0) return 1;
	const p = 10 ** Math.floor(Math.log10(n));
	const m = n / p;
	const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
	return step * p;
}

/** Container width via ResizeObserver so SVG text stays at true px size. */
function useWidth<T extends HTMLElement>(fallback: number) {
	const ref = useRef<T>(null);
	const [w, setW] = useState(fallback);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const ro = new ResizeObserver(([e]) => {
			const next = Math.round(e.contentRect.width);
			if (next > 0) setW(next);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, w] as const;
}

// ---- TrajectoryChart ------------------------------------------------------

export interface ITrajectoryChartProps {
	points: IWeekPoint[];
	height?: number;
	metric?: "sessions" | "impressions";
	/** Draw the projection line (default true). Off when the metric has no stored projection (impressions). */
	projection?: boolean;
	/** Fit the y-axis to the data range instead of starting at zero (shows the trend's slope). Default false. */
	fitDomain?: boolean;
	/** Legend label for the projection line, e.g. "Month 3 projection". */
	projectionLabel?: string;
	className?: string;
}

export function TrajectoryChart({ points, height = 180, metric = "sessions", projection = true, projectionLabel = "Projection", fitDomain = false, className }: ITrajectoryChartProps) {
	const [ref, width] = useWidth<HTMLDivElement>(700);
	const descId = useId();
	const metricLabel = metric === "sessions" ? "Organic sessions" : "Impressions";
	const actual = points.map((p) => p[metric]);
	const n = points.length;

	const padTop = 10;
	const padBottom = 22; // week labels
	const padX = 6;
	const plotH = Math.max(40, height - padTop - padBottom);
	const baseline = padTop + plotH;
	const domain = [...actual.filter((v): v is number => v !== null), ...(projection ? points.map((p) => p.projected) : [])];
	const hi = Math.max(1, ...domain);
	const lo = domain.length ? Math.min(...domain) : 0;
	const fit = fitDomain && domain.length > 1 && hi > lo;
	const maxV = fit ? hi + (hi - lo) * 0.12 : niceCeil(hi * 1.05);
	const minV = fit ? Math.max(0, lo - (hi - lo) * 0.2) : 0;

	const x = (i: number) => (n <= 1 ? width / 2 : padX + (i * (width - padX * 2)) / (n - 1));
	const y = (v: number) => baseline - ((v - minV) / Math.max(1, maxV - minV)) * plotH;

	const projPath = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.projected).toFixed(1)}`).join(" ");
	const segs = runs(actual);
	const gaps = actual.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
	const lastIdx = (() => {
		for (let i = n - 1; i >= 0; i--) if (actual[i] !== null) return i;
		return -1;
	})();
	const labelEvery = Math.max(1, Math.ceil(36 / Math.max(1, width / Math.max(1, n))));

	const first = points[0]?.week ?? "";
	const last = points[n - 1]?.week ?? "";
	const lastPoint = lastIdx >= 0 ? points[lastIdx] : undefined;
	const summary =
		n === 0
			? `${metricLabel}: no data`
			: `${metricLabel} ${first}–${last}. ${lastPoint ? `Latest actual ${fmt(actual[lastIdx] as number)} at ${lastPoint.week}${projection ? ` vs ${fmt(lastPoint.projected)} projected` : ""}.` : "No actual data."}${gaps.length ? ` No data for ${gaps.map((i) => points[i].week).join(", ")}.` : ""}`;

	return (
		<div className={clsx("flex min-w-0 flex-col gap-2", className)}>
			<div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-ink-3" aria-hidden="true">
				<span className="inline-flex items-center gap-1.5">
					<span className="block h-0.5 w-4 rounded-pill bg-ink" />
					Actual
				</span>
				{projection && (
					<span className="inline-flex items-center gap-1.5">
						<span className="block w-4 border-t-2 border-dashed border-ink-3" />
						{projectionLabel}
					</span>
				)}
				{gaps.length > 0 && (
					<span className="inline-flex items-center gap-1.5">
						<span className="block h-3 border-s border-dashed border-ink-4" />
						No data
					</span>
				)}
			</div>
			<div ref={ref} className="w-full">
				<svg role="img" aria-label={summary} aria-describedby={descId} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="block overflow-visible">
					<desc id={descId}>{summary}</desc>
					{[0, 0.5, 1].map((t) => (
						<line key={t} x1={0} x2={width} y1={baseline - t * plotH} y2={baseline - t * plotH} stroke={t === 0 ? "var(--c-line)" : "var(--c-sunken)"} strokeWidth={1} />
					))}
					{segs.map((s) => {
						const d = s.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)} ${y(actual[i] as number).toFixed(1)}`).join(" ");
						const area = `${d} L${x(s[s.length - 1]).toFixed(1)} ${baseline} L${x(s[0]).toFixed(1)} ${baseline}Z`;
						return (
							<g key={s[0]}>
								{s.length > 1 && <path d={area} fill="var(--c-wash-blue)" opacity={0.55} />}
								{s.length > 1 ? <path d={d} fill="none" stroke="var(--c-ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : <circle cx={x(s[0])} cy={y(actual[s[0]] as number)} r={2.5} fill="var(--c-ink)" />}
							</g>
						);
					})}
					{projection && <path d={projPath} fill="none" stroke="var(--c-ink-3)" strokeWidth={1.5} strokeDasharray="5 5" strokeLinecap="round" />}
					{gaps.map((i) => (
						<g key={`gap-${i}`}>
							<line x1={x(i)} x2={x(i)} y1={padTop} y2={baseline} stroke="var(--c-ink-4)" strokeWidth={1} strokeDasharray="2 3" />
							<rect x={x(i) - 22} y={baseline - 18} width={44} height={14} rx={7} fill="var(--c-surface)" stroke="var(--c-line-3)" />
							<text x={x(i)} y={baseline - 8} textAnchor="middle" fontSize={9} fill="var(--c-ink-3)" style={{ fontFamily: "var(--c-font-body)" }}>
								no data
							</text>
						</g>
					))}
					{lastIdx >= 0 && <circle cx={x(lastIdx)} cy={y(actual[lastIdx] as number)} r={4} fill="var(--c-ink)" stroke="var(--c-surface)" strokeWidth={2} />}
					{points.map((p, i) =>
						i % labelEvery === 0 || i === n - 1 ? (
							<text key={p.week} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--c-ink-4)" className="tabular" style={{ fontFamily: "var(--c-font-body)" }}>
								{p.week}
							</text>
						) : null,
					)}
				</svg>
			</div>
			<table className="sr-only">
				<caption>{metricLabel} by week, actual vs projection</caption>
				<thead>
					<tr>
						<th scope="col">Week</th>
						<th scope="col">Actual</th>
						{projection && <th scope="col">Projected</th>}
					</tr>
				</thead>
				<tbody>
					{points.map((p) => (
						<tr key={p.week}>
							<th scope="row">{p.week}</th>
							<td>{p[metric] === null ? "No data" : fmt(p[metric] as number)}</td>
							{projection && <td>{fmt(p.projected)}</td>}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

// ---- Sparkline ------------------------------------------------------------

export interface ISparklineProps {
	values: (number | null)[];
	tone?: TTone;
	/** Lower is better (e.g. rank position): plot inverted so "up" still means good. */
	invert?: boolean;
	className?: string;
}

export function Sparkline({ values, tone = "ink", invert, className }: ISparklineProps) {
	const W = 80;
	const H = 24;
	const pad = 3;
	const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
	const min = nums.length ? Math.min(...nums) : 0;
	const max = nums.length ? Math.max(...nums) : 1;
	const span = max - min || 1;
	const n = values.length;
	const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1));
	const y = (v: number) => {
		const t = (v - min) / span;
		return invert ? pad + t * (H - pad * 2) : H - pad - t * (H - pad * 2);
	};
	const segs = runs(values);
	const gaps = values.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
	let lastIdx = -1;
	for (let i = n - 1; i >= 0; i--)
		if (values[i] !== null) {
			lastIdx = i;
			break;
		}
	const stroke = TONE_STROKE[tone];
	const label = nums.length ? `Trend from ${fmt(nums[0])} to ${fmt(nums[nums.length - 1])}${invert ? " (lower is better)" : ""}${gaps.length ? `, ${gaps.length} ${gaps.length === 1 ? "gap" : "gaps"} without data` : ""}` : "Trend: no data";
	return (
		<svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={clsx("block h-6 w-20 overflow-visible", className)}>
			{segs.map((s) =>
				s.length > 1 ? (
					<path key={s[0]} d={s.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)} ${y(values[i] as number).toFixed(1)}`).join(" ")} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
				) : (
					<path key={s[0]} d={`M${x(s[0])} ${y(values[s[0]] as number)}h0`} stroke={stroke} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
				),
			)}
			{gaps.map((i) => (
				<path key={`g${i}`} d={`M${x(i)} ${H - 1}h0`} stroke="var(--c-ink-5)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
			))}
			{lastIdx >= 0 && <path d={`M${x(lastIdx)} ${y(values[lastIdx] as number)}h0`} stroke={stroke} strokeWidth={5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
		</svg>
	);
}

// ---- ShareBar -------------------------------------------------------------

export interface IShareBarRow {
	id: string;
	label: string;
	value: number;
	tone?: TTone;
	note?: string;
}

export interface IShareBarProps {
	rows: IShareBarRow[];
	/** Value that fills the bar. Defaults to the largest row. */
	max?: number;
	className?: string;
}

export function ShareBar({ rows, max, className }: IShareBarProps) {
	const top = max ?? Math.max(1, ...rows.map((r) => r.value));
	return (
		<ul className={clsx("m-0 flex list-none flex-col gap-3 p-0", className)}>
			{rows.map((r) => {
				const flagged = r.tone === "human" || r.tone === "block";
				const tone = r.tone ?? "ink";
				return (
					<li key={r.id} className={clsx("flex flex-col gap-1.5", flagged && clsx("-mx-3 rounded-md px-3 py-2.5", r.tone === "human" ? "bg-human-soft" : "bg-block-soft"))}>
						<span className="flex items-baseline justify-between gap-3 text-sm">
							<span className="min-w-0 truncate">
								{r.label}
								{r.note && <span className={clsx(flagged ? TONE_TEXT[tone] : "text-ink-3")}> · {r.note}</span>}
							</span>
							<span className={clsx("tabular shrink-0 font-display text-md", flagged ? TONE_TEXT[tone] : "text-ink")}>{r.value}%</span>
						</span>
						<span aria-hidden="true" className={clsx("block h-1 overflow-hidden rounded-pill", flagged ? "bg-surface" : "bg-line")}>
							<span className={clsx("block h-full rounded-pill", TONE_FILL[tone])} style={{ width: `${clamp01(r.value / top) * 100}%` }} />
						</span>
					</li>
				);
			})}
		</ul>
	);
}

// ---- StatusLight ----------------------------------------------------------

export interface IStatusLightProps {
	light: "green" | "amber" | "red";
	label: string;
	value: string;
	detail?: string;
	className?: string;
}

const LIGHT = {
	green: { dot: "bg-pass", row: "bg-sunken-2", sr: "On track" },
	amber: { dot: "bg-human", row: "bg-sunken-2", sr: "At risk" },
	red: { dot: "bg-block", row: "bg-block-soft", sr: "Off track" },
} as const;

export function StatusLight({ light, label, value, detail, className }: IStatusLightProps) {
	const l = LIGHT[light];
	return (
		<div className={clsx("flex items-center gap-3 rounded-md px-3 py-2.5", l.row, className)}>
			<span aria-hidden="true" className={clsx("size-2.5 shrink-0 rounded-full", l.dot)} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm">
					{label}
					<span className="sr-only"> · {l.sr}</span>
				</span>
				{detail && <span className="truncate text-xs text-ink-3">{detail}</span>}
			</span>
			<span className={clsx("tabular shrink-0 font-display text-md", light === "red" && "text-block-ink")}>{value}</span>
		</div>
	);
}

// ---- ConcentrationGauge ---------------------------------------------------

export interface IConcentrationGaugeProps {
	value: number;
	threshold?: number;
	label?: string;
	className?: string;
}

export function ConcentrationGauge({ value, threshold = 60, label = "Top-5 concentration", className }: IConcentrationGaugeProps) {
	const v = Math.min(100, Math.max(0, value));
	const fragile = v > threshold;
	return (
		<div className={clsx("flex min-w-0 flex-col gap-2", className)}>
			<span className="flex items-center gap-2">
				<span className="truncate text-sm text-ink-3">{label}</span>
				<span className="tabular ms-auto font-display text-lg">{Math.round(v)}%</span>
				{fragile ? <span className="inline-flex h-5 items-center rounded-pill bg-block px-2 font-display text-xs text-on-ink">fragile</span> : <span className="inline-flex h-5 items-center rounded-pill bg-pass-soft px-2 font-display text-xs text-pass-ink">spread</span>}
			</span>
			<div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} aria-valuetext={`${Math.round(v)}% · ${fragile ? `fragile, above ${threshold}% threshold` : `below ${threshold}% threshold`}`} className="relative h-2 w-full rounded-pill bg-line">
				<span className={clsx("block h-full rounded-pill", fragile ? "bg-block" : "bg-ink")} style={{ width: `${v}%` }} />
				<span aria-hidden="true" className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-pill bg-ink rtl:translate-x-1/2" style={{ insetInlineStart: `${threshold}%` }} />
			</div>
			<span className="tabular text-xs text-ink-3" style={{ paddingInlineStart: `max(0px, calc(${threshold}% - 2ch))` }} aria-hidden="true">
				{threshold}%
			</span>
		</div>
	);
}

// ---- CalendarWeekGrid -----------------------------------------------------

export interface ICalendarItem {
	id: string;
	title: string;
	tone: TTone;
	href?: string;
	/** With `onMove`: false pins the item (e.g. already drafting). Default true. */
	movable?: boolean;
}

export interface ICalendarWeek {
	week: number;
	label: string;
	target: number;
	items: ICalendarItem[];
}

export interface ICalendarWeekGridProps {
	weeks: ICalendarWeek[];
	/** Enables drag between weeks + keyboard move (focus an item, Alt + ←/→). Inventory gap G1. */
	onMove?: (itemId: string, week: number) => void;
	/** Weeks that can't receive items (e.g. past weeks). */
	closedWeeks?: number[];
	className?: string;
}

export function CalendarWeekGrid({ weeks, onMove, closedWeeks = [], className }: ICalendarWeekGridProps) {
	const hintId = useId();
	const [dragId, setDragId] = useState<string | null>(null);
	const [overWeek, setOverWeek] = useState<number | null>(null);
	const refocus = useRef<string | null>(null);
	const root = useRef<HTMLDivElement>(null);
	const open = (w: number) => !closedWeeks.includes(w);

	// Keep focus on the item after a keyboard move re-renders it in another week.
	useEffect(() => {
		const id = refocus.current;
		if (!id) return;
		refocus.current = null;
		root.current?.querySelector<HTMLElement>(`[data-cal-item="${CSS.escape(id)}"]`)?.focus();
	}, [weeks]);

	const onKey = (e: KeyboardEvent<HTMLElement>, itemId: string, weekIdx: number) => {
		if (!onMove || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
		e.preventDefault();
		const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
		const step = (e.key === "ArrowRight") !== rtl ? 1 : -1;
		for (let i = weekIdx + step; i >= 0 && i < weeks.length; i += step) {
			if (open(weeks[i].week)) {
				refocus.current = itemId;
				onMove(itemId, weeks[i].week);
				return;
			}
		}
	};

	return (
		<div ref={root} className={clsx("thin-scrollbar grid auto-cols-[minmax(168px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1", className)}>
			{onMove && (
				<span id={hintId} className="sr-only">
					Drag to another week, or press Alt plus Left or Right arrow to move one week.
				</span>
			)}
			{weeks.map((w, wi) => {
				const count = w.items.length;
				const tone: TTone = count >= w.target ? "pass" : count === 0 ? "block" : "human";
				const free = Math.max(0, w.target - count);
				const accepts = !!onMove && open(w.week);
				const isOver = accepts && overWeek === w.week && dragId !== null;
				return (
					<section
						key={w.week}
						aria-label={`${w.label}: ${count} of ${w.target} planned posts${!open(w.week) ? ", closed" : ""}`}
						onDragOver={
							accepts
								? (e) => {
										e.preventDefault();
										e.dataTransfer.dropEffect = "move";
										if (overWeek !== w.week) setOverWeek(w.week);
									}
								: undefined
						}
						onDragLeave={accepts ? (e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOverWeek(null) : undefined}
						onDrop={
							accepts
								? (e) => {
										e.preventDefault();
										const id = e.dataTransfer.getData("text/plain");
										setOverWeek(null);
										setDragId(null);
										if (id) onMove(id, w.week);
									}
								: undefined
						}
						className={clsx("flex min-w-0 flex-col gap-2 rounded-xl bg-surface p-3 transition-shadow duration-200", isOver && "ring-2 ring-agent-line")}
					>
						<header className="flex items-center gap-2 px-1">
							<h3 className="font-display text-base">{w.label}</h3>
							<span className={clsx("tabular ms-auto inline-flex h-5 items-center rounded-pill px-2 font-display text-xs", TONE_SOFT[tone])}>
								{count} / {w.target}
							</span>
						</header>
						{count > w.target && <span className="px-1 text-xs text-ink-3">Over target</span>}
						{!open(w.week) && dragId && <span className="px-1 text-xs text-ink-3">Past weeks are closed</span>}
						<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
							{w.items.map((it) => {
								const movable = !!onMove && it.movable !== false;
								const body = (
									<>
										<span aria-hidden="true" className={clsx("mt-1.5 size-1.5 shrink-0 rounded-full", TONE_FILL[it.tone])} />
										<span className="line-clamp-2 min-w-0 text-sm leading-snug">{it.title}</span>
									</>
								);
								const cls = clsx("flex items-start gap-2 rounded-sm bg-sunken-2 px-2.5 py-2", movable && "cursor-grab active:cursor-grabbing", dragId === it.id && "opacity-50");
								const shared = {
									"data-cal-item": it.id,
									"aria-describedby": movable ? hintId : undefined,
									onKeyDown: movable ? (e: KeyboardEvent<HTMLElement>) => onKey(e, it.id, wi) : undefined,
								};
								return (
									<li
										key={it.id}
										draggable={movable || undefined}
										onDragStart={
											movable
												? (e) => {
														e.dataTransfer.setData("text/plain", it.id);
														e.dataTransfer.effectAllowed = "move";
														setDragId(it.id);
													}
												: undefined
										}
										onDragEnd={movable ? () => (setDragId(null), setOverWeek(null)) : undefined}
									>
										{it.href ? (
											<Link href={it.href} draggable={false} className={clsx(cls, "press hover:bg-sunken")} {...shared}>
												{body}
											</Link>
										) : (
											<div className={cls} tabIndex={movable ? 0 : undefined} {...shared}>
												{body}
											</div>
										)}
									</li>
								);
							})}
							{Array.from({ length: free }, (_, i) => (
								<li key={`open-${i}`} className="rounded-sm border border-dashed border-line-3 px-2.5 py-2 text-xs text-ink-3">
									Open slot
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

// ---- PillarMatrix ---------------------------------------------------------

export interface IPillarMatrixProps {
	pillars: IPillar[];
	cells: { pillarId: string; state: TPostState; count: number }[];
	className?: string;
}

const STATES: { state: TPostState; label: string }[] = [
	{ state: "idea", label: "Idea" },
	{ state: "briefed", label: "Briefed" },
	{ state: "drafting", label: "Drafting" },
	{ state: "needs-assets", label: "Needs assets" },
	{ state: "in-review", label: "In review" },
	{ state: "mr-open", label: "MR open" },
	{ state: "live", label: "Live" },
	{ state: "decaying", label: "Decaying" },
];

export function PillarMatrix({ pillars, cells, className }: IPillarMatrixProps) {
	const count = (pillarId: string, state: TPostState) => cells.find((c) => c.pillarId === pillarId && c.state === state)?.count ?? 0;
	return (
		<div className={clsx("thin-scrollbar w-full overflow-x-auto", className)}>
			<table className="w-full min-w-[44rem] border-collapse text-sm">
				<caption className="sr-only">Posts per pillar by state, with planned versus live coverage</caption>
				<thead>
					<tr className="border-b border-line-2">
						<th scope="col" className="h-8 pe-3 text-start font-sans text-xs font-normal text-ink-3">
							Pillar
						</th>
						{STATES.map((s) => (
							<th key={s.state} scope="col" className="h-8 whitespace-nowrap px-2 text-end font-sans text-xs font-normal text-ink-3">
								{s.label}
							</th>
						))}
						<th scope="col" className="h-8 w-40 ps-4 text-start font-sans text-xs font-normal text-ink-3">
							Live vs planned
						</th>
					</tr>
				</thead>
				<tbody>
					{pillars.map((p) => {
						const thin = p.livePosts < p.plannedPosts / 2 || p.claimedButUnearned;
						const ratio = p.plannedPosts > 0 ? p.livePosts / p.plannedPosts : 0;
						return (
							<tr key={p.id} className={clsx("h-12 border-b border-line-2 last:border-b-0", thin && "bg-human-soft")}>
								<th scope="row" className={clsx("pe-3 text-start font-normal", thin && "ps-2")}>
									<span className="flex items-center gap-2">
										<span className={clsx("truncate font-display text-md", thin && "text-human-ink")}>{p.name}</span>
										{thin && <span className="inline-flex h-5 shrink-0 items-center rounded-pill bg-surface px-2 font-display text-2xs text-human-ink">{p.claimedButUnearned ? "claimed, unearned" : "thin"}</span>}
									</span>
								</th>
								{STATES.map((s) => {
									const c = count(p.id, s.state);
									return (
										<td key={s.state} className={clsx("tabular px-2 text-end", c === 0 ? "text-ink-5" : s.state === "decaying" ? "text-block-ink" : "text-ink")}>
											{c === 0 ? <span aria-label="0">·</span> : c}
										</td>
									);
								})}
								<td className={clsx("ps-4", thin && "pe-2")}>
									<span className="flex items-center gap-2">
										<span aria-hidden="true" className={clsx("block h-1 flex-1 overflow-hidden rounded-pill", thin ? "bg-surface" : "bg-line")}>
											<span className={clsx("block h-full rounded-pill", thin ? "bg-human" : "bg-ink")} style={{ width: `${clamp01(ratio) * 100}%` }} />
										</span>
										<span className={clsx("tabular shrink-0 text-xs", thin ? "text-human-ink" : "text-ink-3")}>
											{p.livePosts} / {p.plannedPosts}
										</span>
									</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
