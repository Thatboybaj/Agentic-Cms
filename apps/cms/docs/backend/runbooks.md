# Runbooks (handoff 09)

Each runbook: how you notice, what to check, what to do, how to confirm. `ops.health` (admin, per site) lists
failed runs (24 h), stuck runs/workflows (> 1 h), autopost holds, failed webhooks, broken connections and spend.

## Stuck workflow / run

- **Notice:** `ops.health.stuckWorkflows` or `stuckRuns`; a post shows progress that never moves.
- **Check:** Convex dashboard → Logs for the run id; Workflow component tables for the workflow id on the post.
- **Do:** paid steps never auto-retry (no double spend), so a failed step leaves the run `failed` with its error.
  If the workflow itself is wedged: cancel it in the dashboard; `posts.workflowId` clears in `pipelineDone`.
  Re-trigger from the UI (Generate now / Ship now / Regenerate) — every start is idempotent on its key.
- **Confirm:** the run row settles; the post's progress clears.

## Provider outage (Anthropic, image API, Openverse/Wikimedia, GitHub, Google)

- **Notice:** failed runs with provider errors; holds "No route could fill this slot"; connection test failures.
- **Do:** nothing is lost: transient errors retry inside `cappedInference` (bounded); then the run fails cleanly
  and the post holds with the reason. For long outages turn the cron off (unset `CMS_SCHEDULED_AGENTS`) and
  pause affected sites. Openverse 5xx: the visual agent falls through to the next route.
- **Confirm:** after recovery, re-run from the UI.

## Webhook backlog / failures (GitHub, Clerk, Polar)

- **Notice:** `webhookEvents` rows with status `failed`; CI state not moving on open MRs.
- **Do:** redeliver from the provider dashboard (GitHub App → Advanced → Recent deliveries). Replays are deduped on
  the delivery id. For CI, any check event on the head SHA triggers `gitNode.refreshCi`, which reads the real
  state, so one redelivery is enough.

## Secrets key rotation (`CMS_SECRETS_KEY_V<n>`)

1. Add `CMS_SECRETS_KEY_V<n+1>` (32 random bytes, base64) to the deployment. New secrets seal with it; old ones
   still open with V<n>.
2. Re-seal existing rows (re-enter connection keys, or run a one-off re-seal mutation reading with V<n>).
3. Remove V<n> only when no `secrets.keyVersion = n` rows remain.

## GitHub App key rotation

1. GitHub → the App → Generate a private key. 2. Set `GITHUB_APP_PRIVATE_KEY` to the new PEM on Convex (newlines
as `\n` are accepted). 3. Delete the old key on GitHub. Tokens are minted per call, so nothing else changes.

## Revoke a tenant / a site

- Remove the Clerk org membership (webhook syncs it) or pause the site (`sites.setStatus`).
- Disconnect: GitHub App uninstall (webhook marks the repo connection `removed`), Search Console disconnect (revokes
  the token), remove connections (deletes their sealed keys).
- Delete: `ops.deleteSite` (admin, slug confirm) purges rows in the background; `ops.exportSite` first if needed.

## Cap misconfigured

- Runs over a cap are refused (run `refused-over-cap`, audit, notification); nothing is billed.
- Fix in Settings → Providers (admin only). The 80% alert fires once per month per budget.

## Roll back a bad auto-merge

1. In the customer repo: revert the merge commit (GitHub → the PR → Revert) and merge the revert PR — the CMS never
   pushes to the base branch, so this is a normal developer action.
2. In the CMS: turn autopost or auto-merge off for the site (Settings → Publishing), then fix the post and ship it
   again (a new branch/PR). 3. Add a golden case for what got through.
