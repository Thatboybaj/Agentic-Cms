# Setup checklist: the parts only an account owner can do

Everything below is configuration in someone's own account. The code is built and deployed; each feature stays
off (and says so in the UI) until its values are set. Set values in the **Convex dashboard → Settings → Environment
Variables** for the deployment (dev: `resolute-ibis-302`). Never paste them into chat or commit them.

Convex URLs used below (dev): HTTP actions at `https://resolute-ibis-302.convex.site`.

## Already set on dev

| Variable | What |
|---|---|
| `CLERK_JWT_ISSUER_DOMAIN`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | Clerk auth + org sync |
| `ANTHROPIC_API_KEY` | the agents' model key |
| `CMS_AGENTS=live` | real agent calls for manual/pipeline work (unset → $0 stubs) |
| `CMS_SECRETS_KEY_V1` | per-tenant secret sealing (generated on the deployment, never printed) |
| `FRONTEND_URL`, `CMS_DEV_TOOLS`, `NEXT_PUBLIC_CMS_LIVE_CLOCK` | app URL, dev seed tools, live clock |

## 1. GitHub App (repo connection, PRs, CI, merge)

1. GitHub → Settings → Developer settings → GitHub Apps → **New GitHub App** (under your account or org).
2. Homepage: your CMS URL. **Setup URL**: `https://resolute-ibis-302.convex.site/github/setup`, tick
   "Redirect on update". **Webhook URL**: `https://resolute-ibis-302.convex.site/github/webhook`, set a long random
   **webhook secret**.
3. Repository permissions: **Contents: Read & write**, **Pull requests: Read & write**, **Checks: Read**, **Commit
   statuses: Read**, **Metadata: Read**. Nothing org-level.
4. Subscribe to events: **Check run**, **Check suite**, **Status**, **Pull request**. (Installation events arrive
   automatically.)
5. "Only on this account" is fine for the pilot. Create it, then **Generate a private key** (downloads a `.pem`).
6. Set on Convex: `GITHUB_APP_ID` (the App ID), `GITHUB_APP_SLUG` (the URL name, e.g. `agentic-cms-baynor`),
   `GITHUB_APP_PRIVATE_KEY` (the whole `.pem` contents), `GITHUB_WEBHOOK_SECRET` (the secret from step 2).
7. In the CMS: Lumen → Connect a site → Repo → **Install GitHub app** → pick only the site repo → back in the CMS
   pick the repo, confirm paths. Recommended on the repo: protect the base branch with required status checks.

## 2. Google Search Console (positions, KAS, monitor, report)

1. Google Cloud Console → a project → **APIs & Services → Library** → enable **Google Search Console API**.
2. **OAuth consent screen**: External (or Internal for Workspace), add scope
   `https://www.googleapis.com/auth/webmasters.readonly`, add yourself as a test user while in Testing.
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI:
   `https://resolute-ibis-302.convex.site/oauth/google/callback`.
4. Set on Convex: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. In the CMS: Settings → Site & repo → Search Console → **Connect** → pick the property. The first import runs
   right away; then nightly at 02:15 UTC.

## 3. Image providers (per site, in the app — no env vars)

Settings → Connections: add an image API (e.g. OpenAI Images) or an HTTP MCP image server with its key; keys are
sealed per site. Wikimedia Commons / Openverse need no key (licensed sourcing). Then **Test** each connection.

## 4. Billing with Polar (optional until the paid pilot)

1. Polar (sandbox first): create a product (per-site subscription), an **access token**, and a webhook to
   `https://resolute-ibis-302.convex.site/polar/webhook` with subscription events; copy its secret.
2. Set on Convex: `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` (`sandbox` or
   `production`). Turn the gate on with `BILLING_ENFORCED=1` only when sites have subscriptions.

## 5. Scheduled agents (spend on a timer)

When you're happy with manual runs: `CMS_SCHEDULED_AGENTS=live`. The weekly keyword swarm (~$0.30/site), QA sweep
(~$0.01) and monthly refresh (writer cost per refreshed post) then run on their schedules, inside each site's caps.

## Before a paid pilot (handoff 09)

A production Convex deployment + production Clerk instance with their own keys (never the dev ones); Aikido scan +
AI pentest on staging; the signed eval-first spec with ≥ 20 golden cases; pilot stages P0 → P2 in
`docs/backend/handoffs/09-hardening-and-pilot.md`; Langfuse/Sentry keys if you want traces and error capture.
