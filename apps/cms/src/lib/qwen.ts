// Qwen (Alibaba Cloud Model Studio / DashScope) client: the only model provider. fetch only, no SDK, so the same code
// runs in Convex Node actions and the Next server. Two endpoints:
//   - OpenAI-compatible Chat Completions (structured output via response_format json_schema, streamed so long
//     outputs never hit an idle-connection timeout), and
//   - the native DashScope generation endpoint for web search, because only it returns the source URLs
//     (the OpenAI-compatible protocol doesn't). Docs checked 2026-11-12 (Model Studio, Singapore/International).
// The key is DASHSCOPE_API_KEY in the server environment; it never enters a prompt, a trace or a document.

/** International (Singapore) by default; set QWEN_BASE_URL for another Model Studio region. */
export const QWEN_DEFAULT_BASE = "https://dashscope-intl.aliyuncs.com";
export const qwenBase = (env: Record<string, string | undefined> = process.env) => (env.QWEN_BASE_URL?.trim() || QWEN_DEFAULT_BASE).replace(/\/+$/, "").replace(/\/compatible-mode\/v1$/, "");
export const compatUrl = (path: string, env?: Record<string, string | undefined>) => `${qwenBase(env)}/compatible-mode/v1${path}`;

export type TEffort = "low" | "medium" | "high";

export interface IQwenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	webSearches: number;
}

export interface IQwenRequest {
	model: string;
	system: string[];
	user: string;
	/** JSON schema for structured output (response_format json_schema). Omit for a text answer. */
	jsonSchema?: object;
	maxTokens: number;
	/** low → no thinking; medium/high → thinking with a capped budget (billed as output). */
	effort?: TEffort;
	webSearch?: { maxUses: number; allowedDomains?: string[] };
}

export interface IQwenResult {
	text: string;
	/** Normalised to the gateway's vocabulary: "end_turn" | "max_tokens" | "refusal". */
	stopReason: string | null;
	usage: IQwenUsage;
	model: string;
	requestId?: string;
	sources?: string[];
}

/** An HTTP or protocol error with the status the gateway classifies (429 → retry, 401 → bad key, …). */
export class QwenHttpError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
	) {
		super(message);
		this.name = "QwenHttpError";
	}
}

/**
 * Thinking tokens per effort level. They're billed as output on top of max_tokens, so cost holds add this budget.
 * Low (extraction, structuring) skips thinking entirely: Qwen3.x hybrid models think by default otherwise.
 */
export function thinkingBudget(effort: TEffort | undefined, maxTokens: number): number {
	if (effort === "high") return Math.min(16_384, Math.max(1_024, Math.floor(maxTokens * 0.5)));
	if (effort === "medium") return Math.min(4_096, Math.max(1_024, Math.floor(maxTokens * 0.25)));
	return 0;
}

const JSON_NOTE = "Reply with a single JSON object that matches the response schema. No prose, no code fences.";

export function messagesOf(req: IQwenRequest) {
	const system = [...req.system, ...(req.jsonSchema ? [JSON_NOTE] : [])].join("\n\n");
	return [
		{ role: "system", content: system },
		{ role: "user", content: req.user },
	];
}

export const stopOf = (r: string | null | undefined): string | null => (r === "length" ? "max_tokens" : r === "content_filter" ? "refusal" : r ? "end_turn" : null);

/** Server-sent events → JSON payloads (both endpoints stream `data: {...}` lines). */
export async function* sse(res: Response): AsyncGenerator<Record<string, unknown>> {
	const reader = res.body!.getReader();
	const dec = new TextDecoder();
	let buf = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += dec.decode(value, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line.startsWith("data:")) continue;
			const data = line.slice(5).trim();
			if (!data || data === "[DONE]") continue;
			try {
				yield JSON.parse(data) as Record<string, unknown>;
			} catch {
				/* a keep-alive or partial line: skip */
			}
		}
	}
}

async function fail(res: Response): Promise<never> {
	let code: string | undefined;
	let msg = `Qwen answered ${res.status}`;
	try {
		const j = (await res.json()) as { error?: { message?: string; code?: string }; message?: string; code?: string };
		code = j.error?.code ?? j.code;
		msg = j.error?.message ?? j.message ?? msg;
	} catch {
		/* non-JSON body */
	}
	// Content moderation rejects the input with a 400: treat it as a refusal, not a malformed request.
	if (code === "data_inspection_failed" || /inappropriate content/i.test(msg)) throw new QwenHttpError(451, msg, code);
	throw new QwenHttpError(res.status, msg, code);
}

const thinkingRejected = (e: unknown) => e instanceof QwenHttpError && e.status === 400 && /thinking|reasoning/i.test(e.message);

/** One call. Web search goes to the native endpoint (sources); everything else to Chat Completions. */
export async function qwenChat(apiKey: string, req: IQwenRequest, opts: { signal?: AbortSignal; env?: Record<string, string | undefined> } = {}): Promise<IQwenResult> {
	const budget = thinkingBudget(req.effort, req.maxTokens);
	try {
		return await (req.webSearch ? nativeSearch(apiKey, req, budget, opts) : compat(apiKey, req, budget, opts));
	} catch (e) {
		// A model or mode that won't think alongside structured output: answer without thinking instead.
		if (budget > 0 && thinkingRejected(e)) return req.webSearch ? nativeSearch(apiKey, req, 0, opts) : compat(apiKey, req, 0, opts);
		throw e;
	}
}

