# 03 — Critical flows with click budgets

**Counting rule.** A click = one discrete activation of an in-app control (pointer, Enter or Space). Opening the
entry (rail item, deep link, notification) = click 0. Text entry = an **input**, counted separately (focusing the
field is part of the input). Auto-advance (parse finishing, agent returning a diff, webhook) = 0. A drag-and-drop = 1.
Steps on an external host (GitHub app install, Google OAuth) are listed but not counted. Budgets come from `01`
where one exists; the rest are **derived** here and bind `04` + e2e tests.

Fixture clock: **Fri 25 Sep 2026, 10:42 WAT (W39)**. Tenant **Lumen Dental** (`lumendental.co`, Lagos),
repo `lumen/lumendental.co` on GitHub, base `main`, content `content/blog`, assets `public/images/blog`, branch
pattern `content/{slug}`, manifest **v2**. People: **Tolu B.** (specialist, TB), **Kunle O.** (developer, KO),
**Ife A.** (agency admin, IA), **Dr Ada Okafor** (client stakeholder, AO). Budgets: text **$96.00 / $150**, image
**$142 / $200**.

## Budget summary

| Flow | Budget | Happy path | Meets | Source |
|---|---|---|---|---|
| F1a Plan → open the most-stuck post | ≤ 1 | 1 | ✅ | 01 |
| F1b Unblock both hard blocks on "root canal recovery" | ≤ 6 + 1 input | 5 + 1 input | ✅ | derived |
| F1c Plan → SEO headline number | 0 / ≤ 1 | 0 (rail) / 1 (full view) | ✅ | 01 |
| F2 Idea → brief → draft (manual entry, Generate now) | ≤ 5 + 1 input | 5 + 1 input | ✅ | derived |
| F3a Accept an agent edit (after the diff lands) | ≤ 1 | 1 | ✅ | 01 |
| F3b Instruct the agent → accept | ≤ 2 + 1 input | 2 + 1 input (1 + 1 via suggestion chip, 0 inputs) | ✅ | derived |
| F3c Resolve a fact marker (add source / rewrite) | ≤ 2 + 1 input / ≤ 2 | 2 + 1 input / 2 | ✅ | derived |
| F4a Fill a slot from candidates | ≤ 2 | 2 | ✅ | 01 |
| F4b Regenerate with an edited prompt → use | ≤ 3 + 1 input | 3 + 1 input | ✅ | derived |
| F4c Upload own | ≤ 3 + OS picker | 3 | ✅ | derived |
| F4d Mark human-only | ≤ 2 | 2 | ✅ | derived |
| F5 Approve with soft override → MR opens | ≤ 4 + 1 input (clean: 4) | 4 + 1 input | ✅ | 01 |
| F6a CI failing → fix → re-approve → MR updated | ≤ 7 | 7 | ✅ | derived |
| F6b Conflict: auto rebase / unresolvable hand-off | 0 specialist / ≤ 1 developer | 0 / 1 | ✅ | derived |
| F6c Merged → Live → first KAS snapshot at +24 h | 0 | 0 | ✅ | PRD M5 |
| F7a Developer onboarding (site, repo app, 4 paths, Search Console) | ≤ 7 + 2 inputs | 7 + 2 inputs | ✅ | derived (P7) |
| F7b Template ingestion with confirmation (2 unclassified) | ≤ 6 (1 upload + 2 per item + 1 confirm) | 6 | ✅ | derived (P7) |
| F8 Prove a post did something (KAS snapshot after a merge) | ≤ 3 | 3 | ✅ | derived (J5) |
| F9a Run now (within cap) | ≤ 2 | 2 | ✅ | derived |
| F9b Run now refused over cap (message reached) | ≤ 1 | 1 | ✅ | PRD cost controls |
| F10 Stakeholder comments on a draft | ≤ 1 + 1 input | 1 + 1 input | ✅ | derived |
| F11a Ledger aging (To-do → Overdue → Blocker) | 0 (automatic) | 0 | ✅ | PRD ledger |
| F11b Clear a named blocker from /plan | ≤ 4 + OS picker | 4 | ✅ | derived |
| F12 Reschedule by dragging a card to another week | 1 drag (keyboard ≤ 4 keys) | 1 | ✅ | PRD M1 |

No flow is over budget after pass 1; no escalation needed.

---

## Journey context (why these flows, where it hurts)

Emotion 1–5 (5 = confident). Grounded in PRD problem statement; inferences marked [H].

