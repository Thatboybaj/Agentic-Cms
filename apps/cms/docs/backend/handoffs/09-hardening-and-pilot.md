---
name: cms-backend-09-hardening-and-pilot
description: >
  Security, isolation and reliability hardening (Aikido pentest, SSRF, webhook abuse, authz sweep), observability
  completeness, load + chaos checks, eval suite + cost per post, runbooks, then a staged pilot on real client
  sites and the operate-handover.
---

# Handoff 09: hardening and pilot

| | |
|---|---|
| Size | **M** (+ pilot calendar time: PRD v0 gate "10 posts shipped end to end", v1 gate "three clients running eight or more weeks unattended") |
| Depends on | 01–08 |
| Unblocks | paid pilot (`agents/context/discovery/pilot-term-sheet.md`), `agents/loops/operate-handover.md` |

## Goal

The backend survives a security review and a pilot with real repos and money: no cross-tenant read, no unbounded
spend, no silent failure, every incident diagnosable from Sentry + Langfuse + audit in minutes; then a staged pilot
proves the golden case on real client sites.

## Why

The system writes to client codebases and spends money on their behalf (PRD "Permissions, security, and guardrails").
`docs/production-readiness.md` scores Security 6 and Observability 5.5 for the framework; this product needs better
before autopost touches a client repo.

## Inputs (read first)

- [../README.md](../README.md) §4 isolation rules I1–I8, §12, §13, §15 decisions
- `agents/loops/ship-ready-pr.md`, `agents/skills/aikido.md`, `agents/skills/mcp-security-stability.md`, `agents/skills/langfuse.md`
- `agents/context/discovery/{eval-first-spec.md,pilot-term-sheet.md}`, `agents/loops/operate-handover.md`
- `docs/production-readiness.md` ("Still required" list: `returns` on all public functions, `@convex-dev/eslint-plugin`, authz tests)

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/docs/backend/runbooks.md` **[NEW]** | stuck workflow, provider outage, webhook backlog, secret key rotation, GitHub App key rotation, revoke a tenant, cap misconfig, rollback a bad auto-merge (revert PR in the customer repo) |
| `apps/cms/docs/backend/security-review.md` **[NEW]** | threat model + Aikido results + exceptions |
| `apps/cms/convex/*.test.ts` additions | authz sweep, fuzzed args, webhook abuse |
| `agents/context/discovery/` filled eval-first spec for the CMS **[NEW]** (human-signed) | golden cases ≥ 20, autonomy L3, cost per post budget |
| Pilot report | in `apps/cms/docs/backend/pilot-log.md` **[NEW]** |

## Steps

1. **Authz sweep.** Generated test from the Convex API surface: every public function × every role × foreign site → expected allow/deny; every function has `args` + `returns` validators; add `@convex-dev/eslint-plugin` (verify name) and fail CI on missing validators.
2. **Threat model** (STRIDE-lite) for: Clerk JWT/org claim confusion, webhook forgery/replay (GitHub, Clerk, Polar), SSRF via connections/fact sources/sourced images, prompt injection from scraped pages and MCP tool output (treat as data: tools can't trigger repo writes or spend beyond the run's budget), template HTML/SVG XSS, path traversal in bundles and repo paths, secret exfiltration via prompts/logs, R2 URL guessing, cost-exhaustion (many runs), stale lock abuse.
3. **Aikido** scan + AI pentest on staging (`agents/skills/aikido.md`); fix critical/high; document exceptions.
4. **Prompt-injection guard.** Agent prompts mark retrieved content as untrusted; tool results can't change the run's site, budget, repo target or gate; CMS fixes never add facts that weren't sourced (re-run the fact marker check after every agent edit).
5. **Observability completeness.** Every action catch → `captureServerException` with `siteId`/`runId`; every run has a Langfuse trace; PostHog job events (README §12); a Convex "health" query for open holds, failed workflows in 24 h, webhook failures, spend drift.
6. **Reliability.** Chaos tests on staging: Anthropic 429 storm, image provider down, GitHub API 5xx, webhook delivered twice / out of order / late by an hour, Convex action timeout mid-step. Expected: retries bounded, posts held with reasons, no duplicate PRs/debits.
7. **Load.** 8 sites × weekly swarm + 4 posts/week each (PRD "4 or more posts per specialist per week") in one hour on staging: Workpool parallelism, rate limits, OCC conflict rate, reactive query cost of `stats.site`/`portfolio.list` (D11).
8. **Data lifecycle.** Export a site (posts, versions, audit) as JSON; delete a site (admin, audited, async, R2 prefix purge); retention for `presence`, `webhookEvents`, Langfuse.
9. **Eval suite.** Fill the eval-first spec with the human: ≥ 20 golden cases from real client artefacts (fact-marker discipline, disclaimer on regulated posts, template fidelity, path scope, cap refusal, hold reasons, KAS within 24 h). Run on staging; record cost per post vs budget.
10. **Pilot (staged).**

| Stage | Scope | Exit |
|---|---|---|
| P0 internal (PRD v0) | 1 site (Lumen or a Utopia portfolio site), 1 GitHub repo, **autopost off**, manual triggers | 10 posts shipped end to end, no manual file handling |
| P1 autopost canary | same site, autopost on, auto-merge **off** (developer merges) | 10 autopost MRs merged without markup fixes; every hold had a correct reason |
| P2 auto-merge | auto-merge on for that site; second site joins with autopost off | 4 weeks, ≥ 4 posts/week, 0 cap breaches, 0 cross-tenant findings |
| P3 v1 gate | 3 clients, schedules on | 8+ weeks unattended (PRD v1 gate) |

11. **Handover.** Run `agents/loops/operate-handover.md`: operators can change budgets, routing, schedules, templates and connections themselves; Studio keeps money/trust incidents.

## Interfaces it must honour

All earlier ones; no new product functions. Hardening may *tighten* validators and permissions; any loosening needs the lead.

## Test plan

Steps 1, 6, 7, 9 are the test plan. Additionally: an E2E "two agencies" test with two Clerk orgs, overlapping user (member of both), switching active org mid-session: no data from the other org in any query, cache or notification.

## Done when

- [ ] Authz sweep + validator lint in CI
- [ ] Aikido critical/high cleared or documented
- [ ] Chaos + load results recorded, fixes merged
- [ ] Runbooks written and rehearsed once on staging (key rotation, stuck workflow, bad auto-merge rollback)
- [ ] Signed eval-first spec; golden suite green; cost per post within budget
- [ ] Pilot stages P0–P2 exited; P3 running

## Forbidden moves

- Enabling auto-merge on a client repo before P1 exits.
- Loosening a permission or isolation rule to unblock the pilot.
- Running the pilot on the dev deployment or with dev keys.

## Risks

| Risk | Mitigation |
|---|---|
| A bad autopost post goes live | P1 canary with developer merge; revert runbook; gate re-check at merge; per-site autopost kill switch |
| Pilot client repo CI is weak | autopost requires CI configured; developer reviews the first MRs |
| Cost per post above budget | report from 08; levers: prompt caching, Haiku for mechanical sub-steps, fewer image candidates |

## Port vs rewrite

Nothing new to port; this handoff removes any remaining prototype paths (`SIM_MS` jobs, `.data`, localhost-only routes, dev role switcher outside `CMS_DEV_TOOLS`).
