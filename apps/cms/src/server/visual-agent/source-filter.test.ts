import { describe, expect, it } from "vitest";
import { acceptLicense, isRelevant, looksUnsafe, queriesFor, rankByShape } from "./source-filter";
import type { TAgentSlot } from "./types";

const slot = (alt: string): TAgentSlot => ({ id: "s", name: "n", type: "photo", placement: "", width: 1200, height: 800, alt, prompt: "", styleKeywords: [], provider: "human", model: "—" });

describe("queriesFor", () => {
	it("drops proper nouns (client, place), people words and stopwords; broadens progressively", () => {
		const q = queriesFor(slot("Reception desk at the Lumen Dental clinic in Lekki"), "invisalign cost in lagos 2026");
		expect(q[0]).toBe("reception desk clinic");
		expect(q.join(" ")).not.toMatch(/lumen|lekki/i);
		expect(q).toContain("invisalign lagos");
	});
	it("never searches for people", () => {
		const q = queriesFor(slot("Patient holding a clear aligner case at a dental clinic in Lagos"), "k");
		expect(q[0]).toBe("clear aligner case dental");
		expect(q.join(" ")).not.toMatch(/patient|holding|lagos/i);
	});
});

describe("acceptLicense", () => {
	const commercial = { palette: [], styleKeywords: [] };
	it("accepts CC0, PD, BY, BY-SA and stock licenses", () => {
		for (const code of ["cc0", "pdm", "by", "by-sa", "CC BY-SA 4.0", "Public domain", "unsplash", "pexels"]) expect(acceptLicense({ licenseCode: code, license: code }, commercial)).toBe(true);
	});
	it("refuses NC on commercial sites and ND always, unless the brand pack allows", () => {
		expect(acceptLicense({ licenseCode: "by-nc", license: "CC BY-NC 2.0" }, commercial)).toBe(false);
		expect(acceptLicense({ licenseCode: "by-nc", license: "CC BY-NC 2.0" }, { ...commercial, allowNonCommercial: true })).toBe(true);
		expect(acceptLicense({ licenseCode: "by-nd", license: "CC BY-ND 2.0" }, commercial)).toBe(false);
		expect(acceptLicense({ licenseCode: "by-nd", license: "CC BY-ND 2.0" }, { ...commercial, allowNoDerivatives: true })).toBe(true);
	});
	it("refuses unknown licenses", () => {
		expect(acceptLicense({ licenseCode: "gfdl", license: "GFDL" }, commercial)).toBe(false);
		expect(acceptLicense({ licenseCode: "", license: "Unknown license" }, commercial)).toBe(false);
	});
});

describe("looksUnsafe + rankByShape", () => {
	it("flags people, watermarks and logos from titles/tags", () => {
		expect(looksUnsafe({ title: "Smiling patient", tags: [] })).toBe(true);
		expect(looksUnsafe({ title: "Clinic", tags: ["woman", "dental"] })).toBe(true);
		expect(looksUnsafe({ title: "Clinic logo", tags: [] })).toBe(true);
		expect(looksUnsafe({ title: "Reception desk", tags: ["clinic", "interior"] })).toBe(false);
	});
	it("drops tiny images and prefers the slot's shape", () => {
		const ranked = rankByShape([{ width: 300, height: 200 }, { width: 800, height: 1600 }, { width: 1500, height: 1000 }], 1200, 800);
		expect(ranked).toEqual([{ width: 1500, height: 1000 }, { width: 800, height: 1600 }]);
	});
});

describe("isRelevant", () => {
	it("needs two query terms in title/tags (one for single-term queries)", () => {
		expect(isRelevant({ title: "Three Planets Dance Over La Silla", tags: ["clear", "sky"] }, "clear aligner case")).toBe(false);
		expect(isRelevant({ title: "Invisalign clear aligners", tags: ["dental"] }, "clear aligner case")).toBe(true);
		expect(isRelevant({ title: "Invisalign trays", tags: [] }, "invisalign")).toBe(true);
	});
});
