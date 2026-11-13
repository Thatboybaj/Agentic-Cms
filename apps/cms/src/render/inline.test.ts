import { DOMParser } from "linkedom";
import { describe, expect, it } from "vitest";
import { cleanText } from "../../convex/agents/writerCore";
import { fillInline, inlinePlain, normalizeInline, safeHref } from "./inline";

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

	it("keeps headings link-free and plain text for meta", () => {
		expect(cleanText("h2", 'How <a href="/">BAYNOR AI</a> builds it')).toBe("How BAYNOR AI builds it");
		expect(cleanText("p", 'At <a href="/">BAYNOR AI</a>, we')).toBe("At [BAYNOR AI](/), we");
		expect(inlinePlain("At [BAYNOR AI](/), we")).toBe("At BAYNOR AI, we");
	});
});
