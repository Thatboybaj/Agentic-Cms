// Handoff 03 unit tests: gateway error mapping, cappedInference money moves (refuse / hold / settle / retry bound /
// release on failure), D7 retry → escalate, tier routing, and the writer's output mapping (golden fixture replayed
// through a fake transport). No network: the transport is a fake.
import { z } from "zod/v4";
import { describe, expect, test } from "vitest";
import { CapError, cappedInference, type ILedger } from "./capped";
import { classify, type ITransportResult, type TTransport } from "./gateway";
import { modelFor } from "./models";
import { costMicroUsd } from "./pricing";
import { AgentError, runAgentCall } from "./run";
import { toDraft, toRevision, WRITER_SKILL, WriterOutput, writerUserPrompt, type TWriterOutput } from "./writerCore";

const toJson = (s: z.ZodType<unknown>) => ({ type: "json_schema", schema: z.toJSONSchema(s) });
const noSleep = { sleep: async () => {} };
const usage = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: 0, cacheWriteTokens: 0 });
const ok = (out: unknown, model = "claude-sonnet-5"): ITransportResult => ({ text: JSON.stringify(out), stopReason: "end_turn", usage: usage(1000, 500), model });

function memLedger(capMicro: number) {
	const holds = new Map<string, number>();
	const settled = new Map<string, number>();
	let spent = 0;
	const ledger: ILedger = {
		async hold(key, micro) {
			if (settled.has(key)) return { ok: false, message: "replay" };
			if (holds.has(key)) return { ok: true };
			if (spent + micro > capMicro) return { ok: false, message: "over cap" };
			holds.set(key, micro);
			spent += micro;
			return { ok: true };
		},
		async settle(key, actual) {
			if (!holds.has(key) || settled.has(key)) return;
			spent += actual - holds.get(key)!;
			settled.set(key, actual);
		},
	};
	return { ledger, spent: () => spent, settled };
}

const Schema = z.object({ answer: z.string() });
const req = { model: "claude-sonnet-5", system: ["skill"], user: "hi", schema: Schema, maxTokens: 1000 };

describe("gateway", () => {
	test("maps provider errors to retryable / non-retryable kinds", () => {
		expect(classify({ status: 429, message: "slow down" })).toMatchObject({ kind: "rate-limited", retryable: true });
		expect(classify({ status: 529 })).toMatchObject({ kind: "rate-limited", retryable: true });
		expect(classify({ status: 503 })).toMatchObject({ kind: "server", retryable: true });
		expect(classify({ name: "APIConnectionTimeoutError", message: "timed out" })).toMatchObject({ kind: "timeout", retryable: true });
		expect(classify({ status: 400, message: "bad" })).toMatchObject({ kind: "bad-request", retryable: false });
		expect(classify({ status: 401 })).toMatchObject({ kind: "auth", retryable: false });
		expect(classify(new TypeError("fetch failed"))).toMatchObject({ kind: "network", retryable: true });
	});
});

