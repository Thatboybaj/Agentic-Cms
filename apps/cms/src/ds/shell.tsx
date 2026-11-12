"use client";
// Agentic CMS — section A shell (docs/uxer/05-component-inventory.md). Refs 01/02 + visual aid: frosted glass shell
// over blurred blue (top-start) and peach (bottom-end) washes, round icon rail, white pills, ink CTA.

import { clsx } from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ISite, TSiteStatus, TTone } from "@/lib/types";
import { Icon, Kbd, Menu, Tooltip } from "./controls";
import { REGISTRY, type TIconName } from "./icons";

const TONE_FILL: Record<TTone, string> = {
	neutral: "bg-ink-4",
	ink: "bg-ink",
	agent: "bg-agent",
	human: "bg-human",
	block: "bg-block",
	pass: "bg-pass",
	info: "bg-ink-5",
};

const TONE_WORD: Record<TTone, string> = {
	neutral: "update",
	ink: "update",
	agent: "agent activity",
	human: "waiting on you",
	block: "blocked",
	pass: "all clear",
	info: "info",
};

function isActive(href: string, activeHref: string): boolean {
	if (href === "/") return activeHref === "/";
	return activeHref === href || activeHref.startsWith(`${href}/`);
}

/** ISite.icon is a kebab/lower phosphor name ("tooth") → registered TIconName, else Globe. */
function tenantIcon(name: string): TIconName {
	const pascal = name
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((p) => p[0]!.toUpperCase() + p.slice(1))
		.join("");
	return (pascal in REGISTRY ? pascal : "Globe") as TIconName;
}

// ---- AppFrame ------------------------------------------------------------

export type TWash = "blue-peach" | "blue" | "peach" | "green" | "neutral";

const WASH: Record<TWash, [string, string]> = {
	"blue-peach": ["bg-wash-blue", "bg-wash-peach"],
	blue: ["bg-wash-blue", "bg-wash-neutral"],
	peach: ["bg-wash-neutral", "bg-wash-peach"],
	green: ["bg-wash-green", "bg-wash-peach"],
	neutral: ["bg-wash-neutral", "bg-wash-neutral"],
};

export interface IAppFrameProps {
	children: ReactNode;
	wash?: TWash;
	/** Desktop (≥1024) icon rail, usually <IconRail />. */
	rail?: ReactNode;
	/** Mobile (<1024) navigation, usually <MobileTabBar />. */
	mobileNav?: ReactNode;
	className?: string;
}

export function AppFrame({ children, wash = "blue-peach", rail, mobileNav, className }: IAppFrameProps) {
	const [a, b] = WASH[wash];
	return (
		<div className={clsx("relative h-dvh w-full overflow-clip bg-canvas", className)}>
			<a
				href="#main"
				className="sr-only rounded-pill bg-ink px-4 py-2 font-display text-md font-medium text-on-ink focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-(--c-z-toast)"
			>
				Skip to content
			</a>
			<div aria-hidden className={clsx("wash-orb -start-[220px] -top-[260px] size-[760px] transition-colors duration-300", a)} />
			<div aria-hidden className={clsx("wash-orb -end-[240px] -bottom-[300px] size-[760px] blur-[130px] transition-colors duration-300", b)} />
			<div className="absolute inset-0 flex lg:inset-4 lg:rounded-shell lg:border lg:border-glass-edge lg:bg-glass lg:backdrop-blur-[24px] lg:backdrop-saturate-[1.2]">
				{rail && <div className="hidden shrink-0 py-4 ps-4 lg:flex">{rail}</div>}
				<main
					id="main"
					tabIndex={-1}
					className="thin-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4 pb-[calc(112px+env(safe-area-inset-bottom))] outline-none focus-visible:shadow-none lg:pb-4"
				>
					{children}
				</main>
			</div>
			{mobileNav && <div className="lg:hidden">{mobileNav}</div>}
		</div>
	);
}

