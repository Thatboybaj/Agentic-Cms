// Handoff 03 slice 2: the on-page audit (the optimizer's 12 checks, counted) and the CMS agent's no-invention guard.
import { describe, expect, test } from "vitest";
import { auditOnPage, fkGrade } from "../lib/onpage";
import { editUserPrompt, guardEdit, safeEdits, type IEditPost, type TEditTask } from "./editorCore";

const post: IEditPost = {
	keyword: "dental implants cost",
	siteName: "Lumen Dental",
	seoTitle: "Dental implants cost in Lagos: a guide",
	blocks: [
		{ id: "b1", kind: "p", text: "Dental implants cost between ₦1.2m and ₦2.5m per tooth in Lagos." },
		{ id: "b2", kind: "h2", text: "What changes the price?" },
		{ id: "b3", kind: "p", text: "95% of implants last ten years. Bone grafting adds to the bill." },
		{ id: "b4", kind: "disclaimer", text: "General information, not medical advice." },
	],
	internalLinks: [{ title: "veneers", url: "/blog/veneers" }],
};
const rewrite: TEditTask = { id: "t1", type: "rewrite-claim", claim: "95% of implants last ten years", blockId: "b3" };
const instruct: TEditTask = { id: "t2", type: "instruct", instruction: "add a link to veneers" };

describe("no-invention guard", () => {
	test("drops an edit that adds a number, an unlisted URL, or keeps the claim", () => {
		expect(guardEdit({ taskId: "t1", blockId: "b3", op: "replace", kind: "p", text: "Most implants last 25 years. Bone grafting adds to the bill." }, post, rewrite)).toMatch(/adds numbers.*25/);
		expect(guardEdit({ taskId: "t1", blockId: "b3", op: "replace", kind: "p", text: "Studies say 95% of implants last ten years." }, post, rewrite)).toMatch(/still there/);
		// Keeping the claim's neutral lead-in while dropping its figure is a valid rewrite (first live run caught this).
		const lead: TEditTask = { id: "t3", type: "rewrite-claim", claim: "the titanium post can last 20 years", blockId: "b5" };
		const p2 = { ...post, blocks: [...post.blocks, { id: "b5", kind: "p", text: "With care, the titanium post can last 20 years." }] };
		expect(guardEdit({ taskId: "t3", blockId: "b5", op: "replace", kind: "p", text: "With care, the titanium post can last a very long time." }, p2, lead)).toBeNull();
		const words: TEditTask = { id: "t4", type: "rewrite-claim", claim: "dentists agree implants are best", blockId: "b6" };
		const p3 = { ...post, blocks: [...post.blocks, { id: "b6", kind: "p", text: "Dentists agree implants are best. Ask yours." }] };
		expect(guardEdit({ taskId: "t4", blockId: "b6", op: "replace", kind: "p", text: "Dentists agree implants are best, so ask yours." }, p3, words)).toMatch(/still there/);
		expect(guardEdit({ taskId: "t2", blockId: "b1", op: "replace", kind: "p", text: "See [the ADA](https://ada.org) for prices." }, post, instruct)).toMatch(/isn't on the site's list/);
		expect(guardEdit({ taskId: "t2", blockId: "b4", op: "replace", kind: "p", text: "x" }, post, instruct)).toMatch(/disclaimers/);
		expect(guardEdit({ taskId: "t9", blockId: "b1", op: "replace", kind: "p", text: "x" }, post, undefined)).toMatch(/no task/);
	});

	test("keeps a clean rewrite and a link to a listed URL", () => {
		expect(guardEdit({ taskId: "t1", blockId: "b3", op: "replace", kind: "p", text: "Most implants last for many years with good care. Bone grafting adds to the bill." }, post, rewrite)).toBeNull();
		expect(guardEdit({ taskId: "t2", blockId: "b1", op: "replace", kind: "p", text: "Dental implants cost between ₦1.2m and ₦2.5m per tooth in Lagos. Compare [veneers](/blog/veneers)." }, post, instruct)).toBeNull();
	});

	test("title and meta description changes are length- and number-checked", () => {
		const r = safeEdits({ edits: [], seoTitle: "Dental implants cost in Lagos: the complete 2027 guide to prices", metaDescription: "Too short.", notes: "" }, post, [instruct]);
		expect(r.seoTitle).toBeUndefined();
		expect(r.metaDescription).toBeUndefined();
		expect(r.dropped.join(" ")).toMatch(/seoTitle: adds numbers/);
		const ok = safeEdits({ edits: [], seoTitle: "Dental implants cost in Lagos", metaDescription: "What dental implants cost in Lagos, what changes the price per tooth, and the questions to ask your dentist before you book a consultation.", notes: "" }, post, [instruct]);
		expect(ok.seoTitle).toBe("Dental implants cost in Lagos");
		expect(ok.metaDescription).toBeDefined();
	});

	test("the prompt lists tasks and only this post's data", () => {
		const p = editUserPrompt(post, [rewrite, instruct]);
		expect(p).toContain('- t1 · rewrite-claim (block b3): "95% of implants last ten years"');
		expect(p).toContain("[b4 · disclaimer]");
		expect(p).toContain("/blog/veneers");
	});
});

