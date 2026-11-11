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
		const stream = client.messages.stream({
			model: req.model,
			max_tokens: req.maxTokens,
			system: req.system.map((text, i) => ({ type: "text" as const, text, ...(i === 0 ? { cache_control: { type: "ephemeral" as const } } : {}) })),
			messages: [{ role: "user", content: req.user }],
			output_config: { format: req.jsonSchema as Anthropic.Messages.JSONOutputFormat, ...(req.effort ? { effort: req.effort } : {}) },
		});
		const msg = await stream.finalMessage();
		const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
		return {
			text,
			stopReason: msg.stop_reason,
			model: msg.model,
			usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens, cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0 },
			...(stream.request_id ? { requestId: stream.request_id } : {}),
		};
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
