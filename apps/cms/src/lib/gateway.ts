// Vercel AI Gateway client (CMS_MODEL_PROVIDER=gateway): the same Qwen models as Alibaba direct, reached through
// Vercel's OpenAI-compatible endpoint with one key (AI_GATEWAY_API_KEY), at provider list price. fetch only, so it
// runs in Convex Node actions and the Next server alike. Docs checked 2026-11-12:
//   - Chat Completions (streamed) with response_format json_schema for structured output;
//   - web search through the gateway's own tool (vercel:perplexity_search), whose results carry the source URLs;
//   - OpenAI images through /v1/images/generations (same request and response as OpenAI's).
import { type IQwenRequest, type IQwenResult, type IQwenUsage, messagesOf, QwenHttpError, sse, stopOf, stripFences, thinkingBudget } from "./qwen";

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

/** Harness model id → gateway model id: Qwen tiers are Alibaba's ("alibaba/qwen3.7-plus"); others pass as given. */
export const gatewayModel = (id: string) => (id.includes("/") ? id : id.startsWith("qwen") ? `alibaba/${id}` : id.startsWith("claude") ? `anthropic/${id}` : id.startsWith("gpt") ? `openai/${id}` : id);

async function fail(res: Response): Promise<never> {
	let code: string | undefined;
	let msg = `AI Gateway answered ${res.status}`;
	try {
		const j = (await res.json()) as { error?: { message?: string; type?: string; code?: string } };
		code = j.error?.code ?? j.error?.type;
		msg = j.error?.message ?? msg;
	} catch {
		/* non-JSON body */
	}
	if (code === "customer_verification_required") throw new QwenHttpError(402, "Vercel AI Gateway needs a credit card on file before it serves requests (Vercel dashboard → AI Gateway → add a card; that also unlocks the free credit).", code);
	if (/data_inspection|content.?filter|inappropriate/i.test(`${code} ${msg}`)) throw new QwenHttpError(451, msg, code);
	throw new QwenHttpError(res.status, msg, code);
}

/** Every http(s) URL inside the parts of a streamed event that hold search results (not the model's own text). */
function sourceUrls(node: unknown, out: Set<string>, depth = 0) {
	if (!node || depth > 8) return;
	if (typeof node === "string") {
		if (/^https?:\/\/\S+$/.test(node)) out.add(node);
		return;
	}
	if (Array.isArray(node)) {
		for (const x of node) sourceUrls(x, out, depth + 1);
		return;
	}
	if (typeof node === "object") for (const [k, v] of Object.entries(node as Record<string, unknown>)) if (k !== "content" || depth > 0) sourceUrls(v, out, depth + 1);
}

/** One call through the gateway. Thinking: low effort turns it off; medium/high give Qwen a capped budget. */
export async function gatewayChat(apiKey: string, req: IQwenRequest, opts: { signal?: AbortSignal } = {}): Promise<IQwenResult> {
	const budget = thinkingBudget(req.effort, req.maxTokens);
	const body = {
		model: gatewayModel(req.model),
		messages: messagesOf(req.webSearch ? { ...req, jsonSchema: undefined } : req),
		max_tokens: req.maxTokens,
		stream: true,
		stream_options: { include_usage: true },
		...(req.jsonSchema && !req.webSearch ? { response_format: { type: "json_schema", json_schema: { name: "output", schema: req.jsonSchema, strict: false } } } : {}),
		...(req.webSearch ? { tools: [{ type: "vercel:perplexity_search", config: { max_results: Math.min(10, Math.max(3, req.webSearch.maxUses * 2)), ...(req.webSearch.allowedDomains?.length ? { search_domain_filter: req.webSearch.allowedDomains } : {}) } }] } : {}),
		// Provider options pass through to Alibaba: Qwen3.x hybrid models think by default.
		providerOptions: { alibaba: { enable_thinking: budget > 0, ...(budget > 0 ? { thinking_budget: budget } : {}) } },
	};
	const res = await fetch(`${GATEWAY_BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), ...(opts.signal ? { signal: opts.signal } : {}) });
	if (!res.ok) await fail(res);
	let text = "";
	let finish: string | null = null;
	let id: string | undefined;
	const sources = new Set<string>();
	let searches = 0;
	const usage: IQwenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
	for await (const ev of sse(res)) {
		const e = ev as { id?: string; choices?: { delta?: { content?: string | null; tool_calls?: unknown[]; annotations?: unknown; [k: string]: unknown }; finish_reason?: string | null }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null; error?: { message?: string; code?: string } };
		if (e.error) throw new QwenHttpError(500, e.error.message ?? "AI Gateway stream error", e.error.code);
		id = e.id ?? id;
		for (const c of e.choices ?? []) {
			if (c.delta?.content) text += c.delta.content;
			if (c.finish_reason) finish = c.finish_reason;
			if (req.webSearch && c.delta) {
				const { content: _c, ...rest } = c.delta;
				if (c.delta.tool_calls?.length) searches += c.delta.tool_calls.length;
				sourceUrls(rest, sources);
			}
		}
		if (req.webSearch) {
			const { choices: _ch, usage: _u, ...extra } = ev as Record<string, unknown>;
			sourceUrls(extra, sources);
		}
		if (e.usage) {
			const cached = e.usage.prompt_tokens_details?.cached_tokens ?? 0;
			usage.inputTokens = Math.max(0, (e.usage.prompt_tokens ?? 0) - cached);
			usage.cacheReadTokens = cached;
			usage.outputTokens = e.usage.completion_tokens ?? 0;
		}
	}
	usage.webSearches = req.webSearch ? Math.max(1, searches) : 0;
	return { text: req.webSearch ? text : stripFences(text), stopReason: stopOf(finish === "tool_calls" ? "stop" : finish), usage, model: req.model, ...(id ? { requestId: id } : {}), ...(sources.size ? { sources: [...sources] } : {}) };
}

/** OpenAI image models through the gateway (same body and response as api.openai.com/v1/images/generations). */
export async function gatewayImages(apiKey: string, b: { model: string; prompt: string; n: number; size: string }, signal?: AbortSignal): Promise<string[]> {
	const res = await fetch(`${GATEWAY_BASE}/images/generations`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...b, model: b.model.includes("/") ? b.model : `openai/${b.model}` }), ...(signal ? { signal } : {}) });
	if (!res.ok) await fail(res);
	const j = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
	return (j.data ?? []).map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : "")).filter(Boolean);
}
