---
name: on-page-seo-optimizer
description: Audit or optimize any web page, blog post, or draft against a complete on-page SEO checklist (meta title, URL structure, headers, keyword placement and density, content length, internal/external links, multimedia, alt text, schema, social meta). Use this skill whenever the user asks to audit a page, optimize a post for SEO, check on-page SEO, score a draft, fix meta tags, or mentions on-page SEO in any form, even casually ("is this post SEO-ready?", "check this URL"). Also use it as the quality gate step inside any blog publishing workflow.
---

# On-Page SEO Optimizer

Audits or rewrites a page against a fixed, numbers-based on-page checklist. Two modes: **AUDIT** (score an existing page or draft, report fixes) and **OPTIMIZE** (apply the fixes and return the corrected version).

## Mandatory inputs — do not proceed without these

Before doing anything, confirm you have all three. If any are missing, ask for them in a single message and stop:

1. **Target keyword** (the one primary keyword; secondary keywords optional)
2. **The page** — a URL to fetch, pasted HTML/markdown, or a draft file
3. **Search intent** — informational, commercial, transactional, or navigational (if the user doesn't know, infer it from the keyword, state your inference, and continue)

Optional inputs that improve output: brand voice notes, list of existing site URLs (for internal linking), competitor URL ranking #1 for the keyword.

## The checklist (apply every item, in this order)

Each item has a hard target. In AUDIT mode, mark each PASS / FAIL / N-A with a one-line reason. In OPTIMIZE mode, fix every FAIL.

### 1. Meta title
- Target keyword appears in the **first word or two** of the title (front-loaded)
- **≤ 60 characters** (aim 50–60; flag anything over)
- Contains one modifier where natural: "guide", "best", "2026", "checklist", "review"
- Reads like a human wrote it — no keyword stuffing

### 2. URL structure
- Keyword present in the URL slug
- Short: **3–5 words in the slug**, no stop words, no dates, no numbers that will age
- Lowercase, hyphens only

### 3. Meta description
- 150–160 characters, contains the keyword once, ends with an implicit or explicit reason to click

### 4. Header hierarchy
- Exactly **one H1**, containing the target keyword
- Keyword or close variant in **at least one H2**
- H2/H3 structure follows logical nesting (never skip levels)
- For AEO: at least one H2 phrased as a question the keyword implies

### 5. Keyword placement and density
- Keyword appears in the **first 100 words** of body copy
- Overall density **1–2%** of body text — count it, don't guess. Below 0.5% = under-optimized; above 2.5% = stuffing, remove instances
- **5–10 LSI keywords / synonyms** woven in naturally (list which ones you used or found)

### 6. Content length
- Competitive informational keywords: **1,500+ words** (2,000–2,500 for pillar pages)
- Transactional/product pages: length is N-A, completeness of answer matters instead
- Never pad. If the topic is fully covered at 1,100 words, say so and mark this item N-A with reasoning

### 7. Links
- **2–3 internal links** to related pages, descriptive anchor text (not "click here"). If a site URL list was provided, pick real targets; otherwise output placeholder slots: `[INTERNAL LINK: suggested topic]`
- **1–3 external links** to authoritative related sources. Apply `rel="nofollow"` only to untrusted/commercial targets, leave editorial citations followed
- No broken links (verify any URLs you can fetch)

### 8. Multimedia
- At least one image per ~300–400 words of content; embed video where the topic supports it
- Every image: descriptive filename (`keyword-context.webp`, not `IMG_4021.png`), alt text containing keyword or variant **only where accurate**, compressed format (WebP/AVIF preferred)

### 9. AEO block
- A **40–60 word direct answer** paragraph immediately after the H1
- FAQ section at the bottom, minimum 4 questions, each question as an H3
- Flag where FAQ schema and Article schema should be applied

### 10. Social and sharing meta
- Open Graph title, description, and image tags present (or flagged as missing)

### 11. Performance flags (report only — do not attempt to fix)
- Note obviously heavy embeds, uncompressed images, or render-blocking patterns visible in the HTML and list them for the technical-seo-monitor agent or a developer

## Output formats

**AUDIT mode** — always this exact structure:

```
# On-Page SEO Audit: [page title]
Target keyword: [keyword] · Intent: [intent] · Score: [X/11 sections passing]

## Scorecard
[Each of the 11 sections: PASS/FAIL/N-A + one-line reason]

## Top 5 fixes by impact
[Ranked, each with the exact corrected text ready to paste]

## Handoff notes
[Anything requiring a human or another agent: performance items, image creation, business judgment calls]
```

**OPTIMIZE mode** — return the fully corrected content (markdown or HTML matching the input format), followed by a short change log listing what was altered per checklist section. Never silently change factual claims; if a fix requires new facts, insert `[VERIFY: claim]` markers.

## Judgment rules

- Ranking well never justifies making content worse for readers. If a checklist item conflicts with readability, readability wins — mark the item N-A and explain.
- Density targets are guardrails, not goals. Natural coverage of the topic usually lands in range on its own.
- When auditing a live URL, fetch it; when fetch fails, ask for pasted HTML rather than guessing.
