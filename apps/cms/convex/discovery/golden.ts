// Golden set for the site discovery eval (prd-site-discovery §13). Expectations are agency-written: an entry with
// confirmed=false is a draft, so its result is reported but doesn't gate a release. Add real client sites as they're
// confirmed (one per seeded industry: dental, legal, fintech, vets, physio, coffee, realty, skincare) plus the two
// edge cases (JS-only, robots-blocked). The edge cases are also covered by unit tests on synthetic results.
import type { IGolden } from "./evalCore";

export const GOLDEN: IGolden[] = [
	{
		id: "baynor-qa",
		domain: "baynor.qa",
		industry: "AI automation services (B2B, Qatar)",
		expectedPillars: [
			"AI automation for businesses in Qatar",
			"AI customer support and WhatsApp automation",
			"AI for sales and lead follow-up",
			"AI for finance and operations workflows",
			"AI for clinics, real estate and service businesses",
		],
		coveredTopics: ["AI automation services in Qatar", "AI-aided business", "About Baynor AI"],
		regulated: "none",
		source: "Drafted from the baynor.qa home and service pages on 2026-11-12; to be confirmed by the Baynor team",
		confirmed: false,
	},
];

export const goldenFor = (domain: string) => GOLDEN.find((g) => g.domain === domain.replace(/^www\./, ""));
