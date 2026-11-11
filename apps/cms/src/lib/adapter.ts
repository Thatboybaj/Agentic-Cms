// Convex → prototype shapes (handoff 01 step 11). The one place where Convex documents become the types.ts shapes
// the screens already consume: ms → ISO strings, micro-USD → USD, Convex ids → `id` strings,
// `modelRouting.pillarPages` → "pillar-pages". Pure functions, no React, so they are unit-tested directly.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { sitePath } from "./routes";
import type { IImageSlot, IMember, IMembership, IMergeRequest, IPost, IRun, ISchedule, ISite, ISiteData, ITemplateManifest, IUser, IWorkspace, TPostState, TRole, TWorkspaceRole } from "./types";

export type TPortfolioRow = FunctionReturnType<typeof api.portfolio.list>[number];
export type TTeam = FunctionReturnType<typeof api.members.team>;
export type TWorkspaceCurrent = FunctionReturnType<typeof api.workspace.current>;
export type TPlanBundle = FunctionReturnType<typeof api.plan.bundle>;

const DAY_MS = 86_400_000;

/**
 * The plan page's site + ISiteData from one Convex bundle. Fields the plan doesn't read yet and that aren't on
 * Convex (trajectory, reports, KAS snapshots, audit, notifications) are empty: their handoffs (07, 01) fill them.
 */