describe("cappedInference", () => {
	test("refuses over the cap without calling the model", async () => {
		const m = memLedger(10);
		let calls = 0;
		await expect(cappedInference(m.ledger, async () => (calls++, ok({ answer: "x" })), "k", req, toJson as never, noSleep)).rejects.toBeInstanceOf(CapError);
		expect(calls).toBe(0);
		expect(m.spent()).toBe(0);
	});

	test("settles the hold to the real cost once", async () => {
		const m = memLedger(1e9);
		const r = await cappedInference(m.ledger, async () => ok({ answer: "x" }), "k", req, toJson as never, noSleep);
		expect(r.output).toEqual({ answer: "x" });
		expect(r.costMicroUsd).toBe(costMicroUsd("claude-sonnet-5", usage(1000, 500)));
		expect(m.spent()).toBe(r.costMicroUsd);
		await m.ledger.settle("k", 999_999); // a second settle is a no-op
		expect(m.spent()).toBe(r.costMicroUsd);
	});

	test("retries retryable errors up to the bound, then releases the hold", async () => {
		const m = memLedger(1e9);
		let calls = 0;
		const flaky: TTransport = async () => {
			calls++;
			throw Object.assign(new Error("overloaded"), { status: 529 });
		};
		await expect(cappedInference(m.ledger, flaky, "k", req, toJson as never, { ...noSleep, maxAttempts: 3 })).rejects.toMatchObject({ kind: "rate-limited" });
		expect(calls).toBe(3);
		expect(m.spent()).toBe(0);
	});

	test("does not retry a bad request; an invalid output still pays for its tokens", async () => {
		const m = memLedger(1e9);
		let calls = 0;
		await expect(
			cappedInference(m.ledger, async () => (calls++, Promise.reject(Object.assign(new Error("bad"), { status: 400 }))), "a", req, toJson as never, noSleep),
		).rejects.toMatchObject({ kind: "bad-request" });
		expect(calls).toBe(1);
		await expect(cappedInference(m.ledger, async () => ok({ wrong: 1 }), "b", req, toJson as never, noSleep)).rejects.toMatchObject({ kind: "invalid-output" });
		expect(m.spent()).toBe(costMicroUsd("claude-sonnet-5", usage(1000, 500)));
	});

	test("a replayed key that already settled refuses instead of calling unmetered", async () => {
		const m = memLedger(1e9);
		await cappedInference(m.ledger, async () => ok({ answer: "x" }), "k", req, toJson as never, noSleep);
		await expect(cappedInference(m.ledger, async () => ok({ answer: "y" }), "k", req, toJson as never, noSleep)).rejects.toBeInstanceOf(CapError);
	});
});

describe("D7: retry same tier, then escalate", () => {
	test("invalid twice on workhorse → escalates to strongest and records it", async () => {
		const m = memLedger(1e9);
		const models: string[] = [];
		const t: TTransport = async (r) => {
			models.push(r.model);
			return r.model === "claude-opus-5-5" ? ok({ answer: "good" }, r.model) : ok({ nope: true }, r.model);
		};
		const r = await runAgentCall(m.ledger, t, "run1", { tier: "workhorse", escalated: false }, { system: ["s"], user: "u", schema: Schema, maxTokens: 1000 }, toJson as never, noSleep);
		expect(models).toEqual(["claude-sonnet-5", "claude-sonnet-5", "claude-opus-5-5"]);
		expect(r).toMatchObject({ tier: "strongest", escalated: true, output: { answer: "good" } });
		expect(r.totalMicroUsd).toBe(2 * costMicroUsd("claude-sonnet-5", usage(1000, 500)) + costMicroUsd("claude-opus-5-5", usage(1000, 500)));
		expect(m.spent()).toBe(r.totalMicroUsd);
	});

	test("the cap blocking the escalation fails the run with what it already spent", async () => {
		const sonnetHold = 3 * costMicroUsd("claude-sonnet-5", { inputTokens: Math.ceil(2 / 3), outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 });
		const m = memLedger(2 * sonnetHold);
		const t: TTransport = async (r) => ok({ nope: true }, r.model);
		const err = await runAgentCall(m.ledger, t, "run2", { tier: "workhorse", escalated: false }, { system: ["s"], user: "u", schema: Schema, maxTokens: 1000 }, toJson as never, noSleep).catch((e) => e);
		expect(err).toBeInstanceOf(AgentError);
		expect(err.message).toMatch(/escalation refused/);
		expect(err.billedMicroUsd).toBe(2 * costMicroUsd("claude-sonnet-5", usage(1000, 500)));
	});
});

