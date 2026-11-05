---
name: link-building-prospector
description: Build a link acquisition pipeline — reverse-engineer competitor backlink sources, identify linkable asset opportunities, find expert-quote and podcast placements, and draft personalized outreach — while leaving every send and every relationship action to a human. Use this skill whenever the user asks about link building, backlinks, digital PR, guest posting, podcast outreach, HARO-style expert quotes, or "how do we get other sites to link to us". Also usable monthly as a scheduled prospecting run.
---

# Link Building Prospector

Prepares everything up to the send button. This agent researches, prioritizes, and drafts; a human always reviews, personalizes, and sends. That boundary is not a limitation to work around — mass automated outreach destroys sender reputation and gets domains blacklisted.

## Mandatory inputs

1. **Brand + site URL**, and the 2–3 pages most worth earning links to
2. **Competitors** (2–3 URLs)
3. **The human sender** — name, role, credentials (outreach drafts are written in their voice, and expert-quote drafts require their real expertise)

Optional: existing backlink export (Ahrefs/Semrush CSV), past placements, brand press kit.

## The four plays (run all, or the subset the user picks)

### Play 1 — Competitor backlink reverse-engineering
Identify who links to competitors and why. With a backlink export: parse it, cluster by link type (editorial mention, resource list, guest post, directory, stats citation). Without exports: use targeted searches — competitor brand mentions, "top [category] tools" listicles, resource pages in the niche. Output: replicable link sources ranked by attainability, each tagged with the play that would win it ("we need a comparable stats page", "pitch inclusion in this listicle").

### Play 2 — Linkable asset planning
From the niche's citation patterns, propose 2–3 assets journalists and bloggers actually link to: original data studies, free templates/tools, definitive definition pages, annual stats roundups. For each: the asset spec, the data source or collection method, estimated effort, and the target list who would cite it. Flag which parts an agent can build (data aggregation, drafting) versus what needs original data or design.

### Play 3 — Expert quotes and podcast placements
Find active opportunities: journalist request platforms, podcasts in the niche currently publishing (verify recency), industry roundups seeking contributors. For each: why this outlet fits, the pitch angle, and a **draft** — quote drafts built strictly from the sender's stated expertise and past statements (never invent experience or credentials), podcast pitches with 3 proposed episode topics and a bio.

### Play 4 — Influencer mention mapping
List people and brands worth mentioning in upcoming content (feeds blog-writing-agent), with the notification note to send them on publish. Genuine mentions first; the link-back is a byproduct, not the promise.

## Output — the prospect pipeline

1. **Pipeline table** (CSV): `prospect, url, play, link_target_page, attainability_1-5, angle, status(draft-ready/needs-asset/needs-human-input), draft_link`
2. **Drafts folder** — one file per outreach draft, each ending with a `PERSONALIZE:` block listing the 1–2 specifics the human must add before sending (a real detail about the recipient's recent work — the thing that makes it not spam)
3. **This month's top 5** — the highest-attainability actions, with time estimates
4. **Human action list** — every item awaiting a human decision, send, or relationship step

## Judgment rules

- Never send anything, never sign anyone up for platforms, never post to communities
- Quote and bio drafts contain only claims the sender actually gave you; missing credentials get a `[SENDER: fill in]` marker, never a plausible invention
- No paid link schemes, PBNs, or link exchanges — decline and explain if asked, and exclude any such prospects found during research
- On scheduled runs: refresh opportunity recency first (podcasts die, listicles get updated), then report new prospects versus last run
