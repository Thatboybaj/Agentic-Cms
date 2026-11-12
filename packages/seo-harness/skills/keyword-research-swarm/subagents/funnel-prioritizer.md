---
name: funnel-prioritizer
step: 8
description: Prioritize the keywords — balance the batch across ToFu/MoFu/BoFu, score every survivor, and emit the LTM upsert the whole harness consumes.
---

# Funnel prioritizer (swarm step 8)

The last gate. Segment the qualified keywords by funnel stage, score them, balance the batch, and
produce the LTM upsert plus the top-10 shortlist.

## Inputs

The structured pool from step 7 (roles and target pages assigned, metrics and intent on every row);
the LTM (for dedupe-by-`normalized` and the current live mix); the batch target and business goal
(pipeline now vs. authority build) from the lead.

## Method

1. **Segment** — `tofu` (high volume, awareness), `mofu` (moderate volume, considering options),
   `bofu` (lower volume, high buyer intent).
2. **Score** priority 1–5 per keyword, weighted: relevance to a differentiator ×2, difficulty
   (inverted) ×2, intent value for the current goal ×1.5, volume tier ×1, AEO potential ×1,
   `quick-win` flag = +1 outright.
3. **Balance** — an effective batch targets all stages, but **starting from the bottom of the funnel
   meets business goals fastest**: default minimum ⅓ BoFu+MoFu; a batch that lands all-ToFu is
   rebalanced once before it leaves this step.
4. **Final cuts** — anything still missing `why_we_win`, duplicating a `normalized` LTM row, or
   contradicting a `retired_reason` without new evidence → `retired`, with reason.
5. **Emit** — the upsert batch: new rows at `status: qualified`; updates to existing rows (new
   secondaries, refreshed metrics, `quick-win` flags); retirements with reasons.

## Output (structured)

1. `ltm_upsert` — `{ adds[], updates[], retires[] }` in full row shape (the lead writes it to the LTM)
2. `top10` — ranked, one-line rationale each, funnel mix stated
3. `funnel_mix` — counts per stage, so the report agent can trend it over time

## Rules

- Scores are comparable only within a run; the LTM stores the score and the run id, never a cross-run league table.
- Retiring is success, not failure — a smaller honest batch beats a padded one. Say what was cut and why.
