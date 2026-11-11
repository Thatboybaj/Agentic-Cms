// Convex → prototype shape mapping (src/lib/adapter.ts).
import { describe, expect, test } from "vitest";
import { inviteIdOf, isInviteId, pipelineOf, toSite, toUsers, toWorkspace, type TPortfolioRow, type TTeam, type TWorkspaceCurrent } from "./adapter";

const row = (over: Partial<TPortfolioRow> = {}): TPortfolioRow =>
	({
		siteId: "site1",
		slug: "lumen",
		name: "Lumen Dental",
		domain: "lumendental.co",
		industry: "Healthcare",
		icon: "tooth",
		accent: 200,
		status: "active",
		createdAt: Date.parse("2026-01-01T00:00:00Z"),
		siteStartedAt: Date.parse("2026-01-01T00:00:00Z"),
		cadenceTarget: 3,
		searchConsole: "connected",
		rankSource: null,
		publishing: { autopost: true, autoMergeOnGreenCi: false },
		role: "specialist",
		counts: { idea: 2, briefed: 1, drafting: 1, "needs-assets": 1, "in-review": 3, "mr-open": 1, live: 40, decaying: 2 },
		ideasPending: 2,
		spend: { textUsd: 12.345, imageUsd: 3.2, textCapUsd: 100, imageCapUsd: 50 },
		lastActivityAt: null,
		...over,
	}) as TPortfolioRow;

const team: TTeam = {
	canManage: true,
	seats: 5,
	seatsUsed: 2,
	people: [
		{ userId: "u1", name: "Amaka E.", initials: "AE", email: "amaka@x.co", avatarHue: 10, status: "active", workspaceRole: "owner", sites: [] },
		{ userId: "u2", name: "Tolu B.", initials: "TB", email: "tolu@x.co", avatarHue: 20, status: "active", workspaceRole: "member", sites: [{ siteId: "site1", role: "specialist" }] },
	],
	invites: [{ inviteId: "inv1", email: "ada.okafor@lumen.co", workspaceRole: "member", siteRoles: [{ siteId: "site1", role: "stakeholder" }], createdAt: 1_000, expiresAt: 2_000, sent: true }],
} as unknown as TTeam;

describe("adapter", () => {
	test("toSite: ISO dates, rounded USD, age in months, no repo yet", () => {
		const s = toSite(row(), Date.parse("2026-11-11T00:00:00Z"));
		expect(s).toMatchObject({ id: "site1", slug: "lumen", createdAt: "2026-01-01T00:00:00.000Z", repo: null, budgets: { textUsd: 12.35, textCapUsd: 100, imageUsd: 3.2, imageCapUsd: 50 } });
		expect(s.ageMonths).toBe(10);
	});

	test("pipelineOf groups states like the prototype's useSiteRows", () => {
		expect(pipelineOf(row().counts)).toEqual({ idea: 2, drafting: 3, review: 3, mr: 1, live: 42 });
	});

	test("toUsers: people, roles, memberships, and pending invites as invited people", () => {
		const { users, workspaceRoles, memberships } = toUsers(team);
		expect(users.map((u) => [u.id, u.status])).toEqual([["u1", "active"], ["u2", "active"], ["invite:inv1", "invited"]]);
		expect(users[2]).toMatchObject({ name: "Ada Okafor", initials: "AO", email: "ada.okafor@lumen.co" });
		expect(workspaceRoles).toEqual({ u1: "owner", u2: "member", "invite:inv1": "member" });
		expect(memberships.map((m) => [m.userId, m.siteId, m.role])).toEqual([["u2", "site1", "specialist"], ["invite:inv1", "site1", "stakeholder"]]);
		expect(isInviteId("invite:inv1")).toBe(true);
		expect(inviteIdOf("invite:inv1")).toBe("inv1");
	});

	test("toWorkspace counts pending invites against seats (as invites.create does)", () => {
		const w = { _id: "w1", name: "BAYNOR AI", slug: "baynor", plan: "pilot", seats: 5, role: "owner", userId: "u1" } as TWorkspaceCurrent;
		expect(toWorkspace(w, team)).toEqual({ id: "w1", name: "BAYNOR AI", plan: "pilot", seats: 5, seatsUsed: 3 });
	});
});
