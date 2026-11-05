---
name: cms-backend-02-post-lifecycle-workflow
description: >
  Implement the post state machine on Convex: posts.transition, the segmented workflows (postPipeline,
  autopostGate, shipPost stub, revise, scheduledRun, afterMerge stub), Workpool pools, schedules.tick and the
  autopost ship/hold branches, with agent steps stubbed behind interfaces that 03/04/06 fill.
---

# Handoff 02: post lifecycle workflow

| | |
|---|---|
| Size | **L** |
| Depends on | 01 |
| Unblocks | 03, 04, 06 (they plug real steps into these workflows) |

## Goal

Every edge of the lifecycle state diagram in [../README.md](../README.md) §6 is driven by Convex: workflows replace
`state.jobs` / `SIM_MS`, autopost ships or holds through `autopostDecision()`, and a human pause is a row state, not
a sleeping process. Agent steps are deterministic stubs with the final interfaces, so the whole path runs end to end
in tests before any model is called.

## Why

The PRD needs "a queue with durable retries for agent runs, since image generation and crawls are slow and
failure-prone" (constraint C2). Building the state machine with stub steps first separates orchestration bugs from
model behaviour and gives 03/04/06 fixed seams.

## Inputs (read first)

- [../README.md](../README.md) §6 (state diagram, segmentation sequence), §7 (scheduling), §13 (failure handling)
- [../api-map.md](../api-map.md) §3, §4 (`sendToReview`, `sendBack`, `approve`), §8 (`runNow`), §10 (workflows), §12 (crons)
- `apps/cms/src/lib/logic.ts`: `TRANSITIONS`, `nextState`, `STATE_OWNER`, `evaluateGate`, `autopostDecision`, `AGENT_FIXABLE_CHECKS`, `AUTOPOST_ACTOR`, `AUTOPOST_SOFT_REASON`, `NO_MANIFEST`, `estimateRun`, `checkCap`, `RUN_META`
- `apps/cms/src/lib/store.tsx`: job handlers (`autopost-brief`, `draft-progress`, `draft-complete`, `slot-candidates`, `autopost-gate`, `ci-result`, `auto-merge`, `revise-complete`, `run-complete`) and the hold/ship code around `autopostDecision` (search `held autopost`)
- `packages/seo-harness/src/index.ts`: `SCHEDULE`, `AGENTS`, `CMS_AGENT`
- Component docs: `@convex-dev/workflow`, `@convex-dev/workpool` (verify current API: `WorkflowManager`, `workflow.define`, `step.runAction/runMutation/runQuery`, retry options, `workflow.start/cancel/status`; `Workpool`, `enqueueAction`, `onComplete`)

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/convex.config.ts` | `app.use(workflow)`, `app.use(workpool, { name: "agents" })`, `"images"`, `"git"`, `"gsc"` (verify multi-instance syntax) |
| `apps/cms/convex/workflows/index.ts` | `WorkflowManager` with default retry policy (bounded, backoff) |
| `apps/cms/convex/workflows/postPipeline.ts`, `autopostGate.ts`, `shipPost.ts`, `revise.ts`, `scheduledRun.ts`, `afterMerge.ts` | definitions (steps per api-map §10) |
| `apps/cms/convex/lib/transition.ts` | final `posts.transition` (from 01) + `owner` from `STATE_OWNER`, `stateChangedAt`, audit, notify on human-owned states |
| `apps/cms/convex/pipeline/steps.ts` | **stub step interfaces**: `draftStep`, `optimizeStep`, `fillSlotStep`, `fixStep`, `renderStep`, `openPrStep` returning typed results (03/04/05/06 replace bodies) |
| `apps/cms/convex/schedules.ts` | `tick` (cron), `advance` (site-timezone next run), per-publish-slot pick |
| `apps/cms/convex/crons.ts` | tick every 5 min + sweeps from 01 |
| `apps/cms/convex/runs.ts` | `runNow`, `runsInternal.create/finish/refuse` |
| tests | `workflows.test.ts`, `autopost.test.ts`, `schedules.test.ts` |

## Steps

1. **Components.** Install `@convex-dev/workflow` + `@convex-dev/workpool` in `apps/cms`; register; deploy.
2. **Transition.** `posts.transition({ postId, from, to, actor, actorKind, reason? })` internal mutation: refuses if `post.state !== from` or `nextState(from, to)` fails; writes `state`, `owner`, `stateChangedAt`, `updatedAt`; audit; notification when `STATE_OWNER[to]` is `human`/`developer`. The only writer of `posts.state` (grep check in CI).
3. **Runs.** `runsInternal.create` (status queued, `idempotencyKey`, `estimateUsd` from `estimateRun`), `start`, `finish` (tokens, cost, output, trace id), `refuse` (status `refused-over-cap`, audit "run refused over cap", notify admins). Cap check uses `checkCap(site, kind, estimate)` with `site.budgets` built from `sites.spend` (micro-USD → USD).
4. **postPipeline** (start from `approveIdea` when autopost on, or `generateNow`): set `posts.workflowId`; steps: `transition briefed→drafting` → `draftStep` (writes version + blocks + facts + image sheet → `imageSlots`; `progress` updates) → `optimizeStep` (writes `gateChecks`) → `transition drafting→needs-assets` → enqueue `fillSlotStep` per slot on the `images` pool (skip `humanPinned` / human-only; if `publishing.humanOnlyAssets`, skip all) → when the last slot settles (Workpool `onComplete` → mutation counts filled slots) → autopost on ? start `autopostGate` : `transition needs-assets→in-review` + notify "Approval requested". Clear `workflowId` at the end.
5. **autopostGate**: load post, slots, active manifest, site → `evaluateGate()` → `autopostDecision(post, gate, site)`. For each `fix`: rewrite unsourced claim / fixable check / disclaimer / slot fill via `fixStep` (as suggestions auto-accepted by `AUTOPOST_ACTOR`, each audited like the store: "rewrote unsourced claim", "fixed check", "accepted soft block"); re-evaluate. `ship` → set `approvedVersion`, audit "approved" (actor `AUTOPOST_ACTOR`), `transition needs-assets→in-review` (if not already there: `TRANSITIONS` has no `needs-assets→mr-open` edge, so autopost passes through In review for an instant, audited), start `shipPost`. `hold` → `transition → in-review`, ledger item `kind: "autopost-hold"`, title `Autopost held: <reason>`, `dedupeKey: autopost-hold:<postId>`, notify, audit "held autopost".
6. **shipPost** (stub until 05/06): `renderStep` → if `held.length` → hold with "Template can't render: …" → `openPrStep` → write `mergeRequests` (stub host "github", `ci: pending`) → `transition → mr-open`. In tests a fake webhook mutation flips CI.
7. **CI + merge events (stub until 06):** `gitInternal.onCi({ mrId, ci, detail })` and `gitInternal.onMerged({ mrId, sha })` mutations that 06's webhook will call. `onCi(passing)` → `maybeAutoMerge` (only `autopost === true` && `autoMergeOnGreenCi` && gate still green for `postVersion`); `onCi(failing)` → audit "stopped at red CI", `ciDetail`, notify developers. `onMerged` → start `afterMerge`: `transition mr-open→live`, `liveAt`, `mergeCommitSha`, `ctx.scheduler.runAfter(24h, kas.recalc)` (stub until 07).
8. **Human paths:** `posts.sendToReview`, `posts.approve` (server-side `evaluateGate` with overrides; refuses if `!canApprove`; starts `shipPost`), `posts.sendBack` → `revise` workflow (writer applies `sendBackNote` → optimizer → back to in-review, notify "Revision ready"), `posts.shipNow` → `autopostGate`. Edit after MR open: `editor.editBlock` sees `mrId` open and `approvedVersion < currentVersion` → `transition mr-open→in-review` (edge exists in `TRANSITIONS`); the open PR is marked stale and updated by the next `shipPost`.
9. **scheduledRun + tick:** `schedules.tick` reads `by_enabled_next` ≤ now for active sites, starts `scheduledRun({ siteId, kind, trigger: "scheduled" })`, advances `nextAt`. `runNow` starts the same workflow with `trigger: "manual"`. Per-kind body is a stub returning a canned artifact until 03/07.
10. **Cancellation:** `sites.setStatus(paused)` and `setAutopost(false)` don't kill running workflows; steps check site state at their start and stop cleanly (`cancelled` run status).
11. **Store adapter:** remove the corresponding `SIM_MS` jobs; the UI reads progress from `posts.progress` and run rows.

## Interfaces it must honour

- Step stubs' input/output types are the contract for 03 (draft/optimize/fix), 04 (fillSlot), 05 (render), 06 (openPr, onCi, onMerged). Put them in `pipeline/steps.ts` with zod schemas.
- `posts.transition` is the only state writer; `TRANSITIONS` from `logic.ts` is the only edge list.
- Idempotency keys per api-map (e.g. `run:<siteId>:post-generation:<postId>:<version>`).

## Test plan

| Kind | Cases |
|---|---|
| Golden (autopost ship) | Lumen-like seed (autopost on, repo, confirmed manifest): approveIdea → … → mr-open → onCi(passing) → auto-merged → live; audit sequence equals the prototype's (approved idea, generated draft, selected asset ×n, approved by `AUTOPOST_ACTOR`, opened MR, merged "auto-merged on green CI") |
| Golden (each hold reason) | autopost off; no repo; no confirmed manifest (`NO_MANIFEST`); over cap; provider failure (stub throws non-retryable); human-pinned slot; unfixable hard check → each ends in-review with ledger "Autopost held: <reason>" and no MR |
| Golden (open fact marker) | marker open → `fixStep` rewrites without it (suggestion accepted by autopost) → ships; never ships with an open marker |
| Human path | autopost off: needs-assets → in-review; approve with soft override (reason ≥ 8) → mr-open; MR not auto-merged even on green CI (not `autopost`) |
| Red CI | autopost MR, onCi(failing) → stays mr-open, `ciDetail` set, no merge |
| Idempotency | step retried after crash → one version row, one MR, one ledger item (dedupe), one spend debit (stub ledger) |
| Concurrency | `generateNow` twice → second refused; human moves post while a step is in flight → late `transition` refused (from-state mismatch) |
| Schedules | tick at Monday 07:00 Lagos starts keyword-swarm once; paused schedule and paused site skip; manual `runNow` produces the same artifact shape as scheduled |
| Isolation | workflow for site A cannot read or write site B rows (step args carry `siteId`; assertion in every step) |

## Done when

- [ ] Every edge in the README §6 state diagram has a test
- [ ] All hold reasons from `autopostDecision` covered
- [ ] No `SIM_MS` job left for lifecycle actions in the store adapter
- [ ] `posts.state` written only by `posts.transition` (CI grep)
- [ ] Stubs replaced only by later handoffs, interfaces unchanged

## Forbidden moves

- One long workflow that sleeps through human review or CI.
- Auto-merging an MR without `autopost: true`, or merging on anything but green CI for the MR's current head.
- Shipping with an open fact marker or a failing hard check (no override path exists for them).
- Calling a model or provider from a mutation, or writing tables from inside a Node action other than via `ctx.runMutation`.

## Risks

| Risk | Mitigation |
|---|---|
| Workflow component API differs from what this doc assumes | segmentation means only `start`, steps and retries are needed; verify and adapt in `workflows/index.ts` |
| Someone adds a `needs-assets → mr-open` shortcut to `TRANSITIONS` | keep the edge list unchanged; the transit through in-review is what makes the gate assertion auditable |
| OCC conflicts on hot posts (progress updates) | progress writes throttled (≥ 2 s apart) |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `logic.ts` `autopostDecision`, `evaluateGate`, `nextState`, `checkCap`, `estimateRun` | **reuse unchanged** |
| `store.tsx` job runner + `SIM_MS` | **rewrite** as workflows; copy audit/notify strings |
| `store.tsx` autopost fix loop | **port** logic into `autopostGate` |
