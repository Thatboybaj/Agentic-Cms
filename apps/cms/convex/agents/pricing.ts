// Model price table (handoff 03 step 2: prices live in config with a source date, never inline in code paths).
// Source: Anthropic first-party API rates, model table cached 2026-11-03 (platform.claude.com pricing). Re-verify in
// 09 before the pilot. Cache writes bill at 1.25× input (5-minute TTL), cache reads at 0.1× input.
import { MODELS } from "@studio/seo-harness";

export const PRICES_SOURCE_DATE = "2026-11-03";

interface IPrice {
	/** USD per million input tokens. */
	inputPerM: number;
	outputPerM: number;
	/** Accepts output_config.effort (Haiku 4.5 rejects it). */
	effort: boolean;
}

export const PRICES: Readonly<Record<(typeof MODELS)[keyof typeof MODELS], IPrice>> = {
	"claude-haiku-4-5": { inputPerM: 1, outputPerM: 5, effort: false },
	"claude-sonnet-5": { inputPerM: 2, outputPerM: 10, effort: true },
	"claude-opus-5-5": { inputPerM: 4, outputPerM: 20, effort: true },
};

export interface IUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
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
	const usd = (u.inputTokens * p.inputPerM + u.cacheWriteTokens * p.inputPerM * 1.25 + u.cacheReadTokens * p.inputPerM * 0.1 + u.outputTokens * p.outputPerM) / 1e6;
	return Math.ceil(usd * 1e6);
}

/** Upper-bound hold for one call: every input char as a token (over-counts) + the whole output budget. */
export function holdMicroUsd(model: string, inputChars: number, maxTokens: number): number {
	return costMicroUsd(model, { inputTokens: Math.ceil(inputChars / 3), outputTokens: maxTokens, cacheReadTokens: 0, cacheWriteTokens: 0 });
}
