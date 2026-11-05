# Engineering blueprint: Agentic CMS

Filled copy of the framework template [`docs/engineering-blueprint.md`](../../../docs/engineering-blueprint.md) (80/90 stack defaults).
Backend design that implements it: [backend/README.md](./backend/README.md) · work packages: [backend/handoffs/](./backend/handoffs/).

Venture / product: **Agentic CMS** (Grandeur SEO programme; app `apps/cms`, package `@studio/cms`)
Date: **2026-11-04** · Fellow: **[TO CONFIRM]** (builder agents + fellow per `00-decisions.md` "Team / timeline") · Studio lead: **Olayinka Adeyefa** (PRD owner, 25 Sep 2026)

Status words used below: **[NEW]** = not in the repo yet · **[TO CONFIRM]** = needs a human value · **[GAP]** = required artefact missing.

---

## 1. Defaults (as accepted for this venture)

| Layer | Default (80/90) | This venture | Override? |
|-------|-----------------|--------------|-----------|
| Product shell | Next.js App Router · Vercel | Next.js 15.3 App Router (`apps/cms/package.json`), Vercel | no |
| Auth | Clerk | Clerk **with Organizations** (workspace = org); per-site roles in Convex | extended, not overridden |
| Control plane / DB | Convex | Convex, own deployment for `apps/cms` (backend D1) | no |
| Subscriptions | Polar | Polar | no |
| Credits | Autumn component + Effect wallet ledger | Autumn + **site-keyed** spend ledger (`spendEntries`) behind `@studio/effect-critical` | extended |
| Critical money / inference / delivery | `@studio/effect-critical` | yes; new `cappedInference` program [NEW] | no |
| Metered models | OpenRouter | **Anthropic API direct** | **yes: constraint C1** |
| LLM traces | Langfuse | Langfuse, one trace per run | no |
| Product analytics / flags | PostHog | PostHog | no |
| Errors | Sentry | Sentry | no |
| Design review | Rams | Rams | no |
| Code review | Greptile + greploop | Greptile + greploop | no |
| Security | Aikido | Aikido (repo-write + secrets make this mandatory before pilot) | no |
| Builder codegen | Ponytail (`full`) + Superpowers (optional) | same | no |
| Web research / scrape / act | Parallel → Firecrawl → Browserbase | same (`@studio/web-tools`), used by research agents + fact sourcing | no |
| Runtime agents | `@studio/ai-runtime` + sandbox | `@studio/ai-runtime` **budget** (`assertWithinBudget`) only; **no sandbox** | **yes: constraint C6** |
| Shared agent memory | Hivemind (venture workspace) | Hivemind SPF workspace for builder memory; **no customer data** | no |
| Deploy | Vercel + Convex prod | same | no |
| Durable jobs | (recommended component) Workflow · Workpool | Workflow + Workpool + crons | **yes vs PRD: constraint C2** |
| Object storage | (recommended component) R2 | Convex R2 component | **yes vs PRD: constraint C3** |

## 2. Venture choices

### Job & autonomy

| Field | Value |
|-------|--------|
| Job sentence (from eval-first) | **[GAP: no signed `eval-first-spec.md` for this venture]** Proposed: *"For each client site, a content specialist approves keyword-led ideas; on approval the CMS agent and the harness agents draft, illustrate, gate, render into the site's own template and open a merge request that merges itself on green CI, stopping for a human only when a guardrail fires, with zero unsourced claims and every action audited."* (PRD goal "run a client's entire blog programme without opening a code editor" + C10/C11) |
| Autonomy launch level (L0–L4) | **L3** (act broadly + exception queue) |
| Autonomy justification | Autopost publishes without a per-post human (C10), which is beyond L2's "narrow band". It is not L4: ideas, the plan, outreach sends, prunes/deletions and spend above cap always terminate at a human (`harness-config.yaml` `human_gates`), and every guardrail failure degrades to the **exception queue** (post held In review + ledger item "Autopost held: <reason>", C11). Per-site `publishing.autopost = off` drops the site to L1 (suggest + human approve). Promotion beyond L3 only via eval results. |
| AI placement | ☑ **Workflow-embedded** · ☐ Conversational product · ☐ Both |
| AI placement justification | The UI is the job console (plan board, editor with inline agent diffs, approvals, MRs, SEO). `instructAgent` is a scoped edit instruction producing a diff, not a chat. Matches `docs/ai-in-workflow.md` placement A. |
| First golden case # | **#1 (proposed)**: autopost site with connected repo + confirmed manifest; approve one idea → PR opened with the rendered post in the site's format + optimised assets + description (keyword, intent, gate result, schema types) → green CI → auto-merged → post Live; no open fact markers; spend ≤ estimate; full audit trail. Pass/fail = the 12 optimizer checks + `evaluateGate().canApprove` + MR file list within `contentDir`/`assetDir`. **[TO CONFIRM]** in a signed eval-first spec. |

