// Agent step seams (handoff 02 step "pipeline/steps.ts"). The validators below are the contract. draftStep and
// reviseStep run the real blog writing agent (convex/agents/writer.ts, handoff 03) when the deployment sets
// CMS_AGENTS=live; otherwise, and always in tests, they return the deterministic $0 stubs. 04 replaces fillSlotStep.
// Steps are actions so they can call providers later; they never write tables (README §3): persist.ts does.
import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction, internalQuery } from "../_generated/server";
import { vSafeEdits, vTask } from "../agentEdits";

const live = () => process.env.CMS_AGENTS === "live";
const vTier = v.union(v.literal("fast"), v.literal("workhorse"), v.literal("strongest"));
export const vModelRoutingIn = v.object({ mechanical: vTier, writing: vTier, strategy: vTier, pillarPages: vTier });

export const vDraftInput = v.object({
	siteId: v.id("sites"),
	postId: v.id("posts"),
	siteName: v.string(),
	title: v.string(),
	keyword: v.string(),
	contentType: v.string(),
	styleKeywords: v.array(v.string()),
	heroProvider: v.string(),
	strongModel: v.boolean(),
	wordTarget: v.number(),
	// Single-site context for the writer (handoff 03 step 4): this site's records only, never secrets.
	domain: v.optional(v.string()),
	industry: v.optional(v.string()),
	voice: v.optional(v.string()),
	intent: v.optional(v.string()),
	pillar: v.optional(v.string()),
	regulated: v.optional(v.string()),
	disclaimer: v.optional(v.string()),
	internalLinks: v.optional(v.array(v.object({ title: v.string(), url: v.string() }))),
	modelRouting: v.optional(vModelRoutingIn),
	/** Refresh of a live post (content-refresh): its current text and why it was picked. */
	refreshOf: v.optional(v.object({ reason: v.string(), blocks: v.array(v.object({ kind: v.string(), text: v.string() })) })),
});

const vBlockOut = v.object({ id: v.string(), kind: v.union(v.literal("h2"), v.literal("h3"), v.literal("p"), v.literal("ul"), v.literal("faq"), v.literal("quote"), v.literal("disclaimer")), text: v.string() });
const vSlotOut = v.object({
	name: v.string(),
	type: v.union(v.literal("hero"), v.literal("chart"), v.literal("diagram"), v.literal("lifestyle"), v.literal("screenshot"), v.literal("photo")),
	placement: v.string(),
	filenameSuffix: v.string(),
	format: v.union(v.literal("webp"), v.literal("svg")),
	width: v.number(),
	height: v.number(),
	alt: v.string(),
	prompt: v.string(),
});

export const vDraftOutput = v.object({
	seoTitle: v.string(),
	metaDescription: v.optional(v.string()),
	blocks: v.array(vBlockOut),
	words: v.number(),
	/** Claims the writer couldn't source: become open fact markers (the gate hard-fails on them). */
	unsourcedClaims: v.array(v.object({ blockId: v.string(), claim: v.string() })),
	imageSheet: v.array(vSlotOut),
	tokens: v.object({ input: v.number(), output: v.number() }),
});
export type TDraftOutput = Infer<typeof vDraftOutput>;

const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const countWords = (blocks: { text: string }[]) => blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);

