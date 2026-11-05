# 06 — Content and motion

## Voice

**Plain, specific, calm.** The CMS talks like a careful editor who also knows the repo: it names the post, the
number and the source, says what happens next, and never cheers. Numbers carry their source or lag (P6); the machine
is always named (P2); blocks say why and how to clear them (P4).

| Do | Don't |
|---|---|
| "The agent found no citable source for "95%". Add one, or rewrite without the number." | "Warning: potential factual inaccuracy detected!" |
| "2 hard blocks" · "Keyword missing in first 100 words" | "Your post isn't ready yet 😕" |
| "Gap to phase projection −6.2%" + "Search Console · lags 2–3 days" | "Traffic is up!" |
| "This run would cost about $62.00. Lumen Dental has $54.00 left of its $150 text cap this month." | "Insufficient credits." |
| "Writes only to content/blog and public/images/blog. Never pushes to main." | "Secure integration." |
| "Clinic photo for veneers post · Day 15 · holds 1 post in Needs assets" | "Some tasks are overdue." |
| "Search Console not connected · no positions or impressions — nothing here is estimated." | a blank chart, or "0" |

Rules
- Second person for the viewer ("you", "needs you"); first name + initial for people ("Tolu B.", "Kunle O."); agents by
  job ("Blog writer agent", "Keyword agent", "CMS agent"), never a persona name.
- Say which agent/model/provider did it: "Agent edit", "Flux via MCP", "strongest model". Blue (agent tone) only on those.
- Every refusal or lock = **what** + **why** + **how to clear it** in ≤ 2 sentences.
- No exclamation marks, no emoji, no "Oops", no "AI-powered", no "magic". Success is stated as the resulting fact
  ("MR !16 opened on GitHub"), not "Success!".
- Never imply a human did what an agent did, or the reverse. Approval copy always restates the three assertions.
- Never invent: no "about", "roughly" unless the value is an estimate — and then label it "Est.".
- Stakeholder-visible surfaces (plan, SEO, reports, ledger) avoid repo jargon; developer surfaces use real paths in mono.

## Casing

| Thing | Rule | Example |
|---|---|---|
| Post **working titles** (cards, lists, queues, breadcrumbs) | lowercase, keyword-style, as refs; parentheses allowed | "root canal recovery: what to expect", "invisalign cost in lagos (2026 prices)" |
| **SEO title** / rendered H1 / preview | Title Case as it will ship | "Root Canal Recovery: What to Expect Day by Day" |
| Keywords | lowercase, as searched | "invisalign cost lagos", "implant vs bridge cost" |
| UI (titles, buttons, tabs, chips, menu items) | Sentence case | "Approve and open MR", "Mark human-only", "Pillar matrix" |
| Post states | Exactly as 02: `Idea` · `Briefed` · `Drafting` · `Needs assets` · `In review` · `MR open` · `Live` · `Decaying` | never "Pending review", "Published" |
| Proper nouns / products | As owned | GitHub, GitLab, Search Console, Higgsfield, OpenAI, Flux, Ahrefs, Semrush, MDX, WebP, JSON-LD |
| Acronyms in UI | MR, KAS, CI, KD, SEO, FAQ, CTA — no expansion in chips; expand once in tooltips ("Keyword Attribution Score") | "KAS gap" |
| Code, selectors, paths, branches, filenames | mono, verbatim | `h2.post__heading`, `content/implant-vs-bridge-cost`, `invisalign-lagos-2.webp` |
| Eyebrows inside `TemplatePreview` / `SourceCodeFrame` | whatever the site's template does (e.g. "GENERAL DENTISTRY · 6 MIN READ") — the CMS never restyles site content | — |

## Formats (locale en, fixture tz Africa/Lagos, Latin digits)

