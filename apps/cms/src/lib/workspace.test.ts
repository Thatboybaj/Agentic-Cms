import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPersisted, STATE_KEY, V1_STATE_KEY } from "./migrate";
import { createSeed } from "./seed";
import { createCmsStore, createMemoryStorageBus, LEADER_HEARTBEAT_MS, LEADER_LEASE_MS, SESSION_KEY } from "./store";
import type { ICmsState, ICmsStateV1 } from "./types";
import { accessibleSites, effectiveRole, EDIT_LOCK_MS, inboxFor, isolatedState, portfolioFor, presenceFor } from "./workspace";

const TOLU = "m-tb";
const KUNLE = "m-ko";
const AMAKA = "m-ae";
const ADA = "m-ao";
const JAMES = "u-jh";
const ZAINAB = "u-zm";
const DAVID = "u-dc";

const allPostIds = (s: ICmsState, siteId: string) => s.data[siteId].posts.map((p) => p.id);

describe("effective role", () => {
	const s = createSeed();
	it("workspace owner/admin → admin everywhere; members get their per-site role; no membership → no access", () => {
		for (const site of s.sites) expect(effectiveRole(s, AMAKA, site.id)).toBe("admin");
		expect(effectiveRole(s, TOLU, "lumen")).toBe("specialist");
		expect(effectiveRole(s, TOLU, "kora")).toBeNull();
		expect(effectiveRole(s, ZAINAB, "kora")).toBe("specialist");
		expect(effectiveRole(s, ZAINAB, "sable")).toBe("developer");
		expect(effectiveRole(s, ADA, "lumen")).toBe("stakeholder");
		expect(effectiveRole(s, ADA, "northwind")).toBeNull();
		expect(effectiveRole(s, "nobody", "lumen")).toBeNull();
		expect(accessibleSites(s, TOLU).map((x) => x.id)).toEqual(["lumen", "northwind", "harbor", "sable"]);
		expect(accessibleSites(s, KUNLE)).toHaveLength(6);
		expect(accessibleSites(s, JAMES).map((x) => x.id)).toEqual(["northwind"]);
	});

	it("an admin workspace role overrides a weaker membership; suspension removes all access", () => {
		const t = structuredClone(s);
		t.workspaceRoles[ADA] = "admin";
		expect(effectiveRole(t, ADA, "lumen")).toBe("admin");
		expect(effectiveRole(t, ADA, "kora")).toBe("admin");
		t.users.find((u) => u.id === TOLU)!.status = "suspended";
		expect(effectiveRole(t, TOLU, "lumen")).toBeNull();
	});

	it("seed shape: 8 sites with slugs, 7 people, mixed roles, presence", () => {
		expect(s.version).toBe(2);
		expect(s.workspace.name).toBe("Grandeur");
		expect(s.sites.map((x) => x.slug)).toEqual(["lumen", "northwind", "harbor", "kora", "atlas", "sable", "meridian", "juniper"]);
		expect(s.sites.filter((x) => x.status !== "active").map((x) => `${x.id}:${x.status}`)).toEqual(["atlas:onboarding", "meridian:paused", "juniper:onboarding"]);
		expect(s.users).toHaveLength(7);
		expect(s.users.filter((u) => u.status === "invited").map((u) => u.id)).toEqual([DAVID]);
		expect(s.presence.length).toBeGreaterThan(0);
		// Stable fixture ids.
		expect(allPostIds(s, "lumen")).toEqual(expect.arrayContaining(["p-root-canal", "p-invisalign-2026", "p-implant-vs-bridge", "p-veneers"]));
		expect(allPostIds(s, "northwind")).toEqual(expect.arrayContaining(["np-unfair-dismissal", "np-settlement"]));
		for (const site of s.sites) expect(s.data[site.id]).toBeDefined();
	});
});

