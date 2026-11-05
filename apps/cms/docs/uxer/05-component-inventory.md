# 05 — Component inventory (the DS contract)

Every screen in `04-screen-specs.md` is built **only** from these. Names and props below are binding: DS files
implement them exactly; feature code imports them from `@/ds`. Domain types come from `@/lib/types`.
`TIconName` = any Phosphor React component name (e.g. `"Kanban"`), rendered via `<Icon name="Kanban" />`.
`TTone` = `"neutral" | "ink" | "agent" | "human" | "block" | "pass" | "info"` (from `@/lib/types`).

All interactive parts support: default · hover · focus-visible · pressed · disabled; plus loading where listed.
Every component accepts `className?: string`.

## A. Shell — `src/ds/shell.tsx`

| Component | Props | Notes / refs |
|---|---|---|
| `AppFrame` | `children`, `wash?: "blue-peach" \| "blue" \| "peach" \| "green" \| "neutral"` | Canvas + two blurred wash orbs (top-left blue, bottom-right peach) + the frosted glass **shell** (inset 16, radius 32, white 45% + white edge). All refs, visual aid. |
| `IconRail` | `items: IRailItem[]`, `activeHref: string`, `footer?: ReactNode` | `IRailItem { href; icon: TIconName; label; dot?: TTone }`. 48w column, mark on top, 44px round buttons (active = ink fill, white icon), dot badge top-right. Tooltip label on hover. |
| `RailButton` | `href`, `icon`, `label`, `active?`, `dot?: TTone` | Used by IconRail. `aria-current="page"` when active. |
| `TopBar` | `children` | Row, gap 10, 44px tall items. |
| `SiteSwitcher` | `site: ISite`, `sites: ISite[]`, `onChange(id)` | White pill: tenant icon bubble + name + grey domain + caret → `Menu`. |
| `CommandSearch` | `placeholder`, `onOpen()` | White pill 320w, magnifier, `⌘K` kbd chip. Opens `CommandPalette`. |
| `CommandPalette` | `open`, `onClose`, `groups: { label; items: { id; label; hint?; icon?; href?; onSelect? }[] }[]` | Dialog, filter input, arrow-key nav. |
| `AgentStatusPill` | `running: number`, `onClick?` | White pill, blue dot with 4px soft ring (pulse), "N agents running". 0 → grey dot "Agents idle". |
| `PageHeader` | `title`, `subtitle?: ReactNode`, `actions?: ReactNode`, `back?: { href; label }`, `crumbs?: { label; href? }[]` | Title 26 General Sans 500 −0.01em; subtitle Poppins 13 ink-3. |
| `MobileTabBar` | `items: IRailItem[]`, `activeHref` | Glass bar bottom, 5 items, safe-area. |
| `SplitPane` | `children`, `aside?: ReactNode`, `asideWidth?: number` | Main + right rail (default 320). Stacks under 1024. |

## B. Controls — `src/ds/controls.tsx`

