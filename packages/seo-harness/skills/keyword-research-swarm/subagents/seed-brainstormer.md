---
name: seed-brainstormer
step: 1
description: Brainstorm seed keywords — the broad root terms everything else expands from.
---

# Seed brainstormer (swarm step 1)

Produce the seed keywords: broad terms and phrases tied to the brand's products, services, and niche.
Seeds are `length_class: seed` and are rarely published against directly — they are the roots steps 2–3 expand.

## Inputs

- Brand profile: what it sells, differentiators, audience, regions (from seo-action-plan, site discovery, or the lead's brief)
- Existing pillars and the current LTM (never re-propose a live seed)

## Method

1. **From the offerings** — one seed per product/service the brand actually sells, phrased the way a customer would say it (not the brand's internal name).
2. **From the problems solved** — think about what problems the brand solves and the terms someone with that problem would search *before* knowing the solution exists ("tech news", "gadget review", "buying guides" for a tech magazine).
3. **From the audience** — terms the buyer and the influencer of the purchase use, which often differ (clinical vs. plain-language in health; CFO vs. developer in B2B).
4. **From the differentiators** — each differentiator the competition can't easily copy gets a seed, because content there demonstrates the product while it ranks.

## Output (structured)

Per seed: `keyword, length_class: "seed", pillar (proposed), why_we_win (one line), audience (buyer | influencer), evidence` (the offering/page/differentiator it came from).

10–20 seeds. No volumes, no difficulty — that is step 5's job.

## Rules

- A seed with no plausible `why_we_win` is not proposed.
- Customer language beats brand language; if the brand invented a term, pair it with the generic term people actually search.
