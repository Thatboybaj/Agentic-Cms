import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { extractImages, mcpArgs, openAiSize } = await import("./generate");
const g = { prompt: "P", negative: "N", width: 1200, height: 800, n: 4 };

describe("openAiSize", () => {
	it("maps slot dims to the nearest supported size per model family", () => {
		expect(openAiSize("gpt-image-1", 1600, 900)).toBe("1536x1024");
		expect(openAiSize("gpt-image-1", 800, 1200)).toBe("1024x1536");
		expect(openAiSize("dall-e-3", 1600, 900)).toBe("1792x1024");
		expect(openAiSize("dall-e-2", 1600, 900)).toBe("1024x1024");
		expect(openAiSize("some-new-model", 1000, 1000)).toBe("1024x1024");
	});
});

describe("mcpArgs", () => {
	it("defaults to {prompt, width, height, n} without a schema", () => {
		expect(mcpArgs(undefined, g)).toEqual({ prompt: "P", width: 1200, height: 800, n: 4 });
	});
	it("maps into the tool's own field names and enums", () => {
		const schema = { type: "object", properties: { text: { type: "string" }, aspect_ratio: { type: "string", enum: ["1:1", "16:9", "3:2", "9:16"] }, num_images: { type: "integer" }, negative_prompt: { type: "string" } }, required: ["text"] };
		expect(mcpArgs(schema, g)).toEqual({ text: "P", aspect_ratio: "3:2", num_images: 4, negative_prompt: "N" });
		expect(mcpArgs({ properties: { prompt: { type: "string" }, size: { type: "string" } } }, g)).toEqual({ prompt: "P", size: "1200x800" });
	});
});

describe("extractImages", () => {
	it("reads image blocks, resource links, and URLs inside text/JSON", () => {
		const r = {
			content: [
				{ type: "image", data: "AAAA", mimeType: "image/webp" },
				{ type: "resource_link", uri: "https://cdn.example.com/a.png" },
				{ type: "text", text: JSON.stringify({ jobs: [{ results: { url: "https://cdn.example.com/b.jpg" } }] }) },
				{ type: "text", text: "Done: https://cdn.example.com/c.webp?sig=1 and a page https://example.com/page" },
			],
		};
		expect(extractImages(r)).toEqual(["data:image/webp;base64,AAAA", "https://cdn.example.com/a.png", "https://cdn.example.com/b.jpg", "https://cdn.example.com/c.webp?sig=1"]);
		expect(extractImages({ content: [{ type: "text", text: "queued job 123" }] })).toEqual([]);
	});
});
