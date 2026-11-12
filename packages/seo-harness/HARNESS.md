# Grandeur SEO Agent Harness

The harness is the orchestration layer that turns ten standalone skills into one periodic, self-checking content marketing system. One dispatcher routes work, eight execution agents do it, one QA agent verifies it, and one reporting agent narrates it every two weeks. Inside the Agentic CMS, the product surface's own CMS agent sits beside the harness: the harness produces artifacts, the CMS agent turns them into site changes.

Version 0.2.0. See "Changes from v0.1" at the end.

## Total roster: 11 harness agents (#0 to #10), plus the CMS agent

| # | Agent | Role | Model | Why this model |
|---|---|---|---|---|
| 0 | orchestrator | Dispatcher: reads the schedule, checks preconditions, routes runs, passes report files between agents | qwen3.8-flash | Pure routing and state checks, highest frequency, lowest cost |
| 1 | seo-action-plan | Strategy: the plan every other agent works from | qwen3.8-max | Rare runs, highest judgment density, sets direction for everything downstream |
| 2 | keyword-research-swarm | Weekly pipeline refill | qwen3.7-plus | Research synthesis and honest difficulty calls at moderate cost |
| 3 | blog-writing-agent | Per-post drafting + image production sheet | qwen3.7-plus, escalate to qwen3.8-max for pillar pages and money pages | Volume work on Qwen3.7-Plus; the 10 percent of posts that carry rankings get the stronger writer |
| 4 | on-page-seo-optimizer | Pre-publish audit gate | qwen3.7-plus | Checklist reasoning plus rewrite quality |
| 5 | technical-seo-monitor | Weekly site health digest | qwen3.8-flash | Mostly mechanical crawling, parsing, and diffing; escalate one-off gnarly diagnostics to Qwen3.7-Plus |
| 6 | content-refresh-agent | Monthly decay and page-2 cycle | qwen3.7-plus | Update drafting is real writing work |
| 7 | link-building-prospector | Monthly prospecting + drafts | qwen3.7-plus | Personalization judgment and research |
| 8 | seo-qa-agent | Verifies agent output against reality, tracks progress, demands human updates | qwen3.7-plus | Cross-checking other agents needs at least their level of reasoning |
| 9 | visualization-report-agent | Bi-weekly visual progress report + pivot calls | qwen3.7-plus, escalate pivot analysis to qwen3.8-max when a pivot trigger fires | Chart generation and narration on Qwen3.7-Plus; strategy-changing recommendations deserve Qwen3.8-Max |
| 10 | visual-asset-agent | Per-post image slots: generate, diagram, or source licensed images; post-process; provenance | qwen3.7-plus | Route choice, prompt construction, and license judgment are workhorse reasoning; the pixels come from the connected image providers |
| 11 | site-discovery-agent | On a new site: crawl it, understand the business, propose pillars, keywords and the first batch of ideas, each with evidence | qwen3.7-plus (site profile on qwen3.8-max; page extraction on qwen3.8-flash) | Extraction is high-volume and mechanical; the site profile is the one judgment everything downstream rests on; keywords and ideas are workhorse reasoning over a cached profile |
| — | CMS agent (product surface) | Owns post state, resolves template slots, runs the auto-gate under autopost, the only component with repo write access (opens and merges MRs) | qwen3.7-plus (configurable in the CMS) | Not a harness agent and not in the count of 11. It belongs to the Agentic CMS product, calls the harness agents, and consumes their artifacts |

Cost logic: Qwen3.8-Flash for high-frequency mechanical work, Qwen3.7-Plus as the workhorse for everything requiring writing or judgment, Qwen3.8-Max reserved for the rare runs that set or change strategy. Verify current model names and pricing at https://docs.claude.com before wiring API calls.

Why the CMS agent sits outside the count: the harness is portable (it runs in Cowork, n8n, Make, or a custom loop with no CMS at all). The CMS agent is the product surface's native agent. It holds the post state machine, the repo credentials, and the merge decision. Keeping it outside the harness keeps repo writes in exactly one place.

## The operating loop

```
                          ┌────────────────────────────┐
                          │   ORCHESTRATOR (Qwen3.8-Flash)      │
                          │   schedule + preconditions  │
                          └──────────┬─────────────────┘
        ┌────────────┬──────────────┼───────────────┬──────────────┐
        ▼            ▼              ▼               ▼              ▼
   WEEKLY        PER POST        WEEKLY         MONTHLY        MONTHLY
   keyword       blog-writing    technical      content        link
   swarm         │ image sheet   monitor        refresh        prospector
        │        ▼                  │               │              │
        │     visual-asset          │               │              │
        │     │ assets+provenance   │               │              │
        │     ▼                     │               │              │
        │     on-page gate          │               │              │
        │     │                     │               │              │
        │     ▼                     │               │              │
        │  ┌──────────────────────┐ │               │              │
        │  │ CMS AGENT (product)   │ │               │              │
        │  │ autopost on: auto-gate│ │               │              │
        │  │ → MR → merge on green │ │               │              │
        │  │ CI → live             │ │               │              │
        │  │ autopost off / hard   │ │               │              │
        │  │ block: In review ─────┼─┼──► HUMAN      │              │
        │  └──────────┬───────────┘ │               │              │
        │             │             │               │              │
        └─────────────┴──────┬──────┴───────────────┴──────────────┘
                             ▼
                  ┌──────────────────┐     demands & deadlines
                  │  SEO QA AGENT     │ ──────────────────────►  HUMAN
                  │  weekly light /   │ ◄──────────────────────  SPECIALIST
                  │  bi-weekly full   │     idea approvals, sends,
                  └────────┬─────────┘     prunes, spend, inputs
                           ▼  QA scorecard + ledger
                  ┌──────────────────┐
                  │  VIZ REPORT AGENT │ ──► Bi-weekly HTML report
                  │  (bi-weekly)      │     + key actions + pivot calls
                  └──────────────────┘
```

