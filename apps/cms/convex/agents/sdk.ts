"use node";
// The one real transport: Anthropic SDK in a Convex Node action. Streams (long writer outputs stay clear of HTTP
// timeouts), sends the skill text as a cached system block, structured output via output_config.format. The key is
// ANTHROPIC_API_KEY in the Convex deployment env; it never enters a prompt, a trace or a document.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import type { TTransport } from "./gateway";
import type { ILedger } from "./capped";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const TIMEOUT_MS = 8 * 60_000; // inside Convex's 10-minute action limit

/** Live only when the deployment opts in: CMS_AGENTS=live. Otherwise steps keep their $0 stubs. */
export const agentsLive = () => process.env.CMS_AGENTS === "live";

export function anthropicTransport(): TTransport {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on this Convex deployment");
	const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 }); // cappedInference owns retries
	return async (req) => {
		const system = req.system.map((text, i) => ({ type: "text" as const, text, ...(i === 0 ? { cache_control: { type: "ephemeral" as const } } : {}) }));
		const tools: Anthropic.Messages.ToolUnion[] | undefined = req.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: req.webSearch.maxUses, ...(req.webSearch.allowedDomains?.length ? { allowed_domains: req.webSearch.allowedDomains } : {}) } as Anthropic.Messages.ToolUnion] : undefined;
		const output_config = { ...(req.jsonSchema ? { format: req.jsonSchema as Anthropic.Messages.JSONOutputFormat } : {}), ...(req.effort ? { effort: req.effort } : {}) };
		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: req.user }];
		const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
		let text = "";
		let msg: Anthropic.Messages.Message | undefined;
		let requestId: string | undefined;
		const sources = new Set<string>();
		// Server tools can pause a long turn (pause_turn): resend with the assistant content so far, bounded.
		for (let turn = 0; turn < 4; turn++) {
			const stream = client.messages.stream({ model: req.model, max_tokens: req.maxTokens, system, messages, ...(tools ? { tools } : {}), ...(Object.keys(output_config).length ? { output_config } : {}) });
			msg = await stream.finalMessage();
			requestId = stream.request_id ?? requestId;
			usage.inputTokens += msg.usage.input_tokens;
			usage.outputTokens += msg.usage.output_tokens;
			usage.cacheReadTokens += msg.usage.cache_read_input_tokens ?? 0;
			usage.cacheWriteTokens += msg.usage.cache_creation_input_tokens ?? 0;
			usage.webSearches += msg.usage.server_tool_use?.web_search_requests ?? 0;
			text += msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
			for (const b of msg.content) if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") sources.add(r.url);
			if (msg.stop_reason !== "pause_turn") break;
			messages.push({ role: "assistant", content: msg.content });
		}
		return { text, stopReason: msg!.stop_reason, model: msg!.model, usage, ...(requestId ? { requestId } : {}), ...(sources.size ? { sources: [...sources] } : {}) };
	};
}

/** Structured-output format for a zod schema (the SDK helper adapts constraints the API doesn't accept). */
export const formatFor = <T>(s: z.ZodType<T>): object => {
	const f = zodOutputFormat(s as never) as unknown as { type: "json_schema"; schema: Record<string, unknown> };
	return { type: f.type, schema: f.schema };
};

export function ledgerFor(ctx: ActionCtx, siteId: Id<"sites">, budget: "text" | "image", runId?: Id<"runs">): ILedger {
	return {
		hold: (key, microUsd) => ctx.runMutation(internal.spend.hold, { siteId, budget, key, microUsd, ...(runId ? { runId } : {}) }),
		settle: async (key, actualMicroUsd) => {
			await ctx.runMutation(internal.spend.settle, { key, actualMicroUsd });
		},
	};
}
