// Deterministic demo data. Tenant 1: Lumen Dental (lumendental.co, Lagos) — every PRD state, matching the
// reference screens. Tenant 2: Northwind Legal — no Search Console (DataGap demos), no repo (onboarding demo),
// text budget nearly spent (over-cap refusal demo). "Now" is pinned to Fri 25 Sep 2026, 10:42 (W39).
import { lagos } from "./clock";
import { assembleSeed } from "./seed-sites";
export { SEED_SITE_IDS, USER_IDS, WORKSPACE_ID } from "./seed-sites";
import { INTENT_VALUE, STATE_OWNER, concentration, ctr, pillarDistribution } from "./logic";
import type {
	ICmsState,
	IFactMarker,
	IGateCheck,
	IImageSlot,
	IKasSnapshot,
	IKeyword,
	ILedgerItem,
	IMergeRequest,
	IPillar,
	IPost,
	IPostBlock,
	IRun,
	ISchedule,
	ISiteData,
	ITemplateManifest,
	ITemplateMapping,
	IVersion,
	TIntent,
	TPostState,
	TRunKind,
} from "./types";

export const LUMEN_ID = "lumen";
export const NORTHWIND_ID = "northwind";
export const STATE_VERSION = 2 as const;

export const MEMBER_BY_ROLE = { specialist: "m-tb", developer: "m-ko", admin: "m-ae", stakeholder: "m-ao" } as const;

/** Brand-pack palettes for the lighter tenants (client data, not UI color — kept here for the DS token lint). */
export const TENANT_PALETTES = {
	harbor: ["#F2F7F9", "#1F5F8B", "#132028"],
	kora: ["#14112A", "#7C5CFF", "#F5F4FF"],
	atlas: ["#F3FAF5", "#2F8F5B"],
	sable: ["#1B1410", "#C8794A", "#F7F1EA"],
	meridian: ["#FBF7EE", "#B8860B", "#1D1D1B"],
	juniper: ["#FFF6F8", "#9C2E5B", "#20151A"],
} satisfies Record<string, string[]>;

// ─── Keywords ────────────────────────────────────────────────────────────────

/** Impressions are back-solved from the target share so computeKas(seed) reproduces the reference numbers. */
const KAS_SCALE = 60;

export interface IRank {
	share: number;
	trend: number[];
	delta: number;
	url: string;
	pages: number;
	decaying?: boolean;
}

export function kw(id: string, term: string, pillarId: string, intent: TIntent, kd: number, evidence: string, rank?: IRank): IKeyword {
	if (!rank)
		return { id, term, pillarId, intent, difficulty: kd, difficultyEvidence: `KD ${kd} · ${evidence}`, impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false };
	const position = rank.trend[rank.trend.length - 1];
	return {
		id,
		term,
		pillarId,
		intent,
		difficulty: kd,
		difficultyEvidence: `KD ${kd} · ${evidence}`,
		impressions: Math.round((rank.share * KAS_SCALE) / (ctr(position) * INTENT_VALUE[intent])),
		position,
		positionTrend: rank.trend,
		kasShare: rank.share,
		kasDelta: rank.delta,
		rankingUrl: rank.url,
		rankingPages: rank.pages,
		decaying: !!rank.decaying,
	};
}

function lumenKeywords(): IKeyword[] {
	return [
		// Ranking keywords (the KAS table). Shares sum to 100; top 5 = 64.0 (fragile).
		kw("k-invisalign-cost", "invisalign cost lagos", "p-ortho", "commercial", 24, "Ahrefs", { share: 18.4, trend: [12, 11, 11, 10, 9, 9, 8, 7], delta: 2.1, url: "/blog/invisalign-cost-lagos", pages: 2 }),
		kw("k-implants-lagos", "dental implants lagos", "p-implants", "transactional", 38, "Ahrefs", { share: 14.2, trend: [6, 6, 7, 7, 8, 9, 10, 11], delta: -1.3, url: "/services/implants", pages: 1, decaying: true }),
		kw("k-whitening-price", "teeth whitening price", "p-cosmetic", "commercial", 21, "Ahrefs", { share: 12.6, trend: [7, 6, 6, 5, 5, 5, 5, 5], delta: 0, url: "/blog/whitening-cost", pages: 2 }),
		kw("k-emergency-lekki", "emergency dentist lekki", "p-general", "transactional", 12, "Ahrefs", { share: 10.3, trend: [6, 5, 5, 4, 4, 4, 4, 3], delta: 0.8, url: "/locations/lekki", pages: 2 }),
		kw("k-aligners-lagos", "clear aligners lagos", "p-ortho", "commercial", 27, "Ahrefs", { share: 8.5, trend: [9, 9, 8, 8, 7, 7, 6, 6], delta: 0.5, url: "/blog/clear-aligners-lagos", pages: 2 }),
		kw("k-implant-cost", "dental implant cost lagos", "p-implants", "commercial", 29, "Ahrefs", { share: 7.6, trend: [8, 8, 9, 9, 10, 11, 11, 12], delta: -1.0, url: "/blog/dental-implant-cost-lagos", pages: 2, decaying: true }),
		kw("k-braces-adults", "braces for adults lagos", "p-ortho", "commercial", 22, "Ahrefs", { share: 7.1, trend: [11, 10, 10, 9, 9, 8, 8, 8], delta: 0.3, url: "/blog/braces-adults-lagos", pages: 2 }),
		kw("k-veneers-lagos", "porcelain veneers lagos", "p-cosmetic", "commercial", 26, "Ahrefs", { share: 6.1, trend: [14, 13, 12, 11, 10, 10, 9, 9], delta: 0, url: "/blog/veneers-cost-lagos", pages: 2 }),
		kw("k-implants-last", "how long do dental implants last", "p-implants", "informational", 18, "SERP", { share: 5.2, trend: [18, 17, 17, 16, 15, 15, 14, 14], delta: 0.2, url: "/blog/dental-implant-cost-lagos", pages: 1 }),
		kw("k-root-canal-cost", "root canal cost lagos", "p-general", "commercial", 19, "Ahrefs", { share: 3.7, trend: [9, 9, 10, 11, 11, 12, 12, 13], delta: -0.9, url: "/blog/root-canal-cost-lagos", pages: 1, decaying: true }),
		kw("k-whitening-sensitivity", "teeth whitening sensitivity", "p-cosmetic", "informational", 15, "SERP", { share: 3.3, trend: [22, 20, 19, 18, 17, 16, 15, 15], delta: 0.1, url: "/blog/whitening-cost", pages: 1 }),
		kw("k-pediatric-lagos", "pediatric dentist lagos", "p-pediatric", "transactional", 17, "Ahrefs", { share: 3.0, trend: [12, 12, 13, 13, 14, 15, 15, 16], delta: -0.8, url: "/blog/pediatric-dentist-lagos", pages: 1, decaying: true }),
		// Planned / not yet ranking.
		kw("k-aligners-vs-braces", "clear aligners vs braces for adults", "p-ortho", "commercial", 31, "Ahrefs"),
		kw("k-child-first-visit", "when should a child first see a dentist", "p-pediatric", "informational", 11, "SERP"),
		kw("k-implants-guide", "dental implants in lagos", "p-implants", "transactional", 41, "Ahrefs"),
		kw("k-invisalign-2026", "invisalign cost in lagos 2026", "p-ortho", "commercial", 23, "Ahrefs"),
		kw("k-veneers-before-after", "porcelain veneers before and after", "p-cosmetic", "commercial", 20, "SERP"),
		kw("k-root-canal-recovery", "root canal recovery", "p-general", "informational", 16, "Ahrefs"),
		kw("k-implant-vs-bridge", "implant vs bridge cost", "p-implants", "commercial", 22, "Ahrefs"),
		kw("k-toothpaste-sensitive", "best toothpaste for sensitive teeth", "p-general", "commercial", 34, "Ahrefs"),
		kw("k-emergency-after-hours", "emergency dentist lekki after hours", "p-general", "transactional", 9, "SERP"),
		kw("k-gum-disease", "gum disease warning signs", "p-general", "informational", 25, "Ahrefs"),
		kw("k-xray-safety", "are dental x-rays safe", "p-general", "informational", 14, "SERP"),
		kw("k-cleaning-frequency", "how often dental cleaning", "p-general", "informational", 13, "SERP"),
		kw("k-signs-root-canal", "signs you need a root canal", "p-general", "informational", 21, "Ahrefs"),
		kw("k-pediatric-lekki", "pediatric dentist near me lekki", "p-pediatric", "transactional", 8, "SERP"),
		kw("k-baby-teeth", "do cavities in baby teeth matter", "p-pediatric", "informational", 10, "SERP"),
		kw("k-crown-cost", "dental crown cost lagos", "p-general", "commercial", 18, "Ahrefs"),
		kw("k-bad-breath", "bad breath causes", "p-general", "informational", 28, "SERP"),
		kw("k-invisalign-teens", "invisalign for teenagers", "p-ortho", "commercial", 19, "Ahrefs"),
		kw("k-all-on-4", "all-on-4 implants", "p-implants", "commercial", 33, "Ahrefs"),
		kw("k-bonding-vs-veneers", "composite bonding vs veneers", "p-cosmetic", "commercial", 24, "Ahrefs"),
		kw("k-wisdom-recovery", "wisdom tooth removal recovery", "p-general", "informational", 22, "SERP"),
		kw("k-clean-aligners", "how to clean clear aligners", "p-ortho", "informational", 9, "SERP"),
		kw("k-sedation", "dental sedation lagos", "p-general", "transactional", 14, "SERP"),
		kw("k-zoom-whitening", "zoom teeth whitening cost", "p-cosmetic", "commercial", 20, "Ahrefs"),
		kw("k-fluoride-kids", "fluoride varnish for kids", "p-pediatric", "informational", 7, "SERP"),
	];
}

// ─── Gate checks ─────────────────────────────────────────────────────────────

export interface IGateOpts {
	titleCh: number;
	kwFirst100?: boolean;
	density: string;
	headings: string;
	internal: number;
	faq: number;
	schema: string;
	images: number;
	external?: number;
}