describe("tenant isolation", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("no selector returns another tenant's data", () => {
		const s = createSeed();
		const view = isolatedState(s, TOLU);
		expect(Object.keys(view.data).sort()).toEqual(["harbor", "lumen", "northwind", "sable"]);
		expect(view.sites.every((x) => ["lumen", "northwind", "harbor", "sable"].includes(x.id))).toBe(true);
		expect(view.presence.some((p) => p.siteId === "kora")).toBe(false);
		expect(view.memberships.some((m) => m.siteId === "kora")).toBe(false);
		expect(inboxFor(s, TOLU).some((i) => i.siteId && !["lumen", "northwind", "harbor", "sable"].includes(i.siteId))).toBe(false);
		expect(portfolioFor(s, TOLU).map((r) => r.site.id)).toEqual(["lumen", "northwind", "harbor", "sable"]);
		expect(presenceFor(s, TOLU).some((p) => p.siteId === "kora")).toBe(false);
		// A client stakeholder sees only their own site.
		const j = isolatedState(s, JAMES);
		expect(Object.keys(j.data)).toEqual(["northwind"]);
		expect(j.audit).toEqual([]);
		expect(portfolioFor(s, JAMES).map((r) => r.site.id)).toEqual(["northwind"]);
	});

	it("actions refuse sites the user can't access and never reach across tenants", () => {
		const st = createCmsStore();
		st.hydrate();
		const before = JSON.stringify(st.state.data.kora);
		expect(st.actionsFor("kora").approveIdea("kp-payment-links")).toEqual({ ok: false, reason: "You don't have access to Kora Fintech" });
		expect(st.actionsFor("kora").addComment("kp-fx-fees", "hi")).toMatchObject({ ok: false });
		expect(JSON.stringify(st.state.data.kora)).toBe(before);
		// A Northwind post id through Lumen's actions: not found (the site is bound to the actions object).
		expect(st.actionsFor("lumen").approveIdea("np-settlement")).toEqual({ ok: false, reason: "Post not found" });
		// Site-parameter actions check the role on *that* site.
		expect(st.actionsFor("lumen").setAutopost("kora", false)).toEqual({ ok: false, reason: "You don't have access to Kora Fintech" });
		// Unscoped actions default to an accessible site.
		expect(st.unscopedSiteId()).toBe("lumen");
		st.stop();
	});

	it("no-access becomes access once an admin grants a membership; requests show in the admin's inbox", () => {
		const st = createCmsStore();
		st.hydrate();
		expect(st.workspaceActions.requestAccess("kora")).toMatchObject({ ok: true });
		expect(st.state.accessRequests).toHaveLength(1);
		expect(st.workspaceActions.setMembership(TOLU, "kora", "specialist")).toMatchObject({ ok: false }); // Tolu isn't an admin
		st.workspaceActions.signInAs(AMAKA);
		expect(inboxFor(st.state, AMAKA).some((i) => i.kind === "access-request")).toBe(true);
		expect(st.workspaceActions.setMembership(TOLU, "kora", "specialist")).toEqual({ ok: true });
		expect(st.state.accessRequests[0].status).toBe("granted");
		st.workspaceActions.signInAs(TOLU);
		expect(st.actionsFor("kora").approveIdea("kp-payment-links").ok).toBe(true);
		expect(st.state.data.kora.audit[0]).toMatchObject({ actor: "Tolu B.", action: "approved idea" });
		st.stop();
	});
});

