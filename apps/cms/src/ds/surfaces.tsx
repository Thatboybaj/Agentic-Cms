"use client";
// Surfaces — section C of docs/uxer/05-component-inventory.md.
// Cards, stat rows, callouts, tables, overlays and toasts. Tokens only (Tailwind aliases from globals.css).

import { clsx } from "clsx";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ElementType,
	type HTMLAttributes,
	type KeyboardEvent as ReactKeyboardEvent,
	type ReactNode,
	type RefObject,
} from "react";
import type { TTone } from "@/lib/types";
import { Icon, IconButton } from "./controls";
import type { TIconName } from "./icons";

// ---- Tone maps (shared inside this file) ----------------------------------

/** Soft fill + readable ink for tiles, callouts, chips. */
const TONE_SOFT: Record<TTone, string> = {
	neutral: "bg-sunken text-ink",
	ink: "bg-ink text-on-ink",
	agent: "bg-agent-soft text-agent-ink",
	human: "bg-human-soft text-human-ink",
	block: "bg-block-soft text-block-ink",
	pass: "bg-pass-soft text-pass-ink",
	info: "bg-info-soft text-ink-2",
};

/** Solid fill for bars and dots (graphics, not text). */
const TONE_FILL: Record<TTone, string> = {
	neutral: "bg-ink-4",
	ink: "bg-ink",
	agent: "bg-agent",
	human: "bg-human",
	block: "bg-block",
	pass: "bg-pass",
	info: "bg-ink-3",
};

/** Text color for values on white. */
const TONE_TEXT: Record<TTone, string> = {
	neutral: "text-ink-3",
	ink: "text-ink",
	agent: "text-agent-ink",
	human: "text-human-ink",
	block: "text-block-ink",
	pass: "text-pass-ink",
	info: "text-ink-3",
};

/** Icon color (graphic tone). */
const TONE_ICON: Record<TTone, string> = {
	neutral: "text-ink-3",
	ink: "text-ink",
	agent: "text-agent",
	human: "text-human",
	block: "text-block",
	pass: "text-pass",
	info: "text-ink-3",
};

const TONE_DEFAULT_ICON: Record<TTone, TIconName> = {
	neutral: "Info",
	ink: "Info",
	agent: "Sparkle",
	human: "Hand",
	block: "WarningCircle",
	pass: "CheckCircle",
	info: "Info",
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// ---- Card -----------------------------------------------------------------

export type TCardVariant = "solid" | "glass" | "sunken" | "outline" | "ink";

export interface ICardProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
	variant?: TCardVariant;
	padding?: "sm" | "md" | "lg" | "none";
	interactive?: boolean;
	selected?: boolean;
	as?: ElementType;
	className?: string;
	children: ReactNode;
}

const CARD_PAD = { none: "", sm: "p-3", md: "p-4", lg: "p-5" } as const;

const CARD_VARIANT: Record<TCardVariant, string> = {
	solid: "rounded-xl bg-surface",
	glass: "glass-strong rounded-xl",
	sunken: "rounded-lg bg-sunken",
	outline: "rounded-xl border border-line-3",
	ink: "rounded-xl bg-ink text-on-ink",
};

export function Card({ variant = "solid", padding = "md", interactive, selected, as: As = "div", className, children, ...rest }: ICardProps) {
	return (
		<As
			className={clsx(
				"relative min-w-0",
				CARD_VARIANT[variant],
				CARD_PAD[padding],
				interactive && "press cursor-pointer hover:shadow-raised",
				// Drawn inside the edge (negative offset) so scrolling lists never clip the selected outline.
				selected && "outline-[1.5px] -outline-offset-[1.5px] outline-ink outline-solid",
				className,
			)}
			{...rest}
		>
			{children}
		</As>
	);
}

// ---- CardHeader -----------------------------------------------------------

export interface ICardHeaderProps {
	icon?: TIconName;
	title: ReactNode;
	meta?: ReactNode;
	action?: ReactNode;
	href?: string;
	className?: string;
}

