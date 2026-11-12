import { describe, expect, it } from "vitest";
import { personJsonLd, resolveAuthor, rubricFor, slugify, type IDesignationLite, type IRubricLite } from "./authorsCore";

const rubrics: IRubricLite[] = [
	{ id: "r-ortho", pillarIds: ["p-ortho"], clusters: [], rotation: "rotate" },
	{ id: "r-aligners", pillarIds: [], clusters: ["p-ortho|clear aligners"], rotation: "primary-only" },
];
const des: IDesignationLite[] = [
	{ rubricId: "r-ortho", authorId: "amaka", role: "author", primary: true },
	{ rubricId: "r-ortho", authorId: "tunde", role: "author", primary: false },
	{ rubricId: "r-ortho", authorId: "dr-ola", role: "reviewer", primary: true },
	{ rubricId: "r-aligners", authorId: "tunde", role: "author", primary: true },
];
const base = { rubrics, designations: des, defaultAuthorId: "olayinka", postsByAuthorInRubric: () => ({}) };

describe("author resolution", () => {
	it("a cluster rubric beats its pillar's rubric", () => {
		expect(rubricFor({ pillarId: "p-ortho", cluster: "Clear Aligners" }, rubrics)?.id).toBe("r-aligners");
		expect(rubricFor({ pillarId: "p-ortho", cluster: "braces" }, rubrics)?.id).toBe("r-ortho");
		expect(rubricFor({ pillarId: "p-other" }, rubrics)).toBeUndefined();
	});

	it("override → rubric → default, carrying the rubric's reviewer", () => {
		expect(resolveAuthor({ ...base, overrideAuthorId: "x", keyword: { pillarId: "p-ortho" } })).toEqual({ authorId: "x", rubricId: "r-ortho", reviewerId: "dr-ola", source: "override" });
		expect(resolveAuthor({ ...base, keyword: { pillarId: "p-ortho", cluster: "clear aligners" } })).toEqual({ authorId: "tunde", rubricId: "r-aligners", source: "rubric" });
		expect(resolveAuthor({ ...base, keyword: { pillarId: "p-other" } })).toEqual({ authorId: "olayinka", source: "default" });
		expect(resolveAuthor({ ...base, keyword: null })).toEqual({ authorId: "olayinka", source: "default" });
	});

	it("rotates by post count, primary winning ties", () => {
		expect(resolveAuthor({ ...base, keyword: { pillarId: "p-ortho" } }).authorId).toBe("amaka");
		expect(resolveAuthor({ ...base, keyword: { pillarId: "p-ortho" }, postsByAuthorInRubric: () => ({ amaka: 3, tunde: 1 }) }).authorId).toBe("tunde");
	});

	it("a rubric without authors falls back to the default (Baynor)", () => {
		expect(resolveAuthor({ rubrics: [{ id: "r", pillarIds: ["p"], clusters: [], rotation: "rotate" }], designations: [], defaultAuthorId: "olayinka", keyword: { pillarId: "p" }, postsByAuthorInRubric: () => ({}) })).toEqual({ authorId: "olayinka", rubricId: "r", source: "default" });
	});
});

describe("Person JSON-LD", () => {
	it("omits empty fields", () => {
		expect(personJsonLd({ name: "Olayinka Adeyefa", image: { src: "/assets/blog/authors/olayinka-adeyefa-400.webp", width: 400, height: 400, alt: "Photo of Olayinka Adeyefa" } })).toEqual({ "@type": "Person", name: "Olayinka Adeyefa", image: "/assets/blog/authors/olayinka-adeyefa-400.webp" });
		expect(personJsonLd({ name: "A", jobTitle: "Lead", url: "https://x/about", sameAs: ["https://linkedin.com/in/a"], bio: "Bio" })).toMatchObject({ jobTitle: "Lead", url: "https://x/about", sameAs: ["https://linkedin.com/in/a"], description: "Bio" });
		expect(slugify("Olayinka Adéyefa")).toBe("olayinka-adeyefa");
	});
});
