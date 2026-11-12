import { describe, expect, it } from "vitest";
import { behaviourHash, evalPassed, gradeDiscovery, overlaps, type IEvalInput, type IGolden } from "./evalCore";
import { GOLDEN, goldenFor } from "./golden";

const G: IGolden = {
	id: "t",
	domain: "lumendental.co",
	industry: "dental",
	expectedPillars: ["Dental implants", "Orthodontics and clear aligners", "Children's dentistry"],
	coveredTopics: ["Teeth whitening guide"],
	regulated: "health",
	source: "test",
	confirmed: true,
};
const L = "https://lumendental.co";
const base: IEvalInput = {
	status: "succeeded",
	pillars: ["Dental implants", "Clear aligners", "Kids dentistry"],
	ideas: [
		{ title: "Dental implants in Lagos: the complete guide", keyword: "dental implants lagos", evidence: [`${L}/implants`], internalLinks: [`${L}/implants`] },
		{ title: "Clear aligners vs braces for adults", keyword: "clear aligners vs braces", evidence: [`${L}/orthodontics`, "gsc:clear aligners"], internalLinks: [] },
	],
	crawled: [`${L}/`, `${L}/implants`, `${L}/orthodontics`, `${L}/kids`],
	profileCategory: "health",
	disclaimers: ["This article is general information, not medical advice."],
};
const byId = (r: ReturnType<typeof gradeDiscovery>, id: string) => r.find((c) => c.id === id)!;

describe("site discovery eval", () => {
	it("passes a good result", () => {
		const r = gradeDiscovery(G, base);
		expect(r.map((c) => [c.id, c.passed])).toEqual([["pillars", true], ["covered", true], ["evidence", true], ["disclaimer", true], ["diversity", true]]);
		expect(evalPassed(r)).toBe(true);
	});

	it("matches pillars by topic, not exact wording", () => {
		expect(overlaps("Orthodontics and clear aligners", "Clear aligners")).toBe(true);
		expect(overlaps("Dental implants", "Teeth whitening")).toBe(false);
	});

	it("fails low pillar overlap", () => {
		const c = byId(gradeDiscovery(G, { ...base, pillars: ["Dental implants"] }), "pillars");
		expect(c.passed).toBe(false);
		expect(c.score).toBeCloseTo(1 / 3);
	});

	it("catches ideas on covered topics, uncrawled evidence and duplicate keywords", () => {
		const r = gradeDiscovery(G, {
			...base,
			ideas: [...base.ideas, { title: "Teeth whitening guide", keyword: "teeth whitening guide", evidence: ["https://other.example/x"], internalLinks: [] }, { title: "Implants cost", keyword: "dental implants lagos", evidence: [`${L}/implants`], internalLinks: [] }],
		});
		expect(byId(r, "covered").passed).toBe(false);
		expect(byId(r, "evidence").detail).toContain("other.example");
		expect(byId(r, "diversity").passed).toBe(false);
	});

	it("needs the regulated category and a disclaimer", () => {
		expect(byId(gradeDiscovery(G, { ...base, disclaimers: [] }), "disclaimer").passed).toBe(false);
		expect(byId(gradeDiscovery({ ...G, regulated: "none" }, base), "disclaimer").passed).toBe(false);
	});

	it("grades the edge cases", () => {
		expect(evalPassed(gradeDiscovery({ ...G, edge: "robots-blocked" }, { ...base, status: "needs-interview" }))).toBe(true);
		expect(evalPassed(gradeDiscovery({ ...G, edge: "robots-blocked" }, base))).toBe(false);
		expect(gradeDiscovery({ ...G, edge: "js-only" }, { ...base, status: "failed" })[0]!.passed).toBe(false);
	});

	it("hashes behaviour stably", () => {
		expect(behaviourHash(["a", "b"])).toBe(behaviourHash(["a", "b"]));
		expect(behaviourHash(["a", "b"])).not.toBe(behaviourHash(["a", "c"]));
	});

	it("has baynor.qa in the golden set", () => {
		expect(goldenFor("www.baynor.qa")?.id).toBe("baynor-qa");
		for (const g of GOLDEN) expect(g.expectedPillars.length).toBeGreaterThan(2);
	});
});
