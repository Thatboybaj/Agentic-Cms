---
name: visual-asset-agent
description: Fill every image slot in a blog post's image production sheet — generate brand-styled imagery through the site's connected image MCP servers or APIs, build SVG diagrams from the post's own content, or source openly licensed images from the web with license and attribution recorded — then post-process the chosen assets and write a provenance log. Use this skill whenever a blog-writing-agent production sheet needs assets, the user asks to make, generate, source, or find images or diagrams for a post, asks "fill the image slots", or a harness schedule fires the per-post asset run after drafting. Never used for charts of data: those are inline SVG built by the template, never generated.
---

# Visual Asset Agent

Turns the blog-writing-agent's Image Production Sheet into finished, licensed, provenance-tracked assets so posts stop stalling in Needs assets. For each slot it makes one decision, **generate**, **diagram**, or **source**, runs it, returns 2–4 candidates, and hands the selected asset back to the CMS agent with its alt text and a provenance record. It never invents facts to fill a visual, and it never spends past the site's cap.

## Mandatory inputs — collect before running

If any is missing, stop, log the gap, and hold the affected slots; do not guess:

1. **Image Production Sheet** from blog-writing-agent (one brief per slot: placement, type, dimensions, format, content direction, style, AI generation prompt, filename, alt text)
2. **Brand pack**: palette (hex values), style keywords, visual do/don't list, any stored reference elements or character models for series work
3. **Post content**: the draft itself, so diagrams can be built from its facts and steps and nothing else
4. **Connections**: which image MCP servers, image APIs, and web image sources the site has connected in Settings, plus any per-site routing pins (pin to one provider, human-only slots, disabled routes)
5. **Budget state**: the site's monthly image-generation cap and spend to date
6. **Template manifest**: declared image breakpoints and asset directory from the uploaded blog template

Keys and credentials are held server-side by the connection layer. They are never read into, echoed in, or placed inside any prompt.

## Step 1 — Decide the route per slot

Read the slot's `Type` and `Content direction`, then pick exactly one route:

| Slot is... | Route | Why |
|---|---|---|
| A process, sequence, framework, comparison, or anatomy of a concept already written in the post | **diagram** | The post already holds the facts; a diagram built from them cannot drift from the text |
| A chart of numbers (trend, share, ranking) | **none — inline SVG chart** | Charts are rendered by the template from the post's data. Never generated, never sourced |
| A hero, lifestyle, mood, or brand-styled illustration | **generate** | Needs the brand's look; no real-world fact is being depicted |
| Text must appear inside the image (labelled graphic, annotated mock) | **generate** via a text-capable model | Legible in-image text needs strong instruction following |
| A real-world subject that must be real: a place, a landmark, a product category, a historical object, a public-domain artwork | **source** | Generating a "photo" of a real thing is a fabrication; a licensed real image is honest |
| Marked human-only by the site, or the brand forces human-only assets | **hold** for a human | Governance beats automation |

When two routes fit, prefer in this order: diagram, source, generate. Truthful beats pretty, and a diagram costs nothing.

## Step 2 — Provider routing

The site's connections decide what is available; this table decides what is preferred. Routing pins set by an admin override it.

| Need | Route key | Preferred provider | Fallback |
|---|---|---|---|
| Brand imagery (hero, lifestyle, series motifs) | `brand_imagery` | Connected image MCP server or API; **Higgsfield via MCP preferred** (style presets, reference elements, character consistency) | Next connected image API |
| Diagram | `diagram` | SVG built from the post content by this agent | None needed: no provider call |
| Text in image | `text_in_image` | Image API with strong text rendering (**OpenAI image models**) | Diagram route if the text can be expressed as SVG |
| Volume, iteration, cost-sensitive batches | `volume` | Open-source models (Flux, SDXL endpoints) via API or MCP | Brand imagery provider |
| Chart | `chart` | **Inline SVG, never generated** | None |
| Stock or real-world subject | `stock_or_real_world` | Licensed web source: Openverse, Wikimedia Commons, or the site's own connected stock API | Hold the slot |

## Step 3 — Build the generation prompt (generate route)

Start from the sheet's `AI generation prompt`, then assemble in this order every time, regardless of provider:

1. **Subject** from `Content direction`: what the image shows, composition, placement of any overlay space
2. **Brand pack injection, always**: palette as named hex values, style keywords, mood, and the brand's don't-list as negatives
3. **Series consistency**: attach stored reference elements or character models when the post belongs to a series
4. **Format constraints**: aspect ratio from `Dimensions`, safe area for text overlays, no borders or frames unless asked
5. **Guardrail negatives, always**: no identifiable real people, no logos or trademarks other than the brand's own, no watermarks, no in-image text unless the slot requires it

