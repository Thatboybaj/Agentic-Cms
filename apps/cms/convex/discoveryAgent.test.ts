// @vitest-environment edge-runtime
// Site discovery persistence and start rules (prd-site-discovery F1–F4, F13–F21) without a live model: the plan writes
// new pillars and keywords only (with evidence, GSC source, the covering page, difficulty from who ranks), ideas enter
// as Idea posts from Site discovery with their evidence, angle and links (and a replay makes no duplicates), finishing
// tells the people who approve ideas, and discovery won't start when agents or Firecrawl aren't set up.
import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

// Eager modules + preloaded components, as in pipeline.test.ts (workflow handlers run with `process` hidden).
const eager = import.meta.glob(["./**/*.*s", "!./convex.config.ts", "!./**/*.test.ts"], { eager: true });
const modules = Object.fromEntries(Object.entries(eager).map(([k, m]) => [k, async () => m]));
type TModules = Record<string, () => Promise<unknown>>;
const preload = async (mods: TModules): Promise<TModules> => {
	const loaded = await Promise.all(Object.entries(mods).map(async ([k, f]) => [k, /(convex.config|.test).ts$/.test(k) ? null : await f()] as const));
	return Object.fromEntries(loaded.map(([k, m]) => [k, m === null ? mods[k]! : async () => m]));
};
async function setup() {
	const t = convexTest(schema, modules);
	const calls: [string, unknown, TModules][] = [];
	const register = t.registerComponent.bind(t);
	(t as unknown as { registerComponent: (n: string, s: unknown, m: TModules) => void }).registerComponent = (n, s, m) => void calls.push([n, s, m]);
	workflowTest.register(t, "workflow");
	(t as unknown as { registerComponent: typeof register }).registerComponent = register;
	for (const [n, s, m] of calls) register(n, s as Parameters<typeof register>[1], await preload(m));
	return t;
}

afterEach(() => {
	delete process.env.CMS_AGENTS;
	delete process.env.FIRECRAWL_API_KEY;
});

async function world() {
	const t = await setup();
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const owner = await ctx.db.insert("users", { clerkUserId: "o", tokenIdentifier: "x|o", name: "Amaka E.", initials: "AE", email: "o@x.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "baynor-ai", name: "BAYNOR AI", domain: "baynor.qa", industry: "AI", icon: "globe", status: "onboarding", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: new Date().toISOString().slice(0, 7), textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: true, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Asia/Qatar",
		});
		const runId = await ctx.db.insert("runs", { workspaceId: ws, siteId: site, kind: "site-discovery", trigger: "workflow", status: "running", agent: "Site discovery agent", agentId: "site-discovery-agent", model: "claude-sonnet-5", inputTokens: 0, outputTokens: 0, costUsd: 0.42, estimateUsd: 1.6, budget: "text", startedAt: 0, output: "", idempotencyKey: "d1", attempt: 1 });
		const reportId = await ctx.db.insert("discoveryReports", { siteId: site, runId, status: "running", stage: "keywords", mode: "full", coverage: { crawled: 6, skipped: [], limitHit: false }, pillars: [], competitorNotes: [], refreshCandidates: [], ideaIds: [], dropped: [], costUsd: 0, createdAt: 0 });
		const page = await ctx.db.insert("crawledPages", { siteId: site, url: "https://baynor.qa/services", status: 200, type: "service", title: "Services", outline: [], wordCount: 417, schemaTypes: [], internalLinks: [], hash: "h", lastCrawledAt: 0, runId, extract: { topic: "AI automation services", entities: [], funnel: "consideration", refreshCandidate: true, refreshReason: "Thin", hash: "h" } });
		return { ws, owner, site, runId, reportId, page };
	});
	return { t, ...ids };
}

const PILLARS = [
	{
		name: "Customer support automation",
		why: "Offered on the services page",
		evidence: ["https://baynor.qa/services"],
		keywords: [
			{ term: "ai customer support qatar", intent: "commercial", funnel: "consideration", volumeTier: "medium", volumeSource: "estimate", impressions: 0, position: null, quickWin: false, evidence: ["https://baynor.qa/services"] },
			{ term: "ai automation services qatar", intent: "commercial", funnel: "decision", volumeTier: "medium", volumeSource: "gsc", impressions: 140, position: 11.4, quickWin: true, existingPageUrl: "https://baynor.qa/services", evidence: ["gsc:ai automation services qatar"] },
		],
	},
];

test("the plan adds new pillars and keywords with evidence, source, covering page and difficulty; the report shows it", async () => {
	const { t, site, reportId, page } = await world();
	await t.mutation(internal.discovery.agentData.savePlan, { siteId: site, reportId, pillars: PILLARS, competitorNotes: [{ keyword: "ai customer support qatar", ranking: ["https://reddit.com/r/x"], difficulty: "low" }], dropped: ["whatsapp: no evidence"] });
	await t.mutation(internal.discovery.agentData.savePlan, { siteId: site, reportId, pillars: PILLARS, competitorNotes: [], dropped: [] }); // a re-run never duplicates
	const kws = await t.run((ctx) => ctx.db.query("keywords").collect());
	expect(kws).toHaveLength(2);
	expect(kws.find((k) => k.term === "ai customer support qatar")).toMatchObject({ volumeSource: "estimate", volumeTier: "medium", difficulty: 15, difficultyEvidence: "low · from who ranks (site discovery)", evidence: ["https://baynor.qa/services"] });
	expect(kws.find((k) => k.term === "ai automation services qatar")).toMatchObject({ volumeSource: "gsc", impressions: 140, position: 11.4, quickWin: true, existingPageId: page, rankingUrl: "/services" });
	expect(await t.run((ctx) => ctx.db.query("pillars").collect())).toHaveLength(1);
	const report = (await t.run((ctx) => ctx.db.get(reportId)))!;
	expect(report.pillars[0]!.keywords.map((k) => k.volume)).toEqual(["medium (estimated)", "140 impressions"]);
	expect(report.refreshCandidates).toEqual([{ url: "https://baynor.qa/services", reason: "Thin" }]);
	expect(report.dropped).toEqual(["whatsapp: no evidence"]);
});