describe("on-page audit (12 checks, counted)", () => {
	const base = {
		title: "dental implants cost",
		seoTitle: "Dental implants cost in Lagos: a guide",
		metaDescription: "What dental implants cost in Lagos, what changes the price per tooth, and the questions to ask your dentist before you book a consultation.",
		keyword: "dental implants cost",
		domain: "lumendental.co",
		blocks: [
			{ kind: "p", text: "Dental implants cost between ₦1.2m and ₦2.5m per tooth. " + "The price depends on the implant and the crown. ".repeat(20) },
			{ kind: "h2", text: "How much do dental implants cost?" },
			{ kind: "p", text: "See [veneers](/blog/veneers) and [crowns](/blog/crowns), and the [ADA guidance](https://www.ada.org/implants). " + "Ask about grafting. ".repeat(30) },
			{ kind: "faq", text: "Does it hurt?\nNo." },
			{ kind: "faq", text: "How long?\nA few months." },
			{ kind: "faq", text: "Is it safe?\nYes." },
			{ kind: "faq", text: "Can I eat?\nYes." },
		],
		slots: [{ alt: "A dentist holding an implant model", status: "selected" }],
	};

	test("a well-formed draft passes every check, with counted values", () => {
		const out = Object.fromEntries(auditOnPage(base).map((c) => [c.checkId, `${c.status} · ${c.value}`]));
		expect(Object.keys(out)).toHaveLength(12);
		expect(out).toMatchObject({
			"title-front": "pass · Keyword at word 1",
			"title-length": "pass · 38 / 60",
			"kw-first-100": "pass · Word 1",
			headings: "pass · 1 H2",
			"meta-description": expect.stringMatching(/^pass/),
			"alt-text": "pass · 1 of 1",
			"external-links": "pass · 1 source",
			"internal-links": "pass · 2 of 2",
			faq: "pass · 4 questions",
			schema: "pass · Article · FAQPage",
		});
		expect(out.density).toMatch(/^(pass|warn)/);
	});

	test("missing keyword, long title, no meta, no sources, H3 first: each fails or warns as the gate expects", () => {
		const bad = auditOnPage({ ...base, seoTitle: "A very long meta title that goes on and on about lots of things in Lagos", metaDescription: undefined, blocks: [{ kind: "h3", text: "Intro" }, { kind: "p", text: "Prices vary a lot. ".repeat(10) }], slots: [{ alt: "", status: "selected" }] });
		const s = Object.fromEntries(bad.map((c) => [c.checkId, c]));
		expect(s["title-length"]).toMatchObject({ status: "fail", severity: "hard" });
		expect(s["kw-first-100"]).toMatchObject({ status: "fail", value: "Missing" });
		expect(s["meta-description"]).toMatchObject({ status: "fail", value: "Missing" });
		expect(s.headings).toMatchObject({ status: "fail", value: "No H2" });
		expect(s["alt-text"]).toMatchObject({ status: "fail", value: "0 of 1" });
		expect(s["external-links"]).toMatchObject({ status: "warn", value: "No sources yet · soft" }); // soft until the writer can research
		expect(s["internal-links"].status).toBe("warn");
		expect(s.faq).toMatchObject({ status: "warn", value: "0 questions · aim 4" });
	});

	test("keyword stuffing fails density", () => {
		const stuffed = auditOnPage({ ...base, blocks: [{ kind: "p", text: "dental implants cost ".repeat(30) + "and more." }] });
		expect(stuffed.find((c) => c.checkId === "density")).toMatchObject({ status: "fail" });
	});

	test("readability grade is plausible", () => {
		expect(fkGrade("The cat sat on the mat. It was warm.")).toBeLessThan(4);
		expect(fkGrade("Osseointegration necessitates comprehensive radiographic evaluation preceding implantation procedures.")).toBeGreaterThan(14);
	});
});
