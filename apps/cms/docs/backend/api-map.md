# Agentic CMS: API map (store → Convex)

Every hook and action in [`../store-api.md`](../store-api.md) and the multi-site additions in
[`../multi-site-contract.md`](../multi-site-contract.md) §3, mapped to a Convex function. Tables: [schema.md](./schema.md).
Architecture: [README.md](./README.md).

## Legend

| Column | Meaning |
|---|---|
| **Kind** | `Q` public query · `M` public mutation · `A` public action · `IQ/IM/IA` internal · `WF` workflow (`@convex-dev/workflow`, **[NEW]** component) · `WP` Workpool item (`@convex-dev/workpool`, **[NEW]**) · `H` HTTP action · `C` cron |
| **Auth** | Permission key from `PERMISSIONS` in `src/lib/logic.ts`, checked by `requireSiteRole(ctx, siteId, permission)`. `ws:<key>` = `requireWorkspaceRole(ctx, permission)` (`members.manage`, `site.add`, `billing.view`). `member` = any role on the site (`plan.view`). `self` = signed in, acts on own rows only. `sig` = webhook signature, no user. |
| **Effects** | `audit` = `auditEvents` row (actor, action, target, detail exactly as the store writes today) · `notify(→roles)` = notification fan-out · `run` = `runs` row · `wf` = starts/continues a workflow · `sched` = `ctx.scheduler.runAfter` |
| **Effect** | ✅ = the money/inference/delivery part runs inside an `@studio/effect-critical` program · — = plain Convex + TS |
| **Idem key** | Server-built key. Clients never supply idempotency keys for money (lesson from `apps/web/convex/inference.ts`: a client key let a debit short-circuit while the provider still got paid). |

Every public function: `args` validated with `v.*`, explicit `returns`, and **`siteId: v.id("sites")` as the first arg** for site-scoped functions. Mutations return `TResult` (`{ ok: true, id? } | { ok: false, reason }`); refusals are values, not throws, so the client can toast red exactly as the prototype does. Unexpected failures throw `ConvexError`.

Function names below are file-qualified: `posts.approveIdea` = `apps/cms/convex/posts.ts` export `approveIdea`. All **[NEW]**.

---

## 1. Session, workspace, site scope (multi-site contract §3)

