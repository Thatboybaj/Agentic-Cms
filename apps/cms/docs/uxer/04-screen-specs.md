# 04 — Screen specs

Design frames: **desktop 1440 × 900** (refs) and **mobile 390**. Breakpoints: ≥ 1024 rail + `SplitPane` side by side;
768–1023 rail stays, `SplitPane` stacks (aside below main); ≤ 767 `MobileTabBar` replaces `IconRail`, single column.
Component names in backticks exist in `05-component-inventory.md`; nothing else is used (misses → **Inventory gaps**).
Every screen lists **Loaded · Empty · Loading · Error · Blocked** (blocked = role-gated, disconnected, over cap or held).

## Shared conventions

- **Frame.** Every app route: `AppFrame` (wash `blue-peach` unless noted) → `IconRail` (desktop/tablet) → `TopBar` →
  `PageHeader` → content. Mobile: compact `TopBar` (`SiteSwitcher` icon-only + `IconButton`s) and `MobileTabBar`
  (Plan · Editor · Approvals · SEO · More).
- **TopBar** (02): `SiteSwitcher` "Lumen Dental · lumendental.co" · `CommandSearch` "Search posts, keywords, runs" `Kbd` ⌘K
  · spacer · `AgentStatusPill` "2 agents running" · `IconButton` bell (`dot` agent when unread) · `IconButton`
  calendar → `/plan?view=calendar` · **one** `Button variant="primary"` whose label is per route (listed per screen).
  Where the route's only real action already lives in a page region (S05 Approve, S07 Send to review, S08, S10, S11,
  S12, S13 Bi-weekly report, S14) the TopBar primary is omitted so the view keeps one ink button per region (P5).
- **P5.** Exactly one ink `Button variant="primary"` (or `LockedAction`) per region. Regions are named per screen.
- **Loading** = `Skeleton` in the loaded geometry, per region (never a full-page spinner). Regions load independently.
- **Error** = `Callout tone="block"` in the failed region, title "Couldn't load {thing}.", `action` `Button` secondary
  "Try again"; other regions stay usable. Mutations fail via `useToast` tone block with **Retry**.
- **Empty** = `EmptyState` (icon, title, body, ≤ 1 action).
- **Blocked** = `RoleGate` fallback (disabled control + "Your role can't …" reason) or `LockedAction` with reasons —
  never a hidden control (C7, P4). Disconnected data = `DataGap`, never 0 (P6).
- **Agent work** always carries `AgentBadge` or agent tone (P2); human-blocked counts use human tone (P1).
- **[A11Y] global:** landmarks `nav` (rail/tab bar), `header` (TopBar), `main`, `aside` (right rail). Focus order = rail →
  TopBar → PageHeader actions → main (top→bottom, left→right) → aside. Visible focus ring on every control. Targets
  ≥ 44 px (sm `IconButton` 32 px gets a 44 px hit area). Status never by colour alone: every `Dot`/tone pairs with text.
  Live regions: `AgentStatusPill` and agent progress `aria-live="polite"`; Toasts `role="status"`; block Callouts `role="alert"`.
- **Role legend:** S = specialist · D = developer · K = client stakeholder · A = agency admin.

### Shared overlays (not routes)

| ID | Overlay | Regions / components | Loaded | Empty | Loading | Error | Blocked |
|---|---|---|---|---|---|---|---|
| O1 | Command palette (⌘K) | `CommandPalette` groups: Posts (`StateChip` hint), Keywords, Runs, Go to (routes), Actions ("New idea", "Run keyword swarm") | Filtered list, arrow nav | "No match for "crwn"" + hint "Try a keyword or post title" | `Skeleton` 5 rows | Inline `Callout` block "Search is unavailable." | Actions the role can't do are listed disabled with reason |
| O2 | Notifications (`Sheet` side end, title "Notifications") | `DataTable dense` rows: `Dot` tone + title + body + relative time; `onRowClick` → `href`; footer `Button` ghost "Mark all read" | "Approval requested · implant vs bridge: cost and lifespan · 12 min", "CI failing on !15 · check-links", "Named blocker: Clinic photo for veneers post · day 14" | `EmptyState` "You're all caught up" | `Skeleton` | `Callout` block + Try again | n/a (per-user) |
| O3 | Account menu (rail footer `Avatar` "TB" → `Menu`) | Name + role, **Switch role (demo)**: Specialist / Developer / Stakeholder / Admin, Sign out | — | — | — | — | — |
| O4 | Run estimate (`Dialog`) | Title "Run {kind} now?", `KeyValue` Estimate · Model tier · Cap used/left, `Meter`, `Callout` when refused; footer primary **Run now** or `LockedAction` "Run now · over cap" | "Est. $4.20 · workhorse · $54.00 left" | n/a | Estimate `Skeleton` (primary disabled until estimate shown — spend guardrail) | "Couldn't estimate cost. The run won't start without an estimate." | Over cap (F9b) / role |

---

## S00 `/` — redirect
→ `/plan` for a site with a repo; → `/onboarding` for D/A when the current site has none; → `/plan` (with blocked
Callout) for S/K when none. States: Loading = `AppFrame` + `Skeleton` rail only; Error = "Couldn't open Lumen Dental." + Try again; Blocked = signed-out → auth (out of scope).

## S01 `/onboarding` — Connect a site (F7a)
Purpose: developer/admin connects site, repo app, 4 paths, Search Console, then hands off to template ingestion. Role: D, A. Wash `blue`.

| # | Region (desktop, centered `Card` 720w) | Components | Primary |
|---|---|---|---|
| 1 | PageHeader "Connect a site" / "Once per site. The CMS writes only where you point it." | `PageHeader`, `Stepper` (Site › Repo › Paths › Search Console › Template) | — |
| 2 | Step body (one step visible) | Site: `TextField` "Site name", `TextField` "Domain" (suffix "https://"). Repo: `Callout` info "Install the Grandeur CMS app on GitHub or GitLab. Choose only the site repo.", `SegmentedControl` GitHub/GitLab, `Button` "Install GitHub app" (href), `Select` "Repository". Paths: `TextField` × 4 with hints ("41 .mdx files found", "Protected · CMS never pushes here"), `ScopeNote`. Search Console: `Button` "Connect Search Console", `Select` property, `SourceNote` "Positions and impressions · lags 2–3 days". Template: `KeyValue` summary of steps 1–4 | Step CTA: **Continue** / **Install GitHub app** / **Confirm paths** / **Connect Search Console** / **Ingest template** |
| 3 | Footer | `Button` ghost "Back", ghost "Connect later" (Search Console only) | — |

Mobile 390: `Stepper` collapses to "Step 3 of 5 · Paths"; card full width; primary sticky bottom.
Microcopy: paths caption "Everything else is inferred from the repo." · scope "Writes only to content/blog and public/images/blog. Never pushes to main." · branch error "Include {slug} so each post gets its own branch."
Seed: Lumen Dental · lumendental.co · lumen/lumendental.co · main · content/blog · public/images/blog · content/{slug} · sc-domain:lumendental.co.

| State | Spec |
|---|---|
| Loaded | Current step with inferred values prefilled |
| Empty | Repo step with no installation yet → `EmptyState` "No repo connected" / "Install the app, then pick the site repo." + action **Install GitHub app** |
| Loading | Repo scan: `Skeleton` on path fields + caption "Reading lumen/lumendental.co…"; primary `loading` |
| Error | App install not detected → `Callout` block "We didn't see the app on lumen/lumendental.co. Install it, then Try again."; OAuth failed → "Google didn't connect. Try again." |
| Blocked | S/K → `RoleGate` fallback "Only a developer or admin can connect repos." + link back to `/plan` |

