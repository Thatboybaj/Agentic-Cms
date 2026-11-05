# Store API (`src/lib/store.tsx`, `src/lib/workspace.ts`, `src/lib/logic.ts`)

Merge requests live in `data.mergeRequests` (use `useMrForPost` / `post.mrId`, never `post.mr`). Gate score = the
optimizer's 12 checks; extra gate-derived soft blocks (word count, disclaimer) appear only in `useGate().soft`.
Every mutating action logs audit (actor = the signed-in person); refused actions toast red and return
`{ ok: false, reason }`. `actions.undo()` one level, per tab. Simulated agent work lives in `state.jobs` (timings `SIM_MS`).
Clock pinned to Fri 25 Sep 2026 10:42 Lagos (W39); tabs share one anchor (`cms.clock.v1`, re-pinned after 6 h).

## Multi-site, multi-user (docs/multi-site-contract.md)

| Where | What | Key |
|---|---|---|
| localStorage (shared by every tab) | domain state `ICmsState` v2 | `cms.state.v2` |
| sessionStorage (per tab) | `{ userId, lastSiteId }` — who this tab is, last-used site | `cms.session.v1` |
| localStorage | job-runner lease `{ tabId, until }` | `cms.leader.v1` |
| localStorage | demo clock anchor (real epoch ms) | `cms.clock.v1` |

- **Current user is per tab** (default `DEFAULT_USER_ID` = Tolu B., specialist). Two tabs can be two people.
- **Cross-tab sync**: a write in one tab fires `storage` in the others → they re-read and re-render. Every mutation
  re-reads storage first and applies to the fresh state, so an action from a tab that missed an event isn't lost
  (last write wins only for the same field).
- **One job runner**: the tab holding the lease (renewed every `LEADER_HEARTBEAT_MS` = 2 s, expires after
  `LEADER_LEASE_MS` = 5 s, released on unmount) arms the timers; `fire()` only runs jobs still queued in the fresh state.
  Job toasts appear in the leader tab; every tab sees the resulting state. Jobs of **paused** sites wait until resume.
- **Site comes from the scope (URL)**, never shared state. Actions objects are bound to one site id (`actionsFor`).
- **Effective role** on a site: workspace `owner`/`admin` → `admin`; else the `IMembership.role`; else **no access**.
  Suspended users have no access anywhere. `can()/why()` evaluate it.