export function gate12(o: IGateOpts): IGateCheck[] {
	const c = (id: string, label: string, section: IGateCheck["section"], pass: boolean, value: string, failStatus: "fail" | "warn" = "fail"): IGateCheck => ({
		id,
		label,
		section,
		status: pass ? "pass" : failStatus,
		value,
		severity: section <= 5 ? "hard" : "soft",
	});
	return [
		c("title-front", "Title front-loaded", 1, true, `${o.titleCh} ch`),
		c("title-length", "Title length", 1, o.titleCh <= 60, `${o.titleCh} / 60`),
		c("kw-first-100", "Keyword in first 100 words", 2, o.kwFirst100 !== false, o.kwFirst100 === false ? "Missing" : "Word 14"),
		c("density", "Density", 2, true, o.density),
		c("headings", "Heading hierarchy", 3, true, o.headings),
		c("meta-description", "Meta description", 3, true, "148 ch"),
		c("alt-text", "Image alt text", 4, true, `${o.images} of ${o.images}`),
		c("external-links", "External links", 5, true, `${o.external ?? 2} sources`),
		c("internal-links", "Internal links", 6, o.internal >= 2, o.internal >= 2 ? `${o.internal} of 2` : `${o.internal} of 2 · soft`, "warn"),
		c("faq", "FAQ", 6, o.faq > 0, `${o.faq} questions`, "warn"),
		c("schema", "Schema ready", 7, o.schema !== "", o.schema || "Missing · soft", "warn"),
		c("readability", "Readability", 7, true, "Grade 8"),
	];
}

// ─── Posts ───────────────────────────────────────────────────────────────────

type TPostInit = Pick<IPost, "id" | "title" | "slug" | "keywordId" | "pillarId" | "intent" | "state"> & Partial<IPost>;

export function post(p: TPostInit): IPost {
	return {
		seoTitle: p.title.replace(/^./, (m) => m.toUpperCase()),
		contentType: "guide",
		source: "keyword-swarm",
		owner: STATE_OWNER[p.state],
		week: 39,
		strongModel: false,
		words: 0,
		wordTarget: 1600,
		blocks: [],
		gate: [],
		facts: [],
		suggestions: [],
		versions: [],
		slotIds: [],
		daysInState: 1,
		comments: [],
		...p,
	};
}

export const B = (id: string, kind: IPostBlock["kind"], text: string, factMarkerIds?: string[]): IPostBlock => (factMarkerIds ? { id, kind, text, factMarkerIds } : { id, kind, text });

/** Deterministic body for posts that aren't hand-written: intro + one paragraph per H2. */
function body(prefix: string, keyword: string, h2s: string[], extra: IPostBlock[] = []): IPostBlock[] {
	const blocks: IPostBlock[] = [
		B(`${prefix}-b1`, "p", `${keyword[0].toUpperCase()}${keyword.slice(1)} is one of the questions we hear most at Lumen Dental. This guide answers it plainly, with what we see every week in our Lagos clinics.`),
	];
	h2s.forEach((h, i) => {
		blocks.push(B(`${prefix}-h${i + 1}`, "h2", h));
		blocks.push(B(`${prefix}-p${i + 1}`, "p", `${h}: what it means for you, what it costs, and what to ask your dentist before you commit to treatment.`));
	});
	return [...blocks, ...extra];
}

export const HEALTH_DISCLAIMER = "This article is general information, not medical advice. Speak to a Lumen Dental clinician about your own treatment.";

export const TB = "Tolu B.";
export const KO = "Kunle O.";
export const WRITER = "Blog writer agent";

export function version(id: string, n: number, origin: IVersion["origin"], actor: string, wall: string, words: number, note?: string, blocks?: IPostBlock[]): IVersion {
	const v: IVersion = { id, n, origin, actor, at: lagos(wall), words };
	if (note) v.note = note;
	if (blocks) v.blocks = blocks;
	return v;
}

function rootCanal(): IPost {
	const intro = "A root canal removes infected pulp from inside the tooth and seals it. Around 95% of treated teeth last a lifetime, but the first week decides how comfortable that recovery feels.";
	const firstDay =
		"Once the anaesthetic starts to wear off, which for most people is somewhere between two and four hours after you leave, you may feel a dull ache around the tooth. Over-the-counter pain relief usually handles it, and chewing on the other side protects the temporary filling.";
	const blocks: IPostBlock[] = [
		B("rc-b1", "p", intro, ["f-rc-95"]),
		B("rc-b2", "image", "s-rc-hero"),
		B("rc-b3", "h2", "The first 24 hours"),
		B("rc-b4", "p", firstDay, ["f-rc-hours"]),
		B("rc-b5", "h2", "Days two to three"),
		B("rc-b6", "p", "Tenderness when biting usually peaks on the second day and eases by the third. Swelling that grows instead of shrinking is the signal to call the clinic.", ["f-rc-peak"]),
		B("rc-b7", "h2", "Eating after a root canal"),
		B("rc-b8", "ul", "Soft foods for the first 48 hours\nAvoid very hot drinks until the numbness is gone\nSkip hard, sticky foods until the permanent crown is fitted"),
		B("rc-b9", "image", "s-rc-diagram"),
		B("rc-b10", "h2", "When to call the clinic"),
		B("rc-b11", "p", "Call Lumen Dental if pain is getting worse after day three, if you notice swelling in your face or gums, or if the temporary filling comes out. A crown is usually fitted within two weeks.", ["f-rc-crown"]),
		B("rc-b12", "image", "s-rc-lifestyle"),
		B("rc-b13", "h2", "Frequently asked questions"),
		B(
			"rc-b14",
			"faq",
			"How long does root canal recovery take?\nMost people feel normal within a few days; the tooth can stay tender to bite on for up to a week.\nCan I go to work the next day?\nYes. Most patients return to work the same or the next day.\nIs it normal for the tooth to feel different?\nA slight difference in feel is common until the permanent crown is fitted.\nWhen do I need the permanent crown?\nWithin two weeks, so the temporary filling doesn't crack.",
		),
		B("rc-b15", "disclaimer", HEALTH_DISCLAIMER),
	];
	const v1Blocks = blocks.map((b) => (b.id === "rc-b4" ? { ...b, text: `${firstDay} Many people find it helps to rest for the remainder of the day.` } : b)).filter((b) => b.id !== "rc-b13" && b.id !== "rc-b14");
	const v3Blocks = blocks.map((b) => (b.id === "rc-b11" ? { ...b, text: "Call Lumen Dental if pain is getting worse after day three, if you notice swelling in your face or gums, or if the temporary filling comes out." } : b));
	const facts: IFactMarker[] = [
		{ id: "f-rc-95", claim: "Around 95% of treated teeth last a lifetime", status: "open", note: 'The agent found no citable source for "95%". Add one, or rewrite without the number.' },
		{ id: "f-rc-hours", claim: "somewhere between two and four hours after you leave", status: "resolved", source: "https://www.nhs.uk/conditions/root-canal-treatment/recovery/", note: "Sourced by the agent." },
		{ id: "f-rc-peak", claim: "Tenderness when biting usually peaks on the second day", status: "resolved", source: "https://www.aae.org/patients/root-canal-treatment/what-to-expect/", note: "Sourced by the agent." },
		{ id: "f-rc-crown", claim: "A crown is usually fitted within two weeks", status: "resolved", source: "https://www.ada.org/resources/research/science-and-research-institute/oral-health-topics/endodontics", note: "Sourced by the agent." },
	];
	return post({
		id: "p-root-canal",
		title: "root canal recovery: what to expect",
		seoTitle: "Root Canal Recovery: What to Expect Day by Day",
		slug: "root-canal-recovery",
		keywordId: "k-root-canal-recovery",
		pillarId: "p-general",
		intent: "informational",
		contentType: "guide",
		state: "in-review",
		daysInState: 2,
		words: 1412,
		wordTarget: 1600,
		regulated: "health",
		blocks,
		gate: gate12({ titleCh: 54, kwFirst100: false, density: "1.1% · 9 uses", headings: "H1 · 5×H2", internal: 1, faq: 4, schema: "Article, FAQ", images: 3 }),
		facts,
		suggestions: [
			{
				id: "sg-rc-tighten",
				instruction: "tighten this section",
				blockId: "rc-b4",
				before: "Once the anaesthetic starts to wear off, which for most people is somewhere between two and four hours after you leave, you may",
				after: "As the anaesthetic wears off, two to four hours later, you may",
				status: "pending",
				createdAt: lagos("2026-09-25 10:40"),
			},
		],
		versions: [
			version("v-rc-1", 1, "agent-generation", WRITER, "2026-09-25 09:42", 1488, "First draft from brief", v1Blocks),
			version("v-rc-2", 2, "agent-edit", WRITER, "2026-09-25 10:02", 1530, '"add an FAQ"', v1Blocks.concat(blocks.filter((b) => b.id === "rc-b13" || b.id === "rc-b14"))),
			version("v-rc-3", 3, "agent-edit", WRITER, "2026-09-25 10:20", 1420, '"tighten the intro"', v3Blocks),
			version("v-rc-4", 4, "human-edit", TB, "2026-09-25 10:38", 1412, "Clinic callout wording", blocks),
		],
		slotIds: ["s-rc-hero", "s-rc-diagram", "s-rc-lifestyle"],
		comments: [{ id: "c-rc-1", by: "Dr Ada Okafor", role: "stakeholder", text: "Please make sure we mention the crown appointment. Patients forget it.", at: lagos("2026-09-24 16:05") }],
	});
}