| Store API | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `<SiteScope slug>` resolve | `sites.bySlug` | Q | `{ slug }` | signed in; returns `{ status: "ok" \| "not-found" \| "no-access", site?, role? }` | none | — | n/a |
| `<SiteScope>` presence record | `presence.heartbeat` | M | `{ sessionId, siteId?, path }` | self + `member` when `siteId` | upsert `presence` | — | `(userId, sessionId)` upsert |
| `useSite()` / `useCms()` (site, role, can, why) | `sites.bySlug` + `access.myPermissions` | Q | `{ siteId }` | `member` | none. Returns `{ role, allowed: TPermission[] }`; client `can()/why()` reuse `lockReason()` | — | n/a |
| `useWorkspace()` | `workspace.current` | Q | `{}` | signed in, active Clerk org | none. `{ workspace, me, users, memberships, sitesForMe }` (users/memberships only for `ws:members.manage`, else self) | — | n/a |
| `roleOn(siteId)` | derived from `workspace.current.memberships` + `effectiveRole()` | client | | | | | |
| `signInAs(userId)` | **none in prod.** Dev-only `devSeed.impersonate` behind `CMS_DEV_TOOLS=1` | IM | | | | | |
| `signOut()` | Clerk `signOut()` (client) | n/a | | | | | |
| `setSite(siteId)` | **removed**: URL is the source of truth (`sitePath()`) | n/a | | | | | |
| `setRole(role)` | **removed**: role = membership. Demo role switcher becomes dev-only | n/a | | | | | |
| `usePortfolio()` | `portfolio.list` | Q | `{}` | signed in; only `sitesForMe` | none. Per site: pipeline counts, needs-me, held, ideas pending, spend vs cap, gap, last activity | — | n/a |
| `useInbox()` | `inbox.forMe` | Q | `{}` | self, across my sites | none. Pending ideas (if `idea.approve`), held posts, human-only slots, overdue ledger, failing CI (if `mr.merge`), invites | — | n/a |
| `usePresence(siteId?, path?)` | `presence.list` | Q | `{ siteId?, path? }` | `member` | none. Rows with `at > now - 45s` | — | n/a |
| `inviteUser(email, siteRoles)` | `invites.create` → `IA invitesNode.sendClerkInvitation` | M + IA | `{ email, workspaceRole?, siteRoles: {siteId, role}[] }` | `ws:members.manage` and every `siteId` in this workspace | `invites` row, audit (workspace), Clerk org invitation (verify against Clerk docs), notify(→invitee on accept) | — | `(workspaceId, email)` pending row reused |
| `setMembership(userId, siteId, role \| null)` | `members.setMembership` | M | `{ siteId, userId, role: vRole \| null }` | `ws:members.manage` | upsert/delete `memberships`; audit; release that user's `editLocks` on the site when removed | — | upsert |
| `setWorkspaceRole(userId, role)` | `members.setWorkspaceRole` → `IA clerkNode.updateOrgRole` | M + IA | `{ userId, role: vWorkspaceRole }` | `ws:members.manage`; cannot demote last owner | `workspaceMembers` + Clerk org role sync; audit | — | n/a |
| `addSite({ name, domain, industry, icon? })` → slug | `sites.add` | M | `{ name, domain, industry, icon? }` | `ws:site.add` | `sites` (status `onboarding`, publishing on/on, default routing/modelRouting from seed defaults), default `schedules` rows, slug uniqueness, audit; returns `{ ok, id, slug }` | — | slug collision → suffix |
| `pauseSite` / `resumeSite` | `sites.setStatus` | M | `{ siteId, status: "paused" \| "active" }` | `ws:site.add` | `sites.status`; paused: `schedules.tick` skips, running workflows finish their current step then park; audit | — | n/a |
| `assignPost(postId, userId \| null)` | `posts.assign` | M | `{ siteId, postId, userId? }` | `post.edit`; assignee must be a member of the site | `posts.assigneeId`; audit; notify(→assignee) | — | n/a |
| `startEditing(postId)` | `locks.acquire` | M | `{ siteId, postId, sessionId, takeOver?: boolean }` | `post.edit` | `editLocks` insert / takeover (audit "took over editing"), notify(→previous holder) on takeover | — | `(postId)` single row |
| `stopEditing(postId)` | `locks.release` | M | `{ siteId, postId, sessionId }` | self holder | delete row | — | no-op if absent |
| lock heartbeat | `locks.heartbeat` | M | `{ siteId, postId, sessionId }` | self holder | `heartbeatAt` | — | n/a |
| `canWorkspace(p)` | `access.myWorkspacePermissions` | Q | `{}` | signed in | none | — | n/a |

## 2. Read hooks (single site)

All `Q`, auth `member` (`plan.view`) unless stated; every one takes `siteId` first.

| Hook | Convex query | Returns / notes |
|---|---|---|
| `usePost(id)` | `posts.get` | post + versions (latest 20) + facts + suggestions (pending) + comments + `editingBy` join |
| `useSlotsForPost(postId)` | `slots.byPost` | slots + candidates, candidate `url` = R2 URL of `assetId` (`r2.getUrl`, verify signed vs public) |
| `useSlot(slotId)` | `slots.get` | |
| `useKeyword(id)` | `keywords.get` | + last 90 days `positionHistory` |
| `useMergeRequest(id)` / `useMrForPost(postId)` | `git.mr` / `git.mrForPost` | |
| `useActiveManifest()` | `templates.active` | latest `confirmed` manifest (no `sampleHtml`; fetch via `templates.sampleUrl`) |
| `useGate(postId)` | `gate.evaluate` | runs `evaluateGate(post, slots, manifest, overrides)` from `src/lib/logic.ts` **server-side**; same `IGateResult` shape |
| `useLedger()` | `ledger.list` | open items + derived `age`, `status` via `ledgerStatus()` |
| `useStats()` | `stats.site` | same shape as today. Bounded reads only (counts by `by_site_state`, runs today by `by_site_started`). If it grows, move counters to the Aggregate component (decision D11). |
| `usePendingIdeas()` | `posts.pendingIdeas` | `by_site_idea` = pending, ordered by week |
| `useAutopostHold(postId)` | `ledger.holdForPost` | open `ledgerItems` `kind: "autopost-hold"` by `by_post` |
| plan board / calendar / matrix | `posts.board` | `by_site_week` window |
| runs list | `runs.list` | `by_site_started` desc, paginated |
| audit | `audit.list` | `audit.view`; `by_site_at` paginated |
| SEO | `seo.overview` | keywords + KAS latest snapshot + `trafficWeekly` + `concentration()` |
| reports | `reports.list`, `reports.htmlUrl` | |
| notifications | `notifications.mine` | `by_user_read_at`; `unread` count |
| `useToasts()` | client only | |

