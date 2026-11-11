// Handoff 06: path allowlist (the safety of every write), install state, webhook signatures, CI roll-up.
import { describe, expect, test } from "vitest";
import { rollUpCi, signState, verifyState, verifyWebhook } from "./github";
import { assertWritable, scopeError } from "./pathScope";

const scope = { contentDir: "content/blog", assetDir: "public/images/blog", indexFiles: ["public/sitemap.xml"] };

describe("assertWritable", () => {
	test("allows the post file, its assets and declared index files", () => {
		expect(assertWritable("content/blog/implants.mdx", scope)).toBe("content/blog/implants.mdx");
		expect(assertWritable("public/images/blog/implants-hero.webp", scope)).toBe("public/images/blog/implants-hero.webp");
		expect(assertWritable("public/sitemap.xml", scope)).toBe("public/sitemap.xml");
	});
	test.each([
		[".github/workflows/x.yml", /CI, config/],
		["package.json", /CI, config/],
		["content/blog/../../package.json", /traversal/],
		["../content/blog/x.mdx", /traversal/],
		["/etc/passwd", /absolute/],
		["content/blog-evil/x.mdx", /outside/],
		["content/blog", /outside/],
		["src/app/page.tsx", /outside/],
		["content/blog/next.config.js", /CI, config/],
		["content/blog/.env.local", /CI, config/],
	])("refuses %s", (p, why) => {
		expect(() => assertWritable(p, scope)).toThrow(why);
	});
	test("declared dirs must be real content dirs", () => {
		expect(scopeError("content/blog")).toBeNull();
		expect(scopeError("/")).toMatch(/inside the repo/);
		expect(scopeError(".github")).toMatch(/CI or config/);
		expect(scopeError("../x")).toMatch(/Traversal/);
	});
});

describe("install state + webhook signature", () => {
	test("a signed state round-trips; tampered or expired is refused", async () => {
		const s = await signState("k", { siteId: "s1", userId: "u1", exp: Date.now() + 60_000 });
		expect(await verifyState("k", s)).toMatchObject({ siteId: "s1", userId: "u1" });
		expect(await verifyState("other", s)).toBeNull();
		expect(await verifyState("k", s.replace(/^./, "x"))).toBeNull();
		const old = await signState("k", { siteId: "s1", userId: "u1", exp: Date.now() - 1 });
		expect(await verifyState("k", old)).toBeNull();
	});
	test("X-Hub-Signature-256 verifies the raw body only", async () => {
		const body = '{"action":"completed"}';
		const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("whsec"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
		const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
		expect(await verifyWebhook("whsec", body, `sha256=${sig}`)).toBe(true);
		expect(await verifyWebhook("whsec", `${body} `, `sha256=${sig}`)).toBe(false);
		expect(await verifyWebhook("whsec", body, null)).toBe(false);
	});
});

describe("rollUpCi", () => {
	const run = (status: string, conclusion: string | null, name = "build") => ({ status, conclusion, name });
	test("failure wins, then pending, then passing; nothing configured is none", () => {
		expect(rollUpCi([run("completed", "success"), run("completed", "failure", "lint")], [])).toEqual({ ci: "failing", detail: "Failing: lint" });
		expect(rollUpCi([run("completed", "success"), run("in_progress", null)], [])).toEqual({ ci: "pending" });
		expect(rollUpCi([run("completed", "success"), run("completed", "skipped")], [{ state: "success", context: "vercel" }])).toEqual({ ci: "passing" });
		expect(rollUpCi([], [{ state: "error", context: "vercel" }])).toMatchObject({ ci: "failing" });
		expect(rollUpCi([], [])).toEqual({ ci: "none" });
	});
});