### Billing shape (pick one primary)

| Option | Select | Notes |
|--------|--------|-------|
| Polar subscriptions only | ☐ | |
| Polar + Autumn credits | ☑ | Polar subscription per site (or per workspace: backend D3); Autumn credits as the commercial meter for text + image generation; site ledger is truth |
| Stripe subscriptions | ☐ | |
| Stripe + Autumn | ☐ | |
| Credits-only (Autumn + wallet) | ☐ | |
| None for pilot | ☐ | Internal pilot (PRD v0) may run with caps + ledger and Polar in sandbox |

### Design system

| Field | Value |
|-------|--------|
| Source | ☐ Utopia DS · ☐ Designer pack URL/path · ☑ **Generate from brand brief** (six reference screens in `docs/reference/`, glass hierarchy from `docs/visual-aid.png`, Nawa template adapted: `docs/02-design-system.cms.md`) |
| Token owner | Lead (`src/ds/tokens.css`, per `docs/BUILD-PLAN.md` step 2a) |
| Component package? (npm / local path) | local path: `apps/cms/src/ds` |
| Rams required on first UI PR | ☑ yes |

### Repo & deploy

| Field | Value |
|-------|--------|
| Repo mode | ☐ Fork SPF · ☑ **App in monorepo** (`apps/cms`; advanced mode per `docs/fellow-day-0.md`; chosen because the venture reuses `@studio/seo-harness` and the platform packages and is built by Studio) |
| GitHub repo | `The-Utopia-Studio/studio-product-framework` |
| Vercel project | **[TO CONFIRM]** (suggested `studio-cms`, root `apps/cms`) |
| Convex deployment | dev: **[TO CONFIRM]** (`npx convex dev` from `apps/cms`) · prod: **[TO CONFIRM]** · plus a `staging` deployment for pilot rehearsal |
| Hivemind workspace | ☑ SPF shared (`studio-product-framework`, pinned in `.hivemind`) for builder memory · ☐ Venture-isolated. Rule: no client content, keys or brand packs in Hivemind |

### Env tiers enabled

| Tier | Enabled | This venture |
|------|---------|--------------|
| A — boot | ☑ | `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `CLERK_JWT_ISSUER_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `FRONTEND_URL`; Clerk JWT template `convex`; Clerk Organizations on |
| B — money | ☑ | `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER`, `AUTUMN_SECRET_KEY` |
| C — AI jobs | ☑ | `ANTHROPIC_API_KEY` (replaces `OPENROUTER_*`), `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `CMS_SECRETS_KEY_V1`, `CMS_SECRETS_KEY_CURRENT` |
| D — PostHog/Sentry | ☑ | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` |
| E — web tools / sandbox / email | ☑ (list): `PARALLEL_API_KEY`, `FIRECRAWL_API_KEY`, `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` (optional); GitHub App (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`); Google OAuth (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`); R2 (`R2_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`: names per the R2 component docs, verify). Sandbox: no. Email/Slack digests: v1.1 | |

Names marked [NEW] in `backend/handoffs/00-setup.md` are not in `apps/web/.env.example` today; that handoff adds `apps/cms/.env.example`.

---