| Stage (specialist, Tolu B.) | Action | Thought | Emotion | Pain | Opportunity → flow |
|---|---|---|---|---|---|
| Monday open | Lands on `/plan` | "What's stuck?" | 3 → | Stuck items buried among busy ones | Human tone outranks agent tone; "Needs you" first on mobile → F1 |
| Unblock | Opens stuck post | "Why can't I approve?" | 2 ↓ | Blocks without reasons | `LockedAction` reasons + "Fix" jumps → F1b, F3 |
| Edit | Instructs agent | "Did it change my voice?" | 3 ↑ | Silent overwrites (today) | Every change is an `AgentDiff` → F3 |
| Images | Picks candidates | "Nobody made the photo" | **1 ↓ (dip)** | Human-only slot stalls post (PRD: biggest blocker) | 2-click fill, ledger aging names the cost → F4, F11 |
| Approve | Three assertions | "Will the MR need fixes?" | 3 ↑ | Unclear what developer sees | MR preview beside the gate → F5 |
| Wait for merge | Watches timeline | "Is CI red?" | 2 ↓ | Must open repo to see failures | CI in post timeline → F6 |
| Prove it | Client call | "Is it working?" | 4 ↑ | Raw traffic in month 3 means nothing | Gap-to-projection + KAS snapshot → F8 |

| Stage (developer, Kunle O.) | Emotion | Pain | Opportunity → flow |
|---|---|---|---|
| Connect repo | 2 → | Fear the CMS touches app code | `ScopeNote` on every write surface; 4 declared paths only → F7a |
| Ingest template | 3 ↑ | Unclassified markup | Side-by-side confirm, map once, versioned → F7b |
| Review MRs | 4 ↑ | Conflicts forced through | Rebase + re-render, never auto-merge → F6 |

**Moments that matter** (tie to PRD metric "idea → MR < 90 min human time", "≥ 4 posts/week"):
1. **Human-only slot** (dip 1) — the ledger must age it visibly and the fix must be ≤ 4 clicks from `/plan` (F11b).
2. **Locked approval** — every lock names its reason and links to the fix; hard vs soft visually distinct (F1b, F5).
3. **"Is it working?"** — headline is the gap to projection with its source note, 0 clicks from `/plan` (F1c, F8).

---

## F1 — Monday triage: plan → unblock (J1)

Entry: rail **Content plan** or app open → `/plan` (click 0). Tolu B., desktop 1440.

| # | Screen | Action | Clicks / inputs |
|---|---|---|---|
| 1 | S02 `/plan` Board | First viewport shows `StatStrip` (Needs assets 2 and In review 2 in human tone), In review column card **"root canal recovery: what to expect"** with chip "2 hard blocks" and lines "1 unresolved fact marker" · "Keyword missing in first 100 words"; rail ledger "Clinic photo for veneers post · Day 15 · Blocker" | 0 |
| 2 | S02 | Card ↗ | **1** (F1a done) |
| 3 | S05 `/posts/root-canal-recovery` | Opens scrolled to the first hard block (fact marker, highlighted "Around 95% of treated teeth last a lifetime"). Header `LockedAction` "Approve · 2 hard blocks" | — |
| 4 | S05 | `FactMarkerCard` **Add source** | 2 |
| 5 | S05 | Paste URL `https://www.aae.org/patients/root-canal-treatment/` (input 1) → **Add** | 3 |
| 6 | S05 | Marker resolves (FactHighlight → resolved), "Fact markers 0 open"; gate row "Keyword in first 100 words · Hard block · section 2" → **Fix** | 4 |
| 7 | S05 | Agent returns `AgentDiff` "Agent edit · "put keyword in intro"" → **Accept** | 5 |
| 8 | S05 | Gate 11/12 (internal links soft), `LockedAction` unlocks to **Approve** → continue in F5 | — |

**5 clicks + 1 input.** F1c: `/plan` rail `StatTile` "Gap to projection −6.2%" is visible at 0 clicks; its ↗ opens `/seo` (1).

Mobile 390: `/plan` opens with `StatStrip` item **Needs you 4** active (filter), list shows the same two cards
first; card tap = 1. Editor opens on the Draft segment with `Callout` "2 hard blocks before approval" → **Review**
scrolls to the first.

Edge / branches:
- E1 Nothing stuck → `StatStrip` "Needs you 0" neutral; PageHeader subtitle "Week 39 · 3 of 4 posts on cadence · nothing needs you". Rail ledger `EmptyState` "No human items open".
- E2 Stuck item is a **ledger blocker** (not a card) → `LedgerItem` click deep-links to its slot (F11b).
- E3 Pivot trigger fired by the latest report → `Callout` above the board "Pivot trigger · Concentration above 60% in two reports" → **See SEO** (1).
- E4 Source URL unreachable → `TextField` error "We couldn't open that link. Check it or paste another." Marker stays open.
- E5 Source reachable but doesn't support the claim → marker stays open; note "The page doesn't mention 95%. Add another source or rewrite." (never auto-resolved).
- E6 Two people triaging → second opener sees `Callout` info "Tolu B. is editing" [H]; edits still diffed.
- E7 Plan fails to load → `Callout` block "Couldn't load the plan." + **Try again**; rail regions load independently.

