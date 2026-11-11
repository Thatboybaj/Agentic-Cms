// Builds the prototype-shaped inputs that logic.ts's pure gate functions take (evaluateGate, autopostDecision) from
// Convex rows, so the server runs the exact same rules as the UI (handoff 02 step 5, api-map `gate.evaluate`).
// Ids become strings; times become ISO; fields the gate never reads get empty defaults.
import type { IGateCheck, IImageSlot, IPost, IRepoConnection, ITemplateManifest } from "../../src/lib/types";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export interface IGateInputs {
	post: IPost;
	slots: IImageSlot[];
	manifest: ITemplateManifest | null;
	manifestDoc: Doc<"templateManifests"> | null;
	repo: IRepoConnection | null;
	repoDoc: Doc<"repoConnections"> | null;
	/** logic.ts TAutopostSite */
	site: { budgets: { textUsd: number; textCapUsd: number; imageUsd: number; imageCapUsd: number }; repo: IRepoConnection | null; publishing: Doc<"sites">["publishing"] };
	keyword: string;
	checkDocs: Doc<"gateChecks">[];
	factDocs: Doc<"factMarkers">[];
	slotDocs: Doc<"imageSlots">[];
}

const iso = (ms?: number) => (ms ? new Date(ms).toISOString() : "");

export async function activeManifest(ctx: QueryCtx, siteId: Id<"sites">) {
	const confirmed = await ctx.db
		.query("templateManifests")
		.withIndex("by_site_status", (q) => q.eq("siteId", siteId).eq("status", "confirmed"))
		.take(20);
	return confirmed.sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function activeRepo(ctx: QueryCtx, siteId: Id<"sites">) {
	const rows = await ctx.db.query("repoConnections").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(10);
	return rows.find((r) => r.status === "active") ?? null;
}

export async function gateInputs(ctx: QueryCtx, site: Doc<"sites">, postDoc: Doc<"posts">): Promise<IGateInputs> {
	const checkDocs = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", postDoc._id)).take(100);
	const factDocs = await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", postDoc._id)).take(100);
	const slotDocs = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postDoc._id)).take(50);
	const manifestDoc = await activeManifest(ctx, site._id);
	const repoDoc = await activeRepo(ctx, site._id);
	const keyword = (await ctx.db.get(postDoc.keywordId))?.term ?? postDoc.title;

	const gate: IGateCheck[] = checkDocs.map((c) => ({
		id: c.checkId,
		label: c.label,
		section: c.section as IGateCheck["section"],
		status: c.status,
		value: c.value,
		severity: c.severity,
		...(c.override ? { override: { reason: c.override.reason, by: c.override.by, at: iso(c.override.at) } } : {}),
	}));
	const post: IPost = {
		id: postDoc._id,
		slug: postDoc.slug,
		title: postDoc.title,
		seoTitle: postDoc.seoTitle,
		keywordId: postDoc.keywordId,
		pillarId: postDoc.pillarId,
		intent: postDoc.intent,
		contentType: postDoc.contentType,
		source: postDoc.source,
		state: postDoc.state,
		owner: postDoc.owner,
		week: postDoc.week,
		strongModel: postDoc.strongModel,
		words: postDoc.words,
		wordTarget: postDoc.wordTarget,
		blocks: postDoc.blocks,
		gate,
		facts: factDocs.map((f) => ({ id: f._id, claim: f.claim, status: f.status, note: f.note, ...(f.source ? { source: f.source } : {}) })),
		suggestions: [],
		versions: [],
		slotIds: slotDocs.map((s) => s._id),
		daysInState: 0,
		comments: [],
		...(postDoc.regulated ? { regulated: postDoc.regulated } : {}),
		...(postDoc.requires ? { requires: postDoc.requires } : {}),
	};
	const slots: IImageSlot[] = slotDocs.map((s) => ({
		id: s._id,
		postId: s.postId,
		name: s.name,
		type: s.type,
		placement: s.placement,
		width: s.width,
		height: s.height,
		format: s.format,
		breakpoints: s.breakpoints,
		filename: s.filename,
		alt: s.alt,
		prompt: s.prompt,
		styleKeywords: s.styleKeywords,
		provider: s.provider,
		model: s.model,
		status: s.status,
		candidates: [],
		estimateUsd: s.estimateUsd,
		...(s.humanPinned ? { humanPinned: true } : {}),
	}));
	const manifest: ITemplateManifest | null = manifestDoc
		? { id: manifestDoc._id, version: manifestDoc.version, source: manifestDoc.source, kind: manifestDoc.kind, output: manifestDoc.output, status: manifestDoc.status, mappings: manifestDoc.mappings }
		: null;
	const repo: IRepoConnection | null = repoDoc
		? { host: repoDoc.host, repo: repoDoc.repo, baseBranch: repoDoc.baseBranch, contentDir: repoDoc.contentDir, assetDir: repoDoc.assetDir, branchPattern: repoDoc.branchPattern, installedAs: repoDoc.installedAs }
		: null;
	return {
		post,
		slots,
		manifest,
		manifestDoc,
		repo,
		repoDoc,
		keyword,
		checkDocs,
		factDocs,
		slotDocs,
		site: {
			repo,
			publishing: site.publishing,
			budgets: { textUsd: site.spend.textMicroUsd / 1e6, textCapUsd: site.budgetCaps.textCapUsd, imageUsd: site.spend.imageMicroUsd / 1e6, imageCapUsd: site.budgetCaps.imageCapUsd },
		},
	};
}