## 3. Hard constraints (only place for stack deviation)

| # | Constraint | Forced choice | Evidence |
|---|------------|---------------|----------|
| C1 | The harness is specified on Anthropic models with tiered routing, and the prototype depends on Anthropic structured outputs | **Anthropic API direct** via a new `createAnthropicGateway` (`InferenceGateway` port from `@studio/effect-critical`) instead of OpenRouter; OpenRouter remains an optional adapter | `packages/seo-harness/harness-config.yaml` pins `claude-haiku-4-5` / `claude-sonnet-5` / `claude-opus-5-5` per agent; `packages/seo-harness/src/index.ts` `MODELS`; `HARNESS.md` "Verify current model names and pricing at docs.claude.com"; `apps/cms/package.json` depends on `@anthropic-ai/sdk`; `src/server/visual-agent/diagram.ts` uses `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`. Note `runInference` tags errors `provider: "openrouter"`; the new gateway must set its own provider label. |
| C2 | PRD "Suggested stack" asks for Postgres + a queue with durable retries | **Convex tables + `@convex-dev/workflow` + `@convex-dev/workpool` + crons**; no Postgres, no external queue | PRD p.12: "Nothing here is load-bearing on a specific vendor except the MCP requirement"; the requirement is durability + retries for slow, failure-prone image/crawl jobs, which Workflow/Workpool provide; framework doctrine `docs/architecture.md` "Convex is the control plane"; `docs/convex-components.md` "Long-running agent jobs → Workflow; Parallel work / queues → Workpool" |
| C3 | PRD asks for object storage for assets; template bundles up to 50 MB / 2000 files (`MAX_BUNDLE_BYTES`, `MAX_BUNDLE_FILES` in `src/render/bundle.ts`) | **Convex R2 component** (`@convex-dev/r2`) implementing the `@studio/storage` `StorageProvider` port; image post-processing with `sharp` in Node actions | `packages/storage` is **Port**; prototype stores bundles on local disk (`src/server/templates.ts`, `.data/templates/…`), which can't run on Vercel/Convex |
| C4 | Multi-tenant agency: one workspace, many client sites, roles **per site** | **Clerk Organizations** = workspace; site roles as Convex `memberships`; one `requireSiteRole(ctx, siteId, permission)` helper | PRD "Users and roles": "Permissions are per site, not global"; `docs/multi-site-contract.md` §2; PRD "Tenant isolation" |
| C5 | Runtime MCP connections are customer-supplied and multi-tenant | **HTTP MCP only** (Streamable HTTP, SSE fallback) in production; **no stdio** | Spawning customer-supplied processes inside a shared Convex Node runtime is arbitrary code execution; prototype already gates stdio behind `CMS_ALLOW_STDIO_MCP=1` (`src/server/mcp.ts` `stdioAllowed`) |
| C6 | Runtime agents call models and HTTP tools but execute no generated code | **No sandbox**; keep `assertWithinBudget` (turn/spend caps) from `@studio/ai-runtime`; agent SVG output goes through `sanitizeSvg()` | `docs/ai-in-workflow.md` checklist "No untrusted runtime agent code in Convex isolate"; nothing in `packages/seo-harness/skills/*` executes code; template HTML is parsed (linkedom) and sanitised (`stripUnsafe`), never executed |
| C7 | The CMS writes into customer codebases | **GitHub App** (Octokit, installation tokens, path allowlist, one branch + PR per post, webhooks into `convex/http.ts`); **GitLab app** in v1; never push to the base branch | PRD Module 5 "via app installation rather than personal tokens", "Scope is limited to the content and asset paths", "never pushes to the base branch" |
| C8 | Founder direction C10 (27 Sep 2026) supersedes the PRD non-goal "The CMS opens merge requests; humans merge" | **Auto-merge on green CI**, only for MRs the agent opened under autopost (`IMergeRequest.autopost`) and only when `publishing.autoMergeOnGreenCi`; human-approved MRs still wait for a developer | `docs/uxer/00-decisions.md` C10/C11; `harness-config.yaml` `publishing.auto_merge_on_green_ci: true`; `HARNESS.md` escalation rule 4; `store-api.md` "Auto-merge only ever applies to MRs with `autopost: true`" |
| C9 | Search visibility data is required for KAS and trajectory | **Google Search Console OAuth** + daily import (Search Analytics), Ahrefs/Semrush as CSV import only in v1 | PRD "Search Console is the required connection"; non-goal "Rank tracking as a first-party data source"; reuse `apps/web/convex/lib/googleOAuth.ts` PKCE + AES-GCM helpers |
| C10 | Provider keys and Git credentials are stored per client and must never reach the UI or prompts | **Per-tenant `secrets` table**, AES-256-GCM, key in Convex env with key versioning | PRD "Secrets"; `00-decisions.md` C12; prototype `src/server/secret-box.ts` + `connections.ts` (local JSON) replaced |
| C11 | CMS tenancy, users and ledger shape differ from the reference app | **Separate Convex deployment** rooted at `apps/cms/convex` (no shared tables with `apps/web`) | `apps/web/convex/schema.ts` `wallets`/`inferenceRuns` keyed by `userId`; `apps/web` access model is fellow/studio/admin, not org + per-site roles |

