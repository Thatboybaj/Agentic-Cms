import { describe, expect, it } from "vitest";
import { aspectOf, buildPrompt, scrub } from "./prompt";
import type { TAgentSlot } from "./types";

const slot: TAgentSlot = {
	id: "s",
	name: "Hero",
	type: "hero",
	placement: "Top of post",
	width: 1600,
	height: 900,
	alt: "Aligners on a counter",
	prompt: "Clear aligner trays on a warm ivory counter beside a printed treatment plan.",
	styleKeywords: ["Brand: warm ivory, teal", "Natural light, candid"],
	provider: "higgsfield",
	model: "x",
};
const brand = { palette: ["F6F1E7", "#0f766e", "not-a-colour"], styleKeywords: ["No identifiable real people", "Calm"], avoid: ["stock-photo clichés"] };

describe("buildPrompt", () => {
	it("assembles subject → palette → style → format → guardrails", () => {
		const { prompt } = buildPrompt(slot, brand);
		const order = ["Clear aligner trays", "brand palette #F6F1E7, #0F766E", "style: warm ivory, teal, Natural light, candid, Calm", "aspect ratio 16:9", "Avoid:"].map((s) => prompt.indexOf(s));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(prompt).not.toContain("not-a-colour");
	});

	it("always carries the guardrail negatives, and no-text unless text-in-image", () => {
		const a = buildPrompt(slot, brand);
		expect(a.negative).toMatch(/no identifiable real people/);
		expect(a.negative).toMatch(/no watermarks/);
		expect(a.negative).toMatch(/no text or lettering/);
		expect(a.negative).toContain("stock-photo clichés");
		expect(buildPrompt(slot, brand, { textInImage: true }).negative).not.toMatch(/no text or lettering/);
	});

	it("never passes secrets or living-artist style requests through", () => {
		const dirty = { ...slot, prompt: "A calm clinic in the style of Some Living Painter, api_key=sk-live-abcdefgh12345678 Bearer abc.def.ghi" };
		const { prompt } = buildPrompt(dirty, brand);
		expect(prompt).not.toMatch(/sk-live|Bearer|api_key|style of|Painter/i);
		expect(scrub("token 0123456789abcdef0123456789abcdef end")).toBe("token end");
	});

	it("uses an edited prompt override when given", () => {
		expect(buildPrompt(slot, brand, { override: "Two aligner cases on teal" }).prompt.startsWith("Two aligner cases on teal")).toBe(true);
	});

	it("aspectOf snaps to common ratios", () => {
		expect(aspectOf(1600, 900)).toBe("16:9");
		expect(aspectOf(1200, 800)).toBe("3:2");
		expect(aspectOf(1200, 675)).toBe("16:9");
		expect(aspectOf(1000, 1000)).toBe("1:1");
	});
});
