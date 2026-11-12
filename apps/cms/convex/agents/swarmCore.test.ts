import { describe, expect, it } from "vitest";
import { funnelMix, ltmCsv, mergeUpsert, normalize, specialistSkill, type TClusterRow, type TPrioritizeRow } from "./swarmCore";

const row = (term: string, over: Partial<TClusterRow> = {}): TClusterRow => ({
	term,
	pillar: "Customer support automation",
	cluster: "WhatsApp",
	lengthClass: "long-tail",
	role: "primary",
	primaryFor: "",
	intent: "commercial",
	funnel: "mofu",
	volumeTier: "medium",
	difficultyTier: "low",
	difficultyEvidence: "Forums and thin pages rank",
	serpFeatures: ["paa"],
	aeoPotential: "high",
	evidenceUrls: ["https://reddit.com/r/smallbusiness/x"],
	...over,
});
const pr = (term: string, over: Partial<TPrioritizeRow> = {}): TPrioritizeRow => ({ term, status: "qualified", priorityScore: 70, whyWeWin: "We build exactly this for Qatar clinics", retiredReason: "", suggestedTitle: `${term} guide`, contentType: "guide", ...over });
const ctx = { pillars: ["Customer support automation"], ltm: [{ term: "whatsapp business automation qatar", pillar: "Customer support automation", cluster: "WhatsApp", role: "primary", status: "live", intent: "commercial" }], rejected: ["cheap chatbot"], sources: ["https://reddit.com/r/smallbusiness/x/"], gsc: [{ query: "whatsapp ai qatar", impressions: 120, position: 11.2 }] };

describe("keyword swarm v0.3 merge rules", () => {
	it("bundles a skill per specialist", () => {
		expect(specialistSkill("metrics-analyst").text).toContain("Metrics analyst");
	});

	it("keeps evidence-backed rows, demotes a newcomer on a live primary's page to secondary", () => {
		const { rows } = mergeUpsert([row("whatsapp auto replies for clinics")], [pr("whatsapp auto replies for clinics")], ctx);
		expect(rows[0]).toMatchObject({ status: "qualified", role: "secondary", primaryFor: "whatsapp business automation qatar", funnel: "consideration", volumeSource: "estimate", difficulty: 20 });
		expect(rows[0]!.idea).toBeUndefined(); // secondaries get no post of their own
	});

	it("dedupes against the LTM and rejected terms, drops unknown pillars", () => {
		const { rows, dropped } = mergeUpsert([row("WhatsApp business automation Qatar"), row("cheap chatbots"), row("x", { pillar: "Made up" })], [pr("whatsapp business automation qatar"), pr("cheap chatbots"), pr("x")], ctx);
		expect(rows).toHaveLength(0);
		expect(dropped.join(" ")).toMatch(/already in the LTM.*rejected before.*isn't one of the site's pillars/);
	});

	it("retires rows with no honest win or no evidence the run saw; never invents a volume", () => {
		const { rows } = mergeUpsert([row("ai booking bot", { cluster: "Booking" }), row("ai receptionist", { cluster: "Front desk", evidenceUrls: ["https://made-up.example/page"] })], [pr("ai booking bot", { whyWeWin: "" }), pr("ai receptionist")], ctx);
		expect(rows.map((r) => [r.term, r.status, r.retiredReason])).toEqual([
			["ai booking bot", "retired", "no honest why_we_win"],
			["ai receptionist", "retired", "no evidence the run saw"],
		]);
		expect(rows.every((r) => r.volume === undefined)).toBe(true);
	});

	it("takes volume only from Search Console and flags striking-distance quick wins", () => {
		const { rows } = mergeUpsert([row("whatsapp ai qatar", { cluster: "AI agents", evidenceUrls: [] })], [pr("whatsapp ai qatar")], ctx);
		expect(rows[0]).toMatchObject({ status: "qualified", volumeSource: "gsc", volume: 120, quickWin: true, evidenceUrls: ["gsc:whatsapp ai qatar"], idea: { suggestedTitle: "whatsapp ai qatar guide" } });
		expect(rows[0]!.priorityScore).toBe(80);
	});

	it("checks the funnel mix and writes the CSV", () => {
		const { rows } = mergeUpsert([row("a b c", { cluster: "One", funnel: "tofu" }), row("d e f", { cluster: "Two", funnel: "tofu" }), row("g h i", { cluster: "Three", funnel: "bofu" })], [pr("a b c"), pr("d e f"), pr("g h i")], ctx);
		expect(funnelMix(rows)).toMatchObject({ ok: true });
		expect(funnelMix(rows.filter((r) => r.funnel === "awareness")).ok).toBe(false);
		expect(ltmCsv(rows).split("\n")[0]).toContain("why_we_win");
		expect(normalize("The Best Clinics?")).toBe("best clinic");
	});
});
