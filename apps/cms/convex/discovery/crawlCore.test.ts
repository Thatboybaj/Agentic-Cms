import { describe, expect, it } from "vitest";
import { contentHash, normalizeUrl, parseRobots, planCrawl, robotsAllows, skipReason, stripPii, structuredData, toPageRow } from "./crawlCore";

const ROBOTS = `
# comment
User-agent: Googlebot
Disallow: /nope

User-agent: *
Disallow: /private/
Disallow: /*.pdf$
Allow: /private/press
Crawl-delay: 2

Sitemap: https://example.com/sitemap.xml
`;

describe("robots.txt", () => {
	const r = parseRobots(ROBOTS);
	it("uses the * group for our agent and keeps every sitemap", () => {
		expect(r.disallow).toEqual(["/private/", "/*.pdf$"]);
		expect(r.crawlDelaySec).toBe(2);
		expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
	});
	it("longest rule wins, allow wins ties, wildcards and anchors work", () => {
		expect(robotsAllows(r, "/private/x")).toBe(false);
		expect(robotsAllows(r, "/private/press/2026")).toBe(true);
		expect(robotsAllows(r, "/files/a.pdf")).toBe(false);
		expect(robotsAllows(r, "/files/a.pdf?x=1")).toBe(true); // "$" anchors the end
		expect(robotsAllows(r, "/nope")).toBe(true); // that rule is Googlebot's only
		expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/anything")).toBe(false);
		expect(robotsAllows(parseRobots(""), "/anything")).toBe(true);
	});
});

describe("scope and order", () => {
	const rules = { domain: "baynor.qa", subdomains: false, exclude: ["/cart", "?"], depth: 3, robots: parseRobots("User-agent: *\nDisallow: /admin") };
	it("normalizes URLs for dedupe", () => {
		expect(normalizeUrl("http://WWW.Baynor.qa/services/#x")).toBe("https://baynor.qa/services");
		expect(normalizeUrl("/ar/index.html", "https://baynor.qa/")).toBe("https://baynor.qa/ar");
		expect(normalizeUrl("mailto:a@b.co")).toBeNull();
	});
	it("says why a URL is skipped", () => {
		expect(skipReason("https://other.com/x", rules)).toBe("off-site");
		expect(skipReason("https://blog.baynor.qa/x", rules)).toBe("off-site");
		expect(skipReason("https://blog.baynor.qa/x", { ...rules, subdomains: true })).toBeNull();
		expect(skipReason("https://baynor.qa/brochure.pdf", rules)).toBe("non-html");
		expect(skipReason("https://baynor.qa/cart/1", rules)).toBe("excluded");
		expect(skipReason("https://baynor.qa/services?ref=x", rules)).toBe("excluded");
		expect(skipReason("https://baynor.qa/a/b/c/d", rules)).toBe("depth");
		expect(skipReason("https://baynor.qa/admin/x", rules)).toBe("robots");
		expect(skipReason("https://baynor.qa/about", rules)).toBeNull();
	});
	it("crawls the home page first, shallow before deep, and records the limit", () => {
		const plan = planCrawl(["https://baynor.qa/a/b", "https://baynor.qa/services", "https://baynor.qa/services/", "https://other.com/", "https://baynor.qa/about"], "https://baynor.qa/", rules, 3);
		expect(plan.urls).toEqual(["https://baynor.qa/", "https://baynor.qa/services", "https://baynor.qa/about"]);
		expect(plan.limitHit).toBe(true);
		expect(plan.skipped).toEqual([
			{ url: "https://other.com/", reason: "off-site" },
			{ url: "https://baynor.qa/a/b", reason: "limit" },
		]);
	});
});

describe("PII and page rows", () => {
	it("strips emails, phone numbers and form fields, keeps ordinary numbers", () => {
		const out = stripPii("Email [us](mailto:hi@baynor.qa) or hi@baynor.qa, call +974 4412 3456. Founded 2026, 150 staff.\n<input type=\"email\" name=\"e\">");
		expect(out).not.toMatch(/baynor\.qa|4412|<input/);
		expect(out).toContain("Founded 2026, 150 staff.");
	});
	it("reads JSON-LD types, dates and the canonical link", () => {
		const html = `<link rel="canonical" href="https://baynor.qa/blog/x"><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"BlogPosting","datePublished":"2026-01-02"},{"@type":["Organization","LocalBusiness"]}]}</script>`;
		expect(structuredData(html)).toEqual({ types: ["BlogPosting", "Organization", "LocalBusiness"], published: "2026-01-02", canonical: "https://baynor.qa/blog/x" });
	});
	it("turns a scraped page into a row with an outline and internal links only", async () => {
		const row = toPageRow({ markdown: "# AI systems\nWe build them. Write to x@y.co\n## Finance\nText ![img](a.png)", links: ["https://baynor.qa/about", "https://www.baynor.qa/services#top", "https://twitter.com/x", "/brochure.pdf"], metadata: { title: "Services | Baynor", url: "https://baynor.qa/services", statusCode: 200 } }, "baynor.qa");
		expect(row).toMatchObject({ url: "https://baynor.qa/services", title: "Services | Baynor", outline: [{ level: 1, text: "AI systems" }, { level: 2, text: "Finance" }], internalLinks: ["https://baynor.qa/about"] });
		expect(row!.text).not.toContain("x@y.co");
		expect(row!.text).not.toContain("a.png");
		expect(await contentHash(row!)).toBe(await contentHash({ title: row!.title, text: row!.text }));
	});
});

describe("internal links come from the page's anchors, not just the main content", () => {
	it("reads navigation links from the raw HTML and drops self, off-site and file links", () => {
		const rawHtml = `<nav><a href="/">Home</a><a class="x" href="https://baynor.qa/about">About</a><a href="/ar/services">AR</a><a href="#main">Skip</a></nav><a href="https://calendly.com/x">Book</a><a href="/brochure.pdf">PDF</a><a href="/services">Self</a>`;
		const row = toPageRow({ markdown: "# Services\nText", links: ["https://baynor.qa/services#main"], rawHtml, metadata: { title: "Services", url: "https://baynor.qa/services", statusCode: 200 } }, "baynor.qa");
		expect(row!.internalLinks.sort()).toEqual(["https://baynor.qa/", "https://baynor.qa/about", "https://baynor.qa/ar/services"]);
	});
});