export function CardHeader({ icon, title, meta, action, href, className }: ICardHeaderProps) {
	const trailing = action ?? (href ? <IconButton icon="ArrowUpRight" label={typeof title === "string" ? `Open ${title}` : "Open"} variant="outline" size="sm" href={href} /> : null);
	return (
		<div className={clsx("flex min-h-8 items-center gap-2", className)}>
			{icon && <Icon name={icon} size={17} className="shrink-0 text-ink" />}
			<h3 className="min-w-0 truncate font-display text-lg leading-display">{title}</h3>
			{meta && <span className="min-w-0 truncate text-sm text-ink-3">{meta}</span>}
			{trailing && <span className="ms-auto flex shrink-0 items-center gap-2">{trailing}</span>}
		</div>
	);
}

// ---- Section --------------------------------------------------------------

export interface ISectionProps {
	title: ReactNode;
	count?: number | string;
	meta?: ReactNode;
	action?: ReactNode;
	children: ReactNode;
	className?: string;
}

export function Section({ title, count, meta, action, children, className }: ISectionProps) {
	const id = useId();
	return (
		<section aria-labelledby={id} className={clsx("flex min-w-0 flex-col gap-3", className)}>
			<div className="flex min-h-8 items-center gap-2 px-1.5">
				<h2 id={id} className="font-display text-base">
					{title}
				</h2>
				{count !== undefined && <span className="tabular text-sm text-ink-3">{count}</span>}
				{meta && <span className="ms-auto flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-3">{meta}</span>}
				{action && <span className={clsx("flex shrink-0 items-center gap-2", !meta && "ms-auto")}>{action}</span>}
			</div>
			{children}
		</section>
	);
}

// ---- StatStrip ------------------------------------------------------------

export interface IStatStripItem {
	id: string;
	label: ReactNode;
	value: ReactNode;
	tone?: TTone;
	active?: boolean;
	onClick?: () => void;
}

export interface IStatStripProps {
	items: IStatStripItem[];
	className?: string;
}

export function StatStrip({ items, className }: IStatStripProps) {
	return (
		<div className={clsx("no-scrollbar flex gap-1.5 overflow-x-auto rounded-xl bg-surface p-1.5", className)}>
			{items.map((it) => {
				const human = it.tone === "human";
				const cls = clsx(
					"flex min-w-[84px] flex-1 flex-col gap-0.5 rounded-md px-3 py-2 text-start",
					human ? "bg-human-soft" : it.active && "bg-sunken",
					it.onClick && "press hover:bg-sunken-2",
				);
				const body = (
					<>
						<span className={clsx("truncate font-sans text-xs", human ? "text-human-ink" : "text-ink-3")}>{it.label}</span>
						<span className={clsx("tabular font-display text-xl leading-snug", it.tone && it.tone !== "neutral" ? TONE_TEXT[it.tone] : "text-ink")}>{it.value}</span>
					</>
				);
				return it.onClick ? (
					<button key={it.id} type="button" onClick={it.onClick} aria-pressed={!!it.active} className={cls}>
						{body}
					</button>
				) : (
					<div key={it.id} className={cls} aria-current={it.active ? "true" : undefined}>
						{body}
					</div>
				);
			})}
		</div>
	);
}

// ---- StatTile -------------------------------------------------------------

export interface IStatTileProps {
	label: ReactNode;
	value: ReactNode;
	delta?: { value: string; tone: TTone };
	caption?: ReactNode;
	size?: "md" | "lg";
	className?: string;
}

export function StatTile({ label, value, delta, caption, size = "md", className }: IStatTileProps) {
	return (
		<div className={clsx("flex min-w-0 flex-col gap-1", className)}>
			<span className="text-sm text-ink-3">{label}</span>
			<span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<span className={clsx("tabular font-display leading-none", size === "lg" ? "tracking-hero text-5xl" : "tracking-display text-2xl")}>{value}</span>
				{delta && <span className={clsx("tabular inline-flex h-5 items-center rounded-pill px-2 font-display text-xs", TONE_SOFT[delta.tone])}>{delta.value}</span>}
			</span>
			{caption && <span className="text-sm text-ink-3">{caption}</span>}
		</div>
	);
}

