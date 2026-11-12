# Keyword Research Swarm v0.3 (standalone)

One lead + nine specialists that do keyword research methodically and write the survivors
into a keyword long-term memory (LTM) that writing agents read and strategic agents monitor.

## Contents

| Path | What |
|---|---|
| `SKILL.md` | The swarm lead: dispatch order, merge rules, LTM row contract, output format |
| `subagents/<id>.md` | The nine specialists, one per step of the method (below) |
| `swarm-config.yaml` | Models + steps per specialist (extracted from the harness config) |
| `keyword-ltm.yaml` | The LTM store contract: columns, statuses, writers/readers/monitors |

## The nine steps

1. seed-brainstormer - seed keywords from offerings, problems solved, audience, differentiators
2. term-expander - related terms via autocomplete, People Also Ask, modifier families
3. long-tail-hunter - specific 3+ word and question keywords, low-competition bias
4. competitor-gap-analyst - keywords competitors rank for that the brand doesn't
5. metrics-analyst - volume (tier or sourced), difficulty with SERP evidence, quick wins from GSC
6. intent-classifier - informational / navigational / commercial / transactional + ToFu/MoFu/BoFu
7. cluster-architect - pillar/cluster tree, one primary per page, secondaries, internal links
8. funnel-prioritizer - funnel-balanced priority scores, final cuts, the LTM upsert + top 10
9. audience-researcher - community pain language, verbatim phrases (runs in parallel throughout)

Execution: 1 -> (2 || 3, with 4 || 9 from the start) -> (5 || 6) -> 7 -> 8.

## Keyword taxonomy (every LTM row)

- length_class: seed | short-tail | long-tail
- role: primary | secondary (one primary per page, ever)
- intent: informational | navigational | commercial | transactional
- funnel_stage: tofu | mofu | bofu
- status: candidate -> qualified -> in-plan -> live -> retired (nothing deleted)

## Wiring it up

Run the lead's SKILL.md as the agent prompt; give it subagent dispatch (Claude subagents, a
workflow engine, or sequential execution of each specialist skill). Models per specialist are in
`harness-config.yaml` (fast tier for mechanical mining, workhorse tier for judgment; the CMS maps
tiers to the active provider's models). Point the LTM at `reports/keywords-ltm.csv` (portable) or your own
keywords table using `keyword-ltm.yaml` as the schema.

Part of the Grandeur SEO Agent Harness v0.3.0; the full harness zip includes the other ten agents.