// ---- RailButton / IconRail ---------------------------------------------------

export interface IRailItem {
	href: string;
	icon: TIconName;
	label: string;
	dot?: TTone;
}

export interface IRailButtonProps {
	href: string;
	icon: TIconName;
	label: string;
	active?: boolean;
	dot?: TTone;
	className?: string;
}

export function RailButton({ href, icon, label, active, dot, className }: IRailButtonProps) {
	return (
		<Tooltip label={label} side="end">
			<Link
				href={href}
				aria-label={dot ? `${label} (${TONE_WORD[dot]})` : label}
				aria-current={active ? "page" : undefined}
				className={clsx(
					"press relative grid size-11 place-items-center rounded-full",
					active ? "bg-ink text-on-ink" : "bg-surface text-ink hover:bg-sunken",
					className,
				)}
			>
				<Icon name={icon} size={19} />
				{dot && <span aria-hidden className={clsx("absolute end-0.5 top-0.5 size-[9px] rounded-full border-2 border-surface", TONE_FILL[dot])} />}
			</Link>
		</Tooltip>
	);
}

export interface IIconRailProps {
	items: IRailItem[];
	activeHref: string;
	/** Bottom slot: settings button, avatar. */
	footer?: ReactNode;
	/** Top mark; defaults to the product glyph. */
	mark?: ReactNode;
	className?: string;
}

export function IconRail({ items, activeHref, footer, mark, className }: IIconRailProps) {
	return (
		<nav aria-label="Primary" className={clsx("flex h-full w-12 flex-col items-center gap-2.5", className)}>
			{mark ?? (
				<Link href="/" aria-label="Agentic CMS home" className="press grid size-12 place-items-center rounded-full bg-surface text-ink">
					<Icon name="AsteriskSimple" size={20} />
				</Link>
			)}
			<div className="flex-1" />
			<ul className="flex flex-col items-center gap-2.5">
				{items.map((it) => (
					<li key={it.href}>
						<RailButton href={it.href} icon={it.icon} label={it.label} dot={it.dot} active={isActive(it.href, activeHref)} />
					</li>
				))}
			</ul>
			<div className="flex-1" />
			{footer && <div className="flex flex-col items-center gap-2.5">{footer}</div>}
		</nav>
	);
}

// ---- TopBar --------------------------------------------------------------

export interface ITopBarProps {
	children: ReactNode;
	className?: string;
}

/** Row of 44px pills, gap 10. Put a `<div className="flex-1" />` between the start and end groups. */
export function TopBar({ children, className }: ITopBarProps) {
	return <header className={clsx("flex min-h-11 shrink-0 flex-wrap items-center gap-2.5", className)}>{children}</header>;
}

// ---- SiteAvatar ------------------------------------------------------------

export interface ISiteAvatarProps {
	name: string;
	/** ISite.accent — hue (0–360) for the avatar fill; falls back to a hue hashed from the name. */
	hue?: number;
	size?: 24 | 28 | 32 | 44;
	className?: string;
}

const SITE_AVATAR_SIZE = { 24: "size-6 text-2xs", 28: "size-7 text-xs", 32: "size-8 text-xs", 44: "size-11 text-md" } as const;

function hashHue(name: string): number {
	let h = 0;
	for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
	return h;
}

/** Client-site avatar: initials on a soft per-site hue (`.site-avatar` in tokens.css). Identity only — carries no state. */
export function SiteAvatar({ name, hue, size = 28, className }: ISiteAvatarProps) {
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
	return (
		<span
			aria-hidden
			className={clsx("site-avatar inline-grid shrink-0 select-none place-items-center rounded-full font-display font-medium", SITE_AVATAR_SIZE[size], className)}
			style={{ "--site-hue": String(hue ?? hashHue(name)) } as CSSProperties}
		>
			{initials}
		</span>
	);
}

// ---- SiteSwitcher --------------------------------------------------------

