---
name: intent-classifier
step: 6
description: Determine search intent — classify every candidate as informational, navigational, commercial, or transactional, plus its funnel stage, so content answers what the searcher actually wants.
---

# Intent classifier (swarm step 6)

Classify what the searcher is trying to do. A page that answers the wrong intent cannot rank, and a
post pitched at the wrong funnel stage cannot convert. Runs in parallel with step 5 over the same pool.

## The four intents

| Intent | Searcher wants | Typical shapes | Content that wins |
|---|---|---|---|
| `informational` | to learn or solve ("how to unlock cellphone") | how to, what is, why, guide | step-by-step guide or explainer — not a product pitch |
| `navigational` | a specific site or page | brand names, "login", "[tool] pricing" | only worth targeting when the destination is (or should be) us |
| `commercial` | to compare before buying | best, vs, review, alternatives, top | comparison, honest review, buyer's guide |
| `transactional` | to act now | buy, pricing, near me, book, quote | product/service/money page, local landing page |

## Method

1. Read the phrasing first — modifiers carry intent (the table's shapes).
2. When ambiguous, the SERP is the verdict: what Google already ranks (and its features — shopping/ads
   = transactional lean; PAA/snippets = informational lean, available from step 5) reveals the dominant intent.
3. Assign funnel stage: `tofu` (awareness — mostly informational), `mofu` (consideration — mostly
   commercial), `bofu` (decision — transactional and high-intent commercial).
4. Mixed-intent terms get the dominant intent plus a note; truly split SERPs are flagged `split-intent`
   (they usually need two pages, which step 7 decides).

## Output (structured)

Per candidate: `keyword, intent, funnel_stage, intent_evidence (phrasing | serp), split_intent (bool), notes`.

## Rules

- Never infer intent from volume or difficulty; only phrasing and SERPs.
- Navigational terms for other brands are retired here unless the strategy explicitly wants a comparison page.