## F2 — Idea → brief → draft (manual entry + Generate now) (M1, M2)

Entry: `/plan` (0).

| # | Screen | Action | Clicks / inputs |
|---|---|---|---|
| 1 | S02 | TopBar **New idea** | 1 |
| 2 | S03 `/plan/new` Sheet | `TextField` "Topic or keyword" → type `dental crown cost lagos` (input 1). Agent enriches in place (≤ 2 s, `AgentBadge running`): intent **Commercial**, "KD 22 · Ahrefs", pillar **General** (`Select`, editable), type **Comparison**, week **W41** (next open slot) | 0 |
| 3 | S03 | **Add to plan** | 2 |
| 4 | S02 | Toast "Added to Idea · W41 · Undo"; card appears top of Idea with chip "Manual" → card ↗ | 3 |
| 5 | S05 (state Idea) | Draft region `EmptyState` "No brief yet" → **Promote to brief** | 4 |
| 6 | S05 (Briefed) | Brief `KeyValue` (keyword, intent, pillar, angle, 7 sections, 3 image slots, template slots from manifest v2) + `Button` primary **Generate now** with caption "Est. $0.84 · workhorse model · $54.00 left of text cap" | 5 |
| 7 | S05 (Drafting) | `ProgressBar` agent "Writing section 1 of 7"; `AgentStatusPill` "3 agents running"; draft streams read-only; on completion state → Needs assets (slots) or In review (no slots) with Toast "Draft ready · 1,580 words · 3 image slots" | — |

**5 clicks + 1 input.** Scheduled path: no step 6 — generation runs in the post's publish slot (W41), identical output.

Edge / branches:
- E1 **Duplicate** (dedupe vs live + planned) → Sheet `Callout` info "Already planned: "invisalign cost in lagos (2026 prices)" · Needs assets" + **Open it**; Add disabled with reason via `LockedAction`.
- E2 **Pillar / money page** → chip "Strong model" on card, estimate uses strongest tier ("Est. $1.90 · strongest model").
- E3 **Over text cap** → Generate now becomes `LockedAction` "Generate now · over cap" (F9b copy).
- E4 **Generation fails** → run retries durably; `Callout` block "Draft generation failed at section 5 of 7. Retrying (2 of 3)." After 3 → "Generation stopped. Nothing was charged beyond $0.52." + **Try again**.
- E5 **Template can't satisfy a structure** (comparison needs a table; manifest v2 has none) → post held: `Callout` block "This post needs a table. The Lumen template doesn't have one. Ask Kunle O. to extend the template." (hard block, notifies developer).
- E6 **Regulated (health)** → disclaimer block inserted automatically at the end; cannot be removed without override (F3 E5).
- E7 Keyword not in Search Console yet → difficulty from Ahrefs; impressions render `DataGap` "No impressions yet".
- E8 Stakeholder → **New idea** is `RoleGate` fallback "Your role can view the plan. Tolu B. adds ideas."
- E9 Promote by dragging the card from Idea to Briefed on the board = same as step 5 (1 drag).

## F3 — Edit with agent diffs + resolve a fact marker (M2)

Entry: `/posts/root-canal-recovery` (0).

**F3b instruct → accept**

| # | Action | Clicks / inputs |
|---|---|---|
| 1 | Select paragraph under "The first 24 hours" (sets `Composer` scope "This section") → type `tighten this section` (input 1) → send | 1 |
| 2 | `AgentDiff` "Agent edit · "tighten this section"": before (strikethrough) "Once the anaesthetic starts to wear off, which for most people is somewhere between two and four hours after you leave, you may" → after "As the anaesthetic wears off, two to four hours later, you may" → **Accept** | 2 |
| 3 | Version v5 · Agent edit created; `VersionList` updates; Toast "Accepted · v5 · Undo" | — |

Suggestion chip path: **Add an FAQ** (1) → diff → **Accept** (2), 0 inputs. F3a = the Accept alone (1).

**F3c fact marker**: **Add source** (1) → URL (input) → **Add** (2). Or **Rewrite without it** (1) → `AgentDiff` "…, and most treated teeth last for many years, but…" → **Accept** (2). Either path closes the marker, logs "resolved by Tolu B. · source" to audit.

