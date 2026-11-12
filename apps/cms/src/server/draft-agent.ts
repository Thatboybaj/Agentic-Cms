import "server-only";
// Blog writing agent (harness agent: blog-writing-agent, Phase 1 text only). Calls Qwen with the post brief and the
// site's brand pack and returns structured blocks. Image slots are placed by the CMS, not the model. Claims the model
// can't source come back as `unverified_claims` and become [VERIFY] fact markers in the editor (never invented).
import { z } from "zod/v4";
import { QwenHttpError, qwenChat } from "@/lib/qwen";

/** Harness tier for blog-writing-agent is the workhorse model; override with QWEN_MODEL. */
export const DEFAULT_DRAFT_MODEL = "qwen3.7-plus";
const TIMEOUT_MS = 120_000;

export class DraftError extends Error {
	constructor(
		message: string,
		readonly status = 502,
	) {
		super(message);
	}
}

export const DraftInputSchema = z.object({
	siteName: z.string().min(1).max(120),
	industry: z.string().max(160).default(""),
	voice: z.string().max(1200).default(""),
	keyword: z.string().min(1).max(200),
	title: z.string().min(1).max(200),
	contentType: z.enum(["guide", "comparison", "listicle", "how-to", "faq", "pillar", "money-page"]),
	intent: z.string().max(40).default("informational"),
	wordTarget: z.number().int().min(300).max(4000),
	regulated: z.enum(["health", "finance", "legal"]).optional(),
	disclaimer: z.string().max(600).optional(),
});
export type TDraftInput = z.infer<typeof DraftInputSchema>;

const BlockSchema = z.object({
	kind: z.enum(["h2", "h3", "p", "ul", "quote", "faq"]),
	text: z
		.string()
		.describe('h2/h3/p/quote: plain text, no markdown. ul: items separated by "\\n". faq: alternating question and answer lines separated by "\\n" (Q\\nA\\nQ\\nA).'),
});

const DraftSchema = z.object({
	seo_title: z.string().describe("Keyword-rich title, 60 characters or fewer"),
	direct_answer: z.string().describe("40–60 word paragraph that fully answers the query on its own; contains the keyword"),
	blocks: z.array(BlockSchema).describe("The body after the direct answer, in reading order. Starts with an h2. Ends with an h2 'Frequently asked questions' followed by one faq block with at least 4 Q&As."),
	unverified_claims: z
		.array(z.string())
		.describe("Exact substrings copied from block text that state a statistic, price, duration or other checkable fact you could not attribute to a named source. Empty if none."),
	information_gain: z.string().describe("One sentence: what this post offers that typical top results don't, or what first-hand input the client should add"),
});
export type TDraftOutput = z.infer<typeof DraftSchema> & { model: string; inputTokens: number; outputTokens: number };

const SYSTEM = [
	"You are the blog writing agent for an SEO agency. You write one complete, publish-ready blog post for a client site.",
	"Write for the reader first: plain language, short paragraphs, concrete specifics. Match the brand voice over generic blog voice.",
	"The direct answer must genuinely answer the query in 40–60 words. Put the keyword in the first 100 words; keep density natural (about 1–2%).",
	"Structure by content type: how-to → numbered steps as a ul; comparison → side-by-side sections and a verdict; faq → many short Q&As; guide/pillar → definition, why it matters, body sections, one section on how the client helps, FAQ.",
	"Mention the client by name in one section only (plus nothing salesy elsewhere). Educational sections stay educational.",
	"Never invent statistics, prices, durations or study results. If a sentence needs a number you can't attribute to a well-known source, keep the sentence but list that exact phrase in unverified_claims so a human can verify it.",
	"For regulated topics (health, finance, legal) stay general, avoid personal advice, and recommend speaking to a qualified professional.",
	"No markdown symbols (#, *, **) in any text field. No image markers; the CMS places images.",
].join("\n");

export async function writeDraft(input: TDraftInput): Promise<TDraftOutput> {
	const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
	if (!apiKey) throw new DraftError("Live drafting isn't configured (no DASHSCOPE_API_KEY).", 503);
	const model = process.env.QWEN_MODEL?.trim() || DEFAULT_DRAFT_MODEL;
	const words = Math.min(input.wordTarget, Number(process.env.LIVE_DRAFT_MAX_WORDS) || 1200);
	const user = [
		`Client: ${input.siteName}${input.industry ? ` (${input.industry})` : ""}`,
		input.voice ? `Brand voice: ${input.voice}` : "",
		`Target keyword: ${input.keyword}`,
		`Working title: ${input.title}`,
		`Content type: ${input.contentType} · search intent: ${input.intent}`,
		`Length: about ${words} words.`,
		input.regulated ? `Regulated topic: ${input.regulated}. The CMS appends this disclaimer, don't repeat it: "${input.disclaimer ?? ""}"` : "",
	]
		.filter(Boolean)
		.join("\n");
	let res;
	try {
		res = await qwenChat(apiKey, { model, system: [SYSTEM], user, jsonSchema: z.toJSONSchema(DraftSchema), maxTokens: Math.min(16000, Math.round(words * 2.2) + 1500), effort: "low" }, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (e) {
		if (e instanceof QwenHttpError) {
			if (e.status === 401 || e.status === 403) throw new DraftError("Qwen rejected the API key.", 503);
			if (e.status === 404) throw new DraftError(`Qwen doesn't know the model "${model}". Set QWEN_MODEL.`, 503);
			if (e.status === 429) throw new DraftError("Qwen is rate-limiting this key. Try again in a minute.", 429);
			if (e.status === 451) throw new DraftError("Qwen's content check declined this post.");
			throw new DraftError(`Qwen answered with an error (${e.status}).`);
		}
		if ((e as Error)?.name === "TimeoutError") throw new DraftError("No response from Qwen in time.", 504);
		console.error("[draft-agent] unexpected:", (e as Error)?.name ?? "unknown");
		throw new DraftError("The writing agent failed unexpectedly.");
	}
	if (res.stopReason === "refusal") throw new DraftError("The model declined to write this post.");
	if (res.stopReason === "max_tokens") throw new DraftError("The draft was cut off before it finished.");
	const parsed = (() => {
		try {
			return DraftSchema.safeParse(JSON.parse(res.text));
		} catch {
			return null;
		}
	})();
	if (!parsed?.success || !parsed.data.blocks.length) throw new DraftError("The model returned an empty draft.");
	return { ...parsed.data, model, inputTokens: res.usage.inputTokens + res.usage.cacheReadTokens, outputTokens: res.usage.outputTokens };
}

// ─── Abuse guard for public demos ────────────────────────────────────────────
// Per-instance memory only (serverless instances don't share it). The real ceiling is the monthly spend limit you set
// in the Model Studio console; this just stops one visitor from hammering the key.
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, perHour = Number(process.env.LIVE_DRAFTS_PER_HOUR) || 5): boolean {
	const now = Date.now();
	const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
	if (list.length >= perHour) {
		hits.set(ip, list);
		return true;
	}
	list.push(now);
	hits.set(ip, list);
	return false;
}
