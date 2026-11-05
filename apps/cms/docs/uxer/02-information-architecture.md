# 02 — Information architecture

## Nav model

**Hub with a persistent icon rail** (desktop) / **bottom tab bar + "More" sheet** (mobile ≤ 767px). One
workspace per client site; the site is chosen in the `SiteSwitcher` pill (top bar) and scopes every route.

Rail order is the post lifecycle, left-to-right in the PRD's loop: plan → draft → images → template → approve → measure.

| Rail slot | Icon (Phosphor) | Route | Label | Badge |
|---|---|---|---|---|
| Mark | `asterisk-simple` | `/plan` | Agentic CMS | — |
| 1 | `kanban` | `/plan` | Content plan | — |
| 2 | `note-pencil` | `/posts` → last opened post | Editor | — |
| 3 | `images-square` | `/assets` | Image pipeline | amber dot if human-only slots |
| 4 | `brackets-angle` | `/templates` | Templates | — |
| 5 | `seal-check` | `/approvals` | Approvals | red dot if waiting |
| 6 | `chart-line-up` | `/seo` | SEO trajectory | — |
| bottom | `clock-counter-clockwise` | `/runs` | Runs & ledger | amber dot if overdue |
| bottom | `gear-six` | `/settings` | Settings | — |
| bottom | avatar initials | menu | Account, role switcher (demo), sign out | — |

Mobile tab bar: Plan · Editor · Approvals · SEO · More (Images, Templates, Runs, Settings).

## Top bar (every app route)

`SiteSwitcher` · `CommandSearch` (⌘K → `CommandPalette`) · spacer · `AgentStatusPill` ("2 agents running") ·
`IconButton` bell (`/notifications` sheet) · `IconButton` calendar (→ `/plan?view=calendar`) · one primary CTA
whose label is per-route (e.g. **New idea** on /plan, **Approve** on editor, **Run now** on /runs).

## Route map

| Route | Screen | Ref | Primary role | PRD |
|---|---|---|---|---|
| `/` | redirect → `/plan` | — | — | — |
| `/onboarding` | Connect a site: site → repo → paths/branch → Search Console → template (hand-off) | — | Developer/Admin | M5 setup, Integrations |
| `/plan` | Content plan: Board (default) · Calendar · Pillar matrix (`?view=`) | 01 | Specialist | M1, Goal 4 |
| `/plan/new` | New idea sheet (topic or keyword) — rendered as `Sheet` over /plan | — | Specialist | M1 manual entry |
| `/posts` | Post list (all states, search, filter by state/pillar) | — | Specialist | M1 |
| `/posts/[id]` | Split editor: content · live template preview · agent composer · gate/facts/versions rail | 02 | Specialist | M2 |
| `/posts/[id]/versions` | Version history + diff vs live (`Sheet`) | — | Specialist | M2 revisions |
| `/posts/[id]/assets` | Image pipeline for one post: slots · candidates · prompt · spec · provenance | 03 | Specialist | M3 |
| `/assets` | Cross-post slot queue (human-only tasks first) | — | Specialist | M3 review |
| `/templates` | Manifests list (versions, output format) | — | Developer | M4 |
| `/templates/ingest` | Upload → Parse → Confirm → Versioned wizard | 04 | Developer | M4 |
| `/approvals` | Approval queue + selected post gate + MR preview | 05 | Specialist | Gate, M5 |
| `/merge-requests` | Open/merged MRs with CI status, conflicts, post timeline | — | Developer/Specialist | M5 |
| `/seo` | Trajectory · plan status · KAS table · pillar distribution · content performance | 06 | Specialist/Stakeholder | M6, M7 |
| `/seo/reports` | Stored bi-weekly report editions + reader | — | Stakeholder | M6 reports |
| `/runs` | Schedules with Run now · run log (model, tokens, cost) · human ledger | — | Specialist/Admin | Triggers, ledger, cost |
| `/settings` | Tabs: Site & repo · Providers & budgets · Model routing · Members & roles · Brand pack · Audit log | — | Admin/Developer | Settings, guardrails |
| `/styleguide` | DS verification harness (dev only) | — | Builders | DS §14 |

## Entry points / deep links

| Entry | Lands on | Notes |
|---|---|---|
| Slack/email "Approval requested" | `/approvals?post=<id>` | Post preselected |
| Slack "Blocker: human-only slot" | `/posts/<id>/assets?slot=<slotId>` | Slot preselected |
| MR description "Edit in CMS" | `/posts/<id>` | |
| Git webhook merged | (no UI) → post becomes Live, toast on next visit | |
| Bi-weekly report link | `/seo/reports?edition=<n>` | Stakeholder read-only |
| Pivot trigger alert | `/plan` with `Callout` at top | Links to `/seo` |

## Object model shown in UI (mirrors PRD data model)

Site → { TemplateManifest(versions), Pillar, Keyword(PositionHistory, KASSnapshot), Post, Run, LedgerItem }
Post → { Draft versions (origin: agent-generation · agent-edit · human-edit · refresh), ImageSlot(candidates,
provenance), GateCheck[], FactMarker[], MergeRequest(CI, files), KASSnapshot }

## Post state machine (labels are exact UI copy)

`Idea` → `Briefed` → `Drafting` → `Needs assets` → `In review` → `MR open` → `Live` → `Decaying` (→ refresh → `Drafting`)

Owner tone per state: Idea/Briefed/Drafting/Decaying = **agent** (blue), Needs assets = **human** (amber, when a
human-only slot exists; else agent), In review = **human**, MR open = **developer** (neutral ink), Live = **pass** (green).
