# NAWA — Prompt 02: Design System & Web Architecture

You are building the design system and web-application architecture for **NAWA**, the AI Operating System for QSTP's innovation-program ecosystem (Stars of Science, XLR8, the Incubation Center, Research to Startup, Startup in Residence, and the internship program). This document is the binding UI contract for the entire platform. Every screen shipped in slices `06-intake-copilot.md`, `07-journey-copilot.md`, `08-community-hub.md`, and `09-reports-kpi-engine.md` is built with the tokens, components, shells, and rules defined here — those slices add features, never new visual vocabulary. The API, auth, and IAM machinery this frontend talks to is specified in `01-architecture.md`; read it for the response envelope, the typed api-client, session/cookie behavior, and the permission catalog. Where this document names a permission string, `01-architecture.md`'s contracts package is the authoritative catalog.

## 0. Context recap

NAWA runs one data spine — the **Founder Profile** — under four modules: Intake Copilot, Journey Copilot, Community Hub, and Reports & KPI Engine. Every QSTP program is the same four workflows with a different rubric and milestone configuration. The users are founders, alumni, contestants, interns, mentors, jurors, reviewers, and program managers — a bilingual (Arabic/English) institutional audience that must trust the platform with high-stakes decisions (who gets shortlisted, which venture gets flagged as at-risk). The AI drafts, ranks, and explains; humans decide; every override is audit-logged. The UI must make that division of labor **visible at a glance**.

The web app is Next.js 15+ App Router with TypeScript, running on **:3000**, proxying `/api/*` to the FastAPI service on **:8000** (all routes under `/api/v1`). The frontend is pure UI: no direct database access, HTTP only, through the typed client in `packages/api-client`.

## 1. Design principles

These three principles resolve every design argument. When two options are otherwise equal, the one that better serves a principle wins.

1. **Institutional trust.** NAWA handles applications, scores, KPIs, and decisions that affect people's careers. The surface must read as calm, precise, and official — generous whitespace, a restrained palette anchored in deep teal, no gradients-for-decoration, no playful microcopy on decision surfaces. Every number is traceable: KPI figures, scores, and report claims always offer a path to their source data (tooltip, drill-down, or citation). Destructive and decisive actions (override, reject-from-shortlist, publish report) always confirm and always state the audit consequence.

2. **Bilingual dignity.** Arabic is a first-class language, not a translation afterthought. The layout system is RTL-first: it is designed in Arabic and verified to also work in English, not the reverse. Arabic text gets typography tuned for Arabic script (see §3), never Latin metrics with an Arabic font swapped in. Every string in the UI exists in both Arabic and English with equal editorial quality; a missing Arabic string is a build failure, not a fallback. French is accepted at application ingestion only (§5.4) — the UI itself never renders in French.

3. **AI transparency.** Everything the machine wrote, scored, ranked, matched, or flagged is **visibly attributed and explainable**. The color amber is reserved exclusively for AI-generated and AI-flagged content (§2.2) — a user scanning any screen can tell in under a second which parts came from the model. Every AI output carries (a) the amber marker, (b) a text label ("AI-generated" / "مُولّد بالذكاء الاصطناعي"), and (c) an affordance to see *why* — cited evidence, criteria, or match reasoning. Color is never the only cue: the marker always pairs the amber accent with a sparkle glyph and the text label, so the attribution survives color-blindness and grayscale printing. The AI never renders a rejection; it renders rankings, drafts, and flags that a named human accepts or overrides.

## 2. The `.nw-*` design-token system

All design values live as CSS custom properties in **one file**: `apps/web/src/styles/tokens.css`. This is the only file in the web app permitted to contain raw color literals (hex/rgb/hsl). Every feature module, shell, and component consumes `var(--nw-*)` or a `.nw-*` utility class — never a literal. Inline SVG uses `currentColor` or a `var(--nw-*)` fill. This rule is enforced by grep in the Definition of Done.

`tokens.css` is imported once in the root layout. A companion `apps/web/src/styles/base.css` holds the reset, `body` defaults, and the `.nw-*` component/utility classes (§9) — it also contains zero raw color literals.

### 2.1 Palette

Define exactly these color tokens (values below are the canonical, contrast-checked set — do not improvise alternates):

```css
:root {
	/* Teal — trust, primary actions, links, focus */
	--nw-teal-900: #063A37;
	--nw-teal-700: #0A5C55;  /* primary action bg; text-safe on sand/white (≥ 7:1) */
	--nw-teal-600: #0E6E66;  /* hover state */
	--nw-teal-500: #148A80;  /* borders, icons, charts — GRAPHICS ONLY, not body text */
	--nw-teal-100: #D3ECE9;  /* selected-row / active-nav backgrounds */
	--nw-teal-50:  #EAF6F4;  /* subtle tinted panels */

	/* Amber — RESERVED: AI-generated / AI-flagged content ONLY (see §2.2) */
	--nw-amber-800: #8A5A00; /* AI label text — text-safe on white/sand (≥ 5.9:1) */
	--nw-amber-600: #B87A00; /* AI icons on light backgrounds */
	--nw-amber-500: #E39A0B; /* AI accent borders, sparkle glyph, badge fill — graphics only */
	--nw-amber-100: #FCEFD3; /* AI panel backgrounds */
	--nw-amber-50:  #FEF8EA; /* AI inline-highlight background */

	/* Warm sand — surfaces */
	--nw-sand-50:  #FBF8F3;  /* app background */
	--nw-sand-100: #F4EEE4;  /* recessed panels, table header rows */
	--nw-sand-200: #E9E0D1;  /* hairline borders, dividers */
	--nw-white:    #FFFFFF;  /* cards, inputs, modals */

	/* Ink — text */
	--nw-ink-900: #1C2321;   /* primary text */
	--nw-ink-600: #4A5450;   /* secondary text, captions (≥ 7:1 on sand-50) */
	--nw-ink-400: #7B857F;   /* placeholders & disabled ONLY — below AA for body text */

	/* Semantic status — NOTE: warning is terracotta, NOT amber (amber = AI, always) */
	--nw-success-700: #1E7B34;  --nw-success-100: #E8F5EC;
	--nw-warning-700: #A6470E;  --nw-warning-100: #FBEEE4;  /* terracotta */
	--nw-danger-700:  #B3261E;  --nw-danger-100:  #FCEAE8;
	--nw-info-700:    #22577E;  --nw-info-100:    #E8F1F8;
}
```