describe("inbox and portfolio", () => {
	it("aggregates what needs *me* across my sites, by role", () => {
		const s = createSeed();
		const tolu = inboxFor(s, TOLU);
		const kinds = (items: typeof tolu, site: string) => [...new Set(items.filter((i) => i.siteId === site).map((i) => i.kind))].sort();
		expect(kinds(tolu, "lumen")).toEqual(expect.arrayContaining(["idea", "review", "human-slot", "ledger-overdue"]));
		expect(tolu.find((i) => i.kind === "held" && i.siteId === "harbor")).toMatchObject({ postId: "hp-dental-signs", href: "/s/harbor/approvals?post=hp-dental-signs" });
		expect(tolu.some((i) => i.kind === "human-slot" && i.siteId === "sable")).toBe(true);
		expect(tolu.some((i) => i.kind === "ledger-overdue" && i.siteId === "harbor")).toBe(true);
		expect(tolu.some((i) => i.kind === "ci-failing")).toBe(false); // specialists don't fix CI
		expect(tolu.some((i) => i.kind === "invite")).toBe(false);
		const kunle = inboxFor(s, KUNLE);
		expect(kunle.filter((i) => i.kind === "ci-failing").map((i) => i.siteId).sort()).toEqual(expect.arrayContaining(["kora", "lumen", "meridian"]));
		expect(kunle.some((i) => i.kind === "idea")).toBe(false);
		const amaka = inboxFor(s, AMAKA);
		expect(amaka.find((i) => i.kind === "invite")).toMatchObject({ href: "/team" });
		expect(inboxFor(s, ADA).filter((i) => i.kind !== "ledger-overdue")).toEqual([]); // stakeholder: view and comment only
		for (const i of tolu) expect(i.href.startsWith("/s/")).toBe(true);
	});

	it("portfolio rows carry pipeline, needs-me, held, ideas, spend and gap", () => {
		const s = createSeed();
		const rows = portfolioFor(s, AMAKA);
		expect(rows).toHaveLength(8);
		const harbor = rows.find((r) => r.site.id === "harbor")!;
		expect(harbor).toMatchObject({ role: "admin", held: 1, ideasPending: 2, status: "active" });
		expect(harbor.needsMe).toBeGreaterThan(0);
		expect(harbor.spend.text).toMatchObject({ spent: 48.2, cap: 120 });
		expect(harbor.gap).not.toBeNull();
		expect(rows.find((r) => r.site.id === "atlas")!.gap).toBeNull();
		expect(rows.find((r) => r.site.id === "lumen")!.lastActivity).toMatchObject({ id: "a-l-01" });
		expect(rows.find((r) => r.site.id === "lumen")!.here).toBeGreaterThan(0);
	});
});

describe("presence and the soft edit lock", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("shows who else is where; records my own spot", () => {
		const st = createCmsStore();
		st.hydrate();
		const lumen = presenceFor(st.state, TOLU, "lumen").map((p) => p.userId).sort();
		expect(lumen).toEqual([AMAKA, KUNLE, ADA].sort());
		expect(presenceFor(st.state, TOLU, "lumen", "/s/lumen/approvals").map((p) => p.userId)).toEqual([ADA]);
		expect(presenceFor(st.state, TOLU, "lumen", "/s/lumen/posts/*").map((p) => p.userId)).toEqual([AMAKA]);
		st.recordPresence("lumen", "/s/lumen/plan");
		expect(presenceFor(st.state, TOLU, "lumen", undefined, true).find((p) => p.isMe)).toMatchObject({ path: "/s/lumen/plan" });
		st.recordPresence("kora", "/s/kora/plan"); // no access: ignored
		expect(st.state.presence.some((p) => p.userId === TOLU && p.siteId === "kora")).toBe(false);
		st.stop();
	});

	it("second editor sees who's editing; can take over; stale locks free up", () => {
		const st = createCmsStore();
		st.hydrate();
		const lumen = st.actionsFor("lumen");
		// Amaka holds a fresh lock on the veneers draft in the seed.
		const r = lumen.startEditing("p-veneers");
		expect(r).toMatchObject({ ok: false, reason: "Amaka E. is editing", heldBy: { userId: AMAKA, name: "Amaka E." } });
		const block = st.state.data.lumen.posts.find((p) => p.id === "p-veneers")!.blocks.find((b) => b.kind === "p")!;
		expect(lumen.editBlock("p-veneers", block.id, "Changed")).toEqual({ ok: false, reason: "Amaka E. is editing · view only" });
		expect(lumen.startEditing("p-veneers", { takeOver: true })).toEqual({ ok: true });
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-veneers")!.editingBy?.userId).toBe(TOLU);
		expect(st.state.data.lumen.audit[0]).toMatchObject({ actor: "Tolu B.", action: "took over editing", detail: "from Amaka E." });
		// Now Amaka (another tab, same data) is the one locked out.
		st.workspaceActions.signInAs(AMAKA);
		expect(lumen.startEditing("p-veneers")).toMatchObject({ ok: false, heldBy: { userId: TOLU } });
		vi.advanceTimersByTime(EDIT_LOCK_MS + 1000);
		expect(lumen.startEditing("p-veneers")).toEqual({ ok: true });
		expect(lumen.stopEditing("p-veneers")).toEqual({ ok: true });
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-veneers")!.editingBy).toBeUndefined();
		// Stakeholders can't take the lock at all.
		st.workspaceActions.signInAs(ADA);
		expect(lumen.startEditing("p-root-canal")).toMatchObject({ ok: false, reason: "Stakeholders can view and comment only" });
		st.stop();
	});

	it("assignPost only assigns people with access to the site", () => {
		const st = createCmsStore();
		st.hydrate();
		const lumen = st.actionsFor("lumen");
		expect(lumen.assignPost("p-veneers", JAMES)).toMatchObject({ ok: false, reason: "Assign someone who has access to this site" });
		expect(lumen.assignPost("p-veneers", KUNLE)).toEqual({ ok: true });
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-veneers")!.assigneeId).toBe(KUNLE);
		expect(st.state.data.lumen.audit[0]).toMatchObject({ action: "assigned", detail: "Kunle O." });
		expect(lumen.assignPost("p-veneers", null)).toEqual({ ok: true });
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-veneers")!.assigneeId).toBeUndefined();
		st.stop();
	});
});

