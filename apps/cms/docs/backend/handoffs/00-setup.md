---
name: cms-backend-00-setup
description: >
  Stand up accounts, env tiers and keys for the Agentic CMS backend (Convex, Clerk orgs, GitHub App,
  Google OAuth, R2, Langfuse, Polar, Autumn, Anthropic) across dev / staging / prod. No product code.
---

# Handoff 00: setup (accounts, env tiers, keys)

| | |
|---|---|
| Size | **S** (mostly console work; ~1 day, some steps need Studio org admin) |
| Depends on | nothing |
| Unblocks | every other handoff |
| Owner | builder agent + a human with org/billing access (agents can't create accounts: prohibited) |

## Goal

Every provider the backend needs exists in three tiers (dev, staging, prod), every key is in the right store, and
`apps/cms` boots against an empty Convex deployment with Clerk sign-in and an active organization.

## Why

The rest of the work is code an agent can write and test. It stalls if a key, webhook URL or OAuth redirect is
missing. Fixing them up front, per tier, also keeps prod secrets out of local files (`docs/fellow-day-0.md`).

## Inputs (read first)

- `docs/fellow-day-0.md` (env tiers A–E, Clerk JWT template `convex`)
- `apps/cms/docs/engineering-blueprint.md` §2 "Env tiers", §3 constraints
- `apps/web/.env.example` (names already in use), `apps/web/convex/auth.config.ts`, `apps/web/convex/convex.config.ts`
- `docs/mcp-setup.md` (Convex/Sentry/Aikido MCP for agents)
- [../README.md](../README.md) §9 Integrations, §10 Secrets

## Outputs

| File / thing | Notes |
|---|---|
| `apps/cms/.env.example` **[NEW]** | every name below, empty values, a comment per tier |
| `apps/cms/convex/` initialised **[NEW]** | `npx convex dev` from `apps/cms` creates `convex/` + `.env.local` (`CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`) |
| `apps/cms/convex/auth.config.ts` **[NEW]** | copy of `apps/web/convex/auth.config.ts` (Clerk issuer, `applicationID: "convex"`) |
| `apps/cms/docs/backend/env-matrix.md` **[NEW]** | filled matrix: var × tier × store (local / Convex env / Vercel env) with owner, *no values* |
| Provider apps | listed in the step table |

## Env matrix (names; values never in git)

| Var | Tier | Store | Dev | Staging | Prod | Notes |
|---|---|---|---|---|---|---|
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | A | local + Vercel | ✓ | ✓ | ✓ | site URL = webhook base |
| `CONVEX_DEPLOY_KEY` | A | Vercel/CI | | ✓ | ✓ | |
| `CLERK_JWT_ISSUER_DOMAIN` | A | Convex env | ✓ | ✓ | ✓ | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | A | local + Vercel | ✓ | ✓ | ✓ | |
| `CLERK_SECRET_KEY` | A | Convex env | ✓ | ✓ | ✓ | for org/invitation API calls from actions |
| `CLERK_WEBHOOK_SIGNING_SECRET` | A | Convex env | ✓ | ✓ | ✓ | |
| `FRONTEND_URL` | A | Convex env | `http://localhost:3200` | staging URL | prod URL | CMS dev port is 3200 (`apps/cms/package.json`) |
| `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` | B | Convex env | sandbox | sandbox | production | |
| `AUTUMN_SECRET_KEY` | B | Convex env | test | test | live | |
| `ANTHROPIC_API_KEY` **[NEW name in SPF]** | C | Convex env | ✓ | ✓ | ✓ | separate keys per tier, spend limits set in the Anthropic console |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | C | Convex env | ✓ | ✓ | ✓ | one Langfuse project per tier |
| `CMS_SECRETS_KEY_V1`, `CMS_SECRETS_KEY_CURRENT` **[NEW]** | C | Convex env | ✓ | ✓ | ✓ | 32 random bytes base64 (`openssl rand -base64 32`), different per tier; never reuse the dev key |
| `CMS_DEV_TOOLS` **[NEW]** | — | Convex env | `1` | unset | unset | gates `devSeed.*` |
| `NEXT_PUBLIC_CMS_LIVE_CLOCK` | — | Convex env + Vercel | `1` | `1` | `1` | `src/lib/clock.ts` is pinned to 25 Sep 2026 otherwise |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN` | D | Vercel (+ Convex env for server capture) | opt | ✓ | ✓ | |
| `SENTRY_DSN` | D | Convex env | opt | ✓ | ✓ | |
| `PARALLEL_API_KEY`, `FIRECRAWL_API_KEY` | E | Convex env | ✓ | ✓ | ✓ | |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | E | Convex env | opt | opt | opt | |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` **[NEW]** | E | Convex env | dev app | staging app | prod app | one App per tier |
| `GITLAB_APP_ID`, `GITLAB_APP_SECRET`, `GITLAB_WEBHOOK_TOKEN` **[NEW]** | E | Convex env | | ✓ | ✓ | only when handoff 06 GitLab part starts |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | E | Convex env | ✓ | ✓ | ✓ | same names as `apps/web/convex/lib/googleOAuth.ts`; redirect = `<CONVEX_SITE_URL>/oauth/google/callback` |
| R2 vars (names per `@convex-dev/r2` README, verify) | E | Convex env | ✓ | ✓ | ✓ | one bucket per tier, private, CORS for the CMS origin (PUT from browser) |

## Steps

| # | Step | Who | Check |
|---|---|---|---|
| 1 | Create Convex project "agentic-cms" with dev, staging (preview or second project) and prod deployments; run `npx convex dev` **from `apps/cms`** | human + agent | `apps/cms/convex/_generated` exists |
| 2 | Add `convex` to `apps/cms/package.json` (same major as `apps/web`, `^1.45.0`), plus `@clerk/nextjs` and `convex/react-clerk` provider wiring (don't render it yet: handoff 01 swaps the store) | agent | `pnpm --filter @studio/cms typecheck` green |
| 3 | Clerk: one application per tier, **Organizations enabled**, JWT template named exactly `convex`, org roles `org:admin` + `org:member` (custom roles optional, verify), webhook endpoint `<CONVEX_SITE_URL>/clerk/webhook` subscribed to user, organization, organizationMembership, organizationInvitation events (verify event names) | human | sign-in works; JWT contains `org_id` when an org is active |
| 4 | Anthropic: org + API key per tier, monthly spend limit per key; confirm the harness model ids exist (`claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-5-5`) against docs.claude.com and record the verification date in `env-matrix.md` | human | a `curl` count-tokens call succeeds (verify endpoint) |
| 5 | Langfuse: project per tier | human | keys in Convex env |
| 6 | GitHub App per tier: permissions minimal (contents RW, pull requests RW, checks R, commit statuses R, metadata R: verify the minimal set), events `pull_request`, `check_suite`, `check_run`, `status`, `installation`, `installation_repositories`; webhook URL `<CONVEX_SITE_URL>/github/webhook`; Setup URL `<CONVEX_SITE_URL>/github/setup` with "redirect on update"; private key downloaded straight into Convex env | Studio org admin | test delivery shows 404/200 from Convex (endpoint lands in 06) |
| 7 | Google Cloud: OAuth client (web), consent screen with the Search Console read-only scope (verify scope string), redirect URI per tier, test users for dev | human | consent screen in testing mode for dev |
| 8 | Cloudflare R2: bucket per tier, API token scoped to that bucket, CORS allowing PUT/GET from the CMS origin | human | |
| 9 | Polar: org per tier (sandbox for dev/staging), product(s) per backend D3, webhook to `<CONVEX_SITE_URL>/polar/webhook` | human | |
| 10 | Autumn: test + live env, features `text_generation_usd` and `image_generation_usd` (names [TO CONFIRM] with D15) | human | |
| 11 | Sentry + PostHog projects for `apps/cms` | human | |
| 12 | Write `apps/cms/.env.example` and `env-matrix.md`; set Convex env vars with `npx convex env set` per deployment (never commit values) | agent | `npx convex env list` shows every name |
| 13 | Branch protection on `main` of the monorepo unchanged; add `apps/cms` to CI typecheck/test if not already | agent | CI green |
| 14 | Install Greptile, Rams, Aikido on the repo if still missing (`docs/capabilities.md` says Process, not live) | Studio org admin | |

## Interfaces it must honour

- Env names above are referenced by [../api-map.md](../api-map.md) §11 (webhooks) and the handoffs; if a provider forces a different name, change it here and in those docs in the same PR.
- `NEXT_PUBLIC_CMS_LIVE_CLOCK=1` everywhere the backend runs (README §2 clock caveat).

## Test plan

- Smoke: `pnpm --filter @studio/cms dev` boots; sign in; create an org; Convex dashboard shows the identity in a test query (`ctx.auth.getUserIdentity()` returns `org_id`).
- Secret hygiene: `git grep -nE "sk-ant|ghs_|BEGIN RSA|BEGIN PRIVATE"` returns nothing; `.env.local` is gitignored for `apps/cms`.

## Done when

- [ ] Three tiers exist for Convex, Clerk, Anthropic, Langfuse, GitHub App, Google OAuth, R2, Polar, Autumn
- [ ] `apps/cms/.env.example` + `env-matrix.md` merged; no values in git
- [ ] Clerk JWT `convex` template + Organizations on; `org_id` visible server-side
- [ ] Model ids verified against provider docs and the date recorded
- [ ] Greptile/Rams/Aikido installation owner named

## Forbidden moves

- Committing any key, private key or `.env.local`.
- Reusing one `CMS_SECRETS_KEY_V1` across tiers, or one GitHub App across tiers.
- Using a personal access token for Git (C7: app installation only).
- Agents creating accounts or entering passwords: humans do provider sign-ups.

## Risks

| Risk | Mitigation |
|---|---|
| GitHub App permissions are repo-wide, not path-scoped | Path allowlist in code (handoff 06) + ruleset guidance (D8) |
| Google consent-screen verification for sensitive scopes takes time | start step 7 first; use testing mode + test users until verified |
| Model ids change | verification date in `env-matrix.md`; model ids only in `@studio/seo-harness` `MODELS` |

## Port vs rewrite

Nothing to port. Reuse: `apps/web/convex/auth.config.ts` (copy), env names from `apps/web/.env.example` and `apps/web/convex/lib/googleOAuth.ts`.
