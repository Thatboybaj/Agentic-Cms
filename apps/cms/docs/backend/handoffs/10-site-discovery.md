# Handoff 10 · Site discovery agent

Builds `prd-site-discovery.md` (12 Nov 2026) in full. Decisions taken for this build:

| PRD item | Decision |
|---|---|
| Crawl provider (F7) | **Firecrawl** (map, batch scrape, scrape, search). No `@studio/web-tools` package exists, so a small client lives in `convex/discovery/firecrawl.ts`. Needs `FIRECRAWL_API_KEY` on each Convex deployment. Browserbase fallback is not built: Firecrawl renders JavaScript itself, so JS-only pages are covered without a second provider. |
| Models (SD4) | **Keep the harness tiers as they are** (`claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5-5`, from `MODELS`). Moving generations stays a separate decision with an eval run. |
| Long text storage (SD7) | Convex file storage instead of R2 (the CMS has no R2), 90-day expiry by a daily cron; extracts kept. |
| Analytics events | No PostHog in the repo yet: a `track()` helper sends to PostHog only when `POSTHOG_KEY` is set, and always writes the audit log. |
| Golden set (§13) | The eval harness, checks and judge are built; the 10 expected-pillar lists are agency-written data, so the fixture file ships with baynor.qa filled in and the rest as stubs to complete. |

Everything else follows the PRD as written: SD1 start at site add, SD2 approve-and-queue, SD3 brand pack acceptance required for regulated sites only, SD5 batch size from `cadenceTarget`, SD6 competitor check on by default.

## Phases

Each phase ends green (typecheck, `check-cms-convex-auth`, tests) and is pushed.

### A · Harness, types, schema, permissions
- `packages/seo-harness`: agent #11 `site-discovery-agent` (`AGENTS`, `TAgentId`, `harness-config.yaml` schedules `on_site_add` + `on_demand`, outputs `site_profile`, `pillar_keywords_csv`, `brand_pack_draft`, `content_map`), `skills/site-discovery-agent/SKILL.md` (crawl-only data, untrusted-content rules, pillar rules borrowed from `seo-action-plan`, volume tiers never numbers), regenerate `skills.generated.ts`, extend the harness test.
- Types: `TIdeaSource += "site-discovery"`, `TRunKind += "site-discovery"`, permissions `discovery.run` (specialist, admin) and `discovery.configure` (admin) with lock reasons.
- Schema: `crawledPages`, `siteProfiles` (versioned), `keywords.evidence/volumeSource/existingPageId`, `posts.discoveryEvidence/internalLinkTargets/angle`, `sites.discovery` settings, run progress fields (`stage`, `pagesCrawled`, `pagesSkipped`).
- `logic.ts`: `publishReadiness(site, repo, manifest)` → `{ ready, missing[] }`, discovery estimate in `RUN_META`, batch-size rule; unit tests.

### B · Crawl (Firecrawl)
- Seed: `robots.txt` (disallow rules, crawl-delay), every listed sitemap, home page; same registrable domain (subdomains opt-in); default 150 pages, depth 3, 1 request/s, exclude defaults (`/cart`, `/account`, query strings), admin limit up to 1,000.
- Fetch via Firecrawl batch scrape in pages-of-N, main content only; store per page the F8 fields; strip emails, phone numbers and form contents before storage and before any prompt; content hash for incremental re-runs (unchanged pages skip extraction); skipped pages recorded with a reason.
- Spend: crawl credits estimated up front and checked against the text cap like model spend.

### C · Understand → keywords → ideas
- Extraction (F10), fast tier, `effort: low`, structured output; **Message Batches API** when more than 40 pages, otherwise parallel calls; results polled by a scheduled action so the workflow resumes.
- Site profile + brand pack draft (F11–F12), strongest tier, `effort: high`; every field cites crawled URLs; regulated category drives required disclaimers.
- Pillars (3–5) and keywords (8–15 per pillar) (F13–F14), writing tier; GSC merge when connected (90 days, real impressions/positions, striking distance 8–20 = quick win) (F15); imported Ahrefs/Semrush CSV volumes when present; otherwise tier labelled "estimated".
- Cannibalisation (F16): keywords already targeted by a crawled page attach to it (refresh candidate) instead of becoming ideas.
- Competitor check (F17): Firecrawl search for the top 2 keywords per pillar, capped, on by default.
- Ideas (F18–F21): batch = four weeks at `cadenceTarget`; at least one pillar page per active pillar; a third quick wins when GSC exists; working title, keywords, intent, pillar, type, week, 2–4 internal link targets (must be crawled URLs), angle, evidence; `strongModel` on pillar and money pages; near-duplicate rejection against existing posts and pages; posts enter as `idea` with `source: "site-discovery"`.
- Guardrails (§7.4): page text only as delimited user-turn data; no tools on extraction; every evidence URL and link target validated against `crawledPages`.
- Workflow `discovery` (Workflow + Workpool): seed → crawl → extract → profile → keywords → ideas → finish; one persisting mutation per step so a crash resumes; one run per site at a time (F4); `cappedInference` on every call; prompt caching on the skill + profile prefix.

### D · Publish-readiness gate (F22–F25)
- `startGeneration` refuses while the site isn't ready: the approved post stays Briefed with hold `waiting-for-setup` and "Waiting for setup: <missing>" (no model, image or crawl spend).
- On gate pass (repo connected, paths confirmed, template confirmed) → waiting Briefed posts start in plan order, throttled by `cadenceTarget`, cap-checked like a publish slot.
- SD3: a regulated site's first draft also waits for the profile to be accepted.

### E · Screens
- Onboarding: discovery progress card after the Site step; final **Review discovery** step (profile, brand pack, pillars, idea count; accept/edit); robots-blocked or tiny site → the seven-question interview from `seo-action-plan`.
- Plan: discovery-progress empty state, readiness banner (link to the missing step; action gated to developer/admin), **Site discovery** chip, amber "Waiting for setup" chip.
- Idea detail: evidence list, angle, internal link targets.
- `/s/[site]/discovery` report (F26) with Re-run, Edit profile, Generate more ideas, Send refresh candidates (F27); rail entry under Plan.
- Runs: `Site discovery` kind with stage, pages and cost. Settings: Discovery section (F6 knobs, discover on add, competitor check, batch size). Portfolio and Inbox: discovery ideas count toward "needs me"; onboarding sites show progress.
- Demo mode: the same types, one seeded discovery result and a simulated run in the prototype store.

### F · Evaluation and first live run
- `scripts/discovery-eval`: golden-set fixtures, graded checks (pillar overlap, no covered topics, evidence validity, disclaimer correctness, keyword diversity), LLM judge with a written rubric; results stored with the skill hash.
- First live run on baynor.qa (**spends real money, estimate shown first, run only with approval**).

## Setup the user does
- Firecrawl account and API key → Convex dev and prod: `FIRECRAWL_API_KEY`.
- Optional: `POSTHOG_KEY` for events.

## Not changed
The CMS agent stays the only repo writer; discovery never touches the repo. Autopost rules are unchanged: ideas always need approval (C10).