export function toPlanData(b: TPlanBundle): { site: ISite; data: ISiteData; role: TRole; members: IMember[] } {
	const now = b.now;
	const s = b.site;
	const site: ISite = {
		id: s._id,
		slug: s.slug,
		name: s.name,
		domain: s.domain,
		industry: s.industry,
		icon: s.icon,
		...(s.accent !== undefined ? { accent: s.accent } : {}),
		status: s.status,
		createdAt: iso(s.createdAt)!,
		ageMonths: s.siteStartedAt ? Math.max(0, Math.floor((now - s.siteStartedAt) / MONTH_MS)) : 0,
		cadenceTarget: s.cadenceTarget,
		repo: b.repo,
		searchConsole: s.searchConsole,
		rankSource: s.rankSource,
		budgets: { textUsd: round2(s.spend.textMicroUsd / 1e6), textCapUsd: s.budgetCaps.textCapUsd, imageUsd: round2(s.spend.imageMicroUsd / 1e6), imageCapUsd: s.budgetCaps.imageCapUsd },
		publishing: s.publishing,
	};
	const slots: IImageSlot[] = b.slots.map((x) => ({
		id: x._id, postId: x.postId, name: x.name, type: x.type, placement: x.placement, width: x.width, height: x.height, format: x.format, breakpoints: x.breakpoints,
		filename: x.filename, alt: x.alt, prompt: x.prompt, styleKeywords: x.styleKeywords, provider: x.provider, model: x.model, status: x.status, estimateUsd: x.estimateUsd,
		candidates: b.candidates
			.filter((c) => c.slotId === x._id)
			.map((c) => ({ id: c._id, label: c.label, hue: c.hue, selected: c.selected, ...(c.source?.sourceUrl ? { url: c.source.sourceUrl } : {}), ...(c.source ? { source: c.source } : {}) })),
		...(x.generatedAt ? { generatedAt: iso(x.generatedAt) } : {}),
		...(x.humanPinned ? { humanPinned: true } : {}),
	}));
	const posts: IPost[] = b.posts.map((p) => ({
		id: p._id, slug: p.slug, title: p.title, seoTitle: p.seoTitle, keywordId: p.keywordId, pillarId: p.pillarId, intent: p.intent, contentType: p.contentType, source: p.source,
		state: p.state, owner: p.owner, week: p.week, strongModel: p.strongModel, ...(p.progress ? { progress: p.progress } : {}),
		words: p.words, wordTarget: p.wordTarget, blocks: p.blocks,
		gate: p.checks.map((c) => ({ id: c.checkId, label: c.label, section: c.section as IPost["gate"][number]["section"], status: c.status, value: c.value, severity: c.severity, ...(c.override ? { override: { reason: c.override.reason, by: c.override.by, at: iso(c.override.at)! } } : {}) })),
		facts: p.facts.map((f) => ({ id: f._id, claim: f.claim, status: f.status, note: f.note, ...(f.source ? { source: f.source } : {}) })),
		suggestions: [],
		versions: [],
		slotIds: slots.filter((x) => x.postId === p._id).map((x) => x.id),
		daysInState: Math.max(0, Math.floor((now - p.stateChangedAt) / DAY_MS)),
		comments: [],
		...(p.kasContribution !== undefined ? { kasContribution: p.kasContribution } : {}),
		...(p.regulated ? { regulated: p.regulated } : {}),
		...(p.mrId ? { mrId: p.mrId } : {}),
		...(p.requires ? { requires: p.requires } : {}),
		...(p.sendBackNote ? { sendBackNote: p.sendBackNote } : {}),
		...(p.ideaApproval ? { ideaApproval: { status: p.ideaApproval.status, ...(p.ideaApproval.by ? { by: p.ideaApproval.by } : {}), ...(p.ideaApproval.at ? { at: iso(p.ideaApproval.at) } : {}), ...(p.ideaApproval.note ? { note: p.ideaApproval.note } : {}) } } : {}),
		...(p.assigneeId ? { assigneeId: p.assigneeId } : {}),
	}));
	const mergeRequests: IMergeRequest[] = b.mergeRequests.map((m) => ({
		id: m._id, number: m.number, host: m.host, branch: m.branch, base: m.base, status: m.status, ci: m.ci, ...(m.previewUrl ? { previewUrl: m.previewUrl } : {}),
		files: m.files, openedAt: iso(m.openedAt)!, ...(m.mergedAt ? { mergedAt: iso(m.mergedAt) } : {}), overrides: m.overrides, ...(m.postId ? { postId: m.postId } : {}),
		...(m.title ? { title: m.title } : {}), ...(m.description ? { description: m.description } : {}), ...(m.ciDetail ? { ciDetail: m.ciDetail } : {}),
		...(m.mergedBy ? { mergedBy: m.mergedBy } : {}), ...(m.manifestVersion ? { manifestVersion: m.manifestVersion } : {}), ...(m.autopost ? { autopost: true } : {}),
	}));
	const schedules: ISchedule[] = b.schedules.map((x) => ({ kind: x.kind, label: x.label, cadence: x.cadence, produces: x.produces, nextAt: iso(x.nextAt)!, enabled: x.enabled }));
	const runs: IRun[] = b.runs.map((r) => ({
		id: r._id, kind: r.kind, trigger: r.trigger === "manual" ? "manual" : "scheduled", status: r.status === "cancelled" ? "failed" : r.status, agent: r.agent, model: r.model,
		tokens: r.inputTokens + r.outputTokens, costUsd: r.costUsd, estimateUsd: r.estimateUsd, startedAt: iso(r.startedAt)!, ...(r.finishedAt ? { durationSec: Math.max(1, Math.round((r.finishedAt - r.startedAt) / 1000)) } : {}),
		...(r.postId ? { postId: r.postId } : {}), output: r.output, ...(r.tier ? { tier: r.tier } : {}), ...(r.budget ? { budget: r.budget } : {}),
	}));
	const manifests: ITemplateManifest[] = b.manifest ? [{ id: b.manifest._id, version: b.manifest.version, source: b.manifest.source, kind: b.manifest.kind, output: b.manifest.output, status: b.manifest.status, mappings: b.manifest.mappings }] : [];
	const { pillarPages, ...restRouting } = s.modelRouting;
	const data: ISiteData = {
		pillars: b.pillars.map((p) => ({ id: p._id, name: p.name, plannedPosts: p.plannedPosts, livePosts: p.livePosts, kasShare: p.kasShare, claimedButUnearned: p.claimedButUnearned })),
		keywords: b.keywords.map((k) => ({ id: k._id, term: k.term, pillarId: k.pillarId, intent: k.intent, difficulty: k.difficulty, difficultyEvidence: k.difficultyEvidence, impressions: k.impressions, position: k.position, positionTrend: k.positionTrend, kasShare: k.kasShare, kasDelta: k.kasDelta, rankingUrl: k.rankingUrl, rankingPages: k.rankingPages, decaying: k.decaying })),
		posts,
		slots,
		manifests,
		mergeRequests,
		runs,
		schedules,
		ledger: b.ledger.map((l) => ({ id: l._id, title: l.title, owner: l.owner, createdAt: iso(l.createdAt)!, ageDays: Math.max(0, Math.floor((now - l.createdAt) / DAY_MS)), downstream: l.downstream, ...(l.postId ? { postId: l.postId } : {}), ...(l.slotId ? { slotId: l.slotId } : {}), done: l.done, ...(l.kind ? { kind: l.kind } : {}) })),
		trajectory: [],
		planStatus: [],
		reports: [],
		kasSnapshots: [],
		audit: b.audit.map((a) => ({ id: a.id, at: iso(a.at)!, actor: a.actor, action: a.action, target: a.target, ...(a.detail ? { detail: a.detail } : {}) })),
		// Stored hrefs are site-relative ("/merge-requests"); the page navigates to the full path.
		notifications: b.notifications.map((n) => ({ id: n.id, at: iso(n.at)!, tone: n.tone, title: n.title, body: n.body, read: n.read, ...(n.href ? { href: n.href.startsWith("/s/") ? n.href : sitePath(b.site.slug, n.href) } : {}) })),
		liveBaseline: s.liveBaseline,
		routing: s.routing,
		modelRouting: { ...restRouting, "pillar-pages": pillarPages },
		brandPack: s.brandPack,
		...(s.ctrCurve ? { ctrCurve: s.ctrCurve } : {}),
	};
	const members: IMember[] = b.members.map((m) => ({ id: m.id, name: m.name, initials: m.initials, role: m.role, email: "" }));
	return { site, data, role: s.role, members };
}