// ---- KeyValue -------------------------------------------------------------

export interface IKeyValueProps {
	rows: { k: ReactNode; v: ReactNode }[];
	dense?: boolean;
	className?: string;
}

export function KeyValue({ rows, dense, className }: IKeyValueProps) {
	return (
		<dl className={clsx("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5", dense ? "gap-y-1.5 text-xs" : "gap-y-2.5 text-sm", className)}>
			{rows.map((r, i) => (
				<div key={i} className="contents">
					<dt className="text-ink-3">{r.k}</dt>
					<dd className="m-0 min-w-0 break-words text-end">{r.v}</dd>
				</div>
			))}
		</dl>
	);
}

// ---- Callout --------------------------------------------------------------

export interface ICalloutProps {
	tone: TTone;
	icon?: TIconName;
	title: ReactNode;
	children?: ReactNode;
	action?: ReactNode;
	className?: string;
}

const CALLOUT_BG: Record<TTone, string> = {
	neutral: "bg-sunken",
	ink: "bg-ink text-on-ink",
	agent: "bg-agent-soft",
	human: "bg-human-soft",
	block: "bg-block-soft",
	pass: "bg-pass-soft",
	info: "bg-sunken",
};

export function Callout({ tone, icon, title, children, action, className }: ICalloutProps) {
	return (
		<div className={clsx("flex items-start gap-2.5 rounded-lg px-3.5 py-3", CALLOUT_BG[tone], className)}>
			<Icon name={icon ?? TONE_DEFAULT_ICON[tone]} size={17} className={clsx("mt-px shrink-0", tone === "ink" ? "text-on-ink" : TONE_ICON[tone])} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className={clsx("font-display text-md leading-snug", tone !== "ink" && tone !== "neutral" && tone !== "info" && TONE_TEXT[tone])}>{title}</span>
				{children && <div className={clsx("text-sm leading-body", tone === "ink" ? "text-on-ink" : "text-ink-2")}>{children}</div>}
			</div>
			{action && <div className="flex shrink-0 items-center gap-2 self-center">{action}</div>}
		</div>
	);
}

// ---- SourceNote -----------------------------------------------------------

export interface ISourceNoteProps {
	children: ReactNode;
	icon?: TIconName;
	className?: string;
}

export function SourceNote({ children, icon = "Info", className }: ISourceNoteProps) {
	return (
		<span className={clsx("inline-flex h-6 max-w-full items-center gap-1.5 rounded-pill bg-sunken px-2.5 text-xs text-ink-3", className)}>
			<Icon name={icon} size={13} className="shrink-0" />
			<span className="truncate">{children}</span>
		</span>
	);
}

// ---- DataGap --------------------------------------------------------------

export interface IDataGapProps {
	label: ReactNode;
	reason: ReactNode;
	action?: ReactNode;
	className?: string;
}

/** Explicit "missing connection" block. Never render a blank or a zero instead (PRD M6). */
export function DataGap({ label, reason, action, className }: IDataGapProps) {
	return (
		<div role="note" className={clsx("flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-line-3 px-4 py-3.5", className)}>
			<span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink-3">
				<Icon name="Plugs" size={17} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="font-display text-md">{label}</span>
				<span className="text-sm text-ink-3">{reason}</span>
			</span>
			{action && <span className="flex shrink-0 items-center gap-2">{action}</span>}
		</div>
	);
}

// ---- EmptyState -----------------------------------------------------------

export interface IEmptyStateProps {
	icon: TIconName;
	title: ReactNode;
	body: ReactNode;
	action?: ReactNode;
	className?: string;
}

