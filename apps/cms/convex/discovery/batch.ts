"use node";
// Page extraction through Qwen's batch inference (OpenAI-compatible Batch File API on Model Studio) when a run has
// more than ~40 pages to read (prd-site-discovery §7.3): half the real-time price, not latency-critical. Start uploads
// a JSONL file and creates the batch, holding the estimate against the text cap; poll settles to what the batch
// actually billed once it ends. Pages a batch couldn't extract (errors, expiry, invalid output, or a model without
// batch in this region) are left without an extract, so the normal extract step reads them with direct calls.
import { v } from "convex/values";
import { compatUrl, stripFences } from "../../src/lib/qwen";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { costMicroUsd, holdMicroUsd, priceOf } from "../agents/pricing";
import { agentsLive, formatFor, qwenKey } from "../agents/sdk";
import { DISCOVERY_SKILL, EXTRACT_CONTRACT, ExtractOutput, pageBlock } from "./agentCore";
import { modelOf } from "../agents/provider";

export const BATCH_MIN_PAGES = 40;
const PAGES_PER_REQUEST = 6;
const EXTRACT_CHARS = 6_000;
const MAX_TOKENS = 4_000;
const BATCH_DISCOUNT = 0.5;
const JSON_NOTE = "Reply with a single JSON object that matches the response schema. No prose, no code fences.";

const holdKey = (runId: Id<"runs">) => `discovery:${runId}:extract-batch`;
const textOf = async (ctx: ActionCtx, id: Id<"_storage">) => (await (await ctx.storage.get(id))?.text()) ?? "";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(compatUrl(path), { ...init, headers: { Authorization: `Bearer ${qwenKey()}`, ...(init.headers ?? {}) } });
	if (!res.ok) throw new Error(`Qwen batch API ${path} answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
	return (path.endsWith("/content") ? await res.text() : await res.json()) as T;
}

/** Submit the batch, or return batchId null when the run is small enough for direct calls. */
export const start = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs") },
	returns: v.object({ batchId: v.union(v.string(), v.null()), requests: v.number(), note: v.optional(v.string()) }),
	handler: async (ctx, { siteId, runId }): Promise<{ batchId: string | null; requests: number; note?: string }> => {
		const input = await ctx.runQuery(internal.discovery.agentData.extractInput, { siteId });
		if (!input || input.pages.length <= BATCH_MIN_PAGES || !agentsLive()) return { batchId: null, requests: 0 };
		const model = modelOf(input.routing.mechanical);
		if (!priceOf(model).batch) return { batchId: null, requests: 0, note: `${model} has no batch inference in this region; reading pages directly` };
		const system = [DISCOVERY_SKILL.text, EXTRACT_CONTRACT, JSON_NOTE].join("\n\n");
		const schema = formatFor(ExtractOutput);
		const lines: string[] = [];
		let hold = 0;
		for (let i = 0; i < input.pages.length; i += PAGES_PER_REQUEST) {
			const group = input.pages.slice(i, i + PAGES_PER_REQUEST);
			const user = (await Promise.all(group.map(async (p) => pageBlock({ url: p.url, title: p.title, outline: p.outline, text: await textOf(ctx, p.textStorageId) }, EXTRACT_CHARS)))).join("\n\n");
			hold += holdMicroUsd(model, system.length + user.length, MAX_TOKENS) * BATCH_DISCOUNT;
			lines.push(
				JSON.stringify({
					custom_id: `g${i / PAGES_PER_REQUEST}`,
					method: "POST",
					url: "/v1/chat/completions",
					body: { model, max_tokens: MAX_TOKENS, enable_thinking: false, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_schema", json_schema: { name: "output", schema, strict: false } } },
				}),
			);
		}
		const held = await ctx.runMutation(internal.spend.hold, { siteId, budget: "text", key: holdKey(runId), microUsd: Math.ceil(hold), runId });
		if (!held.ok) return { batchId: null, requests: 0, note: `Batch skipped: ${held.message}` };
		try {
			const form = new FormData();
			form.append("purpose", "batch");
			form.append("file", new Blob([lines.join("\n")], { type: "application/jsonl" }), `discovery-${runId}.jsonl`);
			const file = await api<{ id: string }>("/files", { method: "POST", body: form });
			const b = await api<{ id: string }>("/batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input_file_id: file.id, endpoint: "/v1/chat/completions", completion_window: "24h" }) });
			return { batchId: b.id, requests: lines.length };
		} catch (e) {
			await ctx.runMutation(internal.spend.settle, { key: holdKey(runId), actualMicroUsd: 0 });
			return { batchId: null, requests: 0, note: `Batch couldn't start (${(e as Error).message}); reading pages directly` };
		}
	},
});

