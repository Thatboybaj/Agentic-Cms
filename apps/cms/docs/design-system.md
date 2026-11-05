# Agentic CMS — Design System (binding UI contract)

Structure follows the Nawa template (`docs/nawa-template/02-design-system.md`): principles → tokens → binding
color rules → radii/shadow/space/z/focus/motion → typography → visual hierarchy → shells → RTL → copy →
web-app structure → surface map → component kit → agent patterns → a11y → responsive → gate UX → styleguide →
Definition of Done. **Content is derived from the UXER output** (`docs/uxer/`), not from taste: every component
exists because the inventory (`05-component-inventory.md`) names it, and every rule cites a principle
(P1–P7, `01-jobs-and-principles.md`) or a resolved conflict (C1–C9, `00-decisions.md`).

The lift-and-use build prompt that regenerates this system from zero is `docs/02-design-system.cms.md`.

| Source | Role | Binding for |
|---|---|---|
| `docs/prd-source.txt` | Product requirements (25 Sep 2026) | Roles, gates, guardrails, data model |
| `docs/reference/0[1-6] *.dc.html` | Six reference screens, desktop 1440×900 + mobile 390 | Values: type, radii, color, layout |
| `docs/visual-aid.png` | Glass mail-dashboard | **Visual hierarchy** (§5) |
| `docs/uxer/00`, `01`, `02`, `05` | Decisions, principles, IA, inventory | Names, props, rules |
| `docs/uxer/03-flows.md`, `04-screen-specs.md`, `06-content-and-motion.md` | Flows, per-screen specs, copy + motion | Click budgets, five states, microcopy, motion detail |
| `src/ds/tokens.css` | The **only** color-literal file | Every value in §2 |
| `src/ds/globals.css` | Tailwind v4 `@theme inline` aliases + base + utilities | Class names (`bg-surface`, `text-ink-3`, `rounded-xl`) |
| `src/ds/icons.tsx` | Phosphor registry, `TIconName` | Icon vocabulary |

---

## 1. Principles (UXER 01 — each has a checkable rule)

| # | Principle | Checkable rule (UXER) | Consequence for the kit |
|---|---|---|---|
| P1 | **Stuck is louder than busy** | Human-blocked counts render `human` tone; agent-busy never outranks them; blockers in first viewport | `StatStrip` item `tone="human"` = amber tile; `PostCard` blocker lines sit above meta; `PipelineColumn` owner label; rail dots (amber/red) outrank the blue `AgentStatusPill` visually (filled tile vs dot) |
| P2 | **The machine is always labelled** | Anything agent-produced/producing/suggested carries `AgentBadge` or `agent` tone | Agent-blue rule §2.3; `AgentBadge`, `OriginTag`, `ProviderBadge`, `AgentDiff` header, `AgentStatusPill`, `Button variant="agent"` |
| P3 | **Diffs, not overwrites** | No agent mutation without `AgentDiff`; undo `Toast` for every human mutation | `AgentDiff` inline (C9); `useToast()` with `action: { label: "Undo" }`; `VersionList` + `OriginTag` |
| P4 | **Blocks explain themselves** | Every disabled primary shows why inline + links to fix; hard = red, soft = amber + reason | `LockedAction`, `GateChecklist` (Fix / Override), `OverrideReason`, `RoleGate` fallback (C7) |
| P5 | **One black button** | Exactly one `Button variant="primary"` per view region | Primary = ink pill; `data-variant="primary"` + `data-region` hooks; DoD check 5 |
| P6 | **Numbers carry their source** | Every metric shows source/lag (`SourceNote`); missing = `DataGap`, never 0 | Charts render gaps as broken lines; `StatTile` has no zero fallback; DoD check 7 |
| P7 | **Setup is twice, then invisible** | Developer surfaces are wizards ending in a versioned summary; nothing dev-ish on specialist daily screens | `Stepper`, `FileDrop`, `ManifestMappingRow`, `SourceCodeFrame`; `ScopeNote` is the only repo fact on specialist screens (PRD non-negotiable 6) |

Tie-breaker order when principles conflict: **P4 > P1 > P2 > P6 > P3 > P5 > P7** (a blocked approval must explain
itself before anything else; a stuck human item outranks a labelled agent item).

---

## 2. Token system — `--c-*` (`src/ds/tokens.css`)

`tokens.css` is the only file in `apps/cms` that may contain raw color literals (hex / rgb / rgba / hsl / oklch).
`globals.css` imports it and maps every token to a Tailwind v4 alias (`--color-<name>: var(--c-<name>)`), so feature
code writes `bg-surface text-ink-3 rounded-xl shadow-card` — never a literal, never an arbitrary value
(`bg-[#…]`, `rounded-[…]`). Inline SVG uses `currentColor` or `var(--c-*)`. Enforced by DoD 1.

### 2.1 Color roles

**Canvas & glass** (the hierarchy of §2.5)

| Token | Value | Tailwind | Use |
|---|---|---|---|
| `--c-page` | `#E4E6EA` | `bg-page` | Behind the app frame (desktop gutters > 1440) · `body` background |
| `--c-canvas` | `#EEF0F3` | `bg-canvas` | App frame under the washes · `themeColor` |
| `--c-glass` | `rgba(255,255,255,.45)` | `bg-glass` / `.glass` | **The one frosted shell** |
| `--c-glass-strong` | `rgba(255,255,255,.72)` | `.glass-strong` | Mobile tab bar, floating bars, glass cards on a wash |
| `--c-glass-edge` | `rgba(255,255,255,.9)` | `border-glass-edge` | 1px edge on glass |
| `--c-surface` | `#FFFFFF` | `bg-surface` | Cards, pills, inputs, rail buttons |
| `--c-sunken` | `#F3F4F6` | `bg-sunken` | Chips, active stat tile, kbd, composer field |
| `--c-sunken-2` | `#F6F7F8` | `bg-sunken-2` | Table header, code frame |
| `--c-scrim` | `rgba(17,19,23,.28)` | `bg-scrim` | Sheet / dialog scrim |
| `--c-wash-blue` · `-peach` · `-green` · `-neutral` | `#CDE1F1` · `#F3E0D4` · `#D6ECDF` · `#DFE2E7` | `bg-wash-*` | Wash orbs only — never a fill for content |
| `--c-tenant` | `#EAF0F7` | `bg-tenant` | Tenant icon bubble in `SiteSwitcher` |
| `--c-avatar` | `#DCE3EA` | `bg-avatar` | Initial bubbles |
| `--c-art-1…4` | `#F4D5A0` `#C9E4FB` `#E3E0F0` `#F1EDE9` | `bg-art-*` | Placeholder candidate art (no stock images) |

**Ink & lines**

| Token | Value | Use | Contrast (canvas / surface / sunken / worst glass) |
|---|---|---|---|
| `--c-ink` | `#111317` | Primary text **and the only action fill** (primary pill, active rail, selected outline, toggle on) | 16.3 / 18.6 / 16.9 / 15.9 |
| `--c-on-ink` | `#FFFFFF` | Text/icons on ink | 18.6 on ink |
| `--c-ink-hover` | `#2A2D33` | Primary hover | — |
| `--c-ink-2` | `#44484F` | Long-form body in the editor draft | 8.1 / 9.2 / 8.4 |
| `--c-ink-3` | `#5F6470` | Secondary text, meta, subtitles, `SourceNote` | **5.19 / 5.93 / 5.39 / 5.08** ✅ AA |
| `--c-ink-4` | `#8A8F98` | Icons, large meta (≥ 18.66px @500 / ≥ 24px) — see finding below | 2.85 / 3.25 / 2.95 ❌ text AA |
| `--c-ink-5` | `#A0A4AB` | Placeholders, disabled — never body text | 2.19 / 2.50 / 2.27 |
| `--c-line` | `#EDEEF0` | Card edges, outline ↗ buttons | graphics |
| `--c-line-2` | `#E6E7EA` | Dividers, table rows | graphics |
| `--c-line-3` | `#D9DBDF` | Dashed drop zones, strong outlines, scrollbar | graphics |

