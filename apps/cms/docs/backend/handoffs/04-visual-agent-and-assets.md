---
name: cms-backend-04-visual-agent-and-assets
description: >
  Port the visual-asset agent (harness #10) and Connections (C12/C13) into Convex Node actions with HTTP-only
  MCP, per-tenant encrypted secrets, R2 asset storage, sharp post-processing and provenance; replace
  app/api/connections/** and app/api/visual-agent/run.
---

# Handoff 04: visual agent, connections and assets

| | |
|---|---|
| Size | **L** |
| Depends on | 01, 02 (`fillSlotStep` interface), 03 (gateway + `cappedInference` for the diagram LLM and image spend) |
| Unblocks | 05 (renderer needs asset paths), 06 (MR carries assets) |

## Goal

Every image slot is filled by the visual-asset agent through one of `generate` (connected HTTP MCP / image API),
`diagram` (SVG from the post's own content), `source` (licensed web image) or `chart` (inline SVG), with 2–4
candidates, provenance on each, variants in R2, spend debited to the site's image budget, and a hold + ledger item
when no route works. Connections and their secrets live in Convex, encrypted per tenant.

## Why

PRD goal 2 ("every image slot filled by an agent-generated asset or a clearly flagged human upload") and success
metric "≥ 70% slots filled without human upload". The prototype already does real provider calls, but from a
localhost-only Next.js route with JSON-file storage and no auth ("LOCALHOST PROTOTYPE" comments).

## Inputs (read first)

- `apps/cms/docs/uxer/00-decisions.md` C12, C13
- `packages/seo-harness/skills/visual-asset-agent/SKILL.md`, `harness-config.yaml` `visual-asset-agent` (routing + guardrails), `src/index.ts` `IMAGE_ROUTING`
- `apps/cms/src/server/visual-agent/*` (`run.ts`, `route.ts`, `prompt.ts`, `generate.ts`, `source.ts`, `source-filter.ts`, `diagram.ts`, `svg.ts`, `types.ts` + tests)
- `apps/cms/src/server/{connections.ts,mcp.ts,probes.ts,secret-box.ts}`, `src/features/connections/catalog.ts`
- `apps/cms/app/api/{connections,visual-agent}/**` (request validation to carry over)
- `apps/web/convex/lib/googleOAuth.ts` (`encryptGoogleSecret`/`decryptGoogleSecret`: the WebCrypto AES-GCM pattern)
- `packages/storage/src/index.ts` (`StorageProvider` port), `@convex-dev/r2` docs (verify API: upload URL, store, getUrl, delete)
- [../api-map.md](../api-map.md) §5, §8 "Connections"; [../README.md](../README.md) §10 Secrets

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/convex.config.ts` | `app.use(r2)` |
| `apps/cms/convex/lib/crypto.ts` | `seal(siteId, plaintext)` / `open(row)` AES-256-GCM, key `CMS_SECRETS_KEY_V<n>`, `hintOf()` |
| `apps/cms/convex/secretsInternal.ts` | `put`, `get(siteId, ownerKind, ownerId)`, `remove`, `rotate` (internal only) |
| `apps/cms/convex/connections.ts` (+ `connectionsNode.ts` `"use node"`) | `list`, `upsert`, `remove`, `test` (api-map §8) |
| `apps/cms/convex/lib/mcp.ts` (`"use node"`) | port of `src/server/mcp.ts` without stdio |
| `apps/cms/convex/agents/visual/*.ts` (`"use node"`) | ported `route`, `prompt`, `svg`, `source-filter` (pure), `generate`, `source`, `diagram`, `run` |
| `apps/cms/convex/assets.ts` (+ `assetsNode.ts`) | `generateUploadUrl`, `attachUpload`, `urlFor`, `postProcess` (sharp variants per `breakpoints` × `format`) |
| `apps/cms/convex/slots.ts`, `slotsInternal.ts` | api-map §5 |
| `packages/storage/src/r2.ts` **[NEW]** (optional) | `StorageProvider` implemented with the R2 component, if the API fits the port |
| Deleted after cut-over | `app/api/connections/**`, `app/api/visual-agent/run/route.ts`, `src/server/{connections,json-store,secret-box}.ts`, `.data/` usage |

## Steps

1. **Crypto + secrets.** Port the WebCrypto helper (works in default and Node runtimes). Ciphertext format `"<keyVersion>.<iv>.<ct>"`. `secretsInternal.get` requires `siteId` and checks the row's `siteId`. Rotation job re-seals rows with the current key version.
2. **Connections.** `connections.upsert` (Node action): zod → `v` validators from `app/api/connections/route.ts`; `kindOf(provider)` from `catalog.ts`; reject `transport: "stdio"`, `command`, `args`; require `https:` in staging/prod (allow `http://localhost` only on dev); seal secret; store `secretHint`. `connections.test`: port `testConnection` (MCP `listTools` paging ≤ `MAX_TOOL_PAGES`, `probeApi` for image APIs), cache `tools`, status + `statusNote`/`lastError` (human sentences from `humanizeMcpError`).
3. **SSRF guard [NEW].** Connections take user-entered URLs: resolve and refuse private/link-local/metadata IP ranges before connecting (MCP, image APIs, `addFactSource` liveness check, sourced image downloads). Follow redirects manually with the same check.
4. **Visual agent port.** Pure files (`route.ts`, `prompt.ts`, `svg.ts`, `source-filter.ts`, `types.ts`) move as-is (keep their tests). In `generate.ts`, `source.ts`, `diagram.ts`, `run.ts`: drop `import "server-only"` (the `server-only` package throws outside a React Server Components bundle), replace `getSecret`/`listConnections`/`getConnectionForSite` with `secretsInternal.get` + an internal query, route the diagram LLM call through `cappedInference` (budget `text`), and each paid image attempt through `cappedInference` with budget `image` and estimate from `UNIT_USD` × count (`route.ts`). Keep: retry once, then next route, then hold (`NO_RETRY` regex semantics).
5. **Storage.** Candidates' bytes (data URIs / provider URLs / sourced images) are downloaded in the action (size cap, content-type allowlist, SSRF guard), hashed (`sha256`), stored to R2 at `sites/<siteId>/assets/<sha256>.<ext>` (dedupe via `assets.by_site_sha`), `assets` row with provenance; `candidates` rows reference `assetId`. SVGs pass `sanitizeSvg()` before storage.
6. **fillSlotStep** (replaces 02 stub): skips `humanPinned`; sets slot `generating`; runs the agent with `estimateCapUsd` = remaining image budget; on candidates → `slotsInternal.setCandidates` (audit "returned candidates"); under autopost the agent picks the first acceptable candidate (audit "selected asset" by `VISUAL_AGENT`); on hold → slot `failed`/`human-only`, ledger item with the reason, run row. Provenance log artifact per post (`artifacts` kind `provenance_log`).
7. **Post-processing.** On selection: `assets.postProcess` (sharp) creates variants for `slot.breakpoints` in `slot.format` (webp/avif; svg untouched), filenames per `slot.filename` pattern for the repo. Idempotent on `(parentAssetId, breakpoint, format)`.
8. **Human paths.** `slots.pickCandidate`, `useCandidate`, `regenerateSlot(prompt?)` (prompt passes `scrub()` from `prompt.ts`), `uploadOwn` via R2 signed upload (content-type + size checked again in `attachUpload`), `markHumanOnly`.
9. **Licensing gate.** `acceptLicense()` + `looksUnsafe()` from `source-filter.ts` stay mandatory; NC licenses refused for commercial sites unless `brandPack` allows (as today). Open policy D14 decides defaults for paying clients.
10. **Cut-over.** Store adapter calls Convex; delete the Next.js routes and `.data` storage in the same PR as the switch.

## Interfaces it must honour

- `fillSlotStep` I/O (02); `slotsInternal.setCandidates` is the only candidate writer (api-map §5).
- `ICandidate.source` provenance fields (types.ts) on every candidate.
- `connections` never returns `secretId` or ciphertext; `hasSecret` + `secretHint` only (catalog.ts `IConnection` contract).

## Test plan

| Kind | Cases |
|---|---|
| Unit (ported) | existing `route.test.ts`, `prompt.test.ts`, `svg.test.ts`, `source-filter.test.ts`, `generate.test.ts` pass unchanged against the moved files |
| Golden | diagram route for a "steps" post yields an SVG with only numbers present in the post (`inventedNumbers()` empty); chart route never calls a generator; stock route returns ≥ 2 candidates with license + attribution or holds; provider 500 → retry once → next route; all routes fail → hold + ledger item |
| Spend | paid route estimated over remaining image cap → refused, next free route (diagram/source) tried, else hold "over cap"; debit per attempt idempotent on `run:<siteId>:slot:<slotId>:<n>` |
| Secrets | `connections.list` response never contains a secret; decrypt with wrong key → typed error, connection `failed` with a human sentence; prompts never contain a secret (scan provider request bodies in tests) |
| SSRF | `http://169.254.169.254`, `http://10.0.0.1`, DNS rebinding fixture → refused |
| Isolation | connection id from site B used in a site A slot run → not found; R2 URL minting for a site B asset from a site A caller → refused |
| E2E (staging) | connect an HTTP MCP image server + Openverse; fill a hero (generate), a diagram, a stock slot; variants appear; provenance shown in the UI |

## Done when

- [ ] All four routes work from Convex with real providers on staging
- [ ] No stdio MCP path in production code
- [ ] `app/api/connections/**`, `app/api/visual-agent/run` and `.data` storage removed
- [ ] Every candidate has provenance; every sourced image has license + attribution
- [ ] Image spend debited per attempt, refused over cap

## Forbidden moves

- Generating charts (charts are inline SVG from post data, never generated).
- Imagery of identifiable real people, living-artist style imitation, watermarked images (harness guardrails).
- Secrets in prompts, logs, provenance or Langfuse.
- Fetching any user-supplied URL without the SSRF guard.
- Storing image bytes in Convex documents (R2 only).

## Risks

| Risk | Mitigation |
|---|---|
| MCP image calls are slow (`MCP_CALL_TIMEOUT_MS` 120 s) | run on the `images` Workpool, one slot per action; verify Convex Node action time limit |
| `sharp` native binary in Convex Node runtime | verify support; fallback: post-process in a Vercel function called by the action with a signed request, or provider-side resizing |
| Licensing policy unresolved (PRD Q5) | default the `source` route to CC0/CC-BY/public domain only until D14 |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `visual-agent/{route,prompt,svg,source-filter,types}.ts` | **port as-is** (pure) |
| `visual-agent/{generate,source,diagram,run}.ts` | **port**, swap storage/secrets/LLM call, drop `server-only` |
| `server/mcp.ts`, `probes.ts` | **port**, remove stdio |
| `server/connections.ts` | **rewrite** on Convex tables; keep validation + messages |
| `server/secret-box.ts`, `json-store.ts` | **replace** (WebCrypto + Convex) |
| `features/connections/catalog.ts` | **reuse** (isomorphic) |
