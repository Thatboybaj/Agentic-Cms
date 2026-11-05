import { describe, expect, it } from "vitest";
import { DEMO_NOW, isoWeek } from "./clock";
import {
	INTENT_VALUE,
	applyKas,
	autopostDecision,
	checkCap,
	claimedButUnearned,
	computeKas,
	concentration,
	ctr,
	estimateRun,
	evaluateGate,
	fmtDelta,
	gapToProjection,
	ideaGate,
	ideaStatus,
	isPendingIdea,
	kasRawWeight,
	ledgerAge,
	ledgerStatus,
	lockReason,
	nextState,
	orphanWeight,
	pillarDistribution,
	postKas,
	roleCan,
	TRANSITIONS,
} from "./logic";
import { LUMEN_ID, NORTHWIND_ID, createSeed, seedCounts } from "./seed";
import type { IKeyword, IPost } from "./types";

const seed = createSeed();
const lumen = seed.data[LUMEN_ID];
const northwind = seed.data[NORTHWIND_ID];
const lumenSite = seed.sites.find((s) => s.id === LUMEN_ID)!;
const northwindSite = seed.sites.find((s) => s.id === NORTHWIND_ID)!;
const activeManifest = (id: string) => seed.data[id].manifests.find((m) => m.status === "confirmed") ?? null;
const P = (id: string): IPost => lumen.posts.find((p) => p.id === id)!;

const k = (id: string, impressions: number, position: number | null, intent: IKeyword["intent"], kasShare = 0): IKeyword => ({
	id,
	term: id,
	pillarId: "x",
	intent,
	difficulty: 20,
	difficultyEvidence: "KD 20 · SERP",
	impressions,
	position,
	positionTrend: [],
	kasShare,
	kasDelta: 0,
	rankingUrl: null,
	rankingPages: 1,
	decaying: false,
});

describe("clock", () => {
	it("pins the demo to Friday of ISO week 39", () => {
		expect(isoWeek(DEMO_NOW)).toBe(39);
		expect(new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Africa/Lagos" }).format(DEMO_NOW)).toBe("Friday");
	});
});

describe("Keyword Attribution Score", () => {
	it("CTR curve falls with position and is 0 when not ranking", () => {
		expect(ctr(1)).toBeGreaterThan(ctr(2));
		expect(ctr(7)).toBeGreaterThan(ctr(11));
		expect(ctr(null)).toBe(0);
		expect(ctr(1.5)).toBeCloseTo((ctr(1) + ctr(2)) / 2);
		expect(ctr(3, [0.5, 0.4, 0.3])).toBe(0.3); // configurable per client
	});

	it("applies intent multipliers 1.5 / 1.25 / 1.0 / 0.75", () => {
		expect(INTENT_VALUE).toEqual({ transactional: 1.5, commercial: 1.25, informational: 1.0, navigational: 0.75 });
		const base = kasRawWeight(k("a", 1000, 3, "informational"));
		expect(kasRawWeight(k("a", 1000, 3, "transactional"))).toBeCloseTo(base * 1.5);
		expect(kasRawWeight(k("a", 1000, 3, "commercial"))).toBeCloseTo(base * 1.25);
		expect(kasRawWeight(k("a", 1000, 3, "navigational"))).toBeCloseTo(base * 0.75);
	});

	it("normalises shares to sum to 100", () => {
		const shares = computeKas([k("a", 5000, 2, "commercial"), k("b", 800, 9, "transactional"), k("c", 20000, 18, "informational"), k("d", 0, null, "navigational")]);
		expect(shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 10);
		expect(shares.find((s) => s.keywordId === "d")!.share).toBe(0);
		const seeded = computeKas(lumen.keywords);
		expect(seeded.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 10);
	});

	it("reproduces the reference shares from seeded impressions and positions", () => {
		const recalculated = applyKas(lumen.keywords);
		const share = (id: string) => recalculated.find((x) => x.id === id)!.kasShare;
		expect(share("k-invisalign-cost")).toBe(18.4);
		expect(share("k-implants-lagos")).toBe(14.2);
		expect(share("k-whitening-price")).toBe(12.6);
		expect(share("k-emergency-lekki")).toBe(10.3);
	});

	it("returns all-zero shares when there is no data (never invent)", () => {
		expect(computeKas(northwind.keywords).every((s) => s.share === 0)).toBe(true);
	});

	it("flags top-5 concentration above 60% as fragile", () => {
		expect(concentration(lumen.keywords)).toMatchObject({ top: 64, fragile: true });
		const flat = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, kasShare: 10 }));
		expect(concentration(flat)).toMatchObject({ top: 50, fragile: false });
		expect(concentration([...flat.slice(0, 5).map((f) => ({ ...f, kasShare: 12 }))]).fragile).toBe(false); // exactly 60 is not fragile
	});

	it("derives pillar distribution, orphan weight and claimed-but-unearned", () => {
		const dist = pillarDistribution(lumen.keywords, lumen.pillars);
		expect(dist.map((d) => [d.name, d.share])).toEqual([
			["Orthodontics", 34],
			["Implants", 27],
			["Cosmetic", 22],
			["General", 14],
			["Pediatric", 3],
		]);
		expect(claimedButUnearned(lumen.pillars).map((p) => p.name)).toEqual(["Pediatric"]);
		expect(orphanWeight(lumen.keywords).keywordIds).toContain("k-implants-lagos");
		expect(postKas(P("p-live-invisalign"), lumen.keywords)).toBe(18.4);
		expect(postKas(P("p-live-whitening"), lumen.keywords)).toBe(15.9);
	});
});

