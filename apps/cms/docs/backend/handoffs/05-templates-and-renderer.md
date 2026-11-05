---
name: cms-backend-05-templates-and-renderer
description: >
  Move template ingestion (HTML/ZIP), the confirmation step and the renderer server-side: R2 bundles, linkedom
  parse in Node actions, renderPost in publish mode for MRs, preview rendering, the fidelity hold, and the
  output serializers (html now; mdx/json; component later).
---

# Handoff 05: templates and renderer

| | |
|---|---|
| Size | **M** |
| Depends on | 01, 04 (R2 component + assets), 02 (`renderStep` interface) |
| Unblocks | 06 (MR needs the rendered file) |

## Goal

A developer uploads the site's post template once (single `.html` or a `.zip` bundle), confirms the mapping, and
every post renders into that markup on the server (preview and publish). A post needing a structure the template
lacks is held, never improvised (PRD fidelity rule).

## Why

PRD goal 3 ("template ingested once, then every post renders into that markup without developer involvement") and
the metric "≥ 90% MRs merged without markup fixes". Today parse runs in the browser and bundles sit on local disk
(`src/server/templates.ts`, `.data/templates/…`).

## Inputs (read first)

- `apps/cms/src/render/{index,parse,render,structure,bundle,placeholder}.ts` + `render.test.ts`
- `apps/cms/src/server/templates.ts`, `app/api/templates/**`
- `apps/cms/src/lib/logic.ts` (`requiredStructures`, `missingStructures`, `NO_MANIFEST`)
- `apps/cms/src/lib/types.ts` `ITemplateManifest`, `ITemplateMapping`, `IRepoConnection`
- PRD Module 4 + Module 5 ("rendered post file in the site's own format"), `00-decisions.md` C12
- [../api-map.md](../api-map.md) §6; [../schema.md](../schema.md) templates section

## Outputs

Everything under `apps/cms/convex/` does not exist yet (**[NEW]**); files elsewhere are marked individually.

| File | Content |
|---|---|
| `apps/cms/convex/templates.ts` | `beginIngest`, `ingest`, `mapItem`, `confirm`, `setOutput`, `active`, `fileUrl`, `sampleUrl` |
| `apps/cms/convex/templatesNode.ts` (`"use node"`) | `parseBundle`: download upload from R2, unzip (fflate), sanitise paths (`safeBundlePath`), enforce `MAX_BUNDLE_BYTES`/`MAX_BUNDLE_FILES`, `kindOfPath`, store files to R2 + `templateFiles`, `pickSamplePost`, `parseTemplate(html, linkedomParse)` → mappings |
| `apps/cms/convex/render.ts` (`"use node"`) | `preview` (public action, `member`), `renderInternal` (publish mode for `shipPost`) |
| `apps/cms/src/render/serialize.ts` **[NEW]** | `toOutput(renderResult, manifest.output, post)`: `html` (as today), `mdx` (front-matter + body), `json` (blocks + meta); `component` deferred unless a pilot repo needs it |
| `app/preview/[site]/[postId]` | renders `render.preview` HTML in a sandboxed iframe (`sandbox` without `allow-scripts`), template CSS/images via `templates.fileUrl` |
| Deleted after cut-over | `app/api/templates/**`, `src/server/templates.ts` |

## Steps

1. `templates.beginIngest` returns an R2 upload URL (developer/admin, size pre-check). `templates.ingest` creates the manifest (`parsing`, `version = latest + 1`) and enqueues `parseBundle`.
2. `parseBundle`: everything above; mappings with `status` and `group` exactly as the client parse produces today (same functions); `needs-confirmation` on success; `TemplateParseError` → manifest stays `parsing` with an error audit + notify the uploader (or add a `failed` status: decide with the lead, update schema).
3. Client-side pre-parse (`ingestTemplate(…, parsed)`) becomes a UX hint only; server parse is authoritative.
4. `templates.confirm`: no `needs-you` mappings left; supersede previous confirmed; audit; re-run the gate for posts held with `NO_MANIFEST` (start `autopostGate` for autopost sites).
5. Renderer on the server: `renderPost({ manifestHtml, post, slots, site, mappings, mode, parseHtml: linkedom, publishedAt, author })`. Publish mode: image `src`/`srcset` = repo asset paths from `IRepoConnection.assetDir` + slot filenames + variant breakpoints; `postUrlFromTemplate` for canonical. `stripUnsafe()` stays.
6. `renderStep` (02 interface): load confirmed manifest; `missingStructures(post, manifest)` non-empty or `held.length` → hold reason "Template can't render: <structure>" + ledger item to developers ("extend the template"); else return `{ path, content, assets[] }` with `path` = `contentDir/<slug>.<ext by output>`.
7. Serializers: `html` done; `mdx` and `json` with golden fixtures; `component` documented as unsupported (manifest `setOutput` refuses it until implemented).
8. Template drift (D13): new manifest applies to new renders and open-MR rebases; live posts untouched.

## Interfaces it must honour

- `IRenderInput` / `IRenderResult` from `src/render/render.ts` (don't fork the renderer; extend via `serialize.ts`).
- `renderStep` I/O (02). Manifest statuses from `schema.md`.

## Test plan

| Kind | Cases |
|---|---|
| Ported | `render.test.ts` passes from the server context (it already uses linkedom) |
| Golden | Lumen bundle (seed `standardMappings`) renders a seed post in publish mode byte-stable across runs; a post requiring `table` on a template without one → held with the structure named; zip with `../evil.html` → path refused; 51 MB zip → refused |
| Security | template with `<script>`, inline handlers, `javascript:` URLs → stripped in preview + publish; preview iframe has no script execution |
| Isolation | `templates.fileUrl` with another site's manifest id → refused |
| E2E | upload zip → map one unclassified item → confirm → preview shows site CSS → a held post re-enters the gate |

## Done when

- [ ] Parse, confirm, preview and publish render all server-side
- [ ] Fidelity holds create developer ledger items
- [ ] `html` + `mdx` + `json` outputs have golden tests
- [ ] Next.js template routes and `.data/templates` removed

## Forbidden moves

- Inventing markup for a structure the template lacks.
- Executing template JavaScript anywhere (server or preview).
- Rendering from an unconfirmed manifest for publish.

## Risks

| Risk | Mitigation |
|---|---|
| linkedom differs from browser `DOMParser` on edge markup | golden fixtures from real customer templates in 09 pilot |
| Large bundles in one action | stream unzip; cap files/bytes (existing constants) |

## Port vs rewrite

| Prototype | Action |
|---|---|
| `src/render/**` | **reuse unchanged** (pure, DOM injected) |
| `src/server/templates.ts` | **rewrite** (fs → R2 + `templateFiles`), keep `TemplateBundleError` messages |
| `app/api/templates/**` | **delete** after cut-over |
