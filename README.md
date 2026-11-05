# Agentic CMS: handover

Read these first:

1. `01-project-overview.pdf`: what the product is, who uses it, its screens and agents, and where it stands.
2. `02-backend-ai-engineering-brief.pdf`: the backend and AI engineering plan, phases B0–B9 and the open decisions.

## What's in this zip

| Path | What it is |
|---|---|
| `apps/cms/` | The Next.js 15 app (`@studio/cms`): frontend prototype, design system (`src/ds`), store and logic (`src/lib`), renderer (`src/render`), server prototypes (`src/server`) |
| `apps/cms/docs/` | PRD source, UXer build details (`uxer/`), design system docs, multi-site contract, store API, engineering blueprint |
| `apps/cms/docs/backend/` | Backend blueprint (`README.md`), `schema.md`, `convex-schema.draft.ts`, `api-map.md`, `handoffs/00–09` |
| `apps/cms/docs/handover/` | HTML sources of the two PDFs (render with Chrome "Print to PDF") |
| `packages/seo-harness/` | `@studio/seo-harness` 0.2.0: agent roster, skills, `harness-config.yaml`, `HARNESS.md` |
| `site-atlas/seo-harness/` | The agent atlas site for the harness (static) |

Not included: `node_modules`, build output (`.next`, `.next-prod`) and `apps/cms/.data/`, which holds local provider keys and uploaded template bundles.

## Run it

The app is a package in the Studio Product Framework monorepo (`The-Utopia-Studio/studio-product-framework`). Copy `apps/cms` and `packages/seo-harness` into that repo at the same paths, then:

```bash
pnpm install
pnpm --filter @studio/cms dev        # http://localhost:3200/sign-in
pnpm --filter @studio/cms test       # 156 tests
pnpm --filter @studio/cms typecheck
pnpm --filter @studio/cms build
```

Requires Node 20+ and pnpm 10. On the sign-in screen, pick a person: Tolu is a specialist on 4 sites, and Amaka is the owner who sees all 8. Demo data lives in the browser (localStorage `cms.*`); clear it to reset.

Optional, for the image features: add provider keys (Anthropic for diagrams, image APIs or MCP servers) in a site's Settings → Connections, and set `CMS_SECRET_KEY` so those keys are encrypted on disk. Connections, template upload and the visual agent API routes are **localhost only** and have no auth; they are replaced by Convex in backend phase B4.

## Next step

Settle decisions D1, D2, D3 and D14 (brief, section 08), then start `apps/cms/docs/backend/handoffs/00-setup.md`.