function implantVsBridge(): IPost {
	const blocks = body(
		"ivb",
		"implant vs bridge cost",
		["What an implant costs in Lagos", "What a bridge costs", "How long each one lasts", "Which one protects your other teeth", "Frequently asked questions"],
		[B("ivb-faq", "faq", "Is an implant worth the extra cost?\nOver 15 years it often costs less than replacing a bridge twice.\nDoes a bridge damage the neighbouring teeth?\nThe teeth either side are reshaped to hold it.\nHow long does each take?\nA bridge takes two visits; an implant takes three to six months end to end.")],
	).concat([B("ivb-img1", "image", "s-ivb-hero"), B("ivb-img2", "image", "s-ivb-diagram"), B("ivb-img3", "image", "s-ivb-chart"), B("ivb-img4", "image", "s-ivb-lifestyle")]);
	return post({
		id: "p-implant-vs-bridge",
		title: "implant vs bridge: cost and lifespan",
		seoTitle: "Implant vs Bridge: Cost, Lifespan and Which to Choose",
		slug: "implant-vs-bridge-cost",
		keywordId: "k-implant-vs-bridge",
		pillarId: "p-implants",
		intent: "commercial",
		contentType: "comparison",
		state: "in-review",
		daysInState: 1,
		words: 1620,
		wordTarget: 1600,
		regulated: "health",
		blocks: blocks.concat([B("ivb-disc", "disclaimer", HEALTH_DISCLAIMER)]),
		gate: gate12({ titleCh: 53, density: "1.3% · 11 uses", headings: "H1 · 5×H2", internal: 1, faq: 3, schema: "Article, FAQPage", images: 4 }),
		facts: [
			{ id: "f-ivb-1", claim: "Over 15 years it often costs less than replacing a bridge twice", status: "resolved", source: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6475923/", note: "Sourced by the agent." },
			{ id: "f-ivb-2", claim: "an implant takes three to six months end to end", status: "resolved", source: "https://www.nhs.uk/conditions/dental-implants/", note: "Sourced by the agent." },
		],
		versions: [
			version("v-ivb-1", 1, "agent-generation", WRITER, "2026-09-24 08:10", 1540, "First draft from brief"),
			version("v-ivb-2", 2, "human-edit", TB, "2026-09-24 11:30", 1575, "Pricing table wording"),
			version("v-ivb-3", 3, "agent-edit", WRITER, "2026-09-24 14:02", 1620, '"add an FAQ"', blocks),
		],
		slotIds: ["s-ivb-hero", "s-ivb-diagram", "s-ivb-chart", "s-ivb-lifestyle"],
	});
}

function toothpaste(): IPost {
	const blocks = body("tp", "best toothpaste for sensitive teeth", ["Why teeth get sensitive", "What to look for on the label", "Our picks, compared", "When toothpaste isn't enough"], [
		B("tp-img1", "image", "s-tp-hero"),
		B("tp-img2", "image", "s-tp-lifestyle"),
		B("tp-disc", "disclaimer", HEALTH_DISCLAIMER),
	]);
	return post({
		id: "p-toothpaste",
		title: "best toothpaste for sensitive teeth",
		seoTitle: "Best Toothpaste for Sensitive Teeth (Dentist-Picked, 2026)",
		slug: "best-toothpaste-sensitive-teeth",
		keywordId: "k-toothpaste-sensitive",
		pillarId: "p-general",
		intent: "commercial",
		contentType: "listicle",
		source: "refresh",
		state: "in-review",
		daysInState: 4,
		words: 1450,
		wordTarget: 1400,
		regulated: "health",
		requires: ["table"],
		blocks,
		gate: gate12({ titleCh: 57, density: "1.0% · 8 uses", headings: "H1 · 4×H2", internal: 3, faq: 2, schema: "Article, FAQPage", images: 2 }),
		versions: [
			version("v-tp-1", 1, "agent-generation", WRITER, "2026-03-11 09:00", 1180, "Original post"),
			version("v-tp-2", 2, "refresh", "Refresh agent", "2026-09-21 06:40", 1450, "Refresh cycle · adds a comparison table", blocks),
		],
		slotIds: ["s-tp-hero", "s-tp-lifestyle"],
	});
}

function invisalign2026(): IPost {
	const blocks: IPostBlock[] = [
		B("inv-b1", "p", "Invisalign cost in Lagos depends on how much your teeth need to move. Here are 2026 prices from our clinics, what's included, and how to spread the cost."),
		B("inv-img1", "image", "s-inv-hero"),
		B("inv-h1", "h2", "What Invisalign costs in Lagos in 2026"),
		B("inv-p1", "p", "Treatment is priced by complexity: minor, moderate or comprehensive. Every plan includes the scan, the aligners, refinements and retainers."),
		B("inv-h2", "h2", "How long does treatment take?"),
		B("inv-img2", "image", "s-inv-timeline"),
		B("inv-h3", "h2", "Invisalign vs braces: price comparison"),
		B("inv-img3", "image", "s-inv-chart"),
		B("inv-h4", "h2", "Is it worth the cost?"),
		B("inv-p4", "p", "For adults who don't want visible brackets, most say yes. The aligners come out for meals and photos, and there are fewer clinic visits."),
		B("inv-img4", "image", "s-inv-lifestyle"),
		B("inv-h5", "h2", "Where to get Invisalign in Lagos"),
		B("inv-img5", "image", "s-inv-reception"),
		B("inv-disc", "disclaimer", HEALTH_DISCLAIMER),
	];
	return post({
		id: "p-invisalign-2026",
		title: "invisalign cost in lagos (2026 prices)",
		seoTitle: "Invisalign Cost in Lagos (2026 Prices and Payment Plans)",
		slug: "invisalign-cost-lagos-2026",
		keywordId: "k-invisalign-2026",
		pillarId: "p-ortho",
		intent: "commercial",
		contentType: "money-page",
		strongModel: true,
		state: "needs-assets",
		owner: "human",
		daysInState: 3,
		words: 1580,
		wordTarget: 1600,
		regulated: "health",
		blocks,
		gate: gate12({ titleCh: 55, density: "1.2% · 10 uses", headings: "H1 · 5×H2", internal: 2, faq: 3, schema: "Article, FAQPage", images: 5 }),
		versions: [version("v-inv-1", 1, "agent-generation", WRITER, "2026-09-22 07:15", 1580, "First draft from brief · strongest model", blocks)],
		slotIds: ["s-inv-hero", "s-inv-timeline", "s-inv-chart", "s-inv-lifestyle", "s-inv-reception"],
	});
}

function veneers(): IPost {
	return post({
		id: "p-veneers",
		title: "porcelain veneers: before and after",
		seoTitle: "Porcelain Veneers Before and After: Real Results",
		slug: "porcelain-veneers-before-after",
		keywordId: "k-veneers-before-after",
		pillarId: "p-cosmetic",
		intent: "commercial",
		contentType: "guide",
		state: "needs-assets",
		owner: "human",
		daysInState: 15,
		progress: { label: "Higgsfield returning 4 candidates", value: 70 },
		words: 1320,
		wordTarget: 1400,
		regulated: "health",
		blocks: body("ven", "porcelain veneers", ["What changes, and what doesn't", "The appointment, step by step", "Caring for veneers"], [B("ven-img1", "image", "s-ven-hero"), B("ven-img2", "image", "s-ven-clinic"), B("ven-img3", "image", "s-ven-steps"), B("ven-disc", "disclaimer", HEALTH_DISCLAIMER)]),
		gate: gate12({ titleCh: 48, density: "1.4% · 9 uses", headings: "H1 · 3×H2", internal: 2, faq: 3, schema: "Article", images: 3 }),
		versions: [version("v-ven-1", 1, "agent-generation", WRITER, "2026-09-10 08:30", 1320, "First draft from brief")],
		slotIds: ["s-ven-hero", "s-ven-clinic", "s-ven-steps"],
	});
}

function mrPost(id: string, title: string, slug: string, keywordId: string, pillarId: string, intent: TIntent, mrId: string, days: number, h2s: string[]): IPost {
	return post({
		id,
		title,
		seoTitle: title.replace(/^./, (m) => m.toUpperCase()),
		slug,
		keywordId,
		pillarId,
		intent,
		state: "mr-open",
		daysInState: days,
		words: 1500,
		wordTarget: 1400,
		blocks: body(id, title.split(":")[0], h2s),
		gate: gate12({ titleCh: 50, density: "1.1% · 8 uses", headings: `H1 · ${h2s.length}×H2`, internal: 2, faq: 3, schema: "Article, FAQPage", images: 0 }),
		versions: [version(`v-${id}-1`, 1, "agent-generation", WRITER, "2026-09-18 08:00", 1480), version(`v-${id}-2`, 2, "human-edit", TB, "2026-09-21 09:10", 1500)],
		mrId,
	});
}

function livePost(id: string, title: string, slug: string, keywordId: string, pillarId: string, intent: TIntent, state: "live" | "decaying", days: number, mrId?: string): IPost {
	return post({
		id,
		title,
		seoTitle: title.replace(/^./, (m) => m.toUpperCase()),
		slug,
		keywordId,
		pillarId,
		intent,
		state,
		owner: STATE_OWNER[state],
		daysInState: days,
		week: 30,
		words: 1550,
		wordTarget: 1400,
		blocks: body(id, title, ["The short answer", "What affects the price", "How to choose"]),
		versions: [version(`v-${id}-1`, 1, "agent-generation", WRITER, "2026-08-10 08:00", 1550)],
		mrId,
	});
}

export function idea(id: string, title: string, keywordId: string, pillarId: string, intent: TIntent, contentType: IPost["contentType"], source: IPost["source"], week: number, extra: Partial<IPost> = {}): IPost {
	return post({ id, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), keywordId, pillarId, intent, contentType, source, state: "idea", week, daysInState: 2, ideaApproval: { status: "pending" }, ...extra });
}

