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
