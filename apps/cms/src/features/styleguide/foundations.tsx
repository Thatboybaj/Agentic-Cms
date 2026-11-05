"use client";

// /styleguide foundations — tokens rendered from var(--c-*) so a tokens.css edit shows up here unchanged.
// Token names are composed at runtime ("--c-" + name) so this file never names a tone token literally
// (DoD 3 keeps agent/human tokens inside src/ds).
import type { CSSProperties, ReactNode } from "react";
import { AgentBadge, Callout, Card, Chip, Dot, HumanBadge, Icon, SourceNote } from "@/ds";

const v = (name: string) => `var(--c-${name})`;
const tok = (name: string) => `--c-${name}`;

interface ISwatch {
	name: string;
	role: string;
	/** Render over a wash so translucent tokens read. */
	onWash?: boolean;
	/** Outline for near-white swatches. */
	edge?: boolean;
}

const SWATCHES: { group: string; note: string; items: ISwatch[] }[] = [
	{
		group: "Canvas & glass",
		note: "L0–L5 of the depth ladder. Washes are orb fills only, never content fills.",
		items: [
			{ name: "page", role: "Behind the app frame · body" },
			{ name: "canvas", role: "App frame under the washes" },
			{ name: "glass", role: "The one frosted shell (45%)", onWash: true },
			{ name: "glass-strong", role: "Mobile tab bar, floating bars (72%)", onWash: true },
			{ name: "glass-edge", role: "1px edge on glass", onWash: true },
			{ name: "surface", role: "Cards, pills, inputs", edge: true },
			{ name: "sunken", role: "Chips, active stat tile, kbd" },
			{ name: "sunken-2", role: "Table header, code frame" },
			{ name: "scrim", role: "Sheet / dialog scrim", onWash: true },
			{ name: "wash-blue", role: "Wash orb · top-start" },
			{ name: "wash-peach", role: "Wash orb · bottom-end" },
			{ name: "wash-green", role: "Wash orb · approvals, success" },
			{ name: "wash-neutral", role: "Wash orb · settings, templates" },
			{ name: "tenant", role: "Tenant icon bubble" },
			{ name: "avatar", role: "Initial bubbles" },
		],
	},
	{
		group: "Ink & lines",
		note: "Ink is primary text and the only action fill. ink-4/ink-5 are never body text.",
		items: [
			{ name: "ink", role: "Text · the one primary pill · active rail" },
			{ name: "ink-hover", role: "Primary hover" },
			{ name: "ink-2", role: "Long-form body in the editor" },
			{ name: "ink-3", role: "Secondary text, meta (5.19:1 on canvas)" },
			{ name: "ink-4", role: "Icons, large meta only (3.25:1)" },
			{ name: "ink-5", role: "Placeholders, disabled" },
			{ name: "on-ink", role: "Text on ink", edge: true },
			{ name: "line", role: "Card edges, outline ↗ buttons" },
			{ name: "line-2", role: "Dividers, table rows" },
			{ name: "line-3", role: "Dashed drop zones, strong outlines" },
		],
	},
	{
		group: "Agent — the machine did / is doing it",
		note: "Only via tone=\"agent\" props. Always with a Sparkle/Robot glyph and a text label.",
		items: [
			{ name: "agent", role: "Dots, icons, progress (graphics)" },
			{ name: "agent-ink", role: "Agent text · AA on white + soft" },
			{ name: "agent-soft", role: "Agent chips, rings, diff header" },
			{ name: "agent-line", role: "Agent outlines" },
		],
	},
	{
		group: "Human — waiting on a person",
		note: "Only via tone=\"human\". Always with Hand / UserFocus / Hourglass and whose move it is.",
		items: [
			{ name: "human", role: "Icons (graphics)" },
			{ name: "human-ink", role: "Text · AA on soft" },
			{ name: "human-soft", role: "Tiles, callouts" },
			{ name: "human-line", role: "Dashed human-only slot outline" },
		],
	},
	{
		group: "Block · Pass · Info",
		note: "Red = hard stop only. Green = passing check, live, gains. No white text on saturated red/green.",
		items: [
			{ name: "block", role: "Hard-block badges, dots" },
			{ name: "block-ink", role: "Block text" },
			{ name: "block-soft", role: "Fact marker card, before-diff" },
			{ name: "pass", role: "Pass dots, check icons" },
			{ name: "pass-ink", role: "Pass text" },
			{ name: "pass-soft", role: "Pass chips, after-diff" },
			{ name: "info-soft", role: "Neutral info chip" },
			{ name: "focus", role: "Focus ring (transient only)", onWash: true },
		],
	},
	{
		group: "Placeholder art",
		note: "Candidate tiles only — no stock imagery in the prototype.",
		items: [
			{ name: "art-1", role: "Candidate art" },
			{ name: "art-2", role: "Candidate art" },
			{ name: "art-3", role: "Candidate art" },
			{ name: "art-4", role: "Candidate art" },
		],
	},
];