| Component | Props | Notes |
|---|---|---|
| `Icon` | `name: TIconName`, `size?: number`, `weight?: "regular" \| "bold" \| "fill"`, `className?` | Wraps Phosphor. |
| `Button` | `variant?: "primary" \| "secondary" \| "ghost" \| "glass" \| "danger" \| "agent"`, `size?: "sm" \| "md" \| "lg"`, `icon?: TIconName`, `trailing?: ReactNode`, `loading?`, `fullWidth?`, `href?`, + button attrs | Pill. primary = ink fill (P5: one per region). agent = blue text on agent-soft (agent actions like "Rewrite without it"). md = 44h. |
| `IconButton` | `icon`, `label` (required, aria), `variant?: "white" \| "ink" \| "ghost" \| "outline"`, `size?: "sm" \| "md"`, `dot?: TTone`, `href?` | 44 round (sm 32). The visual-aid's circular ↗ card button = `variant="outline" size="sm" icon="ArrowUpRight"`. |
| `SegmentedControl<T>` | `options: { value: T; label; icon? }[]`, `value`, `onChange`, `size?` | White pill track, active = ink pill. Board/Calendar/Pillar matrix. |
| `Tabs` | `tabs: { id; label; count? }[]`, `value`, `onChange` | Underline-free: text tabs with ink active, used in Settings. |
| `TextField` | `label`, `value`, `onChange`, `placeholder?`, `hint?`, `error?`, `icon?`, `suffix?`, `counter?: { value; max }` | Counter turns block when over (SEO title 54 / 60). |
| `TextArea` | same as TextField + `rows?` | |
| `Select` | `label?`, `value`, `options: { value; label; hint? }[]`, `onChange`, `icon?` | Pill trigger + `Menu`. |
| `Checkbox` | `checked`, `onChange`, `label: ReactNode`, `description?` | Round check (approval assertions use `AssertionList`). |
| `Toggle` | `checked`, `onChange`, `label`, `caption?` | Visual aid Tasks switch style (ink on). |
| `Chip` | `tone?: TTone`, `icon?`, `children`, `size?: "sm" \| "md"`, `onRemove?` | Tag pill (pillar "Orthodontics" = neutral sunken; "KAS gap" = agent; "Pillar" = ink; "2 hard blocks" = block; "Urgent"/"To-do" of the visual aid). |
| `Dot` | `tone: TTone`, `pulse?`, `ring?` | 8px status dot. |
| `Kbd` | `children` | ⌘K chip. |
| `Menu` | `trigger: ReactNode`, `items: { id; label; icon?; tone?; onSelect; disabled? }[]`, `align?: "start" \| "end"` | Popover list, radius 18. |
| `Tooltip` | `label`, `children` | |
| `Composer` | `placeholder`, `value`, `onChange`, `onSubmit`, `suggestions?: string[]`, `onSuggestion?(s)`, `busy?` | The bottom bar of the visual aid & editor: suggestion chips row above, sparkle icon, input, mic + ink round send. |
| `FileDrop` | `accept`, `onFile(file)`, `title`, `hint` | Dashed 2px line, radius 24. HTML or ZIP. |
| `Stepper` | `steps: { id; label }[]`, `current: number` | Wizard progress (Upload › Parse › 3 Confirm › Versioned): done = green check, current = ink number. |
| `LockedAction` | `label`, `icon?`, `reasons: string[]`, `onClick?`, `unlocked?: boolean` | Primary button that shows lock icon + inline "· 2 hard blocks" while locked; tooltip lists reasons. P4. |

## C. Surfaces — `src/ds/surfaces.tsx`

| Component | Props | Notes |
|---|---|---|
| `Card` | `variant?: "solid" \| "glass" \| "sunken" \| "outline" \| "ink"`, `padding?: "sm" \| "md" \| "lg" \| "none"`, `interactive?`, `selected?`, `as?`, `children` | solid = white r-22; selected = 1.5px ink outline (ref In review column). |
| `CardHeader` | `icon?`, `title`, `meta?: ReactNode`, `action?: ReactNode`, `href?` | Visual-aid widget header: icon + title left, ↗ outline IconButton right (auto when `href`). |
| `Section` | `title`, `count?`, `meta?: ReactNode`, `action?`, `children` | Column/section label row ("Idea 12 · Agent"). |
| `StatStrip` | `items: { id; label; value: ReactNode; tone?: TTone; active?; onClick? }[]` | Ref 01 pipeline counts row: white track, human tone = amber tile, active = sunken tile. |
| `StatTile` | `label`, `value`, `delta?: { value: string; tone: TTone }`, `caption?`, `size?: "md" \| "lg"` | Big number (SEO −6.2%). Tabular numerals. |
| `KeyValue` | `rows: { k: ReactNode; v: ReactNode }[]`, `dense?` | Slot spec, provenance, MR description. |
| `Callout` | `tone: TTone`, `icon?`, `title`, `children?`, `action?` | agent = blue-soft, human = amber-soft, block = red-soft, info = sunken. |
| `SourceNote` | `children`, `icon?` | Small `ⓘ Search Console · lags 2–3 days` pill (P6). |
| `DataGap` | `label`, `reason`, `action?` | Explicit "missing connection" block, dashed. Never blank (PRD M6). |
| `EmptyState` | `icon`, `title`, `body`, `action?` | |
| `Skeleton` | `className` (w/h via class), `radius?` | Shimmer. |
| `ProgressBar` | `value` (0–1), `tone?: TTone`, `label?`, `size?` | Ref "Writing section 4 of 7" (agent blue). |
| `Meter` | `value`, `max`, `label`, `format?(n)`, `warnAt?: number` | Budget $142 / $200 with 80% amber alert. |
| `PaginationDots` | `count`, `index`, `onChange?` | Visual aid carousel dots (active = ink bar). |
| `Avatar` | `name`, `initials?`, `size?: 24 \| 32 \| 44`, `tone?` | Initial bubbles (TB, KO). |
| `AvatarStack` | `people: { name; initials }[]`, `max?` | +N overflow = ink bubble (visual aid "+5"). |
| `Timeline` | `items: { id; icon; tone?: TTone; title; meta; body? }[]` | Post timeline, audit log, run log detail. |
| `DataTable<T>` | `columns: { key; header; width?; align?: "start" \| "end"; render(row) }[]`, `rows: T[]`, `onRowClick?`, `sort?: { key; dir }`, `onSort?`, `empty?: ReactNode`, `dense?` | Hairline rows (KAS table, content performance, run log). |
| `Sheet` | `open`, `onClose`, `title`, `side?: "end" \| "bottom"`, `width?`, `children`, `footer?` | Drawer (glass scrim). |
| `Dialog` | `open`, `onClose`, `title`, `children`, `footer?` | |
| `ToastProvider` / `useToast()` | `toast({ title, body?, tone?, action?: { label; onClick } })` | Undo toasts (P3). |
| `Divider` | `vertical?` | |

