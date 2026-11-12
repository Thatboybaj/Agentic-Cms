// @vitest-environment edge-runtime
// Site discovery crawl (prd-site-discovery F5–F9) with Firecrawl and robots.txt faked: robots and limits shape the plan,
// pages are stored PII-stripped with their text in storage, failures are recorded as skipped, the crawl hold settles at
// the credits Firecrawl reports, and a re-run keeps an unchanged page's extract (F3).
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

const PAGES = {
	"https://baynor.qa/": { markdown: "# AI systems for Qatar\nWe connect your tools. Write to hello@baynor.qa", links: ["https://baynor.qa/services", "https://baynor.qa/private/x"], metadata: { title: "BAYNOR AI", url: "https://baynor.qa/", statusCode: 200 } },
	"https://baynor.qa/services": { markdown: "# Services\n## Customer support\nAnswers from approved information.", links: ["https://baynor.qa/"], metadata: { title: "Services", url: "https://baynor.qa/services", statusCode: 200 } },
	"https://baynor.qa/about": { markdown: "", metadata: { url: "https://baynor.qa/about", statusCode: 404, error: "Not found" } },
};

function fakeFirecrawl(credits = 3) {
	const calls: string[] = [];
	vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push(`${init?.method ?? "GET"} ${url}`);
		const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
		if (url === "https://baynor.qa/robots.txt") return new Response("User-agent: *\nDisallow: /private/\n", { status: 200 });
		if (url.endsWith("/v2/map")) return json({ success: true, links: [{ url: "https://baynor.qa/services" }, { url: "https://baynor.qa/about" }, { url: "https://baynor.qa/private/x" }, { url: "https://other.com/" }, { url: "https://baynor.qa/brochure.pdf" }] });
		if (url.endsWith("/v2/batch/scrape")) {
			const body = JSON.parse(String(init?.body)) as { urls: string[]; maxConcurrency: number };
			expect(body.maxConcurrency).toBe(1);
			expect(body.urls).toEqual(["https://baynor.qa/", "https://baynor.qa/services", "https://baynor.qa/about"]);
			return json({ success: true, id: "job-1", invalidURLs: [] });
		}
		if (url.endsWith("/v2/batch/scrape/job-1")) return json({ status: "completed", total: 3, completed: 2, creditsUsed: credits, next: null, data: Object.values(PAGES) });
		return new Response("unexpected", { status: 500 });
	});
	return calls;
}

beforeEach(() => {
	process.env.FIRECRAWL_API_KEY = "fc-test";
});
afterEach(() => {
	vi.unstubAllGlobals();
	delete process.env.FIRECRAWL_API_KEY;
});

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "baynor-ai", name: "BAYNOR AI", domain: "baynor.qa", industry: "AI", icon: "globe", status: "onboarding", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: true, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Asia/Qatar",
			discovery: { onAdd: true, maxPages: 3, depth: 3, exclude: ["/cart"], subdomains: false, competitorCheck: true, batchSize: 0 },
		});
		const runId = await ctx.db.insert("runs", { workspaceId: ws, siteId: site, kind: "site-discovery", trigger: "workflow", status: "running", agent: "Site discovery agent", agentId: "site-discovery-agent", model: "claude-sonnet-5", inputTokens: 0, outputTokens: 0, costUsd: 0, estimateUsd: 1.6, budget: "text", startedAt: 0, output: "", idempotencyKey: "d1", attempt: 1 });
		const reportId = await ctx.db.insert("discoveryReports", { siteId: site, runId, status: "running", stage: "seed", mode: "full", coverage: { crawled: 0, skipped: [], limitHit: false }, pillars: [], competitorNotes: [], refreshCandidates: [], ideaIds: [], dropped: [], costUsd: 0, createdAt: 0 });
		return { site, runId, reportId };
	});
	return { t, ...ids };
}

