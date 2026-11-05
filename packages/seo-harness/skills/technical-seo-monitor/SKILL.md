---
name: technical-seo-monitor
description: Run a technical SEO health check on a website — indexability, broken links, sitemap/robots hygiene, HTTPS, mobile readiness, Core Web Vitals signals, schema markup validation, and metadata integrity — and produce a prioritized fix digest. Use this skill whenever the user asks for a technical SEO audit, site health check, broken link scan, "why isn't my page indexing", Core Web Vitals check, or schema validation. Designed to run on a recurring schedule (weekly or monthly) and report deltas against the previous run.
---

# Technical SEO Monitor

A recurring site health agent. Each run produces one digest report with a severity-ranked fix list; scheduled runs additionally report what changed since last time.

## Mandatory inputs

1. **Site URL** (root domain)
2. **Scope** — full crawl budget for small sites (≤200 pages), or a priority page list for larger ones. If unspecified: homepage + sitemap-listed pages up to 50
3. **Run mode** — one-off audit, or scheduled (if scheduled, request or locate the previous run's report file for delta comparison)

Optional: Search Console access/exports (dramatically improves indexing checks), staging URL exclusions.

## Checks, in execution order

Work with what's reachable: fetch pages, parse HTML, follow links. Where a check needs data you can't access (e.g. field CWV data without an API), run the closest proxy check and label it as a proxy.

### A. Discoverability
- `robots.txt` exists, doesn't block critical paths, references the sitemap
- XML sitemap: reachable, valid, no 404/redirected URLs inside it, matches canonical URLs
- Meta robots / `noindex` audit on priority pages — flag any unexpected noindex
- Canonical tags present and self-consistent (no canonical chains or cross-domain surprises)

### B. Response health
- Crawl the scope: log every non-200 (broken internal links, redirect chains ≥2 hops, soft-404 patterns)
- Broken **external** links on priority pages
- HTTPS everywhere: no mixed content, HTTP→HTTPS redirect works, no certificate warnings

### C. Rendering and speed proxies
- Page weight per priority page: total HTML size, count and size of images, scripts, fonts
- Flag: uncompressed/oversized images (>300KB), missing width/height attributes (layout shift risk), render-blocking script patterns, missing lazy-loading on below-fold images
- Mobile readiness: viewport meta present, tap-target/font-size red flags in CSS, no horizontal overflow patterns
- Label all of section C as proxy signals and recommend a PageSpeed Insights run for field data

### D. Structured data
- Detect JSON-LD blocks on priority pages; validate required properties for the types found (Article, FAQPage, HowTo, Organization, BreadcrumbList, Product)
- Flag pages that qualify for schema but have none (blog posts without Article/FAQ schema is the most common miss)

### E. Metadata integrity
- Duplicate or missing title tags and meta descriptions across the crawl
- Missing OG tags on shareable content
- Multiple H1s or missing H1

## Output — the digest

```
# Technical SEO Digest — [site] — [date]
Health score: [X/100, computed: start at 100, −8 per critical, −3 per warning, −1 per notice]

## Since last run                    ← scheduled mode only
Fixed: … · New issues: … · Unchanged: …

## Critical (blocks indexing or trust)     ← noindex surprises, sitemap 404s, HTTPS failures
## Warnings (costs rankings)               ← broken links, missing schema, duplicate titles, heavy pages
## Notices (polish)                        ← OG gaps, minor redirect chains

Each item: affected URL(s) → exact fix → who fixes it [agent-fixable / developer / hosting-credentials-needed]
```

Save the digest as a dated file so the next scheduled run can diff against it.

## Judgment rules

- Never claim a check you couldn't actually perform — proxies are labeled proxies
- The "who fixes it" tag is mandatory on every item; anything touching DNS, hosting, SSL, or paid infrastructure is never marked agent-fixable
- Cap the digest at the 20 highest-impact items; park the long tail in an appendix section so the report stays actionable