- **Tenant isolation**: `useCms().state`, `useWorkspace()`, `usePortfolio()`, `useInbox()`, `usePresence()` only ever
  contain sites the user can access (`isolatedState`). Actions on an inaccessible site refuse ("You don't have access
  to <Site>"); ids from another tenant are "not found" because each actions object only looks inside its own site.
- **Hrefs are absolute**: toasts and stored notification hrefs are `/s/<slug>/…` (reducers write site-relative paths;
  the store prefixes them with `absHref`). Inbox item hrefs are absolute too. Don't wrap them in `sitePath` again.

### Migration
`cms.state.v2` present → loaded (additive fix-ups: slug/industry/status/createdAt from the seed, `publishing`, empty
`presence`/`audit`/`accessRequests`). Else `cms.state.v1` → migrated: the seed's workspace, people and memberships
with every v1 site, its data and in-flight jobs carried over; v1 `siteId` becomes the tab's last-used site; v1 `role`
is dropped (console note); v2 is written and the v1 key removed. Corrupt/unknown data → reseed with a `[cms]`
console note. Never throws (`loadPersisted` in `src/lib/migrate.ts`).

## Providers and scope

```
<CmsProvider fallback?: ReactNode persist?: boolean = true store?: CmsStore>   // mounted by the app shell

<SiteScope slug: string fallback?: (s: ISiteStatus) => ReactNode path?: string>  // app/(app)/s/[site]/layout.tsx
   // ready → provides the site to useSite()/useCms(); records presence for usePathname() (heartbeat 60 s);
   //         remembers the site as this tab's last-used site.
   // otherwise renders fallback(status) — pass one that uses DS components — or a plain unstyled default.
useSiteStatus(slug): ISiteStatus
   // { status: "ready" | "not-found" | "no-access" | "signed-out"; slug;
   //   site: { id, slug, name, domain, icon, accent, status } | null   // identity only, never data
   //   requested: boolean; requestAccess(): TResult }
```

## Site hooks

```
useSite(): { site; slug; data; role: TRole; can(p); why(p); actions: ICmsActions; me: IUser }   // throws outside SiteScope
useCms(): { state: ICmsStateView; site; slug; data; role; me: IMember; user: IUser; scoped: boolean;
            actions: ICmsActions; can(p): boolean; why(p): string | null }
   // Inside SiteScope: the scoped site. Outside: never throws — the tab's last-used (else first accessible) site,
   // scoped: false. No accessible site at all: an empty placeholder site, can() always false.
   // ICmsStateView = isolated ICmsState + compat { siteId; role (effective); members: IMember[] (people on this site) }
useSiteSlug(): string | null            // slug of the enclosing scope
useActions(): ICmsActions               // = useCms().actions
useSiteActions(siteId): ICmsActions     // actions bound to any site (workspace rows); still role-checked
useActionsForSite(): (siteId) => ICmsActions
useEditLock(postId?): { holder: IEditLockHolder | null; mine: boolean }   // holder = someone else's fresh lock
useToasts(): IToast[]
usePost(id?) · useSlotsForPost(postId?) · useSlot(slotId?) · useKeyword(id?)
useMergeRequest(id?) · useMrForPost(postId?) · useActiveManifest()   // latest confirmed
useGate(postId?): (IGateResult & { manifest; post }) | null
   // IGateResult = { hard: string[]; soft: IGateCheck[]; canApprove; passed; total;
   //                 openFacts; unfilledSlots; failingHard; missingStructures }
useLedger(): (ILedgerItem & { age; status: "open"|"overdue"|"blocker" })[]
useStats(): { counts: Record<TPostState,number>; total; needsHuman; overdue; blockers; approvalsWaiting;
              hardBlocked; humanOnlySlots; agentsRunning; runningRuns; openMrs; failingMrs;
              cadence: { shipped; target; week }; unread; budgets: { text|image: { spent; cap; pct } };
              gap: { pct; actual; projected; week } | null; concentration: { top; fragile; keywordIds }; dataGap }

usePendingIdeas(): IPost[]                  // ideas waiting for approval, planned week first
useAutopostHold(postId?): ILedgerItem | undefined   // open "Autopost held: <reason>" item for a post
useStats() also returns ideasPending (pending ideas) and held (in-review posts the autopost gate held)

ICmsActions → TResult = { ok: true; id? } | { ok: false; reason }   // all site-scoped; the site is bound, signatures unchanged
setSite(siteId)                // remembers it as this tab's last-used site (navigation is the router's job)
setRole(role)                  // compat "View as": signs this tab in as the person with that role on the site
addIdea(topicOrKeyword, pillarId?) → id · movePostToWeek(postId, week)
approveIdea(postId)            // idea → briefed, records post.ideaApproval + audit; autopost site: drafting starts after SIM_MS.brief
rejectIdea(postId, note)       // note ≥ 3 chars; the post leaves data.posts → data.rejectedIdeas (swarm dedup, audit)
promoteToBrief(postId)         // a pending idea is approved on the way (drag Idea → Briefed = approval)
generateNow(postId)            // Briefed or Decaying only; an unapproved idea is refused ("Approve the idea first…")
shipNow(postId) → mrId         // autopost sites, Needs assets / In review: runs the agent gate now; ships or holds
setAutopost(siteId, on) · setAutoMerge(siteId, on)
setSlotCandidates(slotId, candidates: ICandidate[], meta?: { provider; model? })  // replaces candidates, status "candidates",
                               // provenance per candidate (source.kind generated|diagram|sourced|upload); autopost: agent picks one
acceptSuggestion(postId, suggestionId) · rejectSuggestion(postId, suggestionId)
instructAgent(postId, instruction, blockId?) · editBlock(postId, blockId, text) · editSeoTitle(postId, seoTitle)
restoreVersion(postId, versionId) · addFactSource(postId, markerId, url) · rewriteFactWithout(postId, markerId)
fixCheck(postId, checkId) · overrideCheck(postId, checkId, reason /* ≥8 chars; soft only */)
pickCandidate(slotId, candidateId) · useCandidate(slotId) · regenerateSlot(slotId, prompt?)
uploadOwn(slotId, fileName) · markHumanOnly(slotId)
sendToReview(postId) · sendBack(postId, note) · approve(postId, overrides?: Record<checkId, reason>) → mrId
mergeMr(mrId) · rebaseMr(mrId)
confirmManifest(manifestId) · mapTemplateItem(manifestId, mappingId, role, label?)
ingestTemplate(fileName, kind: "html"|"zip", parsed?: { mappings: ITemplateMapping[]; sampleHtml?; source? }) → manifestId
   // no `parsed`: simulated parse (timer → needs-confirmation); with `parsed`: stored immediately as needs-confirmation,
   // sampleHtml kept on the manifest (ITemplateManifest.sampleHtml)
setOutputFormat(manifestId, "mdx"|"html"|"json"|"component")
connectRepo(siteId, conn: IRepoConnection) · connectSearchConsole(siteId)
runNow(kind: TRunKind) · toggleSchedule(kind)
setBudget(kind: "text"|"image", capUsd) · setRouting(slotType, provider) · setModelRouting(task, tier)
addComment(postId, text) · resolveLedgerItem(itemId)
markNotificationRead(id) · markAllNotificationsRead() · dismissToast(id) · undo() · resetDemo()
Paused sites refuse generateNow / shipNow / regenerateSlot / runNow ("<Site> is paused · resume it to run agents").

New, site-scoped:
assignPost(postId, userId | null)        // post.edit; assignee must have access to the site; audit + toast (undoable)
startEditing(postId, { takeOver? }) → TLockResult
   // TLockResult = { ok: true } | { ok: false; reason; heldBy?: { userId; name; since } }
   // refused (no toast) with heldBy while another person's lock is fresh (< EDIT_LOCK_MS = 2 min) → "<Name> is editing";
   // takeOver → takes it, audit "took over editing", toast. Re-call at least every minute to keep the lock fresh.
   // While someone else holds a fresh lock, editBlock / editSeoTitle refuse "<Name> is editing · view only".
stopEditing(postId)                      // releases my lock (no-op if not mine)

New, workspace-level (also on useWorkspace().actions; site-independent):
inviteUser(email, siteRoles: Record<siteId, TRole>) → id = userId     // members.manage; seats checked; status "invited"
setMembership(userId, siteId, role | null)                              // members.manage; grants close access requests
setWorkspaceRole(userId, "owner" | "admin" | "member")                  // only an owner grants/removes owner; ≥1 owner
addSite({ name, domain, industry?, icon? }) → id = slug                 // site.add; status "onboarding"; becomes last-used
pauseSite(siteId) · resumeSite(siteId)                                  // site.add
requestAccess(siteId)                                                   // from the no-access state; admins see it in useInbox()
signInAs(userId) · signOut()                                            // per tab; signing in as an invitee accepts the invite

can()/why() keys:
plan.view, seo.view, audit.view, post.comment → all roles
idea.create, idea.approve, publishing.set, post.promote, post.generate, post.schedule, post.edit, post.sendToReview,
post.sendBack, post.approve (also Ship now), gate.override, asset.manage, run.trigger, schedule.toggle → specialist, admin
mr.merge, mr.rebase, template.ingest, template.confirm, repo.connect, searchConsole.connect → developer, admin
budget.set, routing.set, members.manage, site.add, publishing.autoMerge → admin only
(evaluated with the effective role on the site; no access → false, why = "You don't have access to <Site>")
```

## Workspace hooks

```
useWorkspace(): { workspace: IWorkspace; me: IUser /* "Signed out" guest when signedIn is false */; signedIn;
                  workspaceRole: TWorkspaceRole | null; users: IUser[]; workspaceRoles: Record<userId, TWorkspaceRole>;
                  memberships: IMembership[] /* all for admins, else only on my sites */; sitesForMe: ISite[];
                  roleOn(siteId): TRole | null; canWorkspace(p); whyWorkspace(p);
                  lastSiteSlug: string | null; signInAs(userId); signOut(); actions: IWorkspaceActions }
   // TWorkspacePermission = "members.manage" | "site.add" | "billing.view" → owner/admin
usePortfolio(): IPortfolioRow[]   // one per accessible site:
   // { site; slug; role; status; counts: Record<TPostState, number>; pipeline; needsMe; held; ideasPending;
   //   approvalsWaiting; failingMrs; spend: { text|image: { spent; cap; pct } }; gap: IGap | null;
   //   lastActivity: IAuditEvent | null; here: number /* others on the site now */; autopost: boolean }
useInbox(): IInboxItem[]          // newest first, role-aware, across my sites:
   // { id; kind; siteId?; siteSlug?; siteName?; title; detail; at; href /* absolute */; tone; postId? }
   // kind: "idea" (idea.approve) · "review" / "held" (post.approve; held = open autopost-hold) · "human-slot" (asset.manage)
   //       · "ledger-overdue" (owner = me, ≥ 7 days) · "ci-failing" (mr.rebase: red CI or conflict) · "assigned" (assigneeId = me)
   //       · "invite" / "access-request" (workspace admins; no siteId)
usePresence(siteId?, path?, opts?: { includeMe? }): IPresenceView[]
   // fresh (< PRESENCE_FRESH_MS = 15 min), accessible sites only; path exact or prefix with trailing "*"; excludes me by default
   // IPresenceView = IPresence & { user: IUser; isMe; site: { id; slug; name } }
```

Pure versions (tests, server): `effectiveRole`, `accessibleSites`, `canAccessSite`, `canWorkspace`, `isolatedState`,
`inboxFor`, `portfolioFor`, `presenceFor`, `computeStats`, `siteMembers`, `otherEditor`, `absHref` in `src/lib/workspace.ts`.

## Headless / tests

```
createCmsStore(opts?: boolean | { persist?; env?: ICmsEnv })   // default: memory only, always the job runner
createMemoryStorageBus() → { shared: Map; tab(): ICmsEnv }     // simulated tabs sharing localStorage + storage events
store.actionsFor(siteId) · store.actions (unscoped site) · store.workspaceActions · store.userId() · store.isLeader()
store.recordPresence(siteId, path) · store.setLastSite(siteId) · store.hydrate() · store.stop()
```

## Seed (Grandeur workspace, `src/lib/seed.ts` + `src/lib/seed-sites.ts`)

8 sites (id = slug): `lumen` Lumen Dental (full data, autopost on), `northwind` Northwind Legal (autopost off, no repo,
text cap nearly spent), `harbor` Harbor Vets (held post, overdue ledger), `kora` Kora Fintech (red CI !31, held over
cap), `atlas` Atlas Physio (onboarding, no repo), `sable` Sable Coffee (autopost off, human-only slot), `meridian`
Meridian Realty (paused, MR conflict, decaying post), `juniper` Juniper Skincare (onboarding, no manifest).
7 people: Tolu B. `m-tb` (specialist on lumen, northwind, harbor, sable), Kunle O. `m-ko` (developer on 6), Amaka E.
`m-ae` (workspace owner), Dr Ada Okafor `m-ao` (stakeholder, lumen), James Hart `u-jh` (stakeholder, northwind),
Zainab M. `u-zm` (specialist on kora, atlas, meridian, juniper; developer on sable), David C. `u-dc` (invited developer,
juniper + sable). Presence for Kunle, Ada, Amaka (lumen), Zainab (kora), James (northwind). Amaka holds the edit lock
on `p-veneers` at 10:42. Lumen/Northwind fixture ids are unchanged.

## Publishing: idea approval + autopost (00-decisions C10–C11)

Fields: `ISite.publishing = { autopost; autoMergeOnGreenCi; humanOnlyAssets? }` (seed: Lumen on/on, Northwind off/off; new
sites on/on; older localStorage state is migrated from the seed on hydrate). `IPost.ideaApproval = { status: pending|approved|rejected;
by?; at?; note? }` (absent on an Idea = pending). `ICandidate.url?` + `ICandidate.source?` (provenance). `IImageSlot.humanPinned?`
(a person marked it human-only; the agent never fills it). `IMergeRequest.autopost?`. `ILedgerItem.kind?: "autopost-hold" |
"autopost-refused"`. `ISiteData.rejectedIdeas?`. Job kinds `autopost-brief`, `autopost-gate`, `auto-merge`.

Only ideas need a person. With autopost on: approveIdea → Briefed → (brief) Drafting → Needs assets → the visual-asset agent
picks/fills slots → `autopost-gate` job → `autopostDecision()` → fixes (rewrite unsourced claims without them, fixable hard
checks, disclaimer, slot fills; soft blocks accepted with reason "Autopost · agent accepted soft block") → approve + MR as
"CMS agent (autopost)" → CI → auto-merge when green and `autoMergeOnGreenCi` → Live (KAS recalc in 24 h). A hold (autopost
off, no repo, template can't render, over cap, provider failure, a person's human-only slot, an unfixable hard check) puts
the post In review with ledger item "Autopost held: <reason>"; red CI leaves the MR open. Auto-merge only ever applies to
MRs with `autopost: true`; human-approved MRs still wait for a developer. Everything is audited with actor "CMS agent (autopost)".

`logic.ts` adds: ideaStatus, isPendingIdea, ideaGate, autopostDecision(post, gate, site) → { action: "ship"|"hold"; fixes;
reason?; plan }, publishingSteps(publishing), AUTOPOST_ACTOR, VISUAL_AGENT, AUTOPOST_SOFT_REASON, AGENT_FIXABLE_CHECKS.
UI: `PublishingSettings` (src/features/settings/publishing.tsx, link target `/settings?tab=publishing`), idea rows in
`src/features/plan/idea-actions.tsx`.

`logic.ts` exports: POST_STATES, POST_STATE_LABEL, STATE_OWNER, STATE_EXIT, stateTone, RUN_META, TIER_LABEL,
INTENT_LABEL, LEDGER_LABEL, LEDGER_TONE, ROLE_LABEL, rankingKeywords, postKas, postUrl, pillarDistribution,
orphanWeight, computeKas, concentration, evaluateGate, estimateRun, checkCap, gapToProjection, and formatters
fmtUsd, fmtUsdWhole, fmtShare, fmtDelta, fmtInt, fmtDateTime, fmtDate, fmtDay, fmtTime, fmtAgo, fmtAgeShort (Lagos time).
Note `@/ds` also exports label/format helpers (STATE_LABEL, formatUsd…); prefer `@/lib/logic` formatters for data.