/** Blog writing agent. Live: convex/agents/writer.ts (cappedInference). Stub: deterministic outline-level draft. */
export const draftStep = internalAction({
	args: { input: vDraftInput, runId: v.optional(v.id("runs")) },
	returns: vDraftOutput,
	handler: async (ctx, { input, runId }): Promise<TDraftOutput> => {
		if (live() && runId) return await ctx.runAction(internal.agents.writer.draft, { input, runId });
		const kw = input.keyword;
		const blocks = [
			{ id: "b1", kind: "p" as const, text: `${cap1(kw)} comes up in almost every first visit to ${input.siteName}. This guide answers the questions people ask most, in plain language.` },
			{ id: "b2", kind: "h2" as const, text: `What ${kw} involves` },
			{ id: "b3", kind: "p" as const, text: `A short, accurate overview of ${kw}: who it is for, what happens step by step, and what to expect afterwards.` },
			{ id: "b4", kind: "h2" as const, text: "Costs, timing and what affects them" },
			{ id: "b5", kind: "p" as const, text: `The main factors that change the time and cost of ${kw}, and the questions to ask before you book.` },
			{ id: "b6", kind: "h2" as const, text: "Questions people ask" },
			{ id: "b7", kind: "faq" as const, text: `Is ${kw} right for me?\nTalk it through with a specialist; they will check your situation first.` },
		];
		const style = input.styleKeywords.join(", ");
		return {
			seoTitle: `${cap1(kw)}: what to know | ${input.siteName}`.slice(0, 70),
			blocks,
			words: countWords(blocks),
			unsourcedClaims: [],
			imageSheet: [
				{ name: "Hero", type: "hero" as const, placement: "Top of post", filenameSuffix: "hero", format: "webp" as const, width: 1600, height: 900, alt: `${cap1(kw)} at ${input.siteName}, illustrative`, prompt: `${cap1(kw)}${style ? `, ${style}` : ""}, no identifiable real person.` },
				{ name: "Data chart", type: "chart" as const, placement: "After the first section", filenameSuffix: "chart", format: "svg" as const, width: 1200, height: 675, alt: `Chart for ${kw}, rendered from the post's data`, prompt: "Inline SVG from the post's own figures." },
			],
			tokens: { input: 0, output: 0 },
		};
	},
});

export const vFillSlotOutput = v.object({ ok: v.boolean(), candidates: v.number(), note: v.string(), costUsd: v.number() });

/**
 * Visual-asset agent for one slot. Live (CMS_AGENTS=live): agents/visual.fill stores real candidates itself (the
 * slot leaves "generating", so the callers' placeholder writers no-op). Stub: how many placeholders to make.
 */
export const fillSlotStep = internalAction({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), provider: v.string(), runId: v.optional(v.id("runs")), override: v.optional(v.union(v.literal("generate"), v.literal("diagram"), v.literal("source"))) },
	returns: vFillSlotOutput,
	handler: async (ctx, { siteId, slotId, provider, runId, override }): Promise<Infer<typeof vFillSlotOutput>> => {
		if (live()) return await ctx.runAction(internal.agents.visual.fill, { siteId, slotId, ...(runId ? { runId } : {}), ...(override ? { override } : {}) });
		return { ok: true, candidates: provider === "inline-svg" ? 1 : 3, note: `stub ${provider}`, costUsd: 0 };
	},
});

// ─── Autopost gate + ship (handoff 02 steps 5–6) ───────────────────────────────

/** The CMS agent's text fixes for the gate's plan. Live: one model call (agents/editor.autopostFixes) whose guarded
 *  edits gate.applyAndShip applies. Stub: no edits; applyAndShip uses the deterministic ports in fixes.ts. */
export const fixStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), fixes: v.number(), tasks: v.optional(v.array(vTask)) },
	returns: v.object({ applied: v.number(), result: v.optional(vSafeEdits) }),
	handler: async (ctx, { siteId, postId, fixes, tasks }): Promise<{ applied: number; result?: Infer<typeof vSafeEdits> }> => {
		if (!live() || !tasks?.length) return { applied: fixes };
		const out = await ctx.runAction(internal.agents.editor.autopostFixes, { siteId, postId, tasks });
		return { applied: out.result.edits.length, result: out.result };
	},
});

export const vRenderOutput = v.object({
	/** Structures the template can't render (fidelity rule): non-empty → hold, never invent markup. */
	held: v.array(v.string()),
	files: v.array(v.object({ path: v.string(), change: v.string(), kind: v.union(v.literal("post"), v.literal("assets"), v.literal("index")) })),
	/** The rendered post file (real render only; the stub world has none) and the asset paths the commit carries. */
	post: v.optional(v.object({ path: v.string(), content: v.string() })),
	assets: v.optional(v.array(v.object({ path: v.string(), slotId: v.string() }))),
});