/** One row of the many-site switcher. Kept free of store types so the DS stays data-agnostic. */
export interface ISiteSwitcherEntry {
	id: string;
	name: string;
	domain: string;
	hue?: number;
	status?: TSiteStatus;
	/** My role on this site, already labelled ("Specialist"). */
	role?: string;
	/** Items waiting on me on this site (amber when > 0). */
	needsMe?: number;
}

export interface ISiteSwitcherProps {
	/** Current site; null on workspace routes (the trigger then reads `allLabel`). */
	site: Pick<ISite, "id" | "name" | "domain" | "icon"> | null;
	sites: ISite[];
	onChange: (id: string) => void;
	/** Rich mode (many sites): searchable, grouped Active · Onboarding · Paused, my role + needs-me per row. */
	entries?: ISiteSwitcherEntry[];
	/** Hue of the current site's avatar (rich mode). */
	hue?: number;
	/** Trigger label when `site` is null. */
	allLabel?: string;
	/** Footer link to the portfolio. */
	onAllSites?: () => void;
	/** Extra footer content (e.g. a role-gated "Add site"). */
	footer?: ReactNode;
	className?: string;
}

const STATUS_GROUPS: { status: TSiteStatus; label: string }[] = [
	{ status: "active", label: "Active" },
	{ status: "onboarding", label: "Onboarding" },
	{ status: "paused", label: "Paused" },
];

export function SiteSwitcher({ site, sites, onChange, entries, hue, allLabel = "All sites", onAllSites, footer, className }: ISiteSwitcherProps) {
	if (entries) return <RichSiteSwitcher site={site} onChange={onChange} entries={entries} hue={hue} allLabel={allLabel} onAllSites={onAllSites} footer={footer} className={className} />;
	if (!site) return null;
	return (
		<Menu
			className={className}
			items={sites.map((s) => ({
				id: s.id,
				icon: s.id === site.id ? "Check" : tenantIcon(s.icon),
				label: (
					<span className="flex flex-col">
						<span>{s.name}</span>
						<span className="font-sans text-xs font-normal text-ink-4">{s.domain}</span>
					</span>
				),
				onSelect: () => onChange(s.id),
			}))}
			trigger={
				<button
					type="button"
					aria-label={`Site: ${site.name}. Switch site`}
					className="press flex h-11 max-w-full items-center gap-2.5 rounded-pill bg-surface ps-2 pe-4 font-display text-base font-medium text-ink hover:bg-sunken"
				>
					<span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-tenant">
						<Icon name={tenantIcon(site.icon)} size={14} />
					</span>
					<span className="truncate">{site.name}</span>
					<span className="hidden font-sans text-sm font-normal text-ink-4 sm:inline">{site.domain}</span>
					<Icon name="CaretDown" size={13} className="text-ink-3" />
				</button>
			}
		/>
	);
}

interface IRichSiteSwitcherProps extends Omit<ISiteSwitcherProps, "sites" | "entries" | "allLabel"> {
	entries: ISiteSwitcherEntry[];
	allLabel: string;
}

