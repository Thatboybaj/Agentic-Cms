"use node";
// Translation agent, live (language versions, every site that turns them on). The ship flow calls `ensure` before it
// renders: for each language the site publishes, an up-to-date version of the post exists afterwards, or the run says
// why not. Agent per site: Fanar (QCRI) or Qwen through Vercel AI Gateway; when Fanar can't be reached, the Gateway
// takes over for that post. Every answer passes translateCore's free checks (links, numbers, lines, script) before
// it is saved; a block that fails is asked again once with the problem named.
import { v } from "convex/values";
import { FanarError, fanarChat } from "../../src/lib/fanar";
import { gatewayChat } from "../../src/lib/gateway";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { cleanTitle } from "../../src/render/inline";
import { costMicroUsd } from "./pricing";
import { modelOf } from "./provider";
import { blockProblem, blocksPrompt, chunkBlocks, headerPrompt, headerProblem, type IHeaderOut, type ISourceBlock, linkedPaths, localizeLinks, parseJson, sourceHash, systemPrompt } from "./translateCore";

type TAgent = "fanar" | "gateway";
interface ICall {
	text: string;
	model: string;
	agent: TAgent;
	inputTokens: number;
	outputTokens: number;
	micro: number;
}

const MAX_OUT = 6000;

async function call(agent: TAgent, system: string, user: string, maxTokens: number): Promise<ICall> {
	if (agent === "fanar") {
		const key = process.env.FANAR_API_KEY?.trim();
		if (!key) throw new FanarError(0, "FANAR_API_KEY is not set on this Convex deployment");
		const r = await fanarChat(key, { system, user, maxTokens, json: true });
		if (r.finish === "length") throw new FanarError(0, "Fanar's answer was cut off");
		// Fanar publishes no per-token price: its usage is recorded, its cost as $0.
		return { text: r.text, model: r.model, agent, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, micro: 0 };
	}
	const key = process.env.AI_GATEWAY_API_KEY?.trim();
	if (!key) throw new Error("AI_GATEWAY_API_KEY is not set on this Convex deployment");
	const model = modelOf("workhorse");
	const r = await gatewayChat(key, { model, system: [system], user, maxTokens, effort: "low", jsonSchema: { type: "object" } });
	if (r.stopReason === "max_tokens") throw new Error("The answer was cut off");
	return { text: r.text, model: r.model, agent, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, micro: costMicroUsd(r.model, r.usage) };
}

/** Pages of the site that exist in the language (for moving links under the prefix). */
async function existing(domain: string, prefix: string, paths: string[]): Promise<Set<string>> {
	const pre = `/${prefix.replace(/^\/+|\/+$/g, "")}`;
	const out = new Set<string>();
	await Promise.all(
		paths.slice(0, 40).map(async (p) => {
			const target = p === "/" ? pre : `${pre}${p}`;
			try {
				const res = await fetch(`https://${domain}${target}`, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "agentic-cms-link-check" } });
				if (res.ok) out.add(target);
				await res.body?.cancel();
			} catch {
				/* unknown → the link keeps the main page */
			}
		}),
	);
	return out;
}