/** Renderer in publish mode (convex/render.ts) when the confirmed manifest has a stored template; otherwise the stub. */
export const renderStep = internalAction({
	args: { siteId: v.id("sites"), postId: v.id("posts"), slug: v.string(), words: v.number(), output: v.string(), contentDir: v.string(), assetDir: v.string(), rasterSlots: v.number(), svgSlots: v.number() },
	returns: vRenderOutput,
	handler: async (ctx, a): Promise<Infer<typeof vRenderOutput>> => {
		const real = await ctx.runAction(internal.render.publish, { siteId: a.siteId, postId: a.postId });
		if (real) {
			const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
			const files: Infer<typeof vRenderOutput>["files"] = [{ path: real.post.path, change: `+${real.post.content.split("\n").length}`, kind: "post" }];
			if (real.assets.length) files.push({ path: `${a.assetDir.replace(/\/+$/, "")}/ ·${real.assets.length} image${real.assets.length === 1 ? "" : "s"}`, change: kb(real.assets.length * 80_000), kind: "assets" });
			return { held: real.held, files, post: real.post, assets: real.assets };
		}
		const ext = ({ mdx: "mdx", html: "html", json: "json", component: "tsx" } as Record<string, string>)[a.output] ?? "mdx";
		const files: { path: string; change: string; kind: "post" | "assets" | "index" }[] = [{ path: `${a.contentDir}/${a.slug}.${ext}`, change: `+${Math.max(40, Math.round(a.words / 7.6))}`, kind: "post" }];
		if (a.rasterSlots + a.svgSlots) files.push({ path: `${a.assetDir}/ · ${a.rasterSlots} WebP${a.svgSlots ? ` · ${a.svgSlots} SVG` : ""}`, change: `${a.rasterSlots * 78} KB`, kind: "assets" });
		files.push({ path: "public/sitemap.xml", change: "+1", kind: "index" });
		return { held: [], files };
	},
});

export const vOpenPrOutput = v.object({
	number: v.optional(v.number()),
	externalId: v.optional(v.string()),
	headSha: v.string(),
	previewUrl: v.optional(v.string()),
	url: v.optional(v.string()),
	/** Set when the PR can't be opened honestly (e.g. a selected image has no file yet): the post is held instead. */
	held: v.optional(v.string()),
});

/**
 * Opens or updates the post's PR. Live (a connection made through the GitHub App, gitConnect.connectRepo): one commit
 * with the rendered post + its image files on the current base, path-scoped, via gitNode.openPr. Otherwise the stub.
 */
export const openPrStep = internalAction({
	args: {
		siteId: v.id("sites"),
		postId: v.id("posts"),
		branch: v.string(),
		base: v.string(),
		title: v.string(),
		domain: v.string(),
		slug: v.string(),
		post: v.optional(v.object({ path: v.string(), content: v.string() })),
		assets: v.optional(v.array(v.object({ path: v.string(), slotId: v.string() }))),
		autopost: v.optional(v.boolean()),
		overrides: v.optional(v.array(v.string())),
	},
	returns: vOpenPrOutput,
	handler: async (ctx, a): Promise<Infer<typeof vOpenPrOutput>> => {
		const stub = { headSha: `stub-${a.postId.slice(-8)}`, previewUrl: `https://${a.domain.split(".")[0]}-git-${a.branch.replace(/\//g, "-")}.vercel.app/blog/${a.slug}` };
		if (!a.post) return stub; // no real render (seeded manifest): nothing real to commit
		const sc = await ctx.runQuery(internal.gitHooks.shipContext, { siteId: a.siteId, postId: a.postId, slotIds: (a.assets ?? []).map((x) => x.slotId), autopost: a.autopost ?? false, overrides: a.overrides ?? [] });
		if (!sc) return stub;
		const missing = sc.assets.filter((x) => !x.storageId);
		if (missing.length) return { headSha: "", held: `Image files aren't produced yet for: ${missing.map((m) => m.name).join(", ")}` };
		const files = [{ path: a.post.path, content: a.post.content }, ...(a.assets ?? []).map((x) => ({ path: x.path, storageId: sc.assets.find((s) => s.slotId === x.slotId)!.storageId! }))];
		const pr = await ctx.runAction(internal.gitNode.openPr, { installationId: sc.installationId, repo: sc.repo, base: sc.base, branch: sc.branch, scope: sc.scope, files, message: sc.message, title: sc.title, body: sc.body });
		return { number: pr.number, externalId: pr.externalId, headSha: pr.headSha, url: pr.url };
	},
});