Text-safety contract: `--nw-teal-700`, `--nw-amber-800`, `--nw-ink-900`, `--nw-ink-600`, and every `*-700` semantic token pass WCAG AA (≥ 4.5:1) as text on `--nw-white`, `--nw-sand-50`, and their own `*-100` background. `--nw-teal-500` and `--nw-amber-500` pass the ≥ 3:1 non-text (graphics) requirement and must never carry body text. White text passes AA on `--nw-teal-700`, `--nw-teal-900`, and every `*-700` semantic token. These pairs are verified by tooling in the Definition of Done.

### 2.2 The amber rule (binding)

Amber tokens (`--nw-amber-*`) may appear **only** inside the AI-attribution components of §10 and the shared `.nw-ai-*` classes that implement them. Concretely:

- Semantic "warning" state uses terracotta (`--nw-warning-*`), never amber.
- Charts never use amber for an ordinary data series; amber in a chart means "AI-flagged point/segment" and nothing else.
- Star ratings, highlights, promotions, achievement badges — none of these may be amber.
- Any element styled with an amber token must also render the sparkle glyph and the localized "AI" label (or be a child of a component that does).

This is the visual grammar that makes principle 3 real: users learn once that amber = the machine, and the system never lies to them about it.

### 2.3 Radii, shadows, spacing, z-scale, focus, motion

```css
:root {
	/* Radii */
	--nw-radius-sm: 6px;    /* inputs, badges, table cells */
	--nw-radius-md: 10px;   /* buttons, cards */
	--nw-radius-lg: 16px;   /* modals, hero panels */
	--nw-radius-full: 999px;/* pills, avatars */

	/* Shadows — the only three elevations */
	--nw-shadow-1: 0 1px 2px rgba(28, 35, 33, 0.06);                       /* resting cards */
	--nw-shadow-2: 0 4px 12px rgba(28, 35, 33, 0.10);                      /* hover, dropdowns */
	--nw-shadow-3: 0 12px 32px rgba(28, 35, 33, 0.16);                     /* modals, drawers */

	/* Spacing — 4px base scale; use ONLY these steps */
	--nw-space-1: 4px;  --nw-space-2: 8px;   --nw-space-3: 12px;
	--nw-space-4: 16px; --nw-space-5: 20px;  --nw-space-6: 24px;
	--nw-space-8: 32px; --nw-space-10: 40px; --nw-space-12: 48px; --nw-space-16: 64px;

	/* Z-scale — the only permitted z-index values */
	--nw-z-sticky: 150;   /* sticky table headers, section headers */
	--nw-z-nav: 200;      /* top navigation, console sidebar */
	--nw-z-dropdown: 300; /* menus, selects, popovers */
	--nw-z-overlay: 400;  /* scrims, drawers */
	--nw-z-modal: 500;    /* dialogs */
	--nw-z-toast: 600;    /* toasts — above everything */

	/* Focus & motion */
	--nw-focus-ring: 0 0 0 3px rgba(20, 138, 128, 0.40);
	--nw-transition-fast: 120ms ease;
	--nw-transition-base: 200ms ease;
}
```

Every interactive element shows `box-shadow: var(--nw-focus-ring)` (in addition to, never instead of, its resting border) under `:focus-visible`. Respect `prefers-reduced-motion: reduce` by disabling non-essential transitions globally in `base.css`.

## 3. Typography

**Pairing: IBM Plex Sans Arabic + Archivo**, loaded via `next/font` with `subsets: ["arabic", "latin"]`, `display: "swap"`, exposed as CSS variables:

```css
:root {
	--nw-font-arabic: /* next/font variable for IBM Plex Sans Arabic */, system-ui, sans-serif;
	--nw-font-latin:  /* next/font variable for Archivo */, system-ui, sans-serif;
	--nw-font-body:   var(--nw-font-arabic); /* IBM Plex Sans Arabic covers Latin glyphs too */
}
```

Rules:

- **Body text** in both locales uses IBM Plex Sans Arabic (`--nw-font-body`) — it carries a Latin companion cut, so mixed AR/EN paragraphs stay visually coherent with no font switching mid-line.
- **Display/headings** (`h1–h3`, stat-tile numbers, marketing hero) use Archivo when the element's resolved language is English (`:lang(en)`) and IBM Plex Sans Arabic Bold when Arabic (`:lang(ar)`). Implement with a `.nw-display` class whose `font-family` switches on `:lang()` — never on `[dir]` (a Latin heading inside an RTL page is still Latin).

### 3.1 Size scale

```css
:root {
	--nw-text-xs: 12px;  --nw-text-sm: 14px;  --nw-text-base: 16px;
	--nw-text-lg: 18px;  --nw-text-xl: 20px;  --nw-text-2xl: 24px;
	--nw-text-3xl: 30px; --nw-text-4xl: 38px;
}
```

`--nw-text-base` is the body size everywhere; `--nw-text-xs` only for badges, table meta, and audit timestamps — never for content a user must read to make a decision.

### 3.2 Arabic line-height and letter-spacing (binding)

- Arabic script sits taller and connects: body line-height is **1.7 under `:lang(ar)`** vs **1.5 under `:lang(en)`**; headings 1.4 (ar) vs 1.2 (en). Encode as `--nw-leading-body` / `--nw-leading-display` overridden inside `:lang(ar)`.
- **`letter-spacing` on Arabic text is always `0`.** Tracking breaks connected letterforms. The Archivo all-caps micro-label style (`letter-spacing: 0.04em`) is permitted only under `:lang(en)`; the Arabic equivalent uses weight (600) instead of tracking. Never apply `text-transform: uppercase` to a bilingual component's shared style — scope it under `:lang(en)`.
- Do not use faux-bold or faux-italic: load the real 400/500/600/700 weights; Arabic UI never italicizes (use weight or color emphasis instead).

### 3.3 Numeral policy (binding)

All quantitative data — KPIs, scores, counts, currency, dates in tables, percentages — renders in **Western Arabic (ASCII 0–9) digits in both locales**, formatted with `Intl.NumberFormat` pinned to the Latin numbering system (`ar-QA-u-nu-latn` / `en-QA`). Rationale: figures stay comparable across a bilingual screen, sort correctly, and read identically to screen readers in both languages. Eastern Arabic-Indic digits (٠١٢٣) may appear only inside verbatim user-generated prose (an applicant wrote them), never in NAWA-rendered data. Dates render per locale via `Intl.DateTimeFormat` (Arabic month names under `ar`) but with Latin digits. Provide one shared `formatNumber` / `formatDate` helper pair in `apps/web/src/helpers/format.ts`; feature code never calls `toLocaleString` directly.

