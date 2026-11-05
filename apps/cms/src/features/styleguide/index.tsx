"use client";

// /styleguide — the design system's verification harness (docs/design-system.md §14, UXER 05).
// Every inventory component renders under <Kit name="…"> ([data-kit]); src/ds/ds.test.ts asserts the
// set covers docs/uxer/uxer-output.json → components. Fixtures come from the Lumen Dental seed via useCms().
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
	AgentBadge,
	AgentDiff,
	AgentStatusPill,
	ApprovalQueueItem,
	AssertionList,
	Avatar,
	AvatarStack,
	BudgetCard,
	Button,
	CalendarWeekGrid,
	Callout,
	CandidateGrid,
	Card,
	CardHeader,
	Checkbox,
	Chip,
	CIStatus,
	CommandPalette,
	CommandSearch,
	CommentThread,
	Composer,
	ConcentrationGauge,
	DataGap,
	DataTable,
	Dialog,
	Divider,
	Dot,
	EmptyState,
	FactHighlight,
	FactMarkerCard,
	FileDrop,
	GateChecklist,
	HumanBadge,
	Icon,
	IconButton,
	IconRail,
	Kbd,
	KasRow,
	KasTable,
	KeyValue,
	LedgerItem,
	LockedAction,
	ManifestMappingRow,
	Menu,
	Meter,
	MobileTabBar,
	MRPreview,
	OriginTag,
	OutputFormatPicker,
	OverrideReason,
	PageHeader,
	PaginationDots,
	PillarMatrix,
	PipelineColumn,
	PostCard,
	ProgressBar,
	PromptEditor,
	ProvenanceCard,
	ProviderBadge,
	RailButton,
	ReadinessGrid,
	ROLE_LABEL,
	RoleGate,
	RunRow,
	ScheduleRow,
	ScopeNote,
	Section,
	SegmentedControl,
	Select,
	Sheet,
	ShareBar,
	SiteSwitcher,
	Skeleton,
	SlotRow,
	SourceCodeFrame,
	SourceNote,
	Sparkline,
	SplitPane,
	StatStrip,
	StatTile,
	StateChip,
	StatusLight,
	Stepper,
	Tabs,
	TemplatePreview,
	TextArea,
	TextField,
	Timeline,
	Toggle,
	Tooltip,
	TopBar,
	TrajectoryChart,
	useToast,
	VersionList,
	type ICalendarWeek,
	type IDataTableSort,
	type TIconName,
	type TWash,
} from "@/ds";
import { estimateRun, evaluateGate, fmtUsd, pillarDistribution, POST_STATES, rankingKeywords, stateTone } from "@/lib/logic";
import { activeManifest, useCms, useStats, useToasts } from "@/lib/store";
import type { IGateCheck, IImageSlot, IPost, IRun, ITemplateManifest, TPostState, TRole, TTone } from "@/lib/types";
import { FOUNDATION_SECTIONS, Foundations } from "./foundations";
import { FrameDemo, RAIL } from "./frame-demo";

// ---- Harness primitives ----------------------------------------------------

function Kit({ name, note, children, wide }: { name: string; note?: string; children: ReactNode; wide?: boolean }) {
	return (
		<section id={`kit-${name}`} data-kit={name} aria-labelledby={`kit-${name}-h`} className={wide ? "col-span-full scroll-mt-6" : "min-w-0 scroll-mt-6"}>
			<div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
				<h3 id={`kit-${name}-h`} className="font-mono text-md text-ink">
					{name}
				</h3>
				{note && <span className="text-xs text-ink-3">{note}</span>}
			</div>
			<div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-canvas p-4">{children}</div>
		</section>
	);
}

function Group({ id, title, file, children }: { id: string; title: string; file: string; children: ReactNode }) {
	return (
		<section id={id} data-group={title} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-5">
			<div className="flex flex-wrap items-baseline gap-x-3 border-b border-line-3 pb-2">
				<h2 id={`${id}-h`} className="text-2xl tracking-display">
					{title}
				</h2>
				<code className="font-mono text-xs text-ink-3">{file}</code>
			</div>
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">{children}</div>
		</section>
	);
}

/** Row of labelled variants inside a Kit. */
function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			{label && <span className="text-xs text-ink-3">{label}</span>}
			<div className={className ?? "flex flex-wrap items-center gap-2.5"}>{children}</div>
		</div>
	);
}

/** Contains position:fixed children (transform creates a containing block). */
function Frame({ height = 220, children, glass }: { height?: number; children: ReactNode; glass?: boolean }) {
	return (
		<div className="relative overflow-hidden rounded-xl bg-canvas" style={{ height, transform: "translateZ(0)" }}>
			{glass && <span aria-hidden className="wash-orb -start-20 -top-24 size-72 bg-wash-blue" style={{ filter: "blur(50px)" }} />}
			{glass && <span aria-hidden className="wash-orb -end-20 -bottom-24 size-72 bg-wash-peach" style={{ filter: "blur(50px)" }} />}
			{children}
		</div>
	);
}

/** Store toasts → DS toasts (same bridge as the AppShell), so store actions show their Undo toasts here. */
function ToastBridge() {
	const toasts = useToasts();
	const { actions } = useCms();
	const { toast } = useToast();
	const seen = useRef(new Set<string>());
	useEffect(() => {
		for (const t of toasts) {
			if (seen.current.has(t.id)) continue;
			seen.current.add(t.id);
			toast({ title: t.text, tone: t.tone, action: t.undo ? { label: "Undo", onClick: () => actions.undo() } : undefined });
			actions.dismissToast(t.id);
		}
	}, [toasts, toast, actions]);
	return null;
}

const SAMPLE_HTML = `<article class="post">
  <header class="post__header">
    <p class="post__eyebrow">General</p>
    <h1 class="post__title">Root canal recovery</h1>
  </header>
  <figure class="post-media">
    <img src="/images/blog/hero.webp" alt="" />
  </figure>
  <div class="post__body">
    <h2 class="post__heading">The first 24 hours</h2>
    <p>Most people feel tender for two to three days.</p>
    <ul class="post__list"><li>Take ibuprofen</li></ul>
  </div>
  <script type="application/ld+json">{}</script>
</article>`;

const ICON_SAMPLE: TIconName[] = ["Kanban", "NotePencil", "ImagesSquare", "BracketsAngle", "SealCheck", "ChartLineUp", "Sparkle", "Robot", "Hand", "UserFocus", "HourglassMedium", "LockSimple", "GitPullRequest", "Fingerprint", "Plugs", "Tooth"];

const ROLES: TRole[] = ["specialist", "developer", "stakeholder", "admin"];

type TFive = "loaded" | "empty" | "loading" | "error" | "denied";

// ---- Page -----------------------------------------------------------------

export function Styleguide({ frame, wash }: { frame?: string; wash?: string }) {
	if (frame === "app") return <FrameDemo wash={(wash as TWash) || "blue-peach"} />;
	return (
		<>
			<ToastBridge />
			<StyleguideBody />
		</>
	);
}

function useNavIndex(): { id: string; title: string; kits: string[] }[] {
	const [index, setIndex] = useState<{ id: string; title: string; kits: string[] }[]>([]);
	useEffect(() => {
		const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-group]"));
		setIndex(groups.map((g) => ({ id: g.id, title: g.dataset.group ?? g.id, kits: Array.from(g.querySelectorAll<HTMLElement>("[data-kit]")).map((k) => k.dataset.kit ?? "") })));
	}, []);
	return index;
}

