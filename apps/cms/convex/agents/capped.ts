// cappedInference (handoff 03 step 2; README §11 flowchart): hold → refuse over cap → call with bounded retry →
// settle to the real cost once → release the hold when nothing was billed. Pure: the ledger (convex/spend.ts) and
// the transport are injected. Plain async rather than Effect: @studio/effect-critical isn't in this repo; the
// contract (typed errors, idempotent money moves, retry only retryable errors, bounded) is the same.
import type { z } from "zod/v4";
import { type IInferenceRequest, type IInferenceResponse, InferenceError, infer, type TTransport } from "./gateway";
import { costMicroUsd, holdMicroUsd, type IUsage, priceOf, ZERO_USAGE } from "./pricing";
import { thinkingBudget } from "../../src/lib/qwen";

export class CapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CapError";
	}
}

/** The spend ledger port. Every method is idempotent on its key. */
export interface ILedger {
	/** Atomically checks spent + amount against the cap and debits the hold. */
	hold(key: string, microUsd: number): Promise<{ ok: true } | { ok: false; message: string }>;
	/** Replaces the hold with the actual cost (credit the difference, or debit the overage). */
	settle(key: string, actualMicroUsd: number): Promise<void>;
}

export interface ICappedResult<T> extends IInferenceResponse<T> {
	costMicroUsd: number;
	attempts: number;
}

export interface ICappedOptions {
	/** Total attempts for retryable errors (rate limit, 5xx, timeout, network). */
	maxAttempts?: number;
	sleep?: (ms: number) => Promise<void>;
}

const addUsage = (a: IUsage, b?: IUsage): IUsage => (b ? { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens, cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens, webSearches: (a.webSearches ?? 0) + (b.webSearches ?? 0) } : a);

export async function cappedInference<T>(ledger: ILedger, transport: TTransport, idempotencyKey: string, req: IInferenceRequest<T>, toJsonSchema: (s: z.ZodType<T>) => object, opts: ICappedOptions = {}): Promise<ICappedResult<T>> {
	const maxAttempts = opts.maxAttempts ?? 3;
	const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const inputChars = req.system.reduce((n, s) => n + s.length, 0) + req.user.length;
	// The hold covers every retry (each could bill in the worst case), so a run can never exceed its cap.
	// Thinking tokens bill as output on top of max_tokens, so the hold covers the thinking budget too.
	const thinking = priceOf(req.model).effort ? thinkingBudget(req.effort, req.maxTokens) : 0;
	const hold = holdMicroUsd(req.model, inputChars, req.maxTokens + thinking, req.webSearch?.maxUses ?? 0) * maxAttempts;
	const held = await ledger.hold(idempotencyKey, hold);
	if (!held.ok) throw new CapError(held.message);

	let billed: IUsage = ZERO_USAGE;
	let attempt = 0;
	try {
		for (;;) {
			attempt++;
			try {
				const res = await infer(transport, req, toJsonSchema);
				billed = addUsage(billed, res.usage);
				const cost = costMicroUsd(req.model, billed);
				await ledger.settle(idempotencyKey, cost);
				// The harness id we asked for (the API answers with a dated snapshot id; runs record MODELS ids only).
				return { ...res, model: req.model, usage: billed, costMicroUsd: cost, attempts: attempt };
			} catch (e) {
				const err = e instanceof InferenceError ? e : new InferenceError("unknown", String(e));
				billed = addUsage(billed, err.usage);
				if (!err.retryable || attempt >= maxAttempts) throw err;
				await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
			}
		}
	} catch (e) {
		// Settle to what the provider actually billed (0 releases the hold entirely).
		await ledger.settle(idempotencyKey, costMicroUsd(req.model, billed));
		if (e instanceof InferenceError) Object.defineProperty(e, "billedMicroUsd", { value: costMicroUsd(req.model, billed) });
		throw e;
	}
}

export const billedOf = (e: unknown): number => ((e as { billedMicroUsd?: number })?.billedMicroUsd ?? 0);
