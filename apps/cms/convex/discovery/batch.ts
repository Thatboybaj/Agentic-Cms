"use node";
// Page extraction through the Message Batches API when a run has more than ~40 pages to read (prd-site-discovery
// §7.3): about half the price, not latency-critical. Start holds the estimate against the text cap; poll settles to
// what the batch actually billed (50% of list price) once it ends. Pages a batch couldn't extract (errored, expired,
// invalid output) are left without an extract, so the normal extract step picks them up with direct calls.
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@studio/seo-harness";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { costMicroUsd, holdMicroUsd } from "../agents/pricing";
import { agentsLive, formatFor } from "../agents/sdk";
import { DISCOVERY_SKILL, EXTRACT_CONTRACT, ExtractOutput, pageBlock } from "./agentCore";

export const BATCH_MIN_PAGES = 40;
const PAGES_PER_REQUEST = 6;
const EXTRACT_CHARS = 6_000;
const MAX_TOKENS = 4_000;
const BATCH_DISCOUNT = 0.5;

const client = () => {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on this Convex deployment");
	return new Anthropic({ apiKey, maxRetries: 2 });
};
const holdKey = (runId: Id<"runs">) => `discovery:${runId}:extract-batch`;
const textOf = async (ctx: ActionCtx, id: Id<"_storage">) => (await (await ctx.storage.get(id))?.text()) ?? "";

/** Submit the batch, or return batchId null when the run is small enough for direct calls. */
export const start = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	returns: v.object({ batchId: v.union(v.string(), v.null()), requests: v.number(), note: v.optional(v.string()) }),
	handler: async (ctx, { siteId, runId }): Promise<{ batchId: string | null; requests: number; note?: string }> => {
		const input = await ctx.runQuery(internal.discovery.agentData.extractInput, { siteId });
		if (!input || input.pages.length <= BATCH_MIN_PAGES || !agentsLive()) return { batchId: null, requests: 0 };
		const model = MODELS[input.routing.mechanical];
		const system = [
			{ type: "text" as const, text: DISCOVERY_SKILL.text, cache_control: { type: "ephemeral" as const } },
			{ type: "text" as const, text: EXTRACT_CONTRACT },
		];
		const format = formatFor(ExtractOutput) as Anthropic.Messages.JSONOutputFormat;
		const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [];
		let hold = 0;
		for (let i = 0; i < input.pages.length; i += PAGES_PER_REQUEST) {
			const group = input.pages.slice(i, i + PAGES_PER_REQUEST);
			const user = (await Promise.all(group.map(async (p) => pageBlock({ url: p.url, title: p.title, outline: p.outline, text: await textOf(ctx, p.textStorageId) }, EXTRACT_CHARS)))).join("\n\n");
			hold += holdMicroUsd(model, DISCOVERY_SKILL.text.length + EXTRACT_CONTRACT.length + user.length, MAX_TOKENS) * BATCH_DISCOUNT;
			requests.push({ custom_id: `g${i / PAGES_PER_REQUEST}`, params: { model, max_tokens: MAX_TOKENS, system, messages: [{ role: "user", content: user }], output_config: { format, effort: "low" } } as Anthropic.Messages.Batches.BatchCreateParams.Request["params"] });
		}
		const held = await ctx.runMutation(internal.spend.hold, { siteId, budget: "text", key: holdKey(runId), microUsd: Math.ceil(hold), runId });
		if (!held.ok) return { batchId: null, requests: 0, note: `Batch skipped: ${held.message}` };
		try {
			const b = await client().messages.batches.create({ requests });
			return { batchId: b.id, requests: requests.length };
		} catch (e) {
			await ctx.runMutation(internal.spend.settle, { key: holdKey(runId), actualMicroUsd: 0 });
			return { batchId: null, requests: 0, note: `Batch couldn't start (${(e as Error).message}); reading pages directly` };
		}
	},
});

/** Check the batch; when it has ended, save the extracts, record usage and settle the hold. */
export const poll = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), batchId: v.string(), cancel: v.optional(v.boolean()) },
	returns: v.object({ ended: v.boolean(), saved: v.number(), failed: v.number() }),
	handler: async (ctx, { siteId, runId, batchId, cancel }): Promise<{ ended: boolean; saved: number; failed: number }> => {
		const c = client();
		let b = await c.messages.batches.retrieve(batchId);
		if (b.processing_status !== "ended") {
			if (!cancel) return { ended: false, saved: 0, failed: 0 };
			b = await c.messages.batches.cancel(batchId);
			// A cancel finishes in-flight requests first; whatever ended is still billed and read below.
			for (let i = 0; i < 10 && b.processing_status !== "ended"; i++) {
				await new Promise((r) => setTimeout(r, 5_000));
				b = await c.messages.batches.retrieve(batchId);
			}
		}
		const input = await ctx.runQuery(internal.discovery.agentData.extractInput, { siteId });
		const byUrl = new Map((input?.pages ?? []).map((p) => [p.url, p.id]));
		let micro = 0;
		let inTok = 0;
		let outTok = 0;
		let saved = 0;
		let failed = 0;
		let model: string = MODELS.fast;
		if (b.processing_status === "ended") {
			for await (const r of await c.messages.batches.results(batchId)) {
				if (r.result.type !== "succeeded") {
					failed++;
					continue;
				}
				const m = r.result.message;
				model = MODELS[input?.routing.mechanical ?? "fast"];
				const u = { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, cacheReadTokens: m.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: m.usage.cache_creation_input_tokens ?? 0 };
				micro += costMicroUsd(model, u) * BATCH_DISCOUNT;
				inTok += u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens;
				outTok += u.outputTokens;
				const text = m.content.map((x) => (x.type === "text" ? x.text : "")).join("");
				let parsed: ReturnType<typeof ExtractOutput.safeParse>;
				try {
					parsed = ExtractOutput.safeParse(JSON.parse(text));
				} catch {
					failed++;
					continue;
				}
				if (!parsed.success) {
					failed++;
					continue;
				}
				const items = parsed.data.pages.filter((x) => byUrl.has(x.url)).map((x) => ({ id: byUrl.get(x.url)!, type: x.type, topic: x.topic, entities: x.entities, targetQuery: x.targetQuery, funnel: x.funnel, refreshCandidate: x.refreshCandidate, refreshReason: x.refreshReason }));
				await ctx.runMutation(internal.discovery.agentData.saveExtracts, { items });
				saved += items.length;
			}
		}
		const actual = Math.round(micro);
		await ctx.runMutation(internal.spend.settle, { key: holdKey(runId), actualMicroUsd: actual });
		if (actual > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model, tier: input?.routing.mechanical ?? "fast", escalated: false, inputTokens: inTok, outputTokens: outTok, costMicroUsd: actual });
		return { ended: true, saved, failed };
	},
});