Edge / branches:
- E1 **Reject** → no version; Toast "Rejected · Undo". Suggestion list keeps it collapsed as "Rejected".
- E2 **Stale diff** — human edited the block while the diff was pending → `AgentDiff` shows `Callout` "This paragraph changed since the suggestion." + **Regenerate** (Accept disabled).
- E3 Agent can't comply (would need an unsourced number) → diff comes back with a new `FactHighlight` open marker, never confident text.
- E4 Several pending diffs → rendered inline at their blocks in document order; `Kbd` hint "A accept · R reject" when focused.
- E5 **Remove the medical disclaimer** → `Dialog` with `OverrideReason` "Regulated topic · removing the disclaimer needs a reason" → reason logged, appears in MR overrides.
- E6 Manual edit → auto-saves as v(n) · Human edit after 5 s idle; Toast "Saved · v5". Save failure → Toast block "Couldn't save. Your text is kept here." + **Retry**.
- E7 Restore a version → `/posts/[id]/versions` Sheet → **Restore v3** → creates v6 · Human edit ("restored from v3"), never rewrites history.
- E8 Roles: stakeholder/developer see draft read-only; Composer replaced by `RoleGate` fallback (F10).

## F4 — Fill image slots (M3)

Entry: rail **Image pipeline** → `/assets` → post, or card ↗ on a Needs assets card → `/posts/invisalign-cost-lagos-2026/assets` (0). Slots: Hero (Higgsfield · MCP · selected), Treatment timeline diagram (OpenAI · API · generating), Price comparison chart (Inline SVG · no model), **Lifestyle · inline 2 (Flux · 4 candidates)**, Clinic reception photo (Human-only · waiting on you). Header before F4a: "3 / 5 filled" (Hero, diagram, chart), `BudgetCard` "Image budget $142 / $200".

| Path | Steps | Clicks |
|---|---|---|
| F4a pick | Slot Lifestyle · inline 2 selected by default (first unfilled) → **candidate 3** (1) → **Use candidate 3** (2). Caption "Compressed, resized and committed with the post". Slot → selected; header count moves to "4 / 5 filled" (ref state). Send to review stays locked by the human-only Clinic reception photo | 2 |
| F4b regenerate | `PromptEditor` edit prompt (input) e.g. add "evening light" → **Regenerate** (1, caption "Est. $0.12 per regenerate") → 4 new candidates stream in (`AgentBadge running`) → pick (2) → **Use candidate n** (3) | 3 + 1 input |
| F4c upload own | **Upload own** (1) → `Sheet` with `FileDrop` "Drop a JPG, PNG or WebP · min 1200 × 800" → choose file (2, OS picker) → alt text prefilled from the production sheet → **Use upload** (3). `ProvenanceCard` "Provider Human upload · Tolu B. · 25 Sep 2026, 10:51" | 3 |
| F4d human-only | **Mark human-only** (1) → `Dialog` "Send to your task queue? The post stays in Needs assets until someone uploads." → **Mark human-only** (2). `HumanBadge` "Human-only · waiting on you"; `LedgerItem` created (day 0, To-do) | 2 |
| Send to review | When all slots filled, header `LockedAction` "Send to review · 4 / 5 filled" unlocks → **Send to review** (1) → state In review | 1 |

Edge / branches:
- E1 **Chart slot** → no candidates; `ProviderBadge` "Inline SVG · no model", preview from post data, caption "Charts are never generated". Only action: **Edit data** (opens the post block).
- E2 **Budget ≥ 80%** → `Meter` warn, caption "Est. $0.12 · $58.00 left this month"; **over cap** → Regenerate `LockedAction` "Over image cap · $200" + "Ask Ife A. to raise it" (admin sees **Raise cap** → `/settings?tab=providers`).
- E3 **Provider fails** → slot status failed "Flux via MCP didn't respond. Retried 3 times." + **Try again**, **Upload own**. No silent provider switch (routing is by slot type + admin pin).
- E4 **Guardrail refusal** → prompt names a real person or "in the style of <living artist>" → `Callout` block "We don't generate identifiable real people or imitate living artists. Edit the prompt or upload a licensed photo."
- E5 **Admin forced human-only** (brand governance) → Regenerate/Pick hidden behind `LockedAction` "This client is set to human-only images"; every slot shows `HumanBadge`.
- E6 Upload too small / wrong type → `FileDrop` error "This image is 900 × 600. The slot needs at least 1200 × 800."
- E7 Alt text empty → Use disabled with reason "Add alt text — it travels with the asset".
- E8 Generating > 60 s → `ProgressBar` indeterminate + "Higgsfield is returning 4 candidates · usually under a minute"; user can leave; Toast on return.
- E9 Stakeholder → read-only candidates, no actions (`RoleGate`).