export function EmptyState({ icon, title, body, action, className }: IEmptyStateProps) {
	return (
		<div className={clsx("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
			<span className="grid size-11 place-items-center rounded-full bg-sunken text-ink-3">
				<Icon name={icon} size={20} />
			</span>
			<span className="flex flex-col gap-1">
				<span className="font-display text-lg">{title}</span>
				<span className="mx-auto max-w-[42ch] text-md text-ink-3">{body}</span>
			</span>
			{action && <div className="mt-1 flex items-center gap-2">{action}</div>}
		</div>
	);
}

// ---- Skeleton -------------------------------------------------------------

export interface ISkeletonProps {
	className?: string;
	/** px number or any CSS length; defaults to the `sm` radius. */
	radius?: number | string;
}

export function Skeleton({ className, radius }: ISkeletonProps) {
	return <span aria-hidden="true" className={clsx("c-skeleton block", radius === undefined && "rounded-sm", className)} style={radius !== undefined ? { borderRadius: radius } : undefined} />;
}

// ---- ProgressBar ----------------------------------------------------------

export interface IProgressBarProps {
	value: number;
	tone?: TTone;
	label?: ReactNode;
	size?: "sm" | "md";
	className?: string;
}

export function ProgressBar({ value, tone = "agent", label, size = "sm", className }: IProgressBarProps) {
	const v = clamp01(value);
	const id = useId();
	return (
		<div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
			{label && (
				<span id={id} className={clsx("flex items-center justify-between gap-2 text-xs", tone === "agent" ? "text-agent-ink" : "text-ink-3")}>
					<span className="truncate">{label}</span>
					<span className="tabular shrink-0">{Math.round(v * 100)}%</span>
				</span>
			)}
			<div
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(v * 100)}
				aria-labelledby={label ? id : undefined}
				aria-label={label ? undefined : "Progress"}
				className={clsx("w-full overflow-hidden rounded-pill bg-line", size === "md" ? "h-1.5" : "h-1")}
			>
				<div className={clsx("h-full rounded-pill transition-[width] duration-300 ease-out", TONE_FILL[tone])} style={{ width: `${v * 100}%` }} />
			</div>
		</div>
	);
}

// ---- Meter ----------------------------------------------------------------

export interface IMeterProps {
	value: number;
	max: number;
	label: ReactNode;
	format?: (n: number) => string;
	/** Ratio (0–1) at which the meter turns amber. Default 0.8. */
	warnAt?: number;
	className?: string;
}

export function Meter({ value, max, label, format = (n) => String(n), warnAt = 0.8, className }: IMeterProps) {
	const ratio = max > 0 ? value / max : 0;
	const tone: TTone = ratio >= 1 ? "block" : ratio >= warnAt ? "human" : "ink";
	const id = useId();
	const text = `${format(value)} / ${format(max)}`;
	return (
		<div className={clsx("flex min-w-0 flex-col gap-1.5", className)}>
			<span className="flex items-center justify-between gap-3">
				<span id={id} className="truncate font-display text-md">
					{label}
				</span>
				<span className={clsx("tabular shrink-0 text-sm", tone === "ink" ? "text-ink-3" : TONE_TEXT[tone])}>{text}</span>
			</span>
			<div role="meter" aria-labelledby={id} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${text}${tone === "block" ? " · at cap" : tone === "human" ? ` · past ${Math.round(warnAt * 100)}%` : ""}`} className="h-1 w-full overflow-hidden rounded-pill bg-line">
				<div className={clsx("h-full rounded-pill transition-[width] duration-300 ease-out", TONE_FILL[tone])} style={{ width: `${clamp01(ratio) * 100}%` }} />
			</div>
			{tone !== "ink" && (
				<span className={clsx("flex items-center gap-1 text-xs", TONE_TEXT[tone])}>
					<Icon name={tone === "block" ? "WarningCircle" : "Warning"} size={13} className={TONE_ICON[tone]} />
					{tone === "block" ? "At cap · new runs are refused" : `Past ${Math.round(warnAt * 100)}% of cap`}
				</span>
			)}
		</div>
	);
}

// ---- PaginationDots -------------------------------------------------------

export interface IPaginationDotsProps {
	count: number;
	index: number;
	onChange?: (i: number) => void;
	className?: string;
}

export function PaginationDots({ count, index, onChange, className }: IPaginationDotsProps) {
	const dots = Array.from({ length: Math.max(0, count) }, (_, i) => i);
	const dot = (i: number) => <span aria-hidden="true" className={clsx("block h-1.5 rounded-pill transition-all duration-200 ease-out", i === index ? "w-4 bg-ink" : "w-1.5 bg-line-3")} />;
	return (
		<div role="group" aria-label={`Page ${index + 1} of ${count}`} className={clsx("flex items-center", onChange ? "gap-0" : "gap-1", className)}>
			{dots.map((i) =>
				onChange ? (
					<button key={i} type="button" aria-label={`Go to page ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => onChange(i)} className="grid h-6 place-items-center px-0.5">
						{dot(i)}
					</button>
				) : (
					<span key={i}>{dot(i)}</span>
				),
			)}
		</div>
	);
}