[A11Y] `Stepper` announces "Step 3 of 5, Paths"; errors linked via `aria-describedby`; returning from external host restores focus to the step heading.

## S02 `/plan` — Content plan (Ref 01; F1, F2, F11, F12)
Purpose: what's coming, what's stuck. Role: S (full), A (full), D (read), K (read). TopBar primary: **New idea**.

| # | Region (desktop 1440) | Components | Primary |
|---|---|---|---|
| 1 | TopBar | as shared | **New idea** |
| 2 | PageHeader "Content plan" / "Week 39 · 3 of 4 posts on cadence · 4 items need a human"; actions `SegmentedControl` Board · Calendar · Pillar matrix (icons Kanban, CalendarBlank, GridFour) | `PageHeader`, `SegmentedControl` | — |
| 3 | Pivot alert (conditional) | `Callout tone="human"` "Pivot trigger · Concentration above 60% in two reports" action `Button` secondary "See SEO" | — |
| 4 | Pipeline counts | `StatStrip`: Idea 12 · Briefed 3 · Drafting 2 · Needs assets 2 (human) · In review 2 (human) · MR open 1 · Live 41 · Decaying 5; click scrolls/filters | — |
| 5 | Main (`SplitPane`, aside 320) — **Board**: `PipelineColumn` per state; header "Idea 12 · Agent", "Drafting 2 · Agent", "Needs assets 2 · Mixed", "In review 2 · You". Briefed, MR open, Live, Decaying render header + `Button` ghost "View 41" so all human-owned columns fit the first viewport (P1). Cards = `PostCard` (chips, lowercase title, meta, `ProgressBar`, mini slot tiles, blocker lines, ↗) | `PipelineColumn`, `PostCard`, `StateChip`, `Chip`, `ProgressBar`, `AgentBadge`, `HumanBadge` | — |
| 5b | Main — **Calendar**: `CalendarWeekGrid` W39–W44, target 4/wk, items toned by owner; drag between weeks (F12) | `CalendarWeekGrid` | — |
| 5c | Main — **Pillar matrix**: `PillarMatrix` pillars × states vs planned coverage; thin pillar flagged (Pediatric) | `PillarMatrix`, `Chip` | — |
| 6 | Aside — Human ledger | `Card` + `CardHeader` (icon Hand, "Human ledger", href `/runs#ledger`) + `LedgerItem` × 3 | — |
| 7 | Aside — Next runs | `Card`, `CardHeader` "Next runs", `KeyValue` (Mon 29 Sep · 09:00 → Keyword swarm; Fri 03 Oct · 07:00 → Technical monitor), caption "Est. $4.20 · within text cap", `Button` secondary "Run now" (→ O4) | — (secondary; region has no ink) |
| 8 | Aside — Programme (C5) | `StatTile` "Cadence" "3 / 4 this week"; `StatTile` "Gap to projection" "−6.2%" + `Sparkline`; `ConcentrationGauge` 64 threshold 60; `SourceNote` "Search Console · lags 2–3 days"; `CardHeader` href `/seo` | — |

Mobile 390 (ref): `TopBar` compact (tenant pill "Lumen Dental", bell, avatar) → `PageHeader` "Content plan" / "Week 39 · 4 items need you" → `StatStrip` horizontal scroll with **Needs you 4** first and active (filter), then Idea 12 · Drafting 2 · MR open 1 · Live 41 → filtered `PostCard` list (In review "2 hard blocks" card, Needs assets card) → `LedgerItem` blocker "Clinic photo for veneers · Day 15 · named blocker" → `MobileTabBar`. **New idea** moves into `PageHeader` actions as `IconButton` Plus (label "New idea"). Calendar = one week per screen with `PaginationDots`; Pillar matrix = `PillarMatrix` scrolling horizontally with the pillar column sticky.

Microcopy: card lines "Writing section 4 of 7", "Strong model", "Image sheet · 3 slots", "1 slot marked human-only · you", "Higgsfield returning 4 candidates", "1 unresolved fact marker", "Keyword missing in first 100 words", chip "Ready", "KAS gap", "Pillar"; ledger "Day 15 · holds 1 post in Needs assets" / "Blocker", "Day 9" / "Overdue", "Day 2" / "To-do".
Seed cards: Idea — "clear aligners vs braces for adults" (Orthodontics · KAS gap · Commercial · KD 31 · Ahrefs · Comparison), "how long do dental implants last" (Implants · Informational · KD 18 · SERP · Guide), "teeth whitening sensitivity" (Cosmetic). Drafting — "dental implants in lagos: the complete guide" (Implants · Pillar · Writing section 4 of 7 · Strong model), "when should a child first see a dentist" (Pediatric · Image sheet · 3 slots · 90%). Needs assets — "invisalign cost in lagos (2026 prices)" (Orthodontics · 1 slot human-only), "porcelain veneers: before and after" (Cosmetic · Higgsfield returning 4 candidates). In review — "root canal recovery: what to expect" (General · 2 hard blocks), "implant vs bridge: cost and lifespan" (Implants · Ready). MR open — "teeth whitening at home vs in clinic" (!15, CI failing). Decaying — "best toothpaste for sensitive teeth" (chip "Refresh in review").

| State | Spec |
|---|---|
| Loaded | As ref; `StatStrip` human tiles amber; ledger blocker first |
| Empty | New site, 0 posts → main `EmptyState` icon Sparkle "No posts yet" / "The keyword swarm runs Mon 29 Sep at 09:00 and fills the Idea column. Add an idea now or run it early." action `Button` secondary "Run keyword swarm now" (→ O4). Empty column: text "Nothing in review". Ledger empty: "No human items open" |
| Loading | `Skeleton` StatStrip (8 tiles), 4 columns × 2 cards (card geometry), 3 aside cards |
| Error | Board: `Callout` block "Couldn't load the plan." + Try again; aside cards fail individually ("Couldn't load next runs.") |
| Blocked | K/D: **New idea** → `RoleGate` fallback "Your role can view the plan. Tolu B. adds ideas."; no drag handles; Run now disabled with reason. Site without repo → `Callout` human "Lumen Dental isn't connected to a repo yet. Plans and drafts work; merge requests wait for setup." (D/A action "Finish setup" → `/onboarding`) |

[A11Y] Each `PipelineColumn` is a `region` labelled "Idea, 12 posts, agent-owned"; `PostCard` is one link (↗) with blockers in its accessible description; drag has keyboard alternative (F12, gap G1); `StatStrip` items are toggle buttons with `aria-pressed`.

## S03 `/plan/new` — New idea (`Sheet` over /plan; F2)
Purpose: manual entry of a topic or keyword. Role: S, A.

| # | Region | Components | Primary |
|---|---|---|---|
| 1 | Sheet header "New idea" | `Sheet` side end 480 (mobile: side bottom) | — |
| 2 | Input | `TextField` "Topic or keyword" placeholder "e.g. dental crown cost lagos", hint "Paste a keyword or describe the post" | — |
| 3 | Enrichment (after input, `AgentBadge running` "Keyword agent") | `KeyValue`: Intent (Commercial), Difficulty "KD 22 · Ahrefs", Impressions `DataGap` when none; `Select` Pillar (General), `Select` Content type (Comparison), `Select` Week (W41 · 2 of 4 planned); `Chip` "Strong model" when pillar/money page | — |
| 4 | Footer | `Button` ghost "Cancel" · **Add to plan** | **Add to plan** |