## F5 — Approve with soft override → MR opens (Gate, M5)

Entry: notification "Approval requested · implant vs bridge: cost and lifespan" → `/approvals?post=implant-vs-bridge` (0). Queue: Ready · Day 1 "implant vs bridge: cost and lifespan"; 2 hard blocks · Day 2 "root canal recovery: what to expect"; Refresh cycle · Day 4 "best toothpaste for sensitive teeth".

| # | Screen | Action | Clicks / inputs |
|---|---|---|---|
| 1 | S11 | Selected post: "Implant vs Bridge: Cost, Lifespan and Which to Choose" · implant vs bridge cost · Commercial · 1,620 words · v3 · agent edit. `ReadinessGrid`: Fact markers 0 unresolved · Image slots 4 of 4 filled · On-page 1–5 All passing · Template Renders cleanly | 0 |
| 2 | S11 | `OverrideReason` "Soft block · override with a reason — Fewer than two internal links · 1 of 2" → type "Only one relevant page is live. The implants guide ships next week and the refresh cycle will add the link." (input 1). Caption "Logged to the audit trail and listed in the MR" | 0 |
| 3 | S11 | `AssertionList` "I confirm": **The facts are right** (1) · **The voice is right** (2) · **The brand stands behind it** (3). Caption counts "2 of 3 confirmed" live | 3 |
| 4 | S11 | **Approve and open MR** | 4 |
| 5 | S11 | Button loading "Opening merge request…" → Toast pass "MR !16 opened on GitHub · content/implant-vs-bridge-cost → main" + **View MR**; post → MR open; queue advances to next item | — |

**4 clicks + 1 input** (clean post: 4, 0 inputs). `MRPreview` visible throughout: files `content/blog/implant-vs-bridge-cost.mdx +212` · `public/images/blog/ · 4 WebP · 312 KB` · `public/sitemap.xml +1`; description Keyword · Intent · On-page "11 / 12 · 1 override" · Internal links "1 added" · Schema "Article, FAQPage"; `ScopeNote`.

Edge / branches:
- E1 **Hard blocks** → `LockedAction` "Approve and open MR · 2 hard blocks"; tooltip lists reasons; clicking a red `ReadinessGrid` tile opens the editor at the block. No override path for fact markers, unfilled slots, on-page sections 1–5, template.
- E2 Override reason empty or < 20 chars → Approve locked, reason "Add a reason for the soft override".
- E3 **Send back** (secondary) → `Dialog` `TextArea` "What should change?" → post returns to Drafting with the note as an agent instruction; audit "sent back by Tolu B.".
- E4 **MR open fails** (app lost access / branch exists) → approval is recorded; post stays In review with `Callout` block "GitHub app can't write to lumen/lumendental.co. Ask Kunle O. to reinstall it." + **Retry opening MR** (no re-approval needed within 24 h [ASSUMED]).
- E5 Content changed after assertions ticked (agent diff accepted elsewhere) → assertions reset, Toast "The draft changed. Confirm again."
- E6 Role: developer / stakeholder → `RoleGate` fallback "Your role can't approve content. Tolu B. or an admin can." Admin can approve but sees the same gate — no bypass.
- E7 Refresh-cycle item → chip "Refresh cycle"; MR preview shows diff vs live file (`+38 −21`).
- E8 Mobile: "Approval 1 of 3" header, `ReadinessGrid` collapses to "All 4 hard checks pass", override shown as quoted reason, sticky **Approve and open MR** — same 4 clicks.

## F6 — MR lifecycle (M5)

States: MR open (CI pending → passing/failing) → conflict? → merged → Live → KAS at +24 h. All events append to the post `Timeline` and `/merge-requests`.

**F6a CI failing** (MR !15 "teeth whitening at home vs in clinic").

| # | Screen | Action | Clicks |
|---|---|---|---|
| 1 | Notification "CI failing on !15 · check-links" → S05 timeline anchor | `Callout` block "CI failing · check-links: 1 broken link /blog/whitening-costs (404)". Suggested fix chip **Fix link** (agent) | 1 |
| 2 | S05 | `AgentDiff` link → `/blog/whitening-cost` → **Accept** | 2 |
| 3 | S05 | Header `Button` primary **Re-approve and update MR** (changes after approval need a new approval) → S11 with post selected | 3 |
| 4 | S11 | Three assertions | 4, 5, 6 |
| 5 | S11 | **Approve and update MR** → commit pushed to `content/teeth-whitening-home-vs-clinic` (never to main); CI re-runs | 7 |

