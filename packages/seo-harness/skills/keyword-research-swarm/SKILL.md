---
name: keyword-research-swarm
description: Run a multi-angle keyword research sweep for a brand or topic — autocomplete/suggest mining, question keywords, community language mining, competitor gap analysis, low-competition filtering, and a topical authority map — and deliver a prioritized keyword pipeline ready for an editorial tracker. Use this skill whenever the user asks for keyword research, keyword ideas, content ideas for SEO, a topical map, "what should we write about", competitor keyword gaps, or wants to refill the content pipeline. Also use it on a schedule as the weekly keyword mining step of a content workflow.
---

# Keyword Research Swarm

Runs up to six research angles in parallel (or sequentially where subagents are unavailable), then merges results into one deduplicated, prioritized pipeline.

## Mandatory inputs

1. **Seed** — a brand + its pillars (ideally from a seo-action-plan output), OR a bare topic
2. **Intent focus** — pipeline-filling (broad) or campaign-specific (narrow)? Default: broad
3. **Volume of output** — how many keywords the pipeline needs this run (default 25–30)

If a keyword tracker already exists (CSV, Airtable export, Notion), request it once so you can dedupe against live and planned content.

## The six angles

Run every angle that the seed supports; skip any that don't apply and say why:

1. **Suggest mining** — expand each pillar term through alphabet-soup autocomplete patterns ("[term] a…", "[term] for…", "[term] vs…", "how to [term]", "best [term]"), via web search of suggest results
2. **Question mining** — People Also Ask phrasing, "what is / how to / why does / can you" formats. These feed AEO content directly; tag them `question`
3. **Community mining** — search Reddit, niche forums, and community threads for the exact language buyers use (pain phrasing beats product phrasing). Extract candidate keywords AND quote 3–5 verbatim pain phrases as a bonus insight block — these become H2s and hooks
4. **Competitor gap** — for 2–3 competitors, identify topics they rank for or cover that the brand doesn't (via site: searches and their blog/sitemap structure when APIs aren't connected). Tag findings `gap`
5. **Low-competition filter** — for every candidate, estimate difficulty honestly by inspecting who currently ranks: big brands and exact-match titles everywhere = high; forums, thin pages, or partial matches ranking = low. Tag `low-difficulty` only with evidence
6. **Topical map** — cluster all survivors into the pillar structure, flag missing clusters where authority requires coverage the pipeline lacks

## Merge and prioritize

Dedupe, then score each keyword 1–5 on: relevance to a differentiator, difficulty (inverted), intent value, AEO potential. Priority = weighted toward relevance and difficulty.

## Output — always this structure

1. **Pipeline table** (also saved as CSV, columns matching a standard tracker): `keyword, pillar, intent, est_volume_tier, difficulty_evidence, aeo_potential, priority_score, suggested_content_type, suggested_title, notes`
2. **Top 10 this cycle** — ranked shortlist with one-line rationale each
3. **Community language block** — the verbatim pain phrases found in angle 3
4. **Cluster gaps** — clusters where topical authority is thin
5. **Handoff line** — which entries are ready to send to blog-writing-agent as briefs

## Judgment rules

- Volume tiers only (low / low-med / medium / med-high / high / very high) unless a real data source (Semrush, Ahrefs, GSC) is connected — never output precise fake volumes
- A keyword with no honest "why this brand wins" answer gets cut regardless of volume
- On scheduled runs, open with a 2-line delta versus the previous run (what's new, what was cut) before the full output