Ideas enter the per-post lane only after a human approves them. From there, with autopost on, nothing waits on a person unless a guardrail stops it.

## Data contracts (what each agent must hand to the next)

Every agent writes its output to a dated file in a shared reports folder. The orchestrator passes the newest matching file to each consumer.

| Producer | Artifact | Consumers |
|---|---|---|
| seo-action-plan | 5-tab plan HTML + keyword pillar CSV | swarm, blog agent, QA (milestones), viz (targets) |
| keyword-research-swarm | pipeline CSV (fixed columns) + top-10 md | blog agent (after a human approves the idea), QA, viz |
| blog-writing-agent | post file + image production sheet + [VERIFY] list | visual-asset-agent (sheet), on-page gate, CMS agent, QA |
| visual-asset-agent | selected assets (WebP/AVIF + breakpoint variants) + SVG diagrams + provenance log (JSON) + hold list | CMS agent (renders into the template, writes to repo in the post's MR), on-page gate (alt text, filenames), QA, human (held slots only) |
| site-discovery-agent | site profile + brand pack draft + pillar keywords (CSV) + content map + first batch of ideas, all with evidence URLs | keyword-research-swarm (pillar keywords), seo-action-plan (profile), content-refresh-agent (content map), blog-writing-agent (brand pack, internal links), human (approve ideas, accept the profile on regulated sites) |
| on-page-seo-optimizer | scorecard md per post | CMS agent (auto-gate input), QA, viz |
| CMS agent (product surface) | MR per post, merge result, agent-edit log, autopost reasons | QA (reality check), viz, human (held posts only) |
| technical-seo-monitor | dated digest md with severity counts | QA, viz |
| content-refresh-agent | refresh drafts + prune sign-off list + delta section | human (prunes), CMS agent (refresh drafts), QA, viz |
| link-building-prospector | prospect CSV + drafts folder + human action list | human, QA, viz |
| seo-qa-agent | QA scorecard + human ledger (JSON + md) | viz, human, orchestrator |
| visualization-report-agent | bi-weekly report HTML + pivot flags | human, and orchestrator (a triggered pivot flag queues a seo-action-plan review run) |

The image path, end to end: blog-writing-agent's image production sheet → visual-asset-agent → assets + provenance → CMS agent renders them into the site's template and commits them with the post.

## Schedule (default; adjust per client capacity)

- Monday: keyword-research-swarm
- Per publish day: blog-writing-agent, then visual-asset-agent (per post, after the draft), then on-page-seo-optimizer, then the CMS agent's auto-gate and MR
- Friday: technical-seo-monitor, then seo-qa-agent light run
- 1st of month: content-refresh-agent, link-building-prospector
- Every second Friday: seo-qa-agent full run, then visualization-report-agent
- Quarterly or on triggered pivot flag: seo-action-plan review

## Escalation rules

1. Any agent hitting missing mandatory inputs stops and logs the gap; the orchestrator adds it to the QA human ledger rather than guessing.
2. QA items stale beyond 7 days escalate to the top of the next report's human ledger; beyond 14 days they appear in the report's blockers section with impact stated.
3. Two consecutive bi-weekly reports showing a metric below its pivot threshold auto-queues the action plan review.
4. Publishing is automatic by default: when a site's autopost is on, a post that clears the gate is merged on green CI and goes live with no human click. The gate is never bypassed, only automated. An open [VERIFY] marker is sourced or rewritten out first; a hard block the agents cannot clear (template cannot render, image slot held, budget cap, provider failure) holds the post in In review with a ledger item, so autopost degrades to human review and never ships around a block. When a site turns autopost off, every post terminates at a human In review step. Everything else still always terminates at a human: approving ideas, approving the plan, sending outreach, deleting or pruning pages, and spending above the cap.

## Changes from v0.1

- Roster grows from 10 to 11 harness agents: #10 visual-asset-agent added (generate, diagram, or source licensed images per slot, with provenance). The CMS agent from the Agentic CMS PRD is listed explicitly as the product surface's native agent, outside the harness count.
- The human image step is gone from the default path. v0.1 had blog-writing-agent end on a blocking `image_upload_and_quality_gate`; v0.2 hands the production sheet to the visual-asset-agent. Human upload remains for human-only slots and held slots.
- Human gates changed (founder direction C10/C11, 27 Sep 2026): `publish` replaced by `approve_idea`; `spend_money` narrowed to `spend_over_cap` (runs inside the cap proceed after their estimate). New `publishing` block: autopost on by default, auto-merge on green CI, human review when autopost is off.
- Escalation rule 4 rewritten to match: automatic publishing with guardrails; ideas, the plan, outreach sends, deletions/prunes, and spend above the cap still terminate at a human.
- Operating loop, data contracts, and schedule updated for the visual-asset-agent and the CMS agent.
- Model IDs updated to the current family: claude-opus-4-8 → claude-opus-5-5, claude-sonnet-4-6 → claude-sonnet-5, claude-haiku-4-5 unchanged
- 2026-11-12: provider switched from Anthropic to Qwen (Alibaba Cloud Model Studio): claude-haiku-4-5 → qwen3.8-flash, claude-sonnet-5 → qwen3.7-plus, claude-opus-5-5 → qwen3.8-max. Verify at https://docs.claude.com before deploying.
- seo-qa-agent gained a contract line for the visual-asset-agent; blog-writing-agent carries "CMS v0.2 change" notes. All other skills are verbatim from v0.1.