| Thing | Format | Example |
|---|---|---|
| Timestamp (provenance, audit, MR, runs) | `d MMM yyyy, HH:mm` 24 h | 25 Sep 2026, 10:42 |
| Date (no time) | `d MMM yyyy`; current year may drop year in dense UI | 24 Sep · 12 Mar 2025 |
| Scheduled day | `EEE d MMM` + time on its own | Mon 29 Sep · 09:00 |
| Relative (versions, notifications) | `now`, `4m`, `22m`, `1h`, `Yesterday`, then date; long form "4 min ago" in headers | v4 · Human edit · 4 min ago |
| ISO week | `W{nn}` in charts, grids, cards; "Week {nn}" in page subtitles | W39 · Week 39 |
| Week ranges | `W32–W39` (en dash) | — |
| Ages | "Day {n}" (ledger, approval queue) | Day 15 |
| Currency (spend, estimates, caps) | USD, `$` prefix, 2 decimals for estimates/runs, 0 decimals for caps/budgets | Est. $0.12 · $4.20 · $142 / $200 |
| Budget | `$spent / $cap`; remaining "$54.00 left" | $96 / $150 |
| Percent | 1 decimal for KAS share, 0 for concentration/pillars/executed | 18.4% · 64% · 62% |
| Signed deltas | `+` / `−` (U+2212) always shown; 0.0 unsigned; percentage points implied in KAS | +2.1 · −1.3 · 0.0 · −6.2% |
| Counts | grouping comma | 3,184 · 1,412 words |
| Ratios / progress | `n / m` with spaces; "n of m" in sentences | 10/12 (gate score) · 4 / 5 filled · 1 of 2 · 3 / 4 wk |
| Dimensions | `W × H` (U+00D7) | 1200 × 800 · hero 1600×900 (selector labels keep the site's own form) |
| Position | integer + arrow ↑ / ↓ + "decaying" when flagged; null → "—" with tooltip "Not ranking" | 7 ↑ · 11 ↓ decaying |
| Difficulty | "KD {n} · {source}" | KD 31 · Ahrefs · KD 18 · SERP |
| Tokens | grouping comma + "tokens" | 38,420 tokens |
| MR / commit | "!n" for MR numbers on every host (one convention); short SHA, 7 chars | !16 · a41f9c2 |
| Separator | " · " (spaced middle dot) | Commercial · KD 31 · Ahrefs · Comparison |
| Model | tier first, id second | strongest · {model id from routing} |

## State labels and tones (exact; from 02)

| State | Chip label | Owner tone |
|---|---|---|
| idea | Idea | agent |
| briefed | Briefed | agent |
| drafting | Drafting | agent |
| needs-assets | Needs assets | human if any human-only slot, else agent |
| in-review | In review | human |
| mr-open | MR open | ink (developer) |
| live | Live | pass |
| decaying | Decaying | agent |

Other fixed labels: gate "Hard block · section {n}" / "soft"; ledger "To-do" (< 7 d) / "Overdue" (7–13 d) / "Blocker"
(≥ 14 d); slot "Human-only · waiting on you"; run status "Queued" · "Running" · "Succeeded" · "Failed" · "Refused · over cap";
CI "Checks pending" · "Checks passing" · "Checks failing" · "No checks configured"; MR "Open" · "Conflict" · "Merged" · "Closed";
origins "Agent generation" · "Agent edit" · "Human edit" · "Refresh"; roles "Content specialist" · "Developer" ·
"Client stakeholder" · "Agency admin".

## Copy patterns

**Empty** = what's missing + when/how it fills + ≤ 1 action.
- "No posts yet" / "The keyword swarm runs Mon 29 Sep at 09:00 and fills the Idea column. Add an idea now or run it early."
- "Nothing waiting for approval" / "Posts land here when every image slot is filled. 2 are in Needs assets."
- "Every slot is filled" / "New slots arrive with each draft's image sheet."
- "Not enough data yet" / "The first trajectory needs 2 weeks of Search Console data · from 6 Oct."

**Error** = "Couldn't {verb} {thing}." + reason if known + action.
- "Couldn't load the plan." [Try again] · "Couldn't save. Your text is kept here." [Retry] · "Couldn't reach GitHub. Statuses may be stale (last synced 10:31)."
- Agent failure names the step and the retry count: "Draft generation failed at section 5 of 7. Retrying (2 of 3)."
- Provider failure: "Flux via MCP didn't respond. Retried 3 times."

**Blocked / locked** = inline reason on the control (`LockedAction`): "Approve · 2 hard blocks", "Send to review · 4 / 5 filled",
"Confirm manifest v1 · map 2 items", "Run now · over cap". Role: "Your role can't {action}. {Name} can." Hard: "Can't override".

**Data gap** (never zero): "{Source} not connected · no {metrics} — nothing here is estimated." / "No data W35" / "Not ranking yet · Search Console lags 2–3 days".

**Guardrails**
- Fact marker: "Unsourced statistic · Can't override" / "The agent found no citable source for "{claim}". Add one, or rewrite without the number."
- Imagery: "We don't generate identifiable real people or imitate living artists. Edit the prompt or upload a licensed photo."
- Regulated: disclaimer "This article is general information, not medical advice. Book a consultation with a Lumen Dental dentist." Removing it: "Regulated topic · removing the disclaimer needs a reason."
- Fidelity: "This post needs a table. The Lumen template doesn't have one. Ask Kunle O. to extend the template."
- Spend: "This run would cost about ${est}. {Site} has ${left} left of its ${cap} {text|image} cap this month. Ask an admin to raise the cap, or run a smaller batch." 80%: "This run takes you past 80% of the text cap. Admins get an alert."
- Scope: "Writes only to {contentDir} and {assetDir}. Never pushes to {base}. CI runs the repo's own checks."

**Override + audit**
- Soft override field: title "Soft block · override with a reason", caption "Logged to the audit trail and listed in the MR". Minimum 20 characters; placeholder "Why is this OK to ship now?".
- MR description line: "On-page 11 / 12 · 1 override" and under *Unresolved items*: "Internal links 1 of 2 — overridden by Tolu B.: "Only one relevant page is live…"".
- Audit row: `{timestamp} · {actor} · {verb} · {target} · {detail}` — verbs past tense, lowercase: "approved", "overrode soft block", "resolved fact marker", "accepted agent edit", "rejected agent edit", "restored v3", "rescheduled to W41", "marked human-only", "uploaded image", "ran keyword swarm (manual) · $4.20", "refused run · over cap", "opened MR !16", "merged !14", "confirmed manifest v1", "changed role".
- Approval intro (always): "Approving asserts the facts are right, the voice is right, and the brand stands behind it. It can't be delegated to an agent."

**Toasts** (fact + undo when reversible): "Accepted · v5 · Undo" · "Moved to W41 · generation moves to Mon 5 Oct · Undo" · "Added to Idea · W41 · Undo" · "MR !16 opened on GitHub" [View MR] · "implant vs bridge is live · first score 26 Sep, 11:20" · "Comment sent to Tolu B.".

**Notifications** (title · body → link): "Approval requested · implant vs bridge: cost and lifespan" → `/approvals?post=…` · "Named blocker: Clinic photo for veneers post · day 14 · holds porcelain veneers: before and after" → `/posts/…/assets?slot=…` · "CI failing on !15 · check-links" → `/posts/…` · "Pivot trigger · Concentration above 60% in two reports" → `/plan` · "Report #7 is ready · 12–25 Sep 2026" → `/seo/reports?edition=7` · "Draft ready for your comments · root canal recovery" (stakeholder) → `/posts/…`.

## Motion

Durations are the DS tokens **120 / 200 / 320 / 600 ms**, easing **ease-out** for entrances and state changes
(ease-in only for exits under 200 ms). Animate `transform` and `opacity` only (chart draw uses `stroke-dashoffset`).

| Token | ms | Used by |
|---|---|---|
| `--dur-1` fast | 120 | Hover/press on buttons, chips, rail buttons (scale 0.98); checkbox/assertion tick; `SegmentedControl` indicator; `Toggle` |
| `--dur-2` base | 200 | `Menu`, `Tooltip`, toasts from `useToast` (`ToastProvider`) in/out; `AgentDiff` insert (height + fade); `FactHighlight` open → resolved tint; `LockedAction` unlock (lock icon out, label crossfade); candidate select check |
| `--dur-3` slow | 320 | `Sheet` / `Dialog` enter (slide 24px + fade, glass scrim fade); `SplitPane` aside open; card drag settle; `Skeleton` → content crossfade; route change crossfade |
| `--dur-4` draw | 600 | `TrajectoryChart` line draw (actual first, projection dashed after 120 ms delay), `ShareBar` / `Meter` / `ProgressBar` fill from 0, `ConcentrationGauge` sweep — once on first view, not on refetch |

Rules
- **Agent running pulse:** `AgentStatusPill` dot, `AgentBadge running`, `Dot pulse` — soft ring scale 1 → 1.8 + fade, 1.6 s loop
  (= 600 + 1000 ms rest), agent tone only. It is the only looping animation besides `Skeleton` shimmer (1.2 s linear). Stops when
  the run ends; the pill count changes with a 120 ms number crossfade. Human-blocked items never pulse (stillness = waiting on you).
- **Card drag (F12, board promote):** lift on pointerdown 120 ms (scale 1.02 + elevation); card follows pointer 1:1 (no easing);
  valid drop target highlights (outline) 120 ms; drop settles into slot 320 ms ease-out; invalid drop/failed move returns to origin
  320 ms then Toast. Other cards reflow with 200 ms translate.
- **Diff lifecycle:** Accept → before-block collapses and after-block tint fades to surface 200 ms; Reject → diff collapses 200 ms.
  Stream-in of generated sections: each new block fades up 8px 200 ms; no typewriter effect.
- **Gate changes:** a check flipping fail → pass animates the icon (120 ms) and the score "10/12 → 11/12" crossfades; the locked
  Approve unlocks 200 ms after the last hard block clears (so the cause is seen first).
- **Candidates:** tiles appear as they return (staggered 60 ms, 200 ms each), not all at once at the end.
- **Charts** draw once per mount at 600 ms; range switch (8 weeks / Quarter / Since launch) morphs points 320 ms. Data gaps are
  never animated across (the line breaks).
- **No celebration** for approvals or merges — a Toast and the state chip changing is the whole response.
- **Reduced motion** (`prefers-reduced-motion: reduce`): all transforms → 120 ms opacity; no pulse (static ring on the dot);
  static `Skeleton` (no shimmer); charts render final state immediately; drag has no lift/settle (drop target outline only);
  `Sheet` fades instead of slides.
