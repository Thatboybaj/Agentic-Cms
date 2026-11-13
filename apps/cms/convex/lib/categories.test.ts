import { describe, expect, it } from "vitest";
import { categoryLabel, categoryOf } from "./categories";

const cats = [
	{ key: "getting-started", label: "Getting started", covers: "Where to begin, choosing a first workflow, Quick Win", labels: [{ lang: "ar", label: "البداية" }] },
	{ key: "revenue-ops", label: "Revenue Ops", covers: "Lead capture and qualification, follow-ups, pipeline visibility, CRM, sales handoff" },
	{ key: "customer-support", label: "Customer support", covers: "Answers from approved information, routing, WhatsApp support, human handover", labels: [{ lang: "ar", label: "خدمة العملاء" }] },
	{ key: "finance", label: "Finance", covers: "Invoices, collections, reconciliation" },
	{ key: "operations", label: "Operations", covers: "Scheduling, intake, approvals" },
	{ key: "trust-data", label: "Trust & data", covers: "Human oversight, privacy, boundaries the team approves" },
];

describe("site categories (every site)", () => {
	it("files a pillar under the closest category, or the one set on it", () => {
		expect(categoryOf(cats, { name: "Customer Support & WhatsApp Automation" })?.key).toBe("customer-support");
		expect(categoryOf(cats, { name: "Sales & CRM Automation" })?.key).toBe("revenue-ops");
		expect(categoryOf(cats, { name: "Finance & Collections Automation" })?.key).toBe("finance");
		expect(categoryOf(cats, { name: "AI Business Automation in Qatar (core/brand)" })?.key).toBe("getting-started");
		expect(categoryOf(cats, { name: "Sales & CRM Automation", categoryKey: "finance" })?.key).toBe("finance");
	});
	it("labels per language; without categories the pillar's public name", () => {
		expect(categoryLabel(cats, { name: "Customer Support & WhatsApp Automation" }, "ar")).toBe("خدمة العملاء");
		expect(categoryLabel(cats, { name: "Customer Support & WhatsApp Automation" })).toBe("Customer support");
		expect(categoryLabel(undefined, { name: "Topic (core/brand)" })).toBe("Topic");
	});
});
