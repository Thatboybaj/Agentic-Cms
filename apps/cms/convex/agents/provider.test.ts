import { PROVIDER_MODELS } from "@studio/seo-harness";
import { describe, expect, test } from "vitest";
import { priceOf } from "./pricing";
import { activeProvider } from "./provider";

describe("model provider switch", () => {
	test("defaults to qwen; CMS_MODEL_PROVIDER=anthropic switches", () => {
		expect(activeProvider({})).toBe("qwen");
		expect(activeProvider({ CMS_MODEL_PROVIDER: "Anthropic " })).toBe("anthropic");
		expect(activeProvider({ CMS_MODEL_PROVIDER: "openai" })).toBe("qwen");
		expect(activeProvider({ CMS_MODEL_PROVIDER: "gateway" })).toBe("gateway");
	});
	test("every model on both providers has a price", () => {
		for (const set of Object.values(PROVIDER_MODELS)) for (const id of Object.values(set)) expect(priceOf(id).inputPerM).toBeGreaterThan(0);
	});
});