**Tones** (`TTone = neutral | ink | agent | human | block | pass | info`, `src/lib/types.ts`)

| Tone | Graphic (dot/icon/bar) | Text | Soft bg | Line | Meaning |
|---|---|---|---|---|---|
| `agent` | `--c-agent #3E6FD8` | `--c-agent-ink #2F58B5` (6.60 white · 5.71 soft) | `--c-agent-soft #E8EFFC` | `--c-agent-line #9DB6E6` | The machine did / is doing / suggests this (§2.3) |
| `human` | `--c-human #B7791F` (3.64 white, graphics ✅) | `--c-human-ink #8A5A12` (5.91 white · 5.28 soft) | `--c-human-soft #FBF1DF` | `--c-human-line #E0B563` | Waiting on a person (§2.4) |
| `block` | `--c-block #E5483C` (3.94 white) | `--c-block-ink #B8392F` (5.73 white · 4.90 soft) | `--c-block-soft #FCE9E7` | — | Hard block, decaying, destructive, failed |
| `pass` | `--c-pass #2F9E6B` (3.37 white) | `--c-pass-ink #237A52` (5.28 white · 4.70 soft) | `--c-pass-soft #E7F5EE` | — | Passing check, Live, gains |
| `info` | `--c-ink-3` | `--c-ink-3` (5.29 on info-soft) | `--c-info-soft #F1F2F4` | — | Neutral informational, refresh origin |
| `neutral` | `--c-ink-4` | `--c-ink-3` | `--c-sunken` | — | Pillar tags, counts |
| `ink` | `--c-ink` | `--c-on-ink` | `--c-ink` | — | "Pillar" chip, developer-owned (MR open), +N bubble |

`--c-focus: rgba(62,111,216,.45)` — the focus ring (§2.6).

### 2.2 Text-safety contract & contrast fixes

- **Text-safe** (≥ 4.5:1): `ink`, `ink-2`, `ink-3`, `*-ink` tone tokens on `surface`, `canvas`, `sunken`, `sunken-2`,
  glass (worst case over a wash orb), and on their own `*-soft`. `on-ink` on `ink` (18.6) and on `agent` (4.70).
- **Graphics-only** (≥ 3:1, never text < 24px): `agent`, `human`, `block`, `pass`, `ink-4` (on surface only).
- **C4 — the ink-3 AA fix.** The refs use `#6B7079` for secondary text: 4.36:1 on canvas (fails AA at 13px). The
  token is darkened to `#5F6470` → 5.19 canvas / 5.93 surface / 5.39 sunken / 5.08 worst glass. Refs' `#6B7079` is
  **void**; any sampled value maps to `ink-3`.
- **Finding — ink-4 is not text-safe.** `#8A8F98` is 3.25:1 on white, 2.85:1 on canvas. The visual aid's grey meta
  ("09:45 AM – 10:15 PM", "View all Webinars") therefore uses **`ink-3`**, not `ink-4`. `ink-4` is allowed only for
  icons, large text (≥ 24px), and meta that is duplicated in an accessible name. `tokens.css`'s comment "meta
  labels ≥ 12px" is superseded by this rule.
- **Finding — no white text on saturated tone fills.** White on `block` = 3.94, on `pass` = 3.37. The visual aid's
  filled red "Urgent" chip is re-drawn **tonal** (`block-soft` + `block-ink`). Only `ink` and `agent` fills may
  carry white text (`Dot`, rail badges carry no text).

### 2.3 The Agent-blue rule (binding — replaces Nawa's amber rule, C1)

Blue (`--c-agent*`) means **the machine did, is doing, or suggests this**. Users learn it once; the system never
lies about it.

- `agent*` tokens may be consumed **only** inside `src/ds/**` (kit components that take `tone="agent"` or are
  agent carriers: `AgentBadge`, `AgentStatusPill`, `AgentDiff`, `OriginTag`, `ProviderBadge`, `ProgressBar`,
  `StateChip`, `Chip`, `Dot`, `Callout`, `Button variant="agent"`, `Composer`, `CandidateGrid`, `RunRow`).
  Feature code selects blue only through a `tone="agent"` prop — never `bg-agent-*` / `text-agent-*` classes (DoD 3).
