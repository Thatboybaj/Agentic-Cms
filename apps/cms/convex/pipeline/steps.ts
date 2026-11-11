// Agent step seams (handoff 02 step "pipeline/steps.ts"). STUBS with the final interfaces: deterministic output, no
// model or provider call. Handoff 03 replaces draftStep's body (blog writer + on-page optimizer), 04 replaces
// fillSlotStep's body (visual-asset agent). The validators below are the contract: keep them when the bodies change.
// Steps are actions so they can call providers later; they never write tables (README §3): persist.ts does.
import { v, type Infer } from "convex/values";
import { internalAction } from "../_generated/server";

export const vDraftInput = v.object({
	siteId: v.id("sites"),
	postId: v.id("posts"),
	siteName: v.string(),
	title: v.string(),
	keyword: v.string(),
	contentType: v.string(),
	styleKeywords: v.array(v.string()),
	heroProvider: v.string(),
	strongModel: v.boolean(),
	wordTarget: v.number(),
});

const vBlockOut = v.object({ id: v.string(), kind: v.union(v.literal("h2"), v.literal("h3"), v.literal("p"), v.literal("ul"), v.literal("faq")), text: v.string() });
const vSlotOut = v.object({
	name: v.string(),
	type: v.union(v.literal("hero"), v.literal("chart"), v.literal("diagram"), v.literal("lifestyle"), v.literal("screenshot"), v.literal("photo")),
	placement: v.string(),
	filenameSuffix: v.string(),
	format: v.union(v.literal("webp"), v.literal("svg")),
	width: v.number(),
	height: v.number(),
	alt: v.string(),
	prompt: v.string(),
});

export const vDraftOutput = v.object({
	seoTitle: v.string(),
	blocks: v.array(vBlockOut),
	words: v.number(),
	/** Claims the writer couldn't source: become open fact markers (the gate hard-fails on them). */
	unsourcedClaims: v.array(v.object({ blockId: v.string(), claim: v.string() })),
	imageSheet: v.array(vSlotOut),
	tokens: v.object({ input: v.number(), output: v.number() }),
});
export type TDraftOutput = Infer<typeof vDraftOutput>;

const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const countWords = (blocks: { text: string }[]) => blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);

/** STUB (03): blog-writing-agent → on-page-seo-optimizer. Deterministic outline-level draft. */
export const draftStep = internalAction({
	args: { input: vDraftInput },
	returns: vDraftOutput,
	handler: async (_ctx, { input }) => {
		const kw = input.keyword;
		const blocks = [
			{ id: "b1", kind: "p" as const, text: `${cap1(kw)} comes up in almost every first visit to ${input.siteName}. This guide answers the questions people ask most, in plain language.` },
			{ id: "b2", kind: "h2" as const, text: `What ${kw} involves` },
			{ id: "b3", kind: "p" as const, text: `A short, accurate overview of ${kw}: who it is for, what happens step by step, and what to expect afterwards.` },
			{ id: "b4", kind: "h2" as const, text: "Costs, timing and what affects them" },
			{ id: "b5", kind: "p" as const, text: `The main factors that change the time and cost of ${kw}, and the questions to ask before you book.` },
			{ id: "b6", kind: "h2" as const, text: "Questions people ask" },
			{ id: "b7", kind: "faq" as const, text: `Is ${kw} right for me?\nTalk it through with a specialist; they will check your situation first.` },
		];
		const style = input.styleKeywords.join(", ");
		return {
			seoTitle: `${cap1(kw)}: what to know | ${input.siteName}`.slice(0, 70),
			blocks,
			words: countWords(blocks),
			unsourcedClaims: [],
			imageSheet: [
				{ name: "Hero", type: "hero" as const, placement: "Top of post", filenameSuffix: "hero", format: "webp" as const, width: 1600, height: 900, alt: `${cap1(kw)} at ${input.siteName}, illustrative`, prompt: `${cap1(kw)}${style ? `, ${style}` : ""}, no identifiable real person.` },
				{ name: "Data chart", type: "chart" as const, placement: "After the first section", filenameSuffix: "chart", format: "svg" as const, width: 1200, height: 675, alt: `Chart for ${kw}, rendered from the post's data`, prompt: "Inline SVG from the post's own figures." },
			],
			tokens: { input: 0, output: 0 },
		};
	},
});

export const vFillSlotOutput = v.object({ ok: v.boolean(), candidates: v.number(), note: v.string(), costUsd: v.number() });

/** STUB (04): visual-asset agent for one slot. Returns how many candidates it produced. */
export const fillSlotStep = internalAction({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), provider: v.string() },
	returns: vFillSlotOutput,
	handler: async (_ctx, { provider }) => ({ ok: true, candidates: provider === "inline-svg" ? 1 : 3, note: `stub ${provider}`, costUsd: 0 }),
});

// ─── Autopost gate + ship (handoff 02 steps 5–6) ───────────────────────────────

/** STUB (03): the agent's text fixes for the gate's plan (rewrite claims, on-page fixes). Until 03 the fixes are the
 *  deterministic ports in fixes.ts, applied by gate.applyAndShip; this step is the seam where a model call goes. */
export const fixStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), fixes: v.number() },
	returns: v.object({ applied: v.number() }),
	handler: async (_ctx, { fixes }) => ({ applied: fixes }),
});

