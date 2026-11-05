# Grandeur SEO Agent Suite — Operating Manual

Ten skills that together run the content marketing engine for any site. Install each skill, then wire them into a recurring schedule. `HARNESS.md` and `harness-config.yaml` describe how the orchestrator, QA agent, and reporting agent tie them into one loop.

> CMS v0.2 change: packaged as `@studio/seo-harness` in the Utopia OS monorepo for the Agentic CMS (`apps/cms`). Skills live at `skills/<name>/SKILL.md` (extracted from the original `.skill` archives). The typed roster for UI use is exported from `src/index.ts`. The visual-asset-agent is new, and under autopost (on by default) the per-post quality gate and image production are no longer human tasks.

## The system map

```
seo-action-plan  ──────────────►  THE STRATEGY (run once per brand, revisit quarterly)
      │  keyword pillars                                         [HUMAN approves the plan]
      ▼
keyword-research-swarm ────────►  WEEKLY: refill pipeline (25–30 keywords)
      │  ideas                                                   [HUMAN approves ideas]
      ▼
blog-writing-agent ────────────►  PER POST: draft + image production sheet
      │  image production sheet
      ▼
visual-asset-agent ────────────►  PER POST: generate / diagram / source licensed images
      │  assets + provenance      (human upload only for human-only or held slots)
      ▼
on-page-seo-optimizer ─────────►  PER POST: pre-publish audit gate
      │  scorecard
      ▼
CMS agent (product surface) ───►  autopost on: auto-gate → MR → merge on green CI → live
                                  autopost off or hard block: [HUMAN In review]
technical-seo-monitor ─────────►  WEEKLY/MONTHLY: site health digest + deltas
content-refresh-agent ─────────►  MONTHLY: page-2 targeting, refresh drafts, prune list [HUMAN signs prunes]
link-building-prospector ──────►  MONTHLY: prospect pipeline + outreach drafts [HUMAN sends]
```

## Recommended recurring schedule

| Cadence | Run | Output landing in your tracker |
|---|---|---|
| Once per brand | seo-action-plan | The 5-tab HTML plan |
| Monday, weekly | keyword-research-swarm | Pipeline CSV + top 10 |
| Per post (2–6x/wk) | blog-writing-agent → visual-asset-agent → on-page-seo-optimizer | Publish-ready post + assets + provenance |
| Friday, weekly | technical-seo-monitor | Health digest + delta |
| 1st of month | content-refresh-agent | Refresh drafts + prune sign-off list |
| 1st of month | link-building-prospector | Prospect pipeline + drafts |

Feed each scheduled run its predecessor's report file so delta reporting works.

## Data the agents want connected (in order of impact)

1. Google Search Console exports (transforms refresh targeting and technical checks)
2. Your keyword tracker (Airtable/Notion CSV) so runs dedupe against live content
3. Brand document / BrandPack (write once, reuse in every blog-writing-agent and visual-asset-agent run)
4. Image connections: an image MCP server (Higgsfield preferred), an image API (OpenAI for text-in-image), and a licensed web image source (Openverse, Wikimedia Commons, or your stock API)
5. Ahrefs or Semrush exports, if subscribed (real volumes and backlink data)

## The rule that holds the system together

Agents prepare and, with autopost on, publish through guarded automation; humans approve ideas, the plan, relationships, deletions, sends, and spend above the cap. See HUMAN-TASKS.md for the full division of labor.

## Package contents

| Path | What |
|---|---|
| `HARNESS.md` | Roster, operating loop, data contracts, schedule, escalation rules |
| `harness-config.yaml` | Machine-readable config (v0.2.0) |
| `skills/<name>/SKILL.md` | The ten skills (nine verbatim or near-verbatim from v0.1, plus visual-asset-agent) |
| `templates/biweekly-report-template.html` | Draft bi-weekly report template (verbatim) |
| `src/index.ts` | Typed, pure-data export of the harness for UI use |
