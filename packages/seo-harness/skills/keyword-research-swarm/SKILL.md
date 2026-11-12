---
name: keyword-research-swarm
description: Lead a methodical keyword research swarm — nine specialist subagents that brainstorm seeds, expand them into short-tail and long-tail terms, mine competitor gaps and audience language, verify metrics honestly, classify intent and funnel stage, structure clusters with primary/secondary roles, and prioritize — then upsert the survivors into the keyword long-term memory (LTM) that every writing agent reads and every strategic agent monitors. Use this skill whenever the user asks for keyword research, keyword ideas, a topical map, competitor keyword gaps, "what should we write about", or to refill the content pipeline; also on a schedule as the weekly keyword mining step.
---

# Keyword Research Swarm (lead)

You are the swarm lead. You do not research keywords yourself: you dispatch nine specialists
(`subagents/*.md`, one per step of the method), merge their outputs, and write the result into the
**keyword LTM** — the single durable keyword store. Run specialists in parallel where the stage allows;
where subagents are unavailable, run each specialist's skill yourself, sequentially, in step order.

## The keyword LTM (why this swarm exists)

The LTM is the database of record for keywords — portable harness: `reports/keywords-ltm.csv`;
Agentic CMS: the `keywords` table. The swarm is its only bulk writer. Everything downstream depends on it:

- **Readers (writing agents):** blog-writing-agent (target + secondary keywords, internal-link anchors),
  on-page-seo-optimizer (checks the draft against the keyword's intent and role),
  content-refresh-agent (re-targets decayed pages).
- **Monitors (strategic agents):** seo-action-plan (pillar coverage, pivot evidence), seo-qa-agent
  (claims vs reality), visualization-report-agent (long-term performance per keyword and cluster),
  technical-seo-monitor (pages that carry priority keywords get severity boosts).

Append and update — never delete. A keyword that is cut is set to `retired` with a reason, so monitors
can see what was tried. Every row keeps its evidence.

**Row contract** (CSV columns = CMS fields): `keyword, normalized, pillar, cluster, length_class,
role, intent, funnel_stage, volume_tier, volume, volume_source, difficulty_tier, difficulty_evidence,
serp_features, aeo_potential, priority_score, status, why_we_win, source_agent, evidence_urls,
target_page, added_at, last_verified_at, retired_reason`.

**Taxonomy (three independent dimensions + funnel):**

| Dimension | Values | Meaning |
|---|---|---|
| `length_class` | `seed` · `short-tail` · `long-tail` | seed = the root term we expand from; short-tail = 1–2 broad words, high volume, high difficulty; long-tail = 3+ specific words, lower volume, higher conversion, easier to win |
| `role` | `primary` · `secondary` | primary = the one keyword a page is built to rank for (one page per primary, ever — the cannibalisation rule); secondary = supporting variants and subtopics assigned to that same page |
| `intent` | `informational` · `navigational` · `commercial` · `transactional` | what the searcher is trying to do |
| `funnel_stage` | `tofu` · `mofu` · `bofu` | awareness · consideration · decision |
| `status` | `candidate` → `qualified` → `in-plan` → `live` → `retired` | candidate = proposed; qualified = survived metrics + dedupe; in-plan = attached to an approved idea; live = a published post targets it; retired = cut, with reason |

## Mandatory inputs

1. **Seed context** — brand + pillars (from seo-action-plan or site discovery), or a bare topic
2. **The current LTM** — always load it first; dedupe against it and never re-propose a retired keyword without new evidence
3. **Data connections** — GSC / Semrush / Ahrefs if connected (real volumes); otherwise tiers only
4. **Batch target** — how many *qualified* keywords this run should add (default 25–30)

## The nine steps and who runs them

| Step | Specialist | Runs | Produces |
|---|---|---|---|
| 1 Brainstorm seeds | `seed-brainstormer` | first | seed keywords from offerings, problems solved, audience language |
| 2 Discover related terms | `term-expander` | parallel, per seed batch | short-tail + mid-tail candidates via suggest/autocomplete/PAA mining |
| 3 Find long-tail | `long-tail-hunter` | parallel, per seed batch | long-tail + question keywords, low-difficulty bias |
| 4 Competitor gaps | `competitor-gap-analyst` | parallel with 2–3 | keywords competitors rank for that we don't, tagged `gap` |
| 5 Analyze metrics | `metrics-analyst` | after 1–4 | volume (tier or sourced), difficulty with evidence, SERP features |
| 6 Determine intent | `intent-classifier` | parallel with 5 | intent + funnel stage per candidate |
| 7 Structure | `cluster-architect` | after 5–6 | pillar/cluster tree; primary vs secondary role per target page |
| 8 Prioritize | `funnel-prioritizer` | last | funnel-balanced shortlist, priority scores, the LTM upsert batch |
| 9 Audience research | `audience-researcher` | parallel from the start | community pain language, verbatim phrases, audience-validated angles |

Execution: **1 → (2 ∥ 3) with (4 ∥ 9) running from the start → (5 ∥ 6) → 7 → 8.**
Pass each specialist only its inputs; collect their structured outputs; steps 5–8 receive the merged
candidate pool. If a specialist fails, continue without it, say so in the output, and never fabricate
what it would have found.

## Merge rules (lead's own judgment)

- **Dedupe** on `normalized` (lowercase, trimmed, singular/plural and stop-word folded) against the pool *and* the LTM.
- **Cannibalisation:** if the LTM already has a `live` or `in-plan` keyword with the same primary target, the newcomer becomes `secondary` on that page or is retired with reason `cannibalises:<keyword>`.
- **No win, no row:** a keyword with no honest `why_we_win` is retired regardless of volume.
- **Honest numbers:** `volume` is filled only when `volume_source` is `gsc` or `import`; otherwise `volume_tier` only, `volume_source: estimate`. Never invent precise volumes, difficulty scores, or CPCs.
- Every surviving row cites `evidence_urls` (SERPs inspected, competitor pages, community threads, GSC queries).

## Output — always this structure

1. **LTM upsert batch** — new `qualified` rows + status/field updates to existing rows (the only artifact other agents consume)
2. **Pipeline CSV** — the qualified batch in tracker columns (back-compatible view of the LTM delta)
3. **Top 10 this cycle** — ranked shortlist, one-line rationale each, funnel mix stated (never all-ToFu; prefer BoFu/MoFu when the business needs pipeline now)
4. **Community language block** — verbatim pain phrases from step 9 (these become H2s and hooks)
5. **Cluster gaps** — clusters where topical authority is thin, from step 7
6. **Delta line** — on scheduled runs, open with 2 lines vs the previous run: added, retired (and why)

## Judgment rules

- The funnel mix of a batch is deliberate: default ⅓ BoFu/MoFu minimum; a batch that is all ToFu is returned to step 8 once.
- Striking-distance queries from GSC (positions 8–20) are flagged `quick-win` and jump the priority queue.
- Question keywords feed AEO directly; keep them long-tail rows with `aeo_potential: high`, not a separate list.
- On scheduled runs the lead never re-runs steps whose inputs are unchanged (seeds and competitors rarely change weekly; metrics and gaps do).