// ---- Avatar / AvatarStack -------------------------------------------------

export interface IAvatarProps {
	name: string;
	initials?: string;
	size?: 24 | 32 | 44;
	tone?: TTone;
	className?: string;
}

const AVATAR_SIZE = { 24: "size-6 text-2xs", 32: "size-8 text-xs", 44: "size-11 text-md" } as const;

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");

export function Avatar({ name, initials, size = 32, tone, className }: IAvatarProps) {
	return (
		<span role="img" aria-label={name} title={name} className={clsx("inline-grid shrink-0 select-none place-items-center rounded-full font-display", AVATAR_SIZE[size], tone ? TONE_SOFT[tone] : "bg-avatar text-ink", className)}>
			<span aria-hidden="true">{initials ?? initialsOf(name)}</span>
		</span>
	);
}

export interface IAvatarStackProps {
	people: { name: string; initials: string }[];
	max?: number;
	className?: string;
}

export function AvatarStack({ people, max = 3, className }: IAvatarStackProps) {
	const shown = people.slice(0, max);
	const rest = people.length - shown.length;
	return (
		<span className={clsx("inline-flex items-center", className)}>
			{shown.map((p, i) => (
				<Avatar key={`${p.name}-${i}`} name={p.name} initials={p.initials} size={24} className={clsx("ring-2 ring-surface", i > 0 && "-ms-1.5")} />
			))}
			{rest > 0 && (
				<span role="img" aria-label={`${rest} more: ${people.slice(max).map((p) => p.name).join(", ")}`} className="tabular -ms-1.5 inline-grid size-6 place-items-center rounded-full bg-ink font-display text-2xs text-on-ink ring-2 ring-surface">
					<span aria-hidden="true">+{rest}</span>
				</span>
			)}
		</span>
	);
}

// ---- Timeline -------------------------------------------------------------

export interface ITimelineItem {
	id: string;
	icon: TIconName;
	tone?: TTone;
	title: ReactNode;
	meta: ReactNode;
	body?: ReactNode;
}

export interface ITimelineProps {
	items: ITimelineItem[];
	className?: string;
}

export function Timeline({ items, className }: ITimelineProps) {
	return (
		<ol className={clsx("m-0 flex list-none flex-col p-0", className)}>
			{items.map((it, i) => (
				<li key={it.id} className="relative flex gap-3 pb-4 last:pb-0">
					{i < items.length - 1 && <span aria-hidden="true" className="absolute start-[13.5px] top-8 bottom-1 w-px bg-line-2" />}
					<span className={clsx("relative grid size-7 shrink-0 place-items-center rounded-full", TONE_SOFT[it.tone ?? "neutral"])}>
						<Icon name={it.icon} size={14} className={TONE_ICON[it.tone ?? "neutral"]} />
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
						<span className="font-display text-md leading-snug">{it.title}</span>
						<span className="text-xs text-ink-3">{it.meta}</span>
						{it.body && <div className="mt-1 text-sm text-ink-2">{it.body}</div>}
					</div>
				</li>
			))}
		</ol>
	);
}