export const vRenderOutput = v.object({
	/** Structures the template can't render (fidelity rule): non-empty → hold, never invent markup. */
	held: v.array(v.string()),
	files: v.array(v.object({ path: v.string(), change: v.string(), kind: v.union(v.literal("post"), v.literal("assets"), v.literal("index")) })),
});

/** STUB (05): renderer in publish mode. Returns the files the PR will carry. */
export const renderStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), slug: v.string(), words: v.number(), output: v.string(), contentDir: v.string(), assetDir: v.string(), rasterSlots: v.number(), svgSlots: v.number() },
	returns: vRenderOutput,
	handler: async (_ctx, a) => {
		const ext = ({ mdx: "mdx", html: "html", json: "json", component: "tsx" } as Record<string, string>)[a.output] ?? "mdx";
		const files: { path: string; change: string; kind: "post" | "assets" | "index" }[] = [{ path: `${a.contentDir}/${a.slug}.${ext}`, change: `+${Math.max(40, Math.round(a.words / 7.6))}`, kind: "post" }];
		if (a.rasterSlots + a.svgSlots) files.push({ path: `${a.assetDir}/ · ${a.rasterSlots} WebP${a.svgSlots ? ` · ${a.svgSlots} SVG` : ""}`, change: `${a.rasterSlots * 78} KB`, kind: "assets" });
		files.push({ path: "public/sitemap.xml", change: "+1", kind: "index" });
		return { held: [], files };
	},
});

export const vOpenPrOutput = v.object({ number: v.optional(v.number()), externalId: v.optional(v.string()), headSha: v.string(), previewUrl: v.optional(v.string()) });

/** STUB (06): GitHub App: branch content/{slug}, commit files, open (or update) the PR. Never pushes to base. */
export const openPrStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), branch: v.string(), base: v.string(), title: v.string(), domain: v.string(), slug: v.string() },
	returns: vOpenPrOutput,
	handler: async (_ctx, a) => ({ headSha: `stub-${a.postId.slice(-8)}`, previewUrl: `https://${a.domain.split(".")[0]}-git-${a.branch.replace(/\//g, "-")}.vercel.app/blog/${a.slug}` }),
});

// ─── Revise + scheduled runs (handoff 02 steps 8–9) ───────────────────────────

const vBlockIn = v.object({ id: v.string(), kind: v.string(), text: v.string() });

/** STUB (03): the blog writer applies a reviewer's note to the current draft. Returns the revised blocks unchanged in
 *  shape; until 03 it only records that the note was applied. */
export const reviseStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), note: v.string(), blocks: v.array(vBlockIn), seoTitle: v.string() },
	returns: v.object({ blocks: v.array(vBlockIn), seoTitle: v.string(), tokens: v.object({ input: v.number(), output: v.number() }) }),
	handler: async (_ctx, a) => ({ blocks: a.blocks, seoTitle: a.seoTitle, tokens: { input: 0, output: 0 } }),
});

export const vRunArtifact = v.object({
	status: v.union(v.literal("succeeded"), v.literal("failed")),
	output: v.string(),
	/** keyword-swarm: new keyword ideas for the plan (deduped against existing terms by the persist step). */
	ideas: v.array(v.object({ term: v.string(), intent: v.union(v.literal("informational"), v.literal("commercial"), v.literal("transactional"), v.literal("navigational")), difficulty: v.number(), evidence: v.string() })),
});

/** STUB (03 / 07): the harness agent(s) for a scheduled run kind. Canned artifacts with the prototype's wording. */
export const runKindStep = internalAction({
	args: { siteId: v.id("sites"), kind: v.string(), siteName: v.string(), searchConsole: v.string(), rankSource: v.union(v.string(), v.null()), industry: v.string() },
	returns: vRunArtifact,
	handler: async (_ctx, a) => {
		const none = [] as { term: string; intent: "informational" | "commercial" | "transactional" | "navigational"; difficulty: number; evidence: string }[];
		switch (a.kind) {
			case "keyword-swarm": {
				const base = a.industry.toLowerCase();
				const ideas = [
					{ term: `${base} cost guide`, intent: "commercial" as const, difficulty: 22, evidence: "stub · SERP" },
					{ term: `how to choose a ${base} provider`, intent: "informational" as const, difficulty: 14, evidence: "stub · SERP" },
					{ term: `${base} near me`, intent: "transactional" as const, difficulty: 9, evidence: "stub · SERP" },
				];
				return { status: "succeeded" as const, output: "", ideas };
			}
			case "technical-monitor":
				return { status: "succeeded" as const, output: `Health ${a.searchConsole === "connected" ? 96 : 88} · 0 new issues`, ideas: none };
			case "qa-sweep":
				return { status: "succeeded" as const, output: "Light sweep · scorecard 11/12 · ledger unchanged", ideas: none };
			case "content-refresh":
				return { status: "succeeded" as const, output: "Prune list refreshed · 0 decaying posts ranked for refresh", ideas: none };
			case "link-prospecting":
				return a.rankSource ? { status: "succeeded" as const, output: "12 prospects · 5 outreach drafts", ideas: none } : { status: "failed" as const, output: "Failed: no Ahrefs or Semrush connection for backlink data.", ideas: none };
			case "kas-recalc":
				return { status: "succeeded" as const, output: a.searchConsole === "connected" ? "Scores recalculated" : "Data gap: Search Console not connected. No scores written.", ideas: none };
			case "biweekly-report":
				return { status: "succeeded" as const, output: "Report drafted · ready to share", ideas: none };
			default:
				return { status: "succeeded" as const, output: "Done", ideas: none };
		}
	},
});
