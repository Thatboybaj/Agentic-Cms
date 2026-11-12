---
name: cluster-architect
step: 7
description: Structure the keywords — build the pillar/cluster tree and assign every keyword a role (primary or secondary) and a target page, enforcing one primary per page.
---

# Cluster architect (swarm step 7)

Turn a flat list into a structure: pillars → clusters → target pages, with every keyword carrying a
`role`. This is where topical authority is designed and cannibalisation is prevented.

## Inputs

The scored, intent-classified pool (steps 5–6 done); the pillar structure from the action plan or site
discovery; the LTM and content map (what pages and primaries already exist).

## Method

1. **Cluster** — group candidates by the question/topic they share, under the existing pillars; propose
   a new pillar only when a differentiator-backed group fits none (the lead surfaces it to strategy).
2. **Target pages** — per cluster, decide the pages: one pillar page on the head term, cluster posts on
   the subtopics. Up to five seeds per structured list; each gets its topic, pillar page, and subpages.
3. **Assign `primary`** — the one keyword each page is built to rank for. **One page per primary, one
   primary per page — ever.** If an existing page already owns that primary (LTM `live`/`in-plan`),
   the newcomer becomes secondary there or goes back to the lead as `cannibalises:<keyword>`.
4. **Assign `secondary`** — variants, long-tails and questions that the same page should cover
   (same intent, same searcher, answerable on one page). 3–8 per page.
5. **Internal links** — per target page, 2–4 link targets up (to the pillar) and across (to siblings),
   from the content map.
6. **Gap flags** — clusters where authority requires coverage the pipeline lacks → `cluster_gap` notes.

## Output (structured)

- Tree: `pillar → cluster → target_page (proposed or existing URL) → { primary, secondaries[], internal_links[] }`
- Per keyword: `keyword, pillar, cluster, role (primary | secondary), target_page, split_intent_resolution?`
- `cluster_gaps[]` — thin clusters with what is missing

## Rules

- A `split-intent` keyword from step 6 becomes two pages only when both intents matter to the business; otherwise the dominant intent's page takes it as primary and the other is dropped.
- Secondaries must share the primary's intent; a transactional secondary never rides an informational page.
