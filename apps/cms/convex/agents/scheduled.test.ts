// Handoff 03 slice 3: swarm evidence guard, QA scorecard number guard, refresh targeting (rank data only with GSC).
import { describe, expect, test } from "vitest";
import { qaScorecard, refreshCandidates, safeIdeas, type IQaDigest, type TSwarmOutput } from "./scheduledCore";

const idea = (term: string, urls: string[], priority = 3): TSwarmOutput["ideas"][number] => ({ term, pillar: "Implants", intent: "informational", volumeTier: "medium", difficulty: 140, evidence: "Forums rank", evidenceUrls: urls, suggestedTitle: `${term} guide`, contentType: "guide", priority });

describe("keyword swarm guard", () => {
	test("keeps evidence-backed new ideas; drops invented evidence, rejected and existing terms", () => {
		const out: TSwarmOutput = { ideas: [idea("implant aftercare", ["https://a.com/x"]), idea("Implant Cost", ["https://a.com/x"]), idea("bone graft pain", ["https://invented.com"]), idea("cheap implants", ["https://a.com/x"])], communityPhrases: [], clusterGaps: [], delta: "" };
		const r = safeIdeas(out, { sources: ["https://a.com/x/"], existing: ["implant cost"], rejected: ["cheap implants"], pillars: ["Implants"], max: 10 });
		expect(r.ideas.map((i) => [i.term, i.pillar, i.difficulty])).toEqual([["implant aftercare", "Implants", 100]]);
		expect(r.dropped.join(" ")).toMatch(/bone graft pain: no ranking evidence/);
		expect(r.dropped.join(" ")).toMatch(/cheap implants: rejected/);
	});
});

describe("QA scorecard", () => {
	const d: IQaDigest = { siteName: "Lumen", mode: "light", findings: [{ key: "cadence", kind: "progress", status: "BEHIND", detail: "2 posts live in 30 days vs a target of 13" }], ledger: { open: 4, overdue: 1, blockers: 0, oldestDays: 9 }, cadence: { target: 13, liveLast30: 2 } };
	test("uses the model's prose when every number is in the digest, else the plain card", () => {
		expect(qaScorecard({ headline: "Behind cadence: 2 of 13", scorecardMd: "4 open, 1 overdue." }, d).fromModel).toBe(true);
		const fallback = qaScorecard({ headline: "Behind by 40%", scorecardMd: "x" }, d);
		expect(fallback.fromModel).toBe(false);
		expect(fallback.md).toContain("**BEHIND** · 2 posts live in 30 days vs a target of 13");
	});
});

describe("refresh targeting", () => {
	const posts = [
		{ id: "p1", title: "Implant prices 2024", text: "", position: 14, decaying: true, impressions: 100 },
		{ id: "p2", title: "Veneers", text: "Updated for 2026.", position: 15, decaying: false, impressions: 50 },
	];
	test("without Search Console only stale years count; with it, page-2 and decay lead", () => {
		expect(refreshCandidates(posts, { year: 2026, gsc: false, capacity: 2 }).map((c) => [c.postId, c.reason])).toEqual([["p1", "stale year 2024"]]);
		expect(refreshCandidates(posts, { year: 2026, gsc: true, capacity: 2 }).map((c) => c.postId)).toEqual(["p1", "p2"]);
	});
});
