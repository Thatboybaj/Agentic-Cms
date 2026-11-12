"use node";
// The one real transport: Qwen on Alibaba Cloud Model Studio, called from Convex Node actions (src/lib/qwen.ts does the
// HTTP). Streams, so long writer outputs stay clear of connection timeouts; structured output via response_format
// json_schema; web search through the native endpoint so the research agents get their source URLs. The key is
// DASHSCOPE_API_KEY in the Convex deployment env; it never enters a prompt, a trace or a document.
import { z } from "zod/v4";
import { qwenChat } from "../../src/lib/qwen";
import type { TTransport } from "./gateway";
import type { ILedger } from "./capped";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

const TIMEOUT_MS = 8 * 60_000; // inside Convex's 10-minute action limit

/** Live only when the deployment opts in: CMS_AGENTS=live. Otherwise steps keep their $0 stubs. */
export const agentsLive = () => process.env.CMS_AGENTS === "live";

export function qwenKey(): string {
	const key = process.env.DASHSCOPE_API_KEY?.trim();
	if (!key) throw new Error("DASHSCOPE_API_KEY is not set on this Convex deployment");
	return key;
}

export function modelTransport(): TTransport {
	const apiKey = qwenKey();
	return async (req) => qwenChat(apiKey, req, { signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** JSON schema for a zod schema (structured output). Unrepresentable bits (transforms) fall back to "any". */
export const formatFor = <T>(s: z.ZodType<T>): object => {
	const schema = z.toJSONSchema(s as z.ZodType, { unrepresentable: "any" }) as Record<string, unknown>;
	delete schema.$schema;
	return schema;
};

export function ledgerFor(ctx: ActionCtx, siteId: Id<"sites">, budget: "text" | "image", runId?: Id<"runs">): ILedger {
	return {
		hold: (key, microUsd) => ctx.runMutation(internal.spend.hold, { siteId, budget, key, microUsd, ...(runId ? { runId } : {}) }),
		settle: async (key, actualMicroUsd) => {
			await ctx.runMutation(internal.spend.settle, { key, actualMicroUsd });
		},
	};
}