function lumenPosts(): IPost[] {
	const ideas: IPost[] = [
		idea("p-aligners-vs-braces", "clear aligners vs braces for adults", "k-aligners-vs-braces", "p-ortho", "commercial", "comparison", "kas-gap", 40, { requires: ["table"] }),
		idea("p-implants-last", "how long do dental implants last", "k-implants-last", "p-implants", "informational", "guide", "keyword-swarm", 40),
		idea("p-whitening-sensitivity", "teeth whitening sensitivity", "k-whitening-sensitivity", "p-cosmetic", "informational", "how-to", "keyword-swarm", 40),
		idea("p-pediatric-lekki", "pediatric dentist near me in lekki", "k-pediatric-lekki", "p-pediatric", "transactional", "money-page", "kas-gap", 40),
		idea("p-baby-teeth", "do cavities in baby teeth matter?", "k-baby-teeth", "p-pediatric", "informational", "faq", "kas-gap", 41),
		idea("p-crown-cost", "dental crown cost in lagos", "k-crown-cost", "p-general", "commercial", "guide", "keyword-swarm", 41),
		idea("p-bad-breath", "bad breath: causes and fixes", "k-bad-breath", "p-general", "informational", "guide", "keyword-swarm", 41),
		idea("p-invisalign-teens", "invisalign for teenagers", "k-invisalign-teens", "p-ortho", "commercial", "guide", "keyword-swarm", 41),
		idea("p-all-on-4", "all-on-4 implants explained", "k-all-on-4", "p-implants", "commercial", "guide", "keyword-swarm", 42),
		idea("p-bonding-vs-veneers", "composite bonding vs veneers", "k-bonding-vs-veneers", "p-cosmetic", "commercial", "comparison", "keyword-swarm", 42, { requires: ["table"] }),
		idea("p-wisdom-recovery", "wisdom tooth removal recovery", "k-wisdom-recovery", "p-general", "informational", "how-to", "manual", 42),
		idea("p-clean-aligners", "how to clean clear aligners", "k-clean-aligners", "p-ortho", "informational", "how-to", "manual", 43),
	];
	const briefed: IPost[] = [
		post({ id: "p-sedation", title: "dental sedation options in lagos", slug: "dental-sedation-lagos", keywordId: "k-sedation", pillarId: "p-general", intent: "transactional", state: "briefed", week: 40, daysInState: 3, regulated: "health" }),
		post({ id: "p-zoom-whitening", title: "zoom teeth whitening cost", slug: "zoom-whitening-cost", keywordId: "k-zoom-whitening", pillarId: "p-cosmetic", intent: "commercial", state: "briefed", week: 40, daysInState: 1 }),
		post({ id: "p-fluoride-kids", title: "fluoride varnish for kids: is it safe?", slug: "fluoride-varnish-kids", keywordId: "k-fluoride-kids", pillarId: "p-pediatric", intent: "informational", source: "kas-gap", state: "briefed", week: 41, daysInState: 1, regulated: "health" }),
	];
	const drafting: IPost[] = [
		post({
			id: "p-implants-guide",
			title: "dental implants in lagos: the complete guide",
			seoTitle: "Dental Implants in Lagos: The Complete Guide (2026)",
			slug: "dental-implants-lagos-guide",
			keywordId: "k-implants-guide",
			pillarId: "p-implants",
			intent: "transactional",
			contentType: "pillar",
			strongModel: true,
			state: "drafting",
			progress: { label: "Writing section 4 of 7", value: 57 },
			wordTarget: 3200,
			words: 1740,
			regulated: "health",
		}),
		post({
			id: "p-child-first-visit",
			title: "when should a child first see a dentist",
			slug: "child-first-dentist-visit",
			keywordId: "k-child-first-visit",
			pillarId: "p-pediatric",
			intent: "informational",
			source: "kas-gap",
			state: "drafting",
			progress: { label: "Image sheet · 3 slots", value: 90 },
			words: 1350,
			wordTarget: 1400,
			regulated: "health",
		}),
	];
	const mrOpen: IPost[] = [
		mrPost("p-emergency", "emergency dentist in lekki: what to do after hours", "emergency-dentist-lekki-after-hours", "k-emergency-after-hours", "p-general", "transactional", "mr-44", 1, ["First, control the pain", "When it's a true emergency", "Our after-hours line"]),
		mrPost("p-gum-disease", "gum disease warning signs", "gum-disease-warning-signs", "k-gum-disease", "p-general", "informational", "mr-43", 3, ["Early signs", "What causes it", "Treatment options"]),
		mrPost("p-xray", "dental x-rays: are they safe?", "dental-x-rays-safety", "k-xray-safety", "p-general", "informational", "mr-42", 4, ["How much radiation", "How often you need them", "Pregnancy and x-rays"]),
	];
	const live: IPost[] = [
		livePost("p-live-invisalign", "invisalign cost in lagos", "invisalign-cost-lagos", "k-invisalign-cost", "p-ortho", "commercial", "live", 23, "mr-31"),
		livePost("p-live-whitening", "teeth whitening price in lagos", "whitening-cost", "k-whitening-price", "p-cosmetic", "commercial", "live", 30, "mr-29"),
		livePost("p-live-aligners", "clear aligners in lagos", "clear-aligners-lagos", "k-aligners-lagos", "p-ortho", "commercial", "live", 2, "mr-37"),
		livePost("p-live-braces", "braces for adults in lagos", "braces-adults-lagos", "k-braces-adults", "p-ortho", "commercial", "live", 16, "mr-33"),
		livePost("p-live-veneers", "how much do veneers cost in lagos", "veneers-cost-lagos", "k-veneers-lagos", "p-cosmetic", "commercial", "live", 9, "mr-35"),
	];
	const decaying: IPost[] = [
		livePost("p-dec-implant-cost", "dental implant cost in lagos", "dental-implant-cost-lagos", "k-implant-cost", "p-implants", "commercial", "decaying", 12),
		livePost("p-dec-root-canal-cost", "root canal cost in lagos", "root-canal-cost-lagos", "k-root-canal-cost", "p-general", "commercial", "decaying", 20),
		livePost("p-dec-pediatric", "pediatric dentist in lagos: how to choose", "pediatric-dentist-lagos", "k-pediatric-lagos", "p-pediatric", "transactional", "decaying", 8),
		livePost("p-dec-cleaning", "how often should you get a dental cleaning", "dental-cleaning-frequency", "k-cleaning-frequency", "p-general", "informational", "decaying", 26),
		livePost("p-dec-signs-root-canal", "signs you need a root canal", "signs-you-need-a-root-canal", "k-signs-root-canal", "p-general", "informational", "decaying", 31),
	];
	return [...ideas, ...briefed, ...drafting, veneers(), invisalign2026(), rootCanal(), implantVsBridge(), toothpaste(), ...mrOpen, ...live, ...decaying];
}

// ─── Image slots ─────────────────────────────────────────────────────────────

export const candidates = (prefix: string, hues: number[], selectedIdx = -1) => hues.map((hue, i) => ({ id: `${prefix}-c${i + 1}`, label: `candidate ${i + 1}`, hue, selected: i === selectedIdx }));

export type TSlotInit = Pick<IImageSlot, "id" | "postId" | "name" | "type" | "placement" | "filename" | "alt" | "provider" | "model" | "status"> & Partial<IImageSlot>;

export function slot(s: TSlotInit): IImageSlot {
	const dims: Record<IImageSlot["type"], [number, number]> = { hero: [1600, 900], lifestyle: [1200, 800], diagram: [1200, 675], screenshot: [1200, 750], chart: [1200, 600], photo: [1200, 800] };
	const [width, height] = dims[s.type];
	return {
		width,
		height,
		format: s.provider === "inline-svg" ? "svg" : "webp",
		breakpoints: s.type === "hero" ? [480, 768, 1200, 1600] : [480, 768, 1200],
		prompt: "",
		styleKeywords: ["Brand: warm ivory, teal", "Natural light, candid"],
		candidates: [],
		estimateUsd: s.provider === "inline-svg" || s.provider === "human" ? 0 : s.provider === "higgsfield" ? 0.18 : s.provider === "openai" ? 0.08 : 0.12,
		...s,
	};
}

