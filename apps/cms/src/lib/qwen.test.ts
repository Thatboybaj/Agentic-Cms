import { afterEach, describe, expect, it, vi } from "vitest";
import { compatUrl, QwenHttpError, qwenChat, stripFences, thinkingBudget } from "./qwen";

const sseBody = (events: unknown[]) =>
	new ReadableStream({
		start(c) {
			const enc = new TextEncoder();
			for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
			c.enqueue(enc.encode("data: [DONE]\n\n"));
			c.close();
		},
	});

afterEach(() => vi.unstubAllGlobals());

describe("qwen client", () => {
	it("streams chat completions, sends the schema and splits cached tokens", async () => {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
			calls.push({ url, body: JSON.parse(String(init.body)) });
			return new Response(sseBody([{ id: "r1", model: "qwen3.7-plus", choices: [{ delta: { content: '{"a":' } }] }, { choices: [{ delta: { content: "1}" }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 400 } } }]), { status: 200 });
		});
		const r = await qwenChat("k", { model: "qwen3.7-plus", system: ["skill"], user: "hi", jsonSchema: { type: "object" }, maxTokens: 2000, effort: "low" });
		expect(calls[0]!.url).toBe("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions");
		expect(calls[0]!.body).toMatchObject({ model: "qwen3.7-plus", stream: true, enable_thinking: false, response_format: { type: "json_schema" } });
		expect(JSON.stringify(calls[0]!.body.messages)).toContain("JSON");
		expect(r).toMatchObject({ text: '{"a":1}', stopReason: "end_turn", requestId: "r1", usage: { inputTokens: 600, cacheReadTokens: 400, outputTokens: 50 } });
	});

	it("maps a length stop to max_tokens and moderation to a refusal status", async () => {
		vi.stubGlobal("fetch", async () => new Response(sseBody([{ choices: [{ delta: { content: "x" }, finish_reason: "length" }] }]), { status: 200 }));
		expect((await qwenChat("k", { model: "m", system: [], user: "u", maxTokens: 10 })).stopReason).toBe("max_tokens");
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ code: "data_inspection_failed", message: "Input data may contain inappropriate content." }), { status: 400 }));
		await expect(qwenChat("k", { model: "m", system: [], user: "u", maxTokens: 10 })).rejects.toMatchObject({ status: 451 });
	});

	it("uses the native endpoint for web search and keeps the sources", async () => {
		let url = "";
		vi.stubGlobal("fetch", async (u: string) => {
			url = u;
			return new Response(sseBody([{ request_id: "n1", output: { choices: [{ message: { content: "notes" } }], search_info: { search_results: [{ url: "https://a.com/x" }, { url: "https://other.org/y" }] } } }, { output: { choices: [{ message: { content: " more" }, finish_reason: "stop" }] }, usage: { input_tokens: 5000, output_tokens: 300 } }]), { status: 200 });
		});
		const r = await qwenChat("k", { model: "qwen3.7-plus", system: ["s"], user: "u", maxTokens: 4000, effort: "medium", webSearch: { maxUses: 5, allowedDomains: ["a.com"] } });
		expect(url).toBe("https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation");
		expect(r).toMatchObject({ text: "notes more", stopReason: "end_turn", sources: ["https://a.com/x"], usage: { inputTokens: 5000, outputTokens: 300, webSearches: 1 } });
	});

	it("retries without thinking when the model won't think with these options", async () => {
		const bodies: Record<string, unknown>[] = [];
		vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
			const b = JSON.parse(String(init.body));
			bodies.push(b);
			if (b.enable_thinking) return new Response(JSON.stringify({ error: { message: "enable_thinking is not supported with response_format" } }), { status: 400 });
			return new Response(sseBody([{ choices: [{ delta: { content: "{}" }, finish_reason: "stop" }] }]), { status: 200 });
		});
		await qwenChat("k", { model: "m", system: [], user: "u", maxTokens: 8000, effort: "high" });
		expect(bodies.map((b) => b.enable_thinking)).toEqual([true, false]);
	});

	it("budgets thinking per effort, strips fences, honours the region override", () => {
		expect(thinkingBudget("low", 8000)).toBe(0);
		expect(thinkingBudget("medium", 8000)).toBe(2000);
		expect(thinkingBudget("high", 8000)).toBe(4000);
		expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(compatUrl("/models", { QWEN_BASE_URL: "https://dashscope-us.aliyuncs.com/compatible-mode/v1/" })).toBe("https://dashscope-us.aliyuncs.com/compatible-mode/v1/models");
		expect(new QwenHttpError(401, "x").status).toBe(401);
	});
});