**F6b conflict.** Base `main` moved (sitemap edited). CMS rebases and re-renders from manifest v2 automatically →
timeline "Rebased on main · re-rendered with manifest v2 · 25 Sep 2026, 11:03" (0 clicks). If it can't apply:
MR status conflict → developer notification; `/merge-requests` row "Conflict · public/sitemap.xml" → detail shows
both versions in two `SourceCodeFrame mode="source"` panes ("main" / "content/implant-vs-bridge-cost") + primary
**Resolve on GitHub** (1, developer). Specialist sees `Callout` human "Waiting on Kunle O. · conflict in
public/sitemap.xml". Never auto-merged.

**F6c merged.** Webhook → post **Live**, records merge commit `a41f9c2` + timestamp, Toast on next visit "implant vs
bridge is live · first score 26 Sep, 11:20", indexing request submitted ("Submitted for indexing · Search Console").
KAS recalculation scheduled +24 h → run row "KAS recalculation · scheduled · 26 Sep 2026, 11:20".

Edge / branches:
- E1 CI **none** → `CIStatus` "No checks configured" (neutral), not a warning.
- E2 CI pending > 30 min → "Waiting on the repo's checks · 34 min".
- E3 MR **closed** without merge → post back to In review; timeline "Closed by Kunle O. · 'wrong base'"; audit.
- E4 Indexing not allowed (Search Console role is restricted) → `DataGap` "Indexing not requested · Search Console user lacks owner access".
- E5 Merge while CMS webhook down → reconciled on next poll (≤ 10 min [ASSUMED]); timeline notes "Detected merge by poll".
- E6 Manifest changed between approval and rebase (v2 → v3) → re-render uses v3; timeline states the version; if v3 lacks a used structure → hard block back to In review (fidelity rule).

## F7 — Developer onboarding + template ingestion (P7)

**F7a** Entry: Ife A. adds site → invite email to Kunle O. → `/onboarding` (0). `Stepper`: Site › Repo › Paths › Search Console › Template.

| # | Step | Action | Clicks / inputs |
|---|---|---|---|
| 1 | Site | Name "Lumen Dental" (input 1), domain "lumendental.co" (input 2) → **Continue** | 1 |
| 2 | Repo | **Install GitHub app** → GitHub (external: choose "Only select repositories" → lumen/lumendental.co) → returns | 2 |
| 3 | Repo | `Select` repo prefilled "lumen/lumendental.co" (only installed repo) → **Continue** | 3 |
| 4 | Paths | Four declared fields prefilled from repo scan: Content directory `content/blog` ("41 .mdx files found"), Asset directory `public/images/blog`, Branch naming `content/{slug}`, Base branch `main` (protected ✓). `ScopeNote` preview → **Confirm paths** | 4 |
| 5 | Search Console | **Connect Search Console** → Google OAuth (external) → property auto-matched `sc-domain:lumendental.co` | 5 |
| 6 | Search Console | `SourceNote` "Positions and impressions · lags 2–3 days" → **Continue** | 6 |
| 7 | Template | **Ingest template** → `/templates/ingest` | 7 |

**F7b** `/templates/ingest` (`Stepper` Upload › Parse › Confirm › Versioned).