## 4. Out of scope for v1 (fenced Ports)

| Item | Why fenced | Revisit |
|---|---|---|
| Stripe E2E (`@studio/billing` Stripe port) | Polar is the billing path | if a customer mandates Stripe |
| Runtime sandbox provider (`@studio/ai-runtime` `createSandbox`) | C6: no code execution | if an agent ever needs to run code |
| `@studio/email` + Slack digests (`deliverMessage` from `@studio/effect-critical`) | in-app notifications cover v1 | v1.1 (PRD integrations "Slack or email webhook") |
| `@studio/flags` | not needed for the golden case | |
| Migrating Polar app code into `@studio/billing` adapters | cleanup, not blocker | |
| Bitbucket, self-hosted GitLab | PRD v2 | v2 |
| Multi-language, public API, programmatic SEO, white-label portals, custom per-client agent instructions without code | PRD v2 / deferred | v2 |
| Ahrefs/Semrush API sync | CSV import is enough for v1 (`rankSource`) | v1.1 |
| PDF report generation | `00-decisions.md` scope cut: stored editions + reader | v2 |
| `mdx`/`json`/`component` output serializers beyond HTML | renderer emits HTML only today (`src/render/render.ts`); serializers are **[NEW]** in handoff 05 and may slip to v1.1 for `component` | v1 / v1.1 |
| Indexing submission after merge | verify Google API support first (backend D17) | v1.1 |

## 5. Commit checklist

- [x] Defaults accepted or constraints table filled (C1–C11)
- [x] Billing shape selected (Polar + Autumn credits)
- [x] Design system source selected (generated from refs; `src/ds`)
- [x] AI placement = workflow-embedded
- [x] Env tiers marked; secrets plan clear (local `.env.local` for Next.js public + Clerk; Convex env for every server key; Vercel env for Next.js; per-tenant keys in `secrets`) — see `backend/handoffs/00-setup.md`
- [ ] Matches signed `eval-first-spec.md` autonomy + cost budget — **[GAP]**: `agents/context/discovery/eval-first-spec.md` is the unfilled template; L3 and the cost-per-post budget need a signed spec (`agents/loops/commit-v1.md`)
- [ ] Problem scorecard ≥ 32 + evidence ladder signed — **[GAP]** (`agents/context/discovery/problem-scorecard.md`, `evidence-ladder.md` are templates)
- [ ] Open product decisions settled: backend D3 (billing unit), D14 (image licensing policy, PRD Q5), D15 (cost model, PRD Q8)
- [ ] Human sign-off: _______________

## Related loops

`commit-v1` → **this blueprint** → `integrate-design-system` (done in Phase 2 of `BUILD-PLAN.md`) → `bootstrap-ai-product` → backend handoffs `00`→`09` via `compound-engineering` → `ship-ready-pr` → `operate-handover`