describe("approval gate", () => {
	const gate = (id: string, overrides?: Record<string, string>) => {
		const post = P(id);
		return evaluateGate(post, lumen.slots, activeManifest(LUMEN_ID), overrides);
	};

	it("root canal: 2 hard blocks (open fact marker + keyword in section 2), 10 / 12 passing", () => {
		const g = gate("p-root-canal");
		expect(g.hard).toEqual(["1 unresolved fact marker", "Keyword in first 100 words · section 2"]);
		expect(g.soft.map((c) => c.id)).toEqual(["internal-links", "word-count"]);
		expect([g.passed, g.total]).toEqual([10, 12]);
		expect(g.canApprove).toBe(false);
	});

	it("fact markers can never be overridden", () => {
		const post = { ...P("p-root-canal"), gate: P("p-root-canal").gate.map((c) => ({ ...c, status: "pass" as const })) };
		const everything = Object.fromEntries([...post.gate.map((c) => c.id), ...post.facts.map((f) => f.id)].map((id) => [id, "Client signed this off"]));
		const g = evaluateGate(post, lumen.slots, activeManifest(LUMEN_ID), everything);
		expect(g.hard).toEqual(["1 unresolved fact marker"]);
		expect(g.canApprove).toBe(false);
	});

	it("a soft block unblocks only with a logged reason", () => {
		expect(gate("p-implant-vs-bridge").canApprove).toBe(false);
		expect(gate("p-implant-vs-bridge").hard).toEqual([]);
		expect(gate("p-implant-vs-bridge", { "internal-links": "   " }).canApprove).toBe(false);
		const ok = gate("p-implant-vs-bridge", { "internal-links": "Only one relevant page is live. The implants guide ships next week." });
		expect(ok.canApprove).toBe(true);
		expect(ok.soft[0].override?.reason).toMatch(/implants guide/);
	});

	it("hard-fails in sections 1–5 can't be overridden", () => {
		expect(gate("p-root-canal", { "kw-first-100": "fine", "internal-links": "x", "word-count": "y" }).hard).toContain("Keyword in first 100 words · section 2");
	});

	it("holds posts on unfilled slots and templates that can't render them", () => {
		expect(gate("p-invisalign-2026").hard).toContain("3 image slots unfilled");
		expect(gate("p-toothpaste").hard).toEqual(["Template has no table · developer must extend it"]);
		expect(evaluateGate(P("p-implant-vs-bridge"), lumen.slots, null).hard).toContain("No confirmed template manifest");
	});

	it("requires a disclaimer on regulated topics unless overridden", () => {
		const post = { ...P("p-implant-vs-bridge"), blocks: P("p-implant-vs-bridge").blocks.filter((b) => b.kind !== "disclaimer") };
		const g = evaluateGate(post, lumen.slots, activeManifest(LUMEN_ID), { "internal-links": "ok reason" });
		expect(g.soft.map((c) => c.id)).toContain("disclaimer");
		expect(g.canApprove).toBe(false);
		expect(evaluateGate(post, lumen.slots, activeManifest(LUMEN_ID), { "internal-links": "ok reason", disclaimer: "Legal cleared the copy" }).canApprove).toBe(true);
	});
});

describe("ledger", () => {
	it("goes overdue at 7 days and becomes a named blocker at 14", () => {
		expect([0, 6, 7, 13, 14, 30].map(ledgerStatus)).toEqual(["open", "open", "overdue", "overdue", "blocker", "blocker"]);
	});
	it("ages seeded items to 15 / 9 / 3 / 2 days on the demo clock", () => {
		expect(lumen.ledger.map((l) => ledgerAge(l, DEMO_NOW))).toEqual([15, 9, 3, 2]);
		expect(lumen.ledger.map((l) => ledgerStatus(ledgerAge(l, DEMO_NOW)))).toEqual(["blocker", "overdue", "open", "open"]);
	});
});