function lumenSlots(): IImageSlot[] {
	return [
		// invisalign cost in lagos (2026 prices) — reference screen 03
		slot({
			id: "s-inv-hero",
			postId: "p-invisalign-2026",
			name: "Hero",
			type: "hero",
			placement: "Top of post",
			filename: "invisalign-lagos-hero.webp",
			alt: "Clear aligner trays beside a treatment plan at a Lagos dental clinic",
			prompt: "Clear aligner trays on a warm ivory counter beside a printed treatment plan, teal accents, soft window light, no people.",
			provider: "higgsfield",
			model: "higgsfield-preset",
			status: "selected",
			candidates: candidates("s-inv-hero", [168, 30, 190], 1),
			generatedAt: lagos("2026-09-25 09:58"),
		}),
		slot({
			id: "s-inv-timeline",
			postId: "p-invisalign-2026",
			name: "Treatment timeline diagram",
			type: "diagram",
			placement: 'After "How long does treatment take?"',
			filename: "invisalign-lagos-timeline.webp",
			alt: "Invisalign treatment timeline from first scan to retainers, 6 to 18 months",
			prompt: "Clean horizontal timeline diagram: scan, first aligners, refinements, retainers. Labels in English, teal on ivory, legible text.",
			styleKeywords: ["Brand: warm ivory, teal", "Flat, labelled"],
			provider: "openai",
			model: "openai-image",
			status: "generating",
		}),
		slot({
			id: "s-inv-chart",
			postId: "p-invisalign-2026",
			name: "Price comparison chart",
			type: "chart",
			placement: 'After "Invisalign vs braces: price comparison"',
			filename: "invisalign-vs-braces-price.svg",
			alt: "Bar chart comparing Invisalign and braces prices in Lagos by case complexity",
			prompt: "Rendered from the post's own price table. Never generated.",
			styleKeywords: ["Brand palette"],
			provider: "inline-svg",
			model: "inline-svg",
			status: "selected",
			candidates: [{ id: "s-inv-chart-c1", label: "rendered from post data", hue: 174, selected: true }],
			generatedAt: lagos("2026-09-22 07:16"),
		}),
		slot({
			id: "s-inv-lifestyle",
			postId: "p-invisalign-2026",
			name: "Lifestyle · inline 2",
			type: "lifestyle",
			placement: 'After "Is it worth the cost?"',
			filename: "invisalign-lagos-2.webp",
			alt: "Patient holding a clear aligner case at a dental clinic in Lagos",
			prompt: "Adult patient smiling mid-conversation at a bright dental clinic, clear aligner case on the counter, shallow depth of field, no identifiable real person.",
			provider: "open-source",
			model: "flux-dev",
			status: "candidates",
			candidates: candidates("s-inv-lifestyle", [32, 184, 20, 200], 2),
			generatedAt: lagos("2026-09-25 10:42"),
		}),
		slot({
			id: "s-inv-reception",
			postId: "p-invisalign-2026",
			name: "Clinic reception photo",
			type: "photo",
			placement: 'After "Where to get Invisalign in Lagos"',
			filename: "lumen-lekki-reception.webp",
			alt: "Reception desk at the Lumen Dental clinic in Lekki",
			prompt: "Real photo of the Lekki reception. Brand rule: real premises are never generated.",
			styleKeywords: ["Real photo only"],
			provider: "human",
			model: "—",
			status: "human-only",
		}),
		// porcelain veneers: before and after
		slot({
			id: "s-ven-hero",
			postId: "p-veneers",
			name: "Hero",
			type: "hero",
			placement: "Top of post",
			filename: "porcelain-veneers-hero.webp",
			alt: "Close-up of a natural-looking smile with porcelain veneers",
			prompt: "Close-up of a natural smile, warm ivory backdrop, teal accent, no identifiable real person.",
			provider: "higgsfield",
			model: "higgsfield-preset",
			status: "generating",
		}),
		slot({
			id: "s-ven-clinic",
			postId: "p-veneers",
			name: "Before and after · clinic photo",
			type: "photo",
			placement: 'After "What changes, and what doesn\'t"',
			filename: "veneers-before-after-lumen.webp",
			alt: "Before and after photos of a Lumen Dental veneers patient, shared with consent",
			prompt: "Consented patient photos from the clinic. Never generated: real results only.",
			styleKeywords: ["Real photo only", "Consent on file"],
			provider: "human",
			model: "—",
			status: "human-only",
		}),
		slot({
			id: "s-ven-steps",
			postId: "p-veneers",
			name: "Appointment steps diagram",
			type: "diagram",
			placement: 'After "The appointment, step by step"',
			filename: "veneers-steps.webp",
			alt: "Three steps of a veneers appointment: prepare, bond, polish",
			prompt: "Three-step labelled diagram: prepare, bond, polish. Teal on ivory, legible labels.",
			provider: "openai",
			model: "openai-image",
			status: "selected",
			candidates: candidates("s-ven-steps", [176, 188, 30], 0),
			generatedAt: lagos("2026-09-10 08:44"),
		}),
		// root canal recovery (3 of 3 filled)
		...(["hero", "diagram", "lifestyle"] as const).map((type, i) =>
			slot({
				id: `s-rc-${type}`,
				postId: "p-root-canal",
				name: type === "hero" ? "Hero" : type === "diagram" ? "Root canal steps diagram" : "Lifestyle · inline 3",
				type,
				placement: ["Top of post", 'After "Eating after a root canal"', 'After "When to call the clinic"'][i],
				filename: `root-canal-recovery-${i + 1}.webp`,
				alt: ["Patient resting comfortably at home after dental treatment", "Diagram of a root canal: access, cleaning, filling, crown", "Adult eating soft food at a kitchen table"][i],
				prompt: "Generated from the production sheet.",
				provider: type === "diagram" ? ("openai" as const) : ("higgsfield" as const),
				model: type === "diagram" ? "openai-image" : "higgsfield-preset",
				status: "selected" as const,
				candidates: candidates(`s-rc-${type}`, [170 + i * 10, 28, 196], 0),
				generatedAt: lagos("2026-09-25 09:50"),
			}),
		),
		// implant vs bridge (4 of 4 filled)
		...(["hero", "diagram", "chart", "lifestyle"] as const).map((type, i) =>
			slot({
				id: `s-ivb-${type}`,
				postId: "p-implant-vs-bridge",
				name: ["Hero", "Implant vs bridge diagram", "15-year cost chart", "Lifestyle · inline 4"][i],
				type,
				placement: ["Top of post", 'After "What a bridge costs"', 'After "How long each one lasts"', 'After "Which one protects your other teeth"'][i],
				filename: `implant-vs-bridge-${i + 1}.${type === "chart" ? "svg" : "webp"}`,
				alt: ["Dental implant model next to a dental bridge model", "Cross-section comparing an implant and a three-unit bridge", "Chart of implant vs bridge cost over 15 years", "Smiling adult at a dental check-up"][i],
				prompt: type === "chart" ? "Rendered from the post's own cost data. Never generated." : "Generated from the production sheet.",
				provider: type === "chart" ? ("inline-svg" as const) : type === "diagram" ? ("openai" as const) : ("higgsfield" as const),
				model: type === "chart" ? "inline-svg" : type === "diagram" ? "openai-image" : "higgsfield-preset",
				status: "selected" as const,
				candidates: candidates(`s-ivb-${type}`, [160 + i * 8, 34], 0),
				generatedAt: lagos("2026-09-24 08:40"),
			}),
		),
		// best toothpaste (2 of 2 filled)
		...(["hero", "lifestyle"] as const).map((type, i) =>
			slot({
				id: `s-tp-${type}`,
				postId: "p-toothpaste",
				name: type === "hero" ? "Hero" : "Lifestyle · inline 2",
				type,
				placement: type === "hero" ? "Top of post" : 'After "Our picks, compared"',
				filename: `sensitive-toothpaste-${i + 1}.webp`,
				alt: type === "hero" ? "Tubes of toothpaste for sensitive teeth on a bathroom shelf" : "Adult brushing teeth gently at a bathroom mirror",
				prompt: "Generated from the production sheet.",
				provider: "open-source" as const,
				model: "flux-dev",
				status: "selected" as const,
				candidates: candidates(`s-tp-${type}`, [186, 40, 12], 0),
				generatedAt: lagos("2026-09-21 06:55"),
			}),
		),
	];
}

// ─── Template manifests (reference screen 04) ────────────────────────────────

let mapSeq = 0;
const M = (selector: string, role: ITemplateMapping["role"], group: ITemplateMapping["group"], detail: string, status: ITemplateMapping["status"] = "mapped", extra: Partial<ITemplateMapping> = {}): ITemplateMapping => ({
	id: `map-${++mapSeq}`,
	selector,
	role,
	group,
	status,
	detail,
	...extra,
});

/** 24 auto-mapped + 2 unclassified + table absent. Shared by ingestion so re-parses look identical. */
export function standardMappings(prefix: string, resolved = false): ITemplateMapping[] {
	mapSeq = 0;
	const rows = [
		M("article.post", "content-region", "content", "Content region"),
		M("div.post__body", "content-region", "content", "Body wrapper"),
		M("p", "content-region", "content", "Paragraphs"),
		M("h2.post__heading", "heading", "content", "Headings · h2.post__heading, h3"),
		M("h3", "heading", "content", "Sub-headings"),
		M("ul", "list", "content", "Lists, quotes · ul, ol, blockquote.pull"),
		M("ol", "list", "content", "Ordered lists"),
		M("blockquote.pull", "quote", "content", "Pull quotes"),
		M("pre > code", "content-region", "content", "Code blocks"),
		M("figure.post-media > img[srcset]", "image", "images", "Image · srcset ×3"),
		M("figure.post-media--wide", "image", "images", "Wide image container"),
		M("figcaption", "image", "images", "Caption"),
		M("title", "meta", "meta", "Title"),
		M('meta[name="description"]', "meta", "meta", "Description"),
		M('link[rel="canonical"]', "meta", "meta", "Canonical"),
		M('meta[property="og:title"]', "meta", "meta", "og:title"),
		M('meta[property="og:description"]', "meta", "meta", "og:description"),
		M('meta[property="og:image"]', "meta", "meta", "og:image"),
		M('meta[property="og:type"]', "meta", "meta", "og:type"),
		M("time.post__date", "meta", "meta", "Publish date"),
		M("span.post__author", "meta", "meta", "Author"),
		M("a.post__tag", "meta", "meta", "Tags"),
		M('meta[name="twitter:card"]', "meta", "meta", "Twitter card"),
		M('script[type="application/ld+json"]', "schema", "meta", "Schema · Article (JSON-LD)"),
		resolved
			? M("div.cta-inline", "content-region", "content", "Inline call to action", "mapped", { label: "CTA block" })
			: M("div.cta-inline", "unclassified", "content", "Unclassified · map once", "needs-you", { options: ["CTA block", "Callout", "Ignore"] }),
		resolved
			? M("aside.author-card", "meta", "meta", "Author bio card", "mapped", { label: "Author bio" })
			: M("aside.author-card", "unclassified", "meta", "Author bio?", "needs-you", { options: ["Author bio", "Callout", "Ignore"] }),
		M("table", "table", "content", "Not in template · posts needing one are held", "absent"),
	];
	return rows.map((r) => ({ ...r, id: `${prefix}-${r.id}` }));
}

function lumenManifests(): ITemplateManifest[] {
	return [
		{ id: "tm-lumen-1", version: 1, source: "lumen-blog-post.html · 1 file", kind: "html", output: "mdx", status: "confirmed", confirmedBy: KO, confirmedAt: lagos("2026-07-02 14:20"), mappings: standardMappings("tm1", true) },
		{ id: "tm-lumen-2", version: 2, source: "lumen-site.zip · 38 files", kind: "zip", output: "mdx", status: "needs-confirmation", mappings: standardMappings("tm2") },
	];
}

// ─── Merge requests ──────────────────────────────────────────────────────────

export function mrDescription(keyword: string, intent: string, onPage: string, links: number, schema: string, overrides: string[] = []): string {
	return [
		`**Keyword** ${keyword}  `,
		`**Intent** ${intent}  `,
		`**On-page** ${onPage}  `,
		`**Internal links added** ${links}  `,
		`**Schema** ${schema}`,
		overrides.length ? `\n**Unresolved (soft gate overridden)**\n${overrides.map((o) => `- ${o}`).join("\n")}` : "",
		"\nWrites only to `content/blog` and `public/images/blog`. Opened by the CMS agent · Edit in CMS.",
	].join("\n");
}

function mrFiles(slug: string, images: number, lines: number): IMergeRequest["files"] {
	const files: IMergeRequest["files"] = [{ path: `content/blog/${slug}.mdx`, change: `+${lines}`, kind: "post" }];
	if (images) files.push({ path: `public/images/blog/ · ${images} WebP`, change: `${images * 78} KB`, kind: "assets" });
	files.push({ path: "public/sitemap.xml", change: "+1", kind: "index" });
	return files;
}

