// Dev-only seed (api-map §9 `devSeed.reset`; handoff 01 step "devSeed"). Refuses unless CMS_DEV_TOOLS=1 on the
// deployment, so it can never run on staging or prod. Loads the prototype's demo sites (src/lib/seed.ts) into the
// CALLER's active workspace, with schedules. People are not seeded: per-site roles need real Clerk users, so the
// caller (an owner/admin) is admin on every seeded site by the workspace-role rule. Posts, keywords etc. land in 02.
import { ConvexError } from "convex/values";
import { createSeed } from "../src/lib/seed";
import type { Id } from "./_generated/dataModel";
import { audit } from "./lib/audit";
import { DEFAULT_SCHEDULES, nextAtFor, spendMonth } from "./lib/defaults";
import { workspaceMutation, workspaceQuery } from "./lib/functions";

function requireDevTools() {
	if (process.env.CMS_DEV_TOOLS !== "1") throw new ConvexError({ code: "FORBIDDEN", reason: "Dev tools are off on this deployment" });
}

export const seedSites = workspaceMutation({
	permission: "site.add",
	args: {},
	handler: async (ctx) => {
		requireDevTools();
		const { workspace, user } = ctx.access;
		const seed = createSeed();
		const now = Date.now();
		const added: string[] = [];
		for (const s of seed.sites) {
			const taken = await ctx.db
				.query("sites")
				.withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspace._id).eq("slug", s.slug))
				.unique();
			if (taken) continue;
			const data = seed.data[s.id];
			const { "pillar-pages": pillarPages, ...restRouting } = data.modelRouting;
			const createdAt = Date.parse(s.createdAt) || now;
			const siteId = await ctx.db.insert("sites", {
				workspaceId: workspace._id,
				slug: s.slug,
				name: s.name,
				domain: s.domain,
				industry: s.industry,
				icon: s.icon,
				...(s.accent !== undefined ? { accent: s.accent } : {}),
				status: s.status,
				createdAt,
				siteStartedAt: now - s.ageMonths * 30 * 86_400_000,
				cadenceTarget: s.cadenceTarget,
				searchConsole: s.searchConsole,
				rankSource: s.rankSource,
				budgetCaps: { textCapUsd: s.budgets.textCapUsd, imageCapUsd: s.budgets.imageCapUsd },
				spend: { month: spendMonth(now), textMicroUsd: Math.round(s.budgets.textUsd * 1e6), imageMicroUsd: Math.round(s.budgets.imageUsd * 1e6) },
				publishing: s.publishing,
				routing: data.routing,
				modelRouting: { ...restRouting, pillarPages },
				brandPack: data.brandPack,
				...(data.ctrCurve ? { ctrCurve: data.ctrCurve } : {}),
				liveBaseline: data.liveBaseline,
				timezone: "Africa/Lagos",
			});
			const enabledByKind = new Map(data.schedules.map((x) => [x.kind, x.enabled]));
			for (const d of DEFAULT_SCHEDULES) {
				await ctx.db.insert("schedules", { siteId, kind: d.kind, label: d.label, cadence: d.cadence, rule: d.rule, produces: d.produces, nextAt: nextAtFor(d.rule, now), enabled: enabledByKind.get(d.kind) ?? true });
			}
			added.push(s.name);
		}
		if (added.length) await audit(ctx, { workspaceId: workspace._id, actor: user, action: "seeded demo sites", target: `${added.length} sites`, detail: added.join(", ") });
		return { ok: true as const, added };
	},
});

/**
 * Dev only: loads each demo site's content plan (pillars, keywords, posts with gate checks, fact markers and image
 * slots) into the matching Convex site in the caller's workspace, matched by slug. Skips sites that already have
 * pillars. Merge requests, runs and versions aren't seeded (they need a repo connection / real history).
 */