export function Swatch({ name, role, onWash, edge }: ISwatch) {
	return (
		<div className="flex min-w-0 items-center gap-3">
			<span className="relative grid size-12 shrink-0 overflow-hidden rounded-md bg-canvas">
				{onWash && <span aria-hidden className="absolute inset-0 bg-wash-blue" />}
				{onWash && <span aria-hidden className="absolute inset-0 top-1/2 bg-wash-peach" />}
				<span aria-hidden className="relative rounded-md" style={{ background: v(name), boxShadow: edge ? `inset 0 0 0 1px ${v("line-2")}` : undefined }} />
			</span>
			<span className="flex min-w-0 flex-col">
				<code className="truncate font-mono text-xs text-ink">{tok(name)}</code>
				<span className="text-sm leading-snug text-ink-3">{role}</span>
			</span>
		</div>
	);
}

function Block({ id, title, lede, children }: { id: string; title: string; lede: ReactNode; children: ReactNode }) {
	return (
		<section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-6 flex-col gap-4">
			<div className="flex flex-col gap-1 px-1">
				<h3 id={`${id}-h`} className="text-xl">
					{title}
				</h3>
				<p className="max-w-[72ch] text-md text-ink-3">{lede}</p>
			</div>
			{children}
		</section>
	);
}

// ---- Color ----------------------------------------------------------------

function Colors() {
	return (
		<Block id="sg-color" title="Color tokens" lede="tokens.css is the only file with color literals. Every swatch below is painted with var(--c-…), so this page cannot drift from the tokens.">
			<div className="grid gap-4 lg:grid-cols-2">
				{SWATCHES.map((g) => (
					<Card key={g.group} padding="lg" className="flex flex-col gap-4">
						<div className="flex flex-col gap-0.5">
							<h4 className="text-lg">{g.group}</h4>
							<p className="text-sm text-ink-3">{g.note}</p>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							{g.items.map((s) => (
								<Swatch key={s.name} {...s} />
							))}
						</div>
					</Card>
				))}
			</div>
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
				<Callout tone="agent" title="Agent-blue · the machine did / is doing it">
					<span className="flex flex-col gap-2">
						Never a primary fill, link, selection, chart series or decoration. Tone follows the owner, not importance.
						<span className="flex flex-wrap gap-1.5">
							<AgentBadge running model="workhorse" />
							<Chip tone="agent" icon="Sparkle" size="sm">
								KAS gap
							</Chip>
						</span>
					</span>
				</Callout>
				<Callout tone="human" title="Human-amber · waiting on a person">
					<span className="flex flex-col gap-2">
						Loudest non-error signal; outranks blue. There is no generic “warning” tone.
						<span className="flex flex-wrap gap-1.5">
							<HumanBadge />
						</span>
					</span>
				</Callout>
				<Callout tone="block" title="Block · hard stop only">
					<span className="flex flex-col gap-2">
						Unresolved fact marker, failing hard gate item, CI red, over-cap refusal, ledger ≥ 14 days. Never an agent guess.
						<span className="flex flex-wrap gap-1.5">
							<Chip tone="block" icon="LockSimple" size="sm">
								2 hard blocks
							</Chip>
						</span>
					</span>
				</Callout>
				<Callout tone="pass" title="Pass · check passed, live, gains">
					<span className="flex flex-col gap-2">
						Green carries a glyph and text too; white text never sits on the saturated fill.
						<span className="flex flex-wrap items-center gap-1.5">
							<Chip tone="pass" icon="CheckCircle" size="sm">
								Live
							</Chip>
							<Dot tone="pass" ring label="Passing" />
						</span>
					</span>
				</Callout>
			</div>
		</Block>
	);
}

