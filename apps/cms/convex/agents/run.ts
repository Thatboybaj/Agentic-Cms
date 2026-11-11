// D7 for every agent call: retry the same tier once on an invalid output, then escalate one tier if the cap allows,
// then fail. Retryable transport errors are already retried inside cappedInference. Each attempt has its own ledger
// key, so a replayed step finds its holds instead of making new ones.
import type { TModelTier } from "@studio/seo-harness";
import { MODELS } from "@studio/seo-harness";
import type { z } from "zod/v4";
import { billedOf, CapError, cappedInference, type ICappedOptions, type ICappedResult, type ILedger } from "./capped";
import { type IInferenceRequest, InferenceError, type TTransport } from "./gateway";
import { escalate } from "./models";

export interface IAgentResult<T> extends ICappedResult<T> {
	tier: TModelTier;
	escalated: boolean;
	/** Total micro-dollars billed across attempts, including failed ones. */
	totalMicroUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
}

export class AgentError extends Error {
	constructor(
		message: string,
		readonly billedMicroUsd: number,
		readonly tier: TModelTier,
		readonly escalated: boolean,
	) {
		super(message);
		this.name = "AgentError";
	}
}

export async function runAgentCall<T>(
	ledger: ILedger,
	transport: TTransport,
	keyBase: string,
	start: { tier: TModelTier; escalated: boolean },
	req: Omit<IInferenceRequest<T>, "model">,
	toJsonSchema: (s: z.ZodType<T>) => object,
	opts?: ICappedOptions,
): Promise<IAgentResult<T>> {
	const plan: { tier: TModelTier; escalated: boolean }[] = [start, start];
	const up = escalate(start.tier);
	if (up) plan.push({ tier: up, escalated: true });
	let billed = 0;
	let tokensIn = 0;
	let tokensOut = 0;
	let last: Error = new Error("No attempt ran");
	for (let i = 0; i < plan.length; i++) {
		const step = plan[i]!;
		try {
			const r = await cappedInference(ledger, transport, `${keyBase}:a${i + 1}`, { ...req, model: MODELS[step.tier] }, toJsonSchema, opts);
			return { ...r, tier: step.tier, escalated: step.escalated, totalMicroUsd: billed + r.costMicroUsd, totalInputTokens: tokensIn + r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens, totalOutputTokens: tokensOut + r.usage.outputTokens };
		} catch (e) {
			billed += billedOf(e);
			if (e instanceof InferenceError && e.usage) {
				tokensIn += e.usage.inputTokens + e.usage.cacheReadTokens + e.usage.cacheWriteTokens;
				tokensOut += e.usage.outputTokens;
			}
			// A cap refusal on the escalation attempt ends with the earlier failure; on the first attempt it is the failure.
			if (e instanceof CapError) throw new AgentError(i === 0 ? e.message : `${last.message} · ${step.escalated && !start.escalated ? "escalation" : "retry"} refused: ${e.message}`, billed, step.tier, step.escalated);
			last = e as Error;
			const invalid = e instanceof InferenceError && (e.kind === "invalid-output" || e.kind === "truncated");
			if (!invalid) throw new AgentError((e as Error).message, billed, step.tier, step.escalated);
		}
	}
	throw new AgentError(last.message, billed, plan[plan.length - 1]!.tier, true);
}
