---
name: blog-writing-agent
description: Write complete SEO/AEO-optimized blog posts from a keyword or content brief, with a built-in visual asset workflow that identifies where images belong, writes a production-ready image brief for each slot (for Higgsfield, another AI image tool, or a human graphic designer), hands the slots to the visual-asset-agent (or, where a slot is human-only or the site has no image route, pauses for the writer to supply the assets), then integrates them with optimized filenames and alt text. Use this skill whenever the user asks to write a blog post, article, pillar page, comparison post, how-to guide, FAQ hub, or any long-form content intended to rank in search or be cited by AI engines — even if they just say "write a post about X".
---

# Blog Writing Agent

Produces publish-ready blog posts in a two-phase workflow: **Phase 1** writes the article with marked image slots and briefs, **Phase 2** (after assets arrive) integrates the visuals and delivers the final package.

> CMS v0.2 change: inside the Agentic CMS harness, "assets arrive" means the visual-asset-agent returns selected assets plus a provenance log for every slot. The agent no longer stops to wait for a human upload by default. Human upload remains available: any slot the site marks human-only, or any slot the visual-asset-agent could not fill, still pauses for a person. The frontmatter description was edited to match.

## Mandatory inputs — collect before writing

Ask for missing items in one message, then stop and wait:

1. **Target keyword** OR a content brief (if a brief exists from keyword-research-swarm or seo-action-plan, use it and skip redundant questions)
2. **Brand context** — who is publishing, what they sell, tone of voice. If a BrandPack / brand guide document exists, request it once and reuse it for the whole session
3. **Content type** — pick from the type table below (infer from the keyword if obvious, state the inference)
4. **Word count target** (default 1,500–2,500 if unspecified)

Optional but valuable: audience persona, internal URLs for linking, the CTA destination, competitor post currently ranking #1.

## Content type table

Choose structure by type; each type has a different AEO target:

| Type | AEO target | Structural signature |
|---|---|---|
| Definition post | AI overviews + featured snippet | "What is X" H1, entity definition block, comparisons |
| How-to guide | Featured snippet + Perplexity | Numbered steps, HowTo schema flag, tools list |
| Comparison post | Commercial AI answers | Comparison table, verdict section, use-case matrix |
| FAQ hub | People Also Ask boxes | 15–25 Q&As grouped by theme, every Q an H3 |
| Statistics roundup | Citation target for AI engines | Numbered stats with sources, methodology note |
| Template/resource post | Downloads + citations | The resource itself + usage instructions |

## The post template (every post, adapted per type)

```
# [Keyword-rich H1 — question or benefit format]
[40–60 word direct answer paragraph — written to be pulled as the snippet]
[IMAGE SLOT 1 — hero]
## What is [core concept]?          ← definition block for AEO
## Why [topic] matters for [audience]
## [Type-specific body sections — this is the flexible zone]
[IMAGE SLOTS as earned — see image rules]
## How [brand's relevant feature/service] solves [problem]   ← one section only, never salesy throughout
## FAQ                              ← minimum 4 Q&As, each Q an H3
```

Keyword in the first 100 words. Density 1–2%. 5+ LSI terms. 2–3 internal links (use provided URLs or `[INTERNAL LINK: topic]` placeholders). 1–3 authoritative external links. One CTA block.

## Phase 1 — Write + image briefs

Write the full article. As you write, insert image slots **where a visual earns its place** — not on a fixed schedule. A slot is earned when a concept is spatial, comparative, sequential, or data-shaped, or when a section exceeds ~400 words with no visual relief. Typical post: 1 hero + 2–4 body slots.

Each slot gets this exact marker inline in the draft:

```
[IMAGE SLOT n: short-purpose-label]
```

Then, at the end of the draft, output an **Image Production Sheet** — one brief per slot, written so a Higgsfield agent, any AI image tool, or a human designer can execute it without asking questions:

```
### Slot n — [purpose label]
- Placement: after section "[H2 name]"
- Type: [hero / diagram / comparison graphic / screenshot annotation / data chart / illustration]
- Dimensions: [e.g. 1200x630 hero, 1200x800 body, 1080x1080 social crop] 
- Format: [WebP preferred; PNG if text-heavy; SVG if diagram]
- Content direction: [2–3 sentences: exactly what the image shows, what text overlays if any]
- Style: [brand palette/mood keywords — pull from brand context]
- AI generation prompt: [one ready-to-paste prompt for Higgsfield/image model]
- Filename when delivered: [keyword-slug-descriptor.webp]
- Alt text (pre-written): [descriptive, keyword variant only if accurate]
```

**Then stop.** End Phase 1 with: the full draft, the production sheet, and one clear ask: "Upload the finished images (or tell me which slots to cut or generate differently) and I'll assemble the final version." Do not fabricate image files. Do not proceed to Phase 2 without assets or an explicit instruction to skip visuals.

> CMS v0.2 change: in the harness, the production sheet is handed to the visual-asset-agent instead of ending on the upload ask. The sheet format above is its input contract, unchanged. The upload ask is only issued for slots marked human-only or held by the visual-asset-agent (provider failure, over cap, no licensable source); those slots hold the post in Needs assets. The no-fabrication rule still applies: this agent never produces image files itself.

## Phase 2 — Integrate + deliver

When assets arrive:
1. Match each file to its slot; rename per the production sheet filenames if the user's environment allows, otherwise list the rename mapping
2. Replace slot markers with proper embeds (markdown or HTML per the user's CMS), attach the pre-written alt text
3. Run the post through the on-page-seo-optimizer checklist if that skill is available; otherwise self-check title, density, links, FAQ count
4. Deliver: final post file, meta title + description, OG tags, suggested URL slug, and a one-paragraph social teaser for LinkedIn/X

> CMS v0.2 change: when the site's autopost setting is on (the default), the quality gate after step 3 is automatic: the CMS agent resolves every [VERIFY] marker by sourcing the claim or rewriting without it, accepts soft blocks with a logged reason, and holds the post for human review on any hard block it cannot clear. Nothing here ever ships with an open [VERIFY] marker. When autopost is off, the final package goes to the human In review gate as before. Asset provenance from the visual-asset-agent travels with the package.

## Writing quality rules

- The direct-answer block must genuinely answer the query — a reader who reads only those 50 words should learn the core fact
- Every claim that sounds like a statistic needs a source or a `[VERIFY]` marker; never invent numbers
- Brand mentions live in their one designated section plus the CTA. Educational sections stay educational
- Information gain check: before finishing, name one thing this post contains that the current top results don't. If you can't, flag it to the writer as the highest-value human contribution needed
- Match the brand voice document over generic "blog voice" whenever they conflict