test("ideas enter the plan as Idea posts from Site discovery, pillar pages on the strong model; a replay adds nothing", async () => {
	const { t, site, runId, reportId } = await world();
	await t.mutation(internal.discovery.agentData.savePlan, { siteId: site, reportId, pillars: PILLARS, competitorNotes: [], dropped: [] });
	const idea = { title: "AI customer support in Qatar: a practical guide", keyword: "ai customer support qatar", secondaryKeywords: ["whatsapp support"], intent: "commercial", pillar: "Customer support automation", contentType: "guide" as const, weekOffset: 2, internalLinks: ["https://baynor.qa/services"], angle: "Approved answers, human handover.", evidence: ["https://baynor.qa/services"], quickWin: false };
	const pillarIdea = { ...idea, title: "Customer support automation: the complete guide", keyword: "customer support automation", contentType: "pillar" as const, weekOffset: 1 };
	const ids = await t.mutation(internal.discovery.agentData.saveIdeas, { siteId: site, runId, reportId, ideas: [pillarIdea, idea], dropped: [] });
	expect(await t.mutation(internal.discovery.agentData.saveIdeas, { siteId: site, runId, reportId, ideas: [pillarIdea, idea], dropped: [] })).toEqual(ids);
	const posts = await t.run((ctx) => ctx.db.query("posts").collect());
	expect(posts).toHaveLength(2);
	const guide = posts.find((p) => p.contentType === "guide")!;
	expect(guide).toMatchObject({ state: "idea", source: "site-discovery", ideaStatus: "pending", strongModel: false, angle: "Approved answers, human handover.", internalLinkTargets: ["https://baynor.qa/services"], discoveryEvidence: ["https://baynor.qa/services"], secondaryKeywords: ["whatsapp support"], discoveryRunId: runId, wordTarget: 1500 });
	expect(posts.find((p) => p.contentType === "pillar")).toMatchObject({ strongModel: true, wordTarget: 2500 });
	expect(guide.week - posts.find((p) => p.contentType === "pillar")!.week).toBe(1);
	expect((await t.run((ctx) => ctx.db.query("pillars").collect()))[0]!.plannedPosts).toBe(2);
});

test("finishing settles the run and report once and tells the people who approve ideas", async () => {
	const { t, site, runId, reportId, owner } = await world();
	await t.run((ctx) => ctx.db.patch(reportId, { ideaIds: [] }));
	await t.mutation(internal.discovery.agentData.savePlan, { siteId: site, reportId, pillars: PILLARS, competitorNotes: [], dropped: [] });
	await t.mutation(internal.discovery.agentData.saveIdeas, { siteId: site, runId, reportId, ideas: [{ title: "AI customer support in Qatar", keyword: "ai customer support qatar", secondaryKeywords: [], intent: "commercial", pillar: "Customer support automation", contentType: "guide", weekOffset: 1, internalLinks: [], angle: "a", evidence: ["https://baynor.qa/services"], quickWin: false }], dropped: [] });
	await t.mutation(internal.discovery.agentData.finish, { siteId: site, runId, reportId, status: "succeeded", output: "1 idea" });
	await t.mutation(internal.discovery.agentData.finish, { siteId: site, runId, reportId, status: "failed", output: "late" }); // ignored: already finished
	expect((await t.run((ctx) => ctx.db.get(runId)))!).toMatchObject({ status: "succeeded", stage: "finish" });
	expect((await t.run((ctx) => ctx.db.get(reportId)))!).toMatchObject({ status: "succeeded", costUsd: 0.42 });
	const n = await t.run((ctx) => ctx.db.query("notifications").collect());
	expect(n.map((x) => [x.userId, x.title])).toEqual([[owner, "1 idea from site discovery ready to approve"]]);
});

test("discovery doesn't start on add without live agents and a Firecrawl key, and runs one at a time", async () => {
	const { t, site } = await world();
	await t.run(async (ctx) => {
		for (const r of await ctx.db.query("runs").collect()) await ctx.db.patch(r._id, { status: "succeeded" });
	});
	const start = () =>
		t.run(async (ctx) => {
			const { startDiscovery } = await import("./discovery/run");
			return startDiscovery(ctx, (await ctx.db.get(site))!, { mode: "full", trigger: "manual" });
		});
	expect(await start()).toEqual({ ok: false, reason: "Live agents are off on this deployment" });
	process.env.CMS_AGENTS = "live";
	expect((await start()) as { reason: string }).toMatchObject({ ok: false, reason: expect.stringContaining("FIRECRAWL_API_KEY") });
	process.env.FIRECRAWL_API_KEY = "fc-test";
	expect((await start()).ok).toBe(true);
	expect(await start()).toEqual({ ok: false, reason: "Discovery is already running" });
	await t.run(async (ctx) => {
		for (const j of await ctx.db.system.query("_scheduled_functions").collect()) await ctx.scheduler.cancel(j._id);
	});
});
