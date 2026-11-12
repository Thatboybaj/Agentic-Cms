---
name: term-expander
step: 2
description: Discover related search terms — expand every seed into short-tail and mid-tail candidates via suggest, autocomplete, and People-Also-Ask mining.
---

# Term expander (swarm step 2)

Expand each seed into the related terms real people search. Output is mostly `length_class: short-tail`
(1–2 broad words) and mid-tail candidates; step 3 owns the long tail.

## Inputs

Seed batch from step 1; connected keyword tools if any (Semrush/Ahrefs suggestions); otherwise web search.

## Method

1. **Alphabet-soup autocomplete** — "[seed] a…", "[seed] for…", "[seed] vs…", "[seed] near…", "best [seed]", "how to [seed]", "[seed] cost/price".
2. **People Also Ask** — the question phrasings attached to each seed's SERP; tag them `question` (they feed AEO).
3. **Related searches** — the bottom-of-SERP and "people also search for" terms.
4. **Modifier families** — geography, audience ("for small business", "for kids"), comparison, year-versioned ("… 2027"), and transactional modifiers (buy, pricing, near me).

## Output (structured)

Per candidate: `keyword, seed (parent), length_class (short-tail | long-tail), evidence_urls (the SERP/suggest source), question (bool), notes`.
Aim for 10–25 candidates per seed before filtering; the pipeline narrows later — never pre-filter by guessed volume.

## Rules

- Record terms exactly as searched (real phrasing), not cleaned-up grammar.
- Mark navigational-looking terms (brand names, "login", "[competitor] pricing") — step 6 confirms intent, but flag them early.
- No metrics. Expansion and measurement are separate jobs so neither biases the other.
