---
name: visualization-report-agent
description: Generate the bi-weekly SEO progress report as a data-driven visual HTML document, with a health score, KPI deltas, nine purpose-chosen charts (traffic line, keyword slope, refresh dumbbell, production bullets, pillar stacked columns, pipeline donut, search funnel, position heatmap, movers table), the human accountability ledger, key actions for the next two weeks, and pivot trigger recommendations. Use this skill whenever the user asks for an SEO report, progress report, bi-weekly report, SEO dashboard, "how is SEO going", visual summary of SEO performance, or when a harness schedule fires the bi-weekly reporting run.
---

# Visualization Report Agent

Turns the period's raw artifacts into one decision-ready visual report. The layout, chart logic, and design are locked in the bound template; each run only computes and swaps the data.

## Mandatory inputs

1. **The bound template** at `assets/report-template.html` (until approved, the working file is `assets/report-template-DRAFT.html`)
2. **QA scorecard and human ledger** from seo-qa-agent's latest full run (this report never invents ledger items; it renders QA's)
3. **Performance data**: GSC export covering at least the current and prior period, ideally 8 weeks
4. **Agent artifacts** from the period: keyword pipeline CSV, on-page scorecards, technical digest, refresh cycle report, prospecting pipeline
5. **The action plan** (for targets, phase projections, and pivot thresholds)

If a source is missing, render its section with an explicit "DATA MISSING: [source]" state and add the gap to the report's actions. Never fabricate numbers to fill a chart.

## Chart-to-question mapping (why each visualization was chosen)

Every chart answers one reporting question; keep this mapping fixed:

| Question | Chart | Taxonomy family |
|---|---|---|
| Is traffic compounding? | Line chart, 8 weeks, sessions + impressions | Temporal |
| What moved in rankings this period? | Slope chart, start vs end positions | Comparison |
| Did the refresh cycle pay off? | Dumbbell, before vs after positions | Comparison |
| Are we executing the plan? | Bullet charts, actual vs target with range | Comparison |
| What are we publishing, and where? | Stacked columns by pillar per week | Part-to-whole |
| Is the pipeline healthy? | Donut of pipeline statuses | Part-to-whole |
| Does traffic become business? | Funnel: impressions, clicks, leads | Part-to-whole |
| Which keywords trend which way over time? | Heatmap, keywords by week, position-colored | Correlation over time |
| What single wins/losses matter most? | Top movers table with drivers | Table |

## Build procedure

1. **Compute the numbers.** Aggregate GSC into weekly buckets; compute period deltas for the four KPIs (sessions, impressions, average position with inverted improvement logic, AI citations if tracked); pull actual vs target from the plan cadence; derive movers, refresh deltas, and pipeline counts from artifacts. Every number in the report must be traceable to a source file; keep a private computation note per figure in case the human asks.
2. **Score health (0 to 100).** Weighted: traffic vs plan trajectory 30, ranking direction 25, execution vs targets 25, QA pass rate 20. State the score's driver in the verdict line.
3. **Set the verdict**: `on-track`, `adjust`, or `pivot`, matching the pivot table's worst status (any triggered signal caps the verdict at `adjust`; two consecutive triggered periods force `pivot`).
4. **Write the narrative blocks.** Key actions: 3 to 5, each naming the action, the reason with a number, and its owner. Pivot table: evaluate every threshold from the plan against current data; recommendations must be concrete (change cadence, reallocate pillar effort, revise a target), not "monitor closely". When a pivot trigger fires, escalate the pivot analysis to the stronger reasoning model per the harness config before finalizing recommendations.
5. **Bind the data.** Copy the template, replace only the `REPORT_DATA` constant, remove the sample banner, save as `[brand]-seo-report-[period-end-date].html`, and deliver it alongside a 5-line text summary for chat or Slack.
6. **Flag downstream.** If verdict is `pivot`, or a trigger fired for the second consecutive report, emit the pivot flag artifact the orchestrator uses to queue an action plan review.

## Judgment rules

- Charts render what happened; the narrative says what to do about it. Neither editorializes the data itself: a bad period renders as a bad period
- Deltas always compare like periods; call out seasonality or tracking changes rather than letting them masquerade as wins or losses
- The human ledger section is rendered verbatim from QA, overdue items first: this report is where accountability becomes visible to everyone
- Keep every claim in the summary traceable to a chart in the report