| State | Spec |
|---|---|
| Loaded | Enriched fields shown and editable |
| Empty | Field empty → enrichment region hidden, caption "The agent fills intent, difficulty and pillar"; Add disabled |
| Loading | Enrichment `Skeleton` 5 rows + `AgentBadge running` |
| Error | Enrichment failed → `Callout` block "Couldn't look this keyword up. Add it anyway and the swarm enriches it Monday." Add stays enabled |
| Blocked | Duplicate → `Callout` info "Already planned: "invisalign cost in lagos (2026 prices)" · Needs assets" + Open it; `LockedAction` "Add to plan · duplicate". K/D → sheet not reachable; direct URL shows `RoleGate` fallback |

[A11Y] Focus lands in the field; Esc closes; enrichment announced "Intent commercial, difficulty 22".

## S04 `/posts` — Posts list
Purpose: every post in every state, searchable. Role: all (K read). TopBar primary: **New idea**.

| # | Region | Components |
|---|---|---|
| 1 | PageHeader "Posts" / "58 posts · 41 live" | `PageHeader` |
| 2 | Filters | `TextField` icon MagnifyingGlass "Search titles and keywords", `Select` State (All + 8 states), `Select` Pillar |
| 3 | Table | `DataTable`: Title (lowercase) · `StateChip` · Keyword · Pillar · Week "W41" · Owner (`AgentBadge` / `Avatar`) · Days in state · Updated "25 Sep 2026, 10:42"; `onRowClick` → `/posts/[id]` |

Mobile: filters collapse into `Select` + search; table → `Card` list (title, `StateChip`, meta line "Implants · W41 · 2 days").

| State | Spec |
|---|---|
| Loaded | 58 rows, sorted by Updated desc |
| Empty | No posts → `EmptyState` "No posts yet" + "Ideas appear after the keyword swarm runs." ; no match → "No post matches "crown"" + ghost "Clear filters" |
| Loading | `Skeleton` 8 rows |
| Error | Table `Callout` block + Try again |
| Blocked | K: rows open read-only editor; New idea → `RoleGate` fallback |

## S05 `/posts/[id]` — Split editor (Ref 02; F1, F2, F3, F6a, F10)
Purpose: draft, preview, gate, facts, versions in one place. Role: S/A edit; D/K read (K comments). Header primary:
**Approve** as `LockedAction` (desktop header region). Seed post: "root canal recovery: what to expect", In review, v4 · Human edit · 4 min ago, 1,412 words · target 1,600, regulated health.

| # | Region (desktop, three columns) | Components | Primary |
|---|---|---|---|
| 1 | Header | `PageHeader` crumbs "Content plan › In review ›", title (working title), meta `StateChip` + `OriginTag` "v4 · Human edit · 4 min ago"; actions `IconButton` ClockCounterClockwise "Versions" (→ S06), `IconButton` ChatCircle "Comments", `Menu` (Generate now, Send back, Open MR), `LockedAction` "Approve" reasons ["2 hard blocks"] | `LockedAction` **Approve** |
| 2 | Left · toolbar | `IconButton`s H2, TextB, ListBullets, LinkSimple, Quotes, ImageSquare; meta "1,412 words · target 1,600" | — |
| 3 | Left · SEO title | `TextField` "SEO title" value "Root Canal Recovery: What to Expect Day by Day" `counter` 54 / 60 | — |
| 4 | Left · draft | Blocks; `FactHighlight` open on "Around 95% of treated teeth last a lifetime"; `FactMarkerCard` "Unsourced statistic · Can't override" / "The agent found no citable source for "95%". Add one, or rewrite without the number." (Add source primary, `Button agent` "Rewrite without it"); H2 "The first 24 hours"; `AgentDiff` "Agent edit · "tighten this section"" Reject / **Accept**; disclaimer block `Callout info` "This article is general information, not medical advice. Book a consultation with a Lumen Dental dentist." | Per card: **Add source**; per diff: **Accept** |
| 5 | Left · agent panel (bottom) | `Composer` placeholder "Instruct the agent — every change comes back as a diff", suggestions "Add an FAQ" · "Put keyword in intro" · "Change the angle" | Composer send |
| 6 | Middle · preview | `CardHeader` "Live preview" meta `Chip` "manifest v2"; `SegmentedControl` Desktop/Mobile (icons); `TemplatePreview` (faux chrome "Lumen Dental · Services · Blog · Book", eyebrow "GENERAL DENTISTRY · 6 MIN READ", title, `figure.post-media · hero 1600×900`); `SourceNote` "Renders with site classes · no invented markup" | — |
| 7 | Right rail · gate | `Card` + `GateChecklist` "On-page gate 10/12": Title front-loaded 54 ch · Keyword in first 100 words "Hard block · section 2" Fix · Density "1.1% · 9 uses" · Heading hierarchy "H1 · 5×H2" · Internal links "1 of 2 · soft" · FAQ "4 questions" · Schema ready "Article, FAQ" | — |
| 8 | Right rail · facts | `Card` "Fact markers" `Chip` block "1 open"; body "3 resolved with sources · 1 needs you. Approval stays locked until it's cleared." | — |
| 9 | Right rail · versions | `VersionList`: v4 · Human edit 4m · v3 · Agent edit 22m · v1 · Agent generation 1h; `Button` ghost "All versions" | — |
| 10 | Right rail · comments / timeline | `CommentThread` (Dr Ada Okafor: "Can we avoid percentages here?"); `Timeline` post events (generated, edits, approvals, MR, CI) | — |

Mobile 390 (ref): header "In review · v4" / "root canal recovery" + `LockedAction` **Approve**; `SegmentedControl` Draft · Preview · Gate · 2; `Callout` block "2 hard blocks before approval" action "Review"; draft blocks with compact `FactMarkerCard` ("Unsourced statistic · can't override", Add source / Rewrite) and `AgentDiff` "Agent edit ready" Reject / Accept; `Composer` "Instruct the agent" pinned above `MobileTabBar`. Versions/comments via header `Menu`.
Tablet: preview becomes a `Sheet` opened by "Preview"; gate rail stacks under the draft.

| State | Spec |
|---|---|
| Loaded | As ref |
| Empty | State Idea → draft region `EmptyState` "No brief yet" / "Promote it and the agent writes a brief with sections and image slots." action primary **Promote to brief**. Briefed → brief `KeyValue` + primary **Generate now** caption "Est. $0.84 · workhorse model · $54.00 left of text cap" |
| Loading | Page: `Skeleton` per column. Drafting: `ProgressBar` agent "Writing section 4 of 7" + `AgentBadge running model="strongest"`, draft read-only, gate `Skeleton` |
| Error | Generation failed → `Callout` block "Draft generation failed at section 5 of 7. Retrying (2 of 3)." then "+ Try again"; autosave failed → Toast block "Couldn't save. Your text is kept here." + Retry; preview failed → `Callout` "Preview couldn't render with manifest v2." (hard block on Template) |
| Blocked | Approve `LockedAction` reasons (fact markers, gate 1–5, slots, template). K/D: read-only draft, toolbar and Composer replaced by `RoleGate` fallback "Stakeholders can read and comment. Edits come from the Lumen team at Grandeur."; D sees "Developers review MRs; content edits are the specialist's". Post MR open → banner `Callout` human "Changes after approval need a new approval" with primary **Re-approve and update MR**. Template can't satisfy → `Callout` block "This post needs a table. The Lumen template doesn't have one. Ask Kunle O. to extend the template." Over text cap → Generate now `LockedAction` "over cap" |