test("robots and limits shape the plan; pages are stored PII-stripped; failures are skipped; the hold settles", async () => {
	const { t, site, runId, reportId } = await world();
	fakeFirecrawl(3);
	const r = await t.action(internal.discovery.crawl.crawl, { siteId: site, runId, reportId });
	expect(r).toMatchObject({ done: true, pages: 3 });
	const pages = await t.run((ctx) => ctx.db.query("crawledPages").collect());
	expect(pages.map((p) => p.url).sort()).toEqual(["https://baynor.qa/", "https://baynor.qa/services"]);
	const home = pages.find((p) => p.url === "https://baynor.qa/")!;
	const text = await t.run(async (ctx) => (await ctx.storage.get(home.textStorageId!))!.text());
	expect(text).toContain("We connect your tools");
	expect(text).not.toContain("hello@baynor.qa");
	expect(home.internalLinks).toEqual(["https://baynor.qa/services", "https://baynor.qa/private/x"]);
	const report = (await t.run((ctx) => ctx.db.get(reportId)))!;
	expect(report.coverage.crawled).toBe(2);
	expect(report.coverage.limitHit).toBe(false);
	expect(report.coverage.skipped.map((s) => s.reason).sort()).toEqual(["error · 404", "non-html", "off-site", "robots"]);
	const run = (await t.run((ctx) => ctx.db.get(runId)))!;
	expect(run.progress).toEqual({ pagesTotal: 3, pagesCrawled: 2, pagesSkipped: 4 });
	expect(run.costUsd).toBe(0.01); // (3 pages + 1 map) × $0.0025
	const s = (await t.run((ctx) => ctx.db.get(site)))!;
	expect(s.spend.textMicroUsd).toBe(10_000);
});

test("a re-run keeps an unchanged page's extract and doesn't keep a second copy of its text", async () => {
	const { t, site, runId, reportId } = await world();
	fakeFirecrawl();
	await t.action(internal.discovery.crawl.crawl, { siteId: site, runId, reportId });
	await t.run(async (ctx) => {
		const p = (await ctx.db.query("crawledPages").collect()).find((x) => x.url === "https://baynor.qa/services")!;
		await ctx.db.patch(p._id, { extract: { topic: "Services", entities: [], funnel: "consideration", refreshCandidate: false, hash: p.hash }, type: "service" });
	});
	const run2 = await t.run(async (ctx) => ctx.db.insert("runs", { ...(await ctx.db.get(runId))!, _id: undefined, _creationTime: undefined, idempotencyKey: "d2" } as never));
	fakeFirecrawl();
	await t.action(internal.discovery.crawl.crawl, { siteId: site, runId: run2, reportId });
	const services = (await t.run((ctx) => ctx.db.query("crawledPages").collect())).filter((x) => x.url === "https://baynor.qa/services");
	expect(services).toHaveLength(1);
	expect(services[0]!.extract?.topic).toBe("Services");
	expect(services[0]!.type).toBe("service");
	const blobs = await t.run((ctx) => ctx.db.system.query("_storage").collect());
	expect(blobs).toHaveLength(2); // one text per page, not one per crawl
});

test("a domain whose robots.txt disallows everything stops before spending anything", async () => {
	const { t, site, runId, reportId } = await world();
	vi.stubGlobal("fetch", async (input: string | URL) => (String(input).endsWith("/robots.txt") ? new Response("User-agent: *\nDisallow: /", { status: 200 }) : new Response("no", { status: 500 })));
	const r = await t.action(internal.discovery.crawl.crawl, { siteId: site, runId, reportId });
	expect(r.stop?.reason).toBe("robots-blocked");
	expect((await t.run((ctx) => ctx.db.get(site)))!.spend.textMicroUsd).toBe(0);
});

test("without a Firecrawl key the run stops with a setup message", async () => {
	const { t, site, runId, reportId } = await world();
	delete process.env.FIRECRAWL_API_KEY;
	vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
	const r = await t.action(internal.discovery.crawl.crawl, { siteId: site, runId, reportId });
	expect(r.stop).toMatchObject({ reason: "not-configured" });
	expect(r.stop!.message).toContain("FIRECRAWL_API_KEY");
});