// ---- DataTable ------------------------------------------------------------

export interface IDataTableColumn<T> {
	key: string;
	header: ReactNode;
	width?: number | string;
	align?: "start" | "end";
	render: (row: T) => ReactNode;
	/** Opt a column out of sorting when `onSort` is set. */
	sortable?: boolean;
}

export interface IDataTableSort {
	key: string;
	dir: "asc" | "desc";
}

export interface IDataTableProps<T extends { id: string }> {
	columns: IDataTableColumn<T>[];
	rows: T[];
	onRowClick?: (row: T) => void;
	sort?: IDataTableSort;
	onSort?: (key: string) => void;
	empty?: ReactNode;
	dense?: boolean;
	caption?: string;
	className?: string;
}

export function DataTable<T extends { id: string }>({ columns, rows, onRowClick, sort, onSort, empty, dense, caption, className }: IDataTableProps<T>) {
	const rowKey = (e: ReactKeyboardEvent<HTMLTableRowElement>, row: T) => {
		if (!onRowClick) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onRowClick(row);
		}
	};
	return (
		<div className={clsx("thin-scrollbar w-full overflow-x-auto", className)}>
			<table className="w-full min-w-[36rem] border-collapse text-md">
				{caption && <caption className="sr-only">{caption}</caption>}
				<thead>
					<tr className="border-b border-line-2">
						{columns.map((c) => {
							const canSort = !!onSort && c.sortable !== false;
							const active = sort?.key === c.key;
							const align = c.align === "end" ? "text-end" : "text-start";
							return (
								<th
									key={c.key}
									scope="col"
									style={c.width !== undefined ? { width: c.width } : undefined}
									aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : canSort ? "none" : undefined}
									className={clsx("h-8 whitespace-nowrap px-2 font-sans text-xs font-normal text-ink-3 first:ps-0 last:pe-0", align)}
								>
									{canSort ? (
										<button type="button" onClick={() => onSort?.(c.key)} className={clsx("press inline-flex items-center gap-1 rounded-xs font-sans text-xs hover:text-ink", c.align === "end" && "flex-row-reverse", active && "text-ink")}>
											{c.header}
											<Icon name={active && sort?.dir === "asc" ? "SortAscending" : "SortDescending"} size={12} className={active ? "text-ink" : "text-ink-5"} />
										</button>
									) : (
										c.header
									)}
								</th>
							);
						})}
					</tr>
				</thead>
				<tbody>
					{rows.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="py-6">
								{empty ?? <span className="block text-center text-md text-ink-3">Nothing here yet.</span>}
							</td>
						</tr>
					) : (
						rows.map((row) => (
							<tr
								key={row.id}
								onClick={onRowClick ? () => onRowClick(row) : undefined}
								onKeyDown={onRowClick ? (e) => rowKey(e, row) : undefined}
								tabIndex={onRowClick ? 0 : undefined}
								className={clsx("border-b border-line-2 last:border-b-0", dense ? "h-10" : "h-13", onRowClick && "cursor-pointer transition-colors duration-200 hover:bg-sunken-2 focus-visible:bg-sunken-2")}
							>
								{columns.map((c) => (
									<td key={c.key} className={clsx("px-2 align-middle first:ps-0 last:pe-0", c.align === "end" ? "tabular text-end" : "text-start")}>
										{c.render(row)}
									</td>
								))}
							</tr>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

// ---- Overlay plumbing (Sheet / Dialog) ------------------------------------

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Mount/unmount with an exit transition; `shown` flips a frame after mount so CSS transitions run. */
function usePresence(open: boolean, ms: number) {
	const [mounted, setMounted] = useState(open);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		if (open) {
			setMounted(true);
			let r2 = 0;
			const r1 = requestAnimationFrame(() => {
				r2 = requestAnimationFrame(() => setShown(true));
			});
			return () => {
				cancelAnimationFrame(r1);
				cancelAnimationFrame(r2);
			};
		}
		setShown(false);
		const t = window.setTimeout(() => setMounted(false), ms);
		return () => window.clearTimeout(t);
	}, [open, ms]);
	return { mounted, shown };
}

/** Focus trap-lite: focus first focusable, cycle Tab, Escape closes, restore focus, lock body scroll. */
function useOverlay(open: boolean, onClose: () => void, panel: RefObject<HTMLDivElement | null>) {
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	useEffect(() => {
		if (!open) return;
		const restore = document.activeElement as HTMLElement | null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const raf = requestAnimationFrame(() => {
			const el = panel.current;
			if (!el) return;
			const first = el.querySelector<HTMLElement>(FOCUSABLE);
			(first ?? el).focus();
		});
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				closeRef.current();
				return;
			}
			if (e.key !== "Tab" || !panel.current) return;
			const list = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
			if (list.length === 0) {
				e.preventDefault();
				return;
			}
			const first = list[0];
			const last = list[list.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = prevOverflow;
			restore?.focus?.();
		};
	}, [open, panel]);
}