## 3. Ideas, plan, publishing

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `addIdea(topicOrKeyword, pillarId?)` → id | `posts.addIdea` | M | `{ siteId, topic, pillarId? }` | `idea.create` | upsert `keywords` by `termNormalized`; `posts` (state idea, ideaStatus pending, source manual); audit "added idea" | — | dedup on `(siteId, termNormalized)` → `{ ok:false, reason:"Already in the plan" }` |
| `approveIdea(postId)` | `posts.approveIdea` | M | `{ siteId, postId }` | `idea.approve` | `ideaApproval` + `posts.transition(idea→briefed)`; audit "approved idea"; if `publishing.autopost` → start **WF `postPipeline`** (`wf`) | — | refuse if not pending |
| `rejectIdea(postId, note)` | `posts.rejectIdea` | M | `{ siteId, postId, note }` (≥ 3 chars) | `idea.approve` | `ideaStatus: rejected`; audit "rejected idea" | — | n/a |
| `promoteToBrief(postId)` | `posts.promoteToBrief` | M | `{ siteId, postId }` | `post.promote` | approves a pending idea on the way (same path as `approveIdea`) | — | n/a |
| `movePostToWeek(postId, week)` | `posts.moveToWeek` | M | `{ siteId, postId, week }` | `post.schedule` | `week`; audit "rescheduled" (generation run moves with it: the per-publish-slot schedule reads `week`) | — | n/a |
| `generateNow(postId)` | `posts.generateNow` | M | `{ siteId, postId }` | `post.generate`; state ∈ {briefed, decaying}; refuses unapproved idea ("Approve the idea first…") | `checkCap()` pre-check (refusal returns reason + audit "run refused over cap" + notify); start **WF `postPipeline`** from `draft`; audit "triggered run" | ✅ (inside the workflow's agent step) | workflow id stored on post; refuse if `posts.workflowId` is live |
| `shipNow(postId)` → mrId | `posts.shipNow` | M | `{ siteId, postId }` | `post.approve`; autopost site; state ∈ {needs-assets, in-review} | start **WF `autopostGate`** now; audit "ran autopost gate" | ✅ (agent fixes) | refuse if a gate workflow is live |
| `setAutopost(siteId, on)` | `settings.setAutopost` | M | `{ siteId, on }` | `publishing.set` | `sites.publishing.autopost`; audit; off → in-flight posts stop at in-review at their next gate | — | n/a |
| `setAutoMerge(siteId, on)` | `settings.setAutoMerge` | M | `{ siteId, on }` | `publishing.autoMerge` (admin) | `sites.publishing.autoMergeOnGreenCi`; audit | — | n/a |

## 4. Editor, agent edits, gate

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `instructAgent(postId, instruction, blockId?)` | `editor.instructAgent` → `WP agents.reviseBlock` | M + WP | `{ siteId, postId, instruction, blockId? }` | `post.edit` | `run` (queued) after `checkCap`; Workpool item calls the writer (tier per `modelRouting.writing`); result → `suggestions` row (pending); audit; notify(→requester) "Agent edit ready" | ✅ | `run:<siteId>:revise:<postId>:<hash(instruction,blockId,version)>` |
| `acceptSuggestion(postId, sid)` | `editor.acceptSuggestion` | M | `{ siteId, postId, suggestionId }` | `post.edit` | apply `after` (or insert `insertKind` block); `postVersions` (agent-edit); resolves `fixesCheckId` → `gateChecks` pass, `resolvesFactId` → fact `resolution: rewritten`; audit "accepted agent edit"; re-gate if post past in-review | — | refuse if not pending |
| `rejectSuggestion(postId, sid)` | `editor.rejectSuggestion` | M | same | `post.edit` | status rejected; audit | — | n/a |
| `editBlock(postId, blockId, text)` | `editor.editBlock` | M | `{ siteId, postId, blockId, text, baseVersion }` | `post.edit` + caller holds `editLocks` (or none held) | block text, `words` (`countWords`), `postVersions` (human-edit, coalesced per editor per 2 min), audit "edited"; if `mrId` open → `approvedVersion` stale → post back to in-review (decision [ASSUMED] in 00-decisions) | — | `baseVersion` optimistic check → `{ ok:false, reason:"Someone changed this block" }` |
| `editSeoTitle(postId, t)` | `editor.editSeoTitle` | M | `{ siteId, postId, seoTitle }` | `post.edit` | audit "edited SEO title"; invalidates `title-length` check | — | n/a |
| `restoreVersion(postId, versionId)` | `editor.restoreVersion` | M | `{ siteId, postId, versionId }` | `post.edit` | new `postVersions` row copying blocks; audit "restored version" | — | n/a |
| `addFactSource(postId, markerId, url)` | `gate.addFactSource` | M | `{ siteId, postId, markerId, url }` (https, ≤ 2 KB) | `post.edit` | marker resolved `sourced`; audit "added source". Optional async URL liveness check (`WP`, `@studio/web-tools` `scrapeUrl`) that flags dead links, never auto-resolves | — | n/a |
| `rewriteFactWithout(postId, markerId)` | `gate.rewriteFactWithout` → `WP agents.rewriteWithoutClaim` | M + WP | `{ siteId, postId, markerId }` | `post.edit` | produces a `suggestions` row with `resolvesFactId`; accepting it resolves the marker | ✅ | `run:<siteId>:rewrite-fact:<markerId>:<version>` |
| `fixCheck(postId, checkId)` | `gate.fixCheck` → `WP agents.fixCheck` | M + WP | `{ siteId, postId, checkId }` (∈ `AGENT_FIXABLE_CHECKS`) | `post.edit` | suggestion with `fixesCheckId`; schema check fixed deterministically (audit actor "On-page optimizer") | ✅ (LLM fixes) | `run:<siteId>:fix:<postId>:<checkId>:<version>` |
| `overrideCheck(postId, checkId, reason)` | `gate.overrideCheck` | M | `{ siteId, postId, checkId, reason }` (≥ 8 chars, soft only) | `gate.override` | `gateChecks.override`; audit "overrode soft block" | — | n/a; hard check → `{ ok:false }` |
| `sendToReview(postId)` | `posts.sendToReview` | M | `{ siteId, postId }` | `post.sendToReview` | transition → in-review; notify(→`post.approve` holders) "Approval requested"; audit | — | n/a |
| `sendBack(postId, note)` | `posts.sendBack` | M | `{ siteId, postId, note }` | `post.sendBack` | `sendBackNote`; start **WF `revise`** (writer applies note) → back to in-review; audit "sent back"; notify on completion "Revision ready" | ✅ | workflow per (postId, version) |
| `approve(postId, overrides?)` → mrId | `posts.approve` | M | `{ siteId, postId, overrides?: Record<checkId, reason> }` | `post.approve`; `evaluateGate().canApprove` with overrides | gate re-evaluated server-side (never trust the client gate); overrides → `gateChecks.override`; `approvedVersion = currentVersion`; audit "approved"; start **WF `shipPost`** (render → branch → MR) | — (Git is not money; retries live in the workflow) | refuse if an open MR exists for the post |
| `addComment(postId, text)` | `comments.add` | M | `{ siteId, postId, text }` (≤ 4 KB) | `post.comment` | `comments` row; audit "commented"; notify(→assignee + specialists on site) | — | n/a |

## 5. Images & assets

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `setSlotCandidates(slotId, candidates, meta?)` | `slotsInternal.setCandidates` | **IM** (only the visual-asset agent writes candidates) | `{ siteId, slotId, candidates[], provider, model? }` | internal | replace `candidates`; slot status `candidates`; audit "returned candidates" (actor `VISUAL_AGENT`); autopost → agent picks one | — | `(slotId, runId)` |
| `pickCandidate(slotId, candidateId)` | `slots.pickCandidate` | M | `{ siteId, slotId, candidateId }` | `asset.manage` | `selected`, slot `selected`; enqueue `WP assets.postProcess` (variants) if not done; audit "selected asset"; if all slots filled and post in needs-assets → transition (in-review or autopost gate) | — | n/a |
| `useCandidate(slotId)` | `slots.useCandidate` | M | `{ siteId, slotId }` | `asset.manage` | confirms current selection (same as above for the selected one) | — | n/a |
| `regenerateSlot(slotId, prompt?)` | `slots.regenerate` → `WP agents.visualAsset` | M + WP | `{ siteId, slotId, prompt? }` (≤ 2 KB) | `asset.manage` | `checkCap(image)`; `run` (image-generation); slot `generating`; audit "regenerated slot" | ✅ (provider spend debited per route attempt) | `run:<siteId>:slot:<slotId>:<n>` where n = regeneration counter |
| `uploadOwn(slotId, fileName)` | `assets.generateUploadUrl` → client PUT to R2 → `slots.attachUpload` | M + M | `{ siteId, slotId, contentType, bytes }` then `{ siteId, slotId, key, fileName }` | `asset.manage` | R2 signed upload URL (R2 component, verify API); `assets` (upload, provenance kind upload); candidate selected; enqueue `WP assets.postProcess`; audit "uploaded asset" | — | `(slotId, key)` |
| `markHumanOnly(slotId)` | `slots.markHumanOnly` | M | `{ siteId, slotId }` | `asset.manage` | `humanPinned: true`, status `human-only`; ledger item (owner specialist); audit "marked human-only" | — | `dedupeKey: human-only:<slotId>` |
| visual agent run (prototype `POST /api/visual-agent/run`) | `agents.visualAsset` | IA (`"use node"`) | `{ siteId, slotId, override? }` | internal (enqueued by workflow/WP) | port of `src/server/visual-agent/run.ts`; spend per attempt; `assets` + `candidates`; `artifacts` (provenance_log) | ✅ | `run:<siteId>:slot:<slotId>:<n>` |
| image variants | `assets.postProcess` | IA (`"use node"`, sharp) | `{ siteId, assetId, breakpoints[], format }` | internal | variant `assets` rows | — | `(parentAssetId, breakpoint, format)` |

## 6. Templates

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `ingestTemplate(fileName, kind, parsed?)` → manifestId | `templates.beginIngest` (signed upload URL) → client uploads `.html`/`.zip` to R2 → `templates.ingest` → **WP `templatesNode.parseBundle`** | M + M + IA | `{ siteId, fileName, kind, bytes }` then `{ siteId, uploadKey }` | `template.ingest` | manifest (`parsing`, version n+1); Node action unzips (fflate), `safeBundlePath()`, `MAX_BUNDLE_BYTES/FILES` from `render/bundle.ts`, writes `templateFiles` to R2, runs `parseTemplate()` with linkedom → mappings → `needs-confirmation`; audit "uploaded template", "parsed template" | — | `(siteId, uploadKey)` |
| (client pre-parse `parsed`) | accepted as a hint only; the server re-parses | | | | | | |
| `mapTemplateItem(manifestId, mappingId, role, label?)` | `templates.mapItem` | M | `{ siteId, manifestId, mappingId, role, label? }` | `template.ingest` | mapping update; audit "mapped template item" | — | n/a |
| `confirmManifest(manifestId)` | `templates.confirm` | M | `{ siteId, manifestId }` | `template.confirm`; no `needs-you` left | status confirmed, previous confirmed → superseded; audit "confirmed manifest"; posts held for `NO_MANIFEST` re-enter their gate | — | n/a |
| `setOutputFormat(manifestId, output)` | `templates.setOutput` | M | `{ siteId, manifestId, output }` | `template.ingest` | audit "set output format" | — | n/a |
| live preview files | `templates.fileUrl` | Q | `{ siteId, manifestId, path }` | `member` | R2 URL for a sanitised path (replaces `GET /api/templates/[manifestId]/files/[...path]`) | — | n/a |
| render preview | `render.preview` | A (`"use node"`) | `{ siteId, postId }` | `member` | `renderPost({ mode: "preview" })`; returns `{ html, held, warnings }` | — | n/a |

## 7. Git & merge requests

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `connectRepo(siteId, conn)` | `git.beginInstall` (returns GitHub App install URL with signed `state`) → `/github/setup` callback → `git.connectRepo` | A + H + M | `{ siteId }` then `{ siteId, installationId, repo, baseBranch, contentDir, assetDir, branchPattern, indexFiles? }` | `repo.connect` | verify installation has access to `repo` (Octokit, verify against GitHub docs); `repoConnections`; audit "connected repo"; notify "Repo connected" | — | `(siteId, host, repo)` |
| `mergeMr(mrId)` | `git.merge` → `IA gitNode.mergePr` | M + IA | `{ siteId, mrId }` | `mr.merge`; `ci === "passing"` unless repo has no CI (`none`) | merge via API (merge method from repo settings, verify); status set by webhook, not by the call result alone; audit "merged" | — | `merge:<mrId>:<headSha>` |
| `rebaseMr(mrId)` | `git.rebase` → **WF `shipPost`** (re-render from current confirmed manifest + current base, force-push the post branch only) | M + WF | `{ siteId, mrId }` | `mr.rebase` | audit "rebased and re-rendered"; CI re-runs | — | `rebase:<mrId>:<baseSha>` |
| (open MR) | `gitNode.openPr` | IA (`"use node"`, Octokit) | `{ siteId, postId, render, assets[] }` | internal | branch from `branchPattern`, one commit (post file + assets + index files), PR with description (keyword, intent, gate result, internal links, schema types, unresolved overrides); `mergeRequests`; audit "opened MR"; notify | — | branch name = `content/<slug>`; re-run finds existing PR by head branch |
| auto-merge | `gitInternal.maybeAutoMerge` | IM → IA | `{ mrId }` | internal; only `autopost === true` and `sites.publishing.autoMergeOnGreenCi` and `ci === "passing"` and gate still green for `postVersion` | `gitNode.mergePr`; audit actor `AUTOPOST_ACTOR` | — | `automerge:<mrId>:<headSha>` |

## 8. Runs, schedules, settings, spend

| Store action | Convex function | Kind | Args | Auth | Effects | Effect | Idem key |
|---|---|---|---|---|---|---|---|
| `runNow(kind)` | `runs.runNow` | M | `{ siteId, kind }` | `run.trigger` | `estimateRun()` + `checkCap()`; refused → `runs` row `refused-over-cap` + audit + notify; else **WF `scheduledRun`** (same function the cron uses: manual = scheduled, PRD goal 5); audit "triggered run" | ✅ | `run:<siteId>:<kind>:manual:<minute bucket>` (double-click safe) |
| `toggleSchedule(kind)` | `schedules.toggle` | M | `{ siteId, kind }` | `schedule.toggle` | `enabled`, recompute `nextAt`; audit "paused/resumed schedule" | — | n/a |
| `setBudget(kind, capUsd)` | `settings.setBudget` | M | `{ siteId, kind, capUsd }` (0 < cap ≤ workspace max) | `budget.set` (admin) | `sites.budgetCaps`; audit "changed budget" | — | n/a |
| `setRouting(slotType, provider)` | `settings.setRouting` | M | `{ siteId, slotType, provider }` | `routing.set` | `sites.routing`; audit "changed image routing" | — | n/a |
| `setModelRouting(task, tier)` | `settings.setModelRouting` | M | `{ siteId, task, tier }` | `routing.set` | `sites.modelRouting`; audit "changed model routing" | — | n/a |
| (spend debit/refund) | `spend.debit` / `spend.credit` | IM | `{ siteId, budget, amountMicroUsd, reason, idempotencyKey, runId? }` | internal; the `WalletLedger` adapter for Effect | `spendEntries` + `sites.spend` in one mutation; 80% → notify(→admins) once per month per budget | ✅ (caller) | caller key |
| `connectSearchConsole(siteId)` | `gsc.beginOAuth` → `/oauth/google/callback` (`H`) → `gscInternal.storeConnection` | A + H + IM | `{ siteId, redirectTo }` | `searchConsole.connect` | PKCE state (`oauthStates`), tokens encrypted into `secrets`, property pick (`gsc.listProperties` / `gsc.setProperty`); audit "connected Search Console"; schedules first import | — | state hash single-use |
| `resolveLedgerItem(itemId)` | `ledger.resolve` | M | `{ siteId, itemId }` | any role except stakeholder? **No:** today `resolveLedgerItem` has no permission guard in the store; backend uses `post.edit` (decision D9) | `done`; audit "resolved ledger item" | — | n/a |

### Connections (C12; replaces `app/api/connections/**`)

| Prototype route | Convex function | Kind | Auth | Notes |
|---|---|---|---|---|
| `GET /api/connections?siteId` | `connections.list` | Q | `routing.set` to see secrets hints; `member` sees label/status only | never returns `secretId` |
| `POST /api/connections` (upsert) | `connections.upsert` | A (`"use node"`) | `routing.set` | validate URL (https only in prod; `stdio` rejected), seal secret → `secretsInternal.put`, store `secretHint` (`hintOf`) |
| `DELETE /api/connections/[id]` | `connections.remove` | M | `routing.set` | deletes connection + its `secrets` row |
| `POST /api/connections/[id]/test` | `connections.test` | A (`"use node"`) | `routing.set` | port `testConnection()` / `probeApi()` / `withMcpClient()`; caches `tools` |

## 9. Notifications, undo, demo

| Store action | Convex function | Kind | Args | Auth | Notes |
|---|---|---|---|---|---|
| `markNotificationRead(id)` | `notifications.markRead` | M | `{ id }` | self | |
| `markAllNotificationsRead()` | `notifications.markAllRead` | M | `{ siteId? }` | self | batched (≤ 500 per call, reschedules itself) |
| `dismissToast(id)` | client only | | | | |
| `undo()` | **no generic undo.** Toast "Undo" calls the specific inverse mutation where one exists | | | | Reversible: `moveToWeek`, `pickCandidate` (re-pick previous), `setBudget`, `setRouting`, `setModelRouting`, `toggleSchedule`, `setAutopost`, `rejectSuggestion` (re-open). Irreversible (no Undo button): approve, merge, runs, idea reject (re-add instead). Decision D10. |
| `resetDemo()` | `devSeed.reset` | IM | | dev deployments only (`CMS_DEV_TOOLS=1`) | seeds `src/lib/seed.ts` data |

### Notification fan-out (replaces the per-site `notify()` list)

| Event | Recipients |
|---|---|
| Approval requested / Autopost held a post / Revision ready | site members with `post.approve` (+ assignee) |
| MR opened · CI failing · green MR waiting (auto-merge off) | site members with `mr.merge` |
| Run refused over cap · budget at 80% | site admins (+ workspace owner/admin) |
| Pivot trigger | site specialists + admins |
| Repo / Search Console connected or expired | site developers + admins |
| Comment | post assignee + specialists on the site, minus the author |
| Takeover of an edit lock | previous lock holder |

Dedup with `dedupeKey` (e.g. `cap80:<siteId>:<month>:<budget>`).

---

## 10. Workflows (`@convex-dev/workflow`, [NEW] component)

| Workflow | Started by | Steps (each a `step.runAction`/`runMutation`, retried by the component) | Ends |
|---|---|---|---|
| `postPipeline` | `approveIdea` (autopost), `generateNow` | brief → draft (writer agent) → optimize (on-page agent) → slots fan-out (`WP visualAsset` per slot) → wait-for-slots → branch: autopost ? start `autopostGate` : transition in-review | in-review, or hands to `autopostGate` |
| `autopostGate` | `postPipeline`, `shipNow`, slot filled under autopost | `evaluateGate` + `autopostDecision` → apply fixes (agent edits as suggestions auto-accepted by `AUTOPOST_ACTOR`) → re-evaluate → ship ? start `shipPost` : hold (ledger "Autopost held: <reason>", in-review) | `shipPost` or held |
| `shipPost` | `approve`, `autopostGate`, `rebaseMr` | render (publish mode, fidelity hold) → assets ready → open/update PR → transition mr-open | mr-open (then webhooks drive it) |
| `revise` | `sendBack` | writer applies note → optimizer → transition in-review | in-review |
| `scheduledRun` | `schedules.tick`, `runNow` | estimate → cap check → run harness agent(s) for `kind` → persist artifacts → domain writes (ideas, ledger, reports, refresh drafts) | run succeeded/failed |
| `afterMerge` | GitHub `pull_request.closed(merged)` webhook | transition live → `liveAt`, commit sha → indexing request (verify Search Console URL Inspection / Indexing API capabilities before promising "submit for indexing") → `sched` kas recalc +24 h | live |

Workpool pools (**[NEW]** `@convex-dev/workpool`): `agents` (text model calls, parallelism ~4 per deployment), `images` (provider calls, ~2), `git` (Octokit, 1 per installation to avoid secondary rate limits; verify GitHub limits), `gsc` (1).

## 11. HTTP endpoints (`apps/cms/convex/http.ts`)

| Path | Method | Source | Verify | Handles | Writes |
|---|---|---|---|---|---|
| `/github/webhook` | POST | GitHub App | `X-Hub-Signature-256` HMAC with `GITHUB_APP_WEBHOOK_SECRET`; dedupe `X-GitHub-Delivery` in `webhookEvents` | `pull_request` (opened, synchronize, closed+merged, closed), `check_suite` / `check_run` completed, `status`, `installation` (deleted, suspend), `installation_repositories` (removed) | `mergeRequests.ci/status/headSha`; `afterMerge`; auto-merge; repo `suspended`; post timeline `ciDetail` |
| `/github/setup` | GET | GitHub App "Setup URL" redirect after install | signed `state` (site + user + expiry) | links `installation_id` to the site's pending connect | redirects to `/s/<slug>/settings?tab=repo` |
| `/gitlab/webhook` | POST | GitLab (v1) | `X-Gitlab-Token` per integration (verify) | `merge_request`, `pipeline` | same as GitHub |
| `/clerk/webhook` | POST | Clerk (Svix) | `verifyWebhook` from `@clerk/backend/webhooks` (as in `apps/web/convex/clerkWebhook.ts`) | `user.created/updated/deleted`, `organization.created/updated/deleted`, `organizationMembership.created/updated/deleted`, `organizationInvitation.accepted/revoked` (event names: verify against Clerk docs) | `users`, `workspaces`, `workspaceMembers`, `invites` → apply `siteRoles` to `memberships` |
| `/polar/webhook` | POST | Polar | Polar component signature check (`apps/web` routes it as `/payments/webhook` → `subscriptions.paymentWebhook`; verify component API) | `subscription.created/updated/canceled/revoked` | `siteSubscriptions` (site from checkout metadata `siteId`) |
| `/autumn/webhook` | POST | Autumn | verify against Autumn docs; **optional**: balances can be pulled by `spend.reconcileAutumn` cron instead | usage/balance events | reconcile only |
| `/oauth/google/callback` | GET | Google OAuth | single-use `oauthStates` + PKCE (port of `apps/web/convex/googleWorkspace.ts` `oauthCallback`) | Search Console tokens | `oauthConnections`, `secrets` |

## 12. Crons (`apps/cms/convex/crons.ts`)

| Cron | Schedule (UTC) | Function | Does |
|---|---|---|---|
| Schedule tick | every 5 min | `schedules.tick` (IM) | `schedules.by_enabled_next` ≤ now, site active, not paused → start `scheduledRun`, advance `nextAt` (site timezone) |
| Per-publish-slot generation | inside `schedules.tick` | | briefed posts whose `week` = current ISO week and no live workflow → `postPipeline` (autopost) or notify specialist |
| GSC daily import | daily 04:00 | `gsc.importAll` → `WP gsc.importSite` | Search Analytics query for `lastImportedDate+1 … today-3` (GSC data lag, verify), upsert `positionHistory`, `keywords.impressions/position` |
| GSC weekly rollup | Mon 05:00 | `gsc.rollupWeekly` | `trafficWeekly`, `keywords.positionTrend`, decaying flags |
| KAS weekly | via `schedules` (`kas-recalc`, weekly) + `afterMerge` +24 h | `kas.recalc` | `computeKas`, `concentration`, `pillarDistribution` → `kasSnapshots` + caches |
| Ledger escalation | daily 07:00 | `ledger.escalate` | items crossing `LEDGER_OVERDUE_DAYS` (7) / `LEDGER_BLOCKER_DAYS` (14) → notify once (`dedupeKey`) |
| Autumn reconcile | daily 03:00 | `spend.reconcileAutumn` | compare `spendEntries` month totals with Autumn usage; mismatch → Sentry + admin notification (ledger is truth) |
| Presence sweep | every 1 min | `presence.sweep` | delete `presence.at < now - 2 min`, `editLocks.heartbeatAt < now - 5 min` |
| OAuth refresh | hourly | `gsc.refreshExpiring` | refresh tokens expiring in < 15 min; failure → `reconnect_required`, `sites.searchConsole = "expired"`, notify |
| Webhook log prune | daily | `webhookEvents.prune` | delete processed rows > 30 days |