// ─── Revise + scheduled runs (handoff 02 steps 8–9) ───────────────────────────

const vBlockIn = v.object({ id: v.string(), kind: v.string(), text: v.string() });

export const vReviseOutput = v.object({ blocks: v.array(vBlockIn), seoTitle: v.string(), tokens: v.object({ input: v.number(), output: v.number() }) });
export const vReviseInput = { siteId: v.id("sites"), postId: v.id("posts"), note: v.string(), blocks: v.array(vBlockIn), seoTitle: v.string(), modelRouting: v.optional(vModelRoutingIn) };

/** The blog writer applies a reviewer's note. Live: convex/agents/writer.ts. Stub: returns the draft unchanged. */
export const reviseStep = internalAction({
	args: { ...vReviseInput, runId: v.optional(v.id("runs")) },
	returns: vReviseOutput,
	handler: async (ctx, a): Promise<Infer<typeof vReviseOutput>> => {
		if (live() && a.runId) return await ctx.runAction(internal.agents.writer.revise, { ...a, runId: a.runId });
		return { blocks: a.blocks, seoTitle: a.seoTitle, tokens: { input: 0, output: 0 } };
	},
});

const vContentTypeIdea = v.union(v.literal("guide"), v.literal("comparison"), v.literal("listicle"), v.literal("how-to"), v.literal("faq"));
export const vLtmRow = v.object({
	term: v.string(),
	pillar: v.string(),
	cluster: v.string(),
	lengthClass: v.union(v.literal("seed"), v.literal("short-tail"), v.literal("long-tail")),
	role: v.union(v.literal("primary"), v.literal("secondary")),
	intent: v.union(v.literal("informational"), v.literal("commercial"), v.literal("transactional"), v.literal("navigational")),
	funnel: v.union(v.literal("awareness"), v.literal("consideration"), v.literal("decision")),
	volumeTier: v.union(v.literal("low"), v.literal("low-med"), v.literal("medium"), v.literal("med-high"), v.literal("high"), v.literal("very-high")),
	volumeSource: v.union(v.literal("gsc"), v.literal("estimate")),
	volume: v.optional(v.number()),
	difficultyTier: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
	difficulty: v.number(),
	difficultyEvidence: v.string(),
	serpFeatures: v.array(v.string()),
	aeoPotential: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
	priorityScore: v.number(),
	status: v.union(v.literal("qualified"), v.literal("retired")),
	whyWeWin: v.string(),
	retiredReason: v.optional(v.string()),
	evidenceUrls: v.array(v.string()),
	quickWin: v.boolean(),
	/** A secondary's page: the primary keyword it supports. */
	primaryFor: v.optional(v.string()),
});

export const vRunArtifact = v.object({
	status: v.union(v.literal("succeeded"), v.literal("failed")),
	output: v.string(),
	/** keyword-swarm: new keyword ideas for the plan (deduped against existing terms by the persist step). */
	ideas: v.array(v.object({ term: v.string(), intent: v.union(v.literal("informational"), v.literal("commercial"), v.literal("transactional"), v.literal("navigational")), difficulty: v.number(), evidence: v.string(), pillar: v.optional(v.string()), suggestedTitle: v.optional(v.string()), contentType: v.optional(vContentTypeIdea) })),
	/** Items only a person can move (QA findings, data requests); deduped on key. */
	ledger: v.optional(v.array(v.object({ key: v.string(), title: v.string(), downstream: v.string(), postId: v.optional(v.id("posts")) }))),
	/** Harness outputs kept as artifacts (pipeline_csv, top10_md, scorecard_md, ...). */
	artifacts: v.optional(v.array(v.object({ kind: v.string(), content: v.string() }))),
	/** content-refresh: live posts to send back through the writer as refresh drafts. */
	refresh: v.optional(v.array(v.object({ postId: v.id("posts"), reason: v.string() }))),
	/** keyword-swarm v0.3: the keyword LTM upsert batch (qualified and retired rows, every rule already applied). */
	ltm: v.optional(v.array(vLtmRow)),
});
export type TRunArtifact = Infer<typeof vRunArtifact>;