- Every blue element also renders a **non-color cue**: the `Sparkle` or `Robot` glyph **and** a text label
  ("Agent", "Agent edit", "2 agents running", the agent's name, or the provider/model). Color is never the only cue.
- Blue is **never** a primary action fill, link color, selected state, chart series, brand accent, or decoration.
  Links are ink with underline on hover; selection is an ink outline; charts are ink.
- Blue on a chart means **agent-produced projection or agent-flagged point** only (e.g. KAS gap marker). Actual data is ink.
- Agent-owned post states (`Idea`, `Briefed`, `Drafting`, `Decaying`) render `agent` tone; the tone follows the
  **owner**, not the importance (UXER 02 state machine).
- Two system exceptions, both transient and content-free: `--c-focus` (keyboard focus ring) and `::selection`
  (`agent-soft`). Neither may appear at rest on content. (Alternative if review disagrees: switch `--c-focus` to
  `rgba(17,19,23,.35)`; no other change needed.)
- An agent action the human triggers uses `Button variant="agent"` (blue text on `agent-soft`, e.g. "Rewrite without
  it"); the **human decision** that commits agent output (Accept, Approve, Use) is ink/secondary — accepting is a
  human act.

### 2.4 The Human-amber rule (binding, C1)

Amber (`--c-human*`) means **this is waiting on a person**. It is the loudest non-error signal in the product (P1).

- Amber may be consumed only inside `src/ds/**`, selected by `tone="human"` (`HumanBadge`, `StatStrip` human
  tile, `LedgerItem` Overdue, `OverrideReason`, soft-block rows in `GateChecklist`, `Meter` ≥ `warnAt`,
  `ShareBar` claimed-but-unearned, `StateChip` Needs assets / In review, rail dot on Images / Runs, `SlotRow`
  human-only, `Callout tone="human"`).
- Every amber element pairs with the `Hand`, `UserFocus` or `HourglassMedium` glyph **and** text naming whose move
  it is ("Human-only · waiting on you", "Overdue · 9 days", "Soft block · override with a reason").
- Amber is **never** a generic warning. There is no `warning` tone: a problem is either `block` (red: hard, cannot
  proceed) or `human` (amber: a person must act, including soft blocks and budget ≥ 80%).
- Amber outranks blue everywhere they co-occur: in `StatStrip` the human tile is a filled `human-soft` tile, agent
  counts are text + dot; in a `PostCard` a human blocker line sits above the agent progress bar.
- Red (`block`) is reserved for **hard** stops and human-confirmed failures: unresolved fact marker, failing
  hard gate item (sections 1–5), unfilled slot at approval, template the renderer cannot satisfy, CI red, over-cap
  refusal, ledger item ≥ 14 days, destructive confirm. Never for an agent guess.

### 2.5 Wash / glass hierarchy (visual aid → exact values)

Depth ladder, back to front. A layer may only sit on the layer directly below it (or on L3 for L4); no skipping
upward, no nesting glass in glass.

| L | Layer | Value | Rule |
|---|---|---|---|
| L0 | Page | `--c-page #E4E6EA` | Only visible > 1440px or around the 24px-radius frame in the styleguide |
| L1 | Canvas | `--c-canvas #EEF0F3` | `AppFrame` root, `position:relative; overflow:hidden` |
| L2 | Wash orbs | Desktop: blue 760×760 at `inset-inline-start:-220px; inset-block-start:-260px`, `blur(120px)`; peach 760×760 at `inset-inline-end:-240px; inset-block-end:-300px`, `blur(130px)`. Mobile: 460×460, `blur(90px)`, offsets −160/−180 and −180/−160 | `.wash-orb` + `bg-wash-*`; `pointer-events:none`; `AppFrame wash` picks the pair (default `blue-peach`; `green` onboarding/success; `neutral` settings) |
| L3 | Glass shell | `inset:16px` (`--c-shell-inset`), `border-radius:32px`, `--c-glass` 45%, 1px `--c-glass-edge`, `backdrop-filter: blur(24px) saturate(1.2)`, padding 16, gap 16 | **Exactly one per viewport** (`.glass`). Mobile: shell drops to inset 0 / radius 0, washes stay |
| L4 | White cards & pills | `--c-surface`, `radius 22` (cards) / `999` (pills, 44h), `--c-shadow-card` | Sit directly on glass. No border on cards; `--c-line` only on outline buttons |
| L5 | Sunken chips / tiles | `--c-sunken` / `--c-sunken-2`, radius 12–16 or pill | Only **inside** L4. Never directly on glass |
| L6 | Ink accents | `--c-ink` | Active rail button, the one primary pill, selected card outline (1.5px), toggle on, +N bubble, active pagination bar |
| L7 | Overlays | `--c-scrim` + white sheet `radius 28`, `--c-shadow-sheet`; menus white `radius 18`, `--c-shadow-float` | Above the shell; `.glass-strong` for floating bars |

### 2.6 Radius · elevation · space · z · focus · motion

| Radius token | px | Use (refs) |
|---|---|---|
| `--c-radius-xs` | 6 | Kbd, code chips, mono selectors |
| `--c-radius-sm` | 12 | Mini tiles, inputs inside cards, candidate tiles |
| `--c-radius-md` | 16 | Stat tiles, list rows, callouts |
| `--c-radius-lg` | 18 | Menus, inner cards, `PostCard` |
| `--c-radius-xl` | 22 | **Cards**, `StatStrip` track, top-bar pills' track |
| `--c-radius-2xl` | 24 | Panes, `FileDrop`, app frame (styleguide) |
| `--c-radius-3xl` | 28 | Sheets, dialogs |
| `--c-radius-shell` | 32 | The frosted shell only |
| `--c-radius-pill` | 999 | Buttons, chips, icon buttons, rail buttons, avatars, inputs in top bar |

| Elevation | Value | Use |
|---|---|---|
| `--c-shadow-card` | `0 1px 2px rgba(17,19,23,.04)` | Resting cards/pills (cards are flat white on glass) |
| `--c-shadow-raised` | `0 6px 20px rgba(17,19,23,.07)` | Hover on interactive cards, selected segment, dragged card |
| `--c-shadow-float` | `0 12px 32px rgba(17,19,23,.12)` | Menus, tooltips, toasts, command palette |
| `--c-shadow-sheet` | `0 24px 64px rgba(17,19,23,.18)` | Sheets, dialogs |

Space: 4px base — `--c-space-1…10` = 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40. Shell inset 16, pane gap 16, card padding
16–20 (`md`) / 24 (`lg`), card-list gap 12, top-bar gap 10. Controls: `--c-control-h 44` (pills, icon buttons, rail
buttons), `--c-control-h-sm 34` (visual 32–34; hit area expanded to 44 by pseudo-element), `--c-rail-w 48`.

Z-scale (only these): `--c-z-sticky 150` · `--c-z-nav 200` · `--c-z-dropdown 300` · `--c-z-overlay 400` ·
`--c-z-modal 500` · `--c-z-toast 600`.

Focus: every interactive element under `:focus-visible` → `box-shadow: 0 0 0 3px var(--c-focus)` (globals base),
added to — never replacing — its resting edge. `outline:none` is allowed only because the ring replaces it.

Motion (detail in `docs/uxer/06-content-and-motion.md`):

| Token | Value | Use |
|---|---|---|
| `--c-dur-1` | 120ms | Press (`.press` → `scale(.97)`) |
| `--c-dur-2` | 200ms | Hover, color, toggle, segment |
| `--c-dur-3` | 320ms | Sheets, card reorder, diff accept collapse |
| `--c-dur-4` | 600ms | Chart draw-in (once) |
| `--c-ease-out` | `cubic-bezier(.22,1,.36,1)` | Default |
| `--c-ease-spring` | `cubic-bezier(.34,1.4,.64,1)` | Toggle knob, chip select, candidate pick |
| Loops | `.c-pulse` 1.8s (agent running dot), `.c-skeleton` 1.4s, `.c-spin` 0.9s | The only infinite animations |

`prefers-reduced-motion: reduce` → all durations 0 (globals), sheets fade, no chart draw, pulse becomes a static ring.

---

## 3. Typography — General Sans + Poppins (C2)

Loaded in `app/layout.tsx`: Fontshare `general-sans@400,500`, Google `Poppins:wght@400;500`, `display=swap`.

| Family | Token | Weight | Carries |
|---|---|---|---|
| **General Sans** | `--c-font-display` · `font-display` | **500** | Titles, headings, UI labels, buttons, pills, chips, tabs, numbers ≤ 22px, stat values, table headers, rail tooltips, kbd |
| General Sans | same | 400 | **Big light numerals only** (≥ 34px: gap-to-projection, clock-style times, hero KPIs) — the visual aid's light "10:30" |
| **Poppins** | `--c-font-body` · `font-sans` (body default) | **400** | Body, meta, captions, subtitles, placeholders, hints, editor prose, `SourceNote`, table cells (non-numeric) |
| Mono | `--c-font-mono` | 400 | CSS selectors, file paths, branch names, ranking URLs |

Rules: two weights only (400/500) — no 600/700, no faux bold, no italics in UI chrome (editor content may italicize
author text), no `text-transform: uppercase` (eyebrows are sentence case in `ink-3`). `h1–h4` and `button` inherit
General Sans 500 from globals base.

### 3.1 Size scale → uses

| Token | px | Family/weight | Uses |
|---|---|---|---|
| `text-2xs` | 10 | GS 500 | Rail badge counts, chart axis ticks |
| `text-xs` | 11 | GS 500 | Stat labels, column meta, kbd, tiny status chips |
| `text-sm` | 12 | Poppins 400 / GS 500 (chips) | Card meta, chips, `SourceNote`, timestamps |
| `text-md` | 13 | Poppins 400 / GS 500 (sm buttons) | Body in cards, subtitles, `PageHeader` subtitle, sm buttons |
| `text-base` | 14 | Poppins 400 / GS 500 | Default UI text, pills, md buttons, inputs, table cells |
| `text-lg` | 15 | GS 500 | Card titles (`CardHeader`, `PostCard`), list-row titles |
| `text-xl` | 17 | GS 500 | Pane titles, stat values in strips |
| `text-2xl` | 22 | GS 500 | Section heroes, `StatTile md` |
| `text-3xl` | 26 | GS 500, −0.01em | Page title (`PageHeader`) |
| `text-4xl` | 34 | GS 400, −0.02em | Big numbers (`StatTile lg`: gap to projection) |
| `text-5xl` | 44 | GS 400, −0.02em | Visual-aid clock numerals (next run time, countdowns) |

Leading: `--c-leading-tight 1.15` (≥ 22px) · `-snug 1.3` (titles) · `-body 1.55` (UI) · `-prose 1.7` (editor draft).
Tracking: `-tight −0.01em` ≥ 22px · `-tighter −0.02em` ≥ 34px · 0 elsewhere.

### 3.2 Numeral policy (binding)

- All numbers `font-variant-numeric: tabular-nums` (`.tabular`) in tables, strips, tiles, meters, costs, tokens.
- Locale `en-US` only (PRD non-goal: multi-language). Formatting only through `src/lib/format.ts`; feature code never
  calls `toLocaleString`/`toFixed` directly.

| Helper | Output | Rule |
|---|---|---|
| `formatUsd(n)` | `$0.12` · `$4.80` · `$142` · `$1,240` | USD, `Intl.NumberFormat("en-US",{style:"currency",currency:"USD"})`; 2 decimals < $100, 0 decimals ≥ $100 |
| `formatInt(n)` | `12,480` | Grouped |
| `formatCompact(n)` | `12.4k` · `1.2M` | Impressions, tokens in dense rows |
| `formatPct(n)` | `18.0%` · `−6.2%` | 1 decimal; **U+2212 minus** |
| `formatDelta(n, unit)` | `+1.4 pp` · `−3` | Signed; KAS deltas in percentage points |
| `formatPosition(n)` | `7.2` · `—` | `null` → em dash **inside a `DataGap`/tooltip explaining why**, never `0` |
| `formatDate(d)` | `Sep 25` · `Fri, Sep 25` · `Sep 25, 2026` | Year only when ≠ current |
| `formatAge(days)` | `3 d` · `Overdue · 9 d` · `Blocker · 15 d` | Ledger thresholds 7 / 14 (PRD) |
| `formatRange(a,b)` | `09:45–10:15` | En dash, no spaces |

Missing data never formats as `0`, `$0`, `0%` — it renders `DataGap` (P6, PRD M6).

---

## 4. Copy & i18n

English only in v1 (PRD non-goal; UXER 00 locale row). Microcopy, state labels and error strings are owned by
`docs/uxer/06-content-and-motion.md`; post-state labels are exact: `Idea · Briefed · Drafting · Needs assets ·
In review · MR open · Live · Decaying`. Strings live in one module per feature (`src/features/<f>/copy.ts`) or in
`src/lib/copy.ts` for shared ones, so a v2 dictionary swap is mechanical. Sentence case everywhere; ` · ` as the
meta separator; numbers via §3.2 helpers.

---

## 5. Visual hierarchy rules (from `visual-aid.png`)

| # | Rule | Kit carrier |
|---|---|---|
| VH1 | **One frosted shell** per viewport over two wash orbs; everything else is white on glass | `AppFrame` |
| VH2 | **Rail of 44px round buttons** in a 48px column: product mark (48px white circle, `AsteriskSimple`) on top, lifecycle group in the middle, utilities + avatar at the bottom, flexible spacers between groups. Default = white bg + ink icon; **active = ink fill + white icon**; dot badge 9px with 2px white ring at top-end | `IconRail`, `RailButton` |
| VH3 | **Top bar = row of white 44px pills** (site switcher, 320px search with ⌘K kbd, status pill, round icon buttons) with **one black pill CTA at inline-end** | `TopBar`, `SiteSwitcher`, `CommandSearch`, `AgentStatusPill`, `IconButton`, `Button primary` |
| VH4 | **Widget card anatomy**: white r22 card → header row `[icon] Title ............ (↗)` — 18–20px icon in ink, title GS 500 15px, circular 32px outline ↗ button at end → optional meta line Poppins 12 `ink-3` → content → footer "View all …" (`ink-3`, 12) + `PaginationDots` at end | `Card` + `CardHeader href` + `PaginationDots` |
| VH5 | **Bold title / grey meta** in every list item: title GS 500 15 `ink`, secondary name 13, meta Poppins 12 `ink-3`, times `.tabular` | `PostCard`, `ApprovalQueueItem`, `SlotRow`, `RunRow` |
| VH6 | **Stacked card column** (the mail list): white cards, 12 gap, on glass; selected = 1.5px ink outline, not a fill | `Card selected`, `PipelineColumn` |
| VH7 | **One black pill CTA per region** (P5): primary is ink, everything else white/glass/ghost | `Button variant="primary"` |
| VH8 | **Status chips tiny and tonal**: 20–22px tall, `text-xs`/`text-sm` GS 500, `*-soft` bg + `*-ink` text + dot/icon; never saturated fill with white text (§2.2) | `Chip`, `StateChip`, `Dot` |
| VH9 | **Composer docked at the bottom of work panes**: sunken rounded field (r22, 52h) inside the pane, attach/format icons at start, placeholder Poppins 13, mic + **ink round send (36)** at end; suggestion chips row above | `Composer` |
| VH10 | **Big light numerals** for time and headline metrics: GS 400 34/44, −0.02em, `ink`, with a Poppins 12 `ink-3` caption below and a `SourceNote` | `StatTile size="lg"`, `ScheduleRow` next-run |
| VH11 | **Three-column rhythm** at ≥ 1440: list column (320) · work pane (flex) · widget rail (320); 16 gaps; panes are white r24 | `SplitPane` |
| VH12 | **Separation by space, not lines**: cards/gaps separate; `Divider` only inside a card (table rows, KeyValue) | `Divider`, `DataTable` |
| VH13 | **Avatar stack with ink +N bubble**; switches as ink-on toggles; round action icon rows (reply, flag, archive) as 36px outline icon buttons | `AvatarStack`, `Toggle`, `IconButton outline` |

---

## 6. Layout & shells

Every app route renders inside **one** `AppFrame`; the rail, top bar and content live in the shell.

| Shell part | Spec |
|---|---|
| `AppFrame` | L1–L3 of §2.5. Desktop: `display:flex; gap:16; padding:16` inside the shell → `IconRail` + content column (`flex:1; min-width:0; flex-direction:column; gap:16`). `wash` prop per route family |
| `IconRail` | 48w, items per UXER 02 (Plan · Editor · Images · Templates · Approvals · SEO │ Runs · Settings · Avatar). Tooltip label on hover/focus (`Tooltip`, `--c-z-dropdown`). Dots: Images amber (human-only slots), Approvals red (waiting), Runs amber (ledger overdue). `aria-current="page"` on active |
| `TopBar` | 44px row, gap 10: `SiteSwitcher` · `CommandSearch` · spacer · `AgentStatusPill` · bell · calendar · **one route CTA** (`New idea` /plan, `Approve` editor, `Run now` /runs; table §8) |
| `PageHeader` | Title 26 GS 500 −0.01em; subtitle Poppins 13 `ink-3`; `actions` at inline-end (secondary only if the top bar holds the primary); optional `back`/`crumbs` |
| `SplitPane` | Main + aside (default 320) — editor: content · preview · rail; approvals: queue (320) · gate · MR preview. Panes = white r24 (`Card variant="solid" padding="none"`) |
| `Sheet` | `side="end"` (desktop, width 440–560) / `"bottom"` (mobile); scrim `--c-scrim`; white r28 leading corners |
| `MobileTabBar` | ≤ 767: `.glass-strong`, bottom, 5 items (Plan · Editor · Approvals · SEO · More), 44 targets, `padding-block-end: env(safe-area-inset-bottom)`; More → `Sheet bottom` with Images, Templates, Runs, Settings |

Breakpoints (single source; declare in `globals.css` `@theme` as `--breakpoint-sm: 390px; --breakpoint-md: 768px;
--breakpoint-lg: 1024px; --breakpoint-xl: 1440px` — currently Tailwind defaults are in effect; add these before feature
work):

| Width | Layout |
|---|---|
| 390 (design) → 767 | Shell inset 0, radius 0; rail hidden → `MobileTabBar`; top bar = site switcher + search icon + status dot + CTA; panes stack; tables → card rows |
| 768–1023 | Rail visible; `SplitPane` aside becomes a `Sheet` toggled from `PageHeader`; board columns scroll horizontally (snap) |
| 1024–1439 | Two columns (main + aside 320); three-pane screens collapse the third into tabs |
| ≥ 1440 (reference) | Full three-column rhythm (VH11) |

---

## 7. RTL readiness (English-only v1)

No RTL locale ships (PRD). Logical properties are still mandatory so RTL is a `dir` flip, not a rebuild:
`ms-/me-/ps-/pe-/start-/end-/border-s/border-e/rounded-s/rounded-e/text-start/text-end` in Tailwind;
`margin-inline-*`, `padding-inline-*`, `inset-inline-*`, `border-start-start-radius` in CSS. Physical `left/right`
properties and `ml/mr/pl/pr/left-/right-/text-left/text-right/rounded-l/rounded-r` classes are **banned** (DoD 2).
Directional icons (`ArrowRight`, `ArrowLeft`, `CaretRight`, `CaretLeft`, `ArrowUpRight`, `ArrowUUpLeft`,
`PaperPlaneTilt`) take `rtl:-scale-x-100`; never flip logos, `Sparkle`, `Check`, charts' data, numbers.
Wash orbs use inline-start/end so they mirror.

---

## 8. Web-app structure & surface map

```
apps/cms/
├─ app/                          thin page.tsx shells (≤ 20 lines) → one feature module each
│  ├─ layout.tsx                 fonts, globals.css, <html lang="en">
│  ├─ page.tsx                   redirect → /plan
│  ├─ (app)/layout.tsx           AppFrame + IconRail + TopBar + ToastProvider
│  ├─ (app)/plan|posts|assets|templates|approvals|merge-requests|seo|runs|settings/…
│  ├─ onboarding/page.tsx        wizard (AppFrame wash="green", no rail)
│  └─ styleguide/page.tsx        verification harness (dev only, §14)
└─ src/
   ├─ ds/                        the kit: tokens.css · globals.css · icons.tsx · shell · controls · surfaces · charts · domain · index.ts
   ├─ features/<module>/         real page bodies (plan, editor, assets, templates, approvals, mrs, seo, runs, settings, onboarding)
   └─ lib/                       types.ts · seed · store · logic (KAS, gates, ledger, spend) · format.ts · permissions.ts · copy.ts
```

Feature code imports UI **only** from `@/ds` and types from `@/lib/types`. No `fetch` in components; v1 reads the
client store (deterministic mocked integrations, UXER 00 scope cuts).

### 8.1 Roles & permissions (PRD "Users and roles")

`TRole = specialist | developer | stakeholder | admin`, per site. Permission strings `cms:<domain>:<action>`,
resolved by `can(role, perm)` in `src/lib/permissions.ts`.

| Permission | Specialist | Developer | Stakeholder | Admin |
|---|---|---|---|---|
| `cms:plan:read` · `cms:seo:read` · `cms:posts:read` · `cms:posts:comment` | ✓ | ✓ | ✓ | ✓ |
| `cms:plan:write` (new idea, promote, reschedule) | ✓ | – | – | ✓ |
| `cms:posts:edit` · `cms:agent:instruct` | ✓ | – | – | ✓ |
| `cms:posts:approve` (the one gate) · `cms:gate:override-soft` | ✓ | – | – | ✓ (never bypasses hard blocks) |
| `cms:assets:select` · `cms:assets:upload` · `cms:assets:human-only` | ✓ | – | – | ✓ |
| `cms:runs:read` · `cms:runs:trigger` · `cms:prune:signoff` | ✓ | read only | – | ✓ |
| `cms:templates:ingest` · `cms:repo:configure` · `cms:mr:review` | – | ✓ | – | ✓ |
| `cms:budgets:edit` · `cms:routing:edit` · `cms:members:manage` · `cms:sites:add` · `cms:billing` | – | – | – | ✓ |
| `cms:audit:read` | – | ✓ | – | ✓ |
| Resolve a fact marker by override | **nobody** — no permission exists (PRD, UXER non-negotiable 1) ||||

Merging happens on the Git host; the CMS shows MR state and links out (PRD non-goal: direct publishing).

### 8.2 Surface map

Every surface designs **five states: loaded · empty · loading (skeleton) · error · permission-denied** (detail per
screen in `04-screen-specs.md`). Error = `Callout tone="block"` + Retry; denied = in-shell `EmptyState` with
`LockSimple`, the role that can do it, and who to ask — never a blank page or redirect loop.

| Route | Layout intent | Region primary (one ink pill) | Read gate | Action gates |
|---|---|---|---|---|
| `/onboarding` | `Stepper` wizard: site → repo → paths/branch → Search Console → template hand-off; ends in versioned summary (P7) | Continue / Finish | `cms:repo:configure` | — |
| `/plan` | `StatStrip` (pipeline counts, human tile loud) · Board (`PipelineColumn` × 8) / Calendar / Pillar matrix via `SegmentedControl` (C6) · right rail: compact trajectory + KAS concentration (C5) + ledger | **New idea** | `cms:plan:read` | drag/promote `cms:plan:write` |
| `/plan/new` | `Sheet` over /plan: topic or keyword, estimate note | Add idea | `cms:plan:write` | — |
| `/posts` | `DataTable` of all posts, state/pillar filters | New idea | `cms:posts:read` | — |
| `/posts/[id]` | `SplitPane`: draft (with `FactHighlight`, `AgentDiff` inline) · `TemplatePreview` · rail (`GateChecklist`, `FactMarkerCard`s, `VersionList`, `CommentThread`); `Composer` docked at bottom of the draft pane | **Approve** (`LockedAction` while blocked) | `cms:posts:read` | edit `cms:posts:edit`; approve `cms:posts:approve`; comment all |
| `/posts/[id]/versions` | `Sheet`: `VersionList` + diff vs live | Restore | `cms:posts:read` | restore `cms:posts:edit` |
| `/posts/[id]/assets` | `SlotRow` list · `CandidateGrid` · `PromptEditor` (estimate) · `KeyValue` spec · `ProvenanceCard` | **Use candidate** | `cms:posts:read` | `cms:assets:*` |
| `/assets` | Cross-post slot queue, human-only first (P1) | Open slot | `cms:posts:read` | `cms:assets:*` |
| `/templates` | Manifest list (versions, output format) | Ingest template | `cms:templates:ingest` (others: read-only `RoleGate`) | — |
| `/templates/ingest` | `Stepper` Upload › Parse › Confirm › Versioned: `FileDrop`, `SourceCodeFrame` ↔ `ManifestMappingRow`s, `OutputFormatPicker` | Confirm manifest | `cms:templates:ingest` | — |
| `/approvals` | Queue (`ApprovalQueueItem`) · gate (`ReadinessGrid`, `OverrideReason`, `AssertionList`) · `MRPreview` + `ScopeNote` | **Approve and open MR** | `cms:posts:read` | `cms:posts:approve` |
| `/merge-requests` | MR list with `CIStatus`, conflicts, post `Timeline` | Open in host | `cms:posts:read` | — |
| `/seo` | Gap-to-projection `StatTile lg` + `TrajectoryChart` · `StatusLight`s · `KasTable` · `ShareBar` · `ConcentrationGauge` · content performance; every block with `SourceNote` / `DataGap` | Open report | `cms:seo:read` | — |
| `/seo/reports` | Stored editions list + reader | — (read) | `cms:seo:read` | — |
| `/runs` | `ScheduleRow`s (Run now · estimate) · run log (`RunRow`) · `LedgerItem`s · `BudgetCard`s | **Run now** | `cms:runs:read` | `cms:runs:trigger` |
| `/settings` | `Tabs`: Site & repo · Providers & budgets · Model routing · Members & roles · Brand pack · Audit log | Save | any member (tabs gated) | per tab: `cms:repo:configure` / `cms:budgets:edit` / `cms:routing:edit` / `cms:members:manage` / `cms:audit:read` |
| `/styleguide` | Kit gallery, all variants/states | — | dev only | — |

Rail visibility: the rail hides routes a role cannot **read** (stakeholder: no Images, Templates, Runs); inside
readable routes, actions are **never hidden** — they render via `RoleGate` / `LockedAction` with the reason (C7).

Post-login landing (`homeForRole`, first match): developer with no repo → `/onboarding`; developer → `/merge-requests`;
everyone else → `/plan`. Deep links from UXER 02 land exactly (`/approvals?post=`, `/posts/<id>/assets?slot=`,
`/seo/reports?edition=`).

---

## 9. Component kit — 94 components (+ `useToast` hook), 1:1 with `docs/uxer/05-component-inventory.md`

Names and props are binding (inventory). Every component: default · hover · focus-visible · pressed · disabled
(+ loading where listed); accepts `className`; root carries `data-kit="<Name>"` for the styleguide and tests.
Tones only via `tone: TTone` props.

| File | Component | Variants / states |
|---|---|---|
| `shell.tsx` | `AppFrame` | `wash`: blue-peach · blue · peach · green · neutral; desktop / mobile |
| | `IconRail` · `RailButton` | default · hover · active (ink) · focus · dot(tone) |
| | `TopBar` | — |
| | `SiteSwitcher` | closed · open (Menu) · single-site (no caret) |
| | `CommandSearch` · `CommandPalette` | idle · open · filtered · empty result · arrow-key active |
| | `AgentStatusPill` | running N (blue pulse) · idle (grey dot "Agents idle") |
| | `PageHeader` | title · +subtitle · +actions · +back/crumbs |
| | `MobileTabBar` | active item · with More sheet |
| | `SplitPane` | 2-col · aside collapsed (< 1024 stacks) |
| `controls.tsx` | `Icon` | regular · bold · fill; registry names only |
| | `Button` | primary · secondary · ghost · glass · danger · agent × sm/md/lg; loading (width preserved); icon/trailing; `href` |
| | `IconButton` | white · ink · ghost · outline × sm(32)/md(44); `dot`; label required |
| | `SegmentedControl` | 2–4 options; active ink pill |
| | `Tabs` | text tabs, ink active, counts |
| | `TextField` · `TextArea` | default · focus · hint · error · counter (block when over) · disabled |
| | `Select` | closed · open · with hint · disabled |
| | `Checkbox` · `Toggle` | off · on (ink) · disabled · with caption |
| | `Chip` | tone × sm/md; icon; removable |
| | `Dot` | tone; pulse; ring |
| | `Kbd` · `Tooltip` · `Menu` | Menu items: default · tone · disabled; align start/end |
| | `Composer` | empty · typing · with suggestions · busy (send → spinner, input disabled) |
| | `FileDrop` | idle · drag-over · uploading · rejected type |
| | `Stepper` | done (green check) · current (ink number) · upcoming |
| | `LockedAction` | locked (lock icon + "· N hard blocks", tooltip reasons) · unlocked (= primary) |
| `surfaces.tsx` | `Card` · `CardHeader` | solid · glass · sunken · outline · ink; padding sm/md/lg/none; interactive; selected (1.5px ink) |
| | `Section` | title · count · meta · action |
| | `StatStrip` | items with tone; active (sunken); human (amber tile); clickable |
| | `StatTile` | md · lg (light numerals); delta tone; caption |
| | `KeyValue` | default · dense |
| | `Callout` | agent · human · block · info (+ neutral); with action |
| | `SourceNote` · `DataGap` | — · with action (Connect) |
| | `EmptyState` · `Skeleton` | exactly one action · radius |
| | `ProgressBar` · `Meter` | tone; label; `Meter` ≥ warnAt → human tone, ≥ max → block |
| | `PaginationDots` | count/index; active ink bar |
| | `Avatar` · `AvatarStack` | 24/32/44; +N ink bubble |
| | `Timeline` | item tones |
| | `DataTable` | sortable; row click; empty; dense; < 768 card rows |
| | `Sheet` · `Dialog` | open · closing · closed; end/bottom; footer |
| | `ToastProvider` / `useToast` | neutral · pass · block · with Undo action |
| | `Divider` | horizontal · vertical |
| `charts.tsx` | `TrajectoryChart` | sessions/impressions; projection dashed; gap segment + "no data" |
| | `Sparkline` · `ShareBar` · `StatusLight` · `ConcentrationGauge` | invert; claimed-but-unearned (human + note); green/amber/red + number; above threshold "fragile" |
| | `CalendarWeekGrid` · `PillarMatrix` | under target week; thin pillar flagged |
| `domain.tsx` | `StateChip` | 8 states, owner tone (UXER 02) |
| | `AgentBadge` · `HumanBadge` | running; model · label |
| | `PostCard` | idea · drafting (progress) · needs-assets (slot tiles) · in-review (blocker lines) · selected · dragging |
| | `PipelineColumn` | owner agent/human/developer/system/mixed; drop target |
| | `GateChecklist` | pass · fail (hard, Fix) · warn (soft, Override) · overridden |
| | `FactMarkerCard` · `FactHighlight` | open ("Can't override") · resolved |
| | `AgentDiff` | pending · accepted · rejected |
| | `VersionList` · `OriginTag` | current; restore; diff · agent-generation/agent-edit/human-edit/refresh |
| | `TemplatePreview` | desktop · mobile |
| | `SlotRow` · `CandidateGrid` · `ProviderBadge` · `PromptEditor` · `ProvenanceCard` | queued · generating · candidates · selected · human-only · failed |
| | `ManifestMappingRow` · `SourceCodeFrame` · `OutputFormatPicker` | mapped · needs-you · absent · rendered/source |
| | `ApprovalQueueItem` · `ReadinessGrid` · `OverrideReason` · `AssertionList` | blocks count; tone per item; reason empty/valid; 0–3 checked |
| | `MRPreview` · `CIStatus` · `ScopeNote` | open · merged · closed · conflict; CI pending/pass/fail |
| | `KasRow` / `KasTable` | orphan chip; Δ pass/block; decaying |
| | `LedgerItem` | < 7 neutral · 7–13 Overdue (human) · ≥ 14 Blocker (block) + downstream |
| | `RunRow` · `ScheduleRow` · `BudgetCard` | queued · running · succeeded · failed · refused-over-cap; estimate first; 80% alert |
| | `RoleGate` · `CommentThread` | fallback (disabled + reason) · read-only |

No component outside this list may be created in feature code. A missing need is added to the inventory, the kit,
and `/styleguide` in the same change.

### 9.1 Test-first (mandatory)

vitest + Testing Library (`@testing-library/react`, `jsdom` — add as devDependencies), red → green → refactor.
Per component, minimum: renders every variant/state listed above; accessible name for every icon-only control;
tone components assert the glyph + text cue (Agent-blue / Human-amber non-color rule); keyboard behavior where
interactive (Menu, Tabs, SegmentedControl, CommandPalette, Sheet/Dialog focus trap + Esc + restore). Domain logic
(`src/lib/logic*`: `canApprove`, gate severity, ledger aging, KAS normalize-to-100, spend `wouldExceedCap`,
`formatX`) is tested first — these encode the PRD non-negotiables. Coverage ≥ 90% statements/branches on
`src/ds/**` and `src/lib/**` (barrels excluded by explicit list). Tests must fail when the subject is deleted.

---

## 10. Agent-specific patterns (replaces Nawa §10 AI patterns)

| Pattern | Component(s) | Binding behavior |
|---|---|---|
| **Attribution** | `AgentBadge` | Blue `Sparkle` (suggestion/output) or `Robot` (running actor) + label, optional `model` ("workhorse · …"). Wraps or heads every agent artifact: drafts, candidates, ideas, reports, KAS gap ideas. P2 |
| **Agent running** | `AgentStatusPill`, `ProgressBar tone="agent"`, `Dot pulse` | Top bar pill "N agents running" (click → `/runs` filtered running). In-card progress "Writing section 4 of 7". Pulse is the only looping blue; reduced motion → static ring |
| **Diff accept/reject** | `AgentDiff` | Inline at the block (C9), not a modal: blue header "Agent edit · "tighten this section"" + `AgentBadge`; before = strike-through on `block-soft`; after = `pass-soft`; actions Reject (ghost) · Accept (secondary ink). Accept creates version (`OriginTag agent-edit`) + Undo toast. No agent text enters the draft any other way (P3) |
| **Instructing the agent** | `Composer` | Docked at pane bottom (VH9); suggestion chips ("Tighten", "Add FAQ", "Rewrite direct answer", "Change angle"); `busy` while running; output always returns as `AgentDiff` |
| **Fact marker — no override** | `FactHighlight`, `FactMarkerCard` | Open marker = red underline + `block-soft` mark in the draft; card: "Unsourced statistic · Can't override" + note + actions **Add source (URL)** · **Rewrite without it** (`Button agent`). No dismiss, no override, no permission unlocks it; `canApprove` is false while any marker is open (PRD, non-negotiable 1) |
| **Provenance** | `OriginTag`, `ProviderBadge`, `ProvenanceCard`, MR description | Every version tagged by origin; every asset: provider, model, prompt, generated date, licensing note (`Fingerprint`). Approved output keeps "Agent-drafted · approved by {name}" in the MR description |
| **Run cost estimate before execution** | `ScheduleRow`, `PromptEditor`, `Button` trailing | Every run-starting control shows its estimate **before** click: "Run now · est. $0.40", "Est. $0.12 per regenerate". If `wouldExceedCap` → control renders `LockedAction` "Refused · would exceed text cap ($196 / $200)" + link to budgets (admin). `RunRow` shows cost vs estimate; `refused-over-cap` status in `block` (PRD spend guardrail) |
| **Budget pressure** | `BudgetCard`, `Meter` | ≥ 80% of cap → human tone + "80% of cap used" callout; at cap → block + "Runs refuse above cap" |
| **Model routing visibility** | `RunRow`, `AgentBadge model` | Tier label (fast · workhorse · strongest) always visible on runs; pillar/money pages show "strongest" on generation |
| **Human-only handoff** | `HumanBadge`, `SlotRow human-only`, `LedgerItem` | Marking a slot human-only moves it to the ledger with brief attached; post holds in Needs assets (amber). Ages to Overdue (7) / Blocker (14) with downstream cost |
| **Never invent** | `DataGap`, `TrajectoryChart` gap, `TemplatePreview` fidelity note | Missing connection/data → dashed `DataGap` with reason + Connect; renderer lacking a structure → post held + `Callout block` "Template has no comparison table · ask developer to extend" |

---

## 11. Accessibility — WCAG 2.2 AA

- **Contrast**: §2.2 contract verified in `src/ds/ds.test.ts` (text ≥ 4.5, graphics ≥ 3) and by axe on `/styleguide`.
- **Target size (2.5.8)**: interactive targets ≥ 44×44 (`--c-control-h`); 32px visual icon buttons expand hit area
  via `::after` inset −6px. Chips that are buttons ≥ 24×24 with spacing (2.5.8 minimum) — prefer 44 rows.
- **Focus appearance / not obscured (2.4.11, 2.4.13)**: 3px ring on every focusable; sticky top bar and mobile tab
  bar never cover the focused element (`scroll-padding-block: 76px 88px`).
- **Keyboard**: everything reachable; rail = links with `aria-current`; `SegmentedControl`/`Tabs` roving tabindex +
  arrows; `CommandPalette` ⌘K/Ctrl K, arrows, Enter, Esc; board cards movable by keyboard (Move to… menu) —
  **dragging has a single-pointer alternative (2.5.7)**; `Sheet`/`Dialog` trap + Esc + restore focus.
- **Redundant entry / accessible auth (3.3.7, 3.3.8)**: onboarding never re-asks repo fields; OAuth for Search
  Console, no cognitive tests.
- **Consistent help (3.2.6)**: help/notifications at the same top-bar position on every route.
- **Not color alone**: every tone carries glyph + text (§2.3, §2.4); charts carry text summaries and gap markers
  labelled "no data".
- **Screen readers**: `AgentStatusPill` and toasts in polite live regions (errors/refusals assertive); agent
  attribution is real text; `LockedAction` exposes reasons via `aria-describedby`.
- **Forms**: `TextField` error text linked by `aria-describedby`; focus first invalid on submit; `OverrideReason`
  requires ≥ 20 chars before Approve unlocks.
- **Motion & reflow**: reduced motion honored globally; 320px reflow without horizontal scroll (board scrolls
  inside its own region with visible affordance).

---

## 12. Responsive

Designed at 1440 × 900 (reference) and 390 (mobile refs). Breakpoints 390 / 768 / 1024 / 1440 (§6). Specialist
daily paths (`/plan`, `/posts/[id]`, `/approvals`) are fully operable at 390: board → horizontally snapping
columns with the `StatStrip` as a column switcher; editor → tabs Draft · Preview · Gate with the composer docked;
approvals → queue list → gate sheet. Developer wizards optimize for ≥ 1024 and remain operable at 768. Tables →
card rows < 768 with a declared field-priority list per table. Touch targets ≥ 44 at every width.

---

## 13. Gate UX (blocks, roles, edge)

| Case | Visual | Behavior |
|---|---|---|
| **Hard block** (fact marker open, slot unfilled, fail in gate sections 1–5, template can't satisfy) | `block` tone, `XCircle`, "Hard block · section 2" | Approve renders `LockedAction` "Approve · 2 hard blocks"; each block has **Fix** jumping to the cause; cannot be overridden by anyone |
| **Soft block** (words < target, < 2 internal links, missing usual schema) | `human` tone, `Warning`, "Soft block · override with a reason" | `OverrideReason` textarea (≥ 20 chars) + note "Logged to the audit trail and listed in the MR"; override stored `{reason, by, at}` and rendered in `MRPreview` unresolved list |
| **Role cannot act** | `RoleGate` fallback: disabled control + "Your role can't approve posts · ask Tolu B. (specialist)" | **Never hidden** (C7); stakeholder sees Approve disabled with reason; comment remains available |
| **Spend cap** | `LockedAction` block | "Refused · would exceed image cap" + link to budgets (admin) |
| **Route denied** | In-shell denied `EmptyState` (`LockSimple`) | HTTP 200, shell + rail intact, no redirect loop |
| **Approval** | `AssertionList` (3) + `ReadinessGrid` (4 checks) + `MRPreview` | Clean post = 4 clicks (3 assertions + Approve and open MR); success toast + state → MR open |

Middleware (`apps/cms/middleware.ts`, when auth lands): default-deny app routes → `/login?next=`; `/styleguide`
dev-only; role landing per §8.2.

---

## 14. Styleguide — `/styleguide` (verification harness)

`app/styleguide/page.tsx` → `src/features/styleguide`. Renders every §9 component in every listed variant/state,
wrapped in `<Kit name="<Name>">` (`data-kit`), grouped by file; fixtures from `src/lib/seed` (Lumen Dental). Includes:
AppFrame at 390/1440 frames, all 8 `StateChip`s, `GateChecklist` with pass/fail/warn/overridden, open + resolved
`FactMarkerCard`, `AgentDiff` in 3 states, every `SlotRow` status, `LedgerItem` at 3/9/15 days, `RunRow`
refused-over-cap, `DataGap`, five-state fixtures (loaded/empty/loading/error/denied) for board, table and card list,
and a role switcher showing `RoleGate` fallbacks. Hidden from production builds.

---

## Definition of Done

Run from `apps/cms`. Every check must pass with evidence before the DS is "done" or a screen merges.

1. **Single color source** — `grep -rEn "#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(" src app --include=*.ts --include=*.tsx --include=*.css | grep -v "src/ds/tokens.css"` → **0 lines**, except the documented `themeColor` in `app/layout.tsx` (move it to a constant imported from `src/ds` when touched). Also `grep -rEn "(bg|text|border|ring|fill|stroke|from|to)-\[#" src app` → 0.
2. **No physical direction** — `grep -rEn "margin-(left|right)|padding-(left|right)|border-(left|right)|text-align:\s*(left|right)|[^-a-z](left|right)\s*:" src app --include=*.css --include=*.tsx` → 0; and `grep -rEn "[\"' \`](-?m[lr]|p[lr]|-?left|-?right|border-[lr]|rounded-[lr]|rounded-(tl|tr|bl|br)|text-(left|right)|float-(left|right))-?[0-9a-z\[]" src app --include=*.tsx` → 0.
3. **Agent-blue & Human-amber scoped to the kit** — `grep -rEn "(bg|text|border|ring|fill|stroke|outline|shadow)-(agent|human)|--c-(agent|human)" src/features app` → 0 (tones only via `tone` props); and every `tone="agent"`/`tone="human"` component test asserts glyph + text.
4. **Two families, two weights** — `grep -rEn "font-(thin|light|semibold|bold|extrabold|black)|font-weight:\s*(100|200|300|600|700|800|900)" src app` → 0; `grep -rEn "font-family" src app | grep -v "src/ds/"` → 0.
5. **One primary per region** — Playwright on every route + `/styleguide`: for each `[data-region]`, `locator('[data-variant="primary"]').count() <= 1` (inline `size="sm"` primaries inside repeated rows carry `data-variant="inline"` and don't count).
6. **Icons from the registry** — `grep -rn "@phosphor-icons/react" src app | grep -v "src/ds/icons.tsx"` → 0.
7. **Every metric has SourceNote/DataGap** — `grep -rlE "<(StatTile|TrajectoryChart|KasTable|ShareBar|ConcentrationGauge|StatusLight|Sparkline|Meter)\b" src/features | xargs -r grep -LE "<(SourceNote|DataGap)\b"` → **no files**; unit test: `formatPosition(null)` ≠ `"0"` and chart gap renders "no data".
8. **Tokens only for z / radius / shadow** — `grep -rEn "z-\[|z-index:\s*[0-9]|rounded-\[|shadow-\[|blur-\[" src app | grep -v "src/ds/"` → 0.
9. **Non-negotiables in logic tests** — `pnpm --filter @studio/cms test` green with: `canApprove` false on any open fact marker regardless of role/override; soft override requires reason ≥ 20; `wouldExceedCap` refuses; ledger 7 → Overdue, 14 → Blocker; KAS shares sum to 100 ± 0.01.
10. **Contrast by test** — `src/ds/ds.test.ts` parses `tokens.css` and asserts §2.2 pairs (ink/ink-2/ink-3/*-ink ≥ 4.5 on canvas, surface, sunken, glass-over-wash worst case; tone graphics ≥ 3 on surface; on-ink ≥ 4.5 on ink and agent). `@axe-core/playwright` on `/styleguide` → 0 `color-contrast` violations.
11. **Kit completeness** — `/styleguide` `[data-kit]` name set **equals** the component names in `docs/uxer/05-component-inventory.md` (94 components; `useToast` is a hook, exercised via the `ToastProvider` fixture). Test in `ds.test.ts`.
12. **Thin shells** — every `app/**/page.tsx` ≤ 20 lines and imports from `@/features/` (`find app -name page.tsx -exec wc -l {} +`).
13. **Five states** — each §8.2 surface has loaded/empty/loading/error/denied fixtures on `/styleguide` or in its feature tests; empty states have exactly one action.
14. **Responsive & targets** — Playwright at 390 / 768 / 1024 / 1440: `MobileTabBar` visible only < 768, rail ≥ 768; no horizontal scroll at 320; every `button, a[href], input, select, [role=tab]` bounding box ≥ 44×44 at 390 (hit-area pseudo counted via `elementFromPoint` probe).
15. **Reduced motion** — Playwright `emulateMedia({ reducedMotion: "reduce" })`: computed `animation-duration` and `transition-duration` are `0s` on `.c-pulse`, `.c-skeleton`, sheets.
16. **Typecheck, test, build** — `pnpm --filter @studio/cms typecheck && pnpm --filter @studio/cms test && pnpm --filter @studio/cms build` exit 0.

Checks 5, 10 (axe), 13–15 need Playwright (not yet a dependency) — until added they are verified manually on
`/styleguide` with screenshots attached to the PR.