function lumenMrs(): IMergeRequest[] {
	const base = { host: "github" as const, base: "main", overrides: [] as string[], manifestVersion: 1 };
	return [
		{
			...base,
			id: "mr-44",
			number: 44,
			postId: "p-emergency",
			title: "content: add emergency dentist in lekki: what to do after hours",
			branch: "content/emergency-dentist-lekki-after-hours",
			status: "open",
			ci: "passing",
			previewUrl: "https://lumendental-git-content-emergency-dentist-lekki-after-hours.vercel.app/blog/emergency-dentist-lekki-after-hours",
			files: mrFiles("emergency-dentist-lekki-after-hours", 3, 198),
			description: mrDescription("emergency dentist lekki after hours", "Transactional", "12 / 12", 2, "Article, FAQPage"),
			openedAt: lagos("2026-09-24 15:20"),
		},
		{
			...base,
			id: "mr-43",
			number: 43,
			postId: "p-gum-disease",
			title: "content: add gum disease warning signs",
			branch: "content/gum-disease-warning-signs",
			status: "open",
			ci: "failing",
			ciDetail: "lint · markdownlint MD034 (bare URL) in content/blog/gum-disease-warning-signs.mdx:48",
			previewUrl: "https://lumendental-git-content-gum-disease-warning-signs.vercel.app/blog/gum-disease-warning-signs",
			files: mrFiles("gum-disease-warning-signs", 2, 187),
			description: mrDescription("gum disease warning signs", "Informational", "12 / 12", 2, "Article, FAQPage"),
			openedAt: lagos("2026-09-22 11:05"),
		},
		{
			...base,
			id: "mr-42",
			number: 42,
			postId: "p-xray",
			title: "content: add dental x-rays: are they safe?",
			branch: "content/dental-x-rays-safety",
			status: "conflict",
			ci: "none",
			conflictDetail: "public/sitemap.xml changed on main after the branch was cut (3 commits behind). The CMS will rebase and re-render from the current manifest.",
			files: mrFiles("dental-x-rays-safety", 2, 176),
			description: mrDescription("are dental x-rays safe", "Informational", "11 / 12 · 1 override", 1, "Article", ["Internal links 1 of 2: only one related page is live."]),
			overrides: ["Internal links 1 of 2: only one related page is live."],
			openedAt: lagos("2026-09-21 09:30"),
		},
		...(
			[
				["mr-37", 37, "p-live-aligners", "clear-aligners-lagos", "2026-09-18 10:00", "2026-09-23 10:12"],
				["mr-35", 35, "p-live-veneers", "veneers-cost-lagos", "2026-09-14 09:00", "2026-09-16 16:40"],
				["mr-33", 33, "p-live-braces", "braces-adults-lagos", "2026-09-07 09:00", "2026-09-09 12:05"],
				["mr-31", 31, "p-live-invisalign", "invisalign-cost-lagos", "2026-08-31 09:00", "2026-09-02 11:30"],
				["mr-29", 29, "p-live-whitening", "whitening-cost", "2026-08-24 09:00", "2026-08-26 15:15"],
			] as const
		).map(([id, number, postId, slug, opened, merged]) => ({
			...base,
			id,
			number,
			postId,
			title: `content: add ${slug.replace(/-/g, " ")}`,
			branch: `content/${slug}`,
			status: "merged" as const,
			ci: "passing" as const,
			files: mrFiles(slug, 3, 205),
			description: mrDescription(slug.replace(/-/g, " "), "Commercial", "12 / 12", 2, "Article, FAQPage"),
			openedAt: lagos(opened),
			mergedAt: lagos(merged),
			mergedBy: KO,
		})),
	];
}

// ─── Runs & schedules ────────────────────────────────────────────────────────

export function run(r: Omit<IRun, "tokens" | "costUsd"> & { costUsd?: number; tokens?: number }): IRun {
	const costUsd = r.costUsd ?? (r.status === "succeeded" ? Math.round(r.estimateUsd * 94) / 100 : 0);
	return { tokens: r.tokens ?? Math.round(costUsd * 52000), costUsd, ...r };
}

function lumenRuns(): IRun[] {
	return [
		run({ id: "r-l-01", kind: "post-generation", trigger: "manual", status: "running", agent: WRITER, model: "strongest", tier: "strongest", estimateUsd: 3.6, startedAt: lagos("2026-09-25 10:31"), postId: "p-implants-guide", output: "Writing section 4 of 7", budget: "text" }),
		run({ id: "r-l-02", kind: "post-generation", trigger: "scheduled", status: "running", agent: WRITER, model: "workhorse", tier: "workhorse", estimateUsd: 1.8, startedAt: lagos("2026-09-25 10:20"), postId: "p-child-first-visit", output: "Image sheet · 3 slots", budget: "text" }),
		run({ id: "r-l-03", kind: "image-generation", trigger: "scheduled", status: "running", agent: "Image pipeline agent", model: "higgsfield-preset", tier: "workhorse", estimateUsd: 0.26, startedAt: lagos("2026-09-25 10:38"), output: "Higgsfield returning 4 candidates · OpenAI diagram generating", budget: "image" }),
		run({ id: "r-l-04", kind: "image-generation", trigger: "manual", status: "succeeded", agent: "Image pipeline agent", model: "flux-dev", tier: "workhorse", estimateUsd: 0.12, costUsd: 0.12, tokens: 0, startedAt: lagos("2026-09-25 10:41"), durationSec: 48, postId: "p-invisalign-2026", slotId: "s-inv-lifestyle", output: "4 candidates · Lifestyle · inline 2", budget: "image" }),
		run({ id: "r-l-05", kind: "technical-monitor", trigger: "scheduled", status: "succeeded", agent: "Technical monitor agent", model: "fast", tier: "fast", estimateUsd: 0.9, startedAt: lagos("2026-09-25 07:00"), durationSec: 412, output: "Health 96 · 2 issues queued (1 redirect chain, 1 missing alt on /services)", budget: "text" }),
		run({ id: "r-l-06", kind: "biweekly-report", trigger: "scheduled", status: "succeeded", agent: "Visualization agent", model: "strongest", tier: "strongest", estimateUsd: 2.4, startedAt: lagos("2026-09-25 07:30"), durationSec: 236, output: "Edition 12 stored · 3 pivot triggers", budget: "text" }),
		run({ id: "r-l-07", kind: "kas-recalc", trigger: "scheduled", status: "succeeded", agent: "CMS agent", model: "fast", tier: "fast", estimateUsd: 0.3, startedAt: lagos("2026-09-24 10:12"), durationSec: 31, output: "Recalculated after 1 merge · concentration 64% · fragile", budget: "text" }),
		run({ id: "r-l-08", kind: "post-generation", trigger: "manual", status: "succeeded", agent: WRITER, model: "workhorse", tier: "workhorse", estimateUsd: 1.8, startedAt: lagos("2026-09-25 09:42"), durationSec: 540, postId: "p-root-canal", output: "Draft v1 · 1,488 words · 3 slots · 1 unresolved fact marker", budget: "text" }),
		run({ id: "r-l-09", kind: "post-generation", trigger: "scheduled", status: "succeeded", agent: WRITER, model: "workhorse", tier: "workhorse", estimateUsd: 1.8, startedAt: lagos("2026-09-24 08:10"), durationSec: 498, postId: "p-implant-vs-bridge", output: "Draft v1 · 1,540 words · 4 slots", budget: "text" }),
		run({ id: "r-l-10", kind: "post-generation", trigger: "scheduled", status: "succeeded", agent: WRITER, model: "strongest", tier: "strongest", estimateUsd: 3.6, startedAt: lagos("2026-09-22 07:15"), durationSec: 702, postId: "p-invisalign-2026", output: "Draft v1 · 1,580 words · 5 slots (1 human-only)", budget: "text" }),
		run({ id: "r-l-11", kind: "keyword-swarm", trigger: "scheduled", status: "succeeded", agent: "Keyword swarm agent", model: "fast", tier: "fast", estimateUsd: 4.2, startedAt: lagos("2026-09-21 09:00"), durationSec: 1310, output: "14 ideas · 9 deduplicated against live and planned · 5 new in Idea", budget: "text" }),
		run({ id: "r-l-12", kind: "content-refresh", trigger: "manual", status: "succeeded", agent: "Refresh agent", model: "workhorse", tier: "workhorse", estimateUsd: 6.5, startedAt: lagos("2026-09-21 06:30"), durationSec: 1840, postId: "p-toothpaste", output: "1 refresh draft · prune list (4 posts) awaiting sign-off", budget: "text" }),
		run({ id: "r-l-13", kind: "qa-sweep", trigger: "scheduled", status: "succeeded", agent: "QA agent", model: "workhorse", tier: "workhorse", estimateUsd: 1.4, startedAt: lagos("2026-09-18 08:00"), durationSec: 655, output: "Full sweep · scorecard 11/12 · 2 items added to the human ledger", budget: "text" }),
		run({ id: "r-l-14", kind: "link-prospecting", trigger: "scheduled", status: "failed", agent: "Link prospecting agent", model: "workhorse", tier: "workhorse", estimateUsd: 3.1, costUsd: 0.4, startedAt: lagos("2026-09-15 06:00"), durationSec: 900, output: "Failed: Ahrefs export timed out after 3 retries. No prospects written; nothing billed beyond the crawl.", budget: "text" }),
		run({ id: "r-l-15", kind: "image-generation", trigger: "manual", status: "succeeded", agent: "Image pipeline agent", model: "higgsfield-preset", tier: "workhorse", estimateUsd: 0.18, costUsd: 0.18, tokens: 0, startedAt: lagos("2026-09-25 09:58"), durationSec: 64, postId: "p-invisalign-2026", slotId: "s-inv-hero", output: "3 candidates · Hero · candidate 2 selected", budget: "image" }),
	];
}