function RichSiteSwitcher({ site, onChange, entries, hue, allLabel, onAllSites, footer, className }: IRichSiteSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const input = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const id = useId();

	useEffect(() => {
		if (!open) return;
		setQuery("");
		requestAnimationFrame(() => input.current?.focus());
		const onDown = (e: PointerEvent) => {
			if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpen(false);
				trigger.current?.focus();
			}
		};
		document.addEventListener("pointerdown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("pointerdown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const q = query.trim().toLowerCase();
	const filtered = q ? entries.filter((e) => `${e.name} ${e.domain} ${e.role ?? ""}`.toLowerCase().includes(q)) : entries;
	const groups = STATUS_GROUPS.map((g) => ({ ...g, rows: filtered.filter((e) => (e.status ?? "active") === g.status) })).filter((g) => g.rows.length > 0);
	const ordered = groups.flatMap((g) => g.rows);

	const pick = (siteId: string) => {
		setOpen(false);
		onChange(siteId);
	};
	const moveRows = (e: ReactKeyboardEvent) => {
		const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-site-row]") ?? []);
		if (!nodes.length) return;
		const i = nodes.indexOf(document.activeElement as HTMLElement);
		if (e.key === "ArrowDown") {
			e.preventDefault();
			nodes[i < 0 ? 0 : Math.min(nodes.length - 1, i + 1)]?.focus();
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (i <= 0) input.current?.focus();
			else nodes[i - 1]?.focus();
		}
	};

	const current = site ? entries.find((e) => e.id === site.id) : undefined;
	return (
		<div ref={root} className={clsx("relative inline-flex min-w-0", className)}>
			<button
				ref={trigger}
				type="button"
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={open ? id : undefined}
				aria-label={site ? `Site: ${site.name}. Switch site` : `${allLabel}. Switch site`}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={(e) => {
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setOpen(true);
					}
				}}
				className="press flex h-11 min-w-0 max-w-full items-center gap-2.5 rounded-pill bg-surface ps-2 pe-4 font-display text-base font-medium text-ink hover:bg-sunken"
			>
				{site ? (
					<SiteAvatar name={site.name} hue={hue ?? current?.hue} />
				) : (
					<span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-tenant">
						<Icon name="SquaresFour" size={14} />
					</span>
				)}
				<span className="truncate">{site ? site.name : allLabel}</span>
				{site && <span className="hidden font-sans text-sm font-normal text-ink-4 xl:inline">{site.domain}</span>}
				{!!current?.needsMe && (
					<span className="tabular hidden h-5 items-center rounded-pill bg-human-soft px-1.5 font-display text-xs text-human-ink sm:inline-flex">
						<span className="sr-only">, </span>
						{current.needsMe}
						<span className="sr-only"> need you</span>
					</span>
				)}
				<Icon name="CaretDown" size={13} className="shrink-0 text-ink-3" />
			</button>
			{open && (
				<div
					id={id}
					role="dialog"
					aria-label="Switch site"
					className="absolute start-0 top-full z-(--c-z-dropdown) mt-2 flex max-h-[min(560px,calc(100dvh-96px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-float"
				>
					<div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line-2 px-4">
						<Icon name="MagnifyingGlass" size={16} className="text-ink" />
						<input
							ref={input}
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "ArrowDown") moveRows(e);
								else if (e.key === "Enter" && ordered[0]) {
									e.preventDefault();
									pick(ordered[0].id);
								}
							}}
							placeholder={`Search ${entries.length} site${entries.length === 1 ? "" : "s"}`}
							aria-label="Search sites"
							className="min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-ink-5 focus-visible:shadow-none"
						/>
					</div>
					<div ref={list} onKeyDown={moveRows} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
						{groups.length === 0 && <p className="px-3 py-6 text-center text-md text-ink-3">{entries.length ? `No sites match “${query}”` : "You don't have access to any site yet"}</p>}
						{groups.map((g) => (
							<div key={g.status} role="group" aria-label={g.label} className="flex flex-col pb-1">
								<span aria-hidden className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs text-ink-3">
									{g.label}
									<span className="tabular">{g.rows.length}</span>
								</span>
								{g.rows.map((e) => {
									const on = e.id === site?.id;
									return (
										<button
											key={e.id}
											type="button"
											data-site-row
											aria-current={on ? "true" : undefined}
											onClick={() => pick(e.id)}
											className={clsx(
												"flex min-h-12 items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-start outline-none hover:bg-sunken focus-visible:bg-sunken focus-visible:shadow-none",
												on && "bg-sunken",
											)}
										>
											<SiteAvatar name={e.name} hue={e.hue} />
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="truncate font-display text-md font-medium text-ink">{e.name}</span>
												<span className="truncate text-xs text-ink-3">{e.domain}</span>
											</span>
											{e.role && <span className="inline-flex h-[22px] shrink-0 items-center rounded-pill bg-sunken px-2 font-display text-xs font-medium text-ink-2">{e.role}</span>}
											{!!e.needsMe && (
												<span className="tabular inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-pill bg-human-soft px-1.5 font-display text-xs font-medium text-human-ink">
													{e.needsMe}
													<span className="sr-only"> need you</span>
												</span>
											)}
											{on && <Icon name="Check" size={14} className="shrink-0 text-ink" />}
										</button>
									);
								})}
							</div>
						))}
					</div>
					{(onAllSites || footer) && (
						<div className="flex shrink-0 items-center gap-2 border-t border-line-2 p-2">
							{onAllSites && (
								<button
									type="button"
									onClick={() => {
										setOpen(false);
										onAllSites();
									}}
									className="press inline-flex h-9 items-center gap-1.5 rounded-pill px-3 font-display text-md font-medium text-ink hover:bg-sunken"
								>
									<Icon name="SquaresFour" size={15} />
									All sites
								</button>
							)}
							{footer && (
								// Close after the footer's own click has run (e.g. "Add site" opening its sheet): unmounting the
								// panel while the click is still being handled could swallow the action.
								<span className="ms-auto flex items-center gap-2" onClick={() => setTimeout(() => setOpen(false), 0)}>
									{footer}
								</span>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ---- CommandSearch -------------------------------------------------------

export interface ICommandSearchProps {
	placeholder: string;
	onOpen: () => void;
	/** Listen for ⌘K / Ctrl+K globally (default true). */
	hotkey?: boolean;
	className?: string;
}

export function CommandSearch({ placeholder, onOpen, hotkey = true, className }: ICommandSearchProps) {
	useEffect(() => {
		if (!hotkey) return;
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				onOpen();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [hotkey, onOpen]);
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-haspopup="dialog"
			aria-keyshortcuts="Meta+K Control+K"
			className={clsx(
				"press flex h-11 w-80 max-w-full items-center gap-2.5 rounded-pill bg-surface px-4 text-start font-sans text-md font-normal text-ink-4 hover:bg-sunken",
				className,
			)}
		>
			<Icon name="MagnifyingGlass" size={17} className="text-ink" />
			<span className="min-w-0 flex-1 truncate">{placeholder}</span>
			<Kbd className="hidden sm:inline-flex">⌘K</Kbd>
		</button>
	);
}

// ---- CommandPalette ------------------------------------------------------

export interface ICommandItem {
	id: string;
	label: string;
	hint?: string;
	icon?: TIconName;
	href?: string;
	onSelect?: () => void;
}

export interface ICommandGroup {
	label: string;
	items: ICommandItem[];
}

export interface ICommandPaletteProps {
	open: boolean;
	onClose: () => void;
	groups: ICommandGroup[];
	placeholder?: string;
	className?: string;
}

export function CommandPalette({ open, onClose, groups, placeholder = "Search posts, keywords, runs", className }: ICommandPaletteProps) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [index, setIndex] = useState(0);
	const input = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const restore = useRef<HTMLElement | null>(null);
	const id = useId();

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		return groups
			.map((g) => ({ ...g, items: q ? g.items.filter((it) => `${it.label} ${it.hint ?? ""}`.toLowerCase().includes(q)) : g.items }))
			.filter((g) => g.items.length > 0);
	}, [groups, query]);
	const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

	useEffect(() => {
		if (open) {
			restore.current = document.activeElement as HTMLElement | null;
			setQuery("");
			setIndex(0);
			requestAnimationFrame(() => input.current?.focus());
		} else {
			restore.current?.focus?.();
		}
	}, [open]);

	useEffect(() => setIndex(0), [query]);

	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
	}, [index]);

	const run = useCallback(
		(it: ICommandItem | undefined) => {
			if (!it) return;
			onClose();
			if (it.onSelect) it.onSelect();
			else if (it.href) router.push(it.href);
		},
		[onClose, router],
	);

	if (!open) return null;

	let n = -1;
	return (
		<div className="fixed inset-0 z-(--c-z-modal) flex items-start justify-center bg-scrim px-4 pt-[12vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Command palette"
				className={clsx("flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-3xl bg-surface shadow-sheet", className)}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						e.preventDefault();
						onClose();
					} else if (e.key === "ArrowDown") {
						e.preventDefault();
						setIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
					} else if (e.key === "ArrowUp") {
						e.preventDefault();
						setIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
					} else if (e.key === "Home") {
						e.preventDefault();
						setIndex(0);
					} else if (e.key === "End") {
						e.preventDefault();
						setIndex(Math.max(0, flat.length - 1));
					} else if (e.key === "Enter") {
						e.preventDefault();
						run(flat[index]);
					} else if (e.key === "Tab") {
						e.preventDefault(); // focus stays in the palette input
					}
				}}
			>
				<div className="flex h-14 shrink-0 items-center gap-3 border-b border-line-2 px-5">
					<Icon name="MagnifyingGlass" size={18} className="text-ink" />
					<input
						ref={input}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={placeholder}
						role="combobox"
						aria-expanded="true"
						aria-controls={`${id}-list`}
						aria-activedescendant={flat[index] ? `${id}-opt-${index}` : undefined}
						aria-autocomplete="list"
						className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-5 focus-visible:shadow-none"
					/>
					<Kbd>Esc</Kbd>
				</div>
				<div ref={listRef} id={`${id}-list`} role="listbox" aria-label="Results" className="thin-scrollbar flex-1 overflow-y-auto p-2">
					{flat.length === 0 && <p className="px-3 py-8 text-center text-md text-ink-3">No matches for “{query}”</p>}
					{filtered.map((g) => (
						<div key={g.label} role="group" aria-label={g.label} className="flex flex-col py-1">
							<span aria-hidden className="px-3 pb-1 pt-2 text-xs text-ink-4">
								{g.label}
							</span>
							{g.items.map((it) => {
								n += 1;
								const i = n;
								const on = i === index;
								return (
									<div
										key={it.id}
										id={`${id}-opt-${i}`}
										data-index={i}
										role="option"
										aria-selected={on}
										onPointerMove={() => setIndex(i)}
										onClick={() => run(it)}
										className={clsx("flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3", on ? "bg-sunken" : "")}
									>
										{it.icon && (
											<span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink shadow-card">
												<Icon name={it.icon} size={16} />
											</span>
										)}
										<span className="min-w-0 flex-1 truncate font-display text-base font-medium text-ink">{it.label}</span>
										{it.hint && <span className="shrink-0 text-sm text-ink-4">{it.hint}</span>}
										{on && <Icon name="ArrowRight" size={14} className="text-ink-3" />}
									</div>
								);
							})}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

// ---- AgentStatusPill -----------------------------------------------------

export interface IAgentStatusPillProps {
	running: number;
	onClick?: () => void;
	className?: string;
}

export function AgentStatusPill({ running, onClick, className }: IAgentStatusPillProps) {
	const busy = running > 0;
	const text = busy ? `${running} agent${running === 1 ? "" : "s"} running` : "Agents idle";
	const inner = (
		<>
			<span aria-hidden className={clsx("size-2 shrink-0 rounded-full", busy ? "c-pulse bg-agent shadow-[0_0_0_4px_var(--c-agent-soft)]" : "bg-ink-4")} />
			<span aria-live="polite">{text}</span>
		</>
	);
	const classes = clsx("flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-surface px-4 font-display text-md font-medium text-ink", className);
	return onClick ? (
		<button type="button" onClick={onClick} className={clsx("press hover:bg-sunken", classes)}>
			{inner}
		</button>
	) : (
		<div role="status" className={classes}>
			{inner}
		</div>
	);
}

// ---- PageHeader ----------------------------------------------------------

export interface IPageHeaderProps {
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	back?: { href: string; label: string };
	crumbs?: { label: string; href?: string }[];
	className?: string;
}

export function PageHeader({ title, subtitle, actions, back, crumbs, className }: IPageHeaderProps) {
	return (
		<div className={clsx("flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1 pt-1", className)}>
			<div className="flex min-w-0 flex-col gap-1">
				{back && (
					<Link href={back.href} className="press -ms-1 inline-flex min-h-8 w-fit items-center gap-1.5 rounded-pill px-1 font-display text-md font-medium text-ink-3 hover:text-ink">
						<Icon name="ArrowLeft" size={14} />
						{back.label}
					</Link>
				)}
				{crumbs && crumbs.length > 0 && (
					<nav aria-label="Breadcrumb">
						<ol className="flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
							{crumbs.map((c, i) => {
								const last = i === crumbs.length - 1;
								return (
									<li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
										{i > 0 && <Icon name="CaretRight" size={11} className="text-ink-5" />}
										{c.href && !last ? (
											<Link href={c.href} className="hover:text-ink">
												{c.label}
											</Link>
										) : (
											<span aria-current={last ? "page" : undefined} className={clsx(last && "text-ink")}>
												{c.label}
											</span>
										)}
									</li>
								);
							})}
						</ol>
					</nav>
				)}
				<h1 className="tracking-display leading-display font-display text-3xl font-medium text-ink">{title}</h1>
				{subtitle && <p className="font-sans text-md text-ink-3">{subtitle}</p>}
			</div>
			{actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
		</div>
	);
}

// ---- MobileTabBar --------------------------------------------------------

export interface IMobileTabBarProps {
	items: IRailItem[];
	activeHref: string;
	className?: string;
}

export function MobileTabBar({ items, activeHref, className }: IMobileTabBarProps) {
	return (
		<div className={clsx("pointer-events-none fixed inset-x-0 bottom-0 z-(--c-z-nav) px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]", className)}>
			<nav aria-label="Primary" className="glass-strong pointer-events-auto mx-auto flex h-[60px] max-w-md items-center justify-around rounded-pill px-2 shadow-float">
				{items.slice(0, 5).map((it) => {
					const on = isActive(it.href, activeHref);
					return (
						<Link
							key={it.href}
							href={it.href}
							aria-label={it.dot ? `${it.label} (${TONE_WORD[it.dot]})` : it.label}
							aria-current={on ? "page" : undefined}
							className={clsx("press relative grid size-11 place-items-center rounded-full", on ? "bg-ink text-on-ink" : "text-ink hover:bg-surface")}
						>
							<Icon name={it.icon} size={19} />
							{it.dot && <span aria-hidden className={clsx("absolute end-2 top-2 size-2 rounded-full", TONE_FILL[it.dot])} />}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}

// ---- SplitPane -----------------------------------------------------------

export interface ISplitPaneProps {
	children: ReactNode;
	aside?: ReactNode;
	/** Aside width in px at ≥1024 (default 320). */
	asideWidth?: number;
	/** Accessible name for the aside region. */
	asideLabel?: string;
	className?: string;
}

export function SplitPane({ children, aside, asideWidth = 320, asideLabel, className }: ISplitPaneProps) {
	return (
		<div className={clsx("flex min-h-0 flex-1 flex-col gap-4 lg:flex-row", className)} style={{ "--aside-w": `${asideWidth}px` } as CSSProperties}>
			<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{children}</div>
			{aside && (
				<aside aria-label={asideLabel} className="flex min-h-0 w-full shrink-0 flex-col gap-4 lg:w-(--aside-w)">
					{aside}
				</aside>
			)}
		</div>
	);
}
