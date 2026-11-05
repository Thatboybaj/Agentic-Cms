# Multi-site, multi-user contract (binding for the parallel build)

Goal: one agency workspace services many client websites; several people work at once, each with a role **per site**.
The prototype stays client-side (no backend yet) but must behave the way the Convex backend will, so the swap is mechanical.

## 1. URL is the source of truth for the site

Helpers: `src/lib/routes.ts` (`sitePath`, `previewPath`, `siteSlugFromPath`, `stripSite`, `WORKSPACE_ROUTES`).

| Level | Routes | Notes |
|---|---|---|
| Workspace | `/sites` (portfolio, default landing), `/inbox` (cross-site work for *me*), `/team` (people + per-site roles, invites), `/account`, `/sign-in` | No site in the URL. |
| Site | `/s/[site]/plan`, `/s/[site]/plan/new`, `/s/[site]/posts`, `/s/[site]/posts/[id]` (+ `/assets`, `/versions`), `/s/[site]/assets`, `/s/[site]/templates` (+ `/ingest`), `/s/[site]/onboarding`, `/s/[site]/approvals`, `/s/[site]/merge-requests`, `/s/[site]/seo` (+ `/reports`), `/s/[site]/runs`, `/s/[site]/settings` | Every existing route moves here unchanged in behaviour. `[site]` = `ISite.slug`. |
| Outside shell | `/preview/[site]/[postId]`, `/styleguide` | |
| Redirects | `/` → `/sites`; old flat routes (`/plan`, `/posts/:id`, …) → `/s/<last-used site>/…` | Keep old deep links working. |

Rule: **no feature builds a URL by hand.** Use `sitePath(slug, "/posts/" + id)`; get the slug from `useSite()` (below).

## 2. Data model additions (`src/lib/types.ts`)

```ts
interface IUser { id; name; initials; email; title?; avatarHue: number; status: "active" | "invited" | "suspended" }
interface IWorkspace { id; name /* "Grandeur" */; plan: "pilot" | "agency" | "enterprise"; seatsUsed; seats }
type TWorkspaceRole = "owner" | "admin" | "member";            // workspace-level
interface IMembership { userId; siteId; role: TRole; addedAt; addedBy }   // site-level, one per user per site
interface ISite { …existing; slug: string; industry: string; status: "active" | "onboarding" | "paused"; createdAt; accent?: number /* hue for the site avatar */ }
interface IPresence { userId; siteId; path; at }                // who is where (simulated, cross-tab)
interface IPost { …existing; assigneeId?: string; editingBy?: { userId; since } }
ICmsState → { version: 2, workspace, users, workspaceRoles: Record<userId, TWorkspaceRole>, memberships, sites, data, jobs, presence }
```

- **Effective role** on a site = workspace `owner`/`admin` → `admin`; otherwise the `IMembership.role` for that site; no membership → **no access** (site hidden from switcher, `/s/<slug>` renders an access-denied state with "Request access").
- `ICmsState.siteId` and `ICmsState.role` are removed from shared state. Current user = **per tab** (`sessionStorage`), so two tabs can be two different people; domain data stays in `localStorage` and syncs across tabs via the `storage` event (simulates the realtime backend).
- Seed: workspace "Grandeur", 8 sites across industries (Lumen Dental full data; Northwind Legal; plus 6 lighter sites — e.g. Harbor Vets, Kora Fintech, Atlas Physio, Sable Coffee, Meridian Realty, Juniper Skincare — each with a few posts/ideas, budgets, one or two in `onboarding`/`paused`), 7 users with mixed per-site roles (a specialist on 4 sites, a developer on 6, two client stakeholders each scoped to their own site, an agency admin, an invited user).

## 3. Store API changes (`src/lib/store.tsx`)

- `<SiteScope slug>` — client component used by `app/(app)/s/[site]/layout.tsx`; resolves the site by slug, provides it via context, records presence, and renders loading / not-found / no-access states.
- `useSite()` → `{ site, slug, data, role, can(p), why(p) }` for the **scoped** site (throws outside `SiteScope`).
- `useCms()` keeps working inside `SiteScope` (`site`, `data`, `role`, `can`, `why` come from scope) so existing features need no logic changes.
- `useWorkspace()` → `{ workspace, me, users, memberships, sitesForMe, roleOn(siteId), signInAs(userId), signOut() }`.
- Cross-site selectors: `usePortfolio()` (per site: pipeline counts, needs-me, held, ideas pending, spend vs cap, gap-to-projection, last activity), `useInbox()` (items across *my* sites that need me: pending ideas, held posts, human-only slots, ledger overdue, failing CI, invites), `usePresence(siteId?, path?)`.
- Actions: every existing action takes the **scoped** site implicitly (unchanged signatures). New: `inviteUser(email, siteRoles)`, `setMembership(userId, siteId, role | null)`, `setWorkspaceRole`, `addSite({ name, domain, industry })` → slug, `pauseSite`/`resumeSite`, `assignPost(postId, userId | null)`, `startEditing(postId)` / `stopEditing(postId)` (soft lock: a second editor sees "Tolu is editing — view only / take over").
- Permission checks stay `can()`/`why()` but evaluate the effective role on the scoped site. Workspace actions use `canWorkspace("members.manage" | "site.add" | "billing.view")`.

## 4. File ownership in this build

| Owner | Files |
|---|---|
| Data agent | `src/lib/**` except `routes.ts` |
| Routing agent | moving `app/(app)/*` → `app/(app)/s/[site]/*`, `app/(app)/s/[site]/layout.tsx`, redirects (`app/page.tsx`, old-route redirects, `middleware.ts`), `app/preview/**` path change, and **only link/URL edits** inside existing `src/features/**` |
| Workspace-UI agent | `app/(app)/sites|inbox|team|account/**`, `app/sign-in/**`, `src/features/{workspace,sites,inbox,team,account,sign-in}/**`, `src/features/shared/app-shell.tsx`, SiteSwitcher/presence additions in `src/ds/shell.tsx` + `src/ds/domain.tsx` (additive) |
| Docs agent | `docs/engineering-blueprint.md`, `docs/backend/**` |
| Lead | `src/lib/routes.ts`, this contract, integration + verification |
