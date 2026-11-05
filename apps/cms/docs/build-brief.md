# Screen build brief (Phase 3) — read fully before writing code

App: `apps/cms` (Next.js 15 App Router, React 19, Tailwind v4, TS strict). Dev server already running at
http://localhost:3200 (do NOT start another). Tabs, double quotes.

## Contracts (binding)
- Screen specs: `docs/uxer/04-screen-specs.md` (your screens' sections: regions, components, CTA, copy, **all five states**).
  Flows + click budgets: `docs/uxer/03-flows.md`. Copy/format/motion: `docs/uxer/06-content-and-motion.md`.
- Visual truth: `docs/reference/0N *.dc.html` (read the inline styles of the desktop AND the mobile 390 frame) and
  `docs/visual-aid.png`. Match hierarchy: white cards (Card solid, r-22) on the glass shell, bold General Sans titles,
  grey Poppins meta, tiny tone chips, one black pill CTA per region.
- DS: import everything UI from `@/ds` (see `src/ds/*.tsx` for real prop signatures; inventory in `docs/uxer/05-component-inventory.md`,
  rules in `docs/design-system.md`). **Never** import `@phosphor-icons/react` in features/app; use `<Icon name=… />`
  (registered names in `src/ds/icons.tsx`; if you need a new icon, append it to both lists there).
- Data: `@/lib/store` + `@/lib/logic` — API in `docs/store-api.md`. Never keep your own copy of domain data; all
  mutations go through `actions.*`; check `can("…")` and render `RoleGate`/`LockedAction` with `why()` — never hide
  a gated action silently.
- Shell: `app/(app)/layout.tsx` wraps every route in `AppShell` (rail, top bar, toasts, providers). Your page renders
  only the content column. Put the route's ONE primary top-bar CTA via `<TopBarCta>` from `@/features/shared/app-shell`.
- Structure: route file `app/(app)/<route>/page.tsx` is a thin server component that renders a client feature
  `src/features/<module>/index.tsx` ("use client"). Dynamic params: `export default async function Page({ params }: { params: Promise<{ id: string }> })`.
  `useSearchParams` requires a `<Suspense>` boundary in the page.

## Hard rules (enforced by `src/ds/ds.test.ts`)
1. No color literals (hex/rgb/hsl/oklch) outside `src/ds/tokens.css` — use Tailwind aliases (`bg-surface`, `text-ink-3`, `bg-agent-soft`, …).
2. Logical properties only in .tsx/.css: `ms- me- ps- pe- start- end- text-start text-end`, never `ml- mr- pl- pr- left- right- text-left`.
3. Agent-blue = the machine did/is doing it. Human-amber = waiting on a person. Red = hard block. Green = pass. No decorative use.
4. Every metric shows its source (`SourceNote`) or an explicit `DataGap` — never blank/0 for missing data.
5. Exactly one `variant="primary"` button per region. Disabled actions explain why inline.
6. Responsive: desktop 1440 × 900 like refs (content fits the shell; panes scroll internally with `thin-scrollbar`),
   and 390 mobile (stack; follow the ref mobile frames).

## You may edit
Only the files your task lists, plus: appending icons to `src/ds/icons.tsx`; small **additive, backwards-compatible**
props on a DS component when a screen truly needs it (note it in your final report). Don't edit `src/lib/*` — if the
store lacks something, work around it in the feature and report it.

## Verify before returning
1. `npx tsc --noEmit -p .` clean for your files; `npx vitest run src/ds` rules pass for your files.
2. Load each of your routes in the browser pane (tools `mcp__Claude_Browser__*`; `navigate` to http://localhost:3200/…
   in a new tab via `tabs_create` — don't close other tabs), set viewport 1440×900, check console errors, click through
   the main flow (e.g. accept a diff, approve), screenshot; then 390×844 mobile.
3. Return: routes built, what you verified, DS/icon additions, known gaps.
