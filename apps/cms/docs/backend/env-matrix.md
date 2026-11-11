# Env matrix (handoff 00 step 12)

Names only. **Values never go in git.** Stores: *local* = `apps/cms/.env.local`; *Convex* = `npx convex env set` on that
deployment; *Vercel* = Project → Settings → Environment Variables. Status is per tier: ✅ set · ⬜ not yet · — not needed.

Owner: **H** = a human with the provider account (agents can't create accounts or handle live keys), **A** = agent.

| Var | Tier | Store | Owner | Dev | Staging | Prod | Notes |
|---|---|---|---|---|---|---|---|
| `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | A | local + Vercel | H (project) / A (`convex dev` writes local) | ✅ project `agentic-cms`, dev deployment `resolute-ibis-302` | ⬜ | ⬜ | Site URL is the webhook base. A local anonymous deployment works for agent tests without an account (see below) |
| `CONVEX_DEPLOY_KEY` | A | Vercel / CI | H | — | ⬜ | ⬜ | |
| `CLERK_JWT_ISSUER_DOMAIN` | A | Convex | H | ✅ | ⬜ | ⬜ | Read by `convex/auth.config.ts` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | A | local + Vercel | H | ✅ local | ⬜ | ⬜ | |
| `CLERK_SECRET_KEY` | A | Convex | H | ✅ | ⬜ | ⬜ | org / invitation API calls from actions |
| `CLERK_WEBHOOK_SIGNING_SECRET` | A | Convex | H | ⬜ (endpoint created in Clerk; secret not set yet) | ⬜ | ⬜ | `/clerk/webhook`; Clerk endpoint subscribes to user.*, organization.*, organizationInvitation.*, organizationMembership.* |
| `FRONTEND_URL` | A | Convex | A | ✅ `http://localhost:3200` | ⬜ | ⬜ | |
| `NEXT_PUBLIC_CMS_LIVE_CLOCK` | — | Convex + Vercel | A | ✅ `1` | `1` | `1` | `src/lib/clock.ts` is pinned to 25 Sep 2026 otherwise |
| `CMS_DEV_TOOLS` | — | Convex | A | ✅ `1` | unset | unset | gates `devSeed.*` and the role switcher |
| `ANTHROPIC_API_KEY` | C | Convex | H | ✅ (also in local `.env.local` for the prototype draft route) | ⬜ | ⬜ | one key per tier, monthly spend limit set in the Anthropic console |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL` | C | Convex | H | ⬜ | ⬜ | ⬜ | one project per tier |
| `CMS_SECRETS_KEY_V1`, `CMS_SECRETS_KEY_CURRENT` | C | Convex | H | ⬜ | ⬜ | ⬜ | `openssl rand -base64 32`, different per tier |
| `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` | B | Convex | H | sandbox ⬜ | sandbox ⬜ | production ⬜ | |
| `AUTUMN_SECRET_KEY` | B | Convex | H | test ⬜ | test ⬜ | live ⬜ | |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN` | D | Vercel | H | opt | ⬜ | ⬜ | |
| `SENTRY_DSN` | D | Convex | H | opt | ⬜ | ⬜ | |
| `PARALLEL_API_KEY`, `FIRECRAWL_API_KEY` | E | Convex | H | ⬜ | ⬜ | ⬜ | |
| `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` | E | Convex | H | opt | opt | opt | |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | E | Convex | H (org admin) | ⬜ | ⬜ | ⬜ | one App per tier |
| `GITLAB_APP_ID`, `GITLAB_APP_SECRET`, `GITLAB_WEBHOOK_TOKEN` | E | Convex | H | — | ⬜ | ⬜ | only when the GitLab part of handoff 06 starts |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` | E | Convex | H | ⬜ | ⬜ | ⬜ | redirect = `<CONVEX_SITE_URL>/oauth/google/callback` |
| R2 vars (names per `@convex-dev/r2` README) | E | Convex | H | ⬜ | ⬜ | ⬜ | private bucket per tier, CORS PUT/GET from the CMS origin |

## Clerk JWT template `convex`

Dev: Clerk application **Agentic CMS** (B2B, Organizations on, roles `org:admin` + `org:member`), Development instance. Template `convex` created 2026-11-11 from Clerk's Convex preset (`aud: "convex"`) plus the claims below. Staging/prod instances: ⬜

`convex/lib/access.ts` reads the active organization from a custom claim. The template must include:

```json
{ "org_id": "{{org.id}}", "org_role": "{{org.role}}" }
```

No `org_id` in the token = `UNAUTHENTICATED` (handoff 01 isolation test d).

## Model ids (handoff 00 step 4)

Not verified yet against the provider docs: record the date here when done.

| Where | Id | Note |
|---|---|---|
| `packages/seo-harness` `MODELS.fast` | `claude-haiku-4-5` | older family than the other two |
| `packages/seo-harness` `MODELS.workhorse` | `claude-sonnet-5` | `src/server/draft-agent.ts` already defaults to `claude-sonnet-5-5`; `visual-agent/diagram.ts` uses `claude-sonnet-5` |
| `packages/seo-harness` `MODELS.strongest` | `claude-opus-5-5` | |

Verified on: 2026-11-11 — `models.retrieve` on the dev key returned all three (Haiku 4.5 200K context; Sonnet 5 and Opus 5.5 1M). Kept as designed by owner decision.

## Agent testing without accounts

`convex-test` runs the function tests in-process (`pnpm --filter @studio/cms test`). For a real local backend with no
Convex account: `CONVEX_AGENT_MODE=anonymous npx convex dev --once` from `apps/cms`. On Windows, CLI 1.49.0 downloads
the backend from a URL that 404s; download `convex-local-backend-x86_64-pc-windows-msvc.zip` from the
`get-convex/convex-backend` release into `%LOCALAPPDATA%\convex\binaries\<version>\` and pass
`--local-backend-version <version>`.