function StyleguideBody() {
	const index = useNavIndex();
	const total = index.reduce((n, g) => n + g.kits.length, 0);
	return (
		<div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
			<aside className="border-b border-line-2 bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-e lg:border-b-0">
				<nav aria-label="Styleguide index" className="thin-scrollbar flex gap-4 overflow-x-auto p-4 lg:h-full lg:flex-col lg:gap-5 lg:overflow-y-auto lg:p-5">
					<div className="hidden flex-col gap-0.5 lg:flex">
						<span className="font-display text-lg">Agentic CMS</span>
						<span className="text-sm text-ink-3">Design system · {total || 95} kits</span>
					</div>
					<div className="flex shrink-0 flex-col gap-1">
						<a href="#sg-foundations" className="font-display text-md text-ink hover:underline">
							Foundations
						</a>
						<ul className="hidden flex-col gap-0.5 lg:flex">
							{FOUNDATION_SECTIONS.map((s) => (
								<li key={s.id}>
									<a href={`#${s.id}`} className="block rounded-xs py-0.5 text-sm text-ink-3 hover:text-ink">
										{s.label}
									</a>
								</li>
							))}
						</ul>
					</div>
					{index.map((g) => (
						<div key={g.id} className="flex shrink-0 flex-col gap-1">
							<a href={`#${g.id}`} className="font-display text-md text-ink hover:underline">
								{g.title} <span className="tabular text-xs text-ink-3">{g.kits.length}</span>
							</a>
							<ul className="hidden flex-col gap-0.5 lg:flex">
								{g.kits.map((k) => (
									<li key={k}>
										<a href={`#kit-${k}`} className="block truncate rounded-xs py-0.5 font-mono text-xs text-ink-3 hover:text-ink">
											{k}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
					<a href="#sg-states" className="shrink-0 font-display text-md text-ink hover:underline">
						Five states
					</a>
				</nav>
			</aside>
			<main className="flex min-w-0 flex-col gap-14 overflow-x-clip px-4 py-8 md:px-8 lg:px-10">
				<header className="flex flex-col gap-2">
					<span className="text-sm text-ink-3">apps/cms · /styleguide</span>
					<h1 className="text-3xl tracking-display">Agentic CMS design system</h1>
					<p className="max-w-[80ch] text-md text-ink-3">
						The verification harness for docs/design-system.md. Every component in the UXER inventory renders below with its variants and states, using live Lumen Dental data from the demo store (not persisted — play freely). Hover, focus and click everything.
					</p>
				</header>
				<section id="sg-foundations" aria-label="Foundations" className="scroll-mt-6">
					<Foundations />
				</section>
				<ShellKits />
				<ControlKits />
				<SurfaceKits />
				<ChartKits />
				<DomainKits />
				<FiveStates />
			</main>
		</div>
	);
}

// ---- A. Shell --------------------------------------------------------------

function IframeFrame({ src, w, h, scale, title }: { src: string; w: number; h: number; scale: number; title: string }) {
	return (
		<div className="flex flex-col gap-1.5">
			<span className="tabular text-xs text-ink-3">
				{w} × {h} · {Math.round(scale * 100)}%
			</span>
			<div className="overflow-hidden rounded-xl border border-line-2 bg-page" style={{ width: w * scale, height: h * scale }}>
				<iframe src={src} title={title} loading="lazy" className="block border-0" style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0" }} />
			</div>
		</div>
	);
}

function ShellKits() {
	const { state, site, data } = useCms();
	const stats = useStats();
	const [wash, setWash] = useState<TWash>("blue-peach");
	const [siteId, setSiteId] = useState(site.id);
	const [palette, setPalette] = useState(false);
	const shown = state.sites.find((s) => s.id === siteId) ?? site;
	const groups = useMemo(
		() => [
			{ label: "Posts", items: data.posts.filter((p) => p.state === "in-review" || p.state === "drafting").map((p) => ({ id: p.id, label: p.title, hint: p.state === "in-review" ? "In review" : "Drafting", icon: "NotePencil" as TIconName, onSelect: () => {} })) },
			{ label: "Keywords", items: rankingKeywords(data.keywords).slice(0, 4).map((k) => ({ id: k.id, label: k.term, hint: `${k.kasShare.toFixed(1)}% KAS`, icon: "Target" as TIconName, onSelect: () => {} })) },
			{ label: "Go to", items: RAIL.map((r) => ({ id: r.href, label: r.label, icon: r.icon, onSelect: () => {} })) },
		],
		[data],
	);
	return (
		<Group id="sg-shell" title="Shell" file="src/ds/shell.tsx">
			<Kit name="AppFrame" note="Real breakpoints via iframes (?frame=app) · one glass shell per viewport" wide>
				<SegmentedControl
					className="no-scrollbar max-w-full overflow-x-auto"
					label="Wash"
					size="sm"
					value={wash}
					onChange={setWash}
					options={(["blue-peach", "blue", "peach", "green", "neutral"] as TWash[]).map((w) => ({ value: w, label: w }))}
				/>
				<div className="thin-scrollbar flex flex-wrap items-start gap-5 overflow-x-auto">
					<IframeFrame src={`/styleguide?frame=app&wash=${wash}`} w={1440} h={900} scale={0.5} title="AppFrame at 1440 by 900" />
					<IframeFrame src={`/styleguide?frame=app&wash=${wash}`} w={390} h={844} scale={0.5} title="AppFrame at 390 by 844" />
				</div>
			</Kit>
			<Kit name="IconRail" note="Mark · lifecycle items · settings footer; hover for tooltips">
				<Frame height={440} glass>
					<div className="glass absolute inset-3 flex rounded-shell p-3">
						<IconRail items={RAIL} activeHref="/approvals" footer={<IconButton icon="GearSix" label="Settings" />} />
					</div>
				</Frame>
			</Kit>
			<Kit name="RailButton" note="default · hover · active · human dot · block dot">
				<Row>
					<RailButton href="/plan" icon="Kanban" label="Content plan" />
					<RailButton href="/plan" icon="Kanban" label="Content plan (active)" active />
					<RailButton href="/assets" icon="ImagesSquare" label="Image pipeline" dot="human" />
					<RailButton href="/approvals" icon="SealCheck" label="Approvals" dot="block" />
					<RailButton href="/seo" icon="ChartLineUp" label="SEO trajectory" dot="agent" />
				</Row>
			</Kit>
			<Kit name="TopBar" note="44px pills, gap 10, flex-1 spacer" wide>
				<TopBar>
					<SiteSwitcher site={shown} sites={state.sites} onChange={setSiteId} />
					<CommandSearch placeholder="Search posts, keywords, runs" onOpen={() => setPalette(true)} hotkey={false} />
					<div className="flex-1" />
					<AgentStatusPill running={stats.agentsRunning} />
					<IconButton icon="BellSimple" label="Notifications" dot="human" />
					<Avatar name="Tolu B." initials="TB" size={44} />
				</TopBar>
			</Kit>
			<Kit name="SiteSwitcher" note="Tenant bubble + name + domain → Menu (local state here)">
				<Row>
					<SiteSwitcher site={shown} sites={state.sites} onChange={setSiteId} />
				</Row>
				<span className="text-sm text-ink-3">
					Selected: {shown.name} · {shown.domain}
				</span>
			</Kit>
			<Kit name="CommandSearch" note="⌘K / Ctrl+K opens the palette on this page">
				<CommandSearch placeholder="Search posts, keywords, runs" onOpen={() => setPalette(true)} />
			</Kit>
			<Kit name="CommandPalette" note="Filter · ↑↓ · Enter · Esc">
				<Row>
					<Button variant="secondary" icon="MagnifyingGlass" onClick={() => setPalette(true)}>
						Open palette
					</Button>
				</Row>
				<CommandPalette open={palette} onClose={() => setPalette(false)} groups={groups} />
			</Kit>
			<Kit name="AgentStatusPill" note="running · single · idle · clickable">
				<Row>
					<AgentStatusPill running={stats.agentsRunning} />
					<AgentStatusPill running={1} />
					<AgentStatusPill running={0} />
					<AgentStatusPill running={2} onClick={() => {}} />
				</Row>
			</Kit>
			<Kit name="PageHeader" note="plain · back + crumbs + actions" wide>
				<PageHeader title="Content plan" subtitle="Lumen Dental · week 39 · 3 of 4 posts shipped" actions={<Button icon="Plus">New idea</Button>} />
				<Divider />
				<PageHeader
					back={{ href: "/plan", label: "Content plan" }}
					crumbs={[{ label: "Posts", href: "/plan" }, { label: "General", href: "/plan" }, { label: "root canal recovery" }]}
					title="root canal recovery: what to expect"
					subtitle="In review · 2 days · v4 by Tolu B."
					actions={
						<>
							<Button variant="secondary" icon="ArrowUUpLeft">
								Send back
							</Button>
							<LockedAction label="Approve" reasons={["1 unresolved fact marker", "Keyword missing from first 100 words"]} />
						</>
					}
				/>
			</Kit>
			<Kit name="MobileTabBar" note="Glass bar, 5 items, safe area (< 1024 only in the app)">
				<Frame height={130} glass>
					<MobileTabBar items={RAIL.slice(0, 5)} activeHref="/assets" />
				</Frame>
			</Kit>
			<Kit name="SplitPane" note="Main + 320 aside ≥ 1024; stacks below">
				<SplitPane asideWidth={160} asideLabel="Demo aside" aside={<Card className="h-24 text-sm text-ink-3">Aside · 160</Card>}>
					<Card className="h-24 text-sm text-ink-3">Main column</Card>
				</SplitPane>
			</Kit>
		</Group>
	);
}

// ---- B. Controls -----------------------------------------------------------

function ControlKits() {
	const { toast } = useToast();
	const gate = useGate("p-root-canal");
	const [seg, setSeg] = useState<"board" | "calendar" | "matrix">("board");
	const [segSm, setSegSm] = useState<"desktop" | "mobile" | "tablet">("desktop");
	const [tab, setTab] = useState("general");
	const [q, setQ] = useState("");
	const [seo, setSeo] = useState("Root Canal Recovery: What to Expect Day by Day");
	const [longSeo, setLongSeo] = useState("Root Canal Recovery in Lagos: What to Expect, Day by Day, From Our Clinicians");
	const [note, setNote] = useState("");
	const [sel, setSel] = useState<string | null>("workhorse");
	const [checks, setChecks] = useState({ a: true, b: false });
	const [tog, setTog] = useState({ a: true, b: false });
	const [chips, setChips] = useState(["Orthodontics", "Implants", "Cosmetic"]);
	const [compose, setCompose] = useState("");
	const [busy, setBusy] = useState(false);
	const [file, setFile] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const tones: TTone[] = ["neutral", "ink", "agent", "human", "block", "pass", "info"];

	return (
		<Group id="sg-controls" title="Controls" file="src/ds/controls.tsx">
			<Kit name="Icon" note="Registry names only · sizes · weights">
				<Row>
					{ICON_SAMPLE.map((n) => (
						<Tooltip key={n} label={n}>
							<span tabIndex={0} className="grid size-10 place-items-center rounded-full bg-surface">
								<Icon name={n} size={18} label={n} />
							</span>
						</Tooltip>
					))}
				</Row>
				<Row label="14 · 18 · 24 · regular / bold / fill">
					<Icon name="SealCheck" size={14} />
					<Icon name="SealCheck" size={18} />
					<Icon name="SealCheck" size={24} />
					<Icon name="SealCheck" size={24} weight="bold" />
					<Icon name="SealCheck" size={24} weight="fill" />
				</Row>
			</Kit>
			<Kit name="Button" note="One primary per region · hover · press · disabled · loading">
				<Row label="Variants (md)">
					<Button icon="SealCheck">Approve</Button>
					<Button variant="secondary">Send back</Button>
					<Button variant="ghost">Cancel</Button>
					<Button variant="glass" icon="Eye">
						Preview
					</Button>
					<Button variant="danger" icon="Trash">
						Delete idea
					</Button>
					<Button variant="agent" icon="Sparkle">
						Rewrite without it
					</Button>
				</Row>
				<Row label="Sizes · trailing · link">
					<Button size="sm" variant="secondary">
						Small
					</Button>
					<Button size="md" variant="secondary">
						Medium
					</Button>
					<Button size="lg" variant="secondary" trailing={<Icon name="ArrowRight" size={16} />}>
						Large
					</Button>
					<Button variant="ghost" href="/plan" icon="Kanban">
						As link
					</Button>
				</Row>
				<Row label="States">
					<Button variant="secondary" loading={loading} onClick={() => (setLoading(true), setTimeout(() => setLoading(false), 1600))}>
						{loading ? "Opening MR…" : "Click to load"}
					</Button>
					<Button variant="secondary" loading>
						Generating
					</Button>
					<Button variant="secondary" disabled>
						Disabled
					</Button>
					<Button variant="agent" disabled>
						Agent disabled
					</Button>
				</Row>
				<span className="text-xs text-ink-3">A disabled primary never appears alone — use LockedAction so the reason shows inline (P4).</span>
			</Kit>
			<Kit name="IconButton" note="44 round (sm 32 with 44 hit) · aria label required">
				<Row label="white · ink · ghost · outline">
					<IconButton icon="BellSimple" label="Notifications" />
					<IconButton icon="Plus" label="New idea" variant="ink" />
					<IconButton icon="DotsThree" label="More" variant="ghost" />
					<IconButton icon="ArrowUpRight" label="Open" variant="outline" size="sm" />
				</Row>
				<Row label="dot · loading · disabled · sm">
					<IconButton icon="BellSimple" label="Notifications (waiting on you)" dot="human" />
					<IconButton icon="SealCheck" label="Approvals (blocked)" dot="block" />
					<IconButton icon="ArrowsClockwise" label="Regenerating" loading />
					<IconButton icon="Trash" label="Delete (disabled)" disabled />
					<IconButton icon="X" label="Close" size="sm" variant="ghost" />
				</Row>
			</Kit>
			<Kit name="SegmentedControl" note="White track · active ink pill · arrow keys">
				<SegmentedControl
					label="Plan view"
					value={seg}
					onChange={setSeg}
					options={[
						{ value: "board", label: "Board", icon: "Kanban" },
						{ value: "calendar", label: "Calendar", icon: "CalendarBlank" },
						{ value: "matrix", label: "Pillar matrix", icon: "GridFour" },
					]}
				/>
				<SegmentedControl
					label="Device"
					size="sm"
					value={segSm}
					onChange={setSegSm}
					options={[
						{ value: "desktop", label: "Desktop", icon: "Desktop" },
						{ value: "mobile", label: "Mobile", icon: "DeviceMobile" },
						{ value: "tablet", label: "Tablet", disabled: true },
					]}
				/>
			</Kit>
			<Kit name="Tabs" note="Text tabs · counts · ink active">
				<Tabs
					value={tab}
					onChange={setTab}
					label="Settings"
					tabs={[
						{ id: "general", label: "General" },
						{ id: "members", label: "Members", count: 4 },
						{ id: "budgets", label: "Budgets" },
						{ id: "routing", label: "Routing", count: 6 },
					]}
				/>
			</Kit>
			<Kit name="TextField" note="default · icon + suffix · counter · over · error · disabled">
				<TextField label="Search" value={q} onChange={setQ} placeholder="Find a keyword" icon="MagnifyingGlass" hideLabel />
				<TextField label="SEO title" value={seo} onChange={setSeo} counter={{ value: seo.length, max: 60 }} hint="Front-load the keyword." />
				<TextField label="SEO title (over)" value={longSeo} onChange={setLongSeo} counter={{ value: longSeo.length, max: 60 }} />
				<TextField label="Source URL" value="nhs.uk/root-canal" onChange={() => {}} error="Enter a full https:// URL" />
				<TextField label="Monthly text cap" value="200" onChange={() => {}} suffix="USD" disabled hint="Only an admin can change caps." />
			</Kit>
			<Kit name="TextArea" note="default · error">
				<TextArea label="Send-back note" value={note} onChange={setNote} placeholder="What should the writer change?" rows={3} counter={{ value: note.length, max: 280 }} />
				<TextArea label="Override reason" value="ok" onChange={() => {}} rows={2} error="At least 20 characters — this goes in the MR." />
			</Kit>
			<Kit name="Select" note="value · placeholder · hint · disabled">
				<Row>
					<Select
						label="Model tier"
						value={sel}
						onChange={setSel}
						options={[
							{ value: "fast", label: "Fast", hint: "Mechanical edits" },
							{ value: "workhorse", label: "Workhorse", hint: "Drafting" },
							{ value: "strongest", label: "Strongest", hint: "Pillar & money pages" },
						]}
					/>
					<Select label="Pillar" value={null} onChange={() => {}} placeholder="Choose pillar" icon="Stack" options={[{ value: "p-general", label: "General" }]} />
					<Select label="Provider" value="higgsfield" onChange={() => {}} disabled options={[{ value: "higgsfield", label: "Flux via MCP" }]} />
				</Row>
			</Kit>
			<Kit name="Checkbox" note="checked · unchecked · description · disabled">
				<Checkbox checked={checks.a} onChange={(a) => setChecks((c) => ({ ...c, a }))} label="Email me when a post reaches review" />
				<Checkbox checked={checks.b} onChange={(b) => setChecks((c) => ({ ...c, b }))} label="Include decaying posts" description="Refresh cycle picks these up on Mondays." />
				<Checkbox checked onChange={() => {}} label="Log overrides to the audit trail" description="Always on" disabled />
			</Kit>
			<Kit name="Toggle" note="on · off · caption · disabled">
				<Toggle checked={tog.a} onChange={(a) => setTog((t) => ({ ...t, a }))} label="Keyword swarm" caption="Monday weekly · new ideas in the plan" />
				<Toggle checked={tog.b} onChange={(b) => setTog((t) => ({ ...t, b }))} label="Link prospecting" />
				<Toggle checked onChange={() => {}} label="Technical monitor" caption="Admin only" disabled />
			</Kit>
			<Kit name="Chip" note="7 tones · sm/md · icon · removable">
				<Row label="md">
					{tones.map((t) => (
						<Chip key={t} tone={t}>
							{t}
						</Chip>
					))}
				</Row>
				<Row label="sm + icon (glyph + text, never color alone)">
					<Chip size="sm">Orthodontics</Chip>
					<Chip size="sm" tone="ink">
						Pillar
					</Chip>
					<Chip size="sm" tone="agent" icon="Sparkle">
						KAS gap
					</Chip>
					<Chip size="sm" tone="human" icon="Hand">
						Human-only
					</Chip>
					<Chip size="sm" tone="block" icon="LockSimple">
						2 hard blocks
					</Chip>
					<Chip size="sm" tone="pass" icon="CheckCircle">
						Live
					</Chip>
				</Row>
				<Row label="Removable">
					{chips.map((c) => (
						<Chip key={c} onRemove={() => setChips((xs) => xs.filter((x) => x !== c))} removeLabel={`Remove ${c}`}>
							{c}
						</Chip>
					))}
					{chips.length === 0 && (
						<Button size="sm" variant="ghost" onClick={() => setChips(["Orthodontics", "Implants", "Cosmetic"])}>
							Reset
						</Button>
					)}
				</Row>
			</Kit>
			<Kit name="Dot" note="plain · ring · pulse (agent only)">
				<Row>
					{tones.map((t) => (
						<span key={t} className="flex items-center gap-1.5 text-xs text-ink-3">
							<Dot tone={t} label={t} />
							{t}
						</span>
					))}
				</Row>
				<Row>
					<Dot tone="human" ring label="Waiting on you" />
					<Dot tone="block" ring label="Blocked" />
					<Dot tone="agent" pulse label="Agent running" />
				</Row>
			</Kit>
			<Kit name="Kbd">
				<Row>
					<Kbd>⌘K</Kbd>
					<Kbd>Esc</Kbd>
					<Kbd>Enter</Kbd>
					<Kbd>↑</Kbd>
					<Kbd>↓</Kbd>
				</Row>
			</Kit>
			<Kit name="Menu" note="Popover r-18 · tone item · disabled item · arrow keys">
				<Row>
					<Menu
						trigger={
							<Button variant="secondary" trailing={<Icon name="CaretDown" size={13} />}>
								Post actions
							</Button>
						}
						items={[
							{ id: "open", label: "Open in editor", icon: "NotePencil", onSelect: () => toast({ title: "Opening editor" }) },
							{ id: "week", label: "Move to week 40", icon: "CalendarBlank", onSelect: () => toast({ title: "Moved to W40", action: { label: "Undo", onClick: () => {} } }) },
							{ id: "gen", label: "Generate now", icon: "Sparkle", tone: "agent", onSelect: () => toast({ title: "Writer agent started", tone: "agent" }) },
							{ id: "merge", label: "Merge (developer)", icon: "GitMerge", disabled: true, onSelect: () => {} },
							{ id: "del", label: "Delete idea", icon: "Trash", tone: "block", onSelect: () => toast({ title: "Idea deleted", tone: "block" }) },
						]}
					/>
					<Menu label="More" align="end" trigger={<Icon name="DotsThree" size={20} />} items={[{ id: "copy", label: "Copy link", icon: "Copy", onSelect: () => {} }]} />
				</Row>
			</Kit>
			<Kit name="Tooltip" note="top · bottom · end · focus opens">
				<Row>
					<Tooltip label="Top tooltip">
						<Button variant="secondary" size="sm">
							Top
						</Button>
					</Tooltip>
					<Tooltip label="Bottom tooltip" side="bottom">
						<Button variant="secondary" size="sm">
							Bottom
						</Button>
					</Tooltip>
					<Tooltip label="Content plan" side="end">
						<Button variant="secondary" size="sm">
							End
						</Button>
					</Tooltip>
				</Row>
			</Kit>
			<Kit name="Composer" note="white on glass · sunken in card · busy">
				<Composer
					placeholder="Tell the agent what to change"
					value={compose}
					onChange={setCompose}
					suggestions={["tighten this section", "add an FAQ", "cite a source"]}
					onSubmit={(v) => {
						setBusy(true);
						setCompose("");
						setTimeout(() => {
							setBusy(false);
							toast({ title: `Agent edit ready · “${v}”`, tone: "agent" });
						}, 1400);
					}}
					busy={busy}
					onMic={() => toast({ title: "Dictation isn't in the prototype" })}
				/>
				<Card>
					<Composer placeholder="Ask about this draft" value="" onChange={() => {}} onSubmit={() => {}} surface="sunken" />
				</Card>
				<Composer placeholder="Working…" value="add an FAQ" onChange={() => {}} onSubmit={() => {}} busy />
			</Kit>
			<Kit name="FileDrop" note="idle · drag-over (drag a file) · disabled">
				<FileDrop accept=".html,.zip" title="Drop your blog template" hint={file ? `Received ${file}` : "HTML file or a ZIP of the site · up to 20 MB"} onFile={(f) => setFile(f.name)} />
				<FileDrop accept=".html,.zip" title="Upload disabled" hint="Only a developer can ingest templates." onFile={() => {}} disabled />
			</Kit>
			<Kit name="Stepper" note="done · current · upcoming">
				<Stepper
					current={2}
					steps={[
						{ id: "u", label: "Upload" },
						{ id: "p", label: "Parse" },
						{ id: "c", label: "Confirm" },
						{ id: "v", label: "Versioned" },
					]}
				/>
				<Stepper
					current={4}
					steps={[
						{ id: "u", label: "Upload" },
						{ id: "p", label: "Parse" },
						{ id: "c", label: "Confirm" },
						{ id: "v", label: "Versioned" },
					]}
				/>
			</Kit>
			<Kit name="LockedAction" note="locked (hover/click for reasons) · unlocked · loading · sm">
				<Row>
					<LockedAction label="Approve" icon="SealCheck" reasons={gate?.hard.length ? gate.hard : ["1 unresolved fact marker"]} />
					<LockedAction label="Merge" icon="GitMerge" size="sm" reasons={["Your role (Specialist) can't merge"]} />
				</Row>
				<Row>
					<LockedAction label="Approve" icon="SealCheck" reasons={[]} unlocked onClick={() => toast({ title: "Approved · MR opened", tone: "pass" })} />
					<LockedAction label="Approving" icon="SealCheck" reasons={[]} unlocked loading size="sm" />
				</Row>
			</Kit>
		</Group>
	);
}

// ---- Shared fixture helpers ------------------------------------------------

function useGate(postId: string) {
	const { data } = useCms();
	return useMemo(() => {
		const post = data.posts.find((p) => p.id === postId);
		if (!post) return null;
		return evaluateGate(post, data.slots.filter((s) => s.postId === postId), activeManifest(data));
	}, [data, postId]);
}

function useFixtures() {
	const cms = useCms();
	const { data } = cms;
	const post = (id: string) => data.posts.find((p) => p.id === id) as IPost;
	const pillar = (id: string) => data.pillars.find((p) => p.id === id);
	const keyword = (id: string) => data.keywords.find((k) => k.id === id);
	const slotsOf = (postId: string) => data.slots.filter((s) => s.postId === postId);
	const blocksOf = (p: IPost) => evaluateGate(p, slotsOf(p.id), activeManifest(data)).hard;
	return { ...cms, post, pillar, keyword, slotsOf, blocksOf };
}

// ---- C. Surfaces -----------------------------------------------------------

function SurfaceKits() {
	const { data, state, site, pillar } = useFixtures();
	const stats = useStats();
	const { toast } = useToast();
	const [active, setActive] = useState("in-review");
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState<IDataTableSort>({ key: "cost", dir: "desc" });
	const [sheet, setSheet] = useState<null | "end" | "bottom">(null);
	const [dialog, setDialog] = useState(false);
	const runs = useMemo(() => {
		const rows = [...data.runs].slice(0, 7);
		const dir = sort.dir === "asc" ? 1 : -1;
		return rows.sort((a, b) => (sort.key === "cost" ? (a.costUsd - b.costUsd) * dir : a.agent.localeCompare(b.agent) * dir));
	}, [data.runs, sort]);
	const people = state.members.map((m) => ({ name: m.name, initials: m.initials }));
	const people6 = [...people, { name: "Chidi N.", initials: "CN" }, { name: "Funke A.", initials: "FA" }];
	const northwind = state.sites.find((s) => s.searchConsole !== "connected");
	const toneRow: TTone[] = ["agent", "human", "block", "pass", "info", "neutral"];
	const toneTitle: Record<string, string> = {
		agent: "The writer agent is drafting section 4 of 7",
		human: "Clinic reception photo is human-only · waiting on you",
		block: "1 unresolved fact marker · can't override",
		pass: "All 12 on-page checks pass",
		info: "Refresh cycle · this post was last updated 94 days ago",
		neutral: "Scheduled for week 40",
	};

	return (
		<Group id="sg-surfaces" title="Surfaces" file="src/ds/surfaces.tsx">
			<Kit name="Card" note="solid · glass · sunken · outline · ink · interactive (hover) · selected">
				<Frame height={260} glass>
					<div className="absolute inset-3 grid grid-cols-2 gap-2.5 overflow-y-auto">
						<Card className="text-sm">Solid · r-22</Card>
						<Card variant="glass" className="text-sm">
							Glass-strong
						</Card>
						<Card variant="sunken" className="text-sm">
							Sunken · inside cards only
						</Card>
						<Card variant="outline" className="text-sm">
							Outline
						</Card>
						<Card variant="ink" className="text-sm">
							Ink
						</Card>
						<Card interactive className="text-sm" tabIndex={0} role="button" aria-label="Interactive card">
							Interactive · hover me
						</Card>
						<Card selected className="text-sm">
							Selected · ink outline
						</Card>
						<Card padding="sm" className="text-sm">
							padding sm
						</Card>
					</div>
				</Frame>
			</Kit>
			<Kit name="CardHeader" note="icon + title + meta · auto ↗ from href · custom action">
				<Card className="flex flex-col gap-3">
					<CardHeader icon="ImagesSquare" title="Image pipeline" meta="2 slots waiting" href="/assets" />
					<CardHeader icon="Target" title="Plan status" action={<Chip size="sm" tone="human" icon="Hand">3 amber</Chip>} />
					<CardHeader title="No icon, no action" />
				</Card>
			</Kit>
			<Kit name="Section" note="Column / section label row">
				<Section title="In review" count={stats.counts["in-review"]} meta={<><Dot tone="human" /> Specialist</>} action={<IconButton icon="Plus" label="Add" size="sm" variant="ghost" />}>
					<Card className="text-sm text-ink-3">Section body</Card>
				</Section>
			</Kit>
			<Kit name="StatStrip" note="human tile = amber (P1) · active = sunken · clickable" wide>
				<StatStrip
					items={POST_STATES.map((s) => ({
						id: s,
						label: s === "needs-assets" ? "Needs assets" : s === "in-review" ? "In review" : s === "mr-open" ? "MR open" : s[0].toUpperCase() + s.slice(1),
						value: stats.counts[s],
						tone: s === "in-review" ? ("human" as TTone) : undefined,
						active: active === s,
						onClick: () => setActive(s),
					}))}
				/>
				<StatStrip items={[{ id: "a", label: "Static · no onClick", value: 12 }, { id: "b", label: "Needs you", value: stats.needsHuman, tone: "human" }, { id: "c", label: "Blocked", value: stats.hardBlocked, tone: "block" }]} />
			</Kit>
			<Kit name="StatTile" note="md · lg · delta tone · source">
				<Card className="flex flex-wrap gap-8">
					<StatTile label="Shipped this week" value={`${stats.cadence.shipped} / ${stats.cadence.target}`} delta={{ value: "−1", tone: "human" }} caption="Cadence target from the plan" />
					<StatTile size="lg" label="Gap to projection" value={stats.gap ? `${stats.gap.pct > 0 ? "+" : "−"}${Math.abs(stats.gap.pct).toFixed(1)}%` : "—"} delta={{ value: "W39", tone: "neutral" }} />
				</Card>
				<SourceNote>Search Console · lags 2–3 days</SourceNote>
			</Kit>
			<Kit name="KeyValue" note="default · dense">
				<Card className="flex flex-col gap-4">
					<KeyValue rows={[{ k: "Repository", v: site.repo?.repo ?? "Not connected" }, { k: "Base branch", v: site.repo?.baseBranch ?? "—" }, { k: "Cadence", v: `${site.cadenceTarget} posts / week` }]} />
					<Divider />
					<KeyValue dense rows={[{ k: "Format", v: "webp · 1600×900" }, { k: "Breakpoints", v: "640 · 1024 · 1600" }]} />
				</Card>
			</Kit>
			<Kit name="Callout" note="6 tones · with action">
				{toneRow.map((t) => (
					<Callout key={t} tone={t} title={toneTitle[t]} action={t === "human" ? <Button size="sm" variant="secondary">Upload</Button> : undefined}>
						{t === "block" ? "Add a source or let the agent rewrite the sentence without the number." : undefined}
					</Callout>
				))}
			</Kit>
			<Kit name="SourceNote" note="Every metric carries its source (P6)">
				<Row>
					<SourceNote>Search Console · lags 2–3 days</SourceNote>
					<SourceNote icon="ChartBar">Ahrefs · KD, weekly</SourceNote>
					<SourceNote icon="Robot">KAS recalculated after merge · 25 Sep</SourceNote>
				</Row>
			</Kit>
			<Kit name="DataGap" note="Missing connection — never 0 or blank">
				<DataGap
					label={`Sessions for ${northwind?.name ?? "Northwind Legal"}`}
					reason="Search Console isn't connected, so there's no traffic data yet."
					action={
						<Button size="sm" variant="secondary" icon="GoogleLogo">
							Connect
						</Button>
					}
				/>
				<DataGap label="Rank source" reason="No Ahrefs or Semrush key on this site." />
			</Kit>
			<Kit name="EmptyState" note="Exactly one action">
				<Card padding="none">
					<EmptyState icon="Kanban" title="No ideas this week" body="The keyword swarm runs Monday. You can add an idea yourself now." action={<Button icon="Plus">New idea</Button>} />
				</Card>
			</Kit>
			<Kit name="Skeleton" note="Loading · shimmer 1.4s">
				<Card className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading post">
					<Skeleton className="h-5 w-20" radius={999} />
					<Skeleton className="h-4 w-4/5" />
					<Skeleton className="h-3 w-3/5" />
					<Skeleton className="h-24 w-full" radius={16} />
				</Card>
			</Kit>
			<Kit name="ProgressBar" note="agent · pass · human · md · 0 / 100">
				<ProgressBar label="Writing section 4 of 7" value={4 / 7} />
				<ProgressBar tone="pass" size="md" label="12 of 12 checks" value={1} />
				<ProgressBar tone="human" label="Human items done on time" value={0.62} />
				<ProgressBar tone="ink" value={0} />
			</Kit>
			<Kit name="Meter" note="under · ≥ 80% amber · at cap red">
				<Meter label="Text spend" value={site.budgets.textUsd} max={site.budgets.textCapUsd} format={fmtUsd} />
				<Meter label="Image spend" value={172} max={200} format={fmtUsd} />
				<Meter label="Image spend (at cap)" value={200} max={200} format={fmtUsd} />
			</Kit>
			<Kit name="PaginationDots" note="static · interactive">
				<Row>
					<PaginationDots count={4} index={1} />
					<PaginationDots count={5} index={page} onChange={setPage} />
				</Row>
			</Kit>
			<Kit name="Avatar" note="24 · 32 · 44 · tone">
				<Row>
					{state.members.map((m, i) => (
						<Avatar key={m.id} name={m.name} initials={m.initials} size={([24, 32, 44, 32] as const)[i]} />
					))}
					<Avatar name="Writer agent" initials="AI" tone="agent" />
					<Avatar name="Waiting on Dr Ada" initials="AO" tone="human" />
				</Row>
			</Kit>
			<Kit name="AvatarStack" note="fits · +N ink overflow">
				<Row>
					<AvatarStack people={people.slice(0, 3)} />
					<AvatarStack people={people6} max={3} />
				</Row>
			</Kit>
			<Kit name="Timeline" note="Post timeline · tones by actor">
				<Timeline
					items={[
						{ id: "1", icon: "Robot", tone: "agent", title: "Draft v1 by Blog writer agent", meta: "Fri 25 Sep · 09:42", body: "1,488 words · 3 slots · 1 unresolved fact marker" },
						{ id: "2", icon: "PencilSimple", title: "Tolu B. edited the clinic callout", meta: "Fri 25 Sep · 10:38" },
						{ id: "3", icon: "Hand", tone: "human", title: "Waiting on review", meta: "2 days in review" },
						{ id: "4", icon: "XCircle", tone: "block", title: "CI failed on MR !43", meta: "Thu 24 Sep · 16:10" },
						{ id: "5", icon: "CheckCircle", tone: "pass", title: "Merged to main", meta: "Wed 23 Sep · 11:02" },
					]}
				/>
			</Kit>
			<Kit name="DataTable" note="sortable headers · row click · dense · empty" wide>
				<Card>
					<DataTable<IRun>
						caption="Recent runs"
						rows={runs}
						sort={sort}
						onSort={(key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
						onRowClick={(r) => toast({ title: `${r.agent} · ${r.status}` })}
						columns={[
							{ key: "agent", header: "Agent", render: (r) => <span className="font-display">{r.agent}</span> },
							{ key: "output", header: "Output", sortable: false, render: (r) => <span className="line-clamp-1 text-ink-3">{r.output}</span> },
							{ key: "status", header: "Status", sortable: false, render: (r) => <Chip size="sm" tone={r.status === "running" ? "agent" : r.status === "failed" ? "block" : "pass"}>{r.status}</Chip> },
							{ key: "cost", header: "Cost", align: "end", render: (r) => fmtUsd(r.costUsd) },
						]}
					/>
				</Card>
				<Card>
					<DataTable<IRun> dense caption="Empty" rows={[]} columns={[{ key: "a", header: "Agent", render: (r) => r.agent }, { key: "b", header: "Cost", align: "end", render: (r) => fmtUsd(r.costUsd) }]} empty={<span className="block text-center text-md text-ink-3">No runs this week.</span>} />
				</Card>
			</Kit>
			<Kit name="Sheet" note="end drawer · bottom sheet · Esc / scrim closes">
				<Row>
					<Button variant="secondary" icon="ArrowRight" onClick={() => setSheet("end")}>
						Open end sheet
					</Button>
					<Button variant="secondary" icon="ArrowUp" onClick={() => setSheet("bottom")}>
						Open bottom sheet
					</Button>
				</Row>
				<Sheet
					open={sheet !== null}
					side={sheet ?? "end"}
					onClose={() => setSheet(null)}
					title="Slot · Lifestyle inline 2"
					footer={
						<>
							<Button variant="ghost" onClick={() => setSheet(null)}>
								Cancel
							</Button>
							<Button onClick={() => setSheet(null)}>Use candidate</Button>
						</>
					}
				>
					<KeyValue rows={[{ k: "Provider", v: "Flux via MCP" }, { k: "Size", v: "1200×800 webp" }, { k: "Placement", v: 'After "Is it worth the cost?"' }]} />
				</Sheet>
			</Kit>
			<Kit name="Dialog" note="Destructive confirm · focus trap">
				<Row>
					<Button variant="secondary" icon="Trash" onClick={() => setDialog(true)}>
						Delete idea…
					</Button>
				</Row>
				<Dialog
					open={dialog}
					onClose={() => setDialog(false)}
					title="Delete this idea?"
					footer={
						<>
							<Button variant="ghost" onClick={() => setDialog(false)}>
								Keep it
							</Button>
							<Button variant="danger" onClick={() => (setDialog(false), toast({ title: "Idea deleted", action: { label: "Undo", onClick: () => {} } }))}>
								Delete
							</Button>
						</>
					}
				>
					“clear aligners vs braces for adults” leaves the plan. The keyword stays in {pillar("p-ortho")?.name ?? "Orthodontics"}.
				</Dialog>
			</Kit>
			<Kit name="ToastProvider" note="Wraps this page · bottom-center stack of 3 · 5s">
				<Row>
					{(["neutral", "agent", "human", "block", "pass"] as TTone[]).map((t) => (
						<Button key={t} size="sm" variant="secondary" onClick={() => toast({ title: `${t} toast`, body: "Toasts stack three deep.", tone: t })}>
							{t}
						</Button>
					))}
				</Row>
			</Kit>
			<Kit name="useToast" note="toast({ title, body?, tone?, action? }) · Undo for every human mutation (P3)">
				<Row>
					<Button variant="secondary" icon="CalendarBlank" onClick={() => toast({ title: "Moved to week 40", action: { label: "Undo", onClick: () => toast({ title: "Back in week 39" }) } })}>
						Mutate with Undo
					</Button>
				</Row>
			</Kit>
			<Kit name="Divider" note="horizontal · vertical">
				<Card className="flex flex-col gap-3">
					<span className="text-sm">Above</span>
					<Divider />
					<div className="flex h-8 items-center gap-3 text-sm">
						Start <Divider vertical /> End
					</div>
				</Card>
			</Kit>
		</Group>
	);
}

// ---- D. Charts -------------------------------------------------------------

function ChartKits() {
	const { data, site } = useCms();
	const stats = useStats();
	const gappy = data.trajectory.map((p, i) => (i === 3 || i === 4 ? { ...p, sessions: null, impressions: null } : p));
	const ranking = rankingKeywords(data.keywords);
	const dist = pillarDistribution(data.keywords, data.pillars);
	const weeks: ICalendarWeek[] = [38, 39, 40, 41].map((w) => ({
		week: w,
		label: `W${w}`,
		target: site.cadenceTarget,
		items: data.posts
			.filter((p) => p.week === w && p.state !== "live" && p.state !== "decaying")
			.slice(0, 6)
			.map((p) => ({ id: p.id, title: p.title, tone: stateTone(p.state, data.slots.some((s) => s.postId === p.id && s.status === "human-only")) })),
	}));
	const cells = data.pillars.flatMap((pl) => POST_STATES.map((s) => ({ pillarId: pl.id, state: s, count: data.posts.filter((p) => p.pillarId === pl.id && p.state === s).length })));
	return (
		<Group id="sg-charts" title="Charts" file="src/ds/charts.tsx">
			<Kit name="TrajectoryChart" note="actual ink · projection dashed · gaps broken, never zero" wide>
				<Card className="flex flex-col gap-3">
					<CardHeader icon="ChartLineUp" title="Sessions vs projection" meta="8 weeks" />
					<TrajectoryChart points={data.trajectory} />
					<SourceNote>Search Console · lags 2–3 days</SourceNote>
				</Card>
				<div className="grid gap-3 lg:grid-cols-2">
					<Card className="flex flex-col gap-3">
						<CardHeader title="Impressions" />
						<TrajectoryChart points={data.trajectory} metric="impressions" height={140} />
					</Card>
					<Card className="flex flex-col gap-3">
						<CardHeader title="With a data gap (W35–W36)" />
						<TrajectoryChart points={gappy} height={140} />
					</Card>
				</div>
			</Kit>
			<Kit name="Sparkline" note="position (invert) · tones · null gap">
				<Card className="flex flex-col gap-2">
					{ranking.slice(0, 4).map((k) => (
						<div key={k.id} className="flex items-center gap-3 text-sm">
							<span className="min-w-0 flex-1 truncate">{k.term}</span>
							<Sparkline values={k.positionTrend} invert className="h-6 w-24" />
						</div>
					))}
					<div className="flex items-center gap-3 text-sm">
						<span className="min-w-0 flex-1 truncate">With a gap · block tone</span>
						<Sparkline values={[12, 11, null, null, 14, 16, 19, 22]} tone="block" invert className="h-6 w-24" />
					</div>
					<SourceNote>Ahrefs · position, weekly</SourceNote>
				</Card>
			</Kit>
			<Kit name="ShareBar" note="KAS by pillar · claimed-but-unearned = human + note">
				<Card className="flex flex-col gap-3">
					<ShareBar rows={dist.map((d) => ({ id: d.pillarId, label: d.name, value: d.share, tone: d.claimedButUnearned ? ("human" as TTone) : undefined, note: d.claimedButUnearned ? "Claimed, unearned" : undefined }))} />
					<SourceNote>KAS · recalculated after each merge</SourceNote>
				</Card>
			</Kit>
			<Kit name="StatusLight" note="green · amber · red, each with its number">
				<Card className="flex flex-col gap-3">
					{data.planStatus.map((s) => (
						<StatusLight key={s.id} light={s.light} label={s.label} value={s.value} detail={s.detail} />
					))}
					<StatusLight light="red" label="Technical health" value="61" detail="Sitemap returns 500 since Tue" />
					<SourceNote>Technical monitor · Fri 25 Sep</SourceNote>
				</Card>
			</Kit>
			<Kit name="ConcentrationGauge" note="live value · healthy · fragile > 60">
				<Card className="flex flex-col gap-4">
					<ConcentrationGauge value={stats.concentration.top} />
					<ConcentrationGauge value={41} label="Healthy site" />
					<ConcentrationGauge value={78} label="Fragile site" />
					<SourceNote>KAS · top-5 keywords share</SourceNote>
				</Card>
			</Kit>
			<Kit name="CalendarWeekGrid" note="Cadence vs target per week" wide>
				<Card>
					<CalendarWeekGrid weeks={weeks} />
				</Card>
			</Kit>
			<Kit name="PillarMatrix" note="Pillar × state vs planned; thin pillars flagged" wide>
				<Card>
					<PillarMatrix pillars={data.pillars} cells={cells} />
				</Card>
			</Kit>
		</Group>
	);
}

// ---- E. Domain -------------------------------------------------------------

function DomainKits() {
	const f = useFixtures();
	const { data, site, actions } = f;
	const stats = useStats();
	const { toast } = useToast();
	const rc = f.post("p-root-canal");
	const rcGate = useGate("p-root-canal");
	const inv = f.post("p-invisalign-2026");
	const drafting = f.post("p-implants-guide");
	const [selPost, setSelPost] = useState("p-root-canal");
	const [selSlot, setSelSlot] = useState("s-inv-lifestyle");
	const [prompt, setPrompt] = useState<string | null>(null);
	const [output, setOutput] = useState<ITemplateManifest["output"]>("mdx");
	const [reason, setReason] = useState("");
	const [assert, setAssert] = useState<[boolean, boolean, boolean]>([true, false, false]);
	const [codeMode, setCodeMode] = useState<"rendered" | "source">("rendered");
	const lifestyle = data.slots.find((s) => s.id === "s-inv-lifestyle") as IImageSlot;
	const slotStatuses: IImageSlot["status"][] = ["queued", "generating", "candidates", "selected", "human-only", "failed"];
	const slotFixtures = slotStatuses.map((st) => {
		const real = data.slots.find((s) => s.status === st);
		return real ?? { ...(data.slots[0] as IImageSlot), id: `fx-${st}`, status: st, name: st === "queued" ? "Diagram · inline 3" : "Hero · retry", candidates: [] };
	});
	const overridden: IGateCheck[] = rc.gate.map((c) => (c.id === "schema" ? { ...c, status: "warn", override: { reason: "Schema lands with next template version", by: "Tolu B.", at: "2026-09-25T09:50:00+01:00" } } : c));
	const pending = rc.suggestions[0];
	const openFact = rc.facts.find((x) => x.status === "open") ?? rc.facts[0];
	const resolvedFact = rc.facts.find((x) => x.status === "resolved") ?? rc.facts[0];
	const manifest = data.manifests.find((m) => m.status === "needs-confirmation") ?? data.manifests[0];
	const mappings = [manifest.mappings.find((m) => m.status === "mapped"), manifest.mappings.find((m) => m.status === "needs-you" && m.role === "unclassified") ?? manifest.mappings.find((m) => m.status === "needs-you"), manifest.mappings.find((m) => m.status === "absent")].filter(Boolean) as ITemplateManifest["mappings"];
	const mr = data.mergeRequests.find((m) => m.postId === "p-emergency") ?? data.mergeRequests[0];
	const mrPost = f.post(mr.postId ?? "p-emergency");
	const review = data.posts.filter((p) => p.state === "in-review");
	const ideas = data.posts.filter((p) => p.state === "idea").slice(0, 2);
	const runFixtures: IRun[] = [
		data.runs.find((r) => r.status === "running"),
		data.runs.find((r) => r.status === "succeeded"),
		data.runs.find((r) => r.status === "failed"),
		{ ...(data.runs.find((r) => r.kind === "image-generation") as IRun), id: "fx-refused", status: "refused-over-cap", costUsd: 0, tokens: 0, output: "Refused: est. $0.48 would take image spend over the $200 cap" },
	].filter(Boolean) as IRun[];
	const scheds = data.schedules.slice(0, 3);
	const readiness = rcGate
		? [
				{ id: "facts", icon: "Quotes" as TIconName, label: "Fact markers", value: `${rcGate.openFacts.length} unresolved`, tone: (rcGate.openFacts.length ? "block" : "pass") as TTone },
				{ id: "slots", icon: "ImagesSquare" as TIconName, label: "Image slots", value: `${rc.slotIds.length - rcGate.unfilledSlots.length}/${rc.slotIds.length}`, tone: (rcGate.unfilledSlots.length ? "block" : "pass") as TTone },
				{ id: "onpage", icon: "ListChecks" as TIconName, label: "On-page 1–5", value: rcGate.failingHard.length ? `${rcGate.failingHard.length} failing` : "Pass", tone: (rcGate.failingHard.length ? "block" : "pass") as TTone },
				{ id: "tpl", icon: "BracketsAngle" as TIconName, label: "Template", value: rcGate.missingStructures.length ? "Missing structures" : "Renders", tone: (rcGate.missingStructures.length ? "block" : "pass") as TTone },
			]
		: [];
	const soft = rc.gate.find((c) => c.status === "warn") ?? rc.gate[0];
	const humanOnlySlot = data.slots.find((s) => s.status === "human-only") as IImageSlot;

	return (
		<Group id="sg-domain" title="Domain" file="src/ds/domain.tsx">
			<Kit name="StateChip" note="All 8 states · tone follows the owner · counts">
				<Row>
					{POST_STATES.map((s: TPostState) => (
						<StateChip key={s} state={s} count={stats.counts[s]} />
					))}
				</Row>
				<Row label="Needs assets without a human-only slot → agent tone">
					<StateChip state="needs-assets" humanOnly={false} />
					<StateChip state="needs-assets" />
				</Row>
			</Kit>
			<Kit name="AgentBadge" note="default · running · model · custom label">
				<Row>
					<AgentBadge />
					<AgentBadge running />
					<AgentBadge model="workhorse · gpt-5.1" />
					<AgentBadge label="Blog writer agent" running model="strongest" />
				</Row>
			</Kit>
			<Kit name="HumanBadge" note="Amber · Hand glyph · whose move">
				<Row>
					<HumanBadge />
					<HumanBadge label="Overdue · 9 days · Amaka E." />
				</Row>
			</Kit>
			<Kit name="PostCard" note="drafting · needs assets · in review (blocks) · selected · idea · hover" wide>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
					<PostCard post={drafting} pillar={f.pillar(drafting.pillarId)} keyword={f.keyword(drafting.keywordId)} href={`/posts/${drafting.id}`} />
					<PostCard post={inv} pillar={f.pillar(inv.pillarId)} keyword={f.keyword(inv.keywordId)} slots={f.slotsOf(inv.id)} href={`/posts/${inv.id}/assets`} />
					<PostCard post={rc} pillar={f.pillar(rc.pillarId)} keyword={f.keyword(rc.keywordId)} blocks={rcGate?.hard} href={`/posts/${rc.id}`} selected />
					<PostCard post={ideas[0]} pillar={f.pillar(ideas[0].pillarId)} keyword={f.keyword(ideas[0].keywordId)} href={`/posts/${ideas[0].id}`} />
					<PostCard post={mrPost} pillar={f.pillar(mrPost.pillarId)} keyword={f.keyword(mrPost.keywordId)} href={`/merge-requests/${mr.id}`} />
					<PostCard post={f.post("p-live-invisalign")} pillar={f.pillar("p-ortho")} href="/seo" />
				</div>
			</Kit>
			<Kit name="PipelineColumn" note="Header “Idea 12 · Agent” · drop target" wide>
				<div className="grid gap-3 md:grid-cols-3">
					<PipelineColumn state="idea" count={stats.counts.idea} owner="agent" onDrop={(id) => toast({ title: `Dropped ${id}` })}>
						{ideas.map((p) => (
							<PostCard key={p.id} post={p} pillar={f.pillar(p.pillarId)} href={`/posts/${p.id}`} draggable />
						))}
					</PipelineColumn>
					<PipelineColumn state="in-review" count={review.length} owner="human">
						{review.slice(0, 2).map((p) => (
							<PostCard key={p.id} post={p} pillar={f.pillar(p.pillarId)} blocks={f.blocksOf(p)} href={`/posts/${p.id}`} />
						))}
					</PipelineColumn>
					<PipelineColumn state="mr-open" count={0} owner="developer">
						<EmptyState icon="GitPullRequest" title="No open MRs" body="Approved posts open one here." />
					</PipelineColumn>
				</div>
			</Kit>
			<Kit name="GateChecklist" note="pass · fail (hard, Fix) · warn (soft, Override) · overridden">
				<Card>
					<GateChecklist checks={overridden} onFix={(id) => actions.fixCheck(rc.id, id)} onOverride={(id) => toast({ title: `Override ${id} needs a reason`, tone: "human" })} />
				</Card>
			</Kit>
			<Kit name="FactMarkerCard" note="open (can't override) · resolved">
				<FactMarkerCard marker={openFact} onAddSource={(id, url) => actions.addFactSource(rc.id, id, url)} onRewrite={(id) => actions.rewriteFactWithout(rc.id, id)} />
				<FactMarkerCard marker={resolvedFact} onAddSource={() => {}} onRewrite={() => {}} />
			</Kit>
			<Kit name="FactHighlight" note="Inline marks in the draft">
				<Card className="text-base leading-prose text-ink-2">
					Once the anaesthetic wears off, <FactHighlight status="resolved">somewhere between two and four hours after you leave</FactHighlight>, you may feel tender. <FactHighlight status="open">95% of patients</FactHighlight> are back at work the next day.
				</Card>
			</Kit>
			<Kit name="AgentDiff" note="pending (live · Accept/Reject) · accepted · rejected">
				{pending && <AgentDiff suggestion={pending} onAccept={(id) => actions.acceptSuggestion(rc.id, id)} onReject={(id) => actions.rejectSuggestion(rc.id, id)} />}
				{pending && <AgentDiff suggestion={{ ...pending, id: "fx-acc", status: "accepted", instruction: "add an FAQ" }} onAccept={() => {}} onReject={() => {}} />}
				{pending && <AgentDiff suggestion={{ ...pending, id: "fx-rej", status: "rejected", instruction: "make it friendlier" }} onAccept={() => {}} onReject={() => {}} />}
			</Kit>
			<Kit name="VersionList" note="Origin tags · current · restore · diff">
				<Card>
					<VersionList versions={rc.versions} currentId={rc.versions[rc.versions.length - 1]?.id ?? ""} onRestore={(id) => actions.restoreVersion(rc.id, id)} onDiff={(id) => toast({ title: `Diff against ${id}` })} />
				</Card>
			</Kit>
			<Kit name="OriginTag" note="agent-generation · agent-edit · human-edit · refresh">
				<Row>
					<OriginTag origin="agent-generation" />
					<OriginTag origin="agent-edit" />
					<OriginTag origin="human-edit" />
					<OriginTag origin="refresh" />
				</Row>
			</Kit>
			<Kit name="TemplatePreview" note="desktop · mobile · site classes only" wide>
				<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
					<TemplatePreview site={site} post={rc} pillar={f.pillar(rc.pillarId)} device="desktop" manifestVersion={1} />
					<TemplatePreview site={site} post={rc} pillar={f.pillar(rc.pillarId)} device="mobile" manifestVersion={1} />
				</div>
			</Kit>
			<Kit name="SlotRow" note="queued · generating · candidates · selected · human-only · failed · selected row">
				<Card padding="sm" className="flex flex-col gap-1">
					{slotFixtures.map((s) => (
						<SlotRow key={s.id} slot={s} selected={selSlot === s.id} onSelect={setSelSlot} />
					))}
				</Card>
			</Kit>
			<Kit name="CandidateGrid" note="2×2 · pick (live) · selected ink badge">
				<CandidateGrid candidates={lifestyle.candidates} onPick={(id) => actions.pickCandidate(lifestyle.id, id)} />
			</Kit>
			<Kit name="ProviderBadge" note="Every provider route">
				<Row>
					<ProviderBadge provider="higgsfield" model="flux-dev" />
					<ProviderBadge provider="openai" model="gpt-image-1" />
					<ProviderBadge provider="open-source" model="sdxl" />
					<ProviderBadge provider="inline-svg" />
					<ProviderBadge provider="human" />
				</Row>
			</Kit>
			<Kit name="PromptEditor" note="editable · estimate first · busy">
				<Card>
					<PromptEditor
						prompt={prompt ?? lifestyle.prompt}
						styleKeywords={lifestyle.styleKeywords}
						onChange={setPrompt}
						estimateUsd={lifestyle.estimateUsd}
						onRegenerate={() => actions.regenerateSlot(lifestyle.id, prompt ?? undefined)}
						onUpload={() => actions.uploadOwn(lifestyle.id, "reception.webp")}
						onHumanOnly={() => actions.markHumanOnly(lifestyle.id)}
						busy={lifestyle.status === "generating"}
					/>
				</Card>
				<Card>
					<PromptEditor prompt="Patient smiling in the Lekki clinic chair" styleKeywords={["warm", "natural light"]} onChange={() => {}} estimateUsd={0.12} onRegenerate={() => {}} onUpload={() => {}} onHumanOnly={() => {}} busy />
				</Card>
			</Kit>
			<Kit name="ProvenanceCard" note="generated · human-only">
				<ProvenanceCard slot={data.slots.find((s) => s.id === "s-rc-hero") ?? lifestyle} />
				{humanOnlySlot && <ProvenanceCard slot={humanOnlySlot} />}
			</Kit>
			<Kit name="ManifestMappingRow" note="mapped · needs you (Choose type) · absent">
				<Card padding="sm" className="flex flex-col gap-1">
					{mappings.map((m) => (
						<ManifestMappingRow key={m.id} mapping={m} onMap={(id, r) => actions.mapTemplateItem(manifest.id, id, r)} />
					))}
				</Card>
			</Kit>
			<Kit name="SourceCodeFrame" note="rendered schematic · source with tinted lines">
				<SegmentedControl
					size="sm"
					label="Mode"
					value={codeMode}
					onChange={setCodeMode}
					options={[
						{ value: "rendered", label: "Rendered" },
						{ value: "source", label: "Source" },
					]}
				/>
				<SourceCodeFrame
					mode={codeMode}
					html={SAMPLE_HTML}
					highlights={[
						{ selector: "h2.post__heading", label: "Heading", tone: "pass" },
						{ selector: "figure.post-media", label: "Image container", tone: "agent" },
						{ selector: "ul.post__list", label: "Needs you", tone: "human" },
					]}
				/>
			</Kit>
			<Kit name="OutputFormatPicker" note="MDX · HTML · JSON · Component">
				<OutputFormatPicker value={output} onChange={setOutput} />
			</Kit>
			<Kit name="ApprovalQueueItem" note="blocks · ready · refresh · selected · day ≥ 7 amber">
				<Card padding="sm" className="flex flex-col gap-1">
					{review.map((p, i) => (
						<ApprovalQueueItem key={p.id} post={p} blocks={f.blocksOf(p).length} day={[2, 1, 8][i] ?? p.daysInState} selected={selPost === p.id} onSelect={setSelPost} />
					))}
				</Card>
			</Kit>
			<Kit name="ReadinessGrid" note="From the live gate of the root-canal post">
				<ReadinessGrid items={readiness} />
			</Kit>
			<Kit name="OverrideReason" note="Soft block · reason ≥ 20 chars · logged to MR">
				<OverrideReason check={soft} value={reason} onChange={setReason} />
			</Kit>
			<Kit name="AssertionList" note="Three human confirmations before Approve">
				<AssertionList values={assert} onChange={(i, val) => setAssert((a) => a.map((x, j) => (j === i ? val : x)) as [boolean, boolean, boolean])} />
			</Kit>
			<Kit name="MRPreview" note="Host · branch → base · files · scope" wide>
				{site.repo && f.keyword(mrPost.keywordId) ? <MRPreview mr={mr} post={mrPost} keyword={f.keyword(mrPost.keywordId)!} repo={site.repo} /> : <DataGap label="Repository" reason="No repo connected." />}
			</Kit>
			<Kit name="CIStatus" note="pending · passing · failing · none · merged · conflict">
				<Row>
					<CIStatus ci="pending" status="open" />
					<CIStatus ci="passing" status="open" />
					<CIStatus ci="failing" status="open" />
					<CIStatus ci="none" status="conflict" />
					<CIStatus ci="passing" status="merged" />
					<CIStatus ci="none" status="closed" />
				</Row>
			</Kit>
			<Kit name="KasRow" note="orphan chip · Δ tones · not ranking · decaying">
				<Card className="overflow-x-auto">
					<table className="w-full min-w-[520px] border-collapse text-sm">
						<tbody>
							{[rankingKeywords(data.keywords)[0], data.keywords.find((k) => k.rankingPages === 1), data.keywords.find((k) => k.position == null), data.keywords.find((k) => k.decaying)]
								.filter((k, i, a): k is NonNullable<typeof k> => !!k && a.indexOf(k) === i)
								.map((k) => (
									<KasRow key={k.id} keyword={k} onSelect={(id) => toast({ title: `Keyword ${id}` })} />
								))}
						</tbody>
					</table>
				</Card>
			</Kit>
			<Kit name="KasTable" note="Top keywords by KAS share" wide>
				<Card className="flex flex-col gap-3">
					<KasTable keywords={rankingKeywords(data.keywords).slice(0, 8)} onSelect={(id) => toast({ title: `Keyword ${id}` })} />
					<SourceNote>Search Console + Ahrefs · KAS recalculated after merge</SourceNote>
				</Card>
			</Kit>
			<Kit name="LedgerItem" note="3 d to-do · 9 d overdue (amber) · 15 d blocker (red)">
				<Card padding="sm" className="flex flex-col gap-1">
					{[...data.ledger].sort((a, b) => a.ageDays - b.ageDays).map((it) => (
						<LedgerItem key={it.id} item={it} />
					))}
				</Card>
			</Kit>
			<Kit name="RunRow" note="running · succeeded · failed · refused-over-cap">
				<Card padding="sm" className="flex flex-col gap-1">
					{runFixtures.map((r) => (
						<RunRow key={r.id} run={r} />
					))}
				</Card>
			</Kit>
			<Kit name="ScheduleRow" note="enabled · toggled · over cap (refused up front)">
				<Card padding="sm" className="flex flex-col gap-1">
					{scheds.map((s, i) => (
						<ScheduleRow key={s.kind} schedule={s} estimateUsd={estimateRun(s.kind, site).usd} overCap={i === 2} onRunNow={(k) => actions.runNow(k)} onToggle={(k) => actions.toggleSchedule(k)} />
					))}
				</Card>
			</Kit>
			<Kit name="BudgetCard" note="under · ≥ 80% · at cap">
				<BudgetCard label="Text" spent={site.budgets.textUsd} cap={site.budgets.textCapUsd} onEdit={() => toast({ title: "Only an admin can change caps", tone: "human" })} />
				<BudgetCard label="Images" spent={168} cap={200} />
				<BudgetCard label="Images (at cap)" spent={200} cap={200} />
			</Kit>
			<Kit name="RoleGate" note="Switch role — locked actions show why, never hide" wide>
				<RoleSwitcher />
			</Kit>
			<Kit name="CommentThread" note="with comments · add · read-only · empty">
				<Card>
					<CommentThread comments={rc.comments} onAdd={(t) => actions.addComment(rc.id, t)} />
				</Card>
				<Card>
					<CommentThread comments={[]} readOnly />
				</Card>
			</Kit>
			<Kit name="ScopeNote" note="The only repo fact on specialist screens">
				{site.repo ? <ScopeNote repo={site.repo} /> : <DataGap label="Repository" reason="No repo connected." />}
			</Kit>
		</Group>
	);
}

function RoleSwitcher() {
	const { role, actions, can, why } = useCms();
	return (
		<div className="flex flex-col gap-4">
			<SegmentedControl label="Role" value={role} onChange={(r) => actions.setRole(r)} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
			<div className="grid gap-3 md:grid-cols-3">
				<Card className="flex flex-col gap-2">
					<span className="text-xs text-ink-3">Approve · specialist, admin</span>
					<RoleGate role={role} allow={["specialist", "admin"]} action="approve">
						<Button icon="SealCheck">Approve</Button>
					</RoleGate>
				</Card>
				<Card className="flex flex-col gap-2">
					<span className="text-xs text-ink-3">Merge · developer, admin</span>
					<RoleGate role={role} allow={["developer", "admin"]} action="merge">
						<Button icon="GitMerge">Merge</Button>
					</RoleGate>
				</Card>
				<Card className="flex flex-col gap-2">
					<span className="text-xs text-ink-3">Raise cap · admin (custom fallback)</span>
					<RoleGate role={role} allow={["admin"]} fallback={<LockedAction label="Raise cap" icon="Wallet" size="sm" reasons={[why("budget.set") ?? "Admins only"]} />}>
						<Button size="sm" icon="Wallet">
							Raise cap
						</Button>
					</RoleGate>
				</Card>
			</div>
			<span className="text-xs text-ink-3">
				{ROLE_LABEL[role]} · can approve: {can("post.approve") ? "yes" : "no"} · can merge: {can("mr.merge") ? "yes" : "no"}
			</span>
		</div>
	);
}

// ---- Five states -----------------------------------------------------------

function FiveStates() {
	const f = useFixtures();
	const [s, setS] = useState<TFive>("loaded");
	const posts = f.data.posts.filter((p) => p.state === "in-review");
	const runs = f.data.runs.slice(0, 4);
	const body = (kind: "board" | "table" | "list"): ReactNode => {
		if (s === "loading")
			return (
				<div className="flex flex-col gap-2.5" aria-busy="true">
					<Skeleton className="h-4 w-1/3" />
					<Skeleton className="h-16 w-full" radius={16} />
					<Skeleton className="h-16 w-full" radius={16} />
				</div>
			);
		if (s === "error")
			return (
				<Callout tone="block" title="Couldn't load this view" action={<Button size="sm" variant="secondary" icon="ArrowClockwise">Retry</Button>}>
					The store didn't answer in 10 s. Nothing was changed.
				</Callout>
			);
		if (s === "denied")
			return (
				<Callout tone="info" icon="LockSimple" title="Your role can't see this">
					Stakeholders can comment on drafts but not open the {kind === "table" ? "run log" : "plan"}. Ask an admin for access.
				</Callout>
			);
		if (s === "empty")
			return (
				<EmptyState
					icon={kind === "table" ? "Robot" : "Kanban"}
					title={kind === "table" ? "No runs yet" : "Nothing in review"}
					body={kind === "table" ? "Scheduled agents start on Monday." : "Posts land here when every slot is filled."}
					action={kind === "table" ? <Button variant="secondary" icon="Play">Run keyword swarm</Button> : <Button variant="secondary" icon="Plus">New idea</Button>}
				/>
			);
		if (kind === "board")
			return (
				<PipelineColumn state="in-review" count={posts.length} owner="human">
					{posts.slice(0, 2).map((p) => (
						<PostCard key={p.id} post={p} pillar={f.pillar(p.pillarId)} blocks={f.blocksOf(p)} href={`/posts/${p.id}`} />
					))}
				</PipelineColumn>
			);
		if (kind === "table")
			return (
				<DataTable<IRun>
					dense
					caption="Runs"
					rows={runs}
					columns={[
						{ key: "a", header: "Agent", render: (r) => r.agent },
						{ key: "c", header: "Cost", align: "end", render: (r) => fmtUsd(r.costUsd) },
					]}
				/>
			);
		return (
			<div className="flex flex-col gap-1">
				{f.data.ledger.map((it) => (
					<LedgerItem key={it.id} item={it} />
				))}
			</div>
		);
	};
	const cardStyle: CSSProperties = { minHeight: 280 };
	return (
		<section id="sg-states" aria-labelledby="sg-states-h" className="flex scroll-mt-6 flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-3 pb-2">
				<h2 id="sg-states-h" className="text-2xl tracking-display">
					Five states · board, table, card list
				</h2>
				<SegmentedControl<TFive>
					className="no-scrollbar max-w-full overflow-x-auto"
					label="State"
					size="sm"
					value={s}
					onChange={setS}
					options={(["loaded", "empty", "loading", "error", "denied"] as TFive[]).map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))}
				/>
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Card padding="lg" className="flex flex-col gap-3" style={cardStyle}>
					<CardHeader icon="Kanban" title="Board" />
					{body("board")}
				</Card>
				<Card padding="lg" className="flex flex-col gap-3" style={cardStyle}>
					<CardHeader icon="Robot" title="Table · runs" />
					{body("table")}
				</Card>
				<Card padding="lg" className="flex flex-col gap-3" style={cardStyle}>
					<CardHeader icon="Hand" title="Card list · ledger" />
					{body("list")}
				</Card>
			</div>
		</section>
	);
}

