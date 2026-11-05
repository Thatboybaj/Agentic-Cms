# 01 — Jobs and principles

## Personas, ranked by who drives the programme

| Rank | Persona | Job in the CMS | Touches |
|---|---|---|---|
| 1 | **Content specialist** (Tolu B.) | Runs a client's blog programme day to day without a code editor | Everything but merge |
| 2 | **Developer / repo owner** (Kunle O.) | Connects the repo once, ingests the template once, then only reviews MRs | Onboarding, Templates, MRs |
| 3 | **Agency admin** | Adds sites and users, routes models, sets budgets | Settings, Runs (cost) |
| 4 | **Client stakeholder** | Watches progress, comments on drafts | Plan (read), Editor (comment), SEO (read) |

## Jobs to be done (V1 must nail)

| # | Job | PRD anchor | Success signal |
|---|---|---|---|
| J1 | *When I open the CMS on Monday, I want to see what's coming and what's stuck, so I unblock the right thing first.* | Module 1 | Stuck items reachable in 1 tap from `/plan` |
| J2 | *When a draft lands, I want to fix it with the agent without losing control of every change, so the voice stays ours.* | Module 2 | Every agent change is an accept/reject diff |
| J3 | *When a post needs images, I want them produced and placed without design work, so the post never stalls.* | Module 3 | ≥ 70% slots filled with no upload |
| J4 | *When I approve, I want proof that facts, images, SEO and markup are right, so the MR merges without fixes.* | Gate, Module 5 | Approval screen shows all four checks + MR preview |
| J5 | *When a client asks "is it working?", I want one number and the posts behind it.* | Module 6, 7 | Gap-to-projection + KAS concentration above the fold |

## UX principles (each has a rule a reviewer can check)

| # | Principle | Checkable rule |
|---|---|---|
| P1 | **Stuck is louder than busy** | Human-blocked counts render in amber (`human` tone) in the `StatStrip` and on cards; agent-busy states render in blue and never outrank them. Any screen with a blocker shows it in the first viewport. |
| P2 | **The machine is always labelled** | Anything an agent produced, is producing, or suggested carries an `AgentBadge` or blue `agent` tone. Blue is never decoration (Agent-blue rule). |
| P3 | **Diffs, not overwrites** | No agent action mutates content without an `AgentDiff` accept/reject. Undo `Toast` for every human mutation. |
| P4 | **Blocks explain themselves** | Every disabled primary action shows *why* inline (`LockedAction`: "· 2 hard blocks") and links to the fix. Hard blocks = red, soft = amber with "override with a reason". |
| P5 | **One black button** | Exactly one `Button variant="primary"` (ink fill) per view region. Everything else is white/glass. |
| P6 | **Numbers carry their source** | Every metric shows its source or lag (`SourceNote`: "Search Console · lags 2–3 days"). Missing data = `DataGap`, never 0. |
| P7 | **Setup is twice, then invisible** | Developer-only surfaces (repo, template) are wizards that end in a versioned summary; nothing developer-ish appears on the specialist's daily screens. |

## Tap/click budgets (from J1–J5, verified in `03-flows.md`)

- Plan → open the most-stuck post: **1 click** (card arrow).
- Accept an agent edit: **1 click**.
- Fill an image slot from candidates: **2 clicks** (pick, use).
- Approve a clean post: **4 clicks** (three assertions + Approve and open MR).
- Plan → SEO headline number: **0 clicks** (visible on `/plan` rail) / 1 click for the full view.