describe("cost caps", () => {
	it("refuses over the cap with a clear message", () => {
		const est = estimateRun("keyword-swarm", northwindSite);
		const c = checkCap(northwindSite, "keyword-swarm", est);
		expect(c.status).toBe("refused");
		expect(c.message).toBe("Refused: est. $4.20 would take text spend to $100.70, over the $100.00 monthly cap. An admin can raise the cap.");
	});
	it("warns at 80% and allows below", () => {
		expect(checkCap(lumenSite, "keyword-swarm", estimateRun("keyword-swarm", lumenSite))).toMatchObject({ status: "allowed", message: "Est. $4.20 · within text cap" });
		expect(checkCap(lumenSite, "image-generation", 18).status).toBe("warn"); // 160 / 200 = 80%
		expect(checkCap(lumenSite, "image-generation", 17.99).status).toBe("allowed");
	});
	it("routes pillar and money pages to the strongest model", () => {
		expect(estimateRun("post-generation", lumenSite, { strongModel: true })).toEqual({ usd: 3.6, budget: "text", tier: "strongest" });
		expect(estimateRun("post-generation", lumenSite)).toEqual({ usd: 1.8, budget: "text", tier: "workhorse" });
	});
});

describe("post state machine", () => {
	it("rejects skipping the gate", () => {
		const r = nextState("in-review", "live");
		expect(r.ok).toBe(false);
		expect(nextState("drafting", "mr-open").ok).toBe(false);
		expect(nextState("idea", "live").ok).toBe(false);
	});
	it("allows the PRD path and the refresh loop", () => {
		const path = ["idea", "briefed", "drafting", "needs-assets", "in-review", "mr-open", "live", "decaying", "drafting"] as const;
		for (let i = 0; i < path.length - 1; i++) expect(nextState(path[i], path[i + 1])).toEqual({ ok: true, state: path[i + 1] });
		expect(Object.entries(TRANSITIONS).filter(([, to]) => to.includes("live")).map(([from]) => from)).toEqual(["mr-open"]);
		expect(Object.entries(TRANSITIONS).filter(([, to]) => to.includes("mr-open")).map(([from]) => from)).toEqual(["in-review"]);
	});
});

describe("trajectory", () => {
	it("gap to projection is −6.2% for the seed", () => {
		expect(gapToProjection(lumen.trajectory)).toEqual({ pct: -6.2, actual: 3184, projected: 3395, week: "W39" });
		expect(fmtDelta(-6.2)).toBe("−6.2");
	});
	it("is a data gap (null) when the latest week has no data", () => {
		expect(gapToProjection(northwind.trajectory)).toBeNull();
		expect(northwind.trajectory.filter((p) => p.sessions === null).length).toBeGreaterThan(0);
	});
});

describe("roles", () => {
	it("follows the PRD roles table", () => {
		expect(roleCan("stakeholder", "post.comment")).toBe(true);
		expect(["post.approve", "run.trigger", "post.edit"].some((p) => roleCan("stakeholder", p as never))).toBe(false);
		expect(roleCan("developer", "post.approve")).toBe(false);
		expect(roleCan("developer", "mr.merge")).toBe(true);
		expect(roleCan("specialist", "mr.merge")).toBe(false);
		expect(roleCan("specialist", "budget.set")).toBe(false);
		expect(roleCan("admin", "budget.set")).toBe(true);
		expect(lockReason("stakeholder", "post.approve")).toBe("Stakeholders can view and comment only");
		expect(lockReason("specialist", "post.approve")).toBeNull();
	});
});