## D. Charts — `src/ds/charts.tsx` (inline SVG, tokens only, no chart lib)

| Component | Props | Notes |
|---|---|---|
| `TrajectoryChart` | `points: IWeekPoint[]`, `height?`, `metric?: "sessions" \| "impressions"` | Actual = ink line + area; projection = dashed ink-3; gaps rendered as broken line + "no data" marker (never zero). |
| `Sparkline` | `values: (number \| null)[]`, `tone?`, `invert?` (position: lower is better) | |
| `ShareBar` | `rows: { id; label; value: number; tone?: TTone; note?: string }[]`, `max?` | Pillar distribution (claimed-but-unearned = human tone + note). |
| `StatusLight` | `light: "green" \| "amber" \| "red"`, `label`, `value`, `detail?` | Plan status traffic lights, each with its number. |
| `ConcentrationGauge` | `value` (0–100), `threshold?: number` (60) | Top-5 share, "fragile" above threshold. |
| `CalendarWeekGrid` | `weeks: { week: number; label: string; target: number; items: { id; title; tone: TTone; href? }[] }[]` | Cadence vs target per week (Plan · Calendar). |
| `PillarMatrix` | `pillars: IPillar[]`, `cells: { pillarId; state: TPostState; count }[]` | Posts per pillar × state vs planned coverage; thin pillars flagged. |

## E. Domain — `src/ds/domain.tsx` (CMS-specific)