describe("workspace actions", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("invite → sign in as the invitee accepts; seats are counted; non-admins are refused", () => {
		const st = createCmsStore();
		st.hydrate();
		expect(st.workspaceActions.inviteUser("new@grandeur.agency", { lumen: "specialist" })).toMatchObject({ ok: false, reason: "Only a workspace owner or admin can change this" });
		st.workspaceActions.signInAs(AMAKA);
		expect(st.workspaceActions.inviteUser("tolu@grandeur.agency", { lumen: "specialist" })).toMatchObject({ ok: false });
		const r = st.workspaceActions.inviteUser("ngozi.a@grandeur.agency", { lumen: "specialist", kora: "developer" });
		expect(r.ok).toBe(true);
		const id = (r as { id: string }).id;
		expect(st.state.users.find((u) => u.id === id)).toMatchObject({ name: "Ngozi A", initials: "NA", status: "invited" });
		expect(st.state.workspace.seatsUsed).toBe(8);
		expect(effectiveRole(st.state, id, "kora")).toBe("developer");
		expect(st.state.audit[0]).toMatchObject({ actor: "Amaka E.", action: "invited" });
		st.workspaceActions.signInAs(id);
		expect(st.state.users.find((u) => u.id === id)!.status).toBe("active");
		expect(st.userName()).toBe("Ngozi A");
		st.stop();
	});

	it("workspace roles: only an owner grants owner; the last owner can't be demoted", () => {
		const st = createCmsStore();
		st.hydrate();
		st.workspaceActions.signInAs(AMAKA);
		expect(st.workspaceActions.setWorkspaceRole(ZAINAB, "admin")).toEqual({ ok: true });
		expect(effectiveRole(st.state, ZAINAB, "lumen")).toBe("admin");
		expect(st.workspaceActions.setWorkspaceRole(AMAKA, "member")).toMatchObject({ ok: false, reason: "The workspace needs at least one owner" });
		st.workspaceActions.signInAs(ZAINAB);
		expect(st.workspaceActions.setWorkspaceRole(KUNLE, "owner")).toMatchObject({ ok: false, reason: "Only an owner can grant or remove the owner role" });
		st.stop();
	});

	it("addSite returns the slug; pausing a site holds its jobs until it resumes", () => {
		const st = createCmsStore();
		st.hydrate();
		st.workspaceActions.signInAs(AMAKA);
		const r = st.workspaceActions.addSite({ name: "Orbit Dental", domain: "orbitdental.co", industry: "Dental clinics" });
		expect(r).toEqual({ ok: true, id: "orbit-dental" });
		expect(st.state.sites.find((s) => s.id === "orbit-dental")).toMatchObject({ slug: "orbit-dental", status: "onboarding", industry: "Dental clinics" });
		expect(st.unscopedSiteId()).toBe("orbit-dental");
		// Pause Lumen, approve an idea (autopost queues the brief), nothing advances until resume.
		expect(st.workspaceActions.pauseSite("lumen")).toEqual({ ok: true });
		const lumen = st.actionsFor("lumen");
		expect(lumen.runNow("qa-sweep")).toMatchObject({ ok: false, reason: "Lumen Dental is paused · resume it to run agents" });
		expect(lumen.approveIdea("p-implants-last").ok).toBe(true);
		vi.advanceTimersByTime(5000);
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-implants-last")!.state).toBe("briefed");
		expect(st.workspaceActions.resumeSite("lumen")).toEqual({ ok: true });
		vi.advanceTimersByTime(1300);
		expect(st.state.data.lumen.posts.find((p) => p.id === "p-implants-last")!.state).toBe("drafting");
		st.stop();
	});

	it("setRole is a compat 'view as': it signs in as the person with that role on the site", () => {
		const st = createCmsStore();
		st.hydrate();
		expect(st.actionsFor("lumen").setRole("developer")).toMatchObject({ ok: true });
		expect(st.userId()).toBe(KUNLE);
		expect(st.actionsFor("northwind").setRole("stakeholder")).toMatchObject({ ok: true });
		expect(st.userId()).toBe(JAMES);
		st.stop();
	});

	it("store hrefs are absolute: toasts and notifications carry /s/<slug>/…", () => {
		const st = createCmsStore();
		st.hydrate();
		expect(st.state.data.lumen.notifications.find((n) => n.id === "n-l-01")!.href).toBe("/s/lumen/seo");
		st.actionsFor("lumen").addIdea("dental crowns for kids");
		expect(st.toasts.at(-1)!.href).toMatch(/^\/s\/lumen\/posts\//);
		st.stop();
	});
});

