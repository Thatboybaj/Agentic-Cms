---
name: cms-backend-01-foundations-tenancy
description: >
  Adopt the Convex schema, build requireSiteRole + wrappers, Clerk org sync, workspace/site/membership/invite
  functions, presence + edit locks, audit + notifications, and swap the client store onto Convex for read paths
  and the simple mutations. Isolation tests are the acceptance bar.
---

# Handoff 01: foundations and tenancy

| | |
|---|---|
| Size | **L** |
| Depends on | 00 |
| Unblocks | 02–09 |

## Goal

A signed-in user in a Clerk organization sees exactly the sites they have a membership on, with the effective role
from the multi-site contract, and every site-scoped Convex function refuses everything else. The UI runs on Convex
for workspace, sites, team, presence, edit locks, audit, notifications, comments, settings and plan reads, with the
prototype's hooks unchanged.

## Why

Tenant isolation is a PRD non-negotiable ("never visible to another tenant or used as context in another tenant's
run"). If the access helper and the wrappers exist before any feature function, isolation is structural instead of
remembered.

## Inputs (read first)

- [../README.md](../README.md) §4 Tenancy (the `requireSiteRole` contract and rules I1–I8), §5 Data ownership
- [../schema.md](../schema.md) + [../convex-schema.draft.ts](../convex-schema.draft.ts)
- [../api-map.md](../api-map.md) §1, §2, §9 and the rows for comments, settings, schedules toggle, ledger resolve
- `apps/cms/docs/multi-site-contract.md` (binding), `apps/cms/docs/store-api.md`
- `apps/cms/src/lib/logic.ts` (`PERMISSIONS`, `roleCan`, `lockReason`, `TPermission`), `src/lib/types.ts`, `src/lib/store.tsx` (current actions, audit/notify wording), `src/lib/seed.ts`
- Reference patterns: `apps/web/convex/lib/auth.ts` (`requireAuthIdentity`, `assertExpectedOrganization`), `apps/web/convex/clerkWebhook.ts` (`verifyWebhook`), `apps/web/convex/rateLimits.ts`

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/schema.ts` | from `convex-schema.draft.ts` (delete the draft header; keep the doc in `docs/backend`) |
| `apps/cms/convex/convex.config.ts` | `rateLimiter` now; other components join in later handoffs |
| `apps/cms/convex/lib/access.ts` | `requireIdentity`, `currentUser`, `currentWorkspace` (from `org_id`), `effectiveRole`, `requireSiteRole(ctx, siteId, permission)`, `requireWorkspaceRole(ctx, permission)`, `loadPostInSite` |
| `apps/cms/convex/lib/functions.ts` | `siteQuery`, `siteMutation`, `siteAction`, `workspaceQuery`, `workspaceMutation` wrappers (inject the check; `siteId` first arg) |
| `apps/cms/convex/lib/audit.ts`, `lib/notify.ts` | `audit(ctx, {...})`, `notify(ctx, { siteId, event, … })` with the fan-out table in api-map §9 |
| `apps/cms/convex/lib/transition.ts` | `posts.transition` internal mutation using `nextState()` (used from 02 on, but created here) |
| `apps/cms/convex/{workspace,sites,members,invites,presence,locks,comments,notifications,audit,settings,schedules,ledger,portfolio,inbox,posts}.ts` | functions from api-map §1–§3, §8–§9 that have no agent work (agent-backed ones land in 02/03) |
| `apps/cms/convex/clerkSync.ts` + `http.ts` (`/clerk/webhook`) | org, membership, user, invitation events → `workspaces`, `workspaceMembers`, `users`, `invites` → `memberships` |
| `apps/cms/convex/devSeed.ts` | `CMS_DEV_TOOLS=1` only: loads `createSeed()` data into one workspace (8 sites, 7 users per contract §2) |
| `apps/cms/src/lib/store.tsx` (Data agent's file: coordinate) | hooks backed by `useQuery`; actions call mutations and keep `TResult` + toasts |
| `apps/cms/convex/*.test.ts` | convex-test suites (see test plan) |

## Steps

1. **Schema.** Move the draft into `convex/schema.ts`; run `npx convex dev` until it deploys. Add `@/*` → `../src/*` paths to `convex/tsconfig.json` so `src/render` type imports resolve.
2. **Access helper** exactly as README §4: identity → user (by `tokenIdentifier`) → site → workspace from JWT org → effective role → `PERMISSIONS[permission]`. Errors: `ConvexError({ code: "UNAUTHENTICATED" | "NOT_FOUND" | "FORBIDDEN", reason })` with `reason = lockReason(role, permission)` so the UI copy matches today's `LockedAction`. Same `NOT_FOUND` for missing and foreign sites.
3. **Wrappers.** Every public function in `apps/cms/convex` is built from a wrapper. Add a CI check (`scripts/check-cms-convex-auth.mjs` **[NEW]**) that fails if a file exports `query(`/`mutation(`/`action(` from `_generated/server` directly (allowlist: `http.ts`, `crons.ts`, internal functions).
4. **Clerk sync.** `/clerk/webhook` with `verifyWebhook` (pattern from `apps/web/convex/clerkWebhook.ts`), dedupe via `webhookEvents`. `organization.created` → `workspaces`; `organizationMembership.*` → `workspaceMembers` (role map in README §4); `user.*` → `users` (initials + `avatarHue` computed); `organizationInvitation.accepted` → find `invites` by `clerkInvitationId` → apply `siteRoles` to `memberships`. Also lazily upsert the user on first authenticated call (webhook can lag).
5. **Workspace + sites.** `workspace.current`, `sites.bySlug` (status ok/not-found/no-access), `sites.add` (slug from name, unique per workspace, default publishing on/on, routing + modelRouting + schedules defaults from `seed.ts` / `@studio/seo-harness` `SCHEDULE`), `sites.setStatus`.
6. **Members + invites.** `members.setMembership`, `members.setWorkspaceRole` (Clerk API call in an internal action; never demote the last owner), `invites.create` (Clerk org invitation via Backend API, verify method), revoke.
7. **Presence + locks.** `presence.heartbeat` (client every 20 s per tab with a `sessionId` from `sessionStorage`), `presence.list`; `locks.acquire/heartbeat/release` with take-over; sweep crons (api-map §12).
8. **Audit + notifications.** One `audit()` helper with the store's exact action strings (grep `audit(` in `store.tsx` for the list); notifications per recipient with `dedupeKey`.
9. **Simple domain mutations** (no agents): `posts.addIdea`, `approveIdea`/`rejectIdea`/`promoteToBrief` (approval + transition only; the workflow start is a no-op stub until 02), `moveToWeek`, `assign`, `comments.add`, `settings.*` (autopost, auto-merge, budget, routing, model routing), `schedules.toggle`, `ledger.resolve` (D9), `notifications.*`, `editor.editBlock/editSeoTitle/restoreVersion` (versions + `baseVersion` check), `gate.overrideCheck`, `gate.addFactSource`.
10. **Read queries** in api-map §2, including `gate.evaluate` calling `evaluateGate()` server-side and `stats.site` with bounded reads.
11. **Store adapter.** Keep every hook signature from `store-api.md`; map Convex docs → `types.ts` shapes in one `src/lib/adapter.ts` **[NEW]** (ms → ISO, joins for `editingBy`, `ISite.repo`, `budgets`). Remove `setSite`/`setRole` from production paths (dev-only role switcher under `CMS_DEV_TOOLS`). Keep `SIM_MS` jobs only for actions not yet ported (behind a flag) so the UI stays usable during 02–07.
12. **Undo**: wire the toast "Undo" to inverse mutations for the reversible list in api-map §9 (D10); drop it elsewhere.

## Interfaces it must honour

- `requireSiteRole(ctx, siteId, permission: TPermission)` signature and error codes (README §4). Later handoffs import it; don't change it without updating them.
- `TResult` return shape for every mutation (store-api.md).
- Audit action strings identical to `store.tsx` (UI and tests read them).
- Table/field names from `schema.md`. Any change: update `schema.md`, `convex-schema.draft.ts` and api-map in the same PR.

## Test plan

| Kind | Cases |
|---|---|
| **Isolation (must all pass)** | (a) user with membership on site A only: every public query/mutation called with site B's id → `NOT_FOUND`; (b) same with a post id from site B passed alongside site A's id → refused (I2); (c) workspace admin of W1 calling a site in W2 → `NOT_FOUND`; (d) JWT with no active org → `UNAUTHENTICATED`; (e) membership removed mid-session → next call refused, edit lock released; (f) a generated test iterates **every exported public function** with a foreign `siteId` and asserts refusal (fails when someone adds an unwrapped function) |
| Role matrix | for each `TPermission`, each role: allowed iff `PERMISSIONS` says so; message = `lockReason()` |
| Effective role | workspace owner/admin → admin on a site with no membership; member with no membership → no-access |
| Clerk sync | replayed webhook (same svix id) is a no-op; invitation accepted applies `siteRoles`; org deleted → workspace members suspended (no data deletion) |
| Golden (store parity) | for addIdea, approveIdea, rejectIdea, moveToWeek, overrideCheck, editBlock, setBudget: the audit row and returned `TResult` equal what `store.test.ts` asserts today |
| Concurrency | two editors: second `locks.acquire` without `takeOver` returns `{ ok:false, reason:"<name> is editing" }`; `editBlock` with stale `baseVersion` refused |
| Clock | a test fails if `ledgerAge()` is called on the server without `at` while `NEXT_PUBLIC_CMS_LIVE_CLOCK` is unset |
| E2E (Playwright or browser pass) | two browser profiles = two users with different site roles: site switcher lists only their sites; `/s/<other>` shows no-access; stakeholder sees locked actions with the reason; presence avatars appear for both |

## Done when

- [ ] Schema deployed; draft and `convex/schema.ts` in sync
- [ ] All isolation tests green, including the "every public function" sweep
- [ ] Clerk org/membership/invite sync working on dev with real webhooks
- [ ] UI runs on Convex for workspace, sites, team, inbox, portfolio, presence, locks, comments, settings, audit, notifications
- [ ] `pnpm --filter @studio/cms typecheck && test` green; `ship-ready-pr` loop passed (Greptile, Aikido)

## Forbidden moves

- A public function without the wrapper, or a tenant-table query without `by_site…` / a checked parent.
- Trusting `role`, `siteId` or `userId` from client args for authz (only `siteId` as the *target*, then checked).
- Putting per-site roles into Clerk metadata as the source of truth.
- Deleting tenant data on Clerk org deletion (suspend; deletion is a separate, audited admin job).
- `signInAs` / role switcher reachable in staging or prod.

## Risks

| Risk | Mitigation |
|---|---|
| The Data and Workspace-UI agents are still changing `src/lib/**` and `types.ts` | land the adapter behind the existing hook signatures; coordinate via the multi-site contract owner table |
| Clerk webhook lag on first sign-in | lazy upsert in `currentUser()` |
| `stats.site` too heavy for reactive queries | bounded reads now; Aggregate component later (D11) |
| Clerk event or role names differ | verify against Clerk docs; keep mapping in one function |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `src/lib/logic.ts` | **reuse unchanged** (import relatively) |
| `src/lib/store.tsx` actions | **rewrite** as Convex mutations; copy audit/notify wording and refusal reasons verbatim |
| `src/lib/seed.ts` | **reuse** for `devSeed.reset` |
| `src/lib/routes.ts` | unchanged (client) |
| `apps/web/convex/lib/auth.ts`, `clerkWebhook.ts` | **port** patterns (identity, org claim, `verifyWebhook`) |