export function schedules(next: Partial<Record<TRunKind, string>>, disabled: TRunKind[] = []): ISchedule[] {
	const rows: [TRunKind, string, string, string][] = [
		["keyword-swarm", "Keyword swarm", "Monday weekly", "New ideas in the plan"],
		["post-generation", "Post generation", "Per publish slot", "Drafts in review"],
		["technical-monitor", "Technical monitor", "Friday weekly", "Health digest, issues in the queue"],
		["qa-sweep", "QA sweep", "Friday light, bi-weekly full", "Scorecard and the human ledger"],
		["content-refresh", "Content refresh", "Monthly", "Refresh drafts and a prune list"],
		["link-prospecting", "Link prospecting", "Monthly", "Prospects and outreach drafts"],
		["biweekly-report", "Bi-weekly report", "Alternate Fridays", "The visual progress report"],
		["kas-recalc", "KAS recalculation", "24 hours post-merge, then weekly", "Updated attribution"],
		["image-generation", "Image generation", "On slot creation", "Candidates for each image slot"],
	];
	return rows.map(([kind, label, cadence, produces]) => ({ kind, label, cadence, produces, nextAt: next[kind] ?? lagos("2026-09-28 09:00"), enabled: !disabled.includes(kind) }));
}

// ─── Assemble ────────────────────────────────────────────────────────────────

export function withPillarShares(pillars: IPillar[], keywords: IKeyword[]): IPillar[] {
	const dist = new Map(pillarDistribution(keywords, pillars).map((d) => [d.pillarId, d]));
	return pillars.map((p) => ({ ...p, kasShare: dist.get(p.id)?.share ?? 0, claimedButUnearned: dist.get(p.id)?.claimedButUnearned ?? false }));
}

function snapshot(id: string, at: string, trigger: IKasSnapshot["trigger"], label: string, keywords: IKeyword[], mode: "before" | "after", extra: Partial<IKasSnapshot> = {}): IKasSnapshot {
	const ranked = keywords.filter((k) => k.position !== null);
	const shares = ranked.map((k) => ({
		keywordId: k.id,
		share: mode === "after" ? k.kasShare : Math.round((k.kasShare - k.kasDelta) * 10) / 10,
		position: mode === "after" ? k.position : k.positionTrend[k.positionTrend.length - 2] ?? k.position,
	}));
	return { id, at, trigger, label, concentration: concentration(shares.map((s) => ({ id: s.keywordId, kasShare: s.share }))).top, shares, ...extra };
}

function lumenData(): ISiteData {
	const keywords = lumenKeywords();
	const pillars = withPillarShares(
		[
			{ id: "p-ortho", name: "Orthodontics", plannedPosts: 12, livePosts: 14, kasShare: 0, claimedButUnearned: false },
			{ id: "p-implants", name: "Implants", plannedPosts: 10, livePosts: 9, kasShare: 0, claimedButUnearned: false },
			{ id: "p-cosmetic", name: "Cosmetic", plannedPosts: 8, livePosts: 8, kasShare: 0, claimedButUnearned: false },
			{ id: "p-general", name: "General", plannedPosts: 10, livePosts: 8, kasShare: 0, claimedButUnearned: false },
			{ id: "p-pediatric", name: "Pediatric", plannedPosts: 6, livePosts: 2, kasShare: 0, claimedButUnearned: false },
		],
		keywords,
	);
	const ledger: ILedgerItem[] = [
		{ id: "l-veneers-photo", title: "Clinic photo for veneers post", owner: TB, createdAt: lagos("2026-09-10 09:00"), ageDays: 15, downstream: "holds 1 post in Needs assets", postId: "p-veneers", slotId: "s-ven-clinic" },
		{ id: "l-prune", title: "Sign off prune list · Sept", owner: TB, createdAt: lagos("2026-09-16 09:00"), ageDays: 9, downstream: "4 thin posts stay indexed until signed off" },
		{ id: "l-reception", title: "Clinic reception photo · invisalign post", owner: TB, createdAt: lagos("2026-09-22 07:30"), ageDays: 3, downstream: "holds 1 post in Needs assets", postId: "p-invisalign-2026", slotId: "s-inv-reception" },
		{ id: "l-review-rc", title: "Review root canal draft", owner: TB, createdAt: lagos("2026-09-23 10:00"), ageDays: 2, downstream: "1 post waiting in In review", postId: "p-root-canal" },
	];
	return {
		pillars,
		keywords,
		posts: lumenPosts(),
		slots: lumenSlots(),
		manifests: lumenManifests(),
		mergeRequests: lumenMrs(),
		runs: lumenRuns(),
		schedules: schedules({
			"keyword-swarm": lagos("2026-09-28 09:00"),
			"post-generation": lagos("2026-09-28 06:00"),
			"technical-monitor": lagos("2026-10-02 07:00"),
			"qa-sweep": lagos("2026-10-02 08:00"),
			"content-refresh": lagos("2026-10-01 06:00"),
			"link-prospecting": lagos("2026-10-15 06:00"),
			"biweekly-report": lagos("2026-10-09 07:30"),
			"kas-recalc": lagos("2026-10-01 06:00"),
			"image-generation": lagos("2026-09-25 10:42"),
		}),
		ledger,
		trajectory: [
			["W32", 2380, 38200, 2410],
			["W33", 2470, 40100, 2530],
			["W34", 2610, 42900, 2660],
			["W35", 2700, 44800, 2790],
			["W36", 2820, 47300, 2930],
			["W37", 2950, 50600, 3080],
			["W38", 3060, 53100, 3235],
			["W39", 3184, 55400, 3395],
		].map(([week, sessions, impressions, projected]) => ({ week: week as string, sessions: sessions as number, impressions: impressions as number, projected: projected as number })),
		planStatus: [
			{ id: "cadence", label: "Cadence", value: "3 / 4 wk", light: "amber", detail: "3 of 4 posts reached a merge request this week" },
			{ id: "pillar-coverage", label: "Pillar coverage", value: "4 / 5", light: "amber", detail: "Pediatric holds 3% of score: claimed, unearned" },
			{ id: "technical-health", label: "Technical health", value: "96", light: "green", detail: "Technical monitor · Fri 25 Sep · 2 minor issues queued" },
			{ id: "human-execution", label: "Human items executed", value: "62%", light: "amber", detail: "8 of 13 human-owned items done on time this cycle" },
		],
		reports: [
			{ id: "rep-12", n: 12, period: "11 – 24 Sep 2026", publishedAt: lagos("2026-09-25 07:34"), headline: "Sessions 6.2% under the month-3 projection; top-5 concentration crossed 60%.", pivotTriggers: ["Concentration 64% · above the 60% fragile line", "Pediatric 3% of score · claimed but unearned", "dental implants lagos decaying (pos 11 ↓) on an orphan page carrying 14.2%"] },
			{ id: "rep-11", n: 11, period: "28 Aug – 10 Sep 2026", publishedAt: lagos("2026-09-11 07:31"), headline: "Cadence back to 4 / wk; invisalign cost lagos became the top keyword.", pivotTriggers: ["Implants share falling two editions running"] },
			{ id: "rep-10", n: 10, period: "14 – 27 Aug 2026", publishedAt: lagos("2026-08-28 07:29"), headline: "First month-3 edition: sessions 1.2% under projection.", pivotTriggers: [] },
		],
		kasSnapshots: [
			snapshot("kas-0924", lagos("2026-09-24 10:12"), "post-merge", "Recalculated 24 Sep · after 1 merge", keywords, "after", { mrId: "mr-37", postId: "p-live-aligners" }),
			snapshot("kas-0917", lagos("2026-09-17 06:00"), "weekly", "Weekly · 17 Sep", keywords, "before"),
		],
		audit: [
			{ id: "a-l-01", at: lagos("2026-09-25 10:41"), actor: TB, action: "regenerated slot", target: "Lifestyle · inline 2", detail: "invisalign cost in lagos (2026 prices) · est. $0.12" },
			{ id: "a-l-02", at: lagos("2026-09-25 10:38"), actor: TB, action: "edited", target: "root canal recovery: what to expect", detail: "v4 · human edit" },
			{ id: "a-l-03", at: lagos("2026-09-25 10:31"), actor: TB, action: "triggered run", target: "Post generation", detail: "dental implants in lagos: the complete guide · strongest model · est. $3.60" },
			{ id: "a-l-04", at: lagos("2026-09-25 07:34"), actor: "Visualization agent", action: "stored report", target: "Edition 12" },
			{ id: "a-l-05", at: lagos("2026-09-24 15:20"), actor: TB, action: "approved", target: "emergency dentist in lekki: what to do after hours", detail: "Facts, voice and brand asserted · 0 overrides" },
			{ id: "a-l-06", at: lagos("2026-09-24 15:20"), actor: "CMS agent", action: "opened MR", target: "#44 content/emergency-dentist-lekki-after-hours", detail: "GitHub · main" },
			{ id: "a-l-07", at: lagos("2026-09-24 10:12"), actor: "CMS agent", action: "recalculated KAS", target: "Lumen Dental", detail: "24h after #37 merged" },
			{ id: "a-l-08", at: lagos("2026-09-23 10:12"), actor: KO, action: "merged", target: "#37 content/clear-aligners-lagos", detail: "Post is Live · scoring run scheduled for 24 Sep 10:12" },
			{ id: "a-l-09", at: lagos("2026-09-22 07:30"), actor: TB, action: "marked human-only", target: "Clinic reception photo", detail: "invisalign cost in lagos (2026 prices)" },
			{ id: "a-l-10", at: lagos("2026-09-21 09:30"), actor: TB, action: "overrode soft block", target: "dental x-rays: are they safe?", detail: 'Internal links 1 of 2 · "Only one related page is live."' },
			{ id: "a-l-11", at: lagos("2026-07-02 14:20"), actor: KO, action: "confirmed manifest", target: "Template manifest v1", detail: "lumen-blog-post.html · output MDX + frontmatter" },
		],
		notifications: [
			{ id: "n-l-01", at: lagos("2026-09-25 07:34"), tone: "block", title: "Pivot trigger: concentration 64%", body: "Top 5 keywords hold 64% of search weight. Above 60% is fragile.", href: "/seo", read: false },
			{ id: "n-l-02", at: lagos("2026-09-25 09:00"), tone: "block", title: "Blocker: clinic photo for veneers post", body: "Day 15 · holds 1 post in Needs assets.", href: "/posts/p-veneers/assets?slot=s-ven-clinic", read: false },
			{ id: "n-l-03", at: lagos("2026-09-24 14:05"), tone: "human", title: "Approval requested", body: "implant vs bridge: cost and lifespan is ready for review.", href: "/approvals?post=p-implant-vs-bridge", read: false },
			{ id: "n-l-04", at: lagos("2026-09-22 11:40"), tone: "block", title: "CI failing on #43", body: "lint · markdownlint MD034 in gum-disease-warning-signs.mdx", href: "/merge-requests", read: true },
			{ id: "n-l-05", at: lagos("2026-09-23 08:15"), tone: "human", title: "Conflict on #42", body: "Base branch moved. Rebase and re-render from the current manifest.", href: "/merge-requests", read: true },
			{ id: "n-l-06", at: lagos("2026-09-23 10:12"), tone: "pass", title: "#37 merged · clear aligners in lagos is Live", body: "Attribution recalculates 24 h after merge.", href: "/seo", read: true },
		],
		liveBaseline: 36, // 41 live − 5 seeded live posts
		routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
		modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", "pillar-pages": "strongest" },
		brandPack: {
			voice: "Warm, plain-spoken, clinically careful. Prices in naira with the year. Never promise outcomes.",
			palette: ["#F6F1E7", "#0F766E", "#111317"],
			styleKeywords: ["Brand: warm ivory, teal", "Natural light, candid", "No identifiable real people"],
			disclaimers: { health: HEALTH_DISCLAIMER },
		},
	};
}