function OverlayHeader({ id, title, onClose }: { id: string; title: ReactNode; onClose: () => void }) {
	return (
		<div className="flex shrink-0 items-center gap-3 px-5 pt-5 pb-3">
			<h2 id={id} className="min-w-0 flex-1 truncate font-display text-xl leading-display">
				{title}
			</h2>
			<IconButton icon="X" label="Close" variant="ghost" size="sm" onClick={onClose} />
		</div>
	);
}

// ---- Sheet ----------------------------------------------------------------

export interface ISheetProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	side?: "end" | "bottom";
	width?: number;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}

export function Sheet({ open, onClose, title, side = "end", width = 440, children, footer, className }: ISheetProps) {
	const panel = useRef<HTMLDivElement>(null);
	const id = useId();
	const { mounted, shown } = usePresence(open, 320);
	useOverlay(open, onClose, panel);
	if (!mounted) return null;
	const bottom = side === "bottom";
	const style: CSSProperties = bottom ? {} : { width: `min(${width}px, calc(100vw - 16px))` };
	return (
		<div className="fixed inset-0 z-[500]">
			<div aria-hidden="true" onClick={onClose} className={clsx("absolute inset-0 bg-scrim backdrop-blur-[2px] transition-opacity duration-300 ease-out", shown ? "opacity-100" : "opacity-0")} />
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby={id}
				tabIndex={-1}
				style={style}
				className={clsx(
					"absolute flex flex-col bg-surface shadow-sheet outline-none transition-transform duration-[320ms] ease-out",
					bottom ? "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]" : "inset-y-2 end-2 rounded-3xl",
					bottom ? (shown ? "translate-y-0" : "translate-y-full") : shown ? "translate-x-0" : "translate-x-[calc(100%+8px)] rtl:-translate-x-[calc(100%+8px)]",
					className,
				)}
			>
				{bottom && <span aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-pill bg-line-3" />}
				<OverlayHeader id={id} title={title} onClose={onClose} />
				<div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
				{footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-2 px-5 py-4">{footer}</div>}
			</div>
		</div>
	);
}

// ---- Dialog ---------------------------------------------------------------

export interface IDialogProps {
	open: boolean;
	onClose: () => void;
	title: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}

export function Dialog({ open, onClose, title, children, footer, className }: IDialogProps) {
	const panel = useRef<HTMLDivElement>(null);
	const id = useId();
	const { mounted, shown } = usePresence(open, 200);
	useOverlay(open, onClose, panel);
	if (!mounted) return null;
	return (
		<div className="fixed inset-0 z-[500] grid place-items-center p-4">
			<div aria-hidden="true" onClick={onClose} className={clsx("absolute inset-0 bg-scrim backdrop-blur-[2px] transition-opacity duration-200 ease-out", shown ? "opacity-100" : "opacity-0")} />
			<div
				ref={panel}
				role="dialog"
				aria-modal="true"
				aria-labelledby={id}
				tabIndex={-1}
				className={clsx(
					"relative flex max-h-[min(720px,calc(100dvh-32px))] w-full max-w-[480px] flex-col rounded-3xl bg-surface shadow-sheet outline-none transition-[opacity,transform] duration-200 ease-out",
					shown ? "scale-100 opacity-100" : "scale-[0.97] opacity-0",
					className,
				)}
			>
				<OverlayHeader id={id} title={title} onClose={onClose} />
				<div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-5 text-md text-ink-2">{children}</div>
				{footer && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line-2 px-5 py-4">{footer}</div>}
			</div>
		</div>
	);
}

// ---- Toasts ---------------------------------------------------------------

export interface IToastOptions {
	title: ReactNode;
	body?: ReactNode;
	tone?: TTone;
	action?: { label: string; onClick: () => void };
}

interface IToastEntry extends IToastOptions {
	id: number;
}

export interface IToastApi {
	toast: (t: IToastOptions) => number;
	dismiss: (id: number) => void;
}

const ToastContext = createContext<IToastApi | null>(null);

const TOAST_MS = 5000;

export interface IToastProviderProps {
	children: ReactNode;
}

export function ToastProvider({ children }: IToastProviderProps) {
	const [items, setItems] = useState<IToastEntry[]>([]);
	const seq = useRef(0);
	const timers = useRef(new Map<number, number>());

	const dismiss = useCallback((id: number) => {
		const t = timers.current.get(id);
		if (t) window.clearTimeout(t);
		timers.current.delete(id);
		setItems((xs) => xs.filter((x) => x.id !== id));
	}, []);

	const toast = useCallback(
		(opts: IToastOptions) => {
			const id = ++seq.current;
			setItems((xs) => [...xs.slice(-2), { ...opts, id }]);
			timers.current.set(
				id,
				window.setTimeout(() => dismiss(id), TOAST_MS),
			);
			return id;
		},
		[dismiss],
	);

	useEffect(() => {
		const map = timers.current;
		return () => map.forEach((t) => window.clearTimeout(t));
	}, []);

	const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

	return (
		<ToastContext.Provider value={api}>
			{children}
			<div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[600] flex flex-col items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]">
				{items.map((t) => (
					<div key={t.id} className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-lg bg-ink px-4 py-3 text-on-ink shadow-float">
						{t.tone && t.tone !== "neutral" && t.tone !== "ink" && <span aria-hidden="true" className={clsx("mt-1.5 size-2 shrink-0 rounded-full", TONE_FILL[t.tone])} />}
						<div className="flex min-w-0 flex-1 flex-col gap-0.5">
							<span className="font-display text-md">{t.title}</span>
							{t.body && <span className="text-sm opacity-80">{t.body}</span>}
						</div>
						{t.action && (
							<button
								type="button"
								onClick={() => {
									t.action?.onClick();
									dismiss(t.id);
								}}
								className="press shrink-0 rounded-pill px-2.5 py-1 font-display text-md text-on-ink underline underline-offset-4 hover:bg-ink-hover"
							>
								{t.action.label}
							</button>
						)}
						<button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="press grid size-6 shrink-0 place-items-center rounded-full opacity-70 hover:opacity-100">
							<Icon name="X" size={14} />
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

const NOOP_TOAST: IToastApi = {
	toast: () => {
		if (process.env.NODE_ENV !== "production") console.warn("useToast() called outside <ToastProvider>");
		return -1;
	},
	dismiss: () => {},
};

export function useToast(): IToastApi {
	return useContext(ToastContext) ?? NOOP_TOAST;
}

// ---- Divider --------------------------------------------------------------

export interface IDividerProps {
	vertical?: boolean;
	className?: string;
}

export function Divider({ vertical, className }: IDividerProps) {
	return <span role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} className={clsx("block shrink-0 bg-line-2", vertical ? "w-px self-stretch" : "h-px w-full", className)} />;
}