describe("persistence: v1 → v2 migration", () => {
	const v1From = (s: ICmsState): ICmsStateV1 => ({
		version: 1,
		siteId: "northwind",
		role: "developer",
		sites: s.sites.filter((x) => x.id === "lumen" || x.id === "northwind").map(({ slug: _s, industry: _i, status: _st, createdAt: _c, accent: _a, ...rest }) => rest),
		members: [{ id: "m-tb", name: "Tolu B.", initials: "TB", role: "specialist", email: "tolu@grandeur.agency" }],
		data: { lumen: s.data.lumen, northwind: s.data.northwind },
		jobs: [{ id: "job-1", at: 0, siteId: "lumen", kind: "ci-result", payload: { mrId: "mr-44", result: "passing" } }],
	});

	it("keeps v1 site data and jobs, adds the workspace, drops the shared role", () => {
		const seed = createSeed();
		seed.data.lumen.posts.find((p) => p.id === "p-root-canal")!.title = "edited in v1";
		const res = loadPersisted(null, JSON.stringify(v1From(seed)));
		expect(res.outcome).toBe("migrated");
		expect(res.lastSiteId).toBe("northwind");
		expect(res.note).toMatch(/v1 → v2/);
		expect(res.state.version).toBe(2);
		expect(res.state.sites).toHaveLength(8);
		expect(res.state.sites.find((x) => x.id === "lumen")).toMatchObject({ slug: "lumen", industry: "Dental clinics", status: "active" });
		expect(res.state.data.lumen.posts.find((p) => p.id === "p-root-canal")!.title).toBe("edited in v1");
		expect(res.state.jobs.map((j) => j.id)).toEqual(["job-1"]);
		expect("role" in res.state || "siteId" in res.state || "members" in res.state).toBe(false);
	});

	it("unknown or corrupt data reseeds instead of crashing", () => {
		expect(loadPersisted("{not json", null).outcome).toBe("reseeded");
		expect(loadPersisted(JSON.stringify({ version: 9 }), null).outcome).toBe("reseeded");
		expect(loadPersisted(null, JSON.stringify({ version: 1, sites: "nope" })).outcome).toBe("reseeded");
		expect(loadPersisted(null, null).outcome).toBe("seeded");
	});

	it("a tab with v1 in localStorage migrates on hydrate, writes v2 and removes the v1 key", () => {
		vi.useFakeTimers();
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		const bus = createMemoryStorageBus();
		bus.shared.set(V1_STATE_KEY, JSON.stringify(v1From(createSeed())));
		const st = createCmsStore({ env: bus.tab() });
		st.hydrate();
		expect(st.state.version).toBe(2);
		expect(bus.shared.has(V1_STATE_KEY)).toBe(false);
		expect(JSON.parse(bus.shared.get(STATE_KEY)!).version).toBe(2);
		expect(st.session.lastSiteId).toBe("northwind");
		expect(info).toHaveBeenCalledWith(expect.stringMatching(/\[cms\] Migrated/));
		st.stop();
		info.mockRestore();
		vi.useRealTimers();
	});
});