describe("idea approval + autopost (C10/C11)", () => {
	const gateOf = (post: IPost) => evaluateGate(post, lumen.slots, activeManifest(LUMEN_ID));
	const decide = (post: IPost, site = lumenSite) => autopostDecision(post, gateOf(post), site);

	it("ideas can't advance without approval", () => {
		const idea = P("p-implants-last");
		expect(isPendingIdea(idea)).toBe(true);
		expect(ideaGate(idea)).toBe("Approve the idea first. Only approved ideas become briefs");
		expect(ideaGate({ ...idea, ideaApproval: { status: "approved", by: "Tolu B." } })).toBeNull();
		expect(ideaGate({ ...idea, ideaApproval: { status: "rejected" } })).toBe("This idea was rejected");
		expect(ideaStatus(P("p-sedation"))).toBe("approved"); // past Idea = approved
		expect(roleCan("specialist", "idea.approve")).toBe(true);
		expect(roleCan("stakeholder", "idea.approve")).toBe(false);
		expect(roleCan("specialist", "publishing.set")).toBe(true);
		expect(roleCan("specialist", "publishing.autoMerge")).toBe(false);
		expect(roleCan("admin", "publishing.autoMerge")).toBe(true);
	});

	it("seeds Lumen with autopost on and Northwind with autopost off", () => {
		expect(lumenSite.publishing).toEqual({ autopost: true, autoMergeOnGreenCi: true });
		expect(northwindSite.publishing.autopost).toBe(false);
	});

	it("ships a clean post, accepting its soft block with a logged reason", () => {
		const d = decide(P("p-implant-vs-bridge"));
		expect(d.action).toBe("ship");
		expect(d.fixes).toEqual(["Accepted soft block · Internal links 1 of 2"]);
	});

	it("fixes an open fact marker (and a fixable hard check) before shipping", () => {
		const d = decide(P("p-root-canal"));
		expect(d.action).toBe("ship");
		expect(d.plan.map((f) => f.kind)).toEqual(["fact", "check", "soft-accept", "soft-accept"]);
		expect(d.fixes[0]).toMatch(/^Rewrite without unsourced claim/);
	});

	it("holds when the template can't render the post", () => {
		expect(decide(P("p-toothpaste"))).toMatchObject({ action: "hold", reason: "Template can't render the post · no table in the manifest" });
		expect(autopostDecision(P("p-implant-vs-bridge"), evaluateGate(P("p-implant-vs-bridge"), lumen.slots, null), lumenSite).reason).toBe("Template can't render the post · no confirmed manifest");
	});

	it("holds when fixes would go over the budget cap", () => {
		const broke = { ...lumenSite, budgets: { ...lumenSite.budgets, textUsd: lumenSite.budgets.textCapUsd } };
		const d = decide(P("p-root-canal"), broke);
		expect(d.action).toBe("hold");
		expect(d.reason).toMatch(/^Over the text budget cap/);
		// A clean post needs no paid fixes, so the cap doesn't hold it.
		expect(decide(P("p-implant-vs-bridge"), broke).action).toBe("ship");
	});

	it("holds on provider failure, a person's human-only slot and hard checks the agent can't fix", () => {
		const post = P("p-implant-vs-bridge");
		const slots = lumen.slots.map((s) => (s.postId === post.id ? { ...s, status: "failed" as const } : s));
		expect(autopostDecision(post, evaluateGate(post, slots, activeManifest(LUMEN_ID)), lumenSite).reason).toMatch(/^Image provider failed/);
		const pinned = lumen.slots.map((s) => (s.postId === post.id ? { ...s, status: "human-only" as const, humanPinned: true } : s));
		expect(autopostDecision(post, evaluateGate(post, pinned, activeManifest(LUMEN_ID)), lumenSite).reason).toMatch(/^Waiting on a human-made image/);
		const dense = { ...post, gate: post.gate.map((c) => (c.id === "density" ? { ...c, status: "fail" as const } : c)) };
		expect(decide(dense).reason).toBe("On-page check needs a person · Density (section 2)");
	});

	it("autopost off → human review", () => {
		const off = { ...lumenSite, publishing: { autopost: false, autoMergeOnGreenCi: false } };
		expect(decide(P("p-implant-vs-bridge"), off)).toMatchObject({ action: "hold", reason: "Autopost is off · a person reviews every post" });
		expect(decide(P("p-implant-vs-bridge"), northwindSite).action).toBe("hold");
	});
});

describe("seed", () => {
	it("covers every post state with the reference counts", () => {
		expect(seedCounts(lumen)).toEqual({ idea: 12, briefed: 3, drafting: 2, "needs-assets": 2, "in-review": 3, "mr-open": 3, live: 41, decaying: 5 });
	});
	it("is deterministic and serialisable", () => {
		expect(JSON.parse(JSON.stringify(createSeed()))).toEqual(createSeed());
	});
	it("keeps every reference internally consistent", () => {
		const d = lumen;
		for (const p of d.posts) {
			expect(d.keywords.some((kw) => kw.id === p.keywordId)).toBe(true);
			expect(d.pillars.some((pl) => pl.id === p.pillarId)).toBe(true);
			for (const s of p.slotIds) expect(d.slots.find((x) => x.id === s)?.postId).toBe(p.id);
			if (p.mrId) expect(d.mergeRequests.some((m) => m.id === p.mrId)).toBe(true);
		}
		expect(new Set(d.posts.map((p) => p.id)).size).toBe(d.posts.length);
		expect(d.schedules).toHaveLength(9);
		expect(d.trajectory).toHaveLength(8);
	});
});