describe("routing", () => {
	const routing = { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" } as const;
	test("writer: workhorse; pillar/money pages escalate to strongest; model ids only from MODELS", () => {
		expect(modelFor("blog-writing-agent", routing)).toEqual({ tier: "workhorse", model: "claude-sonnet-5", escalated: false });
		expect(modelFor("blog-writing-agent", routing, { pillar: true })).toMatchObject({ tier: "strongest", model: "claude-opus-5-5" });
		expect(modelFor("technical-seo-monitor", routing)).toMatchObject({ tier: "fast", model: "claude-haiku-4-5" });
		expect(modelFor("technical-seo-monitor", routing, { ambiguous: true })).toMatchObject({ tier: "workhorse", escalated: true });
	});
});

// ─── Writer golden fixture ───────────────────────────────────────────────────

const golden: TWriterOutput = {
	seoTitle: "Dental implants cost in Lagos: 2026 guide",
	metaDescription: "What dental implants cost in Lagos, what changes the price, and what to ask before you book.",
	blocks: [
		{ kind: "p", text: "Dental implants in Lagos usually cost between ₦1.2m and ₦2.5m per tooth, depending on the implant system and whether you need a bone graft." },
		{ kind: "h2", text: "What is a dental implant?" },
		{ kind: "p", text: "An implant is a titanium post placed in the jaw that holds a crown. 95% of implants last ten years or more." },
		{ kind: "h2", text: "What changes the price" },
		{ kind: "ul", text: "Implant brand\nBone grafting\nThe crown material" },
		{ kind: "h2", text: "FAQ" },
		{ kind: "faq", text: "Does it hurt?\nThe procedure is done under local anaesthetic." },
	],
	unsourcedClaims: [
		{ blockIndex: 0, claim: "between ₦1.2m and ₦2.5m per tooth" },
		{ blockIndex: 2, claim: "95% of implants last ten years or more" },
	],
	imageSheet: [
		{ name: "Hero", type: "hero", afterBlock: -1, alt: "A dentist explaining an implant model to a patient", prompt: "Warm clinic scene, no identifiable real person" },
		{ name: "Implant anatomy", type: "diagram", afterBlock: 2, alt: "Diagram of an implant post, abutment and crown", prompt: "Labelled cross-section: post, abutment, crown" },
	],
	informationGain: "Lagos price ranges by implant system",
};

describe("writer", () => {
	test("skill text is the harness SKILL.md verbatim (codegen), and the brief carries only this site's data", () => {
		expect(WRITER_SKILL.text).toMatch(/^---\nname: blog-writing-agent/);
		expect(WRITER_SKILL.sha256).toMatch(/^[a-f0-9]{64}$/);
		const p = writerUserPrompt({ siteName: "Lumen Dental", domain: "lumen.co", title: "dental implants cost", keyword: "dental implants cost", contentType: "guide", wordTarget: 1500, styleKeywords: [], heroProvider: "higgsfield", regulated: "health", internalLinks: [{ title: "veneers", url: "https://lumen.co/veneers" }] });
		expect(p).toContain("Regulated topic: health");
		expect(p).toContain("https://lumen.co/veneers");
		expect(p).not.toMatch(/sk-ant|secret/i);
	});

	test("golden: unsourced numbers become fact markers, a health post gets its disclaimer, slots get dims + filenames", () => {
		expect(WriterOutput.safeParse(golden).success).toBe(true);
		const d = toDraft(golden, { disclaimer: "This guide is general information, not medical advice." });
		expect(d.blocks.at(-1)).toEqual({ id: "b8", kind: "disclaimer", text: "This guide is general information, not medical advice." });
		expect(d.unsourcedClaims).toEqual([
			{ blockId: "b1", claim: "between ₦1.2m and ₦2.5m per tooth" },
			{ blockId: "b3", claim: "95% of implants last ten years or more" },
		]);
		expect(d.imageSheet.map((s) => [s.type, s.format, s.width, s.filenameSuffix, s.placement])).toEqual([
			["hero", "webp", 1600, "hero", "Top of post"],
			["diagram", "svg", 1200, "implant-anatomy", 'In "What is a dental implant?"'],
		]);
		expect(d.words).toBeGreaterThan(40);
		expect(d.seoTitle.length).toBeLessThanOrEqual(70);
	});

	test("revision keeps ids, renumbers new blocks, drops empties", () => {
		const r = toRevision({ seoTitle: "t", changeSummary: "x", blocks: [{ id: "b1", kind: "p", text: "kept" }, { id: "new", kind: "p", text: "added" }, { id: "b9", kind: "p", text: "unknown id" }, { id: "b2", kind: "p", text: " " }] }, [{ id: "b1" }, { id: "b2" }]);
		expect(r.blocks.map((b) => b.id)).toEqual(["b1", "b3", "b4"]);
	});
});