function northwindData(): ISiteData {
	const NW = "Northwind";
	const keywords = [
		kw("nk-unfair-dismissal", "unfair dismissal claim england", "pl-employment", "commercial", 44, "SERP"),
		kw("nk-settlement", "settlement agreement solicitor", "pl-employment", "transactional", 39, "SERP"),
		kw("nk-deposit", "tenancy deposit dispute", "pl-property", "informational", 27, "SERP"),
		kw("nk-skilled-worker", "skilled worker visa sponsor licence", "pl-immigration", "commercial", 48, "SERP"),
		kw("nk-ltd-company", "setting up a limited company", "pl-business", "informational", 35, "SERP"),
	];
	const posts: IPost[] = [
		idea("np-settlement", "settlement agreements explained", "nk-settlement", "pl-employment", "transactional", "guide", "keyword-swarm", 40),
		idea("np-deposit", "tenancy deposit disputes: your options", "nk-deposit", "pl-property", "informational", "guide", "manual", 40),
		idea("np-ltd", "setting up a limited company: first 30 days", "nk-ltd-company", "pl-business", "informational", "how-to", "keyword-swarm", 41),
		post({ id: "np-sponsor", title: "skilled worker sponsor licence checklist", slug: "sponsor-licence-checklist", keywordId: "nk-skilled-worker", pillarId: "pl-immigration", intent: "commercial", state: "briefed", week: 40, daysInState: 2, regulated: "legal" }),
		post({
			id: "np-unfair-dismissal",
			title: "unfair dismissal claims: a plain guide",
			seoTitle: "Unfair Dismissal Claims in England: A Plain Guide",
			slug: "unfair-dismissal-claims-guide",
			keywordId: "nk-unfair-dismissal",
			pillarId: "pl-employment",
			intent: "commercial",
			state: "in-review",
			daysInState: 1,
			words: 1480,
			wordTarget: 1400,
			regulated: "legal",
			blocks: [
				B("nud-b1", "p", "An unfair dismissal claim asks an employment tribunal to decide whether your employer had a fair reason to dismiss you, and whether they followed a fair process."),
				B("nud-img", "image", "s-nud-hero"),
				B("nud-h1", "h2", "Who can claim"),
				B("nud-p1", "p", "Most employees need two years' continuous service, though some reasons for dismissal are automatically unfair from day one."),
				B("nud-h2", "h2", "Time limits"),
				B("nud-p2", "p", "Start early conciliation with Acas within three months less one day of the dismissal."),
			],
			gate: gate12({ titleCh: 49, density: "1.2% · 8 uses", headings: "H1 · 2×H2", internal: 2, faq: 3, schema: "Article, FAQPage", images: 1 }),
			facts: [{ id: "nf-1", claim: "within three months less one day", status: "resolved", source: "https://www.gov.uk/dismissal/what-to-do-if-youre-dismissed", note: "Sourced by the agent." }],
			versions: [version("nv-1", 1, "agent-generation", WRITER, "2026-09-24 09:00", 1480, "First draft from brief")],
			slotIds: ["s-nud-hero"],
		}),
	];
	return {
		pillars: [
			{ id: "pl-employment", name: "Employment law", plannedPosts: 6, livePosts: 2, kasShare: 0, claimedButUnearned: false },
			{ id: "pl-property", name: "Property & tenancy", plannedPosts: 4, livePosts: 1, kasShare: 0, claimedButUnearned: false },
			{ id: "pl-immigration", name: "Immigration", plannedPosts: 4, livePosts: 0, kasShare: 0, claimedButUnearned: false },
			{ id: "pl-business", name: "Business formation", plannedPosts: 3, livePosts: 0, kasShare: 0, claimedButUnearned: false },
		],
		keywords,
		posts,
		slots: [
			slot({
				id: "s-nud-hero",
				postId: "np-unfair-dismissal",
				name: "Hero",
				type: "hero",
				placement: "Top of post",
				filename: "unfair-dismissal-hero.webp",
				alt: "Employment tribunal paperwork on a desk",
				prompt: "Paperwork and a pen on a navy desk, soft light, no people.",
				styleKeywords: ["Brand: navy, paper white", "Quiet, documentary"],
				provider: "openai",
				model: "openai-image",
				status: "selected",
				candidates: candidates("s-nud-hero", [220, 210], 0),
				generatedAt: lagos("2026-09-24 09:20"),
			}),
		],
		manifests: [],
		mergeRequests: [],
		runs: [
			run({ id: "r-n-01", kind: "keyword-swarm", trigger: "manual", status: "refused-over-cap", agent: "Keyword swarm agent", model: "fast", tier: "fast", estimateUsd: 4.2, startedAt: lagos("2026-09-24 16:30"), output: "Refused: est. $4.20 would take text spend to $100.70, over the $100.00 monthly cap. An admin can raise the cap.", budget: "text" }),
			run({ id: "r-n-02", kind: "post-generation", trigger: "scheduled", status: "succeeded", agent: WRITER, model: "workhorse", tier: "workhorse", estimateUsd: 1.8, startedAt: lagos("2026-09-24 09:00"), durationSec: 520, postId: "np-unfair-dismissal", output: "Draft v1 · 1,480 words · 1 slot", budget: "text" }),
			run({ id: "r-n-03", kind: "technical-monitor", trigger: "scheduled", status: "succeeded", agent: "Technical monitor agent", model: "fast", tier: "fast", estimateUsd: 0.9, startedAt: lagos("2026-09-25 07:00"), durationSec: 380, output: "Health 88 · Search Console not connected, indexing unchecked", budget: "text" }),
		],
		schedules: schedules({ "keyword-swarm": lagos("2026-09-28 09:00"), "technical-monitor": lagos("2026-10-02 07:00"), "biweekly-report": lagos("2026-10-09 07:30") }, ["link-prospecting", "content-refresh"]),
		ledger: [{ id: "l-n-sc", title: "Reconnect Search Console", owner: KO, createdAt: lagos("2026-09-16 10:00"), ageDays: 9, downstream: "trajectory and KAS show a data gap until connected" }],
		trajectory: [
			["W32", 410, 9100, 400],
			["W33", 432, 9480, 425],
			["W34", 455, 9900, 450],
			["W35", null, null, 480],
			["W36", 498, 10800, 510],
			["W37", 520, 11200, 540],
			["W38", 541, 11650, 570],
			["W39", null, null, 600],
		].map(([week, sessions, impressions, projected]) => ({ week: week as string, sessions: sessions as number | null, impressions: impressions as number | null, projected: projected as number })),
		planStatus: [
			{ id: "cadence", label: "Cadence", value: "1 / 2 wk", light: "amber", detail: "1 of 2 posts reached review this week" },
			{ id: "pillar-coverage", label: "Pillar coverage", value: "No data", light: "amber", detail: "Search Console not connected · score can't be sourced" },
			{ id: "technical-health", label: "Technical health", value: "88", light: "amber", detail: "Indexing unchecked without Search Console" },
			{ id: "human-execution", label: "Human items executed", value: "40%", light: "red", detail: "2 of 5 human-owned items done on time" },
		],
		reports: [],
		kasSnapshots: [],
		audit: [
			{ id: "a-n-01", at: lagos("2026-09-24 16:30"), actor: `Keyword swarm agent`, action: "run refused over cap", target: "Keyword swarm", detail: "Text $96.50 / $100.00 · est. $4.20" },
			{ id: "a-n-02", at: lagos("2026-09-16 10:00"), actor: "System", action: "Search Console disconnected", target: `${NW} Legal`, detail: "OAuth grant revoked" },
		],
		notifications: [
			{ id: "n-n-01", at: lagos("2026-09-24 16:30"), tone: "block", title: "Run refused: over text cap", body: "Keyword swarm est. $4.20 would exceed the $100 monthly cap.", href: "/runs", read: false },
			{ id: "n-n-02", at: lagos("2026-09-16 10:00"), tone: "human", title: "Search Console not connected", body: "Trajectory and KAS show a gap until it's reconnected.", href: "/settings", read: false },
		],
		liveBaseline: 3,
		routing: { hero: "openai", lifestyle: "openai", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
		modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", "pillar-pages": "strongest" },
		brandPack: {
			voice: "Precise, calm, never alarmist. UK English. No outcome guarantees.",
			palette: ["#0B1F3A", "#F7F7F2"],
			styleKeywords: ["Brand: navy, paper white", "Quiet, documentary"],
			disclaimers: { legal: "This article is general information, not legal advice. Speak to a Northwind solicitor about your situation." },
		},
	};
}

export function createSeed(): ICmsState {
	return assembleSeed({ lumen: lumenData(), northwind: northwindData() });
}

/** Posts per state for a site, with the live baseline folded in. */
export function seedCounts(data: ISiteData): Record<TPostState, number> {
	const out = { idea: 0, briefed: 0, drafting: 0, "needs-assets": 0, "in-review": 0, "mr-open": 0, live: data.liveBaseline, decaying: 0 } as Record<TPostState, number>;
	for (const p of data.posts) out[p.state]++;
	return out;
}
