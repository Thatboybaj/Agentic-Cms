---
name: cms-backend-07-search-console-and-kas
description: >
  Google Search Console OAuth per site, daily Search Analytics import into positionHistory, weekly rollups
  (trafficWeekly, positionTrend, decay), KAS recalculation post-merge and weekly with computeKas, and the SEO /
  trajectory / reports reads — with explicit data gaps, never zeros.
---

# Handoff 07: Search Console and KAS

| | |
|---|---|
| Size | **M** |
| Depends on | 01, 02 (`afterMerge` schedules `kas.recalc`), 04 (secrets crypto) |
| Unblocks | 03's QA/report/refresh agents get real data; 09 |

## Goal

Each site connects Search Console once (OAuth, property picked); the CMS imports positions/impressions/clicks daily,
rolls them up weekly, and recalculates the Keyword Attribution Score 24 h after every merge and weekly, so `/seo`
and the plan's trajectory strip show real, auditable numbers or an explicit `DataGap`.

## Why

PRD Module 6 + "KAS coverage: every live post scored within 24 h" + "Search Console is the required connection".
`computeKas`, `concentration`, `pillarDistribution`, `gapToProjection` already exist in `logic.ts`; they need data.

## Inputs (read first)

- PRD Module 6, the KAS section, "Honest limit" (sampling), open question 4 (CTR curve)
- `apps/cms/src/lib/logic.ts`: `ctr`, `DEFAULT_CTR_CURVE`, `CTR_TAIL`, `kasRawWeight`, `computeKas`, `applyKas`, `concentration`, `FRAGILE_THRESHOLD`, `pillarDistribution`, `orphanWeight`, `claimedButUnearned`, `postKas`, `gapToProjection`, `INTENT_VALUE`
- `apps/web/convex/googleWorkspace.ts` (`beginConnection`, `oauthCallback`, `refreshConnection`, `revokeConnection`), `googleWorkspaceInternal.ts` (`createOAuthState`, `consumeOAuthState`, `storeConnection`, `markConnectionState`), `lib/googleOAuth.ts` (PKCE helpers, `randomUrlSafe`, `sha256UrlSafe`, `hasRequiredGoogleScopes`)
- [../api-map.md](../api-map.md) §8 `connectSearchConsole`, §12 crons; [../schema.md](../schema.md) plan & SEO tables
- Google docs: Search Console API (Search Analytics query, sites list, quotas, data freshness), OAuth for web server apps. **Verify scopes, quotas and lag.**

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/gsc.ts` + `gscNode.ts` | `beginOAuth`, `listProperties`, `setProperty`, `disconnect`, `importSite`, `importAll`, `rollupWeekly`, `refreshExpiring` |
| `apps/cms/convex/gscInternal.ts` | port of `googleWorkspaceInternal` state/store/mark functions for `oauthStates`/`oauthConnections` |
| `http.ts` | `/oauth/google/callback` |
| `apps/cms/convex/kas.ts` | `recalc(siteId, trigger, mrId?, postId?)`, `history` |
| `apps/cms/convex/seo.ts`, `reports.ts` | read queries (api-map §2) |
| `apps/cms/convex/csvImport.ts` | Ahrefs/Semrush CSV → keyword difficulty/evidence (`rankSource`) |

## Steps

1. **OAuth.** Port the PKCE flow: `gsc.beginOAuth(siteId, redirectTo)` (`searchConsole.connect`) → state row → Google consent (read-only Search Console scope, `access_type=offline`, `prompt=consent`, verify) → callback consumes state once, exchanges code, checks scopes, stores tokens sealed in `secrets`, `oauthConnections.connected`, `sites.searchConsole = "connected"`, audit "connected Search Console". `safePrototypeRedirect`-style redirect allowlist (`/s/<slug>/settings…` only).
2. **Property.** `listProperties` → the developer picks the property matching `site.domain` (domain property preferred); store `propertyUri`.
3. **Daily import** (`gsc` pool, 1 at a time per Google project quota): for each connected site, query Search Analytics by `query` + `page` + `date` for days after `lastImportedDate` up to the provider's freshness lag; paginate; map queries to `keywords` by `termNormalized` (unknown queries with meaningful impressions → candidates for the swarm, not auto-added); upsert `positionHistory` (source `gsc`); update `keywords.impressions/position/rankingUrl/rankingPages` (28-day window); idempotent per `(keywordId, date, source)`.
4. **Weekly rollup** (Monday): `trafficWeekly` per ISO week (`sessions`: GSC has clicks, not sessions; label honestly: use clicks or connect analytics later; **decision for the lead**, keep `null` = gap rather than inventing), `projected` from the plan's target curve, `positionTrend` last 8 weeks, `decaying` when position worsens beyond a threshold for N weeks (threshold in config, from the content-refresh skill).
5. **KAS recalc.** Load site keywords (positions + impressions), `computeKas(keywords, site.ctrCurve)` → shares; `concentration()`; `pillarDistribution()`; `claimedButUnearned()`; write a `kasSnapshots` row (`trigger`, label like the store's "Recalculated 24 Sep · after 1 merge", `mrId`/`postId`), update caches on `keywords` (`kasShare`, `kasDelta` vs previous snapshot) and `pillars`, `posts.kasContribution` via `postKas`. Triggers: `afterMerge` +24 h, weekly schedule `kas-recalc`, manual `runNow("kas-recalc")`. Deterministic, no model, no spend.
6. **Refresh.** Hourly `refreshExpiring`; failures → `reconnect_required`, `sites.searchConsole = "expired"`, notify developers + admins.
7. **Indexing after merge (D17).** Only implement if a supported API exists for this URL type; otherwise record "submitted via sitemap" only if the repo's sitemap is in `indexFiles`. Don't claim indexing submission in the UI until verified.
8. **Data gaps.** Any missing week/position stays `null`; UI renders `DataGap` (00-decisions non-negotiable 4).

## Interfaces it must honour

- `IKasSnapshot`, `IWeekPoint`, `IKeyword` shapes via the adapter; `computeKas` et al. unchanged.
- `afterMerge` → `kas.recalc` scheduling signature from 02.

## Test plan

| Kind | Cases |
|---|---|
| Unit (reuse) | `logic.test.ts` KAS tests run against server inputs |
| Golden | fixture GSC responses for Lumen keywords → `kasSnapshots.shares` equal `computeKas` on the same inputs; concentration > `FRAGILE_THRESHOLD` flags fragile; a pillar under `UNEARNED_THRESHOLD` with planned posts → claimed-but-unearned |
| Import | re-running the same day → no duplicate rows; GSC 403 / revoked → `reconnect_required`, no zeros written; pagination across > 1 page |
| OAuth | state reuse refused; expired state refused; missing scope → `missing_scope`; redirect outside allowlist refused |
| Isolation | site A's tokens never used for site B (secret lookup by `siteId`); `seo.overview` for a foreign site refused |
| E2E (staging) | connect a real property; import; `/seo` shows real trajectory; merge a post → snapshot 24 h later (use a shortened delay env on staging) |

## Done when

- [ ] Connect → import → rollup → KAS on staging with a real property
- [ ] Every live post has a KAS contribution within 24 h of merge
- [ ] No zero-filled gaps anywhere

## Forbidden moves

- Writing `0` for missing data.
- Treating GSC clicks as sessions without labelling them.
- Storing Google tokens outside `secrets`, or logging them.

## Risks

| Risk | Mitigation |
|---|---|
| GSC sampling/anonymised queries (PRD "Honest limit") | show coverage % on `/seo`; KAS on what's visible |
| Quotas with many sites | `gsc` pool parallelism 1, backoff, spread imports across the night |
| CTR curve accuracy (PRD Q4) | `ctrCurve` per site override; fitted curves later |

## Port vs rewrite

| Prototype / reference | Action |
|---|---|
| `apps/web/convex/googleWorkspace*.ts`, `lib/googleOAuth.ts` | **port** (scopes and table names change) |
| `logic.ts` KAS functions | **reuse unchanged** |
| `store.tsx` `connectSearchConsole`, `kas-recalc` run simulation | **rewrite** |
