// Handoff 05 step 7: output serializers (golden-style checks) + the server bundle reader's safety rules.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { readBundle } from "../../convex/templatesNode";
import { serialize, type ISerializeInput } from "./serialize";

const post: ISerializeInput["post"] = {
	title: "how long do dental implants last",
	seoTitle: "How Long Do Dental Implants Last?",
	slug: "how-long-do-dental-implants-last",
	intent: "informational",
	metaDescription: "What lasts, what wears out, and how to make it last.",
	keyword: "how long do dental implants last",
	blocks: [
		{ id: "b1", kind: "p", text: "Implants are built to last." },
		{ id: "b2", kind: "h2", text: "What wears out?" },
		{ id: "b3", kind: "p", text: "The crown wears before the post." },
		{ id: "b4", kind: "ul", text: "Brush\nFloss" },
		{ id: "b5", kind: "faq", text: "Does it hurt?\nNot usually." },
		{ id: "b6", kind: "disclaimer", text: "General information <not> advice." },
	],
};
const slots: ISerializeInput["slots"] = [
	{ name: "Hero", filename: "implants-hero.webp", alt: "A smile", placement: "Top of post", type: "hero", width: 1600, height: 900 },
	{ name: "Anatomy", filename: "implants-anatomy.svg", alt: "Post, abutment, crown", placement: 'In "What wears out?"', type: "diagram", width: 1200, height: 800 },
];
const base = { post, slots, html: "<html><body>rendered</body></html>", assetPath: "/images/blog", publishedAt: "2026-11-11T00:00:00.000Z", url: "https://lumen.co/blog/x" };

describe("serialize", () => {
	it("html passes the rendered template document through unchanged", () => {
		expect(serialize({ ...base, output: "html" })).toEqual({ ext: "html", content: base.html });
	});

	it("mdx: front-matter, markdown body, FAQ as H3, images placed in their section, disclaimer escaped", () => {
		const { ext, content } = serialize({ ...base, output: "mdx" });
		expect(ext).toBe("mdx");
		expect(content.startsWith('---\ntitle: "How Long Do Dental Implants Last?"\ndescription: "What lasts, what wears out, and how to make it last."')).toBe(true);
		expect(content).toContain('image: "/images/blog/implants-hero.webp"');
		expect(content).toContain("## What wears out?\n\nThe crown wears before the post.\n\n![Post, abutment, crown](/images/blog/implants-anatomy.svg)");
		expect(content).toContain("- Brush\n- Floss");
		expect(content).toContain("### Does it hurt?\n\nNot usually.");
		expect(content).toContain("<small>General information &lt;not> advice.</small>");
		expect(serialize({ ...base, output: "mdx" }).content).toBe(content); // stable across runs
	});

	it("json: typed blocks, list items, FAQ parts, images", () => {
		const doc = JSON.parse(serialize({ ...base, output: "json" }).content);
		expect(doc).toMatchObject({ slug: post.slug, description: post.metaDescription, image: { src: "/images/blog/implants-hero.webp" } });
		expect(doc.blocks[3]).toEqual({ kind: "ul", items: ["Brush", "Floss"] });
		expect(doc.blocks[4]).toEqual({ kind: "faq", q: "Does it hurt?", a: "Not usually." });
		expect(doc.images).toHaveLength(2);
	});

	it("component output is refused", () => {
		expect(() => serialize({ ...base, output: "component" })).toThrow(/isn't supported/);
	});
});

describe("server bundle reader", () => {
	const template = readFileSync(join(__dirname, "..", "..", "public", "demo-templates", "lumen", "post.html"));

	it("parses a single .html upload into mappings", () => {
		const r = readBundle("html", "post.html", new Uint8Array(template));
		expect(r.samplePath).toBe("post.html");
		expect(r.mappings.some((m) => m.role === "content-region")).toBe(true);
	});

	it("skips traversal paths and non-template files inside a zip", () => {
		const zip = zipSync({ "blog/post.html": new Uint8Array(template), "../evil.html": strToU8("<p>x</p>"), "css/site.css": strToU8("body{}"), "notes.txt": strToU8("x") });
		const r = readBundle("zip", "site.zip", zip);
		expect(r.files.map((f) => f.path).sort()).toEqual(["blog/post.html", "css/site.css"]);
		expect(r.skipped).toBe(1);
	});

	it("refuses an upload with no HTML", () => {
		expect(() => readBundle("zip", "x.zip", zipSync({ "a.css": strToU8("x") }))).toThrow(/No HTML file/);
	});
});

describe("servedPath", async () => {
	const { servedPath } = await import("./render");
	it("drops the static web root folder from URLs", () => {
		expect(servedPath("public/images/blog")).toBe("/images/blog");
		expect(servedPath("dist/assets/blog/")).toBe("/assets/blog");
		expect(servedPath("static/img")).toBe("/img");
		expect(servedPath("images/blog")).toBe("/images/blog");
		expect(servedPath("distribution/x")).toBe("/distribution/x");
		expect(servedPath("dist")).toBe("/");
	});
});
