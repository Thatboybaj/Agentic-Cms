# AGENTIC CMS — Prompt 02: Design System & Web Architecture

> Adapted from `docs/nawa-template/02-design-system.md`. Same section order and rigor; every section rewritten for
> Agentic CMS. The human-readable contract this prompt produces is `docs/design-system.md`.

## Adaptation map (Nawa → Agentic CMS)

Use this table to repeat the adaptation for the next venture: change only the right column's inputs (refs, PRD, UXER).

| Nawa § | Nawa | Agentic CMS | Why (UXER id) |
|---|---|---|---|
| Header / §0 | QSTP AI OS, FastAPI :8000, `packages/api-client` | Agentic CMS surface for the SEO harness; Next.js App Router in `apps/cms` (:3200); v1 = client store with mocked integrations, backend later | UXER 00 qualification |
| §1 Principles | 3: institutional trust · bilingual dignity · AI transparency | 7: P1 stuck > busy · P2 machine labelled · P3 diffs · P4 blocks explain · P5 one black button · P6 numbers carry source · P7 setup twice | UXER 01 |
| §2 Token prefix | `--nw-*`, `.nw-*`, `styles/tokens.css` | `--c-*`, `.cms-*` hooks + `data-kit`, `src/ds/tokens.css`, Tailwind v4 aliases in `src/ds/globals.css` | Build plan |
| §2.1 Palette | Teal primary · sand surfaces · amber AI | **Ink `#111317` is the only action fill** · canvas/glass/white surfaces · blue agent · amber human · red block · green pass | Refs, C1 |
| §2.2 Binding color rule | Amber rule: amber = AI | **Agent-blue rule** (blue = the machine) + **Human-amber rule** (amber = waiting on a person); no generic "warning" tone | C1 |
| §2.3 Radii | 6 / 10 / 16 / 999 | 6 / 12 / 16 / 18 / **22 cards** / 24 panes / 28 sheets / **32 shell** / 999 pills | C3 |
| §2.3 Shadows | 3 elevations | 4 (card · raised · float · sheet); cards flat white on glass | Visual aid |
| new §2.4 | — | **Wash / glass hierarchy** L0–L7 | Visual aid |
| §2 contrast | Teal/amber AA pairs | Refs' `#6B7079` fails AA on canvas → `ink-3 #5F6470`; `ink-4` not text-safe; no white text on red/green fills | C4 |
| §3 Typography | IBM Plex Sans Arabic + Archivo | **General Sans 500** (titles, labels, buttons, numbers) + **Poppins 400** (body, meta, captions); GS 400 only for ≥ 34px light numerals | C2 |
| §3.2 Arabic metrics | Arabic line-height / tracking | Removed (EN only); leading/tracking scale for Latin | PRD non-goal |
| §3.3 Numerals | Latin digits in AR + EN, QAR | `en-US`, tabular, USD, U+2212 minus, pp deltas, missing ≠ 0 | P6 |
| §4 RTL | RTL-first, mandatory mirroring | **RTL-ready**: logical properties only, directional icons flip under `rtl:`; no RTL locale ships | UXER 00 locale |
| §5 i18n | AR/EN parity, dictionaries, FR ingestion | English only; copy centralized per feature for a later swap; copy owned by UXER 06 | PRD |
| new §5.5 | — | **Visual hierarchy rules VH1–VH13** from the glass dashboard | Founder direction |
| §6 Web structure | `apps/web`, `src/components/ui|ai`, SWR hooks | `apps/cms`: `app/` thin shells · `src/ds` kit · `src/features/<module>` · `src/lib` (types, store, logic, format, permissions) | Build plan |
| §7 Shells | TopNav · Console sidebar · Onboarding | **One `AppFrame`**: glass shell + 44px round `IconRail` + pill `TopBar`; `SplitPane`; `MobileTabBar`; onboarding = AppFrame without rail | Refs, visual aid |
| §8 Surface map | `nawa:<domain>:<action>`, 20 routes | `cms:<domain>:<action>`, 4 roles (specialist · developer · stakeholder · admin), 17 routes | PRD roles, UXER 02 |
| §9 Kit | ~25 `.nw-*` primitives | **94 components** in 5 files (shell · controls · surfaces · charts · domain), names/props from UXER 05 | UXER 05 |
| §10 AI patterns | AiAttribution, Scorecard, Override, Draft panel, Anomaly, Chat, Match | **Agent patterns**: AgentBadge, AgentStatusPill, AgentDiff accept/reject, Composer, FactMarker no-override, provenance, cost estimate before run, budget pressure, human-only handoff, DataGap | PRD M2–M7, C9 |
| §11 A11y | WCAG 2.1 AA | **WCAG 2.2 AA** (+ target size, dragging alternative, focus not obscured) | — |
| §12 Responsive | 768 / 1024 / 1280 | **390 / 768 / 1024 / 1440** | Refs |
| §13 Edge gate | Permission-based landing | Role landing + **gate UX**: hard vs soft blocks, `LockedAction`, `OverrideReason` logged, `RoleGate` never hides | PRD gate, C7 |
| §14 Styleguide | Both locales side by side | Every variant/state + role switcher + 390/1440 frames | — |
| DoD | 16 checks | 16 checks incl. Agent/Human scoping, one-primary-per-region, SourceNote/DataGap per metric | — |

---

You are building the design system and web-application architecture for **Agentic CMS**, the product surface that
turns a ten-agent SEO harness into shipped pages: it plans, drafts, illustrates, and renders blog posts into a
connected site's own markup, then opens a merge request a developer reviews and merges. This document is the binding
UI contract. Every screen in `docs/uxer/04-screen-specs.md` is built with the tokens, components, shells and rules
defined here — feature slices add features, never new visual vocabulary. Names and props of every component are
fixed by `docs/uxer/05-component-inventory.md`; flows and click budgets by `docs/uxer/03-flows.md`; microcopy and
motion by `docs/uxer/06-content-and-motion.md`. Domain types come from `src/lib/types.ts`.

## 0. Context recap

One workspace per client site (first tenant: **Lumen Dental**, `lumendental.co`). Seven modules: M1 content plan and
pipeline, M2 post editor, M3 image pipeline, M4 template ingestion, M5 repo + merge requests, M6 SEO trajectory,
M7 Keyword Attribution Score. Posts move `Idea → Briefed → Drafting → Needs assets → In review → MR open → Live →
Decaying`; each state is owned by an agent, a human, a developer or the system. Four roles per site: **content
specialist** (primary user; runs the programme without a code editor), **developer / repo owner** (touches the
product twice: setup, then MR review), **client stakeholder** (views, comments), **agency admin** (sites, users,
budgets, model routing). Agents draft, generate, score and open MRs; **one human gate** per post approves; fact
markers can never be overridden; every run shows its cost before it starts. The UI must make **who owns the next
move** — machine or person — visible at a glance.

