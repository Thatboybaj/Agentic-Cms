---
name: cms-backend-06-git-and-merge
description: >
  GitHub App integration (install + repo connect, path-scoped commits, one branch/PR per post, PR description,
  webhooks for CI and merge, CMS-driven auto-merge under autopost, rebase/re-render, conflicts), then GitLab for v1.
---

# Handoff 06: Git and merge requests

| | |
|---|---|
| Size | **L** (GitHub M, GitLab M) |
| Depends on | 01, 02 (`openPrStep`, `gitInternal.onCi/onMerged`), 04 (assets), 05 (rendered file) |
| Unblocks | 07 (merge → KAS), 09 |

## Goal

The CMS agent is the only repo writer: it opens one branch and one PR per post containing only the post file, its
assets and declared index files; reads CI; merges its own autopost PRs on green CI; rebases and re-renders when the
base moves; and never pushes to the base branch.

## Why

PRD Module 5 and the security section ("a compromised CMS still cannot deploy anything a human did not merge" holds
for human-approved posts; under autopost, C10 moves the trust to the gate + the customer's CI, so the path allowlist
and gate re-check at merge time become the safety).

## Inputs (read first)

- PRD Module 5 (connection, branch and commit, MR contents, CI, after merge, conflicts) and "Repo access"
- `00-decisions.md` C10/C11; `harness-config.yaml` `publishing`; `store-api.md` auto-merge rules
- `apps/cms/src/lib/types.ts` `IRepoConnection`, `IMergeRequest`; `logic.ts` `mrRef`
- `store.tsx` `approve()`/MR creation (`opened MR` audit, MR description fields), `mergeMr`, `rebaseMr`, `ci-result`, `auto-merge` jobs
- [../api-map.md](../api-map.md) §7, §11 (`/github/*`, `/gitlab/webhook`); [../README.md](../README.md) §9, §13
- GitHub docs: Apps (installation tokens, permissions, Setup URL, webhooks + `X-Hub-Signature-256`), Git Data API (trees/commits/refs) or Contents API, Pulls API, Checks API, merge methods. Octokit docs. **Verify everything; nothing here is a substitute.**

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/git.ts` | `beginInstall`, `connectRepo`, `merge`, `rebase`, `mr`, `mrForPost` |
| `apps/cms/convex/gitNode.ts` (`"use node"`) | Octokit App auth, `openPr`, `updatePr`, `mergePr`, `rebaseBranch`, `verifyInstallation`, `readRepoLayout` |
| `apps/cms/convex/gitInternal.ts` | `onCi`, `onMerged`, `onClosed`, `maybeAutoMerge`, `onInstallationRemoved` (replace 02 stubs) |
| `apps/cms/convex/lib/pathScope.ts` | `assertWritable(paths, repoConnection)`: allowlist = `contentDir/**`, `assetDir/**`, `indexFiles`; refuses `..`, absolute, `.github/**`, workflow/config files |
| `apps/cms/convex/lib/prDescription.ts` | MR description builder (keyword, intent, gate result, internal links, schema types, unresolved overrides, autopost note, preview link) |
| `http.ts` routes | `/github/webhook`, `/github/setup`, later `/gitlab/webhook` |
| GitLab: `gitlabNode.ts` | same interface as `gitNode.ts` (v1, second half) |

## Steps

1. **Install flow.** `git.beginInstall(siteId)` (developer/admin) → URL `https://github.com/apps/<slug>/installations/new?state=<signed>` (verify param) → `/github/setup` verifies `state` (HMAC, expiry, site, user), records the installation id, redirects to the site's settings repo tab where the developer picks the repo and declares `baseBranch`, `contentDir`, `assetDir`, `branchPattern`, `indexFiles` → `git.connectRepo` verifies the installation can see the repo, reads the layout to suggest defaults, writes `repoConnections`, audit "connected repo" with the exact store detail ("Writes only to … · never pushes to …").
2. **Path scope.** Every write goes through `assertWritable`. Unit-test the allowlist hard. Setup checklist (D8): base branch protected with required status checks; recommend a ruleset limiting the App to non-base branches (verify GitHub ruleset options).
3. **openPr** (`openPrStep`): branch name from `branchPattern` (`content/{slug}` default); one commit with post file + selected asset variants + index files; conventional message (`content(blog): add <slug>`); PR title/description from `prDescription`; if branch/PR exists (retry) update instead (idempotent by head branch). Write `mergeRequests` (`number`, `externalId`, `headSha`, `files`, `manifestVersion`, `postVersion`, `autopost`); audit "opened MR" (actor `AUTOPOST_ACTOR` or "CMS agent"); notify developers.
4. **Webhooks.** Verify signature over the raw body; dedupe `X-GitHub-Delivery`; resolve site via `repoConnections.by_installation` / `by_repo` (I7); ignore events for unknown repos with 200. Map: `check_suite.completed` / `check_run.completed` / `status` for the PR's `headSha` → `onCi(passing|failing|pending, detail)`; no checks configured → `ci: "none"` after a grace period (decide: treat `none` as mergeable only for human merges); `pull_request.closed` merged → `onMerged`; closed unmerged → MR `closed`, post back to in-review + notify; `synchronize` from someone else → refresh `headSha`, mark CI pending; `installation.deleted` / `installation_repositories.removed` → `onInstallationRemoved`.
5. **Auto-merge (D5).** `maybeAutoMerge` only when `mr.autopost && site.publishing.autopost && site.publishing.autoMergeOnGreenCi && mr.ci === "passing"` for the current `headSha`, and the gate is still green for `postVersion` (re-evaluate). Merge method = repo default (verify API). Audit actor `AUTOPOST_ACTOR`, detail "auto-merged on green CI". If auto-merge is off: notify "green · waiting for a developer" (store wording).
6. **Human merge.** `git.merge` (`mr.merge`): requires `ci === "passing"` (or `none` with explicit confirm), merges via API; final state from the webhook.
7. **Rebase / conflicts.** `git.rebase` (`mr.rebase`) or automatic when GitHub reports the PR not mergeable: re-render from the current confirmed manifest on the current base (`shipPost` with `rebase: true`), force-push **the post branch only**, audit "rebased and re-rendered". If files outside the allowlist conflict or re-render fails → `status: conflict`, `conflictDetail`, notify developer; never force onto base.
8. **Rate limits.** `git` Workpool parallelism 1 per installation; respect secondary rate limits and `Retry-After` (verify).
9. **GitLab (v1).** Same interface: OAuth app / group-level integration (verify), merge request API, `merge_request` + `pipeline` webhooks with `X-Gitlab-Token`, path allowlist identical. Ship behind `host: "gitlab"` after GitHub is stable.

## Interfaces it must honour

- `openPrStep` I/O and `gitInternal.onCi/onMerged` signatures from 02.
- `IMergeRequest` fields (types.ts) via `schema.md` `mergeRequests`.
- Auto-merge rule: invariant 6 in `schema.md`.

## Test plan

| Kind | Cases |
|---|---|
| Unit | `assertWritable` refuses `.github/workflows/x.yml`, `package.json`, `../`, `contentDir` prefix tricks (`content/blog-evil/…` when contentDir is `content/blog`); PR description contains keyword, intent, gate result, overrides |
| Webhook fixtures | signature invalid → 401; replayed delivery → no-op; out-of-order `check_suite` for an old `headSha` → ignored; merged → post live + KAS scheduled |
| Golden | autopost MR + green → merged by `AUTOPOST_ACTOR`; human-approved MR + green → not merged until `git.merge`; autopost MR + red → open, `ciDetail` on timeline; post edited after PR open → re-approval needed, PR updated on next ship |
| Conflict | base moved, clean re-render → force-push branch, CI re-runs; unresolvable → `conflict`, never merged |
| Isolation | webhook for repo X can only touch the site whose `repoConnections` row owns X; a forged `siteId` in the payload is ignored |
| E2E (staging) | sandbox GitHub org + test repo with a trivial CI: approve → PR → CI green → auto-merge → webhook → Live |

## Done when

- [ ] GitHub install → connect → PR → CI → auto-merge/human merge → Live on staging
- [ ] Path allowlist enforced on every write path, with tests
- [ ] Conflicts and red CI never merge
- [ ] GitLab parity behind the same interface (v1 exit)

## Forbidden moves

- Writing to the base branch, to `.github/**`, or outside the allowlist.
- Personal access tokens; long-lived tokens stored in tables (mint installation tokens per call).
- Auto-merging a human-approved MR, or merging on stale CI.
- Trusting webhook payload fields for tenant resolution beyond installation + repo.

## Risks

| Risk | Mitigation |
|---|---|
| App permissions are repo-wide | allowlist + rulesets + Aikido review of `gitNode.ts` |
| Repos with no CI make auto-merge meaningless | autopost requires CI configured (`ci !== "none"`) to auto-merge; else waits for a developer |
| Monorepo customer sites with path-filtered CI | read check runs for the head SHA, not required-check names |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `store.tsx` MR creation / description / CI / merge simulation | **rewrite** with Octokit; copy audit + notification strings |
| `logic.ts` `mrRef`, `publishingSteps` | **reuse** |