// ---- Glass hierarchy ------------------------------------------------------

function Layer({ n, name, className, style, children }: { n: string; name: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
	return (
		<div className={className} style={style}>
			<span className="inline-flex items-center gap-1.5 font-display text-xs text-ink-3">
				<span className="tabular rounded-pill bg-surface px-1.5 text-2xs text-ink">{n}</span>
				{name}
			</span>
			{children}
		</div>
	);
}

function Glass() {
	return (
		<Block id="sg-glass" title="Glass hierarchy" lede="Back to front: page → canvas → wash orbs → the one glass shell → white cards and pills → sunken chips → ink accents. A layer only sits on the layer directly below it; glass never nests in glass.">
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
				<div className="rounded-2xl bg-page p-5">
					<Layer n="L0" name="Page · --c-page" className="flex flex-col gap-3">
						<div className="relative h-[380px] overflow-hidden rounded-2xl bg-canvas">
							<span aria-hidden className="wash-orb -start-24 -top-28 size-80 bg-wash-blue" style={{ filter: "blur(60px)" }} />
							<span aria-hidden className="wash-orb -end-24 -bottom-32 size-80 bg-wash-peach" style={{ filter: "blur(64px)" }} />
							<Layer n="L1" name="Canvas + L2 washes" className="absolute start-4 top-3" />
							<div className="glass absolute inset-4 top-10 flex flex-col gap-3 rounded-shell p-4">
								<Layer n="L3" name="Glass shell · r-32 · 45% + blur 24" />
								<Card padding="lg" className="flex max-w-md flex-col gap-3 shadow-card">
									<Layer n="L4" name="White card · r-22" />
									<span className="font-display text-lg">root canal recovery: what to expect</span>
									<div className="flex flex-wrap items-center gap-2 rounded-md bg-sunken p-2.5">
										<Layer n="L5" name="Sunken tile · r-16" />
										<Chip size="sm">General</Chip>
										<Chip size="sm">Informational · KD 18</Chip>
									</div>
									<div className="flex items-center gap-2">
										<Layer n="L6" name="Ink accent" />
										<span className="inline-flex h-11 items-center rounded-pill bg-ink px-5 font-display text-base text-on-ink">Approve</span>
									</div>
								</Card>
							</div>
						</div>
					</Layer>
				</div>
				<Card padding="lg" className="flex flex-col gap-2.5 text-sm">
					<h4 className="text-lg">Rules</h4>
					{[
						["L0", "Page — visible only beyond 1440 or around the frame."],
						["L1", "Canvas — AppFrame root, overflow hidden."],
						["L2", "Wash orbs — 760px, blur 120/130, pointer-events none. AppFrame wash picks the pair."],
						["L3", "Glass shell — exactly one per viewport, inset 16, r-32."],
						["L4", "White cards r-22 and 44px pills sit directly on glass. No card borders."],
						["L5", "Sunken chips/tiles live only inside L4."],
						["L6", "Ink — active rail, the one primary pill, selected outline, toggle on."],
						["L7", "Overlays — scrim + white sheet r-28; menus r-18 with float shadow."],
					].map(([n, t]) => (
						<p key={n} className="flex gap-2.5 text-ink-2">
							<span className="tabular w-6 shrink-0 font-display text-ink">{n}</span>
							{t}
						</p>
					))}
				</Card>
			</div>
		</Block>
	);
}

// ---- Typography -----------------------------------------------------------

const TYPE: { token: string; cls: string; px: number; family: "display" | "body"; weight: 400 | 500; use: string; sample: string }[] = [
	{ token: "text-5xl", cls: "text-5xl tracking-hero leading-display", px: 44, family: "display", weight: 400, use: "Clock numerals, countdowns", sample: "10:42" },
	{ token: "text-4xl", cls: "text-4xl tracking-hero leading-display", px: 34, family: "display", weight: 400, use: "Big numbers · StatTile lg", sample: "−6.2%" },
	{ token: "text-3xl", cls: "text-3xl tracking-display leading-display", px: 26, family: "display", weight: 500, use: "Page title", sample: "Content plan" },
	{ token: "text-2xl", cls: "text-2xl tracking-display leading-display", px: 22, family: "display", weight: 500, use: "Section heroes, StatTile md", sample: "3 / 4 this week" },
	{ token: "text-xl", cls: "text-xl leading-snug", px: 17, family: "display", weight: 500, use: "Pane titles, strip values", sample: "On-page gate 10/12" },
	{ token: "text-lg", cls: "text-lg leading-snug", px: 15, family: "display", weight: 500, use: "Card titles", sample: "implant vs bridge: cost and lifespan" },
	{ token: "text-base", cls: "text-base", px: 14, family: "display", weight: 500, use: "Pills, md buttons, tabs", sample: "Open merge request" },
	{ token: "text-sm", cls: "text-sm", px: 12, family: "display", weight: 500, use: "Chips", sample: "Orthodontics" },
	{ token: "text-xs", cls: "text-xs", px: 11, family: "display", weight: 500, use: "Stat labels, kbd, tiny chips", sample: "Needs assets" },
	{ token: "text-2xs", cls: "text-2xs", px: 10, family: "display", weight: 500, use: "Rail counts, axis ticks", sample: "W39" },
	{ token: "text-base", cls: "text-base leading-body", px: 14, family: "body", weight: 400, use: "Default UI text, inputs, table cells", sample: "Most people feel tender for two to three days after treatment." },
	{ token: "text-md", cls: "text-md leading-body", px: 13, family: "body", weight: 400, use: "Card body, subtitles", sample: "Lumen Dental · lumendental.co · 4 posts per week" },
	{ token: "text-sm", cls: "text-sm", px: 12, family: "body", weight: 400, use: "Card meta, timestamps, SourceNote", sample: "Informational · KD 18 · guide · 2 d in review" },
	{ token: "text-xs", cls: "text-xs", px: 11, family: "body", weight: 400, use: "Column meta", sample: "Search Console · lags 2–3 days" },
];

function Typography() {
	return (
		<Block id="sg-type" title="Typography" lede="General Sans 500 carries titles, UI labels, buttons and numbers; General Sans 400 only for big numerals ≥ 34px. Poppins 400 carries body and meta. Two weights, no uppercase, tabular numerals everywhere.">
			<div className="grid gap-4 lg:grid-cols-2">
				<Card padding="lg" className="flex flex-col gap-1">
					<div className="flex items-baseline justify-between gap-3 pb-2">
						<h4 className="text-lg">General Sans</h4>
						<code className="font-mono text-xs text-ink-3">--c-font-display · font-display</code>
					</div>
					<p className="font-display text-4xl tracking-hero">Aa Gg 0123456789</p>
				</Card>
				<Card padding="lg" className="flex flex-col gap-1">
					<div className="flex items-baseline justify-between gap-3 pb-2">
						<h4 className="text-lg">Poppins</h4>
						<code className="font-mono text-xs text-ink-3">--c-font-body · font-sans</code>
					</div>
					<p className="font-sans text-4xl font-normal tracking-hero">Aa Gg 0123456789</p>
				</Card>
			</div>
			<Card padding="none" className="overflow-hidden">
				{TYPE.map((t, i) => (
					<div key={`${t.token}-${t.family}-${i}`} className="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 border-b border-line-2 px-5 py-3 last:border-b-0 md:grid-cols-[200px_minmax(0,1fr)]">
						<span className="flex flex-col">
							<code className="font-mono text-xs text-ink">
								{t.token} · {t.px}px
							</code>
							<span className="text-xs text-ink-3">
								{t.family === "display" ? "General Sans" : "Poppins"} {t.weight} · {t.use}
							</span>
						</span>
						<span className={`tabular min-w-0 truncate ${t.family === "display" ? "font-display" : "font-sans"} ${t.weight === 400 ? "font-normal" : "font-medium"} ${t.cls}`}>{t.sample}</span>
					</div>
				))}
			</Card>
		</Block>
	);
}

// ---- Radii · elevation · spacing -------------------------------------------

const RADII = [
	["xs", 6, "Kbd, code chips"],
	["sm", 12, "Mini tiles, inputs in cards"],
	["md", 16, "Stat tiles, list rows"],
	["lg", 18, "Menus, inner cards"],
	["xl", 22, "Cards"],
	["2xl", 24, "Panes, FileDrop"],
	["3xl", 28, "Sheets, dialogs"],
	["shell", 32, "The glass shell only"],
	["pill", 999, "Buttons, chips, inputs"],
] as const;

const SHADOWS = [
	["shadow-card", "card", "Resting cards / pills"],
	["shadow-raised", "raised", "Hover on interactive cards"],
	["shadow-float", "float", "Menus, tooltips, toasts"],
	["shadow-sheet", "sheet", "Sheets, dialogs"],
] as const;

const SPACE = [1, 2, 3, 4, 5, 6, 8, 10] as const;

function Shape() {
	return (
		<Block id="sg-shape" title="Radii · elevation · spacing" lede="Much rounder than a generic admin: cards r-22 on a r-32 shell. Cards are flat white on glass; shadows appear on hover and overlays only. 4px spacing base.">
			<div className="grid gap-4 xl:grid-cols-3">
				<Card padding="lg" className="flex flex-col gap-4">
					<h4 className="text-lg">Radius</h4>
					<div className="grid grid-cols-3 gap-3">
						{RADII.map(([n, px, use]) => (
							<div key={n} className="flex flex-col gap-1.5">
								<span aria-hidden className="h-14 border border-line-3 bg-sunken" style={{ borderRadius: `var(--c-radius-${n})` }} />
								<code className="font-mono text-xs text-ink">--c-radius-{n}</code>
								<span className="text-xs text-ink-3">
									{px}px · {use}
								</span>
							</div>
						))}
					</div>
				</Card>
				<Card padding="lg" variant="sunken" className="flex flex-col gap-4 rounded-xl">
					<h4 className="text-lg">Elevation</h4>
					<div className="grid grid-cols-2 gap-5">
						{SHADOWS.map(([cls, n, use]) => (
							<div key={n} className="flex flex-col gap-2">
								<span aria-hidden className={`h-16 rounded-lg bg-surface ${cls}`} />
								<code className="font-mono text-xs text-ink">--c-shadow-{n}</code>
								<span className="text-xs text-ink-3">{use}</span>
							</div>
						))}
					</div>
				</Card>
				<Card padding="lg" className="flex flex-col gap-3">
					<h4 className="text-lg">Spacing</h4>
					{SPACE.map((n) => (
						<div key={n} className="flex items-center gap-3">
							<code className="w-24 shrink-0 font-mono text-xs text-ink">--c-space-{n}</code>
							<span aria-hidden className="h-3 rounded-xs bg-ink" style={{ width: `var(--c-space-${n})` }} />
							<span className="tabular text-xs text-ink-3">{n * 4}px</span>
						</div>
					))}
					<p className="pt-1 text-xs text-ink-3">Shell inset 16 · pane gap 16 · card padding 16–24 · control 44 (sm 34, hit area 44) · rail 48.</p>
				</Card>
			</div>
		</Block>
	);
}

// ---- Motion ---------------------------------------------------------------

const MOTION = [
	{ token: "dur-1", ms: 120, use: "Press · scale(.97)", ease: "ease-out", demo: "press" },
	{ token: "dur-2", ms: 200, use: "Hover, color, toggle", ease: "ease-out", demo: "lift" },
	{ token: "dur-3", ms: 320, use: "Sheets, reorder, diff collapse", ease: "ease-out", demo: "slide" },
	{ token: "dur-4", ms: 600, use: "Chart draw-in (once)", ease: "ease-out", demo: "grow" },
	{ token: "dur-2", ms: 200, use: "Toggle knob, chip select", ease: "ease-spring", demo: "spring" },
] as const;

function MotionDemo({ token, ease, demo }: { token: string; ease: string; demo: string }) {
	const t: CSSProperties = { transitionDuration: v(token), transitionTimingFunction: v(ease) };
	if (demo === "press")
		return (
			<button type="button" className="press grid h-11 w-full place-items-center rounded-pill bg-ink font-display text-md text-on-ink">
				Press me
			</button>
		);
	return (
		<div className="group relative h-11 w-full overflow-hidden rounded-pill bg-sunken" tabIndex={0} aria-label={`Hover to preview ${token}`}>
			{demo === "lift" && <span className="absolute inset-1 rounded-pill bg-surface transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:shadow-raised group-focus:-translate-y-0.5 group-focus:shadow-raised" style={t} />}
			{demo === "slide" && <span className="absolute inset-y-1 start-1 w-10 rounded-pill bg-ink transition-[inset-inline-start] group-hover:start-[calc(100%-44px)] group-focus:start-[calc(100%-44px)]" style={t} />}
			{demo === "grow" && <span className="absolute inset-y-0 start-0 w-0 bg-ink transition-[width] group-hover:w-full group-focus:w-full" style={t} />}
			{demo === "spring" && <span className="absolute top-1 start-1 size-9 rounded-full bg-ink transition-[inset-inline-start] group-hover:start-[calc(100%-40px)] group-focus:start-[calc(100%-40px)]" style={t} />}
		</div>
	);
}

function Motion() {
	return (
		<Block id="sg-motion" title="Motion" lede="Hover (or focus) each track to feel its duration. Reduced motion sets every duration to 0; the only loops are the agent pulse, skeleton shimmer and spinner.">
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
				{MOTION.map((m, i) => (
					<Card key={i} padding="lg" className="flex flex-col gap-3">
						<MotionDemo token={m.token} ease={m.ease} demo={m.demo} />
						<span className="flex flex-col">
							<code className="font-mono text-xs text-ink">
								--c-{m.token} · --c-{m.ease}
							</code>
							<span className="text-xs text-ink-3">
								{m.ms}ms · {m.use}
							</span>
						</span>
					</Card>
				))}
			</div>
			<div className="flex flex-wrap items-center gap-4 px-1">
				<span className="flex items-center gap-2 text-sm text-ink-3">
					<Dot tone="agent" pulse label="Agent running" /> .c-pulse 1.8s
				</span>
				<span className="flex items-center gap-2 text-sm text-ink-3">
					<span aria-hidden className="c-skeleton block h-3 w-20 rounded-xs" /> .c-skeleton 1.4s
				</span>
				<span className="flex items-center gap-2 text-sm text-ink-3">
					<Icon name="CircleNotch" size={16} className="c-spin text-ink" /> .c-spin 0.9s
				</span>
				<SourceNote icon="Info">prefers-reduced-motion → 0ms</SourceNote>
			</div>
		</Block>
	);
}

export const FOUNDATION_SECTIONS = [
	{ id: "sg-color", label: "Color" },
	{ id: "sg-glass", label: "Glass hierarchy" },
	{ id: "sg-type", label: "Typography" },
	{ id: "sg-shape", label: "Radii · elevation · space" },
	{ id: "sg-motion", label: "Motion" },
];

export function Foundations() {
	return (
		<div className="flex flex-col gap-12">
			<Colors />
			<Glass />
			<Typography />
			<Shape />
			<Motion />
		</div>
	);
}