export const seedContent = workspaceMutation({
	permission: "site.add",
	args: {},
	handler: async (ctx) => {
		requireDevTools();
		const { workspace, user } = ctx.access;
		const seed = createSeed();
		const now = Date.now();
		const DAY = 86_400_000;
		const filled: string[] = [];
		for (const s of seed.sites) {
			const site = await ctx.db.query("sites").withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspace._id).eq("slug", s.slug)).unique();
			if (!site) continue;
			if (await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", site._id)).first()) continue;
			const data = seed.data[s.id];
			if (!data) continue;
			const siteId = site._id;
			const ws = workspace._id;
			const pillarIds = new Map<string, Id<"pillars">>();
			for (const p of data.pillars) pillarIds.set(p.id, await ctx.db.insert("pillars", { workspaceId: ws, siteId, name: p.name, plannedPosts: p.plannedPosts, livePosts: p.livePosts, kasShare: p.kasShare, claimedButUnearned: p.claimedButUnearned }));
			const keywordIds = new Map<string, Id<"keywords">>();
			for (const k of data.keywords) {
				const pillarId = pillarIds.get(k.pillarId);
				if (!pillarId) continue;
				const term = k.term.trim().toLowerCase().replace(/\s+/g, " ");
				keywordIds.set(k.id, await ctx.db.insert("keywords", { workspaceId: ws, siteId, term: k.term, termNormalized: term, pillarId, intent: k.intent, difficulty: k.difficulty, difficultyEvidence: k.difficultyEvidence, impressions: k.impressions, position: k.position, positionTrend: k.positionTrend, kasShare: k.kasShare, kasDelta: k.kasDelta, rankingUrl: k.rankingUrl, rankingPages: k.rankingPages, decaying: k.decaying }));
			}
			for (const p of data.posts) {
				const keywordId = keywordIds.get(p.keywordId);
				const pillarId = pillarIds.get(p.pillarId);
				if (!keywordId || !pillarId) continue;
				const approval = p.ideaApproval?.status ?? (p.state === "idea" ? "pending" : "approved");
				const stateChangedAt = now - p.daysInState * DAY;
				const postId = await ctx.db.insert("posts", {
					workspaceId: ws, siteId, slug: p.slug, title: p.title, seoTitle: p.seoTitle, keywordId, pillarId, intent: p.intent, contentType: p.contentType, source: p.source,
					state: p.state, stateChangedAt, owner: p.owner, week: p.week, strongModel: p.strongModel,
					...(p.progress ? { progress: p.progress } : {}),
					words: p.words, wordTarget: p.wordTarget, blocks: [], currentVersion: p.versions.length || (p.blocks.length ? 1 : 0),
					...(p.kasContribution !== undefined ? { kasContribution: p.kasContribution } : {}),
					...(p.regulated ? { regulated: p.regulated } : {}),
					...(p.requires ? { requires: p.requires } : {}),
					...(p.sendBackNote ? { sendBackNote: p.sendBackNote } : {}),
					...(p.ideaApproval ? { ideaApproval: { status: p.ideaApproval.status, ...(p.ideaApproval.by ? { by: p.ideaApproval.by } : {}), ...(p.ideaApproval.note ? { note: p.ideaApproval.note } : {}) } } : {}),
					ideaStatus: approval, createdAt: stateChangedAt, updatedAt: now,
				});
				const factIds = new Map<string, string>();
				for (const f of p.facts) factIds.set(f.id, await ctx.db.insert("factMarkers", { siteId, postId, claim: f.claim, status: f.status, ...(f.source ? { source: f.source } : {}), note: f.note }));
				const slotIds = new Map<string, string>();
				let order = 0;
				for (const sl of data.slots.filter((x) => x.postId === p.id)) {
					slotIds.set(sl.id, await ctx.db.insert("imageSlots", { siteId, postId, name: sl.name, type: sl.type, placement: sl.placement, width: sl.width, height: sl.height, format: sl.format, breakpoints: sl.breakpoints, filename: sl.filename, alt: sl.alt, prompt: sl.prompt, styleKeywords: sl.styleKeywords, provider: sl.provider, model: sl.model, status: sl.status, estimateUsd: sl.estimateUsd, ...(sl.humanPinned ? { humanPinned: true } : {}), order: order++ }));
				}
				const blocks = p.blocks.map((b) => ({
					id: b.id,
					kind: b.kind,
					text: b.kind === "image" ? (slotIds.get(b.text) ?? b.text) : b.text,
					...(b.factMarkerIds?.length ? { factMarkerIds: b.factMarkerIds.map((id) => factIds.get(id) ?? id) } : {}),
				}));
				await ctx.db.patch(postId, { blocks });
				for (const c of p.gate) await ctx.db.insert("gateChecks", { siteId, postId, checkId: c.id, label: c.label, section: c.section, status: c.status, value: c.value, severity: c.severity, ...(c.override ? { override: { reason: c.override.reason, by: c.override.by, at: Date.parse(c.override.at) || now } } : {}), evaluatedAt: now, evaluatedForVersion: 1 });
			}
			for (const l of data.ledger) {
				if (l.done) continue;
				await ctx.db.insert("ledgerItems", { siteId, title: l.title, owner: l.owner, createdAt: Date.parse(l.createdAt) || now, downstream: l.downstream, ...(l.kind ? { kind: l.kind } : {}), origin: "qa-agent", done: false });
			}
			filled.push(s.name);
		}
		if (filled.length) await audit(ctx, { workspaceId: workspace._id, actor: user, action: "seeded demo content", target: `${filled.length} sites`, detail: filled.join(", ") });
		return { ok: true as const, filled };
	},
});

/** Lets the UI show dev-only controls. Says nothing beyond on/off. */
export const enabled = workspaceQuery({
	args: {},
	handler: async () => process.env.CMS_DEV_TOOLS === "1",
});
