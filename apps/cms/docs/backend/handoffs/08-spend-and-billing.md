---
name: cms-backend-08-spend-and-billing
description: >
  Per-site text/image spend caps on an Effect-fenced site ledger (spendEntries), Autumn credits as the
  commercial meter with daily reconcile, Polar subscription per site (or workspace, D3) gating site activity,
  80% alerts, and spend reporting from the runs table.
---

# Handoff 08: spend and billing

| | |
|---|---|
| Size | **M** |
| Depends on | 01; 03 builds the `WalletLedger` adapter (`spend.ts`) if it lands first, this handoff owns it afterwards |
| Unblocks | 09 (paid pilot) |

## Goal

No run can spend beyond its site's monthly text or image cap; every cent is in an idempotent ledger behind
`@studio/effect-critical`; Autumn meters the same usage commercially; a Polar subscription decides whether a site
may run agents at all; admins see spend per site, per run kind and per post.

## Why

PRD "Spend guardrails: hard monthly caps per client for text and image generation, a per-run estimate check, and an
alert at 80% of cap. Overruns block the run rather than silently billing." Framework: "Credit ledger truth for
money-critical paths lives behind `@studio/effect-critical`" (`docs/architecture.md`).

## Inputs (read first)

- [../README.md](../README.md) §11 Spend; [../api-map.md](../api-map.md) §8 (`setBudget`, `spend.*`), §11 (`/polar/webhook`, `/autumn/webhook`), §12 (`spend.reconcileAutumn`)
- `packages/effect-critical/src/{wallet.ts,meteredInference.ts}` + `cappedInference.ts` (from 03)
- `apps/web/convex/{wallet.ts,autumn.ts,subscriptions.ts,inference.ts}` (`debitInternal` idempotency, `autumn.check`/`track`, Polar webhook), `apps/web/convex/lib/walletHelpers.ts`
- `packages/billing/src/{index.ts,types.ts,providers/autumn.ts,providers/polar.ts}` (`getAutumnEntitlement`, `assertAutumnAccess`, `getPolarEntitlement`)
- `apps/cms/src/lib/logic.ts` (`checkCap`, `CAP_WARN_RATIO`, `budgetFor`, `estimateRun`)
- Autumn + Polar component docs (verify: entities, features, track/check signatures, webhook verification)

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/spend.ts` | `debit`, `credit`, `balance` (internal), `WalletLedger` adapter, `report` (admin query: month × budget × run kind × post) |
| `apps/cms/convex/convex.config.ts` | `app.use(autumn)`, `app.use(polar)` |
| `apps/cms/convex/autumn.ts` | `new Autumn(components.autumn, { identify })`, identify = workspace customer + site entity (D4) |
| `apps/cms/convex/billing.ts` | `siteEntitled(ctx, siteId)`, `beginCheckout(siteId, productId)` (`ws:billing.view` / admin), portal link |
| `http.ts` | `/polar/webhook` (component route or custom; verify), optional `/autumn/webhook` |
| crons | `spend.reconcileAutumn` daily |

## Steps

1. **Ledger.** `spend.debit/credit` internal mutations: idempotent on `idempotencyKey` (same rules as `apps/web/convex/wallet.ts` `debitInternal`: a replay with a different site/budget/type is an error); integer micro-USD; month = site-timezone calendar month; update `sites.spend` in the same mutation; at crossing `CAP_WARN_RATIO` notify admins once (`dedupeKey cap80:<siteId>:<month>:<budget>`). Month rollover: `sites.spend.month` mismatch resets the cache on first write of the month (ledger rows stay).
2. **Cap semantics.** `checkCap(site, kind, estimate)` is the gate; `cappedInference` (03) debits the estimate first, settles to actual. Concurrent runs can't overspend: the debit mutation re-checks `spent + amount <= cap` atomically and refuses (`CapError`) if not, even if the pre-check passed.
3. **Autumn.** Customer = workspace, entity = site (verify that Autumn entities support per-entity balances/limits; if not, customer = site). Before a run: `autumn.check(feature)` (pattern in `apps/web/convex/inference.ts`); after settle: `autumn.track(feature, value)`. Features `text_generation_usd`, `image_generation_usd` (D15 names). Autumn unavailable → fail closed for new runs (configurable for pilot: `AUTUMN_FAIL_OPEN=1` on staging only).
4. **Reconcile.** Daily: per site per budget, ledger month total vs Autumn usage; drift → Sentry event + admin notification; ledger wins.
5. **Polar.** Checkout with `metadata.siteId` (and `workspaceId`); webhook → `siteSubscriptions`; `siteEntitled()` = active/trialing (statuses verify). Unentitled site: queries still work (read-only), `schedules.tick` skips it, `generateNow`/`runNow`/`approveIdea` (autopost start) refuse with "This site's subscription isn't active". Decide D3 first; if the plan is per workspace, `siteEntitled` checks the workspace subscription + seat count instead.
6. **Customer-provided keys** (connections with their own provider billing): still estimated and capped (cap protects the client's own bill), ledger entry with provider cost `0` and reason `byo-key:<provider>` unless D15 adds a CMS fee.
7. **Reporting.** `spend.report` for admins: by month, budget, run kind, post; cost per shipped post (sum of runs with that `postId`) to feed the eval-first cost-per-outcome budget.
8. **UI wiring.** `setBudget` (admin only, PRD: specialist "cannot alter model budgets"), budgets panel reads `sites.budgetCaps` + `sites.spend`.

## Interfaces it must honour

- `WalletLedger` port (`getBalance`, `debit`, `credit` with `{ userId, amount, reason, idempotencyKey }`) from `@studio/effect-critical`: adapter maps `userId` ↔ `site:<siteId>:<budget>` and `amount` (credits) ↔ micro-USD.
- `checkCap` / `ICapCheck` from `logic.ts` for the UI copy ("Runs over the cap are refused").

## Test plan

| Kind | Cases |
|---|---|
| Unit | debit idempotent; replay with different payload refused; cap re-check under concurrency (two debits that each fit alone but not together → one refused); month rollover; 80% alert once |
| Golden | run estimated $0.40 with $0.30 left → `refused-over-cap`, audit "run refused over cap" with the store's detail format, notify; refund on provider failure restores `sites.spend` |
| Autumn | `check` denies → refused with "You've used all of your included…" style message; `track` failure doesn't lose the ledger row (logged, reconciled) |
| Polar | webhook signature invalid → refused; subscription canceled → site unentitled → schedules skip, manual runs refused, reads OK |
| Isolation | debit for site A can't touch site B rows; spend report scoped to admin's sites |

## Done when

- [ ] Every paid call debits the site ledger exactly once (or refunds)
- [ ] Caps hold under concurrent runs
- [ ] Autumn metered + reconciled; Polar gates site activity
- [ ] Admin spend report shows cost per shipped post

## Forbidden moves

- Floats in the ledger; client-supplied amounts, prices or idempotency keys.
- Letting Autumn (or Polar) be the source of truth for spend.
- Silent overage ("bill and alert later").

## Risks

| Risk | Mitigation |
|---|---|
| D3/D4/D15 unsettled | ledger + caps don't depend on them; ship those first, wire Autumn/Polar shape after the decision |
| Price table drift → wrong cost | price source + date in config; reconcile against provider invoices monthly (manual) |

## Port vs rewrite

| Reference | Action |
|---|---|
| `apps/web/convex/wallet.ts` `debitInternal` | **port** idempotency logic, re-key by site + budget |
| `apps/web/convex/autumn.ts`, `subscriptions.ts` | **port** patterns (identify, check/track, webhook) |
| `logic.ts` `checkCap` | **reuse** |