export const ensure = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	returns: v.object({ done: v.array(v.string()), failed: v.array(v.object({ lang: v.string(), reason: v.string() })) }),
	handler: async (ctx, { siteId, postId }) => {
		const inp = await ctx.runQuery(internal.translations.input, { siteId, postId });
		const result = { done: [] as string[], failed: [] as { lang: string; reason: string }[] };
		if (!inp) return result;
		for (const lang of inp.languages) {
			const hash = sourceHash(inp.post, lang.lang, lang.styleGuide ?? "");
			if (inp.have.some((h) => h.lang === lang.lang && h.sourceHash === hash)) {
				result.done.push(lang.lang);
				continue;
			}
			const start = await ctx.runMutation(internal.translations.startRun, { siteId, postId, lang: lang.lang, hash, agent: lang.agent });
			if (!start.ok) {
				result.failed.push({ lang: lang.lang, reason: start.reason });
				continue;
			}
			const runId = start.runId as Id<"runs">;
			let agent: TAgent = lang.agent;
			const usage = { inputTokens: 0, outputTokens: 0, micro: 0, model: "" };
			const used = new Set<TAgent>();
			const ask = async (system: string, user: string, maxTokens: number) => {
				let r: ICall;
				try {
					r = await call(agent, system, user, maxTokens);
				} catch (e) {
					// Fanar unreachable (or its key missing): the Gateway carries on for this post, when it is set up.
					if (agent !== "fanar" || !process.env.AI_GATEWAY_API_KEY?.trim() || (e instanceof FanarError && e.status === 0 && /cut off/.test(e.message))) throw e;
					agent = "gateway";
					r = await call(agent, system, user, maxTokens);
				}
				usage.inputTokens += r.inputTokens;
				usage.outputTokens += r.outputTokens;
				usage.micro += r.micro;
				if (!usage.model || r.agent === "fanar") usage.model = r.model;
				used.add(r.agent);
				return r.text;
			};
			try {
				const system = systemPrompt({ lang: lang.lang, siteName: inp.site.name, domain: inp.site.domain, ...(lang.styleGuide ? { styleGuide: lang.styleGuide } : {}) });
				// Title, meta, category and image alt text.
				let head = parseJson<IHeaderOut>(await ask(system, headerPrompt(inp.post), 1500));
				let hp = headerProblem(inp.post, head, lang.lang);
				if (hp) {
					head = parseJson<IHeaderOut>(await ask(system, `${headerPrompt(inp.post)}\nYour last answer broke the rules: ${hp}. Fix exactly that.`, 1500));
					hp = headerProblem(inp.post, head, lang.lang);
					if (hp) throw new Error(`Title and meta: ${hp}`);
				}
				// Body, in chunks, a few at a time (Fanar allows 50 requests a minute).
				const chunks = chunkBlocks(inp.post.blocks);
				const got = new Map<string, string>();
				const runChunk = async (blocks: ISourceBlock[], problems?: Record<string, string>) => {
					const out = parseJson<{ blocks?: { id?: string; text?: string }[] }>(await ask(system, blocksPrompt(blocks, problems), MAX_OUT));
					for (const b of out?.blocks ?? []) if (b.id && typeof b.text === "string") got.set(b.id, b.text.trim());
				};
				for (let i = 0; i < chunks.length; i += 3) await Promise.all(chunks.slice(i, i + 3).map((c) => runChunk(c)));
				const check = () => {
					const bad: Record<string, string> = {};
					for (const c of chunks) for (const b of c) {
						const t = got.get(b.id);
						const p = t === undefined ? "the block is missing from the answer" : blockProblem(b, t, lang.lang);
						if (p) bad[b.id] = p;
					}
					return bad;
				};
				let bad = check();
				if (Object.keys(bad).length) {
					const again = chunks.flat().filter((b) => bad[b.id]);
					for (const c of chunkBlocks(again)) await runChunk(c, Object.fromEntries(c.map((b) => [b.id, bad[b.id]!])));
					bad = check();
				}
				// Still failing on Fanar: Qwen (AI Gateway) gets just those blocks, once, with the problems named.
				if (Object.keys(bad).length && agent === "fanar" && process.env.AI_GATEWAY_API_KEY?.trim()) {
					const prev = agent;
					agent = "gateway";
					const again = chunks.flat().filter((b) => bad[b.id]);
					for (const c of chunkBlocks(again)) await runChunk(c, Object.fromEntries(c.map((b) => [b.id, bad[b.id]!])));
					agent = prev;
					bad = check();
				}
				const left = Object.entries(bad);
				if (left.length) throw new Error(`${left.length} block${left.length === 1 ? "" : "s"} failed the checks (${left.slice(0, 3).map(([id, p]) => `${id}: ${p}`).join("; ")})`);
				// Internal links move to the language's pages where those exist.
				const have = await existing(inp.site.domain, lang.linkPrefix, linkedPaths(inp.post.blocks, inp.site.domain));
				const blocks = inp.post.blocks.map((b) => (b.kind === "image" ? b : { ...b, text: localizeLinks(got.get(b.id) ?? b.text, inp.site.domain, lang.linkPrefix, (p) => have.has(p)) }));
				const alts = inp.post.alts.map((a) => ({ slotId: a.slotId, alt: head!.alts?.find((x) => x.id === a.slotId)?.text?.trim() || a.alt }));
				await ctx.runMutation(internal.translations.save, {
					postId,
					translation: { lang: lang.lang, title: cleanTitle(head!.title!), seoTitle: cleanTitle(head!.seoTitle?.trim() || head!.title!).slice(0, 80), ...(head!.metaDescription?.trim() ? { metaDescription: head!.metaDescription.trim().slice(0, 180) } : {}), ...(head!.pillarName?.trim() ? { pillarName: head!.pillarName.trim() } : {}), blocks, alts, sourceHash: hash, agent: used.has("fanar") ? "fanar" : "gateway", model: usage.model, at: Date.now() },
				});
				await ctx.runMutation(internal.spend.recordUsage, { runId, model: usage.model || agent, tier: "workhorse", escalated: false, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costMicroUsd: usage.micro });
				await ctx.runMutation(internal.translations.finish, { runId, ok: true, output: `${lang.lang} version ready · ${chunks.flat().length} blocks · ${used.has("fanar") ? (used.has("gateway") ? "Fanar, Qwen for the blocks it got wrong" : "Fanar") : "Qwen via AI Gateway"}` });
				result.done.push(lang.lang);
			} catch (e) {
				const reason = (e as Error).message.slice(0, 400);
				await ctx.runMutation(internal.spend.recordUsage, { runId, model: usage.model || agent, tier: "workhorse", escalated: false, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costMicroUsd: usage.micro });
				await ctx.runMutation(internal.translations.finish, { runId, ok: false, output: `The ${lang.lang} version didn't ship`, error: reason });
				result.failed.push({ lang: lang.lang, reason });
			}
		}
		return result;
	},
});
