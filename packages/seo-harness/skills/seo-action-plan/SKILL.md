---
name: seo-action-plan
description: Generate a complete, branded SEO and AEO action plan as an interactive tabbed HTML document — keyword strategy by pillar, traffic timeline with phase milestones, a step-by-step content workflow, a costed tool stack, and AEO/GEO rules — for any brand, by interviewing the user and filling gaps with research. Use this skill whenever the user asks for an SEO strategy, SEO plan, content marketing plan, AEO plan, keyword strategy, "how should [brand] approach SEO", or wants a deliverable like the Grandeur SEO & AEO Domination Plan for a new brand or client.
---

# SEO Action Plan Generator

Interviews the user about a brand, researches the gaps, and produces a five-tab HTML action plan matching the reference design in `assets/example-action-plan.html`. The output is a client-ready strategic deliverable, not a generic checklist.

## Step 1 — Discovery interview

Ask only what you cannot infer. Group all questions into **one single message** (never drip-feed). The mandatory set:

1. **Brand basics** — name, URL, what it sells, price point, geography
2. **Differentiators** — the 3–5 features, services, or angles competitors can't easily copy (these become keyword pillars; in the Grandeur reference, modules like BrandGuard and AEO Advisor each became a pillar)
3. **Audience** — who buys, and who influences the purchase
4. **Capacity** — realistic posts per week the team can sustain, and who does the human quality gate
5. **Budget** — monthly tool budget ceiling
6. **Domain reality** — new domain or existing? Any current rankings/traffic? (this changes every timeline projection)
7. **Competitors** — 2–3 names, or permission to identify them via research

If the user has already provided a brief, brand document, or earlier conversation context that answers any of these, extract the answers and confirm them in one line each instead of re-asking.

## Step 2 — Research and gap-filling

For anything the interview left thin, research before writing (web search where available):

- Validate keyword ideas per pillar: real phrasing people use, rough volume tier (low/med/high — never invent precise numbers), intent classification
- Check what content currently ranks for 2–3 head terms per pillar to calibrate difficulty honestly
- Confirm current tool pricing before putting numbers in the stack table; if unverifiable, use ranges and mark "verify pricing"
- If domain is new, apply sandbox-realistic timelines (near-zero traffic months 1–3) — never inflate projections to please

## Step 3 — Build the plan

Produce a single self-contained HTML file with **exactly five tabs**. Reuse the CSS, layout system, and interaction pattern from `assets/example-action-plan.html` (copy its `<style>` block and tab JS verbatim, keep the light/dark mode support), swapping only content and the accent color to the brand's palette if known.

### Tab 1 — Keyword strategy
- One section per pillar (3–5 pillars, from differentiators). Each pillar: a labeled table with columns **Keyword · Intent · Est. volume · Why [brand] wins**
- 4–6 keywords per pillar mixing commercial and informational intent
- End with a "start here" recommendation: which pillar first, and the strategic reason (the double-ROI logic: prefer pillars where content also demonstrates the product)

### Tab 2 — Timeline & traffic
- Honest disclaimer about assumptions and the Google sandbox
- Three cadence cards (minimum viable / recommended / aggressive) with posts-per-month math and traction horizon, scaled to the capacity answer
- Four phase milestones (Months 1–3 Foundation, 4–6 Early signal, 7–12 Growth, 12+ Authority) each with: what happens, traffic ranges per cadence, and tag chips of key activities. Adjust phase content for existing domains with authority (compress phases 1–2)

### Tab 3 — Content workflow
- A numbered 6-step weekly workflow: keyword mining → brief generation → post generation → human quality gate → publish + technical layer → monthly update cycle
- Each step: time cost, tools used, and where relevant a ready-to-paste prompt template customized with the brand's name and positioning
- Mark explicitly which steps are agent-run and which are the mandatory human gate

### Tab 4 — Tool stack
- Cost table (Tool · Cost · Role) summing to a stated monthly total, respecting the budget answer — offer a lean and a scale column if budget is tight
- "Optional upgrades" list and a "What NOT to spend on" list with reasons

### Tab 5 — AEO / GEO
- AEO vs SEO timing comparison bars
- AEO format rules (direct answer block, FAQ schema, definition blocks, numbered lists, comparison tables)
- Prioritized AEO content-type table for this brand (Content type · AEO target · Example topic customized to the brand · Est. time to snippet)
- GEO note: how this brand gets cited by AI engines, with 2–3 concrete "canonical definition" targets they should own
- The post template block, customized with the brand's feature names

## Step 4 — Deliver

Save as `[brand-slug]-seo-aeo-action-plan.html` and present it. Offer two follow-ups only: (a) revisions to any tab, (b) exporting the keyword tables as CSV for the tracker.

## Judgment rules

- Every number is either researched, computed from user inputs, or presented as an honest range. A plan with confident fake volumes is worse than none
- Pillars come from differentiators, not from generic category keywords — the "Why [brand] wins" column must name a real feature or asset for every row; if you can't fill it, the keyword doesn't belong in the plan
- Keep the writing style of the reference: dense, specific, practitioner tone, no filler paragraphs
- This plan feeds the other agents: keyword tables feed keyword-research-swarm, the workflow tab references blog-writing-agent and on-page-seo-optimizer, the update cycle feeds content-refresh-agent. Name them in the workflow tab when the user has the full suite installed
