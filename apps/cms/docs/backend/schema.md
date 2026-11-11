# Agentic CMS: Convex schema

The compile-ready draft is [`convex-schema.draft.ts`](./convex-schema.draft.ts). It is **not wired into a deployment**.
When handoff [01](./handoffs/01-foundations-tenancy.md) adopts it, it moves to `apps/cms/convex/schema.ts`.

Typecheck command (run from `apps/web`, which has `convex@1.45.0` installed; `apps/cms` does not depend on `convex` yet):

```bash
# from apps/web: copy in, check, remove (tsc resolves `convex/*` from the file's directory upward)
mkdir -p .schema-check && cp ../cms/docs/backend/convex-schema.draft.ts .schema-check/ \
  && npx tsc --noEmit --skipLibCheck --strict --module esnext --moduleResolution bundler --target es2020 .schema-check/convex-schema.draft.ts; \
  rm -rf .schema-check
```

Last result: **exit 0** (negative control with an injected type error: exit 2, so the check is real).

Sources: `src/lib/types.ts` (UI shapes) · `docs/multi-site-contract.md` §2 (IUser, IWorkspace, IMembership, IPresence, `IPost.assigneeId/editingBy`) · PRD "Data model" (Site owns TemplateManifest, Pillar, Keyword, Post, Asset, Run; Post owns versions, slots, MR, KAS snapshots; Keyword owns PositionHistory).

## Conventions

| Rule | Why |
|---|---|
| **Tenant-scoped** table = has `siteId` (and `workspaceId` where queries cross sites in a workspace); its first index starts with `siteId` (or a child id like `postId` that is only ever loaded after the parent's site check) | Isolation is enforced by *how* you query, not by remembering to filter. A query without `withIndex("by_site…")` on a tenant table fails review. |
| Times are epoch ms | Convex-native, sortable. The client adapter formats ISO for `types.ts` and computes `daysInState`, `ageDays`, `ageMonths`. |
| Children are separate tables (versions, facts, gate checks, suggestions, slots, candidates, comments) | Agent writes (gate, slots) and human edits (blocks) do not contend on one `posts` document (Convex OCC retries on write conflicts). |
| Caches are named and owned | `sites.spend`, `keywords.positionTrend/kasShare/kasDelta`, `pillars.livePosts/kasShare`, `sites.searchConsole` are written only by the function named in the "Derived / cache" column. |
| Actor display name + id | `actor: "Tolu B."` + `actorUserId`, so audit survives user removal and agents (no user id) fit the same shape. |
| Secrets only in `secrets` | Ciphertext + key version + hint. No public query returns a `secrets` row or a `secretId` value. |
| Blobs in R2 | `assets`, `templateFiles`, report HTML: table holds `r2Key` (prefixed `sites/<siteId>/…`) + metadata. |

## Table catalogue

Scope: **W** = workspace-level · **T** = tenant (site) scoped · **G** = global (cross-workspace, internal only).

### Identity & tenancy

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `workspaces` | `IWorkspace` | W | `clerkOrgId`, `name`, `slug`, `plan` (pilot·agency·enterprise), `seats`, `autumnCustomerId?` | `by_clerkOrg`, `by_slug` | `seatsUsed` = count of active `workspaceMembers` |
| `users` | `IUser` | G | `clerkUserId`, `tokenIdentifier`, `name`, `initials`, `email`, `title?`, `avatarHue`, `status` | `by_token`, `by_clerkUser`, `by_email` | `initials`/`avatarHue` computed on upsert |
| `workspaceMembers` | `ICmsState.workspaceRoles` | W | `workspaceId`, `userId`, `role` (owner·admin·member), `status`, `clerkMembershipId?` | `by_workspace_user`, `by_user` | mirrors Clerk org membership (webhook) |
| `memberships` | `IMembership` | T | `siteId`, `userId`, `role` (TRole), `addedAt`, `addedBy` | `by_site_user`, `by_user`, `by_workspace_user` | none |
| `invites` | `inviteUser(email, siteRoles)` | W | `email`, `workspaceRole`, `siteRoles[]`, `invitedBy`, `clerkInvitationId?`, `status`, `expiresAt` | `by_workspace_status`, `by_email_status`, `by_clerkInvitation` | none |

### Sites

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `sites` | `ISite` + per-site settings on `ISiteData` | T (is the tenant) | `workspaceId`, `slug`, `name`, `domain`, `industry`, `icon`, `accent?`, `status`, `cadenceTarget`, `searchConsole`, `rankSource`, `budgetCaps`, `spend`, `publishing`, `routing`, `modelRouting`, `brandPack`, `ctrCurve?`, `liveBaseline`, `timezone` | `by_workspace`, `by_workspace_slug` | `ISite.budgets.textUsd/imageUsd` ← `spend.textMicroUsd/imageMicroUsd ÷ 1e6` (written by `spend.debit`); `ageMonths` ← `siteStartedAt`; `searchConsole` ← `oauthConnections.status`; `modelRouting.pillarPages` ↔ types.ts `"pillar-pages"` (Convex field names allow only letters, digits and `_`; mapped in the adapter) |
| `repoConnections` | `IRepoConnection` (`ISite.repo`) | T | `host`, `repo`, `baseBranch`, `contentDir`, `assetDir`, `branchPattern`, `installedAs`, `installationId`, `indexFiles?`, `status` | `by_site`, `by_installation`, `by_repo` | none |

`ISite.repo` becomes a join (`repoConnections.by_site`, status `active`). Kept separate so the GitHub webhook can resolve a site from `(host, installationId)` / `(host, repo)` without scanning sites.

### Plan & SEO data

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `pillars` | `IPillar` | T | `name`, `plannedPosts`, `livePosts`, `kasShare`, `claimedButUnearned` | `by_site` | last three ← `kas.recalc` (logic.ts `pillarDistribution`, `claimedButUnearned`) |
| `keywords` | `IKeyword` | T | `term`, `termNormalized`, `pillarId`, `intent`, `difficulty`, `difficultyEvidence`, `impressions`, `position`, `rankingUrl`, `rankingPages`, `decaying` | `by_site`, `by_site_term`, `by_site_pillar` | `positionTrend` (last 8 weeks) ← `gsc.rollupWeekly`; `kasShare`/`kasDelta` ← `kas.recalc` (`computeKas`) |
| `positionHistory` | PRD PositionHistory | T | `keywordId`, `date`, `position`, `impressions`, `clicks`, `page?`, `source` | `by_keyword_date`, `by_site_date` | truth for `positionTrend` |
| `trafficWeekly` | `IWeekPoint` (`ISiteData.trajectory`) | T | `isoWeek`, `sessions` (null = gap), `impressions` (null = gap), `projected` | `by_site_week` | written by `gsc.rollupWeekly`; `gapToProjection()` reads it |
| `kasSnapshots` | `IKasSnapshot` | T | `at`, `trigger`, `label`, `mrId?`, `postId?`, `concentration`, `shares[]` | `by_site_at` | append-only |
| `reports` | `IReportEdition` | T | `n`, `period`, `publishedAt`, `headline`, `pivotTriggers[]`, `htmlAssetId?` | `by_site_n` | none |

`ISiteData.planStatus` (`IPlanStatus[]`) is **not stored**: compute it in `plan.status` from posts, pillars, ledger and the technical-monitor artifact.

### Posts

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `posts` | `IPost` | T | `slug`, `title`, `seoTitle`, `keywordId`, `pillarId`, `intent`, `contentType`, `source`, `state`, `stateChangedAt`, `owner`, `week`, `strongModel`, `progress?`, `words`, `wordTarget`, `blocks[]`, `currentVersion`, `regulated?`, `requires?`, `sendBackNote?`, `ideaApproval?`, `ideaStatus`, `assigneeId?`, `mrId?`, `workflowId?`, `approvedVersion?`, `liveAt?` | `by_site_state`, `by_site_week`, `by_site_slug`, `by_site_keyword`, `by_site_idea`, `by_assignee_state` | `daysInState` ← `stateChangedAt`; `owner` ← `STATE_OWNER[state]`; `slotIds` ← `imageSlots.by_post` |
| `postVersions` | `IVersion` | T | `postId`, `n`, `origin`, `actor`, `actorUserId?`, `runId?`, `at`, `words`, `note?`, `blocks[]`, `seoTitle?` | `by_post_n` | append-only |
| `factMarkers` | `IFactMarker` | T | `postId`, `blockId?`, `claim`, `status`, `source?`, `note`, `resolution?` | `by_post`, `by_site_status` | none |
| `gateChecks` | `IGateCheck` | T | `postId`, `checkId`, `label`, `section`, `status`, `value`, `severity`, `override?`, `evaluatedForVersion` | `by_post`, `by_post_check` | `derivedChecks()` (logic.ts) are computed on read, not stored |
| `suggestions` | `IAgentSuggestion` | T | `postId`, `instruction`, `before`, `after`, `blockId`, `status`, `fixesCheckId?`, `resolvesFactId?`, `insertKind?`, `runId?` | `by_post_status` | none |
| `comments` | `IPost.comments` | T | `postId`, `byUserId`, `by`, `role`, `text`, `at` | `by_post_at` | none |

Notes:
- `IPost.mr` (unused by the store) is dropped; `mrId` stays.
- `ISiteData.rejectedIdeas` = `posts` with `ideaStatus = "rejected"` (state stays `idea`); the swarm's dedup reads `by_site_idea` + `keywords.by_site_term`.
- `IPost.editingBy` = join on `editLocks.by_post`. `IPost.assigneeId` stays on the post.
- `approvedVersion` implements the [ASSUMED] rule in `00-decisions.md`: editing a post after its MR opens re-requires approval (gate asserts the shipped text).

### Images, assets, templates

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `imageSlots` | `IImageSlot` | T | `postId`, `name`, `type`, `placement`, `width`, `height`, `format`, `breakpoints[]`, `filename`, `alt`, `prompt`, `styleKeywords[]`, `provider`, `model`, `status`, `selectedCandidateId?`, `estimateUsd`, `humanPinned?`, `order` | `by_post`, `by_site_status` | none |
| `candidates` | `ICandidate` | T | `slotId`, `postId`, `label`, `hue`, `selected`, `assetId?`, `source?` (provenance), `runId?` | `by_slot` | `ICandidate.url` ← signed/public URL of `assetId` at read time |
| `assets` | PRD Asset | T | `r2Key`, `contentType`, `bytes`, `sha256`, `width?`, `height?`, `kind`, `parentAssetId?`, `breakpoint?`, `format?`, `provenance?` | `by_site`, `by_site_sha`, `by_parent` | variants written by `assets.postProcess` (sharp) |
| `templateManifests` | `ITemplateManifest` | T | `version`, `source`, `kind`, `output`, `status`, `samplePath?`, `mappings[]`, `bundleFiles`, `bundleBytes`, `confirmedBy?` | `by_site_version`, `by_site_status` | `sampleHtml` ← R2 file at `samplePath`; "active manifest" = latest `confirmed` |
| `templateFiles` | prototype `.data/templates/<siteId>/<bundleId>/…` | T | `manifestId`, `path`, `r2Key`, `contentType`, `bytes`, `kind` | `by_manifest_path` | none |

### Git, runs, spend, ledger

| Table | From | Scope | Key fields | Indexes | Derived / cache |
|---|---|---|---|---|---|
| `mergeRequests` | `IMergeRequest` | T | `postId?`, `repoConnectionId`, `host`, `repo`, `number`, `externalId?`, `branch`, `base`, `headSha?`, `status`, `ci`, `previewUrl?`, `files[]`, `overrides[]`, `description?`, `ciDetail?`, `conflictDetail?`, `manifestVersion?`, `postVersion?`, `autopost?` | `by_site_status`, `by_post`, `by_repo_number` | `ci`/`status` ← webhooks |
| `runs` | `IRun` | T | `kind`, `trigger` (+ `workflow`), `status` (+ `cancelled`), `agent`, `agentId`, `model`, `tier?`, `escalated?`, `inputTokens`, `outputTokens`, `costUsd`, `estimateUsd`, `budget?`, `postId?`, `slotId?`, `output`, `error?`, `langfuseTraceId?`, `workflowId?`, `idempotencyKey`, `attempt` | `by_site_started`, `by_site_status`, `by_post`, `by_idempotency` | `IRun.tokens` = input + output; `durationSec` ← `finishedAt - startedAt` |
| `schedules` | `ISchedule` | T | `kind`, `label`, `cadence`, `rule`, `produces`, `nextAt`, `enabled`, `lastRunAt?`, `lastRunId?` | `by_site_kind`, `by_enabled_next` | `nextAt` ← `schedules.advance` |
| `artifacts` | harness "data contracts" | T | `agentId`, `kind`, `runId`, `postId?`, `content?` (≤ 64 KB) or `assetId?` | `by_site_agent_kind`, `by_run` | "newest matching artifact" = `by_site_agent_kind` desc |
| `spendEntries` | wallet ledger, per site | T | `budget`, `month`, `type`, `amountMicroUsd` (integer), `reason`, `idempotencyKey`, `runId?`, `spentAfterMicroUsd` | `by_idempotency`, `by_site_month_budget` | truth for `sites.spend` |
| `ledgerItems` | `ILedgerItem` | T | `title`, `owner`, `ownerUserId?`, `createdAt`, `downstream`, `postId?`, `slotId?`, `kind?`, `origin`, `dedupeKey?`, `done` | `by_site_done`, `by_post`, `by_site_dedupe` | `ageDays`, open/overdue/blocker ← `ledgerStatus()` at read |

The existing `apps/web/convex/schema.ts` `wallets`/`walletTransactions` are keyed by **`userId`**; CMS caps are per **site and budget kind**, so `spendEntries` is a site-keyed ledger implementing the same `WalletLedger` port from `@studio/effect-critical` (`debit`/`credit`/`getBalance`) with `userId := "site:<siteId>:<budget>"`.

### Audit, notifications, connections, collaboration, billing

| Table | From | Scope | Key fields | Indexes | Notes |
|---|---|---|---|---|---|
| `auditEvents` | `IAuditEvent` | T (or W when `siteId` absent) | `at`, `actor`, `actorKind`, `actorUserId?`, `action`, `target`, `detail?`, `postId?`, `runId?`, `inputs?` | `by_site_at`, `by_workspace_at`, `by_post_at` | append-only; `inputs` redacted |
| `notifications` | `INotification` | per user (W + optional site) | `userId`, `siteId?`, `at`, `tone`, `title`, `body`, `href?`, `read`, `dedupeKey?` | `by_user_read_at`, `by_user_site` | fan-out at write (see api-map "Notification fan-out") |
| `connections` | `IConnection` | T | `kind`, `provider`, `label`, `transport?` (streamable-http · sse), `url?`, `model?`, `toolName?`, `tools?`, `usedFor[]`, `enabled`, `status`, `secretId?`, `secretHint?` | `by_site`, `by_site_provider` | no `command`/`args`/stdio in production |
| `secrets` | prototype `.data/secrets.json` | T | `ownerKind`, `ownerId`, `ciphertext`, `keyVersion`, `hint` | `by_site`, `by_owner` | internal-only |
| `oauthConnections` | apps/web `googleConnections` | T | `status`, `scopes[]`, `propertyUri?`, token secret ids, `accessTokenExpiresAt?`, `lastImportAt?`, `lastImportedDate?` | `by_site_provider` | Search Console |
| `oauthStates` | apps/web `googleOAuthStates` | T | `stateHash`, `userId`, `codeVerifierEncrypted`, `redirectTo`, `expiresAt`, `consumedAt?` | `by_stateHash` | single use |
| `presence` | `IPresence` | W/T | `userId`, `sessionId`, `siteId?`, `path`, `at` | `by_site_at`, `by_user_session`, `by_at` | TTL cron |
| `editLocks` | `IPost.editingBy` | T | `postId`, `userId`, `sessionId`, `since`, `heartbeatAt` | `by_post`, `by_heartbeat`, `by_user` | soft lock, TTL cron |
| `siteSubscriptions` | Polar per site | T | `polarSubscriptionId`, `polarProductId?`, `status`, `currentPeriodEnd?` | `by_site`, `by_polarSubscription` | open decision D3 |
| `webhookEvents` | n/a | G | `source`, `deliveryId`, `type`, `status`, `siteId?`, `error?` | `by_source_delivery` | idempotent intake |

## Not stored (client-only or replaced)

| types.ts / store | Backend |
|---|---|
| `ICmsState.version`, `ICmsState.siteId`, `ICmsState.role` | Gone. Site = URL slug; role = `effectiveRole()` server-side. |
| `IJob` + `state.jobs` (`SIM_MS` timers) | Replaced by Workflow steps, Workpool items and `ctx.scheduler.runAfter`. |
| `IToast` | Client-only. A refused mutation returns `{ ok: false, reason }`; the client toasts. |
| `undo()` | Not a generic backend feature. See api-map "undo". |
| `IMember` | Replaced by `users` + `memberships` (role is per site). |
| `IPlanStatus[]` | Computed in `plan.status`. |
| `ISiteData.liveBaseline` | Field on `sites`. |

## Invariants the functions must keep (tests in handoff 01/02)

1. A `posts.state` change goes through `posts.transition` only, which calls `nextState()` from `src/lib/logic.ts` and writes `stateChangedAt`, an audit row and (where `STATE_OWNER` flips to human) a notification.
2. An open `factMarkers` row means `evaluateGate().canApprove === false`. No mutation sets a fact marker `resolved` without `source` or `resolution: "rewritten"`.
3. At most one `templateManifests` row per site has `status: "confirmed"`; confirming supersedes the previous.
4. At most one `editLocks` row per post; at most one `mergeRequests` row with `status: "open"` per post.
5. `spendEntries` with the same `idempotencyKey` is written once; `sites.spend` equals the month's sum of debits minus credits per budget.
6. `mergeRequests.autopost === true` is the only case `git.autoMerge` may act on.
7. Nothing outside `secretsInternal.*` reads `secrets.ciphertext`.