async function compat(apiKey: string, req: IQwenRequest, budget: number, opts: { signal?: AbortSignal; env?: Record<string, string | undefined> }): Promise<IQwenResult> {
	const body = {
		model: req.model,
		messages: messagesOf(req),
		max_tokens: req.maxTokens,
		stream: true,
		stream_options: { include_usage: true },
		enable_thinking: budget > 0,
		...(budget > 0 ? { thinking_budget: budget } : {}),
		...(req.jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "output", schema: req.jsonSchema, strict: false } } } : {}),
	};
	const res = await fetch(compatUrl("/chat/completions", opts.env), { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), ...(opts.signal ? { signal: opts.signal } : {}) });
	if (!res.ok) await fail(res);
	let text = "";
	let finish: string | null = null;
	let model = req.model;
	let id: string | undefined;
	const usage: IQwenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
	for await (const ev of sse(res)) {
		const e = ev as { id?: string; model?: string; choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number; cache_creation_input_tokens?: number } } | null; error?: { message?: string; code?: string } };
		if (e.error) throw new QwenHttpError(e.error.code === "data_inspection_failed" ? 451 : 500, e.error.message ?? "Qwen stream error", e.error.code);
		id = e.id ?? id;
		model = e.model ?? model;
		for (const c of e.choices ?? []) {
			if (c.delta?.content) text += c.delta.content;
			if (c.finish_reason) finish = c.finish_reason;
		}
		if (e.usage) {
			const cached = e.usage.prompt_tokens_details?.cached_tokens ?? 0;
			const created = e.usage.prompt_tokens_details?.cache_creation_input_tokens ?? 0;
			usage.inputTokens = Math.max(0, (e.usage.prompt_tokens ?? 0) - cached - created);
			usage.cacheReadTokens = cached;
			usage.cacheWriteTokens = created;
			usage.outputTokens = e.usage.completion_tokens ?? 0;
		}
	}
	return { text: stripFences(text), stopReason: stopOf(finish), usage, model, ...(id ? { requestId: id } : {}) };
}

/** Native DashScope generation with web search; only this protocol returns the search sources. */
async function nativeSearch(apiKey: string, req: IQwenRequest, budget: number, opts: { signal?: AbortSignal; env?: Record<string, string | undefined> }): Promise<IQwenResult> {
	const body = {
		model: req.model,
		input: { messages: messagesOf({ ...req, jsonSchema: undefined }) },
		parameters: {
			result_format: "message",
			incremental_output: true,
			max_tokens: req.maxTokens,
			enable_thinking: budget > 0,
			...(budget > 0 ? { thinking_budget: budget } : {}),
			enable_search: true,
			search_options: { enable_source: true, search_strategy: "agent", forced_search: true },
		},
	};
	const res = await fetch(`${qwenBase(opts.env)}/api/v1/services/aigc/text-generation/generation`, {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-DashScope-SSE": "enable" },
		body: JSON.stringify(body),
		...(opts.signal ? { signal: opts.signal } : {}),
	});
	if (!res.ok) await fail(res);
	let text = "";
	let finish: string | null = null;
	let id: string | undefined;
	const sources = new Set<string>();
	const usage: IQwenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 1 };
	const allowed = req.webSearch?.allowedDomains?.map((d) => d.toLowerCase().replace(/^www\./, ""));
	for await (const ev of sse(res)) {
		const e = ev as { request_id?: string; code?: string; message?: string; output?: { choices?: { message?: { content?: string }; finish_reason?: string | null }[]; search_info?: { search_results?: { url?: string }[] } }; usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
		if (e.code && !e.output) throw new QwenHttpError(e.code === "data_inspection_failed" ? 451 : 500, e.message ?? "Qwen stream error", e.code);
		id = e.request_id ?? id;
		for (const c of e.output?.choices ?? []) {
			if (c.message?.content) text += c.message.content;
			if (c.finish_reason && c.finish_reason !== "null") finish = c.finish_reason;
		}
		for (const s of e.output?.search_info?.search_results ?? []) {
			if (!s.url) continue;
			const host = (() => {
				try {
					return new URL(s.url).hostname.toLowerCase().replace(/^www\./, "");
				} catch {
					return "";
				}
			})();
			if (!allowed?.length || allowed.some((d) => host === d || host.endsWith(`.${d}`))) sources.add(s.url);
		}
		if (e.usage) {
			const cached = e.usage.prompt_tokens_details?.cached_tokens ?? 0;
			usage.inputTokens = Math.max(0, (e.usage.input_tokens ?? 0) - cached);
			usage.cacheReadTokens = cached;
			usage.outputTokens = e.usage.output_tokens ?? 0;
		}
	}
	return { text, stopReason: stopOf(finish), usage, model: req.model, ...(id ? { requestId: id } : {}), ...(sources.size ? { sources: [...sources] } : {}) };
}

/** Structured output is plain JSON, but tolerate a stray ```json fence. */
export function stripFences(s: string): string {
	const t = s.trim();
	const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
	return m ? m[1]! : t;
}

/** Cheap key check for Settings → Connections: lists models on the compatible endpoint. */
export async function qwenKeyOk(apiKey: string, env?: Record<string, string | undefined>): Promise<{ ok: boolean; status: number }> {
	const res = await fetch(compatUrl("/models", env), { headers: { Authorization: `Bearer ${apiKey}` } });
	return { ok: res.ok, status: res.status };
}