const iso = (ms: number | null | undefined) => (typeof ms === "number" ? new Date(ms).toISOString() : undefined);
const MONTH_MS = 30 * 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function toSite(r: TPortfolioRow, now = Date.now()): ISite {
	return {
		id: r.siteId,
		slug: r.slug,
		name: r.name,
		domain: r.domain,
		industry: r.industry,
		icon: r.icon,
		...(r.accent !== undefined ? { accent: r.accent } : {}),
		status: r.status,
		createdAt: iso(r.createdAt)!,
		ageMonths: r.siteStartedAt ? Math.max(0, Math.floor((now - r.siteStartedAt) / MONTH_MS)) : 0,
		cadenceTarget: r.cadenceTarget,
		repo: null, // repoConnections land in handoff 06
		searchConsole: r.searchConsole,
		rankSource: r.rankSource,
		budgets: { textUsd: round2(r.spend.textUsd), textCapUsd: r.spend.textCapUsd, imageUsd: round2(r.spend.imageUsd), imageCapUsd: r.spend.imageCapUsd },
		publishing: r.publishing,
	};
}

export function toWorkspace(w: TWorkspaceCurrent, team: TTeam | undefined): IWorkspace {
	// Pending invites hold a seat (invites.create counts them), so the invite sheet's "seats left" matches the server.
	return { id: w._id, name: w.name, plan: w.plan, seats: w.seats, seatsUsed: (team?.seatsUsed ?? 0) + (team?.invites.length ?? 0) };
}

export function toUsers(team: TTeam): { users: IUser[]; workspaceRoles: Record<string, TWorkspaceRole>; memberships: IMembership[] } {
	const users: IUser[] = [];
	const workspaceRoles: Record<string, TWorkspaceRole> = {};
	const memberships: IMembership[] = [];
	for (const p of team.people) {
		users.push({ id: p.userId, name: p.name, initials: p.initials, email: p.email, avatarHue: p.avatarHue, status: p.status });
		workspaceRoles[p.userId] = p.workspaceRole;
		for (const s of p.sites) memberships.push({ userId: p.userId, siteId: s.siteId, role: s.role as TRole, addedAt: "", addedBy: "" });
	}
	// Pending invites show as "invited" people, like the prototype (status chip "Invited · accepts on sign-in").
	for (const i of team.invites) {
		const id = `invite:${i.inviteId}`;
		const name = i.email.split("@")[0].split(/[._-]+/).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1)).join(" ") || i.email;
		const initials = (name.split(" ").length > 1 ? name.split(" ")[0][0] + name.split(" ")[1][0] : name.slice(0, 2)).toUpperCase();
		users.push({ id, name, initials, email: i.email, avatarHue: 210, status: "invited", invitedAt: iso(i.createdAt) });
		workspaceRoles[id] = i.workspaceRole;
		for (const sr of i.siteRoles) memberships.push({ userId: id, siteId: sr.siteId, role: sr.role as TRole, addedAt: iso(i.createdAt) ?? "", addedBy: "" });
	}
	return { users, workspaceRoles, memberships };
}

/** Pending invites are listed as people with this id prefix; they have no user row to edit yet. */
export const isInviteId = (id: string) => id.startsWith("invite:");
export const inviteIdOf = (id: string) => id.slice("invite:".length);

/** Pipeline buckets the Sites page shows (same grouping as useSiteRows). */
export function pipelineOf(counts: Record<TPostState, number>) {
	return {
		idea: counts.idea,
		drafting: counts.briefed + counts.drafting + counts["needs-assets"],
		review: counts["in-review"],
		mr: counts["mr-open"],
		live: counts.live + counts.decaying,
	};
}