| # | Action | Clicks |
|---|---|---|
| 1 | `FileDrop` "Drop the blog template · HTML file or ZIP" → choose `lumen-site.zip` (OS picker) | 1 |
| 2 | Parse (auto, ~10 s): "lumen-site.zip · 38 files" → Confirm: "24 mapped · 2 need you"; sample post `blog/sample-post.html` rendered beside the manifest | 0 |
| 3 | `ManifestMappingRow` div.cta-inline · unclassified → `Select` "Choose type" → **CTA block** | 2, 3 |
| 4 | aside.author-card → `Select` (suggested "Author bio?") → **Author bio** | 4, 5 |
| 5 | `OutputFormatPicker` preselected **MDX + frontmatter** (detected from content/blog/*.mdx) | 0 |
| 6 | **Confirm manifest v1** (LockedAction "· map 2 items" until mapped) → Versioned: "Manifest v1 · confirmed by Kunle O. · 25 Sep 2026" | 6 |

Edge / branches:
- E1 App installed with **All repositories** → CMS still scopes writes; `Callout` info "The app can see every repo. The CMS writes only to the two paths you declare."
- E2 Declared path missing in `main` → `TextField` hint "content/blog isn't in main yet. The first MR will create it." (allowed); asset dir outside `public/` → warn only.
- E3 Branch pattern without `{slug}` → error "Include {slug} so each post gets its own branch."
- E4 Base branch = default and pushes → never; `ScopeNote` "Never pushes to main" always visible.
- E5 **Skip Search Console** ("Connect later") → onboarding finishes; `/seo` shows `DataGap` "Search Console not connected" + **Connect**.
- E6 OAuth property mismatch → `Select` of available properties + "lumendental.co isn't in this Google account".
- E7 ZIP without a rendered sample post → `Callout` block "No sample post found. Add one rendered blog post as HTML to the ZIP." · file > 50 MB → "Keep the ZIP under 50 MB; drop node_modules and images." [ASSUMED limit].
- E8 Template has **no table** → structures row "Table · Not in template · posts needing one are held" (informational; no block at ingest).
- E9 Mapping chosen as **Ignore** → recorded; renderer never emits it.
- E10 Re-ingest (redesign) → produces v3, v2 → superseded; `Callout` "Existing posts keep v2 until re-rendered" (PRD open question 6 — default: new posts only [ASSUMED]).
- E11 Specialist / stakeholder → `/onboarding` and `/templates/ingest` are `RoleGate` fallback "Only a developer or admin can connect repos and templates."

## F8 — SEO review: prove a post did something (M6, M7)

Entry: `/plan` rail StatTile ↗ or rail **SEO trajectory** → `/seo` (click 1 from /plan; 0 from rail).

| # | Screen | Action | Clicks |
|---|---|---|---|
| 1 | S13 | Headline `StatTile` "Gap to phase projection −6.2%" · "Organic sessions · W39 3,184 of 3,395 projected"; `SourceNote` "Search Console · lags 2–3 days · modeled CTR curve"; KAS card "Recalculated 24 Sep · after 1 merge" · "Concentration 64% · fragile" | 0 |
| 2 | S13 | KAS card `Select` snapshot → **After !14 merged · 24 Sep** (compares to 17 Sep weekly) | 1, 2 |
| 3 | S13 | `KasTable` Δ column now vs previous snapshot; row "emergency dentist lekki · 10.3% · +0.8 · /locations/lekki · 3 ↑" → click row | 3 |
| 4 | Sheet | Keyword detail: `Sparkline` position W32–W39, snapshots `Timeline` ("24 Sep · after !14 · +0.8"), ranking pages (1 → orphan chip), post contribution "emergency dentist in lekki: when to go · 0.0% · not ranking yet (lags 2–3 days)" | — |

Content performance: `DataTable` sort by Position (1) → page-2 rows (11–20) tagged "Refresh picks this up".

Edge / branches:
- E1 **Search Console missing/expired** → trajectory + KAS render `DataGap` "Search Console not connected · no positions or impressions" + **Reconnect** (developer/admin); never zeros.
- E2 **Week gap** (W35 export failed) → `TrajectoryChart` broken line + "no data" marker; headline uses last complete week and says so.
- E3 Snapshot not yet computed (< 24 h after merge) → `Callout` info "First score for implant vs bridge at 26 Sep, 11:20 · 23 h to go".
- E4 Ahrefs not connected → difficulty evidence "KD · SERP estimate"; backlink columns `DataGap`.
- E5 Stakeholder: full read; no Reconnect/Run actions; can open reports.

## F9 — Run now with cost estimate; refused over cap (triggers, cost controls)

Entry: rail **Runs & ledger** → `/runs` (0), or `/plan` rail "Next runs" **Run now**.

| Path | Steps | Clicks |
|---|---|---|
| F9a within cap | `ScheduleRow` "Keyword swarm · Monday weekly · New ideas in the plan · next Mon 29 Sep, 09:00" → **Run now** (1) → `Dialog` "Run keyword swarm now?" `KeyValue`: Estimate **$4.20**, Model tier workhorse, Text cap "$96.00 of $150 used · $54.00 left", note "Same output as the scheduled run" → **Run now** (2) → `RunRow` queued → running, `AgentStatusPill` +1 | 2 |
| F9b refused | `ScheduleRow` "Content refresh · Monthly" → **Run now** (1) → `Dialog` shows Estimate **$62.00** > $54.00 left; primary is `LockedAction` "Run now · over cap"; `Callout` block "This run would cost about $62.00. Lumen Dental has $54.00 left of its $150 text cap this month. Ask an admin to raise the cap, or run a smaller batch." Secondary **Refresh top 5 only · est. $24.80** [H] | 1 |

Edge / branches:
- E1 Estimate ≥ 80% of remaining / crosses 80% of cap → `Meter` warn + "This run takes you past 80% of the text cap. Admins get an alert."
- E2 Admin → `Callout` action **Raise cap** → `/settings?tab=providers`.
- E3 Run already running (same kind) → Run now `LockedAction` "Keyword swarm is running · started 10:31".
- E4 Actual cost exceeds estimate mid-run and would cross the cap → run stops at the cap, status refused-over-cap, "Stopped at the cap · $53.60 used · partial output kept" (never silent billing).
- E5 Missed schedule (outage) → row caption "Missed Mon 22 Sep" + **Catch up** = Run now.
- E6 Stakeholder → Run now `RoleGate` fallback "Your role can't trigger runs."; developer same [PRD: developer can't trigger? not listed → read-only ASSUMED].

## F10 — Stakeholder comment-only (roles)

Entry: email "Draft ready for your comments · root canal recovery" → `/posts/root-canal-recovery` (0) as Dr Ada Okafor.

| # | Action | Clicks / inputs |
|---|---|---|
| 1 | Draft renders read-only (no toolbar, no Composer). Right rail `CommentThread` at top. Type "Please say 'most patients' rather than a percentage." (input 1) → **Comment** | 1 |
| 2 | Toast "Comment sent to Tolu B."; audit "commented"; notification to specialist | — |

What the stakeholder sees instead of actions: header `LockedAction` "Approve" → `RoleGate` fallback "Your role can comment. Tolu B. approves."; Composer slot → `Callout` info "Stakeholders can read and comment. Edits come from the Lumen team at Grandeur."; `/plan` no New idea, no drag; `/runs` read-only (ledger visible — accountability is visible to the client); `/seo` full read; `/templates`, `/onboarding`, `/settings` → `RoleGate` fallback.
Edge: comment on a post in MR open/Live → allowed, flagged "After approval" for the specialist · empty comment → Comment disabled · stakeholder deep-links to `/approvals` → list read-only with the gate explanation.

## F11 — Ledger aging (7 overdue / 14 named blocker)

**F11a automatic** (0 clicks). Ledger item created when: a slot is marked human-only, a QA sweep lists a human task, a prune list awaits sign-off, a draft waits in review.

| Age | Chip (`LedgerItem`) | Where it shows | Notification |
|---|---|---|---|
| 0–6 d | "To-do" neutral · "Day 2" | `/runs` ledger, `/plan` rail | none |
| 7–13 d | "Overdue" human (amber) · "Day 9" | + `StatStrip` human count, bi-weekly report | Owner: "Sign off prune list · Sept is overdue (day 7)" |
| ≥ 14 d | "Blocker" block (red) · "Day 15 · holds 1 post in Needs assets" | + first row of `/plan` rail, report "Named blockers", rail dot on Runs | Owner + admin + Slack: "Named blocker: Clinic photo for veneers post · day 14 · holds porcelain veneers: before and after" |

**F11b clear a blocker from /plan**: `LedgerItem` "Clinic photo for veneers post" (1) → `/posts/porcelain-veneers/assets?slot=clinic-photo` → **Upload own** (2) → file (3) → **Use upload** (4). Item closes "Resolved · day 15 · Tolu B."; post leaves Needs assets if last slot.
Edge: downstream post closed/deleted → item auto-closes "No longer needed" · reassign owner via `Menu` "Reassign" (specialist/admin), age does **not** reset · no snooze (accountability) [ASSUMED] · owner removed from site → item reassigns to specialist, flagged.

## F12 — Reschedule by dragging a card to another week (M1)

Entry: `/plan?view=calendar` (SegmentedControl **Calendar**, 1 click from Board — not counted in the drag budget).

| # | Action | Clicks |
|---|---|---|
| 1 | `CalendarWeekGrid` W39–W44, each "n / 4" vs target. Drag "how long do dental implants last" from W40 to W41 → drop | 1 (drag) |
| 2 | Toast "Moved to W41 · generation moves to Mon 5 Oct · Undo"; W40 "3 / 4" (amber under target), W41 "5 / 4" (caption "over target", not a block); run schedule updated; audit "rescheduled by Tolu B." | — |

Keyboard (WCAG 2.5.7 alternative to dragging): focus card → Space "lift" → ←/→ week → Space drop (≤ 4 keys); or card `Menu` "Move to week…" [see Inventory gaps G1].
Edge: drop on a past week → not a drop target, caption "Past weeks are closed" · card already Drafting → Toast "Drafting has started. This moves the publish week only." · MR open/Live cards not draggable · stakeholder/developer → no drag handles · drop fails (network) → card animates back + Toast "Couldn't move it. Try again." · Board: dragging Idea → Briefed = Promote to brief; no other cross-state drops (states are earned, not dragged).
