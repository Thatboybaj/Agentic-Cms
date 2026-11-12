// Demo-mode site discovery result (prd-site-discovery §14 P0): a seeded example for the Lumen demo site so the
// discovery screens can be walked through with the backend off. Every URL and figure here is sample data.
import type { TDiscoveryOverview } from "./data";

const L = "https://lumendental.co";
const DAY = 86_400_000;
const at = Date.parse("2026-09-24T08:00:00Z");
const id = <T,>(s: string) => s as unknown as T;

export const DEMO_DISCOVERY: TDiscoveryOverview = {
	blocked: null,
	settings: { onAdd: true, maxPages: 150, depth: 3, exclude: ["/cart", "/checkout", "/account", "/login", "/wp-admin", "?"], subdomains: false, competitorCheck: true, batchSize: 0 },
	readiness: { ready: false, missing: ["template"] },
	running: false,
	latest: {
		id: id("demo-report"),
		status: "succeeded",
		stage: "finish",
		mode: "full",
		error: null,
		coverage: { crawled: 84, skipped: [{ url: `${L}/book-online`, reason: "robots" }, { url: `${L}/price-list.pdf`, reason: "non-html" }, { url: `${L}/old-offer`, reason: "error · 404" }], limitHit: false },
		pillars: [
			{ name: "Dental implants", why: "Most prominent service on the home page and its own service page", evidence: [`${L}/`, `${L}/implants`], keywords: [{ term: "dental implants cost lagos", intent: "commercial", funnel: "consideration", volume: "medium (estimated)", volumeSource: "estimate", quickWin: false, evidence: [`${L}/implants`] }, { term: "how long do dental implants last", intent: "informational", funnel: "awareness", volume: "medium (estimated)", volumeSource: "estimate", quickWin: false, evidence: [`${L}/implants`] }] },
			{ name: "Orthodontics", why: "Clear aligners and braces offered on the services page", evidence: [`${L}/orthodontics`], keywords: [{ term: "clear aligners vs braces", intent: "commercial", funnel: "consideration", volume: "high (estimated)", volumeSource: "estimate", quickWin: false, evidence: [`${L}/orthodontics`] }, { term: "braces price lagos", intent: "commercial", funnel: "decision", volume: "medium (estimated)", volumeSource: "estimate", quickWin: false, existingPageUrl: `${L}/orthodontics`, evidence: [`${L}/orthodontics`] }] },
			{ name: "Children's dentistry", why: "A dedicated paediatric page and family offer", evidence: [`${L}/kids`], keywords: [{ term: "pediatric dentist lekki", intent: "transactional", funnel: "decision", volume: "low (estimated)", volumeSource: "estimate", quickWin: false, evidence: [`${L}/kids`] }] },
		],
		competitorNotes: [{ keyword: "clear aligners vs braces", ranking: ["https://www.healthline.com/health/braces-vs-invisalign", "https://www.reddit.com/r/invisalign/"], difficulty: "low" }],
		refreshCandidates: [{ url: `${L}/blog/teeth-whitening-guide`, reason: "Prices from 2023" }],
		dropped: ["dentist near me: no evidence from the crawl or Search Console"],
		costUsd: 1.18,
		estimateUsd: 1.6,
		progress: { pagesTotal: 84, pagesCrawled: 84, pagesSkipped: 3 },
		output: "12 ideas ready to approve · 3 pillars",
		startedAt: at,
		finishedAt: at + 11 * 60_000,
		ideaCount: 3,
	},
	history: [{ id: id("demo-report"), status: "succeeded", mode: "full", createdAt: at, ideas: 12, crawled: 84, costUsd: 1.18 }],
	profile: {
		version: 1,
		confidence: "normal",
		sells: { value: "General, cosmetic and implant dentistry in Lekki, Lagos", evidence: [`${L}/`] },
		offerings: [{ value: "Dental implants", evidence: [`${L}/implants`] }, { value: "Clear aligners and braces", evidence: [`${L}/orthodontics`] }, { value: "Children's dentistry", evidence: [`${L}/kids`] }],
		audience: { value: "Adults and families in Lekki and Victoria Island", evidence: [`${L}/about`] },
		regions: [{ value: "Lekki, Lagos", evidence: [`${L}/contact`] }],
		pricePositioning: { value: "Mid to premium", evidence: [`${L}/implants`] },
		differentiators: [{ value: "Same-day crowns", evidence: [`${L}/implants`] }],
		competitorsNamed: [],
		regulated: { category: "health", evidence: [`${L}/implants`] },
		blogCoverage: [{ value: "Teeth whitening", evidence: [`${L}/blog/teeth-whitening-guide`] }],
		brandPack: { voice: "Calm, reassuring and plain-spoken; explains procedures step by step.", voiceExamples: [{ value: "We'll explain every step before we start.", evidence: [`${L}/about`] }], styleKeywords: ["reassuring", "clear", "local"], disclaimers: ["This article is general information, not medical advice. Speak to a dentist about your situation."] },
		gaps: ["Prices aren't listed on the site"],
		accepted: null,
		createdAt: at,
	},
	ideas: [
		{ id: id("demo-i1"), title: "Dental implants in Lagos: the complete guide", state: "idea", ideaStatus: "pending", contentType: "pillar", week: 41, waiting: null, runId: null },
		{ id: id("demo-i2"), title: "Clear aligners vs braces: which suits adults?", state: "idea", ideaStatus: "pending", contentType: "guide", week: 41, waiting: null, runId: null },
		{ id: id("demo-i3"), title: "When should a child first see a dentist?", state: "briefed", ideaStatus: "approved", contentType: "guide", week: 42, waiting: ["template"], runId: null },
	],
	contentMap: [
		{ url: `${L}/`, title: "Lumen Dental · Lekki", type: "home", wordCount: 640, topic: "Dental clinic in Lekki", targetQuery: "dentist lekki", refresh: null },
		{ url: `${L}/implants`, title: "Dental implants", type: "service", wordCount: 910, topic: "Implant treatment", targetQuery: "dental implants lagos", refresh: null },
		{ url: `${L}/orthodontics`, title: "Braces and aligners", type: "service", wordCount: 720, topic: "Orthodontics", targetQuery: "braces price lagos", refresh: null },
		{ url: `${L}/blog/teeth-whitening-guide`, title: "Teeth whitening guide", type: "blog-post", wordCount: 380, topic: "Whitening options", targetQuery: "teeth whitening", refresh: "Prices from 2023" },
	],
	interviewQuestions: ["What does the business sell, at what price point, and where?", "What 3–5 services, features or angles can competitors not easily copy?", "Who buys, and who influences the decision?", "How many posts a week can the team sustain, and who reviews them?", "What's the monthly budget ceiling for SEO tools?", "Is the domain new or established? Any current rankings or traffic?", "Name 2–3 competitors (or say if we should find them)."],
	needsInterview: false,
};
void DAY;