| Component | Props | Notes / ref |
|---|---|---|
| `StateChip` | `state: TPostState`, `count?` | Exact labels from IA; tone from owner rule. |
| `AgentBadge` | `label?` (default "Agent"), `running?`, `model?: string` | Blue sparkle/robot + label. The Agent-blue rule's carrier. |
| `HumanBadge` | `label` ("Human-only · waiting on you") | Amber hand icon. |
| `PostCard` | `post: IPost`, `keyword?: IKeyword`, `pillar?: IPillar`, `href`, `blocks?: string[]`, `slots?: IImageSlot[]`, `selected?`, `draggable?`, `onDragStart?` | Ref 01 cards: chips (pillar, source/"Pillar"/block), title (General Sans 15), meta row (intent · KD · type), progress bar when drafting, mini slot tiles when needs-assets, blocker lines when in-review, ↗ button. |
| `PipelineColumn` | `state: TPostState`, `count`, `owner: TOwner \| "mixed"`, `children`, `onDrop?(postId)` | Column header "Idea 12 · Agent". |
| `GateChecklist` | `checks: IGateCheck[]`, `onFix?(id)`, `onOverride?(id)` | Ref 02 "On-page gate 10/12": pass = green check, fail = red x + "Hard block · section 2" + Fix, warn = amber + "soft". |
| `FactMarkerCard` | `marker: IFactMarker`, `onAddSource(id, url)`, `onRewrite(id)` | Ref 02 "Unsourced statistic · Can't override" red-soft card. |
| `FactHighlight` | `children`, `status: "open" \| "resolved"` | Inline mark in the draft. |
| `AgentDiff` | `suggestion: IAgentSuggestion`, `onAccept`, `onReject` | Ref 02: blue header "Agent edit · "tighten…"", strike-through before (red-soft), after (green-soft), Reject / Accept. |
| `VersionList` | `versions: IVersion[]`, `currentId`, `onRestore?(id)`, `onDiff?(id)` | Ref 02 Versions list with origin tags. |
| `OriginTag` | `origin: TVersionOrigin` | agent-* = agent tone, human-edit = neutral, refresh = info. |
| `TemplatePreview` | `site: ISite`, `post: IPost`, `device: "desktop" \| "mobile"`, `manifestVersion` | Ref 02 right pane: faux site chrome (Services · Blog · Book), eyebrow, title, image container label `figure.post-media · hero 1600×900`, green "Renders with site classes · no invented markup". |
| `SlotRow` | `slot: IImageSlot`, `selected?`, `onSelect` | Ref 03 left list: status icon (check / spinner / chart / images / user-focus) + name + "Provider · route · state". |
| `CandidateGrid` | `candidates: ICandidate[]`, `onPick(id)` | 2×2 tiles, selected = ink check badge. Placeholder art via tone gradient (no stock images). |
| `ProviderBadge` | `provider: TProvider`, `model?` | "Flux via MCP", "OpenAI · API", "Inline SVG · no model". |
| `PromptEditor` | `prompt`, `styleKeywords: string[]`, `onChange`, `onRegenerate`, `estimateUsd`, `onUpload`, `onHumanOnly` | Ref 03 prompt card + 3 actions + "Est. $0.12 per regenerate". |
| `ProvenanceCard` | `slot: IImageSlot` | Fingerprint icon, provider/model/generated/licensing. |
| `ManifestMappingRow` | `mapping: ITemplateMapping`, `onMap?(id, role)` | Ref 04: selector (mono) + detail + status icon; unclassified gets `Select` "Choose type". |
| `SourceCodeFrame` | `html: string`, `highlights?: { selector; label; tone: TTone }[]`, `mode: "rendered" \| "source"` | Ref 04 sample post with dashed labelled regions. |
| `OutputFormatPicker` | `value: ITemplateManifest["output"]`, `onChange` | MDX + frontmatter / HTML / JSON / Component. |
| `ApprovalQueueItem` | `post: IPost`, `selected?`, `onSelect`, `blocks: number`, `day: number` | Ref 05 left list "Day 1 · title · 2 hard blocks". |
| `ReadinessGrid` | `items: { id; icon; label; value; tone: TTone }[]` | Ref 05 2×2: Fact markers 0 unresolved · Image slots 4/4 · On-page 1–5 · Template. |
| `OverrideReason` | `check: IGateCheck`, `value`, `onChange` | Ref 05 amber "Soft block · override with a reason" + textarea + "Logged to the audit trail and listed in the MR". |
| `AssertionList` | `values: [boolean, boolean, boolean]`, `onChange(i, v)` | "I confirm: the facts are right / the voice is right / the brand stands behind it". |
| `MRPreview` | `mr: IMergeRequest`, `post: IPost`, `keyword: IKeyword`, `repo: IRepoConnection` | Ref 05 right pane: host, branch → base, file rows (+212), description KeyValue, scope shield note. |
| `CIStatus` | `ci: IMergeRequest["ci"]`, `status: IMergeRequest["status"]` | |
| `KasRow` / `KasTable` | `keywords: IKeyword[]`, `onSelect?(id)` | Ref 06 table: keyword (+orphan chip), share, Δ (pass/block tone), ranking page (mono), position with ↑/↓ and "decaying". |
| `LedgerItem` | `item: ILedgerItem` | Age chip: < 7 neutral, 7–13 "Overdue" human, ≥ 14 "Blocker" block + downstream cost. |
| `RunRow` | `run: IRun` | Kind icon, agent, trigger chip, model tier, tokens, cost vs estimate, status. |
| `ScheduleRow` | `schedule: ISchedule`, `onRunNow(kind)`, `onToggle(kind, v)`, `estimateUsd` | "Run now" shows estimate first (spend guardrail). |
| `BudgetCard` | `label`, `spent`, `cap`, `onEdit?` | Meter + 80% alert + "refuses above cap". |
| `RoleGate` | `role: TRole`, `allow: TRole[]`, `children`, `fallback?: ReactNode` | Renders `fallback` (default: disabled + "Your role can't …") instead of hiding. |
| `CommentThread` | `comments: IPost["comments"]`, `onAdd?(text)`, `readOnly?` | Stakeholder comments on drafts. |
| `ScopeNote` | `repo: IRepoConnection` | Shield: "Writes only to content/blog and public/images/blog. Never pushes to main." |