describe("two tabs", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("each tab is its own person; domain data converges through shared storage", () => {
		const bus = createMemoryStorageBus();
		const a = createCmsStore({ env: bus.tab() });
		const b = createCmsStore({ env: bus.tab() });
		a.hydrate();
		b.hydrate();
		a.workspaceActions.signInAs(KUNLE);
		expect(a.userId()).toBe(KUNLE);
		expect(b.userId()).toBe(TOLU);
		expect(JSON.parse(bus.tab().session!.getItem(SESSION_KEY) ?? "null")).toBeNull(); // sessions are per tab
		expect(b.actionsFor("lumen").addIdea("tooth gems: are they safe?").ok).toBe(true);
		expect(a.state.data.lumen.posts.some((p) => p.title === "tooth gems: are they safe?")).toBe(true);
		expect(a.state.data.lumen.audit[0]).toMatchObject({ actor: "Tolu B.", action: "added idea" });
		a.stop();
		b.stop();
	});

	it("a tab that missed the storage event re-applies its action to the fresh state (nothing lost)", () => {
		const bus = createMemoryStorageBus();
		const a = createCmsStore({ env: bus.tab() });
		const deaf = { ...bus.tab(), subscribe: undefined };
		const b = createCmsStore({ env: deaf });
		a.hydrate();
		b.hydrate();
		a.actionsFor("lumen").addIdea("first idea from tab a");
		expect(b.state.data.lumen.posts.some((p) => p.title === "first idea from tab a")).toBe(false); // stale in memory
		b.actionsFor("lumen").addIdea("second idea from tab b");
		const titles = (s: ICmsState) => s.data.lumen.posts.map((p) => p.title);
		expect(titles(b.state)).toEqual(expect.arrayContaining(["first idea from tab a", "second idea from tab b"]));
		expect(titles(a.state)).toEqual(expect.arrayContaining(["first idea from tab a", "second idea from tab b"]));
		a.stop();
		b.stop();
	});

	it("leader election: only one tab runs the job runner; the other takes over when it closes", () => {
		const bus = createMemoryStorageBus();
		const a = createCmsStore({ env: bus.tab() });
		const b = createCmsStore({ env: bus.tab() });
		a.hydrate();
		b.hydrate();
		expect([a.isLeader(), b.isLeader()]).toEqual([true, false]);
		// Autopost: approve in tab B; the brief job runs once, in tab A.
		expect(b.actionsFor("lumen").approveIdea("p-implants-last").ok).toBe(true);
		vi.advanceTimersByTime(1200);
		const post = (s: ICmsState) => s.data.lumen.posts.find((p) => p.id === "p-implants-last")!;
		expect(post(a.state).state).toBe("drafting");
		expect(post(b.state).state).toBe("drafting");
		const runs = (s: ICmsState) => s.data.lumen.runs.filter((r) => r.postId === "p-implants-last" && r.kind === "post-generation").length;
		expect(runs(a.state)).toBe(1);
		// Tab A closes mid-draft; B picks up the lease on its next heartbeat and finishes the pipeline exactly once.
		a.stop();
		vi.advanceTimersByTime(LEADER_HEARTBEAT_MS);
		expect(b.isLeader()).toBe(true);
		vi.advanceTimersByTime(900 * 9 + 2400 + 1600 + 2500 + 1400 + 1000);
		expect(post(b.state).state).toBe("live");
		expect(b.state.data.lumen.mergeRequests.filter((m) => m.postId === "p-implants-last")).toHaveLength(1);
		expect(runs(b.state)).toBe(1);
		b.stop();
	});

	it("a crashed leader (no release) loses the lease after it expires", () => {
		const bus = createMemoryStorageBus();
		const a = createCmsStore({ env: bus.tab() });
		const b = createCmsStore({ env: bus.tab() });
		a.hydrate();
		b.hydrate();
		expect(b.isLeader()).toBe(false);
		// Simulate a crash: A stops renewing but never releases the lease.
		(a as unknown as { running: boolean }).running = false;
		vi.advanceTimersByTime(LEADER_LEASE_MS + LEADER_HEARTBEAT_MS);
		expect(b.isLeader()).toBe(true);
		a.stop();
		b.stop();
	});
});
