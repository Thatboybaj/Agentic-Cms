// Fanar (QCRI, Qatar) chat client: OpenAI-compatible /v1/chat/completions at api.fanar.qa. Used by the translation
// agent for Arabic language versions (every site that turns it on). Key: FANAR_API_KEY on the Convex deployment.
// "Fanar" resolves to the current chat model (Fanar-C-2-27B, checked 13 Nov 2026); JSON answers via json_object.
// Rate limit 50 requests/minute per model: a 429 waits for the reset the response reports, then retries.

export const FANAR_BASE = "https://api.fanar.qa/v1";
export const FANAR_MODEL = "Fanar";

export class FanarError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "FanarError";
	}
}

export interface IFanarResult {
	text: string;
	model: string;
	finish: string | null;
	usage: { inputTokens: number; outputTokens: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fanarChat(apiKey: string, req: { system: string; user: string; maxTokens: number; json?: boolean; model?: string; temperature?: number }, opts: { signal?: AbortSignal; retries?: number } = {}): Promise<IFanarResult> {
	const body = {
		model: req.model ?? FANAR_MODEL,
		messages: [
			{ role: "system", content: req.system },
			{ role: "user", content: req.user },
		],
		max_tokens: req.maxTokens,
		temperature: req.temperature ?? 0.3,
		...(req.json ? { response_format: { type: "json_object" } } : {}),
	};
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(`${FANAR_BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), ...(opts.signal ? { signal: opts.signal } : {}) });
		if (res.status === 429 && attempt < (opts.retries ?? 2)) {
			const reset = Number(res.headers.get("x-ratelimit-reset") ?? "0");
			await sleep(Math.min(65, Math.max(2, reset || 10)) * 1000);
			continue;
		}
		if (res.status >= 500 && attempt < (opts.retries ?? 2)) {
			await sleep(3000 * (attempt + 1));
			continue;
		}
		const text = await res.text();
		if (!res.ok) {
			let msg = text.slice(0, 300);
			try {
				const j = JSON.parse(text) as { error?: { message?: string } | string; detail?: string; message?: string };
				msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.detail ?? j.message ?? msg;
			} catch {
				/* not json */
			}
			throw new FanarError(res.status, res.status === 401 ? "Fanar rejected the API key (FANAR_API_KEY)" : `Fanar ${res.status}: ${msg}`);
		}
		const j = JSON.parse(text) as { model?: string; choices?: { finish_reason?: string | null; message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
		const c = j.choices?.[0];
		return { text: c?.message?.content ?? "", model: j.model ?? body.model, finish: c?.finish_reason ?? null, usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 } };
	}
}
