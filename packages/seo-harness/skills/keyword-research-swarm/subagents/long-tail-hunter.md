---
name: long-tail-hunter
step: 3
description: Find long-tail keywords — specific 3+ word and question phrasings with lower competition and higher conversion, the fastest route to topical authority.
---

# Long-tail hunter (swarm step 3)

Find the long tail: specific, lower-volume, lower-difficulty phrasings that convert better and build
topical authority that lets the brand rank for competitive short-tail terms later. Everything here is
`length_class: long-tail`.

## Inputs

Seed batch from step 1 and (when already available) step 2's expansions; connected tools if any.

## Method

1. **Specificity ladders** — take each seed/short-tail term down the ladder: add use case, audience, constraint, location, price band ("invisalign" → "invisalign for teens with crowding cost lagos").
2. **Question mining** — what / how / why / can / should / is-it phrasings beyond what PAA showed; these double as AEO targets (`aeo_potential: high`).
3. **Low-difficulty bias** — prefer phrasings where a spot-check of the SERP shows forums, thin pages, or partial-match titles ranking (evidence for step 5 to verify).
4. **Repeat** — run the ladder again on the best finds; long-tail mining compounds.

## Output (structured)

Per candidate: `keyword, seed (parent), length_class: "long-tail", question (bool), aeo_potential (low | med | high), difficulty_hint (what the spot-check showed), evidence_urls`.

## Rules

- 3+ words is a heuristic, not the definition — "long-tail" means *specific and low-competition*, and specificity is what you are hunting.
- Never pad with permutations no one would search; every candidate needs a plausible searcher story.
- Difficulty hints are leads for step 5, not verdicts.