type TBatch = { status: string; output_file_id?: string | null };
const ENDED = new Set(["completed", "failed", "expired", "cancelled"]);

/** Check the batch; when it has ended, save the extracts, record usage and settle the hold. */
export const poll = internalAction({
	args: { siteId: v.id("sites"), runId: v.id("runs"), batchId: v.string(), cancel: v.optional(v.boolean()) },
	returns: v.object({ ended: v.boolean(), saved: v.number(), failed: v.number() }),
	handler: async (ctx, { siteId, runId, batchId, cancel }): Promise<{ ended: boolean; saved: number; failed: number }> => {
		let b = await api<TBatch>(`/batches/${batchId}`);
		if (!ENDED.has(b.status)) {
			if (!cancel) return { ended: false, saved: 0, failed: 0 };
			await api(`/batches/${batchId}/cancel`, { method: "POST" });
			// A cancel finishes in-flight requests first; whatever completed is still billed and read below.
			for (let i = 0; i < 10 && !ENDED.has(b.status); i++) {
				await new Promise((r) => setTimeout(r, 5_000));
				b = await api<TBatch>(`/batches/${batchId}`);
			}
		}
		const input = await ctx.runQuery(internal.discovery.agentData.extractInput, { siteId });
		const byUrl = new Map((input?.pages ?? []).map((p) => [p.url, p.id]));
		const tier = input?.routing.mechanical ?? "fast";
		const model = modelOf(tier);
		let micro = 0;
		let inTok = 0;
		let outTok = 0;
		let saved = 0;
		let failed = 0;
		const out = b.output_file_id ? await api<string>(`/files/${b.output_file_id}/content`) : "";
		for (const line of out.split("\n")) {
			if (!line.trim()) continue;
			let r: { response?: { status_code?: number; body?: { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } } } };
			try {
				r = JSON.parse(line);
			} catch {
				failed++;
				continue;
			}
			const body = r.response?.body;
			if (r.response?.status_code !== 200 || !body) {
				failed++;
				continue;
			}
			const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
			const u = { inputTokens: Math.max(0, (body.usage?.prompt_tokens ?? 0) - cached), outputTokens: body.usage?.completion_tokens ?? 0, cacheReadTokens: cached, cacheWriteTokens: 0 };
			micro += costMicroUsd(model, u) * BATCH_DISCOUNT;
			inTok += u.inputTokens + u.cacheReadTokens;
			outTok += u.outputTokens;
			const parsed = (() => {
				try {
					return ExtractOutput.safeParse(JSON.parse(stripFences(body.choices?.[0]?.message?.content ?? "")));
				} catch {
					return null;
				}
			})();
			if (!parsed?.success) {
				failed++;
				continue;
			}
			const items = parsed.data.pages.filter((x) => byUrl.has(x.url)).map((x) => ({ id: byUrl.get(x.url)!, type: x.type, topic: x.topic, entities: x.entities, targetQuery: x.targetQuery, funnel: x.funnel, refreshCandidate: x.refreshCandidate, refreshReason: x.refreshReason }));
			await ctx.runMutation(internal.discovery.agentData.saveExtracts, { items });
			saved += items.length;
		}
		const actual = Math.round(micro);
		await ctx.runMutation(internal.spend.settle, { key: holdKey(runId), actualMicroUsd: actual });
		if (actual > 0) await ctx.runMutation(internal.spend.recordUsage, { runId, model, tier, escalated: false, inputTokens: inTok, outputTokens: outTok, costMicroUsd: actual });
		return { ended: true, saved, failed };
	},
});
