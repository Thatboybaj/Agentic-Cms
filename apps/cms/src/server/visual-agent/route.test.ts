import { describe, expect, it } from "vitest";
import { availableOverrides, chooseRoute, needOf, onlyWebSources, planRoutes } from "./route";
import type { IAgentConnection, TAgentSlot } from "./types";

const slot = (p: Partial<TAgentSlot>): TAgentSlot => ({
	id: "s1",
	name: "Hero",
	type: "hero",
	placement: "Top of post",
	width: 1600,
	height: 900,
	alt: "Clear aligner trays on a counter",
	prompt: "Clear aligner trays on a warm ivory counter, no people.",
	styleKeywords: [],
	provider: "higgsfield",
	model: "higgsfield-preset",
	...p,
});
const conn = (provider: IAgentConnection["provider"], p: Partial<IAgentConnection> = {}): IAgentConnection => ({
	id: `c-${provider}`,
	provider,
	label: provider,
	enabled: true,
	status: "ok",
	hasSecret: true,
	usedFor: [],
	...(provider.endsWith("mcp") ? { toolName: "generate_image" } : {}),
	...p,
});
const openverse = conn("openverse", { hasSecret: false, status: "untested" });

describe("chooseRoute — harness routing table", () => {
	it("brand imagery → Higgsfield MCP preferred over an image API", () => {
		const d = chooseRoute(slot({}), [conn("openai-images", { model: "gpt-image-1" }), conn("custom-mcp"), conn("higgsfield-mcp"), openverse]);
		expect(d.route).toBe("generate-mcp");
		expect(d.connectionId).toBe("c-higgsfield-mcp");
		expect(d.label).toMatch(/^Will generate with higgsfield-mcp MCP/);
	});

	it("brand imagery falls through MCP → image API → licensed source → hold", () => {
		expect(chooseRoute(slot({}), [conn("fal"), openverse]).route).toBe("generate-api");
		expect(chooseRoute(slot({}), [openverse]).route).toBe("source");
		expect(chooseRoute(slot({}), []).route).toBe("hold");
	});

	it("an MCP without a chosen tool, a failed test, a disabled connection or a missing required key is skipped", () => {
		const cs = [conn("higgsfield-mcp", { toolName: undefined }), conn("custom-mcp", { status: "failed" }), conn("openai-images", { enabled: false }), conn("fal", { hasSecret: false }), openverse];
		expect(chooseRoute(slot({}), cs).route).toBe("source");
	});

	it("text-in-image → OpenAI first, diagram as the fallback", () => {
		const s = slot({ type: "lifestyle", prompt: "Labelled graphic with legible text: three payment options" });
		expect(needOf(s)).toBe("text_in_image");
		const plan = planRoutes(s, [conn("fal"), conn("openai-images")]);
		expect(plan[0]).toMatchObject({ route: "generate-api", connectionId: "c-openai-images" });
		expect(plan.map((d) => d.route)).toContain("diagram");
		expect(chooseRoute(s, []).route).toBe("diagram");
	});

	it("volume (open-source routed) prefers fal/replicate", () => {
		const s = slot({ type: "lifestyle", provider: "open-source", model: "flux-dev" });
		expect(chooseRoute(s, [conn("higgsfield-mcp"), conn("replicate")]).connectionId).toBe("c-replicate");
	});

	it("diagram slots draw SVG (Qwen when connected), never call an image provider", () => {
		const s = slot({ type: "diagram", provider: "openai" });
		expect(chooseRoute(s, [conn("openai-images")])).toMatchObject({ route: "diagram", provider: "svg-template", estimateUsd: 0 });
		expect(chooseRoute(s, [conn("qwen")])).toMatchObject({ route: "diagram", provider: "qwen-svg", connectionId: "c-qwen" });
	});

	it("charts are inline SVG, never generated, even with generators connected", () => {
		const d = chooseRoute(slot({ type: "chart", provider: "inline-svg" }), [conn("higgsfield-mcp"), conn("openai-images")]);
		expect(d.route).toBe("chart-svg");
		expect(availableOverrides(slot({ type: "chart" }), [conn("higgsfield-mcp")])).toEqual([]);
	});

	it("photos and real-world subjects are sourced, never generated; with no source they hold", () => {
		const s = slot({ type: "photo", provider: "human", alt: "Reception desk at the clinic" });
		expect(chooseRoute(s, [conn("higgsfield-mcp"), openverse])).toMatchObject({ route: "source", connectionId: "c-openverse" });
		expect(chooseRoute(s, [conn("higgsfield-mcp")]).route).toBe("hold");
		expect(availableOverrides(s, [conn("higgsfield-mcp"), openverse])).not.toContain("generate");
	});

	it("a person's human-only pin holds the slot", () => {
		expect(chooseRoute(slot({ humanPinned: true }), [conn("higgsfield-mcp")]).route).toBe("hold");
	});

	it("sources go Openverse → Wikimedia → stock API, and every plan ends in hold", () => {
		const plan = planRoutes(slot({ type: "photo" }), [conn("pexels"), conn("wikimedia", { hasSecret: false }), openverse]);
		expect(plan.map((d) => d.provider)).toEqual(["openverse", "wikimedia", "pexels", undefined]);
		expect(plan.at(-1)?.route).toBe("hold");
	});

	it("overrides force a route family; generate over cap is priced", () => {
		const cs = [conn("higgsfield-mcp"), openverse];
		expect(chooseRoute(slot({}), cs, undefined, "diagram").route).toBe("diagram");
		expect(chooseRoute(slot({}), cs, undefined, "source").route).toBe("source");
		const g = chooseRoute(slot({ type: "diagram" }), cs, undefined, "generate");
		expect(g.route).toBe("generate-mcp");
		expect(g.estimateUsd).toBeGreaterThan(0);
	});

	it("onlyWebSources drives the connect-a-generator callout", () => {
		expect(onlyWebSources([openverse])).toBe(true);
		expect(onlyWebSources([openverse, conn("fal")])).toBe(false);
		expect(onlyWebSources([])).toBe(false);
	});
});