The web app is Next.js 15 App Router + React 19 + TypeScript + Tailwind v4, package `@studio/cms`, dev on **:3200**.
v1 is front-end with a deterministic client store standing in for Git, Search Console and model providers; surfaces
render the exact states the real integrations will produce (running, failed, over cap, conflict).

## 1. Design principles

Seven principles resolve every design argument (tie-break order **P4 > P1 > P2 > P6 > P3 > P5 > P7**). Each has a
rule a reviewer can check.

1. **P1 Stuck is louder than busy.** Human-blocked counts render in the `human` (amber) tone in `StatStrip` and on
   cards; agent-busy states render blue and never outrank them. Any screen with a blocker shows it in the first viewport.
2. **P2 The machine is always labelled.** Anything an agent produced, is producing, or suggested carries an
   `AgentBadge` or the `agent` tone with glyph + text. Blue is never decoration (§2.2).
3. **P3 Diffs, not overwrites.** No agent action mutates content without an `AgentDiff` accept/reject. Every human
   mutation offers Undo in a toast.
4. **P4 Blocks explain themselves.** Every disabled primary action says why inline (`LockedAction`: "· 2 hard
   blocks") and links to the fix. Hard blocks are red; soft blocks are amber with "override with a reason".
5. **P5 One black button.** Exactly one `Button variant="primary"` (ink fill) per view region; everything else is
   white, glass or ghost.
6. **P6 Numbers carry their source.** Every metric shows source or lag (`SourceNote`: "Search Console · lags 2–3
   days"). Missing data is a `DataGap`, never `0` or blank.
7. **P7 Setup is twice, then invisible.** Developer surfaces are wizards ending in a versioned summary; nothing
   developer-ish appears on the specialist's daily screens except the `ScopeNote` where a write happens.

## 2. The `--c-*` design-token system

All design values live as CSS custom properties in **one file**: `apps/cms/src/ds/tokens.css`. It is the only file
permitted to contain raw color literals (hex/rgb/rgba/hsl/oklch). `src/ds/globals.css` does `@import "tailwindcss";
@import "./tokens.css";` and maps every token into Tailwind v4 via `@theme inline` (`--color-surface:
var(--c-surface)`, `--radius-xl: var(--c-radius-xl)`, `--shadow-card: var(--c-shadow-card)`, `--text-lg:
var(--c-text-lg)`, `--font-display: var(--c-font-display)`, `--font-sans: var(--c-font-body)`, …) so feature code
writes `bg-surface text-ink-3 rounded-xl shadow-card font-display` — never a literal, never an arbitrary value.
Inline SVG uses `currentColor` or `var(--c-*)`. Every kit component root carries `data-kit="<Name>"` and a
`cms-<kebab-name>` class as stable test/grep hooks. `globals.css` is imported once in `app/layout.tsx`.

### 2.1 Palette and scales

Define exactly these tokens (canonical, contrast-checked — do not improvise alternates):

```css
:root {
	/* Canvas & glass hierarchy */
	--c-page: #e4e6ea;            /* behind the app frame */
	--c-canvas: #eef0f3;          /* app frame, under the washes */
	--c-glass: rgba(255, 255, 255, 0.45);        /* THE frosted shell */
	--c-glass-strong: rgba(255, 255, 255, 0.72); /* mobile tab bar, floating bars */
	--c-glass-edge: rgba(255, 255, 255, 0.9);    /* 1px glass edge */
	--c-surface: #ffffff;         /* cards, pills, inputs */
	--c-sunken: #f3f4f6;          /* chips, active stat tile, kbd, composer field */
	--c-sunken-2: #f6f7f8;        /* table header, code frame */
	--c-scrim: rgba(17, 19, 23, 0.28);

	/* Washes — blurred orbs behind the shell ONLY */
	--c-wash-blue: #cde1f1; --c-wash-peach: #f3e0d4; --c-wash-green: #d6ecdf; --c-wash-neutral: #dfe2e7;
	--c-tenant: #eaf0f7;          /* tenant icon bubble */
	--c-avatar: #dce3ea;

	/* Ink */
	--c-ink: #111317;             /* primary text AND the only action fill */
	--c-ink-2: #44484f;           /* long-form editor body */
	--c-ink-3: #5f6470;           /* secondary text & meta — AA on canvas/surface/sunken/glass */
	--c-ink-4: #8a8f98;           /* icons, large text ≥ 24px — NOT text-safe below that */
	--c-ink-5: #a0a4ab;           /* placeholders, disabled — never text a user must read */
	--c-on-ink: #ffffff;
	--c-ink-hover: #2a2d33;

	/* Lines */
	--c-line: #edeef0; --c-line-2: #e6e7ea; --c-line-3: #d9dbdf;

	/* Agent-blue — RESERVED: the machine did / is doing / suggests this (§2.2) */
	--c-agent: #3e6fd8;           /* dots, icons, progress — graphics */
	--c-agent-ink: #2f58b5;       /* agent text — AA on white (6.60) and agent-soft (5.71) */
	--c-agent-soft: #e8effc;
	--c-agent-line: #9db6e6;

	/* Human-amber — RESERVED: waiting on a person (§2.3) */
	--c-human: #b7791f;           /* icons — graphics */
	--c-human-ink: #8a5a12;       /* text — AA on white (5.91) and human-soft (5.28) */
	--c-human-soft: #fbf1df;
	--c-human-line: #e0b563;      /* dashed human-only slot outline */

	/* Block — hard block, decaying, destructive, failed */
	--c-block: #e5483c; --c-block-ink: #b8392f; --c-block-soft: #fce9e7;
	/* Pass — passing check, Live, gains */
	--c-pass: #2f9e6b; --c-pass-ink: #237a52; --c-pass-soft: #e7f5ee;
	/* Info — neutral informational */
	--c-info-soft: #f1f2f4;
	/* Placeholder art for generated candidates (no stock images) */
	--c-art-1: #f4d5a0; --c-art-2: #c9e4fb; --c-art-3: #e3e0f0; --c-art-4: #f1ede9;

	/* Focus */
	--c-focus: rgba(62, 111, 216, 0.45);

	/* Typography */
	--c-font-display: "General Sans", ui-sans-serif, system-ui, sans-serif;
	--c-font-body: "Poppins", ui-sans-serif, system-ui, sans-serif;
	--c-font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
	--c-text-2xs: 10px; --c-text-xs: 11px; --c-text-sm: 12px; --c-text-md: 13px; --c-text-base: 14px;
	--c-text-lg: 15px; --c-text-xl: 17px; --c-text-2xl: 22px; --c-text-3xl: 26px; --c-text-4xl: 34px; --c-text-5xl: 44px;
	--c-leading-tight: 1.15; --c-leading-snug: 1.3; --c-leading-body: 1.55; --c-leading-prose: 1.7;
	--c-tracking-tight: -0.01em; --c-tracking-tighter: -0.02em;

	/* Radii — glass hierarchy */
	--c-radius-xs: 6px;   /* kbd, code chips */
	--c-radius-sm: 12px;  /* mini tiles, inputs inside cards */
	--c-radius-md: 16px;  /* stat tiles, list rows, callouts */
	--c-radius-lg: 18px;  /* menus, inner cards, post cards */
	--c-radius-xl: 22px;  /* CARDS */
	--c-radius-2xl: 24px; /* panes, drop zones */
	--c-radius-3xl: 28px; /* sheets, dialogs */
	--c-radius-shell: 32px; /* the frosted shell only */
	--c-radius-pill: 999px; /* buttons, chips, icon & rail buttons, avatars */

	/* Elevation — cards are flat white on glass; shadows are rare */
	--c-shadow-card: 0 1px 2px rgba(17, 19, 23, 0.04);
	--c-shadow-raised: 0 6px 20px rgba(17, 19, 23, 0.07);
	--c-shadow-float: 0 12px 32px rgba(17, 19, 23, 0.12);
	--c-shadow-sheet: 0 24px 64px rgba(17, 19, 23, 0.18);

	/* Space — 4px base; use ONLY these steps */
	--c-space-1: 4px; --c-space-2: 8px; --c-space-3: 12px; --c-space-4: 16px;
	--c-space-5: 20px; --c-space-6: 24px; --c-space-8: 32px; --c-space-10: 40px;
	--c-shell-inset: 16px; --c-control-h: 44px; --c-control-h-sm: 34px; --c-rail-w: 48px;

	/* Z-scale — the only permitted z-index values */
	--c-z-sticky: 150; --c-z-nav: 200; --c-z-dropdown: 300; --c-z-overlay: 400; --c-z-modal: 500; --c-z-toast: 600;

	/* Motion */
	--c-dur-1: 120ms; /* press */ --c-dur-2: 200ms; /* hover, color */
	--c-dur-3: 320ms; /* sheets, reorder */ --c-dur-4: 600ms; /* chart draw */
	--c-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
	--c-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
}
```

`TTone = "neutral" | "ink" | "agent" | "human" | "block" | "pass" | "info"` maps each tone to graphic / text / soft /
line tokens: `agent` → `agent` / `agent-ink` / `agent-soft` / `agent-line`; `human` → `human` / `human-ink` /
`human-soft` / `human-line`; `block` → `block` / `block-ink` / `block-soft`; `pass` → `pass` / `pass-ink` /
`pass-soft`; `info` → `ink-3` / `ink-3` / `info-soft`; `neutral` → `ink-4` / `ink-3` / `sunken`; `ink` → `ink` /
`on-ink` / `ink`. Components take `tone`; feature code never picks tone classes.

**Text-safety contract.** `ink` (16.3 canvas), `ink-2` (8.1), `ink-3` (5.19 canvas · 5.93 surface · 5.39 sunken ·
5.08 worst case glass over a wash) and every `*-ink` token pass WCAG AA (≥ 4.5:1) as text on `surface`, `canvas`,
`sunken`, glass, and their own `*-soft`. `on-ink` passes on `ink` (18.6) and `agent` (4.70). `agent`, `human`,
`block`, `pass` pass ≥ 3:1 as graphics on white and never carry text below 24px. **`ink-4` (3.25 white / 2.85
canvas) and `ink-5` are not text-safe.** **White text on `block` (3.94) or `pass` (3.37) is banned** — status chips
are tonal. The reference screens' `#6B7079` (4.36 on canvas, fails AA) is void; sampled values map to `ink-3`. These
pairs are verified by test (DoD 10).

### 2.2 The Agent-blue rule (binding)

Blue tokens (`--c-agent*`) mean **the machine did, is doing, or suggests this**. Concretely:

- They may be consumed **only** inside `src/ds/**`, and feature code reaches them only through `tone="agent"` or
  agent-carrier components (`AgentBadge`, `AgentStatusPill`, `AgentDiff`, `OriginTag`, `ProviderBadge`,
  `Button variant="agent"`, `ProgressBar tone="agent"`, `StateChip` for agent-owned states).
- Every blue element also renders the `Sparkle` (output/suggestion) or `Robot` (running actor) glyph **and** a text
  label ("Agent", "Agent edit", "2 agents running", agent name, provider/model). Color is never the only cue.
- Blue is never a primary action, link, selected state, ordinary chart series, brand accent or decoration. Links
  are ink; selection is a 1.5px ink outline; chart actuals are ink. Blue on a chart = agent projection or agent flag.
- Post states owned by agents (`Idea`, `Briefed`, `Drafting`, `Decaying`) render blue — tone follows owner.
- The human act of committing agent output (Accept, Use, Approve) is ink/secondary, never blue.
- System exceptions, transient and content-free only: `--c-focus` ring and `::selection`.

### 2.3 The Human-amber rule (binding)

Amber tokens (`--c-human*`) mean **this is waiting on a person** — the loudest non-error signal (P1).

- Consumed only inside `src/ds/**` via `tone="human"` (`HumanBadge`, `StatStrip` human tile, `LedgerItem` Overdue,
  `OverrideReason`, soft rows of `GateChecklist`, `Meter` ≥ `warnAt`, `ShareBar` claimed-but-unearned, `StateChip`
  Needs assets / In review, `SlotRow` human-only, rail dots on Images / Runs, `Callout tone="human"`).
- Every amber element pairs the `Hand`, `UserFocus` or `HourglassMedium` glyph with text naming whose move it is.
- There is **no generic warning tone**: a problem is `block` (red, cannot proceed) or `human` (amber, a person must act).
- Amber outranks blue wherever both appear (filled tile vs dot; blocker line above progress bar).
- Red (`block`) is reserved for hard stops and confirmed failures: open fact marker, hard gate fail (sections 1–5),
  unfilled slot at approval, unsatisfiable template, CI red, over-cap refusal, ledger ≥ 14 days, destructive confirm.

### 2.4 Wash / glass hierarchy (binding depth ladder)

Back to front; a layer sits only on the layer below it (white L4 sits on glass L3); glass never nests in glass.

| L | Layer | Exact spec |
|---|---|---|
| L0 | Page | `--c-page` |
| L1 | Canvas | `--c-canvas`, `AppFrame` root, `position:relative; overflow:hidden` |
| L2 | Wash orbs | `.wash-orb` = `position:absolute; border-radius:9999px; pointer-events:none`. Desktop: blue 760² at `inset-inline-start:-220px; inset-block-start:-260px; filter:blur(120px)`; peach 760² at `inset-inline-end:-240px; inset-block-end:-300px; filter:blur(130px)`. Mobile: 460², `blur(90px)`, offsets −160/−180 and −180/−160. `wash` prop: `blue-peach` (default) · `blue` · `peach` · `green` (onboarding, success) · `neutral` (settings) |
| L3 | Glass shell | `.glass` = `background: var(--c-glass); border:1px solid var(--c-glass-edge); backdrop-filter: blur(24px) saturate(1.2)`; `inset: var(--c-shell-inset)`; `border-radius: var(--c-radius-shell)`; padding 16; gap 16. **One per viewport.** Mobile < 768: inset 0, radius 0 |
| L4 | White cards & pills | `--c-surface`, cards r22 + `--c-shadow-card`, no border; pills 44h r999 |
| L5 | Sunken | `--c-sunken`/`-2`, r12–16 or pill — only inside L4 |
| L6 | Ink accents | active rail button, the region's primary pill, selected outline 1.5px, toggle on, +N bubble, active pagination bar |
| L7 | Overlays | `--c-scrim`; sheets/dialogs white r28 `--c-shadow-sheet`; menus/tooltips/toasts white r18 `--c-shadow-float`; floating bars `.glass-strong` (`blur(20px) saturate(1.2)`) |

### 2.5 Focus & motion

Every interactive element shows `box-shadow: 0 0 0 3px var(--c-focus)` under `:focus-visible` (in addition to its
resting edge). `.press` transitions transform 120ms / color 200ms with `--c-ease-out`; `:active` → `scale(.97)`.
The only infinite loops: `.c-pulse` (agent running dot, 1.8s, ring 4→7px `agent-soft`), `.c-skeleton` shimmer
(1.4s, `sunken → surface → sunken`), `.c-spin` (0.9s). `prefers-reduced-motion: reduce` sets every animation and
transition duration to 0 globally in `globals.css`; sheets fade instead of slide; charts don't draw in.

## 3. Typography

**Pairing: General Sans + Poppins.** Load General Sans 400/500 from Fontshare
(`https://api.fontshare.com/v2/css?f[]=general-sans@400,500&display=swap`) and Poppins 400/500 from Google Fonts,
with `preconnect`. `body` = Poppins 400 14/1.55 `ink`; `h1–h4`, `button`, `.font-display` = General Sans 500.

| Family | Weight | Carries |
|---|---|---|
| General Sans | 500 | Titles, headings, UI labels, buttons, pills, chips, tabs, table headers, numbers ≤ 22px, kbd |
| General Sans | 400 | Big light numerals ≥ 34px only (gap to projection, next-run time) |
| Poppins | 400 | Body, meta, captions, subtitles, hints, placeholders, editor prose, non-numeric table cells |
| Mono | 400 | Selectors, file paths, branches, URLs |

Two weights only; no 600/700, no faux bold, no italics or all-caps in chrome.

### 3.1 Size scale → uses

`2xs 10` rail badge, axis ticks · `xs 11` stat labels, column meta, kbd, tiny chips · `sm 12` card meta, chips,
`SourceNote`, timestamps · `md 13` card body, subtitles, sm buttons · `base 14` default UI, pills, md buttons,
inputs, cells · `lg 15` card and list-row titles · `xl 17` pane titles, strip values · `2xl 22` section heroes,
`StatTile md` · `3xl 26` page title (−0.01em) · `4xl 34` big numbers (GS 400, −0.02em) · `5xl 44` clock numerals
(GS 400, −0.02em). Leading 1.15 ≥ 22px · 1.3 titles · 1.55 UI · 1.7 editor prose.

### 3.2 Numeral policy (binding)

All quantitative data uses `tabular-nums` and the `en-US` locale through `src/lib/format.ts` only — feature code
never calls `toLocaleString`/`toFixed`: `formatUsd` (`$0.12`, `$142`; 2 decimals < $100), `formatInt` (`12,480`),
`formatCompact` (`12.4k`), `formatPct` (`−6.2%`, one decimal, U+2212 minus), `formatDelta` (`+1.4 pp`),
`formatPosition` (`7.2`; `null` never becomes `0`), `formatDate` (`Sep 25`, `Fri, Sep 25`, year only if not
current), `formatAge` (`Overdue · 9 d`, `Blocker · 15 d`), `formatRange` (`09:45–10:15`). Missing data renders
`DataGap`, never `0`, `$0` or `0%`.

## 4. RTL-ready mirroring

English only in v1, LTR — but authored so RTL is a `dir` flip:

1. **Logical properties only**: Tailwind `ms/me/ps/pe/start/end/border-s/border-e/rounded-s/rounded-e/text-start/
   text-end`; CSS `margin-inline-*`, `padding-inline-*`, `inset-inline-*`, logical radii. Physical `left/right`,
   `ml/mr/pl/pr`, `text-left/right`, `rounded-l/r` are banned (DoD 2). Wash orbs use inline-start/end.
2. **Directional icons** (`ArrowRight/Left`, `CaretRight/Left`, `ArrowUpRight`, `ArrowUUpLeft`, `PaperPlaneTilt`)
   take `rtl:-scale-x-100`. Never flip logos, `Sparkle`, `Check`, chart data, numbers.
3. Flex/grid mirror automatically; no `row-reverse` hacks.

## 5. Copy & i18n

English only (PRD non-goal). Strings live in `src/features/<f>/copy.ts` or `src/lib/copy.ts`; microcopy is owned by
`docs/uxer/06-content-and-motion.md`. Post-state labels are exact: `Idea · Briefed · Drafting · Needs assets ·
In review · MR open · Live · Decaying`. Sentence case; ` · ` meta separator; no exclamation marks on decision surfaces.

### 5.5 Visual hierarchy rules (from the glass dashboard — binding)

- **VH1** One frosted shell per viewport over two wash orbs; content is white on glass.
- **VH2** Rail: 48px column; 48px white circle mark (`AsteriskSimple`) on top; 44px round white buttons with ink
  icons (19px); **active = ink fill + white icon**; lifecycle group middle, utilities + avatar bottom, flex spacers
  between; dot badge 9px + 2px white ring at top-end.
- **VH3** Top bar: 44px white pills — site switcher (tenant bubble 28 + name GS 500 14 + domain Poppins 12 `ink-5`
  decorative + caret), 320px search with `⌘K` kbd, `AgentStatusPill`, round icon buttons — and **one black pill CTA
  at inline-end**.
- **VH4** Widget card: white r22 → header `[icon 18–20] Title (GS 500 15) … (↗ 32px outline round)` → meta Poppins
  12 `ink-3` → content → footer "View all …" `ink-3` 12 + `PaginationDots` (active = ink bar 14×4, others 4×4 `line-3`).
- **VH5** Bold title / grey meta in every list item: title GS 500 15 `ink`; meta Poppins 12 `ink-3`; times tabular.
- **VH6** Stacked card columns with 12 gap on glass; selection = 1.5px ink outline, not a fill.
- **VH7** One black pill CTA per region.
- **VH8** Status chips tiny and tonal: 20–22h, GS 500 11–12, `*-soft` bg + `*-ink` text + dot/icon.
- **VH9** Composer docked at the bottom of work panes: sunken r22 field 52h, attach/format icons at start, mic +
  36px ink round send at end; suggestion chips row above.
- **VH10** Big light numerals (GS 400 34/44, −0.02em) with a 12px `ink-3` caption and a `SourceNote`.
- **VH11** Three-column rhythm at ≥ 1440: list 320 · work pane flex · widget rail 320; gaps 16; panes white r24.
- **VH12** Separate by space, not lines; dividers only inside cards.
- **VH13** Avatar stacks end in an ink +N bubble; toggles are ink-on; action-icon rows are 36px outline round buttons.

## 6. Web application structure

```
apps/cms/
├─ app/                           thin page.tsx shells ONLY (≤ 20 lines) — each renders one feature module
│  ├─ layout.tsx                  <html lang="en">, font links, globals.css, metadata, themeColor
│  ├─ page.tsx                    redirect → /plan
│  ├─ (app)/layout.tsx            AppFrame + IconRail + TopBar + ToastProvider + store provider
│  ├─ (app)/plan/page.tsx         /plan (?view=board|calendar|matrix), /plan/new (Sheet)
│  ├─ (app)/posts/…               /posts, /posts/[id], /posts/[id]/versions, /posts/[id]/assets
│  ├─ (app)/assets|templates|approvals|merge-requests|seo|runs|settings/…
│  ├─ onboarding/page.tsx         AppFrame wash="green", no rail
│  └─ styleguide/page.tsx         dev-only kit gallery (§14)
├─ src/
│  ├─ ds/                         THE KIT — import only via "@/ds"
│  │  ├─ tokens.css               the ONLY color-literal file
│  │  ├─ globals.css              tailwind import, @theme inline aliases, base, utilities (.glass .glass-strong .wash-orb .press .tabular .c-skeleton .c-pulse .c-spin)
│  │  ├─ icons.tsx                Phosphor registry → TIconName; the only @phosphor-icons/react import
│  │  ├─ shell.tsx · controls.tsx · surfaces.tsx · charts.tsx · domain.tsx
│  │  ├─ ds.test.ts               guards: color source, logical props, contrast, kit completeness
│  │  └─ index.ts                 barrel
│  ├─ features/<module>/          plan · editor · assets · templates · approvals · merge-requests · seo · runs · settings · onboarding · styleguide
│  └─ lib/                        types.ts · seed.ts (Lumen Dental) · store.ts · logic.ts (KAS, gates, ledger, spend) · format.ts · permissions.ts · copy.ts
└─ middleware.ts                  edge gate (when auth lands; §13)
```

Rules: `page.tsx` resolves params and renders one feature module — no markup, no data logic. Feature code imports UI
from `@/ds` and types from `@/lib/types`; it never imports Phosphor, never writes color/radius/shadow/z literals,
never calls `fetch` (v1 reads the store; later slices swap the store for a typed client without touching features).
Charts are inline SVG with tokens — no chart library.

## 7. Shared shells

One shell, `AppFrame`, with two configurations:

1. **Workspace** (every app route): `AppFrame` (L1–L3) → `flex gap-4 p-4` → `IconRail` + content column (`flex-1
   min-w-0 flex-col gap-4`) → `TopBar` → `PageHeader` → route body (`SplitPane` or card grid). Rail items (UXER 02):
   Mark → `/plan`; Plan (`Kanban`), Editor (`NotePencil` → last opened post), Images (`ImagesSquare`, amber dot if
   human-only slots), Templates (`BracketsAngle`), Approvals (`SealCheck`, red dot if waiting), SEO (`ChartLineUp`);
   bottom: Runs (`ClockCounterClockwise`, amber dot if ledger overdue), Settings (`GearSix`), avatar (menu: account,
   role switcher, sign out). Top bar: `SiteSwitcher` · `CommandSearch` (⌘K → `CommandPalette`) · spacer ·
   `AgentStatusPill` · bell (`/notifications` sheet) · calendar (`/plan?view=calendar`) · the route's primary CTA.
2. **Wizard** (`/onboarding`, `/templates/ingest`): `AppFrame wash="green"`, centered column max 880, `Stepper` on
   top, one primary (Continue / Confirm) at the column end, ends in a versioned summary.

Mobile < 768: rail → `MobileTabBar` (`.glass-strong`, Plan · Editor · Approvals · SEO · More; More → bottom `Sheet`
with Images, Templates, Runs, Settings; safe-area padding). `SplitPane` stacks < 1024; its aside becomes a `Sheet`
at 768–1023.

## 8. Surface map — layout intent, primary actions, permission gates

Roles are per site: `TRole = "specialist" | "developer" | "stakeholder" | "admin"`. Permission strings follow
`cms:<domain>:<action>`, resolved by `can(role, perm)` in `src/lib/permissions.ts`:

| Permission | Specialist | Developer | Stakeholder | Admin |
|---|---|---|---|---|
| `cms:plan:read` `cms:seo:read` `cms:posts:read` `cms:posts:comment` | ✓ | ✓ | ✓ | ✓ |
| `cms:plan:write` `cms:posts:edit` `cms:agent:instruct` | ✓ | – | – | ✓ |
| `cms:posts:approve` `cms:gate:override-soft` | ✓ | – | – | ✓ (never bypasses hard blocks) |
| `cms:assets:select` `cms:assets:upload` `cms:assets:human-only` | ✓ | – | – | ✓ |
| `cms:runs:read` | ✓ | ✓ | – | ✓ |
| `cms:runs:trigger` `cms:prune:signoff` | ✓ | – | – | ✓ |
| `cms:templates:ingest` `cms:repo:configure` `cms:mr:review` | – | ✓ | – | ✓ |
| `cms:budgets:edit` `cms:routing:edit` `cms:members:manage` `cms:sites:add` `cms:billing` | – | – | – | ✓ |
| `cms:audit:read` | – | ✓ | – | ✓ |

There is **no** permission that resolves a fact marker without a source or rewrite. Merging happens on the Git host.

| Route | Layout intent | Region primary | Gate |
|---|---|---|---|
| `/onboarding` | Wizard: site → repo → paths/branch → Search Console → template hand-off; versioned summary | Continue / Finish | `cms:repo:configure` |
| `/plan` | `StatStrip` · Board (8 `PipelineColumn`s) / Calendar (`CalendarWeekGrid`) / Pillar matrix (`PillarMatrix`) via `SegmentedControl` · right rail: compact trajectory + `ConcentrationGauge` + ledger | New idea | read `cms:plan:read`; drag/promote `cms:plan:write` |
| `/plan/new` | `Sheet`: topic or keyword | Add idea | `cms:plan:write` |
| `/posts` | `DataTable` of posts, state/pillar filters | New idea | `cms:posts:read` |
| `/posts/[id]` | `SplitPane`: draft (`FactHighlight`, inline `AgentDiff`, docked `Composer`) · `TemplatePreview` · rail (`GateChecklist`, `FactMarkerCard`, `VersionList`, `CommentThread`) | Approve (`LockedAction`) | read all; edit `cms:posts:edit`; approve `cms:posts:approve` |
| `/posts/[id]/versions` | `Sheet`: `VersionList` + diff vs live | Restore | restore `cms:posts:edit` |
| `/posts/[id]/assets` | `SlotRow`s · `CandidateGrid` · `PromptEditor` (estimate) · spec `KeyValue` · `ProvenanceCard` | Use candidate | `cms:assets:*` |
| `/assets` | Cross-post slot queue, human-only first | Open slot | `cms:assets:select` |
| `/templates` | Manifest list, versions, output format | Ingest template | `cms:templates:ingest` (others read-only) |
| `/templates/ingest` | Upload › Parse › Confirm › Versioned: `FileDrop`, `SourceCodeFrame` ↔ `ManifestMappingRow`, `OutputFormatPicker` | Confirm manifest | `cms:templates:ingest` |
| `/approvals` | `ApprovalQueueItem` list · `ReadinessGrid` + `OverrideReason` + `AssertionList` · `MRPreview` + `ScopeNote` | Approve and open MR | `cms:posts:approve` |
| `/merge-requests` | MRs with `CIStatus`, conflicts, `Timeline` | Open in host | `cms:posts:read` |
| `/seo` | Gap-to-projection `StatTile lg` + `TrajectoryChart` · `StatusLight` × 4 · `KasTable` · `ShareBar` · `ConcentrationGauge` · content performance; each with `SourceNote`/`DataGap` | Open report | `cms:seo:read` |
| `/seo/reports` | Stored editions + reader | — | `cms:seo:read` |
| `/runs` | `ScheduleRow`s (Run now + estimate) · `RunRow` log · `LedgerItem`s · `BudgetCard`s | Run now | read `cms:runs:read`; trigger `cms:runs:trigger` |
| `/settings` | `Tabs`: Site & repo · Providers & budgets · Model routing · Members & roles · Brand pack · Audit log | Save | tab-level permissions above |
| `/styleguide` | Kit harness | — | dev only |

Every surface designs **five states: loaded · empty · loading (skeleton matching loaded geometry) · error
(`Callout tone="block"` + Retry) · permission-denied (in-shell `EmptyState` with `LockSimple`, the role that can act,
who to ask)**. Empty states carry exactly one constructive action when the role can take it. The rail hides routes
the role cannot read; inside a readable route, actions are never hidden (`RoleGate` / `LockedAction`).

## 9. Component kit inventory

Build these in `src/ds/`, names and props exactly as `docs/uxer/05-component-inventory.md`, styled only with tokens,
RTL-clean, with default · hover · focus-visible · pressed · disabled (+ loading where async), `className` passthrough,
`data-kit` root. Buttons, pills, chips, icon buttons and rail buttons are pills (`--c-radius-pill`); md height 44.

- **shell.tsx (11)** — `AppFrame`, `IconRail`, `RailButton`, `TopBar`, `SiteSwitcher`, `CommandSearch`,
  `CommandPalette`, `AgentStatusPill`, `PageHeader`, `MobileTabBar`, `SplitPane`.
- **controls.tsx (19)** — `Icon`; `Button` (`primary` ink fill + `on-ink`, hover `ink-hover`; `secondary` white +
  `line` edge; `ghost`; `glass`; `danger` `block-soft` + `block-ink`; `agent` `agent-soft` + `agent-ink` — there is
  deliberately no amber button); `IconButton` (white · ink · ghost · outline; sm 32 visual / 44 hit, md 44; `label`
  required); `SegmentedControl` (white track, ink active pill); `Tabs`; `TextField`, `TextArea` (counter turns block
  over max); `Select`; `Checkbox`; `Toggle` (ink on); `Chip`; `Dot`; `Kbd`; `Menu` (r18, float); `Tooltip`;
  `Composer`; `FileDrop` (2px dashed `line-3`, r24); `Stepper`; `LockedAction`.
- **surfaces.tsx (22)** — `Card` (solid · glass · sunken · outline · ink; selected 1.5px ink), `CardHeader` (auto ↗
  outline IconButton with `href`), `Section`, `StatStrip`, `StatTile`, `KeyValue`, `Callout`, `SourceNote`,
  `DataGap` (dashed, reason, optional Connect), `EmptyState`, `Skeleton`, `ProgressBar`, `Meter` (`warnAt` → human,
  over → block), `PaginationDots`, `Avatar`, `AvatarStack`, `Timeline`, `DataTable` (hairline rows, sticky
  `sunken-2` header, numeric columns `text-end` tabular, card rows < 768), `Sheet`, `Dialog`,
  `ToastProvider`/`useToast` (Undo action, live region), `Divider`.
- **charts.tsx (7)** — `TrajectoryChart` (ink actual + area, dashed `ink-3` projection, gaps as broken line + "no
  data"), `Sparkline`, `ShareBar`, `StatusLight` (always with its number), `ConcentrationGauge` (threshold 60 →
  "fragile"), `CalendarWeekGrid`, `PillarMatrix`.
- **domain.tsx (35)** — `StateChip`, `AgentBadge`, `HumanBadge`, `PostCard`, `PipelineColumn`, `GateChecklist`,
  `FactMarkerCard`, `FactHighlight`, `AgentDiff`, `VersionList`, `OriginTag`, `TemplatePreview`, `SlotRow`,
  `CandidateGrid`, `ProviderBadge`, `PromptEditor`, `ProvenanceCard`, `ManifestMappingRow`, `SourceCodeFrame`,
  `OutputFormatPicker`, `ApprovalQueueItem`, `ReadinessGrid`, `OverrideReason`, `AssertionList`, `MRPreview`,
  `CIStatus`, `KasRow`, `KasTable`, `LedgerItem`, `RunRow`, `ScheduleRow`, `BudgetCard`, `RoleGate`,
  `CommentThread`, `ScopeNote`.

Owner → tone for `StateChip` / `PipelineColumn`: Idea, Briefed, Drafting, Decaying = `agent`; Needs assets = `human`
when a human-only slot exists, else `agent`; In review = `human`; MR open = `ink` (developer); Live = `pass`.
Feature code creates no components of its own; a missing need is added to the inventory, kit and styleguide together.

### 9.1 Test-first development (mandatory)

Every kit component, shell and logic module is built red → green → refactor with vitest + Testing Library
(`@testing-library/react`, `jsdom`). Minimum per component: every variant/state renders; icon-only controls have
accessible names; tone components assert glyph + text (Agent-blue / Human-amber non-color invariant); keyboard
behavior (Menu, Tabs, SegmentedControl, CommandPalette, Sheet/Dialog trap + Esc + restore). Logic first: `canApprove`,
gate severity, ledger aging, KAS normalization, `wouldExceedCap`, format helpers. Coverage ≥ 90% statements and
branches on `src/ds/**` and `src/lib/**` (barrels excluded by explicit list). Every test must fail when its subject
is deleted.

## 10. Agent-specific component patterns

All agent carriers live in `src/ds/domain.tsx` / `controls.tsx` and are the only consumers of `--c-agent*` besides
tone-driven primitives.

1. **`AgentBadge`** — blue `Sparkle`/`Robot` + label (+ optional `model` tier: fast · workhorse · strongest). Heads
   every agent artifact: ideas (source "Keyword swarm" / "KAS gap"), drafts, candidates, reports.
2. **`AgentStatusPill`** — top bar, "N agents running" with pulsing blue dot (4px `agent-soft` ring); 0 → grey dot
   "Agents idle"; click → `/runs` filtered to running. In cards: `ProgressBar tone="agent"` "Writing section 4 of 7".
3. **`AgentDiff`** — inline at the edited block, never a modal: blue header "Agent edit · "tighten this section"",
   before (strike-through, `block-soft`), after (`pass-soft`), Reject (ghost) · Accept (secondary ink). Accept writes
   a version tagged `agent-edit` and toasts Undo. Agent text enters a draft by no other path.
4. **`Composer`** — docked at the bottom of the draft pane; suggestion chips (Tighten · Add FAQ · Rewrite direct
   answer · Change angle); `busy` state; results always arrive as `AgentDiff`.
5. **`FactHighlight` + `FactMarkerCard`** — open marker: red underline + `block-soft` mark; card "Unsourced
   statistic · Can't override" + agent note + **Add source** (URL) · **Rewrite without it** (`Button agent`). No
   dismiss, no override, no role unlocks it; `canApprove` is false while any marker is open.
6. **Provenance** — `OriginTag` on every version (agent-generation · agent-edit · human-edit · refresh);
   `ProviderBadge` ("Flux via MCP", "OpenAI · API", "Inline SVG · no model"); `ProvenanceCard` (provider, model,
   prompt, generated date, licensing); MR description line "Agent-drafted · approved by {name}".
7. **Run cost estimate before execution** — every control that starts a run shows its estimate before click ("Run
   now · est. $0.40", "Est. $0.12 per regenerate"). If `wouldExceedCap`, it renders `LockedAction` "Refused · would
   exceed image cap ($196 / $200)" with a link to budgets. `RunRow` shows cost vs estimate and `refused-over-cap`
   in `block`. `BudgetCard`/`Meter`: ≥ 80% → human tone alert; at cap → block "Runs refuse above cap".
8. **Human-only handoff** — `SlotRow` human-only (dashed `human-line`, `HumanBadge` "Human-only · waiting on you")
   moves to the ledger with brief attached; `LedgerItem` ages neutral → Overdue (7 d, human) → Blocker (14 d, block,
   downstream cost stated).
9. **Never invent** — `DataGap` for missing connections; chart gaps as broken lines; `TemplatePreview` shows "Renders
   with site classes · no invented markup" and, when the template lacks a structure, the post is held with
   `Callout tone="block"` asking the developer to extend the template.

## 11. Accessibility bar — WCAG 2.2 AA

- **Contrast**: §2.1 contract verified by test and axe; no pair outside it carries text.
- **Target size**: all targets ≥ 44×44 (32px visuals expand hit area via `::after`); nothing below 24×24 (2.5.8).
- **Focus**: visible ring everywhere; not obscured by sticky top bar or tab bar (`scroll-padding-block`); sheets and
  dialogs trap and restore focus; route change moves focus to the page `h1`; skip link first.
- **Keyboard**: every action pointer-free; board drag has a "Move to…" menu alternative (2.5.7); roving tabindex in
  tabs/segments; ⌘K / Ctrl K palette with arrows, Enter, Esc; no positive `tabindex`.
- **Screen readers**: agent attribution and blocker reasons are real text; `AgentStatusPill` and toasts in polite
  live regions, refusals/errors assertive; `LockedAction` reasons via `aria-describedby`; charts have text summaries.
- **Not color alone**: every tone = glyph + text; the UI stays legible in grayscale.
- **Forms**: errors name the field and link via `aria-describedby`; focus first invalid; `OverrideReason` ≥ 20 chars.
- **Consistent help, redundant entry, accessible auth** (3.2.6, 3.3.7, 3.3.8): help in the same top-bar slot; the
  wizard never re-asks entered values; OAuth for Search Console.
- **Motion & reflow**: reduced motion honored; 320px width without horizontal page scroll.

## 12. Responsive strategy

Breakpoints **390 (design) · 768 · 1024 · 1440 (reference)**, declared once in `globals.css` `@theme`
(`--breakpoint-sm: 390px; --breakpoint-md: 768px; --breakpoint-lg: 1024px; --breakpoint-xl: 1440px`). < 768: shell
inset 0 radius 0, `MobileTabBar`, panes stack, tables → card rows, board → snapping columns with `StatStrip` as
switcher, editor → tabs Draft · Preview · Gate with docked composer. 768–1023: rail visible, aside → `Sheet`.
1024–1439: main + aside 320, third pane → tabs. ≥ 1440: three-column rhythm. Specialist paths (`/plan`,
`/posts/[id]`, `/approvals`) are designed at 390 too; developer wizards optimize ≥ 1024 and stay operable at 768.

## 13. Gate UX & edge behavior

- **Hard block** (open fact marker, unfilled slot, fail in gate sections 1–5, unsatisfiable template): `block`
  tone + `XCircle` + "Hard block · section N" + **Fix** link to the cause. Approve renders `LockedAction` "Approve ·
  N hard blocks". Nobody can override.
- **Soft block** (words below target, < 2 internal links, missing usual schema): `human` tone + "Soft block ·
  override with a reason" → `OverrideReason` (≥ 20 chars) + "Logged to the audit trail and listed in the MR";
  stored `{ reason, by, at }`; listed in `MRPreview`.
- **Approval**: `AssertionList` (facts right · voice right · brand stands behind it) + `ReadinessGrid` (fact markers,
  image slots, on-page, template) + `MRPreview` with `ScopeNote` ("Writes only to content/blog and
  public/images/blog. Never pushes to main."). Clean post = 4 clicks.
- **`RoleGate` never hides**: renders its fallback — disabled control + "Your role can't approve posts · ask {name}
  (specialist)". Stakeholders keep comment access.
- **Edge (when auth lands, `middleware.ts`)**: default-deny app routes → `/login?next=`; landing: developer with no
  repo → `/onboarding`, developer → `/merge-requests`, others → `/plan`; denied route → in-shell denied panel (HTTP
  200, shell intact, no loop); `/styleguide` dev only. Deep links land exactly (`/approvals?post=`,
  `/posts/<id>/assets?slot=`, `/seo/reports?edition=`).

## 14. Styleguide route — the verification harness

Build `app/styleguide/page.tsx` → `src/features/styleguide` (excluded from production): every §9 component in every
variant and state, each wrapped in `<Kit name="…">` (`data-kit`), fixtures from `src/lib/seed` (Lumen Dental);
`AppFrame` at 390 and 1440 frames; all 8 `StateChip`s; `GateChecklist` pass/fail/warn/overridden; `FactMarkerCard`
open/resolved; `AgentDiff` pending/accepted/rejected; every `SlotRow` status; `LedgerItem` at 3/9/15 days;
`RunRow refused-over-cap`; `DataGap`; five-state fixtures for board, table and card list; a role switcher showing
`RoleGate` fallbacks. The automated checks below drive this page.

## Definition of Done

Run from `apps/cms`.

1. **Token file is the single color source.** `grep -c "^\s*--c-" src/ds/tokens.css` ≥ 90, and `grep -rEn
   "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(" src app --include=*.ts --include=*.tsx --include=*.css | grep -v
   "src/ds/tokens.css"` returns **zero** lines (sole documented exception: `themeColor` in `app/layout.tsx`). No
   arbitrary color classes: `grep -rEn "(bg|text|border|ring|fill|stroke|from|to)-\[#" src app` → 0.
2. **Zero physical direction.** `grep -rEn "margin-(left|right)|padding-(left|right)|border-(left|right)|text-align:\s*(left|right)|[^-a-z](left|right)\s*:" src app --include=*.css --include=*.tsx` → 0 and `grep -rEn "[\"' \`](-?m[lr]|p[lr]|-?left|-?right|border-[lr]|rounded-[lr]|rounded-(tl|tr|bl|br)|text-(left|right)|float-(left|right))-?[0-9a-z\[]" src app --include=*.tsx` → 0.
3. **Agent-blue and Human-amber are kit-scoped.** `grep -rEn "(bg|text|border|ring|fill|stroke|outline|shadow)-(agent|human)|--c-(agent|human)" src/features app` → 0; every agent/human carrier test asserts glyph + text.
4. **Two families, two weights.** `grep -rEn "font-(thin|light|semibold|bold|extrabold|black)|font-weight:\s*(100|200|300|600|700|800|900)" src app` → 0; `grep -rEn "font-family" src app | grep -v "src/ds/"` → 0.
5. **One primary per region.** Playwright on every route and `/styleguide`: per `[data-region]`, `[data-variant="primary"]` count ≤ 1 (row-level `size="sm"` primaries carry `data-variant="inline"`).
6. **Icons from the registry.** `grep -rn "@phosphor-icons/react" src app | grep -v "src/ds/icons.tsx"` → 0.
7. **Every metric has SourceNote/DataGap.** `grep -rlE "<(StatTile|TrajectoryChart|KasTable|ShareBar|ConcentrationGauge|StatusLight|Sparkline|Meter)\b" src/features | xargs -r grep -LE "<(SourceNote|DataGap)\b"` → no files; unit tests prove `null` metrics never render `0`.
8. **Tokens only for z, radius, shadow, blur.** `grep -rEn "z-\[|z-index:\s*[0-9]|rounded-\[|shadow-\[|blur-\[" src app | grep -v "src/ds/"` → 0.
9. **PRD non-negotiables in logic tests.** `canApprove` is false with any open fact marker for every role and override state; soft override needs reason ≥ 20 chars; `wouldExceedCap` refuses; ledger 7 → Overdue, 14 → Blocker; KAS shares sum to 100 ± 0.01.
10. **Contrast verified.** `src/ds/ds.test.ts` parses `tokens.css` and asserts every §2.1 text pair ≥ 4.5 (incl. glass-over-wash worst case) and graphics pair ≥ 3; `@axe-core/playwright` on `/styleguide` → 0 `color-contrast` violations.
11. **Kit completeness.** `/styleguide` `[data-kit]` set equals the 94 component names of `docs/uxer/05-component-inventory.md`.
12. **Thin shells.** Every `app/**/page.tsx` in §8 exists, is ≤ 20 lines, and imports from `@/features/`.
13. **Five states per surface** — fixtures exist and each empty state has exactly one action.
14. **Responsive & targets** — Playwright at 390 / 768 / 1024 / 1440: `MobileTabBar` only < 768; no horizontal scroll at 320; every interactive element's hit area ≥ 44×44 at 390.
15. **Reduced motion** — with `reducedMotion: "reduce"`, computed `animation-duration`/`transition-duration` are `0s` on `.c-pulse`, `.c-skeleton`, sheets, toasts.
16. **Green build.** `pnpm --filter @studio/cms typecheck && pnpm --filter @studio/cms test && pnpm --filter @studio/cms build` exit 0; coverage thresholds (§9.1) met.

Do not mark the design system complete, and do not start feature slices, until every check above passes with
evidence (Playwright-dependent checks 5, 10-axe, 13–15 are verified manually on `/styleguide` with screenshots until
Playwright is added).
