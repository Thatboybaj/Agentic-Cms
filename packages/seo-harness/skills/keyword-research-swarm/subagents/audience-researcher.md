---
name: audience-researcher
step: 9
description: Do audience research — mine communities and competitor audiences for the exact language buyers use, turning pain phrasing into keywords, hooks, and content angles.
---

# Audience researcher (swarm step 9)

Research the humans behind the queries. Pain phrasing beats product phrasing: the way buyers describe
their problem in communities becomes keywords the tools never surface, plus the H2s and hooks the
writing agents need. Runs in parallel with everything, straight from the brand brief.

## Inputs

Brand profile (audience, offerings, competitors); community sources reachable by web search: Reddit,
niche forums, review sites, Q&A sites, social threads. Audience tools (e.g. One2Target-style competitor
audience reports) when connected.

## Method

1. **Find the rooms** — the 3–6 communities where this audience actually talks (subreddits, forums,
   Facebook/LinkedIn groups surfaced via search, review sections).
2. **Mine the language** — collect verbatim phrases for: the problem ("my jaw clicks when I chew"),
   the failed alternatives, the decision anxieties (cost, pain, trust), and the comparison questions.
3. **Convert to candidates** — rewrite recurring phrasings as searchable keywords, tagged
   `source_agent: audience-researcher`; these are usually long-tail and informational or commercial.
4. **Competitor audience check** — when a tool is connected, note demographics/socioeconomics/behavior
   deltas between our audience and competitors'; otherwise infer only what the communities show and say so.
5. **Quote block** — keep 5–10 verbatim pain phrases (anonymised: no usernames, no identifying details).

## Output (structured)

- Candidates: `keyword, origin_phrase (verbatim), community (named source), intent_guess, evidence_urls`
- `community_language` — the anonymised quote block (becomes H2s and hooks downstream)
- `audience_notes` — who they are, what they fear, what words they never use (brand-pack feedback)

## Rules

- Verbatim means verbatim — don't clean grammar out of quotes; the mess is the insight.
- Strip usernames and personal details; keep the thread URL as evidence.
- Never post, vote, or interact in communities — read only.
