---
name: cms-backend-03-agents-and-models
description: >
  Make the harness agents real: Anthropic gateway, the cappedInference Effect program, skills codegen, typed
  structured outputs per agent, tier routing + escalation, Langfuse run traces, and the agent step bodies that
  replace the 02 stubs (writer, optimizer, CMS-agent fixes, swarm, QA, refresh, link prospector, monitor, report, plan).
---

# Handoff 03: agents and models

| | |
|---|---|
| Size | **L** |
| Depends on | 02 (step interfaces), 08 partly (spend ledger adapter: build the `spendEntries` adapter here if 08 hasn't landed; 08 adds Autumn + Polar) |
| Unblocks | 04 (shares the gateway + capped program), 07 (report/QA consume GSC data), 09 |

## Goal

Every harness agent in `packages/seo-harness` `AGENTS` (except #0 orchestrator, D6, and #10 visual-asset, handoff
04) runs as a Convex Node action that: builds a single-site context, calls the right Anthropic model tier through an
Effect program that estimates, refuses over cap, debits, retries and settles, validates a structured output,
writes a Langfuse trace, and returns a typed artifact for the workflow to persist.

## Why

This is the product: the content is only as good and as cheap as these steps. Putting every model call behind one
Effect program is the framework rule for money + inference (`docs/architecture.md` "Effect fence") and the PRD's
spend guardrails ("estimate before executing, refuse above the cap").

## Inputs (read first)

- [../README.md](../README.md) §8 (agent execution model), §11 (spend), §12 (observability), §13 (failures)
- [../api-map.md](../api-map.md) §4 (`instructAgent`, `fixCheck`, `rewriteFactWithout`, `sendBack`), §8 (`runNow`), §10
- `packages/seo-harness/{HARNESS.md,harness-config.yaml,src/index.ts}` and every `skills/*/SKILL.md` (data contracts, inputs/outputs, escalation)
- `packages/effect-critical/src/{meteredInference.ts,inference.ts,wallet.ts,errors.ts}` (`debitAndInfer`, `runInference`, `WalletLedger`, `InferenceGateway`, `InferenceError`)
- `packages/ai-runtime/src/{budget.ts,gateway.ts}` (`assertWithinBudget`, `createOpenRouterGateway` as the adapter pattern)
- `packages/observability/src/langfuse.ts` (`traceGeneration`, `langfuseConfigFromEnv`)
- `apps/web/convex/inference.ts` (`runMeteredInference`: the vertical to mirror, including the idempotency-key comment)
- `apps/cms/src/server/visual-agent/diagram.ts` (Anthropic SDK + `zodOutputFormat` usage)
- `apps/cms/src/lib/logic.ts` (`estimateRun`, `checkCap`, `RUN_META`, `TIER_LABEL`)
- Claude API docs for structured outputs, prompt caching and token counting (verify current SDK surface; model ids only from `MODELS`)

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `packages/ai-runtime/src/anthropic-gateway.ts` **[NEW]** | `createAnthropicGateway({ apiKey, transport })` implementing `InferenceGateway`; supports structured output, tool use, prompt caching on the skill system prompt; maps SDK errors to retryable/non-retryable |
| `packages/effect-critical/src/cappedInference.ts` **[NEW]** | `cappedInference(ledger, gateway, input)`: estimate → cap check → debit estimate → `runInference` with `Effect.retry` (retryable only, bounded) → settle to actual (credit difference or debit overage, idempotent) → refund on failure. Typed errors: `CapError` **[NEW]**, `WalletError`, `InferenceError` (provider label param instead of hardcoded `"openrouter"`) |
| `packages/observability/src/langfuse.ts` | `traceRun` **[NEW]**: one trace per run, generations as children (`traceGeneration` gains optional `traceId`) |
| `packages/seo-harness/scripts/build-skills.mjs` + `src/skills.generated.ts` **[NEW]** | inlines every `SKILL.md` + its hash; CI check that generated = source |
| `apps/cms/convex/agents/` (`"use node"`) | `context.ts` (`buildAgentContext(siteId, …)`), `models.ts` (tier → id, escalation), `schemas.ts` (zod per artifact), one file per agent: `writer.ts`, `optimizer.ts`, `cmsFixes.ts`, `swarm.ts`, `qa.ts`, `refresh.ts`, `links.ts`, `monitor.ts`, `report.ts`, `plan.ts` |
| `apps/cms/convex/spend.ts` | `WalletLedger` adapter over `spendEntries` (`userId := "site:<siteId>:<budget>"`), `debit`/`credit`/`getBalance` internal mutations/queries |
| Replaced stubs | `pipeline/steps.ts` `draftStep`, `optimizeStep`, `fixStep`; `scheduledRun` per-kind bodies |

## Steps

1. **Gateway.** `createAnthropicGateway`: pure module, transport injected (SDK in the Convex Node action), returns `InferenceResponse` with tokens and `providerRequestId`. Unit tests with a fake transport for 429/5xx (retryable), 400 (not), timeout.
2. **cappedInference.** Effect program as in README §11 flowchart. Inputs: `{ siteId, budget, estimateMicroUsd, capMicroUsd, spentMicroUsd, idempotencyKey, request, pricing }`. Cost from tokens × per-model price table **kept in config, verified against provider pricing** (no hardcoded prices in code paths without a source date). Tests: refuse over cap without calling the gateway; debit once per key; refund on failure; settle overage once; retry stops at the bound.
3. **Skills codegen.** Script reads `skills/*/SKILL.md` (and `assets/` text where a skill references them), writes `skills.generated.ts` `{ [agentId]: { text, sha256 } }`. Runs in `prebuild`/`typecheck` of `@studio/seo-harness`.
4. **Context builder.** `buildAgentContext(siteId, needs)` loads only that site's brand pack, pillars, keywords, recent posts, latest artifacts (`artifacts.by_site_agent_kind`), connections metadata (no secrets). Asserts every loaded doc's `siteId`. Redacts nothing sensitive because nothing sensitive is loaded.
5. **Structured outputs.** One zod schema per artifact (writer: blocks with kinds from `IPostBlock`, `facts[]` with claim + block id, `imageSheet[]` matching `IImageSlot` creation fields, `seoTitle`, `words`; optimizer: `IGateCheck[]` with the 12 check ids the prototype seeds; swarm: keyword rows with `difficultyEvidence`; QA: ledger items + scorecard; refresh: refresh drafts + prune list; report: edition + pivot triggers; monitor: digest with severities; plan: pillars + targets). Validate with zod after the SDK's structured-output parse; on mismatch apply D7 (retry same tier once → escalate one tier if cap allows → fail).
6. **Routing.** `modelFor(agentId, site, post?)`: base tier from `AGENTS[agentId].modelTier`, override by `site.modelRouting` task group (`mechanical`·`writing`·`strategy`·`pillar-pages`), static escalation from `escalateTo` (`post.strongModel` → strongest for writer; `pivot_trigger_fired` → strongest for report; ambiguous diagnosis → workhorse for monitor). Model id = `MODELS[tier]`. Run row records `tier`, `model`, `escalated`.
7. **Agent steps.** Each `agents/<x>.ts` exports an internal action `run({ siteId, runId, postId?, inputs })` that: `assertSiteRole`-free (internal) but checks `run.siteId === siteId`; builds context; `assertWithinBudget` per turn when the agent uses tools (web research via `@studio/web-tools` `searchWeb` → `scrapeUrl`, Browserbase only if a skill needs a real browser); calls `cappedInference`; writes `artifacts` (via mutation) and returns the parsed artifact. The workflow mutation persists domain rows:
   - writer → `postVersions` (agent-generation), `posts.blocks/words/seoTitle`, `factMarkers` (every unsourced claim; the guardrail "no fabricated statistics, quotes or citations"), `imageSlots` from the sheet, regulated disclaimer block from `brandPack.disclaimers`
   - optimizer → `gateChecks` (+ `evaluatedForVersion`)
   - CMS fixes (autopost + `fixCheck` + `rewriteFactWithout` + `instructAgent` + `sendBack`) → `suggestions` (pending, or auto-accepted by `AUTOPOST_ACTOR`)
   - swarm → `keywords` (dedupe `termNormalized`, skip rejected ideas) + idea `posts` (source `keyword-swarm`)
   - QA → `ledgerItems` (`origin: qa-agent`, `dedupeKey`), scorecard artifact
   - refresh → decaying posts → refresh drafts (version origin `refresh`) + prune list as ledger items (prunes are a human gate)
   - links → prospect artifact + ledger items for outreach sends (human gate `send_outreach`; no email is sent)
   - monitor → digest artifact + ledger items for blocking issues
   - report → `reports` row + HTML in R2 using `packages/seo-harness/templates/biweekly-report-template.html`; pivot triggers → notify + queue `seo-action-plan` review run after two consecutive editions below threshold (escalation rule 3)
   - plan → pillars/targets proposal as an artifact + ledger item "Approve plan" (human gate `approve_plan`); applying it is a mutation by a specialist
8. **Langfuse.** `traceRun` at run start (trace id on the run), each model call a generation with `siteId`, `workspaceId`, `agentId`, `tier`, `skillHash`, token counts; inputs logged as the structured prompt **without** secrets; Sentry on failures with `runId`.
9. **Rate limits.** Convex rate limiter buckets `agentRunsPerSite` and `agentRunsPerWorkspace` (pattern `apps/web/convex/rateLimits.ts`), checked before enqueuing.
10. **Wire to 02.** Replace stubs; keep step interfaces. `instructAgent`, `fixCheck`, `rewriteFactWithout`, `sendBack` now produce real suggestions.

## Interfaces it must honour

- Step I/O types from `pipeline/steps.ts` (02). Run row fields from `schema.md`. Idempotency keys from api-map.
- `InferenceGateway` / `WalletLedger` ports from `@studio/effect-critical` (don't fork them; extend).
- Model ids only via `MODELS` in `@studio/seo-harness` (no literals elsewhere; CI grep for `claude-` outside that file and tests).

## Test plan

| Kind | Cases |
|---|---|
| Unit (packages) | gateway error mapping; `cappedInference` refuse/debit/retry/refund/settle; skills codegen deterministic |
| Golden (recorded fixtures) | ≥ 5 per agent from seed data, replayed through a fake transport: writer output for "dental implants cost" produces ≥ 1 fact marker for an uncited number and a disclaimer for a `health` post; optimizer returns the 12 check ids; swarm never re-proposes a rejected idea; QA ages ledger items with `ledgerStatus`; report flags pivot on two below-threshold editions |
| Live eval (staging, manual trigger, budgeted) | 10 posts through writer + optimizer on a real model: 0 fabricated statistics without a marker (human-labelled), gate pass-rate, cost per post vs estimate (record in the eval-first spec) |
| Spend | over-cap estimate → run `refused-over-cap`, no gateway call, audit + notify; 80% alert once per month |
| Isolation | context builder given site A never returns site B docs (seeded two-site fixture; assert every doc's `siteId`); a run whose `siteId` differs from its post's site fails |
| Secrets | prompts and Langfuse payloads in tests contain no `secrets` ciphertext/plaintext (scan) |
| Escalation | invalid structured output → retry → escalate → `escalated: true`; cap blocks escalation → run failed, post held |

## Done when

- [ ] All agents except #0 and #10 run for real behind `cappedInference`
- [ ] No model call in the codebase bypasses `cappedInference` (grep `messages.create` outside the gateway)
- [ ] One Langfuse trace per run with child generations
- [ ] Golden fixtures green; staging live eval recorded with cost per post
- [ ] Harness skills unchanged in content; only codegen added

## Forbidden moves

- Calling Anthropic (or any model) from a query/mutation, from Next.js route handlers, or outside `cappedInference`.
- Client-supplied idempotency keys, model ids, prices or tiers.
- Putting secrets, other tenants' data or raw provider keys into a prompt or trace.
- Letting an agent write `posts.state` (only `posts.transition`) or open PRs (only `gitNode.*`, the CMS agent's hands).
- Editing `SKILL.md` text to make a test pass: fix the schema/parsing, or raise it with the harness owner.

## Risks

| Risk | Mitigation |
|---|---|
| Model ids / pricing drift | ids in one place, price table with source date, staging check in 09 |
| Long writer calls near action time limits | stream or split per section; one step per section if needed (verify Convex action limits) |
| Structured-output failures on long posts | section-level schema, retry → escalate (D7) |
| Cost per post above budget | prompt caching on skill system prompts; Haiku for mechanical sub-steps |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `src/server/visual-agent/diagram.ts` Anthropic call | pattern reused in the gateway (structured outputs) |
| `store.tsx` simulated draft/suggestion/revise jobs | **rewrite** as real agent steps; keep output shapes |
| `logic.ts` `estimateRun`, `checkCap` | **reuse**; estimates calibrated from real runs later |
| `apps/web/convex/inference.ts` | **pattern** (rate limit → Autumn check → Effect → persist → track) |