[A11Y] `FactHighlight` is a `mark` with accessible name "Unsourced claim"; `AgentDiff` announces "Suggested edit, 1 of 2" and exposes before/after as text (not strikethrough alone); Accept/Reject keyboard `A`/`R` when diff focused; SEO title counter announced at 55+ chars; preview `iframe`-like region labelled "Live preview, manifest v2".

## S06 `/posts/[id]/versions` — Version history (`Sheet`)
Purpose: restore or diff any version vs live. Role: S/A restore; D/K view.

| # | Region | Components |
|---|---|---|
| 1 | Sheet "Versions · root canal recovery" | `Sheet` side end 560 |
| 2 | List | `VersionList` v4 Human edit (Tolu B., 25 Sep 2026, 10:38, 1,412 words) · v3 Agent edit ("tighten this section") · v2 Human edit · v1 Agent generation (Blog writer agent, 1,380 words); `onDiff`, `onRestore` |
| 3 | Diff pane | Two `SourceCodeFrame mode="source"` side by side: "v3" vs "Live" (or "v3" vs "v4" before first merge) — see gap G2 |
| 4 | Footer | primary **Restore v3** (creates v5 · Human edit "restored from v3") |

| State | Spec |
|---|---|
| Loaded | 4 versions, current marked |
| Empty | Only v1 → list of one + caption "Edits appear here as versions"; diff vs live `DataGap` "Not live yet — nothing to compare" |
| Loading | `Skeleton` 4 rows + diff pane |
| Error | `Callout` block "Couldn't load versions." + Try again |
| Blocked | K/D: Restore → `RoleGate` fallback; Restore while MR open → `Callout` "Restoring changes an approved post. It will need a new approval." |

## S07 `/posts/[id]/assets` — Image pipeline for one post (Ref 03; F4, F11b)
Purpose: fill every slot from candidates, regenerate, upload or mark human-only. Role: S/A act; D/K view.
Header primary: `LockedAction` **Send to review** "4 / 5 filled". Seed: "invisalign cost in lagos (2026 prices)", Needs assets.

| # | Region (desktop) | Components | Primary |
|---|---|---|---|
| 1 | Header | `PageHeader` crumbs "Needs assets ›", title; actions `BudgetCard` compact "Image budget $142 / $200", `LockedAction` "Send to review · 4 / 5 filled" | **Send to review** |
| 2 | Left 320 · slots | `Section` "Image slots 5" meta "from production sheet"; `SlotRow` × 5: Hero "Higgsfield · MCP · selected" · Treatment timeline diagram "OpenAI · API · generating" · Price comparison chart "Inline SVG · no model" · Lifestyle · inline 2 "Flux · 4 candidates" · Clinic reception photo "Human-only · waiting on you" (`HumanBadge`); `Callout` info "Routing is by slot type" / "Brand imagery → Higgsfield. Diagrams and text → OpenAI. Volume → open-source. Charts are never generated." | — |
| 3 | Center · candidates | `CardHeader` "Lifestyle · inline 2" meta "Placed after "Is it worth the cost?" · 1200 × 800", `ProviderBadge` "Flux via MCP"; `CandidateGrid` 2×2 candidate 1–4 (3 selected) | — |
| 4 | Center · prompt | `PromptEditor`: style `Chip`s "Brand: warm ivory, teal", "Natural light, candid"; prompt "Adult patient smiling mid-conversation at a bright dental clinic, clear aligner case on the counter, shallow depth of field, no identifiable real person."; actions Regenerate · Upload own · Mark human-only; caption "Est. $0.12 per regenerate" | — |
| 5 | Right · spec + provenance | `KeyValue` Slot spec: Type Lifestyle · Format WebP · Breakpoints 480 · 768 · 1200 · Filename invisalign-lagos-2.webp; `TextArea` "Alt text · travels with the asset" "Patient holding a clear aligner case at a dental clinic in Lagos"; `ProvenanceCard` Provider Open-source · MCP · Model flux-dev · Generated 25 Sep 2026, 10:42 · Licensing No per-asset license | — |
| 6 | Right · commit | primary **Use candidate 3**; caption "Compressed, resized and committed with the post" | **Use candidate 3** |

Note P5: header region (Send to review) and right commit region (Use candidate) are separate regions; while Send to review is locked it renders locked, so only one live ink action is on screen.
Mobile 390 (ref): header "Slot 4 of 5 · 4 filled" + slot title "Lifestyle · inline 2", `PaginationDots` 5 (swipe between slots), `ProviderBadge` "Flux via MCP" · "1200 × 800 · WebP", `CandidateGrid` 2×2, prompt collapsed with `Button` ghost "Edit" (opens `Sheet` with `PromptEditor`), alt text, sticky primary **Use candidate 3**.

| State | Spec |
|---|---|
| Loaded | As ref |
| Empty | Post has no production sheet → `EmptyState` "No image slots" / "This draft didn't ask for images. Send it to review, or ask the agent to add a hero." action secondary "Add a hero slot" |
| Loading | Slot list `Skeleton` 5 rows; generating slot: `CandidateGrid` of 4 `Skeleton` tiles + `AgentBadge running` "Higgsfield is returning 4 candidates · usually under a minute" |
| Error | Provider failure on a slot → `SlotRow` status failed + center `Callout` block "Flux via MCP didn't respond. Retried 3 times." actions Try again · Upload own; guardrail refusal → `Callout` block "We don't generate identifiable real people or imitate living artists. Edit the prompt or upload a licensed photo." |
| Blocked | Over image cap → Regenerate `LockedAction` "Over image cap · $200" + "Ask Ife A. to raise it"; client forced human-only → every slot `HumanBadge`, CandidateGrid replaced by `FileDrop`; K/D → actions `RoleGate` fallback "Your role can view images. Tolu B. picks them." |

[A11Y] `CandidateGrid` is a radio group ("Candidate 3 of 4, selected"); each tile's accessible name includes prompt summary; alt text field required before Use; generation progress polite live region.

## S08 `/assets` — Cross-post slot queue
Purpose: every slot across posts, human-only tasks first. Role: S/A. TopBar primary: none (P5 kept for region primary).

