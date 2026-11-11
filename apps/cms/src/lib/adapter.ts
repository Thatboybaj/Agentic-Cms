// Convex → prototype shapes (handoff 01 step 11). The one place where Convex documents become the types.ts shapes
// the screens already consume: ms → ISO strings, micro-USD → USD, Convex ids → `id` strings,
// `modelRouting.pillarPages` → "pillar-pages". Pure functions, no React, so they are unit-tested directly.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { IMembership, ISite, IUser, IWorkspace, TPostState, TRole, TWorkspaceRole } from "./types";

export type TPortfolioRow = FunctionReturnType<typeof api.portfolio.list>[number];
export type TTeam = FunctionReturnType<typeof api.members.team>;
export type TWorkspaceCurrent = FunctionReturnType<typeof api.workspace.current>;

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