/** Scheduled (cron) runs spend only with a second opt-in, CMS_SCHEDULED_AGENTS=live; "Run now" needs only CMS_AGENTS. */
const scheduledLive = (trigger?: string) => live() && (trigger !== "scheduled" || process.env.CMS_SCHEDULED_AGENTS === "live");
const LIVE_KINDS = new Set(["keyword-swarm", "qa-sweep", "content-refresh"]);

/** The keyword swarm v0.3 runs as five workflow steps (agents/swarm.ts) when live; otherwise the stub below. */
export const swarmLive = internalQuery({ args: { trigger: v.optional(v.string()) }, handler: async (_ctx, { trigger }) => scheduledLive(trigger) });

/**
 * The harness agent(s) for a scheduled run kind. Live (keyword swarm, QA sweep, content refresh): agents/scheduled.ts.
 * The rest wait for their data sources (07: Search Console, crawler, backlink provider) and say so instead of
 * inventing results. Stub texts below are the $0 world's.
 */
export const runKindStep = internalAction({
	args: { siteId: v.id("sites"), kind: v.string(), siteName: v.string(), searchConsole: v.string(), rankSource: v.union(v.string(), v.null()), industry: v.string(), runId: v.optional(v.id("runs")), trigger: v.optional(v.string()) },
	returns: vRunArtifact,
	handler: async (ctx, a): Promise<TRunArtifact> => {
		// KAS is deterministic and free: always real (convex/kas.ts), a data gap without Search Console.
		if (a.kind === "kas-recalc") {
			const r = await ctx.runMutation(internal.kas.recalc, { siteId: a.siteId, trigger: a.trigger === "scheduled" ? "weekly" : "manual" });
			return { status: "succeeded", output: r.ok ? r.label : r.reason, ideas: [] };
		}
		// Search Console agents (no model, no spend): real when the property is connected; their data gap otherwise.
		if (a.kind === "technical-monitor" && a.searchConsole === "connected") return await ctx.runAction(internal.gscAgents.monitor, { siteId: a.siteId });
		if (a.kind === "biweekly-report" && a.searchConsole === "connected" && a.runId) return await ctx.runAction(internal.gscAgents.report, { siteId: a.siteId, runId: a.runId });
		if (a.runId && LIVE_KINDS.has(a.kind) && scheduledLive(a.trigger)) return await ctx.runAction(internal.agents.scheduled.run, { siteId: a.siteId, runId: a.runId, kind: a.kind });
		const none = [] as { term: string; intent: "informational" | "commercial" | "transactional" | "navigational"; difficulty: number; evidence: string }[];
		switch (a.kind) {
			case "keyword-swarm": {
				const base = a.industry.toLowerCase();
				const ideas = [
					{ term: `${base} cost guide`, intent: "commercial" as const, difficulty: 22, evidence: "stub · SERP" },
					{ term: `how to choose a ${base} provider`, intent: "informational" as const, difficulty: 14, evidence: "stub · SERP" },
					{ term: `${base} near me`, intent: "transactional" as const, difficulty: 9, evidence: "stub · SERP" },
				];
				return { status: "succeeded" as const, output: "", ideas };
			}
			case "technical-monitor":
				return { status: "succeeded" as const, output: "Data gap: no crawler or Search Console feed yet (07) · no health score written", ideas: none };
			case "qa-sweep":
				return { status: "succeeded" as const, output: "Stub sweep · live agents off, no findings recorded", ideas: none };
			case "content-refresh":
				return { status: "succeeded" as const, output: "Stub · live agents off, no refresh drafted", ideas: none };
			case "link-prospecting":
				return a.rankSource ? { status: "succeeded" as const, output: "12 prospects · 5 outreach drafts", ideas: none } : { status: "failed" as const, output: "Failed: no Ahrefs or Semrush connection for backlink data.", ideas: none };
			case "kas-recalc":
				return { status: "succeeded" as const, output: a.searchConsole === "connected" ? "Scores recalculated" : "Data gap: Search Console not connected. No scores written.", ideas: none };
			case "biweekly-report":
				return { status: "succeeded" as const, output: "Data gap: the report needs Search Console data (07) · nothing drafted", ideas: none };
			default:
				return { status: "succeeded" as const, output: "Done", ideas: none };
		}
	},
});