| # | Region | Components | Primary |
|---|---|---|---|
| 1 | PageHeader "Image pipeline" / "7 slots open across 3 posts · 2 human-only" | `PageHeader`, `SegmentedControl` Human-only · All open · Recently filled | — |
| 2 | Human-only first | `Section` "Waiting on you 2"; `Card` per slot: `SlotRow` + post title + `LedgerItem` age; primary per card **Upload** (only the first card's is ink; others secondary) | **Upload** (first) |
| 3 | Agent slots | `Section` "Agents working 5": `SlotRow`s grouped by post with `ProgressBar` | — |
| 4 | Aside | `BudgetCard` "Image budget $142 / $200", `ShareBar` spend by provider (Higgsfield $88 · OpenAI $41 · Open-source $13), `SourceNote` "This month · resets 1 Oct" | — |

Mobile: sections stacked, aside after list.
Seed human-only: "Clinic reception photo · invisalign cost in lagos (2026 prices) · Day 3", "Clinic photo for veneers post · porcelain veneers: before and after · Day 15 · Blocker".

| State | Spec |
|---|---|
| Loaded | As above |
| Empty | `EmptyState` "Every slot is filled" / "New slots arrive with each draft's image sheet." |
| Loading | `Skeleton` 2 cards + 5 rows |
| Error | `Callout` block "Couldn't load image slots." + Try again |
| Blocked | K/D: list read-only, Upload `RoleGate` fallback |

## S09 `/templates` — Template manifests
Purpose: versions of the site template and its output format. Role: D/A manage; S/K view. TopBar primary: **Re-ingest template** (D/A) — S/K see it as `RoleGate` fallback.

| # | Region | Components |
|---|---|---|
| 1 | PageHeader "Templates" / "lumen-site.zip · 38 files · MDX + frontmatter" | `PageHeader` |
| 2 | Current manifest | `Card` `CardHeader` "Manifest v2" meta "Confirmed by Kunle O. · 18 Sep 2026" + `Chip` pass "Current"; `KeyValue` Content region article.post · Headings h2.post__heading, h3 · Lists, quotes ul, ol, blockquote.pull · Table "Not in template · posts needing one are held" · Image figure.post-media > img[srcset] · Meta title, description, canonical, og:* · Schema Article (JSON-LD); `OutputFormatPicker` (read-only for S) |
| 3 | Versions | `DataTable`: Version · Source · Output · Status (`Chip` Current / Superseded) · Confirmed by · Date |
| 4 | Held posts (conditional) | `Callout` block "1 post held · clear aligners vs braces for adults needs a table" action "Extend template" (D) |

Mobile: cards stacked; versions table → list.

| State | Spec |
|---|---|
| Loaded | v2 current, v1 superseded |
| Empty | No manifest → `EmptyState` "No template yet" / "Upload one rendered blog post (HTML) or a ZIP with partials and CSS. Posts render into it exactly." action (D/A) primary **Ingest template**; S/K body adds "Ask Kunle O. to ingest it." |
| Loading | `Skeleton` card + 3 rows |
| Error | `Callout` block "Couldn't load templates." + Try again |
| Blocked | S/K: ingest / output change → `RoleGate` fallback "Only a developer or admin can change the template." |

## S10 `/templates/ingest` — Upload › Parse › Confirm › Versioned (Ref 04; F7b)
Purpose: confirm the parsed manifest side by side with the sample post, map unclassified items once. Role: D/A. Seed: lumen-site.zip · 38 files, blog/sample-post.html, 24 mapped · 2 need you. Primary: `LockedAction` **Confirm manifest v1** "· map 2 items" (v{n} = next version).

| # | Region (desktop) | Components | Primary |
|---|---|---|---|
| 1 | Header | `PageHeader` "Templates" / "lumen-site.zip · 38 files"; `Stepper` Upload › Parse › 3 Confirm › Versioned; `Chip` "Developer"; `LockedAction` "Confirm manifest v1 · map 2 items" | **Confirm manifest v1** |
| 2 | Left · sample post | `CardHeader` "Sample post" meta "blog/sample-post.html"; `SegmentedControl` Rendered · Source; `SourceCodeFrame` with highlights: "content region · article.post", "meta: title · date · author" (GENERAL · 12 MAR 2025 · DR ADA OKAFOR), "figure.post-media · srcset ×3", "h2.post__heading", "div.cta-inline · unclassified" (human tone) | — |
| 3 | Right · manifest | `CardHeader` "Manifest" meta "24 mapped · 2 need you"; `OutputFormatPicker` "Output format · what the repo consumes" MDX + frontmatter · HTML · JSON · Component | — |
| 4 | Right · unclassified | `Section` "Unclassified · map once"; `ManifestMappingRow` div.cta-inline (`Select` "Choose type": CTA block · Callout · Ignore), aside.author-card (suggested "Author bio?") | — |
| 5 | Right · detected | `Section` "Content structures": Headings h2.post__heading, h3 · Lists, quotes ul, ol, blockquote.pull · Table "Not in template · posts needing one are held"; `Section` "Images · metadata · schema": Image figure.post-media > img[srcset] · Meta title, description, canonical, og:* · Schema Article (JSON-LD) | — |
| 6 | Footer note | `SourceNote` "Versioned. A redesign means re-ingesting, not rebuilding." | — |

Upload step: `FileDrop` "Drop the blog template" / "One rendered blog post as HTML, or a ZIP with the template, partials, CSS and a sample post." Parse step: `ProgressBar` agent "Detecting content region… 3 of 5" (steps = PRD parse list). Versioned step: `Callout` pass "Manifest v1 confirmed · Kunle O. · 25 Sep 2026, 11:05" + `Button` primary "Back to templates".
Mobile 390 (ref): "Step 3 of 4 · Confirm" / "lumen-site.zip"; `Callout` human "2 items need a mapping" / "24 detected automatically. Map these once and the manifest locks as v1."; per item `SegmentedControl` CTA block · Callout · Ignore; collapsed `Section`s "Content structures 9", "Image containers 3", "Metadata and schema 12"; sticky `LockedAction` "Confirm manifest v1 · 1 left". Sample post behind a "Sample" `Button` → `Sheet`.

| State | Spec |
|---|---|
| Loaded | Confirm step as ref |
| Empty | Upload step, nothing dropped → `FileDrop` idle; primary absent |
| Loading | Parse: `Stepper` at Parse, `ProgressBar`, `Skeleton` manifest rows; upload `FileDrop` progress "Uploading 4.2 MB of 11 MB" |
| Error | No sample post → `Callout` block "No sample post found. Add one rendered blog post as HTML to the ZIP."; invalid HTML → "The sample post isn't valid HTML (line 214). Fix it and upload again."; > 50 MB → "Keep the ZIP under 50 MB; drop node_modules and images." |
| Blocked | Unmapped items → `LockedAction` reasons list them; S/K → `RoleGate` fallback "Only a developer or admin can ingest templates." |

[A11Y] Highlights in `SourceCodeFrame` have text labels (not colour only) and are listed in the manifest in the same order; `Select` per row labelled with its selector ("Type for div.cta-inline").

## S11 `/approvals` — Approval queue + gate + MR preview (Ref 05; F5, F6a)
Purpose: the one human sign-off. Role: S/A approve; D/K view. Primary (gate region): **Approve and open MR**.

| # | Region (desktop, 3 columns) | Components | Primary |
|---|---|---|---|
| 1 | Header | `PageHeader` "Approvals" / "3 waiting"; `TextField` icon MagnifyingGlass "Search" | — |
| 2 | Left 300 · queue | `ApprovalQueueItem` × 3: Ready · Day 1 "implant vs bridge: cost and lifespan" (selected) · 2 hard blocks · Day 2 "root canal recovery: what to expect" · Refresh cycle · Day 4 "best toothpaste for sensitive teeth" | — |
| 3 | Center · post | `Callout` info "Approving asserts the facts are right, the voice is right, and the brand stands behind it. It can't be delegated to an agent."; title "Implant vs Bridge: Cost, Lifespan and Which to Choose"; meta `Chip`s "implant vs bridge cost" · Commercial · "1,620 words" · `OriginTag` "v3 · agent edit"; `Button` secondary "Open draft" | — |
| 4 | Center · readiness | `ReadinessGrid`: Fact markers "0 unresolved" · Image slots "4 of 4 filled" · On-page 1–5 "All passing" · Template "Renders cleanly" | — |
| 5 | Center · soft blocks | `OverrideReason` "Soft block · override with a reason" — "Fewer than two internal links · 1 of 2"; caption "Logged to the audit trail and listed in the MR" | — |
| 6 | Center · gate | "I confirm" `AssertionList` (The facts are right · The voice is right · The brand stands behind it); `Button` secondary "Send back"; caption "2 of 3 confirmed"; `LockedAction` / primary **Approve and open MR** | **Approve and open MR** |
| 7 | Right 420 · MR | `MRPreview`: host GitHub, `content/implant-vs-bridge-cost` → `main`; files content/blog/implant-vs-bridge-cost.mdx +212 · public/images/blog/ · 4 WebP 312 KB · public/sitemap.xml +1; Description `KeyValue` Keyword implant vs bridge cost · Intent Commercial · On-page 11 / 12 · 1 override · Internal links 1 added · Schema Article, FAQPage; `ScopeNote` "Writes only to content/blog and public/images/blog. Never pushes to main. CI runs the repo's own checks." | — |

Mobile 390 (ref): header "Approval 1 of 3" / "implant vs bridge" + `PaginationDots` (swipe queue); title; `Callout` pass "All 4 hard checks pass"; override shown as quote "Internal links 1 of 2 · overridden" + reason; `AssertionList`; `MRPreview` compact "Opens on GitHub · content/implant-vs-bridge-cost → main · 1 post · 4 images · sitemap"; sticky primary **Approve and open MR**.

| State | Spec |
|---|---|
| Loaded | As ref |
| Empty | `EmptyState` icon SealCheck "Nothing waiting for approval" / "Posts land here when every image slot is filled. 2 are in Needs assets." action secondary "See Needs assets" |
| Loading | Queue `Skeleton` 3 rows; center `Skeleton` grid; MR preview `Skeleton` file rows; after Approve: primary loading "Opening merge request…" |
| Error | MR open failed → `Callout` block "GitHub app can't write to lumen/lumendental.co. Ask Kunle O. to reinstall it." + primary **Retry opening MR** (approval kept); queue load error in left column only |
| Blocked | Hard blocks → `ReadinessGrid` tiles block tone + `LockedAction` "Approve and open MR · 2 hard blocks" (tile click → editor at block). Soft reason missing → locked "Add a reason for the soft override". D/K → `RoleGate` fallback "Your role can't approve content. Tolu B. or an admin can." |

[A11Y] `AssertionList` is a group "I confirm" with 3 checkboxes; primary's disabled reason is in `aria-describedby`; queue is a listbox with "Day 2, 2 hard blocks" in each option name.

## S12 `/merge-requests` — MR lifecycle (F6)
Purpose: open/merged MRs with CI, conflicts and the post timeline. Role: D primary, S/A view, K view. TopBar primary: none on list; detail primary **Open on GitHub** (D) / "View MR" secondary for others.

| # | Region | Components | Primary |
|---|---|---|---|
| 1 | PageHeader "Merge requests" / "2 open · 1 needs attention"; `SegmentedControl` Open · Merged · Closed | `PageHeader`, `SegmentedControl` | — |
| 2 | List | `DataTable`: # (!16) · Post (lowercase title) · Branch (mono) → base · `CIStatus` · Status (`Chip`: Open / Conflict block / Merged pass / Closed) · Opened · Overrides count | — |
| 3 | Detail (`SplitPane` aside 440 on row click) | `CardHeader` "!15 · teeth whitening at home vs in clinic"; `CIStatus` failing "check-links · 1 broken link /blog/whitening-costs (404)"; `KeyValue` files; `Timeline` (Approved by Tolu B. 23 Sep · MR opened · CI failing · Fix pushed · CI passing · Merged a41f9c2 · Live · KAS scheduled); conflict: two `SourceCodeFrame mode="source"` ("main" vs branch) for `public/sitemap.xml`; `ScopeNote` | **Open on GitHub** / **Resolve on GitHub** (conflict) |

Seed: !16 implant vs bridge (open, CI pending), !15 teeth whitening at home vs in clinic (open, CI failing), !14 emergency dentist in lekki: when to go (merged 23 Sep 2026, 11:20), !13 teeth whitening price in lagos (merged 9 Sep 2026).
Mobile: list → cards (title, `CIStatus`, status chip); detail full-screen `Sheet`.

| State | Spec |
|---|---|
| Loaded | As seed |
| Empty | `EmptyState` "No open merge requests" / "Approved posts open one branch each here." |
| Loading | `Skeleton` 4 rows; CI pending shows `Dot pulse` "Waiting on the repo's checks · 12 min" |
| Error | Git host unreachable → `Callout` block "Couldn't reach GitHub. Statuses may be stale (last synced 10:31)." + Try again |
| Blocked | Conflict unresolvable → row `Chip` block "Conflict · public/sitemap.xml", specialist sees `Callout` human "Waiting on Kunle O. · conflict in public/sitemap.xml"; repo disconnected → `DataGap` "Repo not connected"; K: read-only, no host links to private repo |

## S13 `/seo` — SEO trajectory + KAS (Ref 06; F8)
Purpose: is the programme working, and which keyword/page carries the weight. Role: all (K read). Header primary: **Bi-weekly report** (→ S14). Wash `blue`.

| # | Region (desktop) | Components | Primary |
|---|---|---|---|
| 1 | Header | `PageHeader` title `SiteSwitcher`-scoped "Lumen Dental"; actions `SegmentedControl` 8 weeks · Quarter · Since launch, `SourceNote` "Search Console · lags 2–3 days · modeled CTR curve", `Button` primary "Bi-weekly report" | **Bi-weekly report** |
| 2 | Trajectory card | `StatTile size="lg"` "Gap to phase projection" "−6.2%"; `StatTile` "Organic sessions · W39" "3,184" caption "of 3,395 projected"; `TrajectoryChart` W32–W39 (legend Actual · Month 3 projection) | — |
| 3 | Plan status | `StatusLight` × 4: Cadence "3 / 4 wk" (amber) · Pillar coverage "4 / 5" (amber) · Technical health "96" (green) · Human items executed "62%" (amber) each with detail line | — |
| 4 | KAS | `CardHeader` "Keyword Attribution Score" meta "Recalculated 24 Sep · after 1 merge"; `Select` snapshot (Latest · After !14 merged · 24 Sep · Weekly · 17 Sep); `ConcentrationGauge` 64 "Concentration 64% · fragile"; `KasTable` columns Keyword · Share · Δ · Ranking page · Position | — |
| 5 | Pillar distribution | `ShareBar` "share of score": Orthodontics 34% · Implants 27% · Cosmetic 22% · General 14% · Pediatric 3% (human tone, note "claimed, unearned"); caption "Keyword swarm prioritises Pediatric in Monday's run." | — |
| 6 | Content performance | `DataTable` sortable: Post · Position + `Sparkline invert` · Impressions · Clicks · KAS contribution · `Chip` "Page 2 · refresh picks this up" | — |
| 7 | Ledger strip | `Section` "Human ledger" `LedgerItem` × 3 (PRD: ledger on dashboard) | — |

KAS seed: invisalign cost lagos 18.4% +2.1 /blog/invisalign-cost-lagos 7 ↑ · dental implants lagos (orphan) 14.2% −1.3 /services/implants 11 ↓ decaying · teeth whitening price 12.6% 0.0 /blog/whitening-cost 5 · emergency dentist lekki 10.3% +0.8 /locations/lekki 3 ↑ · root canal cost lagos 8.5% +0.4 /blog/root-canal-cost 9 (top 5 = 64.0%).
Keyword row click → `Sheet` "emergency dentist lekki": `Sparkline` positions, `Timeline` snapshots, ranking pages, contributing posts (F8).
Mobile 390 (ref): tenant pill + range `SegmentedControl` "8 weeks"; `StatTile` "Gap to phase projection −6.2%" "3,184 of 3,395"; `SourceNote` "Search Console · lags 2–3 days"; 2×2 `StatusLight` (Cadence 3 / 4 wk · Pillar coverage 4 / 5 · Tech health 96 · Human items 62%); "Attribution 64% top 5" + top 2 `KasRow`s; rest behind `Button` ghost "All keywords".

| State | Spec |
|---|---|
| Loaded | As ref |
| Empty | Site < 2 weeks of data → trajectory `EmptyState` "Not enough data yet" / "The first trajectory needs 2 weeks of Search Console data · from 6 Oct"; KAS "Scores appear 24 h after the first merge" |
| Loading | `Skeleton` tiles, chart area, 5 table rows |
| Error | Chart `Callout` block "Couldn't load trajectory." + Try again; KAS region independent |
| Blocked | Search Console missing/expired → `DataGap` "Search Console not connected" / "No positions or impressions — nothing here is estimated." action (D/A) "Reconnect"; Ahrefs missing → difficulty/backlink columns `DataGap`; week gap → chart broken line + "no data W35" |

[A11Y] `TrajectoryChart` has a text alternative table (week, actual, projected) toggled by `Button` ghost "Show as table"; Δ values carry sign text ("+2.1", "−1.3"), not colour only; `StatusLight` names light in text ("amber").

## S14 `/seo/reports` — Bi-weekly report editions
Purpose: every stored edition, auditable; stakeholder reading surface. Role: all. Primary: **Open latest** (list) / none in reader.

| # | Region | Components |
|---|---|---|
| 1 | PageHeader "Reports" / "Every edition is stored · alternate Fridays" | `PageHeader` |
| 2 | Editions (left 320) | `DataTable dense`: "#7 · 12–25 Sep 2026 · published 25 Sep 2026" … "#1 · 4–17 Jul 2026"; `Chip` "2 pivot triggers" |
| 3 | Reader (`?edition=7`) | `Card`: headline "Gap to projection narrowed from −8.9% to −6.2%"; `StatTile`s; `TrajectoryChart` frozen at edition date; `StatusLight`s; `KasTable` snapshot; `Section` "Pivot triggers" (`Callout` human "Concentration above 60% in two reports"); `Section` "Human ledger" `LedgerItem`s incl. named blockers; `SourceNote` "Generated by the visualization agent · 25 Sep 2026, 07:00" |

Mobile: editions `Select` on top, reader below.

| State | Spec |
|---|---|
| Loaded | Edition #7 open |
| Empty | `EmptyState` "No reports yet" / "The first report publishes Fri 9 Oct." |
| Loading | `Skeleton` list + reader blocks |
| Error | `Callout` block "Couldn't open edition #7." + Try again |
| Blocked | Edition with missing source data → sections render `DataGap` as stored (never back-filled) |

## S15 `/runs` — Schedules, run log, human ledger (F9, F11)
Purpose: scheduled + manual runs with cost, and the human ledger. Role: S/A trigger; D/K view. TopBar primary: **Run now** (opens `Menu` of run kinds → O4).

| # | Region | Components | Primary |
|---|---|---|---|
| 1 | PageHeader "Runs & ledger" / "Text $96.00 of $150 · Image $142 of $200 · resets 1 Oct"; `Tabs` Schedules · Run log · Ledger (desktop shows Schedules + Ledger side by side, Run log below) | `PageHeader`, `Tabs` | — |
| 2 | Budgets | `BudgetCard` Text generation $96 / $150; `BudgetCard` Image generation $142 / $200 (80% alert at $160) | — |
| 3 | Schedules | `ScheduleRow` × 8: Keyword swarm (Monday weekly · New ideas in the plan · Mon 29 Sep, 09:00 · est. $4.20) · Post generation (Per publish slot · Drafts in review) · Technical monitor (Friday weekly · Health digest) · QA sweep (Friday light, bi-weekly full · Scorecard and the human ledger) · Content refresh (Monthly · est. $62.00) · Link prospecting (Monthly) · Bi-weekly report (Alternate Fridays) · KAS recalculation (24 h post-merge, then weekly); each `Toggle` + `Button` "Run now" | — |
| 4 | Ledger (anchor `#ledger`) | `LedgerItem`s sorted by age: Clinic photo for veneers post · Day 15 · Blocker · holds 1 post in Needs assets / Sign off prune list · Sept · Day 9 · Overdue / Review root canal draft · Day 2 · To-do; `Menu` per item Reassign | — |
| 5 | Run log | `DataTable` of `RunRow`: kind icon · agent · trigger `Chip` (Scheduled/Manual) · model tier · tokens · cost vs estimate · status · started | — |

Run log seed: Post generation · dental implants in lagos: the complete guide · Manual · strongest · 38,420 tokens · $1.84 / est. $1.90 · running · Image generation · porcelain veneers · Scheduled · Higgsfield · $0.48 · succeeded · KAS recalculation · 24 Sep 2026, 11:20 · fast · $0.06 · succeeded · Technical monitor · 25 Sep 2026, 07:00 · failed "Crawl timed out at 312 of 540 URLs · retried 3 times" · Content refresh · Manual · refused-over-cap "est. $62.00 > $54.00 left".
Mobile: `Tabs` switch regions; budgets as two `Meter`s in header.

| State | Spec |
|---|---|
| Loaded | As seed |
| Empty | Run log `EmptyState` "No runs yet" / "Scheduled runs start Mon 29 Sep at 09:00."; Ledger "No human items open · nice." (no exclamation) |
| Loading | `Skeleton` budgets, 8 schedule rows, 6 log rows |
| Error | Per region `Callout` block + Try again |
| Blocked | Over cap → O4 refused (F9b); running kind → Run now `LockedAction` "Keyword swarm is running · started 10:31"; K/D → Run now and Toggles `RoleGate` fallback "Your role can't trigger runs." (ledger stays visible to K) |

## S16 `/settings` — Site & repo · Providers & budgets · Model routing · Members & roles · Brand pack · Audit log
Purpose: guardrails and configuration. Role: A full; D Site & repo; S view Brand pack + Audit log; K Audit log only [ASSUMED]. Per tab one primary **Save changes** (disabled until dirty).

| Tab | Regions / components | Microcopy |
|---|---|---|
| Site & repo | `KeyValue` Host GitHub · Repo lumen/lumendental.co · Installed as grandeur-cms · Base main · Content content/blog · Assets public/images/blog · Branch content/{slug}; `ScopeNote`; Search Console status `Chip` pass "Connected · sc-domain:lumendental.co"; Ahrefs `Chip` "CSV import · 12 Sep 2026"; `TextField`s editable for D/A | "Secrets are encrypted and never shown again after entry." |
| Providers & budgets | `BudgetCard` × 2 (`onEdit`), `TextField` caps with prefix "$"; provider rows `KeyValue` Higgsfield (MCP) · OpenAI (API key "•••• set 12 Sep") · Open-source (Flux via MCP); `Toggle` "Human-only images for this client"; `Select` "Pin one provider" | "Runs above the cap are refused, not billed. Admins get an alert at 80%." |
| Model routing | `DataTable`: Task (Crawling and diffing · Writing and judgment · Pillar pages · Strategy and pivot analysis) · Tier `Select` (fast / workhorse / strongest) · Model id (read from config) · `SourceNote` "Verified against provider docs 20 Sep 2026" | "Pillar and money pages always use the strongest tier." |
| Members & roles | `DataTable`: `Avatar` + name · email · role `Select` · last active; `Button` secondary "Invite member"; roles explained in `Callout` info | "Permissions are per site." |
| Brand pack | `TextArea` voice notes; style `Chip`s ("warm ivory", "teal", "natural light, candid"); `Toggle` "Regulated topic · health" (mandatory disclaimer) + `TextArea` disclaimer text; Higgsfield reference elements list | "Injected into every prompt, whatever the provider." |
| Audit log | `DataTable` / `Timeline`: 25 Sep 2026, 10:58 · Tolu B. · overrode soft block · implant vs bridge · "Internal links 1 of 2 — Only one relevant page is live…"; 10:59 · approved; 11:00 · CMS agent · opened MR !16; `Select` filter actor/action; `TextField` search | "Every run, edit, approval, override and merge — with who and when." |

Mobile: `Tabs` become a `Select`.

| State | Spec |
|---|---|
| Loaded | Tab content as above |
| Empty | Members only you → `EmptyState` "Just you so far" + secondary "Invite member"; audit empty "No activity yet" |
| Loading | `Skeleton` per tab |
| Error | Save failed → Toast block "Couldn't save. Nothing changed." ; load `Callout` block |
| Blocked | Non-admin on Providers/Routing/Members → `RoleGate` fallback "Only an agency admin can change budgets and routing." ; specialist on Site & repo → read-only |

## S17 `/styleguide` — DS verification harness (builders only)
Purpose: render every inventory component in every state. Role: builders (dev env only).
Regions: `PageHeader` "Styleguide"; one `Section` per inventory group (A Shell … E Domain) with each component's default · hover · focus-visible · pressed · disabled · loading variants; tone swatches via `Chip` per `TTone`.

| State | Spec |
|---|---|
| Loaded | All sections |
| Empty | n/a |
| Loading | n/a (static) |
| Error | Component render error caught per `Section` → `Callout` block naming the component |
| Blocked | Production build → route returns 404 |

---

## PRD P0 → screen coverage

| PRD requirement | Screens |
|---|---|
| M1 Pipeline board, 8 states + owners | S02 (board, `StatStrip`, `PipelineColumn`), S04 |
| M1 Idea sources (swarm, KAS gap, manual) + dedupe | S02 card chips, S03 |
| M1 Calendar vs cadence target, pillar matrix | S02 Calendar / Pillar matrix |
| M1 Drag card to week reschedules generation | S02 Calendar (F12) |
| M2 Generation (brief → writer agent, strong model routing) | S05 empty/Briefed, S03 Strong model chip |
| M2 Agent edits as accept/reject diffs | S05 `AgentDiff`, `Composer` |
| M2 Inline on-page gate + logged override | S05 `GateChecklist`, S11 `OverrideReason` |
| M2 Fact markers (not overridable) | S05 `FactMarkerCard`, S11 `ReadinessGrid` |
| M2 Version history, origin tags, restore, diff vs live | S05 `VersionList`, S06 |
| M3 Slot queue, spec, prompt, filename, alt | S07, S08 |
| M3 Provider routing by slot type, per-client pin/budget/human-only | S07 routing Callout, S16 Providers |
| M3 2–4 candidates, regenerate, upload, human-only | S07 |
| M3 Post-processing (WebP/AVIF, breakpoints, same commit) | S07 spec + caption, S11 MR files |
| M3 Provenance | S07 `ProvenanceCard` |
| M4 HTML/ZIP ingest, parse, confirm, versioned manifest, output formats | S10, S09 |
| M4 Fidelity rule (hold posts, ask developer) | S05 blocked, S09 held Callout, S11 Template tile |
| M5 App connection, 4 declared paths, path scope | S01, S16 Site & repo, `ScopeNote` on S01/S11/S12 |
| M5 Branch/commit/MR contents incl. overrides | S11 `MRPreview`, S12 |
| M5 CI surfaced in timeline | S05 `Timeline`, S12 `CIStatus` |
| M5 After merge → Live, 24 h scoring, indexing | S12 timeline, S02 Live count, S15 KAS row |
| M5 Conflicts: rebase + re-render, never auto-merge | S12 detail |
| M6 Trajectory vs phase projection, gap headline | S13, S02 aside (C5) |
| M6 Plan status traffic lights with numbers | S13 `StatusLight` |
| M6 Content performance sortable, page-2 | S13 region 6 |
| M6 Bi-weekly report stored editions, pivot triggers into plan | S14, S02 pivot Callout |
| M6 Data sources + explicit gaps | S13 `DataGap`, S01 Search Console |
| M7 KAS share, Δ, ranking page, orphan, concentration, pillar distribution, claimed-but-unearned, snapshots after merge, honest limit | S13 (`KasTable`, `ConcentrationGauge`, `ShareBar`, snapshot `Select`, `SourceNote`) |
| Gate: one approval, 3 assertions, hard vs soft | S11 |
| Scheduled + manual triggers, identical; Generate now | S15, S02 Next runs, S05 Generate now |
| Human ledger 7 / 14 days, on dashboard + reports | S02 aside, S13 region 7, S14, S15 |
| Cost caps, estimate before run, refuse over cap, 80% alert | O4, S15, S07, S16 |
| Content guardrails (no fabrication, no real people/artists, regulated disclaimer) | S05 markers + disclaimer, S07 refusal, S16 Brand pack |
| Repo/secrets guardrails, tenant isolation | S01, S16 (secrets never shown), `SiteSwitcher` scopes every route |
| Audit trail | S16 Audit log, S05/S12 `Timeline` |
| Roles (4, per site) incl. stakeholder comment-only | Every screen's Blocked state, O3 role switcher, S05 `CommentThread` |
| Integrations: Slack/email deep links | 02 entry points → S11, S07, S05, S14 |

## Inventory gaps

| # | Needed by | Gap | Proposed fix (for the DS lead; not implemented here) | Interim |
|---|---|---|---|---|
| G1 | S02 Calendar, F12 | `CalendarWeekGrid` has no drag/drop or move callback; `PostCard` drag has no keyboard alternative (WCAG 2.5.7) | Add `onMove?(postId: string, week: number)`, `closedWeeks?: number[]` to `CalendarWeekGrid`; items keyboard-liftable (Space, ←/→, Space) | Board-only drag; week change via S03-style `Select` "Week" |
| G2 | S06 diff vs live, S12 conflict | No generic read-only diff; `AgentDiff` is bound to `IAgentSuggestion` with Accept/Reject | Allow `AgentDiff` `readOnly` + `title` with plain `before/after`, or add `DiffView { before; after; labels }` | Two `SourceCodeFrame mode="source"` side by side |

Conventions (not gaps): error states use `Callout tone="block"` + `Button`; notifications list uses `DataTable dense` with `onRowClick`.

## Self-check — uxer-harness "Done when"

- [x] Every PRD P0 requirement maps to at least one screen — see coverage table above (modules 1–7, gate, triggers, ledger, cost caps, guardrails, audit trail, roles).
- [x] Every screen maps only to components present in `05-component-inventory.md` — two needs recorded as G1/G2 with inventory-only interims.
- [x] Every critical flow has a click budget and meets it — `03-flows.md` summary, 24 budgeted paths across F1–F12, all ✅.
- [x] Every screen specifies all five states — S00–S17 and O1–O4.
- [x] `uxer-output.json` parses and its component list equals the inventory — validated with `python -c "import json;json.load(...)"` and a name diff against 05 (95 names, 0 missing, 0 extra; `KasRow / KasTable` and `ToastProvider / useToast` split into two names each, `<T>` and `()` stripped). `Checkbox`, `AvatarStack`, `Divider` are used only on S17 — candidates to keep lean.
- [x] Conflicts and scope cuts recorded in `00-decisions.md` — C1–C9 + scope cuts (not edited in this pass). New assumptions made here are tagged [ASSUMED] in 03/04 for the next 00 update: re-approval after MR open, developer read-only on content and runs, no ledger snooze, 50 MB ZIP limit, stakeholder settings access = audit log only, template drift default = new posts only.
