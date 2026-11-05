# 00 — Decisions, conflicts, assumptions

UXER run for **Agentic CMS** (PRD by Olayinka Adeyefa, 25 Sep 2026). Qualification questions from the UXer
pipeline's `ux-design-lead` were not put to the founder in this run; each is answered from the PRD and the
founder's chat direction and marked **[ASSUMED]**. Revisit any of them and the affected docs re-run.

## Founder direction (chat, binding)

- Build the **design system from this PRD after UXER defines the build details**, then build the product.
- Visual direction = the six reference screens in `reference/`.
- **Visual hierarchy = the attached glass dashboard** (`visual-aid.png`): soft blurred washes behind one frosted
  shell, a round icon rail, floating white cards with a bold title + grey meta + circular arrow button, one black
  pill CTA per view, tiny colored status chips, pagination dots, composer bars at the bottom of work panes.
- The **Nawa design-system prompt** must be adaptable to this product: same section structure, new type pairing
  (General Sans + Poppins), new style (glass hierarchy) and the CMS component kit.

## Qualification (PROJECT_CONTEXT)

| Question | Answer | Source |
|---|---|---|
| Product or internal tool | Build the **v1 surface** (multi-site, all 7 modules) as a front-end product with seeded data; backend is a later slice. | PRD Roadmap v1; open question 1 [ASSUMED] |
| First site | **Lumen Dental** (`lumendental.co`, Lagos) — the tenant used across the reference screens. | Refs [ASSUMED] |
| Harness separate or folded in | Separate. The CMS agent calls the ten harness agents; UI names which agent produced each artifact. | PRD open question 3, recommendation |
| Platform | Desktop web first (1440 × 900 reference), full mobile layouts at 390 (refs include both). | Refs |
| Team / timeline | Studio fellow + agents; lift-and-use DS so the backend slices only add features. | AGENTS.md [ASSUMED] |
| Brand assets | None for the product itself. Product mark = the asterisk glyph in the rail. Tenant brand = site switcher. | Refs |
| Locale | English only (PRD non-goal: multi-language). LTR, but logical properties kept so RTL is cheap later. | PRD |

## Conflicts resolved

| # | Conflict | Resolution |
|---|---|---|
| C1 | Nawa reserves **amber for AI**. Refs use **blue for agent work** ("2 agents running", "Agent edit ready", "KAS gap") and **amber for "needs a human"** (Needs assets, human-only slot, overdue ledger). | Keep the refs. Nawa's "amber rule" becomes the **Agent-blue rule**: blue = the machine did or is doing this. Amber = waiting on a person. Both reserved. |
| C2 | Nawa pairing IBM Plex Sans Arabic + Archivo. | Replaced by **General Sans (500) for UI/display + Poppins (400) for body/meta**, as used in every ref. Two weights only. |
| C3 | Nawa radii 6/10/16. Refs are much rounder (pills 99, cards 18–24, shell 32). | Refs win: glass hierarchy radii (§DS 2.3). |
| C4 | Refs secondary text `#6B7079` on `#EEF0F3` canvas = 4.44:1 (fails AA for 13px). | Token `--c-ink-3` darkened to pass on canvas, surface and glass. `#8A8F98` meta and `#A0A4AB` placeholder are **never** used for decision-critical text. |
| C5 | PRD lists "SEO dashboard" and "approval queue" as screens but also says plan + trajectory + keyword weight on **one screen** (goal 4). | `/plan` carries a compact trajectory + KAS concentration strip in its right rail; `/seo` is the deep view. |
| C6 | PRD needs Calendar + Pillar matrix views; refs only show Board. | Same route, `SegmentedControl` switch (ref already draws the switch). |
| C7 | PRD's roles: stakeholder is comment-only. Refs show only the specialist. | A role switcher (avatar menu) demonstrates gating; locked actions render as `LockedAction` with the reason, never hidden silently. |
| C8 | PRD has scheduled runs, ledger, cost caps, audit, repo connection — no refs. | New screens `/runs`, `/settings`, `/onboarding` built only from inventory components in the same hierarchy. |
| C9 | "Every agent edit is a diff" vs speed. | Diffs are inline (`AgentDiff`) with Accept / Reject in place, not a modal. |

## Scope cuts (v1 UI)

- Real Git/Search Console/MCP calls: mocked by the client store with deterministic timers. Surfaces show the exact
  states the real integrations will produce (running, failed, over cap, conflict).
- Bi-weekly report is a stored-editions list + a report reader, not a PDF generator.
- v2 items (multi-language, Bitbucket, public API, programmatic SEO, white-label) not drawn.

## Non-negotiables carried from the PRD into UX rules

1. **Fact markers cannot be overridden** — no UI path lets approval proceed with an open marker.
2. **One human gate** per post (In review → MR open) with the three assertions.
3. **Hard vs soft blocks** are visually different and soft overrides always capture a logged reason.
4. **Never invent**: missing data renders as an explicit `DataGap`, never blank or zero.
5. **Spend**: every run shows its estimate before it starts; over-cap runs refuse with a message.
6. **Repo scope** is always visible where a write happens (content + asset paths, never base branch).

## Added by UXER specs pass (see end of `04-screen-specs.md`)

- [ASSUMED] Editing a post after its MR opens re-requires approval (the gate asserts the shipped text).
- [ASSUMED] Developers can read drafts but not trigger runs; ledger items cannot be snoozed.
- Inventory gaps G1 (`CalendarWeekGrid` needs `onMove(postId, week)` + keyboard move) and G2 (read-only diff) — G1 added to the kit during build; G2 uses two `SourceCodeFrame` panes in v1.

## Founder direction — 27 Sep 2026 (supersedes the PRD's single human gate)

| # | Direction | Resolution |
|---|---|---|
| C10 | **Only ideas need approval.** Generated content **autoposts by default**; when autopost is disabled per site, human review (the existing In review gate) is expected. | New site setting `publishing.autopost` (default **on**). Idea → Briefed now requires **Approve idea** (specialist/admin). With autopost on, the agents carry the post Briefed → Drafting → Needs assets → auto-gate → MR opened → **auto-merged when the repo's CI passes** → Live. With autopost off, the post stops at In review as before. |
| C11 | Guardrails still hold under autopost. | Autopost never publishes with an open fact marker: the CMS agent first sources the claim or rewrites without it (logged as an agent edit). Hard blocks the agent cannot clear (template can't render, budget cap, provider failure) **hold the post** in In review and add a ledger item — autopost degrades to human review, never ships around a block. Soft blocks are accepted by the agent with a logged reason ("autopost"). Repo scope + CI remain the deploy safety. |
| C12 | Users upload their own blog templates and connect their own image-generation MCP servers and APIs. | Templates: real client-side parse of an uploaded `.html` or `.zip`. Connections: Settings → Connections (MCP servers, image APIs, web image sources); keys held server-side, never rendered after entry, never placed in prompts. |
| C13 | The SEO harness gets an agent that creates images or diagrams, or sources them from the internet where needed. | New **visual-asset-agent** (harness agent #10, 11 total): per image slot it chooses **generate** (connected MCP/API), **diagram** (SVG from the post's own content), or **source** (licensed web image with attribution + license recorded in provenance). Charts stay inline SVG, never generated. |
