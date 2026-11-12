// Model price table (handoff 03 step 2: prices live in config with a source date, never inline in code paths).
// Source: Alibaba Cloud Model Studio model pages, Singapore region (International scope), read 2026-11-12. Requests
// stay under 256K input, the lowest tier. Context cache: implicit cache hits bill at the listed cached rate; explicit
// cache creation at 1.25× input. Thinking tokens bill as output. Re-verify before changing regions (QWEN_BASE_URL).
import { PROVIDER_MODELS } from "@studio/seo-harness";

export const PRICES_SOURCE_DATE = "2026-11-12";

interface IPrice {
	/** USD per million input tokens. */
	inputPerM: number;
	outputPerM: number;
	/** USD per million input tokens served from the context cache. */
	cachedPerM: number;
	/** Hybrid thinking model: effort maps to a thinking budget (see thinkingBudget in src/lib/qwen.ts). */
	effort: boolean;
	/** Batch (file) inference at half price in this region. */
	batch: boolean;
}

type TModelId = (typeof PROVIDER_MODELS)[keyof typeof PROVIDER_MODELS][keyof (typeof PROVIDER_MODELS)["qwen"]];

export const PRICES: Readonly<Record<TModelId, IPrice>> = {
	// Flash: the page lists $0.113/$0.382 on one scope and third-party trackers $0.15/$0.47 for Singapore; hold the
	// higher figures so a cap is never under-counted.
	"qwen3.8-flash": { inputPerM: 0.15, outputPerM: 0.47, cachedPerM: 0.03, effort: true, batch: true },
	"qwen3.7-plus": { inputPerM: 0.4, outputPerM: 1.6, cachedPerM: 0.08, effort: true, batch: true },
	"qwen3.8-max": { inputPerM: 2, outputPerM: 6, cachedPerM: 0.25, effort: true, batch: false },
	// Anthropic fallback (CMS_MODEL_PROVIDER=anthropic): first-party API rates cached 2026-11-03. Cache reads 0.1× input.
	// Batch off: on this provider large sites are read with direct calls. Haiku 4.5 rejects output_config.effort.
	"claude-haiku-4-5": { inputPerM: 1, outputPerM: 5, cachedPerM: 0.1, effort: false, batch: false },
	"claude-sonnet-5": { inputPerM: 2, outputPerM: 10, cachedPerM: 0.2, effort: true, batch: false },
	"claude-opus-5-5": { inputPerM: 4, outputPerM: 20, cachedPerM: 0.4, effort: true, batch: false },
};

/** Web search (agent strategy), Singapore: USD per 1,000 calls (same source and date as the token prices). */
export const WEB_SEARCH_PER_1K = 10;

export interface IUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	/** Web searches the call ran (billed per call). */
	webSearches?: number;
}

export const ZERO_USAGE: IUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function priceOf(model: string): IPrice {
	const p = (PRICES as Record<string, IPrice | undefined>)[model];
	if (!p) throw new Error(`No price for model ${model}: add it to convex/agents/pricing.ts with a source date`);
	return p;
}

/** Integer micro-dollars (no floats on the money path); rounded up so we never under-charge a cap. */
export function costMicroUsd(model: string, u: IUsage): number {
	const p = priceOf(model);
	const usd = (u.inputTokens * p.inputPerM + u.cacheWriteTokens * p.inputPerM * 1.25 + u.cacheReadTokens * p.cachedPerM + u.outputTokens * p.outputPerM) / 1e6 + ((u.webSearches ?? 0) * WEB_SEARCH_PER_1K) / 1000;
	return Math.ceil(usd * 1e6);
}

/** Upper-bound hold for one call: every input char as a token (over-counts) + the whole output budget. */
export function holdMicroUsd(model: string, inputChars: number, maxTokens: number, maxSearches = 0): number {
	// Searched pages come back as input tokens: allow ~6k tokens per search on top of the prompt.
	return costMicroUsd(model, { inputTokens: Math.ceil(inputChars / 3) + maxSearches * 6000, outputTokens: maxTokens, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: maxSearches });
}