## 4. RTL-first mirroring strategy

The layout system is authored RTL-first and must be fully symmetric. Rules:

1. **`dir` per locale.** The root layout sets `<html lang="ar" dir="rtl">` or `<html lang="en" dir="ltr">` from the resolved locale (§5.2). No component sets `dir` on itself except bidi isolation spans (rule 5) and verbatim foreign-language content.
2. **Logical CSS properties only.** `margin-inline-start/end`, `padding-inline-start/end`, `inset-inline-start/end`, `border-start-start-radius` (etc.), `text-align: start|end`, `float: inline-start|inline-end`. The physical properties `*-left`, `*-right`, `left:`, `right:`, `text-align: left|right` are **banned** in the web app's source — zero occurrences, enforced by grep in the Definition of Done. Flexbox and Grid mirror automatically; never "fix" RTL with `flex-direction: row-reverse` hacks.
3. **Icon mirroring.** Directional icons — arrows, chevrons, back/forward, "send", list-indent, breadcrumb separators, pagination — flip in RTL: give them the class `.nw-icon-dir`, and `base.css` applies `[dir="rtl"] .nw-icon-dir { transform: scaleX(-1); }`. Non-directional icons never flip: search magnifier, check, close, user, sparkle (AI), settings gear. **Never flip**: logos, clocks, media-playback controls, charts' data (axes relabel, data does not mirror), and numbers.
4. **Component symmetry.** Console sidebar sits at `inset-inline-start` (visually right in Arabic, left in English). Progress bars, sliders, table sort carets, toast slide-in, drawer origin — all keyed to logical start/end. Skeleton shimmer direction follows reading direction.
5. **Bidi handling for mixed content.** Any run of opposite-direction text embedded in a sentence is isolated: Latin venture names, email addresses, URLs, and KPI figures with units (e.g., "QAR 1.2M", "12% MoM") inside Arabic sentences are wrapped in `<bdi dir="ltr">…</bdi>`; Arabic names inside English sentences in `<bdi dir="rtl">`. All user-generated display fields (names, venture names, request titles) render inside `<bdi>` unconditionally — you cannot know the string's direction in advance. Provide a shared `<Bidi>` component in the UI kit and use it; never rely on browser heuristics for punctuation-adjacent mixed runs (they misplace the "%" and the "M"). Numbers inside `<bdi dir="ltr">` keep their visual order in both locales — this is the KPI-inside-Arabic-sentence rule.

## 5. i18n architecture

### 5.1 Scope

Arabic and English have **full UI parity**: every string, label, empty state, error message, aria-label, toast, and email-visible text exists in both. Arabic is the default locale for anonymous visitors (Accept-Language may promote English); authenticated users' locale comes from their profile.

### 5.2 Mechanics

- A `TLocale = "ar" | "en"` union lives in the contracts package (`packages/contracts`) and rides the user object and session claims (`01-architecture.md` defines both).
- No heavyweight i18n framework. Dictionaries are plain JSON per locale per namespace: `apps/web/src/i18n/<locale>/<namespace>.json` (namespaces: `common`, `auth`, `onboarding`, `profile`, `intake`, `journey`, `community`, `reports`, `admin`, `ai` — the `ai` namespace holds every AI-attribution string so the wording stays consistent platform-wide).
- A `useT(namespace)` hook returns a lookup function; server components use a `getT(locale, namespace)` equivalent. Missing keys throw in development and render the key string in production (visible, greppable — never silently fall back to English).
- Locale resolution order: authenticated user's profile locale → `nw_locale` cookie → `Accept-Language` → `ar`. The **locale switcher** lives in the top navigation on every shell; switching sets the cookie, PATCHes the profile when signed in (via the api-client), and re-renders with the new `dir` without a full logout.

### 5.3 Translation key conventions

Keys are dot-namespaced, camelCase leaves, structured `<area>.<component>.<slot>`: `intake.shortlist.title`, `intake.scorecard.overrideReasonLabel`, `ai.attribution.label`, `common.actions.save`. Interpolation uses `{name}` placeholders; pluralization uses explicit `.one` / `.other` key pairs (Arabic needs `.zero`, `.two`, `.few`, `.many` for user-facing counts — support the full CLDR set in the lookup helper). Both locale files must have **identical key sets**; a CI script diffs them (Definition of Done).

### 5.4 French — ingestion only

French is accepted at **application ingestion only** (Intake Copilot accepts FR documents; the pipeline normalizes them — `06-intake-copilot.md`). The UI never renders chrome in French. When a reviewer views FR source material (original application text, quoted evidence), render it verbatim inside `<bdi dir="ltr" lang="fr">` with a small language badge ("FR"), and show the AI-generated AR/EN normalization beside it under the standard amber attribution.

## 6. Web application structure

Per the platform canon (`01-architecture.md` owns the API side; this section owns the web side):

```
apps/web/
├─ app/                      thin page.tsx shells ONLY — each renders one feature module
│  ├─ layout.tsx             html lang/dir, fonts, tokens.css + base.css, providers
│  ├─ page.tsx               → features/marketing
│  ├─ (auth)/login|signup|forgot-password/page.tsx
│  ├─ onboarding/page.tsx
│  ├─ profile/[handle]/page.tsx
│  ├─ intake/…               console routes
│  ├─ journey/…  community/…  reports/…  admin/…
│  └─ styleguide/page.tsx    dev-only kit gallery (§14)
├─ src/
│  ├─ features/<domain>/     the real page bodies: index.tsx + subcomponents + styles
│  ├─ components/
│  │  ├─ shells/             TopNav, ConsoleShell, OnboardingShell
│  │  ├─ ui/                 the component kit (§9)
│  │  └─ ai/                 the AI-attribution components (§10) — sole consumers of --nw-amber-*
│  ├─ hooks/<domain>/        SWR hooks: useShortlist.ts, useScorecard.ts, useProfile.ts, …
│  ├─ i18n/                  dictionaries + useT/getT
│  ├─ helpers/               format.ts, fetcher (401-refresh-replay per 01-architecture.md)
│  ├─ styles/                tokens.css + base.css (the ONLY color-literal file is tokens.css)
│  └─ config/env.ts          the only file reading process.env on the web side
└─ middleware.ts             the edge gate (§13; mechanics in 01-architecture.md)
```

