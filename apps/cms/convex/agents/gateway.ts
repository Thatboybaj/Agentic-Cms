// Model gateway (handoff 03 step 1; provider: Qwen on Alibaba Cloud Model Studio). Pure: the transport (the SDK call) is injected, so the error mapping, usage
// accounting and output validation are unit-tested with a fake. The only real transport is modelTransport in
// agents/sdk.ts ("use node"). Every model call goes through cappedInference → this gateway; nothing else calls a model.
import type { z } from "zod/v4";
import { type IUsage, priceOf } from "./pricing";

export interface IInferenceRequest<T> {
	model: string;
	/** Stable skill text first (prompt-cached); never secrets, never another site's data. */
	system: string[];
	user: string;
	/** Structured output. Omit for a text answer (research notes); then T is string. */
	schema?: z.ZodType<T>;
	maxTokens: number;
	effort?: "low" | "medium" | "high";
	/** Server-side web search, capped per call (billed per search; never with a schema: citations and JSON output don't mix). */
	webSearch?: { maxUses: number; allowedDomains?: string[] };
}

/** What the transport hands back: raw JSON text of the structured output + usage. */
export interface ITransportResult {
	text: string;
	stopReason: string | null;
	usage: IUsage;
	requestId?: string;
	model: string;
	/** URLs the server web search returned (provenance for research). */
	sources?: string[];
}

export type TTransport = (req: { model: string; system: string[]; user: string; jsonSchema?: object; maxTokens: number; effort?: "low" | "medium" | "high"; webSearch?: { maxUses: number; allowedDomains?: string[] } }) => Promise<ITransportResult>;

export interface IInferenceResponse<T> {
	output: T;
	usage: IUsage;
	model: string;
	requestId?: string;
	sources?: string[];
}

export type TInferenceErrorKind = "rate-limited" | "server" | "timeout" | "network" | "bad-request" | "auth" | "refusal" | "truncated" | "invalid-output" | "unknown";

export class InferenceError extends Error {
	constructor(
		readonly kind: TInferenceErrorKind,
		message: string,
		/** Tokens the provider billed before the failure (invalid output still costs money). */
		readonly usage?: IUsage,
		readonly provider = "qwen",
	) {
		super(message);
		this.name = "InferenceError";
	}
	get retryable() {
		return this.kind === "rate-limited" || this.kind === "server" || this.kind === "timeout" || this.kind === "network";
	}
}

/** SDK / fetch errors → typed kinds. Duck-typed on `status` / `name` so tests needn't construct SDK classes. */
export function classify(e: unknown): InferenceError {
	if (e instanceof InferenceError) return e;
	const err = e as { status?: number; name?: string; message?: string };
	const msg = err?.message ?? String(e);
	const s = err?.status;
	if (s === 451) return new InferenceError("refusal", "Qwen's content check declined this request");
	if (s === 429 || s === 529) return new InferenceError("rate-limited", msg);
	if (s === 408 || err?.name === "APIConnectionTimeoutError" || err?.name === "TimeoutError") return new InferenceError("timeout", msg);
	if (typeof s === "number" && s >= 500) return new InferenceError("server", msg);
	if (s === 401 || s === 403) return new InferenceError("auth", "The Qwen key was rejected. Check DASHSCOPE_API_KEY in the Convex deployment.");
	if (typeof s === "number" && s >= 400) return new InferenceError("bad-request", msg);
	if (err?.name === "APIConnectionError" || /fetch failed|ECONNRESET|ENOTFOUND|network/i.test(msg)) return new InferenceError("network", msg);
	return new InferenceError("unknown", msg);
}

/** One model call: transport → stop-reason checks → JSON parse → zod validation. Throws InferenceError. */
export async function infer<T>(transport: TTransport, req: IInferenceRequest<T>, toJsonSchema: (s: z.ZodType<T>) => object): Promise<IInferenceResponse<T>> {
	let res: ITransportResult;
	try {
		res = await transport({ model: req.model, system: req.system, user: req.user, ...(req.schema ? { jsonSchema: toJsonSchema(req.schema) } : {}), maxTokens: req.maxTokens, ...(req.effort && priceOf(req.model).effort ? { effort: req.effort } : {}), ...(req.webSearch ? { webSearch: req.webSearch } : {}) });
	} catch (e) {
		throw classify(e);
	}
	if (res.stopReason === "refusal") throw new InferenceError("refusal", "The model declined this request", res.usage);
	if (res.stopReason === "max_tokens") throw new InferenceError("truncated", "The output hit the token limit before it was complete", res.usage);
	if (!req.schema) {
		if (!res.text.trim()) throw new InferenceError("invalid-output", "The model returned no text", res.usage);
		return { output: res.text as T, usage: res.usage, model: res.model, ...(res.requestId ? { requestId: res.requestId } : {}), ...(res.sources ? { sources: res.sources } : {}) };
	}
	let json: unknown;
	try {
		json = JSON.parse(res.text);
	} catch {
		throw new InferenceError("invalid-output", "The model's output wasn't valid JSON", res.usage);
	}
	const parsed = req.schema.safeParse(json);
	if (!parsed.success) throw new InferenceError("invalid-output", `Output didn't match the schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, res.usage);
	return { output: parsed.data, usage: res.usage, model: res.model, ...(res.requestId ? { requestId: res.requestId } : {}) };
}
