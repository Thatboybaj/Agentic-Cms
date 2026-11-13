import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { cleanText, toDraft } from "../../convex/agents/writerCore";
import { cleanTitle, extractNotes, fillInline, inlinePlain, normalizeInline, publicPillarName, safeHref } from "./inline";

const doc = () => new DOMParser().parseFromString("<p></p>", "text/html") as unknown as Document;

describe("inline links (every site)", () => {
	it("turns HTML a model wrote into [anchor](url) and strips other tags", () => {
		expect(normalizeInline('can feed <a href="/services">AI sales automation</a>, responding')).toBe("can feed [AI sales automation](/services), responding");
		expect(normalizeInline("<strong>Fast</strong> and <em>clear</em><br>done &amp; dusted")).toBe("Fast and clear done & dusted");
		expect(normalizeInline("**bold** stays text")).toBe("bold stays text");
		expect(normalizeInline("[a](/x) already fine")).toBe("[a](/x) already fine");
	});

	it("renders real links, never raw tags; unsafe URLs stay text", () => {
		const p = doc().querySelector("p")!;
		fillInline(p, 'See <a href="/services">our services</a>, [docs](https://example.org/d), [home](https://baynor.qa/) and [bad](javascript:void) <script>x</script>', "baynor.qa");
		const links = [...p.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.getAttribute("rel"), a.textContent]);
		expect(links).toEqual([["/services", null, "our services"], ["https://example.org/d", "noopener noreferrer", "docs"], ["https://baynor.qa/", null, "home"]]);
		expect(p.textContent).toBe("See our services, docs, home and bad x");
		expect(safeHref("//evil.example")).toBeNull();
	});

	it("never publishes editorial notes; VERIFY notes become fact markers", () => {
		const live = "A single WhatsApp workflow is a different investment. [VERIFY — no specific cost figures sourced for this post; a person should add pricing context]";
		expect(extractNotes(live)).toEqual({ text: "A single WhatsApp workflow is a different investment.", notes: [{ kind: "verify", body: "no specific cost figures sourced for this post; a person should add pricing context" }] });
		expect(normalizeInline("launched by MCIT [VERIFY: confirm the year] — signals support.")).toBe("launched by MCIT — signals support.");
		expect(normalizeInline("See our [INTERNAL LINK: AI automation services].")).toBe("See our AI automation services.");
		expect(normalizeInline("[Verify your setup](/guide) and [todo list](/x) are links")).toBe("[Verify your setup](/guide) and [todo list](/x) are links");
		const d = toDraft(
			{ seoTitle: "T", metaDescription: "", blocks: [{ kind: "p", text: "Intro." }, { kind: "p", text: "[VERIFY — final word count should be checked by a person before publishing]" }, { kind: "p", text: "Costs vary. [SOURCE NEEDED]" }], unsourcedClaims: [], imageSheet: [], informationGain: "" },
			{},
		);
		expect(d.blocks.map((b) => b.text)).toEqual(["Intro.", "Costs vary."]);
		expect(d.unsourcedClaims).toEqual([{ blockId: "b1", claim: "final word count should be checked by a person before publishing" }, { blockId: "b2", claim: "A claim in this block needs a source" }]);
	});

	it("cleans titles and pillar labels for the page", () => {
		expect(cleanTitle("AI Automation for Businesses in Qatar: A Practical Guide | |")).toBe("AI Automation for Businesses in Qatar: A Practical Guide");
		expect(cleanTitle("أتمتة الذكاء الاصطناعي في قطر: دليل عملي | بينور", "BAYNOR AI بينور BAYNOR AI | ")).toBe("أتمتة الذكاء الاصطناعي في قطر: دليل عملي");
		expect(cleanTitle("Pros - Cons of AI", "BAYNOR AI")).toBe("Pros - Cons of AI");
		expect(publicPillarName("AI Business Automation in Qatar (core/brand)")).toBe("AI Business Automation in Qatar");
		expect(publicPillarName("Sales & CRM Automation")).toBe("Sales & CRM Automation");
	});

	it("keeps headings link-free and plain text for meta", () => {
		expect(cleanText("h2", 'How <a href="/">BAYNOR AI</a> builds it')).toBe("How BAYNOR AI builds it");
		expect(cleanText("p", 'At <a href="/">BAYNOR AI</a>, we')).toBe("At [BAYNOR AI](/), we");
		expect(inlinePlain("At [BAYNOR AI](/), we")).toBe("At BAYNOR AI, we");
	});
});
