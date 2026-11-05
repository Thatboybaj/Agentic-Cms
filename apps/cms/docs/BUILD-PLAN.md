# Agentic CMS — build plan (UXER → DS → app)

Sources: `prd-source.txt` (Agentic CMS PRD, 25 Sep 2026) · `reference/*.dc.html` (6 screens, desktop + mobile) ·
`reference/seo-*.png` (SEO harness explainer) · `visual-aid.png` (glass mail-dashboard hierarchy) ·
`nawa-template/02-design-system.md` (structure the DS doc follows).

Pipeline follows `agents/loops/uxer-harness.md` → `agents/loops/integrate-design-system.md`, same shape as `apps/rally`.

## Phase 1 — UXER (build details)

| Step | Output | Owner | Depends on |
|---|---|---|---|
| 1a | `uxer/00-decisions.md`, `01-jobs-and-principles.md`, `02-information-architecture.md` | lead | PRD, refs |
| 1b | `uxer/05-component-inventory.md` (the DS contract: names + props) | lead | 1a |
| 1c | `uxer/03-flows.md`, `04-screen-specs.md`, `06-content-and-motion.md`, `uxer-output.json` | agent U | 1a, 1b |

## Phase 2 — Design system (parallel after 1b)

| Step | Output | Owner |
|---|---|---|
| 2a | `src/ds/tokens.css`, `globals.css`, `icons.tsx`, app scaffold | lead |
| 2b | `src/ds/shell.tsx`, `controls.tsx` | agent D1 |
| 2c | `src/ds/surfaces.tsx`, `charts.tsx` | agent D2 |
| 2d | `src/ds/domain.tsx` (CMS-specific parts) | agent D3 |
| 2e | `src/lib/*` types, seed, store, logic (KAS, gates, ledger) + tests | agent Data |
| 2f | `docs/design-system.md` + `docs/02-design-system.cms.md` (Nawa template adapted: pairing, glass hierarchy, CMS kit) | agent Doc |

## Phase 3 — Build (parallel after Phase 2 typechecks)

| Module | Routes | Owner |
|---|---|---|
| M1 Plan | `/plan` (board · calendar · pillar matrix), `/plan/new` | agent S1 |
| M2 Editor + M3 Images | `/posts/[id]`, `/posts/[id]/assets` | agent S2 |
| M4 Templates + setup | `/templates`, `/templates/ingest`, `/onboarding` | agent S3 |
| M5 Approvals + MRs | `/approvals`, `/merge-requests` | agent S4 |
| M6/M7 SEO + KAS, runs, settings | `/seo`, `/runs`, `/settings/*` | agent S5 |
| Styleguide, verification | `/styleguide`, typecheck, tests, browser pass | lead |

## Done when

UXER "Done when" checklist passes · `pnpm --filter @studio/cms typecheck && test && build` green ·
every PRD P0 visible in the running app at :3200 · no color literals outside `tokens.css`.

## Backend phases (Convex control plane)

Stack + constraints: [`engineering-blueprint.md`](./engineering-blueprint.md) · design: [`backend/README.md`](./backend/README.md) ·
tables: [`backend/schema.md`](./backend/schema.md) ([`convex-schema.draft.ts`](./backend/convex-schema.draft.ts), typechecks, not deployed) ·
store → Convex mapping: [`backend/api-map.md`](./backend/api-map.md). The frontend phases above stay as they are; the
store adapter keeps every hook signature from `store-api.md`, so features don't change when the backend lands.

| Phase | Handoff | Size | Depends on | Exit |
|---|---|---|---|---|
| B0 | [00 setup](./backend/handoffs/00-setup.md): accounts, env tiers, keys | S | — | three tiers provisioned, `.env.example` + env matrix merged |
| B1 | [01 foundations + tenancy](./backend/handoffs/01-foundations-tenancy.md): schema, `requireSiteRole`, Clerk orgs, members, presence, locks, audit, notifications, store adapter | L | B0 | isolation sweep green; UI on Convex for workspace/site/team/settings |
| B2 | [02 post lifecycle workflow](./backend/handoffs/02-post-lifecycle-workflow.md): `posts.transition`, Workflow/Workpool, autopost ship/hold, schedules | L | B1 | every state edge tested with stub agents |
| B3 | [03 agents + models](./backend/handoffs/03-agents-and-models.md): Anthropic gateway, `cappedInference`, skills codegen, Langfuse | L | B2 | real agents behind the Effect fence; staging eval recorded |
| B4 | [04 visual agent + assets](./backend/handoffs/04-visual-agent-and-assets.md): connections, secrets, R2, sharp | L | B1–B3 | four image routes from Convex; Next.js API routes removed |
| B5 | [05 templates + renderer](./backend/handoffs/05-templates-and-renderer.md): server parse, publish render, serializers | M | B1, B4 | fidelity holds; html/mdx/json goldens |
| B6 | [06 Git + merge](./backend/handoffs/06-git-and-merge.md): GitHub App, webhooks, auto-merge, GitLab | L | B2, B4, B5 | approve → PR → green CI → Live on staging |
| B7 | [07 Search Console + KAS](./backend/handoffs/07-search-console-and-kas.md) | M | B1, B2, B4 | real trajectory; KAS within 24 h of merge |
| B8 | [08 spend + billing](./backend/handoffs/08-spend-and-billing.md): site ledger, Autumn, Polar | M | B1 (B3 shares the ledger adapter) | caps hold under concurrency; reconcile cron |
| B9 | [09 hardening + pilot](./backend/handoffs/09-hardening-and-pilot.md) | M + pilot time | B1–B8 | Aikido clear; pilot P0–P2 exited |

Parallelism: after B2, **B3 ∥ B7 ∥ B8**; B4 needs B3's gateway; B5 can start parse work after B1 and finish after B4; B6 after B5.
Open decisions that block phases: [`backend/README.md` §15](./backend/README.md#15-open-decisions) (D1 before B1, D2 before B3, D5/D8 before B6, D3/D4/D15 before B8 billing wiring, D14 before paid pilot).
