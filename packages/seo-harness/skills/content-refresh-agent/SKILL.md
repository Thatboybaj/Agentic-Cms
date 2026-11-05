---
name: content-refresh-agent
description: Run the monthly content maintenance cycle — identify decaying and page-2 posts worth updating, draft the refreshed versions, flag dead-weight pages for human-approved pruning, and keep freshness signals compounding. Use this skill whenever the user asks to update old content, refresh posts, find content decay, prune or delete underperforming pages, "which posts should we update", or mentions the monthly update cycle from an SEO action plan. Designed for a recurring monthly schedule.
---

# Content Refresh Agent

The compounding-returns agent: existing posts that almost rank are the cheapest traffic available. Each run finds them, refreshes them, and proposes (never executes) pruning.

## Mandatory inputs

1. **Site URL** or a content inventory (sitemap works as a fallback)
2. **Performance data** — GSC export (page/query/position/impressions) is ideal; without it, work from what's fetchable and say the targeting will be less precise
3. **Refresh capacity** — how many updates this cycle (default 3–5)

## The cycle

### 1. Target selection
Rank update candidates by leverage, highest first:
- **Page-2 posts** (positions 11–20 in GSC): highest leverage — small improvements often jump to page 1
- **Decaying winners**: posts whose impressions/position declined over 2+ months
- **Stale-dated content**: titles or content referencing past years, outdated stats, dead examples
- **High-impressions, low-CTR**: ranking fine but the title/meta isn't earning the click — these need only a title/meta rewrite, the cheapest fix of all

Output a candidate table with the evidence per post, and pick the top N per capacity.

### 2. Refresh drafting (per selected post)
- Fetch the live post; identify what the current top 3 results for its main query now cover that it doesn't
- Draft the update: deepen thin sections, add 2+ new FAQ entries, refresh every statistic (source or `[VERIFY]` marker — never silently invent newer numbers), update the year references, add internal links to content published since
- Preserve the URL and any headings that hold rankings; note any heading you changed and why
- Run the result against the on-page-seo-optimizer checklist if available
- Deliver as a ready-to-publish file plus a change log (publishing an update triggers recrawl; the change log tells the human what to review in their 10 minutes)

### 3. Dead-weight review (propose only)
Flag prune candidates: near-zero impressions over 6+ months, no backlinks detectable, off-strategy topics, thin duplicates. For each output: URL, evidence, and a recommended action — **update, consolidate (301 into a stronger post), or delete**. Present as a sign-off list. Never treat low traffic alone as proof a page is worthless; note where a page might serve sales, clients, or partnerships beyond search, and let the human decide. No deletions, redirects, or CMS changes are ever executed by this agent.

### 4. Cycle report
```
# Content Refresh — [site] — [month]
Updated this cycle: [posts + one-line change summary each]
Quick wins shipped: [title/meta-only rewrites]
Prune sign-off list: [awaiting human decision]
Next cycle preview: [candidates that just missed the cut]
Delta since last cycle: [rank movements of previously refreshed posts — the proof the cycle works]
```

## Judgment rules

- An update must add real substance; token edits to game freshness get discounted by search engines and waste the recrawl
- If a post's topic is beyond saving (the query intent shifted entirely), recommend consolidation instead of a refresh and identify the merge target
- Track your own results: the delta section is mandatory once two cycles of history exist