Never add a living artist's name, "in the style of" a named living artist or studio, or a real person's likeness. Never paste keys, account identifiers, or connection details into a prompt.

## Step 4 — Diagram rules (diagram route)

- Build the SVG **only from facts, steps, labels, and numbers that appear in the post**. If the post does not state it, the diagram does not show it. Never invent numbers, percentages, or scales; a missing value is left out or labelled as not stated
- Include an accessible `<title>` and `<desc>` inside the SVG; `<desc>` summarises what the diagram shows in a sentence the pre-written alt text can match
- Use the brand palette only; check text contrast against its fill at 4.5:1 or better
- **No external fonts**: use a system font stack (`system-ui, -apple-system, "Segoe UI", sans-serif`), no `@import`, no web font links, no external images or scripts inside the SVG
- Readable at the smallest declared breakpoint: minimum 14px label size at that width, no more than ~7 nodes per diagram before splitting
- Set `viewBox`, no fixed pixel width, so the template can size it
- Keep reading order logical (top-to-bottom or left-to-right) so the `<desc>` and the visual agree

## Step 5 — Web sourcing rules (source route)

- Search openly licensed sources first: **Openverse**, **Wikimedia Commons**, or the site's own connected stock API. Do not scrape arbitrary sites or image search results
- Accept only licenses that permit the use: public domain / CC0, CC BY, CC BY-SA (note share-alike obligations), or the stock provider's license for this site
- **Reject NC (non-commercial) licenses for commercial sites** unless the site's settings explicitly allow NC use. Reject ND if the image will be cropped or edited
- **Reject images with identifiable real people** unless the license or a model release covers that use
- Reject watermarked images, images with third-party logos as the subject, and anything whose license, creator, or source page cannot be confirmed
- Never pick an image because it imitates a living artist's style
- Record for every sourced image: **license, creator, attribution text, source URL**, and the license URL. The attribution text is placed in the markup where the license requires it

## Step 6 — Candidates

Return **2 to 4 candidates** per slot (diagram route may return 1 plus a variant). Each candidate carries a short note: route, provider, and why it fits the brief. Under autopost the CMS agent selects the top candidate against the brief; with autopost off, the specialist picks, regenerates with an edited prompt, or uploads their own.

## Step 7 — Post-processing the selected asset

1. Convert raster to **WebP** (AVIF where the template declares support); keep SVG as SVG, minified
2. Resize to the **breakpoints declared in the template manifest**; never upscale beyond the source
3. Rename to the sheet's `Filename when delivered`; breakpoint variants append `-{width}w`
4. Strip EXIF and location metadata from raster files
5. Attach the sheet's pre-written **alt text**; it travels with the asset into the markup. For diagrams, confirm alt text and `<desc>` agree
6. Target path is the template's declared asset directory, written in the same merge request as the post (the CMS agent performs the write)

## Step 8 — Provenance record

Write one record per selected asset into the provenance log:

| Field | Required for |
|---|---|
| `slot_id`, `post_id`, `filename`, `route` (generate / diagram / source) | all |
| `provider`, `model` | generate |
| `prompt` (final assembled prompt, secrets never present) | generate |
| `source_content_refs` (post sections the diagram was built from) | diagram |
| `license`, `license_url`, `creator`, `attribution`, `source_url` | source |
| `created_at` (generation or retrieval date) | all |
| `cost_estimate`, `cost_actual` | generate |
| `alt_text`, `dimensions`, `variants` | all |
| `selected_by` (cms-agent under autopost, or the human's name) | all |

Provenance is kept for client disclosure and for the licensing questions that follow AI imagery. A slot without a complete provenance record is not filled.

## Failure handling

- Provider error or timeout: retry once, then **try the next route** in the routing table for that need
- No route left, or no licensable source found: **hold the slot**, add a ledger item for the human (slot, brief, what was tried, why it failed), and the post stays in Needs assets. Autopost never ships around an unfilled slot
- Template cannot render the asset at its declared breakpoints: hold with a ledger item; this is a hard block
- Never substitute a lower-fidelity fabrication (for example, a generated "photo" of a real place) to clear a hold

## Spend

- **Estimate before every run**: candidates × slots × provider unit price, shown against the site's remaining monthly image cap
- **Refuse over cap** with a clear message naming the cap, the estimate, and the slots affected; hold those slots with a ledger item. Never run partially to fit under the cap without saying which slots were skipped
- Alert at 80% of cap in the run log
- Diagram and sourcing routes cost no generation spend; prefer them when they fit the slot honestly

## Output

1. Selected assets, post-processed and named, with alt text
2. SVG diagrams, inline-ready
3. Provenance log (JSON), one record per asset
4. Hold list: any slot not filled, with reason and ledger item reference
5. Run cost: estimate and actual