Rules:

- **Thin shells.** Every `app/**/page.tsx` is ≤ 20 lines: resolve params/locale, render one feature module. No data fetching, no markup beyond the module. All real UI lives in `src/features/<domain>/`.
- **SWR hooks per domain.** Client data flows through `src/hooks/<domain>/use<X>.ts` — `"use client"`, build a deterministic key from the query params, `useSWR(key, fetcher)`, fetch through the typed api-client from `packages/api-client` (which unwraps the `{code, message, data}` envelope and throws `ApiError`). Feature components never call `fetch` directly and never import server-only modules.
- **SSR** uses a `server-only` session module that forwards the incoming cookie to the api-client, per `01-architecture.md`.
- Types come from `packages/contracts` (generated from the API's OpenAPI spec) — never hand-declared response shapes in the web app.

## 7. Shared shells

Three shells; every route uses exactly one.

1. **TopNav shell** (public + member surfaces: `/`, `/profile/[handle]`, `/community`, `/journey` member view). Sticky top bar (`--nw-z-nav`, `--nw-white` bg, `--nw-shadow-1`): NAWA wordmark at inline-start, primary nav links, locale switcher, notifications bell, avatar menu at inline-end. Signed-out: "Sign in" + primary "Apply" button (`--nw-teal-700`). Collapses to a hamburger drawer below 768px (drawer slides from inline-start).
2. **Console shell** (staff surfaces: `/intake`, `/reports` portfolio/generator, `/admin`). Fixed sidebar at `inset-inline-start` (width 264px, `--nw-teal-900` bg, white/`--nw-teal-100` nav items, active item `--nw-teal-700` bar on the inline-start edge), content area on `--nw-sand-50`. Sidebar sections render **only** the entries the session's permissions allow (§8 gates; the JWT `perms` claim drives visibility, the API re-checks authoritatively). Sticky breadcrumb + page-title header inside the content area. Sidebar collapses to icon rail at 1024px and to a drawer below 768px.
3. **Onboarding shell** (`/onboarding`). Centered column (max-width 640px) on `--nw-sand-50`, NAWA mark on top, a **progress bar** (`.nw-progress`) showing step n of N with localized step labels, one step per screen, primary action fixed at the end of the column. Progress fill direction follows reading direction (logical, not physical).

Auth pages (`/login`, `/signup`, `/forgot-password`) use a minimal centered card variant of the TopNav shell (logo only, locale switcher, no nav).

## 8. Surface map — layout intent, primary actions, permission gates

This is the complete route surface. "Gate" names the section-entry permission checked by the edge gate (§13) and re-checked by the API; feature actions inside carry their own operation permissions (catalog in `01-architecture.md`). Permission strings follow `nawa:<domain>:<action>`.

| Route | Shell | Layout intent | Primary action(s) | Gate |
|---|---|---|---|---|
| `/` | TopNav | Marketing + hub landing: hero (bilingual value prop), program grid (6 programs), community teaser, stats band | Apply · Sign in | Public |
| `/login`, `/signup`, `/forgot-password` | Auth card | Single centered card; login takes one content-sniffed identifier field | Sign in / Create account | Guest-only (signed-in users bounce, §13) |
| `/onboarding` | Onboarding | Stepper: identity → venture → skills → asks → KPI baseline; builds the Founder Profile spine | Continue / Finish | Session (no permission — every member onboards) |
| `/profile/[handle]` | TopNav | The living Founder Profile: header (name, venture, stage, program history badges), KPI snapshot tiles, skills, current asks, activity | Edit (own) · Send request (others) | Session; edit gated `nawa:profiles:write` (own) |
| `/intake` | Console | Screening console home: cycle picker, funnel stats, batch list | Upload batch | `nawa:console:intake` |
| `/intake/upload` | Console | Drag-drop multi-file upload (AR/EN/FR), parsing progress, per-file status | Start ingestion | `nawa:intake:ingest` |
| `/intake/shortlist` | Console | Ranked, filterable table of scored applications; amber hidden-gem badges; dedup-match indicators; bulk select | Open scorecard · Record decision | `nawa:console:intake` |
| `/intake/applications/[id]` | Console | Split view: source application (verbatim, bidi-isolated) beside the explainable scorecard (§10.1); override control (§10.2); decision history | Accept AI ranking · Override | Score view `nawa:intake:score`; override `nawa:intake:override` |
| `/journey` | TopNav (member) / Console (PM) | Cohort milestone board: timeline per cohort, per-member progress, RAG assistant panel (§10.5-adjacent chat) docked at inline-end | Update milestone · Ask assistant | Session (own cohort); PM view `nawa:console:journey` |
| `/journey/digests` | Console | Weekly digest list; each digest is an AI-draft review panel (§10.3) | Approve & send digest | `nawa:journey:digests` |
| `/community` | TopNav | Tabs: Directory · Requests · Opportunities · Mentors. Directory = searchable member card grid (domain/skill/geography facets) | Post request · Post opportunity | Session (`nawa:community:read`, granted to all members) |
| `/community/requests` | TopNav | Structured asks list; each shows AI match-suggestion cards (§10.6) to its owner | Post request · Respond | Post `nawa:community:post` |
| `/community/opportunities` | TopNav | Opportunities board, auto-tagged, filterable | Post opportunity · Apply | Post `nawa:community:post` |
| `/community/mentors` | TopNav | Mentor matching: mentor cards + AI-suggested pairings with "why" (§10.6) | Request mentorship | `nawa:community:read`; match accept `nawa:mentorship:manage` (staff) |
| `/reports` | TopNav (founder) | Founder view: monthly check-in entry (conversational chat, §10.5), own KPI history, drafted-report review (§10.3) | Start check-in · Approve report | Session (own data) |
| `/reports/portfolio` | Console | PM portfolio dashboard: venture health grid, anomaly/early-warning badges (§10.4), KPI trend sparklines, drill-down to each venture | Open venture · Flag for support | `nawa:console:reports` |
| `/reports/generate` | Console | One-click generator: report type picker (cycle outcomes, jury digest, internship evaluation, impact report), live-data preview as AI-draft review panel, export | Generate · Export (slides/PDF) | `nawa:reports:generate` |
| `/admin` | Console | Platform overview: usage, program/cycle config, site config | Edit config | `nawa:console:admin` |
| `/admin/iam/groups`, `/admin/iam/policies` | Console | IAM CRUD tables with statement editors; managed built-ins read-only | Create/edit group·policy | `nawa:iam:manage` |
| `/admin/audit` | Console | Audit log browser: filterable table (actor, action, target, date), row expand shows captured detail | Filter · Export | `nawa:audit:read` |

Every surface designs all five states: **loaded, empty, loading (skeleton), error, permission-denied**. Empty states carry a localized explanation and the constructive next action (e.g., empty shortlist → "No applications scored yet — upload a batch", with the button, when the user holds `nawa:intake:ingest`). A surface missing any of the five states is unfinished.

## 9. Component kit inventory

Build these in `src/components/ui/`, each styled exclusively with tokens, each RTL-clean, each with visible `:focus-visible`, disabled, and (where async) loading states. Class prefix `.nw-`.

- **Buttons** `.nw-btn` — variants: `primary` (bg `--nw-teal-700`, hover `--nw-teal-600`, white text), `secondary` (white bg, `--nw-teal-700` text + border), `ghost` (transparent, `--nw-ink-600`), `danger` (`--nw-danger-700`). Radius `--nw-radius-md`, padding `--nw-space-2 --nw-space-4`, loading state swaps label for an inline spinner while preserving width. There is deliberately **no amber button variant** — AI actions use the standard variants inside amber-attributed containers.
- **Inputs** `.nw-input` — white bg, `--nw-sand-200` border, radius `--nw-radius-sm`, focus ring; error state `--nw-danger-700` border + message line; label above, hint/error below, all `text-align: start`. Textarea, and a `dir="auto"` opt-in for free-text fields where users may type either language.
- **Select** `.nw-select` — native-first for forms; a listbox popover (`--nw-z-dropdown`, `--nw-shadow-2`) for faceted filters with multi-select checkboxes and comma-joined query params.
- **Cards** `.nw-card` — white bg, radius `--nw-radius-md`, `--nw-shadow-1`, padding `--nw-space-6`; hover elevation `--nw-shadow-2` only when the whole card is a link.
- **Table** `.nw-table` — header row `--nw-sand-100`, sticky (`--nw-z-sticky`); sortable columns with a caret (`.nw-icon-dir` so it stays honest in RTL); a filter rail of `.nw-select` facets above; row hover `--nw-teal-50`; selected `--nw-teal-100`; numeric columns `text-align: end` with tabular-nums Latin digits (§3.3); pagination `limit`-based matching the API's common query schema. Below 768px, rows collapse to stacked `.nw-card` items via a defined field-priority list per table.
- **Tabs** `.nw-tabs` — underline style, active `--nw-teal-700`; keyboard: arrow keys move (logical direction — ArrowRight moves visually right in both locales, mapped to next/prev by `dir`), roving tabindex, `role="tablist"`.
- **Modal** `.nw-modal` — scrim `--nw-z-overlay`, dialog `--nw-z-modal`, radius `--nw-radius-lg`, `--nw-shadow-3`; focus-trapped, Esc closes, focus returns to the invoker; title + body + inline-end-aligned action row.
- **Toast** `.nw-toast` — stack at `inset-block-start` + `inset-inline-end`, `--nw-z-toast`; success/danger/info via semantic tokens; auto-dismiss 6s with pause-on-hover; `role="status"` (assertive for errors).
- **Badge** `.nw-badge` — pill, `--nw-radius-full`, `--nw-text-xs` weight 600; semantic variants use `*-100` bg + `*-700` text; the **AI badge variant lives in §10, not here**.
- **Empty state** `.nw-empty` — centered icon + localized headline + one-line explanation + optional primary action.
- **Skeleton** `.nw-skeleton` — `--nw-sand-100` blocks with a reading-direction shimmer; every list/table/card surface ships a skeleton matching its loaded geometry.
- **Error state** `.nw-error` — inline panel (`--nw-danger-100` bg, `--nw-danger-700` text) with the localized message from `ApiError` and a retry action; never a blank screen, never a raw stack.
- **Progress** `.nw-progress` — the onboarding bar and milestone completion meters; fill `--nw-teal-500` on `--nw-sand-200` track, logical fill direction, `role="progressbar"` with localized `aria-valuetext`.
- **Avatar, stat tile** (`.nw-stat`: label `--nw-ink-600` + value `--nw-text-3xl` `.nw-display` + delta in semantic color), **breadcrumbs** (separator chevron `.nw-icon-dir`), **`<Bidi>`** (§4.5).

**Module extension components** — owned by this kit, consumed by slices `07-journey-copilot.md`, `08-community-hub.md`, `09-reports-kpi-engine.md`; the slices use them, they do not redefine them:

- **Chip** `.nw-chip` — compact selectable/removable token (filter facets, quick replies, KPI confirmation chips §10.5): `--nw-sand-100` bg, `--nw-radius-full`, selected `--nw-teal-100` bg + `--nw-teal-700` text, removable variant with a labeled close button; states default/selected/removable/disabled.
- **Drawer** `.nw-drawer` — edge panel sliding from `inset-inline-end` (assistant panel, filters; mobile nav variant from inline-start): scrim `--nw-z-overlay`, panel `--nw-shadow-3` + `--nw-radius-lg` on the leading corners, focus-trapped and Esc-closable like `.nw-modal`; open/closing/closed states, slide direction logical.
- **Timeline** `.nw-timeline` — vertical milestone timeline (journey boards): node rail on the inline-start edge; node states complete (`--nw-success-700`), current (`--nw-teal-700` + focus ring), upcoming (`--nw-sand-200`), stalled (`--nw-warning-700` terracotta — human-visible schedule state, not an AI flag).
- **Chat** `.nw-chat` — the chat-column primitives (bubble, composer, typing indicator) behind §10.5 and the journey assistant: member bubbles `--nw-teal-50` aligned inline-end; the AI-message variant is `.nw-ai-chat` (amber-50 bubble + sparkle avatar), defined inside the `.nw-ai-*` block per §2.2 so the amber rule holds; states idle/streaming/failed-send.
- **Citation** `.nw-cite` — inline chip binding a figure or quote to its source datum (traceability, principle 1): `--nw-teal-50` bg + `--nw-teal-700` text, hover/focus popover naming the source location; the AI-extracted-evidence variant is `.nw-ai-cite` (amber, sparkle + label), defined inside the `.nw-ai-*` block; states default/active/broken-link (`--nw-danger-700` text).
- **Callout** `.nw-callout` — static informational panel (audit notices §10.2, onboarding hints): `*-100` semantic bg + `*-700` text + leading icon, `--nw-radius-md`, info/success variants; never dismissible, never amber.
- **Alert** `.nw-alert` — full-width severity banner: info (`--nw-info-*`), warning (`--nw-warning-*` terracotta), danger (`--nw-danger-*`) with icon + text per §11; danger-red is reserved for **human-confirmed** statuses — AI anomaly severities never render as `.nw-alert`, they use the amber scale of §10.4; dismissible variant with a labeled close button.
- **Editor** `.nw-editor` — the rich-text editing surface of §10.3's draft panel: `--nw-white` bg, `--nw-sand-200` border, `--nw-radius-md`, focus ring, toolbar of ghost `.nw-btn` icon buttons (labeled), content area `dir="auto"` for mixed AR/EN drafting; states editable/readonly/disabled/saving.

### 9.1 Test-first development (mandatory)

Every UI kit component, every AI component (§10), every shell (§7), and every feature module is built **test-first, red→green→refactor** with vitest + Testing Library: write the failing test, watch it fail, implement until green, then refactor. Never implementation-first with tests backfilled, and never test theater — every test must fail when its subject is deleted or its behavior is broken (verify by mutation spot-checks). The minimum test surface per component:

- **Both-locale rendering:** renders under `ar` and `en` with the correct localized visible labels pulled from the dictionaries (no hardcoded strings).
- **RTL assertions:** direction-dependent behavior is asserted explicitly — the `.nw-icon-dir` class is present on directional icons, logical alignment/order is correct under `dir="rtl"`, `<Bidi>` isolation wraps user-generated fields.
- **Accessibility labels in both languages:** `aria-label`/`aria-describedby`/role assertions run under both locales; icon-only buttons have accessible names in Arabic and English.
- **State coverage:** disabled, loading, error, empty, and focus-visible states each exercised; AI components additionally assert the sparkle glyph + localized AI label are present (the §10.11-style attribution invariant, unit-level).

Coverage on the code this slice introduces must be **≥ 95% statements** (configure 95/95/95/95 statements/lines/functions/branches in the web vitest config, barrel `index.ts` files excluded by explicit list only, never by blanket glob). The gate is enforced in CI and in this file's Definition of Done (check 13).

## 10. AI-specific component patterns

All in `src/components/ai/` — the only directory (plus its `.nw-ai-*` classes in `base.css`) allowed to consume `--nw-amber-*` tokens. Every component below composes one shared primitive:

**`<AiAttribution>`** — the universal marker: 3px `border-inline-start: var(--nw-amber-500)`, `--nw-amber-50` background tint, sparkle glyph (`--nw-amber-600`, never flipped), and the localized label from the `ai` namespace ("AI-generated" / "مُولّد بالذكاء الاصطناعي"), plus an optional "How was this produced?" disclosure that names the model class, the data it saw, and a link to the relevant audit entry. Nothing AI-produced renders outside this wrapper.

1. **Explainable scorecard** `<Scorecard>` (`/intake/applications/[id]`, spec in `06-intake-copilot.md`). Header: overall score (large `.nw-stat`), rubric name, cycle. Body: one row per criterion — localized criterion name, weight, score bar (`--nw-teal-500` fill; the bar is data, not AI decoration), and an expandable **evidence list**: direct quotes from the application (verbatim, `<bdi>`-isolated, `lang`-tagged, source location cited e.g. "Application §3, p.2") that justify the score. Every criterion score without at least one evidence citation renders a visible "no evidence extracted" warning — the UI never fakes confidence. **Hidden-gem flag**: when set, an amber banner across the scorecard top: sparkle + "Hidden gem — strong idea, weak writing" (localized) + the model's reasoning + the note that hidden gems sort upward, not out. The whole scorecard sits inside `<AiAttribution>`.
2. **Human-override control** `<OverrideControl>`. Renders the AI ranking/score beside an editable human decision (accept / move up / move down / set score). Committing requires a **reason field** (min 20 characters, localized validation) and shows a persistent, non-dismissable audit notice before the confirm button: "This override is recorded with your name, timestamp, and reason, and appears in the audit log" (localized). After commit, the surface shows both values — struck-through AI value in amber attribution, human value in ink — plus the decider's name. The confirm modal is a standard `.nw-modal`; the action button is `primary` teal (a human decision is a trusted action, not an AI artifact).
3. **AI-draft review panel** `<DraftReviewPanel>` (monthly reports, digests, generated reports; consumed by `07`, `09`). Two-pane split (stacks vertically below 1024px): inline-start pane = the **source data** (KPI entries, check-in transcript, milestone records — plain ink, each datum linkable), inline-end pane = the **AI draft** inside `<AiAttribution>`, editable rich-text. Every figure in the draft is a hoverable chip that highlights its source datum in the other pane (traceability, principle 1). Actions: Edit, Regenerate (rate-limited per `01-architecture.md`), Approve & send. Approving strips nothing: the sent artifact keeps a machine-readable "AI-drafted, approved by {name}" provenance line.
4. **Anomaly / early-warning badges** `<AnomalyBadge>` (portfolio dashboard, venture pages). Amber pill: sparkle + localized anomaly type ("Runway < 4 months", "Stalled milestone", "Churn spike") — amber because the *flag* is AI-inferred. Clicking opens a popover: the triggering data points (chart excerpt with the anomalous segment in amber), the detection rule/model reasoning, and actions "Confirm concern" / "Dismiss flag (reason required)" — both audit-logged; a dismissed flag re-renders as a gray outline badge, never disappears silently. Severity is conveyed by an additional icon + text ("watch" / "act now"), never by switching to danger-red — red remains reserved for human-confirmed statuses.
5. **Conversational check-in chat** `<CheckInChat>` (`/reports` founder view, spec in `09`). Chat column, max-width 720px. AI messages: `--nw-amber-50` bubble, sparkle avatar, aligned inline-start; founder messages: `--nw-teal-50` bubble, inline-end. Input supports `dir="auto"` (founders answer in Arabic or English mid-thread); quick-reply chips for structured KPI answers (numbers keyboard on mobile). A persistent header states the purpose and time promise ("5 minutes — NAWA drafts your monthly report from this"). Every extracted KPI renders back as a confirmation chip the founder can tap to correct **before** it writes to the profile. Ends with a summary card linking to the drafted report (§10.3). Streaming responses arrive over SSE (`01-architecture.md`); show a typing indicator that respects reduced-motion.
6. **Match-suggestion cards** `<MatchCard>` (requests desk, opportunities, mentor matching; spec in `08`). A `.nw-card` wrapped in `<AiAttribution>`: matched member (avatar, name in `<Bidi>`, venture), match strength as a labeled meter, and a **"Why this match"** list — 2–4 concrete, cited reasons ("Skills: mechanical engineering — from her profile", "Helped a similar request in Cycle 14"). Actions: Notify / Introduce (primary) · Dismiss (ghost, reason optional, feeds match quality back). Never show a match without at least one reason; an unexplained match must not render.

## 11. Accessibility bar — WCAG 2.1 AA

- **Contrast:** every text token pair in §2.1's text-safety contract verified ≥ 4.5:1 (≥ 3:1 for large text and graphics) with a named tool (Definition of Done). No token pair outside the contract may carry text.
- **Focus management:** visible `:focus-visible` ring everywhere; modals and drawers trap focus and restore it; route changes move focus to the new page's `h1`; a skip-to-content link is the first tabbable element in every shell.
- **Keyboard:** every action reachable without a pointer — tables (row focus + Enter to open), tabs (arrow roving), menus, the chat input, the override flow end-to-end. No positive `tabindex` anywhere.
- **Screen readers:** all `aria-label`/`aria-describedby` strings come from the i18n dictionaries (both languages — an Arabic UI must announce in Arabic); icon-only buttons always labeled; toasts use live regions; the AI attribution label is real text, not `aria-hidden` decoration, so assistive tech hears the provenance too; charts get localized text summaries.
- **Language tagging:** `lang` attributes on every verbatim foreign-language fragment (FR source text, quoted evidence) so screen readers switch pronunciation.
- **Not color alone:** every state conveyed by color (semantic badges, anomaly flags, validation errors, AI attribution) also carries an icon or text — the UI must remain fully legible in grayscale.
- **Form errors:** validation failures name the field in the error text, link the message to the input via `aria-describedby`, and move focus to the first invalid field on submit.
- **Motion & zoom:** `prefers-reduced-motion` respected; layout survives 200% zoom and 320px width without horizontal scroll (reflow, not shrink).

## 12. Responsive strategy

Mobile-first with three breakpoints, defined once as documented constants (custom properties can't drive media queries — keep them in one `src/config/breakpoints.ts` + a comment block in `tokens.css`): **768px** (tablet), **1024px** (desktop), **1280px** (wide console). Rules: TopNav → hamburger drawer < 768; console sidebar → icon rail < 1024 → drawer < 768; tables → card stacks < 768 (§9); split panes (scorecard, draft review) stack vertically < 1024; the chat and onboarding columns are single-column at every width; touch targets ≥ 44px on all interactive elements. Founder-facing surfaces (`/reports` check-in, `/profile`, `/community`) are the mobile-critical paths — design those at 375px first. Staff consoles optimize for ≥ 1280px but must remain operable at 768px.

## 13. Edge-gate UX behavior

The edge middleware's mechanics (JWT `perms` claim, silent refresh, route-access maps in the contracts package) are specified in `01-architecture.md`. This section fixes the **user-facing behavior**, which slices 06–09 must not violate:

- **Default-deny.** Any route not explicitly public or matched by a section rule requires a session. Anonymous visitors to a protected route are redirected to `/login?next=<encoded-path>`; after login they land on `next` when their permissions allow it, else on their permission-based home (below). The API side of the gate returns the 401 JSON envelope without redirects.
- **Guest-only bounces.** Signed-in users visiting `/login`, `/signup`, or `/forgot-password` are redirected to their permission-based home — no flash of the auth form.
- **Permission-based post-login landing** (`homeForPermissions`, first match wins): `nawa:console:admin` → `/admin` · `nawa:console:intake` → `/intake` · `nawa:console:reports` → `/reports/portfolio` · `nawa:console:journey` → `/journey` · otherwise (founders/members) → `/community`, or `/onboarding` when the profile spine is incomplete.
- **Permission-denied inside a session** renders the shell with a localized denied panel ("You don't have access to this section" + who to contact) — never a blank page, never a redirect loop, and navigation the user *can* use stays visible. The console sidebar never shows entries the user cannot enter, so this state occurs only via direct URL.
- **Maintenance mode** rewrites (not redirects) member surfaces to a bilingual status page; staff consoles and `/login` stay reachable.

## 14. Styleguide route — the verification harness

Build `app/styleguide/page.tsx` (excluded from production builds or gated behind `nawa:console:admin`): a single page rendering every §9 kit component in every variant and state (including empty/loading/error/skeleton), every §10 AI component with fixture data (a full scorecard, an override in both pre/post states, a draft panel, all anomaly types, a seeded chat, a match card), in **both locales side by side** (an `ar`/`en` toggle that flips `dir`). This page is what the automated checks below drive; it also serves as the living contract for `frontend` work in slices 06–09.

## Definition of Done

1. **Token file is the single color source.** `apps/web/src/styles/tokens.css` exists and defines every custom property named in §2 and §3 — verify with `grep -c "^\s*--nw-" apps/web/src/styles/tokens.css` (count ≥ 60). Then prove no color literal escaped: `grep -rEn "#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(" apps/web/src apps/web/app --include="*.tsx" --include="*.ts" --include="*.css" | grep -v "styles/tokens.css"` returns **zero** lines.
2. **Zero physical direction properties.** `grep -rEn "margin-left|margin-right|padding-left|padding-right|text-align:\s*(left|right)|border-left|border-right|[^-a-z](left|right)\s*:" apps/web/src apps/web/app --include="*.tsx" --include="*.css"` returns **zero** lines (logical properties only, per §4.2).
3. **Amber is AI-only.** `grep -rln "nw-amber" apps/web/src apps/web/app` lists **only** `styles/tokens.css`, `styles/base.css` (the `.nw-ai-*` class block), and files under `src/components/ai/`. Any other path is a failure.
4. **`dir` flips with locale, observed in Playwright.** A Playwright spec loads `/styleguide`, asserts `html[dir="rtl"][lang="ar"]` by default, clicks the locale switcher, asserts `html[dir="ltr"][lang="en"]`, and asserts a `.nw-icon-dir` element's computed `transform` is `scaleX(-1)` under RTL and `none` under LTR. Test passes in CI.
5. **i18n parity.** A script (`pnpm --filter web run i18n:check`) diffs the key sets of `src/i18n/ar/*.json` vs `src/i18n/en/*.json` and exits non-zero on any asymmetric key; it runs in CI and passes.
6. **Numeral policy.** A vitest unit test asserts `formatNumber(1234.5, "ar")` returns a string containing only ASCII digits (matches `/^[0-9.,٫٬\s%A-Z]*$/` and specifically NOT `/[٠-٩]/`), and that `formatDate` under `ar` renders Arabic month names with Latin digits. Test passes.
7. **Contrast verified with a named tool.** `@axe-core/playwright` scans `/styleguide` in both locales with **zero** `color-contrast` violations; additionally a node script using the `wcag-contrast` package asserts every text-safe pair from §2.1 ≥ 4.5:1 and every graphics pair ≥ 3:1, run in CI.
8. **Thin shells hold.** Every `app/**/page.tsx` for the §8 surface map exists and is ≤ 20 lines — verify with a shell loop (`Get-ChildItem apps/web/app -Recurse -Filter page.tsx | ForEach-Object { "$($_.FullName): $((Get-Content $_.FullName).Count)" }`) showing no shell over 20 lines, and each imports from `src/features/`.
9. **Five states per surface.** `/styleguide` renders empty, loading (skeleton), error, and permission-denied fixtures for the table, card list, and console surfaces; the Playwright suite screenshots each and asserts the empty state contains a localized action button. Suite passes.
10. **Keyboard & focus.** A Playwright spec opens a `.nw-modal` on `/styleguide`, asserts focus is trapped (Tab cycles inside), Esc closes it, and focus returns to the invoking button; a second spec tabs from page load and asserts the first focus stop is the skip link. Both pass.
11. **AI attribution is universal.** A Playwright spec asserts every §10 component instance on `/styleguide` contains the sparkle glyph AND the localized AI label text ("مُولّد بالذكاء الاصطناعي" under `ar`), and that the scorecard fixture renders at least one evidence citation per criterion. Passes in both locales.
12. **Edge-gate UX.** Playwright: anonymous request to `/intake` lands on `/login?next=%2Fintake`; logging in as the seeded Program Manager then visiting `/login` bounces to that account's permission-based home; a seeded Founder visiting `/admin` sees the localized denied panel (HTTP 200, shell intact), not a blank page or redirect loop. All three assertions pass against the seeded dev stack.
13. **Responsive behavior, observed in Playwright.** One breakpoint source exists: `grep -n "768\|1024\|1280" apps/web/src/config/breakpoints.ts` shows all three constants defined there, and `grep -rEn "(max|min)-width:\s*(76[0-9]|102[0-9]|12[78][0-9])" apps/web/src apps/web/app --include="*.css" --include="*.tsx" | grep -vE "config/breakpoints\.ts|styles/base\.css"` returns **zero** lines — media queries from all three breakpoint families (768/1024/1280) may exist only in `styles/base.css` (the shared responsive rules) with their values anchored to `config/breakpoints.ts`; any other file matching is a failure. A Playwright spec runs `/styleguide` at viewport widths **375, 768, and 1024**: at 375 it asserts the TopNav hamburger button is visible and the desktop nav links are not (`expect(page.getByRole("button", { name: /menu/i })).toBeVisible()`); at 375 it asserts the designated `.nw-table` fixture renders as stacked `.nw-card` items (zero visible `<table>` element) while at 1024 the `<table>` is visible; and at 375 it iterates every interactive element (`button, a[href], input, select, [role="tab"]`) on `/styleguide` asserting `boundingBox()` width ≥ 44 **and** height ≥ 44. Spec passes in CI.
14. **A11y behaviors gated (reduced-motion, reflow, lang tagging, Arabic announcements).** Four assertions, all in CI: (a) a Playwright spec with `page.emulateMedia({ reducedMotion: "reduce" })` loads `/styleguide` and asserts every element's computed `transition-duration` and `animation-duration` is `0s` (skeleton shimmer and toast slide included); (b) a Playwright spec at viewport width **320** (and again at 640 with `deviceScaleFactor` emulating 200% zoom) asserts `document.documentElement.scrollWidth <= window.innerWidth` — no horizontal scroll on `/styleguide`; (c) the FR-fragment and quoted-evidence fixtures on `/styleguide` carry `lang` attributes — `expect(page.locator("bdi[lang='fr']"))` resolves, and an axe scan reports zero `valid-lang` violations; (d) under the `ar` locale, the toast fixture's live region (`[role="status"]`) contains the Arabic dictionary string (assert a known Arabic literal from `i18n/ar/common.json`), proving announcements are localized, not English fallbacks. All four pass.
15. **Not color alone — grayscale legibility.** A Playwright spec iterates every semantic-state fixture on `/styleguide` and proves each carries a non-color signifier: for each of the selectors `.nw-badge`, `.nw-chip[data-state]`, `.nw-alert`, and the §10.4 anomaly badge, assert `await page.locator("<sel>:not(:has(svg)):not(:has([data-icon]))").filter({ hasNotText: /\S/ }).count()` is **0** (zero elements lack both an icon and visible text); additionally assert every `.nw-input` error-state fixture has a visible, non-empty message element (`[aria-live], .nw-input-error-text`) — a red border alone fails. Named manual fallback: capture `/styleguide` with DevTools "Emulate vision deficiencies → Achromatopsia" (or a grayscale-converted `page.screenshot()`) and verify every status remains distinguishable; attach the screenshot as evidence. Spec passes in CI.
16. **TDD coverage gate.** `pnpm --filter web vitest run --coverage` exits zero with coverage thresholds **≥ 95%** statements (and 95% lines/functions/branches) declared in the web vitest config, scoped to the design-system/component-kit code introduced by this slice: `src/components/ui/**`, `src/components/ai/**`, `src/components/shells/**`, `src/i18n/**`, `src/helpers/format.ts` (barrels excluded by explicit list only). Prove the tests are real, not theater: temporarily rename one component export (e.g. `<AiAttribution>`), rerun, and observe at least one test fail; restore and observe green.

Do not mark this slice complete, and do not start the next slice, until every check above passes with evidence.
