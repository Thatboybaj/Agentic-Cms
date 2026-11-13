import { afterEach, describe, expect, it, vi } from "vitest";
import { gatewayChat, gatewayImages, gatewayModel } from "./gateway";

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

describe("Vercel AI Gateway client", () => {
	it("maps harness ids to gateway ids", () => {
		expect(gatewayModel("qwen3.8-max")).toBe("alibaba/qwen3.8-max");
		expect(gatewayModel("claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
		expect(gatewayModel("openai/gpt-image-2")).toBe("openai/gpt-image-2");
	});

	it("streams Qwen with a JSON schema and no thinking on low effort", async () => {
		let sent: Record<string, unknown> = {};
		vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
			sent = JSON.parse(String(init.body));
			return new Response(sseBody([{ id: "g1", choices: [{ delta: { content: '{"capital":"Doha"}' }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 50, completion_tokens: 8, prompt_tokens_details: { cached_tokens: 10 } } }]), { status: 200 });
		});
		const r = await gatewayChat("k", { model: "qwen3.8-flash", system: ["s"], user: "u", jsonSchema: { type: "object" }, maxTokens: 200, effort: "low" });
		expect(sent).toMatchObject({ model: "alibaba/qwen3.8-flash", stream: true, response_format: { type: "json_schema" }, reasoning: { enabled: false } });
		expect(r).toMatchObject({ text: '{"capital":"Doha"}', stopReason: "end_turn", usage: { inputTokens: 40, cacheReadTokens: 10, outputTokens: 8 } });
	});

	it("searches with the gateway tool and keeps result URLs, not URLs in the model's text", async () => {
		let sent: Record<string, unknown> = {};
		vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
			sent = JSON.parse(String(init.body));
			return new Response(sseBody([{ choices: [{ delta: { tool_calls: [{ type: "vercel:perplexity_search" }] } }] }, { choices: [{ delta: { annotations: [{ type: "url_citation", url_citation: { url: "https://a.com/x" } }] } }] }, { choices: [{ delta: { content: "See https://made-up.example" }, finish_reason: "stop" }] }]), { status: 200 });
		});
		const r = await gatewayChat("k", { model: "qwen3.7-plus", system: ["s"], user: "u", maxTokens: 4000, effort: "medium", webSearch: { maxUses: 5 } });
		expect((sent.tools as { type: string }[])[0]!.type).toBe("vercel:perplexity_search");
		expect(sent.response_format).toBeUndefined();
		expect(r.sources).toEqual(["https://a.com/x"]);
		expect(r.usage.webSearches).toBe(1);
	});

	it("researches through an injected search: model plans queries, sources are only the result URLs", async () => {
		const bodies: Record<string, unknown>[] = [];
		vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
			const b = JSON.parse(String(init.body));
			bodies.push(b);
			const content = b.response_format ? '{"queries":["whatsapp automation clinics qatar","clinic booking bot doha"]}' : "Notes citing https://a.com/x and https://made-up.example";
			return new Response(sseBody([{ choices: [{ delta: { content }, finish_reason: "stop" }] }, { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } }]), { status: 200 });
		});
		const search = vi.fn(async (q: string) => (q.includes("booking") ? [{ url: "https://b.org/y", title: "B", description: "b" }] : [{ url: "https://a.com/x", title: "A", description: "a" }]));
		const r = await gatewayChat("k", { model: "qwen3.7-plus", system: ["skill"], user: "<brief>research</brief>", maxTokens: 4000, effort: "medium", webSearch: { maxUses: 3 } }, { search });
		expect(search).toHaveBeenCalledTimes(2);
		expect(bodies).toHaveLength(2);
		expect(bodies[1]!.tools).toBeUndefined();
		expect(JSON.stringify(bodies[1]!.messages)).toContain("https://b.org/y");
		expect(r.sources).toEqual(["https://a.com/x", "https://b.org/y"]);
		expect(r.usage).toMatchObject({ inputTokens: 200, outputTokens: 40, webSearches: 2 });
	});

	it("explains the card requirement, and generates OpenAI images", async () => {
		vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { type: "customer_verification_required", message: "card" } }), { status: 403 }));
		await expect(gatewayChat("k", { model: "qwen3.8-flash", system: [], user: "u", maxTokens: 10 })).rejects.toMatchObject({ status: 402 });
		vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
			expect(url).toBe("https://ai-gateway.vercel.sh/v1/images/generations");
			expect(JSON.parse(String(init.body)).model).toBe("openai/gpt-image-2");
			return new Response(JSON.stringify({ data: [{ b64_json: "AAA" }] }), { status: 200 });
		});
		expect(await gatewayImages("k", { model: "gpt-image-2", prompt: "p", n: 1, size: "1024x1024" })).toEqual(["data:image/png;base64,AAA"]);
	});
});

describe("thinking per call", () => {
	it("structured output never thinks; free text thinks within its cap", async () => {
		const { reasoningFor } = await import("./gateway");
		expect(reasoningFor({ jsonSchema: { type: "object" }, effort: "high", maxTokens: 8000 })).toEqual({ budget: 0, reasoning: { enabled: false } });
		expect(reasoningFor({ effort: "low", maxTokens: 8000 })).toEqual({ budget: 0, reasoning: { enabled: false } });
		expect(reasoningFor({ effort: "medium", maxTokens: 8000 })).toEqual({ budget: 2000, reasoning: { max_tokens: 2000 } });
	});
});
