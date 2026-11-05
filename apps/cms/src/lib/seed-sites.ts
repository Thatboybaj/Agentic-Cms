// Seed for the Grandeur workspace: people, per-site memberships, presence, and six lighter tenants alongside
// Lumen Dental (full data) and Northwind Legal. Every Lumen/Northwind fixture id is unchanged (seed.ts).
import { lagos } from "./clock";
import { STATE_OWNER } from "./logic";
import { B, KO, LUMEN_ID, TENANT_PALETTES, NORTHWIND_ID, STATE_VERSION, TB, WRITER, candidates, gate12, idea, kw, mrDescription, post, run, schedules, slot, standardMappings, version, withPillarShares, type IRank } from "./seed";
import type { IAuditEvent, ICmsState, IFactMarker, IImageSlot, IKeyword, ILedgerItem, IMembership, IMergeRequest, INotification, IPost, IPostBlock, IPresence, ISite, ISiteData, IUser, TIntent, TRole, TWorkspaceRole } from "./types";

const ZM = "Zainab M.";
const DC = "David C.";
const AE = "Amaka E.";
const AUTOPOST = "CMS agent (autopost)";

// ─── Lighter tenants ─────────────────────────────────────────────────────────

type TLightState = "idea" | "briefed" | "needs-assets" | "in-review" | "mr-open" | "live" | "decaying";

interface ILightPost {
	id: string;
	title: string;
	kw: string;
	pillar: string;
	intent: TIntent;
	state: TLightState;
	type?: IPost["contentType"];
	week?: number;
	days?: number;
	assignee?: string;
	/** Hero slot status for drafted posts (default selected). */
	hero?: "selected" | "human-only" | "candidates";
	/** Autopost hold reason (in-review only) → ledger item kind "autopost-hold". */
	held?: string;
	/** Unsourced claim left as an open fact marker. */
	openFact?: string;
	mr?: { number: number; ci: IMergeRequest["ci"]; status?: IMergeRequest["status"]; detail?: string; at: string };
}

type TLight = "green" | "amber" | "red";

interface ILightSpec {
	site: ISite;
	pillars: [string, string, number, number][];
	keywords: IKeyword[];
	posts: ILightPost[];
	/** [sessions W32, weekly growth, projected W32, projected growth]; null = no Search Console data yet. */
	trajectory: [number, number, number, number] | null;
	liveBaseline: number;
	brandPack: ISiteData["brandPack"];
	regulated?: "health" | "finance" | "legal";
	specialist: string;
	developer: string;
	ledger?: ILedgerItem[];
	audit?: IAuditEvent[];
	notifications?: INotification[];
	routing?: Partial<ISiteData["routing"]>;
	plan: [ISiteData["planStatus"][number]["id"], TLight, string][];
}

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const PLAN_LABEL = { cadence: "Cadence", "pillar-coverage": "Pillar coverage", "technical-health": "Technical health", "human-execution": "Human items executed" } as const;

function lightBody(prefix: string, keyword: string, siteName: string, h2s: string[], fact?: string): IPostBlock[] {
	const blocks: IPostBlock[] = [
		B(`${prefix}-b1`, "p", `${keyword[0].toUpperCase()}${keyword.slice(1)}: a plain answer from the team at ${siteName}, with what we see every week and what it costs.`),
		B(`${prefix}-img`, "image", `s-${prefix}-hero`),
	];
	h2s.forEach((h, i) => {
		blocks.push(B(`${prefix}-h${i + 1}`, "h2", h));
		const text = `${h}: what it means for you, the trade-offs, and the questions worth asking before you decide.`;
		blocks.push(i === 0 && fact ? B(`${prefix}-p${i + 1}`, "p", `${text} ${fact} see a difference within a month.`, [`f-${prefix}`]) : B(`${prefix}-p${i + 1}`, "p", text));
	});
	return blocks;
}

function lightData(spec: ILightSpec): ISiteData {
	const { site } = spec;
	const posts: IPost[] = [];
	const slots: IImageSlot[] = [];
	const mergeRequests: IMergeRequest[] = [];
	const ledger: ILedgerItem[] = [...(spec.ledger ?? [])];
	const term = (id: string) => spec.keywords.find((k) => k.id === id)?.term ?? id;
	const hue = site.accent ?? 200;
	for (const lp of spec.posts) {
		const extra: Partial<IPost> = { ...(lp.assignee ? { assigneeId: lp.assignee } : {}), ...(spec.regulated ? { regulated: spec.regulated } : {}) };
		if (lp.state === "idea") {
			posts.push(idea(lp.id, lp.title, lp.kw, lp.pillar, lp.intent, lp.type ?? "guide", "keyword-swarm", lp.week ?? 40, { ...extra, daysInState: lp.days ?? 2 }));
			continue;
		}
		const slug = slugify(lp.title.split(":")[0]);
		if (lp.state === "briefed") {
			posts.push(post({ id: lp.id, title: lp.title, slug, keywordId: lp.kw, pillarId: lp.pillar, intent: lp.intent, state: "briefed", week: lp.week ?? 40, daysInState: lp.days ?? 1, contentType: lp.type ?? "guide", ideaApproval: { status: "approved", by: spec.specialist, at: lagos("2026-09-23 09:00") }, ...extra }));
			continue;
		}
		const prefix = lp.id;
		const h2s = ["The short answer", "What it costs", "How to choose", "Frequently asked questions"];
		const heroStatus = lp.hero ?? "selected";
		const heroId = `s-${prefix}-hero`;
		const human = heroStatus === "human-only";
		slots.push(
			slot({
				id: heroId,
				postId: lp.id,
				name: "Hero",
				type: "hero",
				placement: "Top of post",
				filename: `${slug}-hero.webp`,
				alt: `${term(lp.kw)}, illustrative`,
				prompt: `${term(lp.kw)}, ${spec.brandPack.styleKeywords.join(", ")}, no identifiable real person.`,
				styleKeywords: spec.brandPack.styleKeywords,
				provider: human ? "human" : "open-source",
				model: human ? "—" : "flux-dev",
				status: heroStatus,
				candidates: human ? [] : candidates(heroId, [hue, (hue + 30) % 360, (hue + 60) % 360], heroStatus === "selected" ? 0 : -1),
				...(human ? { humanPinned: true } : { generatedAt: lagos("2026-09-22 09:00") }),
			}),
		);
		const facts: IFactMarker[] = lp.openFact ? [{ id: `f-${prefix}`, claim: lp.openFact, status: "open", note: `The agent found no citable source for "${lp.openFact}".` }] : [];
		const words = 1420 + (lp.id.length % 7) * 30;
		const state = lp.state;
		const live = state === "live" || state === "decaying";
		const disclaimer = spec.regulated ? spec.brandPack.disclaimers[spec.regulated] : undefined;
		const p = post({
			id: lp.id,
			title: lp.title,
			slug,
			keywordId: lp.kw,
			pillarId: lp.pillar,
			intent: lp.intent,
			state,
			owner: STATE_OWNER[state],
			contentType: lp.type ?? "guide",
			week: live ? 33 : 39,
			daysInState: lp.days ?? 1,
			words,
			wordTarget: 1400,
			blocks: [...lightBody(prefix, term(lp.kw), site.name, h2s, lp.openFact), ...(disclaimer ? [B(`${prefix}-disc`, "disclaimer", disclaimer)] : [])],
			gate: gate12({ titleCh: Math.min(58, lp.title.length + 8), density: "1.2% · 8 uses", headings: `H1 · ${h2s.length}×H2`, internal: 2, faq: 2, schema: "Article, FAQPage", images: 1 }),
			facts,
			versions: [version(`v-${prefix}-1`, 1, "agent-generation", WRITER, "2026-09-21 08:00", words, "First draft from brief")],
			slotIds: [heroId],
			ideaApproval: { status: "approved", by: spec.specialist, at: lagos("2026-09-18 09:00") },
			...extra,
		});
		if (lp.mr) {
			const mrId = `mr-${site.id}-${lp.mr.number}`;
			const repo = site.repo;
			const branch = (repo?.branchPattern ?? "content/{slug}").replace("{slug}", slug);
			const status = lp.mr.status ?? (live ? "merged" : "open");
			mergeRequests.push({
				id: mrId,
				number: lp.mr.number,
				host: repo?.host ?? "github",
				branch,
				base: repo?.baseBranch ?? "main",
				status,
				ci: lp.mr.ci,
				previewUrl: `https://${site.domain.split(".")[0]}-git-${branch.replace(/\//g, "-")}.vercel.app/blog/${slug}`,
				files: [
					{ path: `${repo?.contentDir ?? "content/blog"}/${slug}.mdx`, change: `+${Math.round(words / 7.6)}`, kind: "post" },
					{ path: `${repo?.assetDir ?? "public/images/blog"}/ · 1 WebP`, change: "78 KB", kind: "assets" },
					{ path: "public/sitemap.xml", change: "+1", kind: "index" },
				],
				openedAt: lagos(lp.mr.at),
				overrides: [],
				postId: lp.id,
				title: `content: add ${lp.title}`,
				description: mrDescription(term(lp.kw), lp.intent[0].toUpperCase() + lp.intent.slice(1), "12 / 12", 2, "Article, FAQPage"),
				manifestVersion: 1,
				...(lp.mr.ci === "failing" && lp.mr.detail ? { ciDetail: lp.mr.detail } : {}),
				...(status === "conflict" && lp.mr.detail ? { conflictDetail: lp.mr.detail } : {}),
				...(live ? { mergedAt: lagos(lp.mr.at), mergedBy: spec.developer } : {}),
			});
			p.mrId = mrId;
		}
		if (lp.held) ledger.unshift({ id: `l-${prefix}-held`, title: `Autopost held: ${lp.held}`, owner: spec.specialist, createdAt: lagos("2026-09-24 11:00"), ageDays: 1, downstream: "holds 1 post in In review", postId: lp.id, kind: "autopost-hold" });
		if (human) ledger.push({ id: `l-${prefix}-photo`, title: `Hero photo · ${lp.title}`, owner: spec.specialist, createdAt: lagos("2026-09-17 09:00"), ageDays: 8, downstream: "holds 1 post in Needs assets", postId: lp.id, slotId: heroId });
		posts.push(p);
	}
	const keywords = spec.keywords;
	const pillars = withPillarShares(
		spec.pillars.map(([id, name, plannedPosts, livePosts]) => ({ id, name, plannedPosts, livePosts, kasShare: 0, claimedButUnearned: false })),
		keywords,
	);
	const tr = spec.trajectory;
	const trajectory = tr
		? Array.from({ length: 8 }, (_, i) => {
				const sessions = Math.round(tr[0] * (1 + tr[1]) ** i);
				return { week: `W${32 + i}`, sessions, impressions: sessions * 17, projected: Math.round(tr[2] * (1 + tr[3]) ** i) };
			})
		: [];
	const ideas = spec.posts.filter((x) => x.state === "idea").length;
	return {
		pillars,
		keywords,
		posts,
		slots,
		manifests:
			site.repo && site.status !== "onboarding"
				? [{ id: `tm-${site.id}-1`, version: 1, source: `${site.id}-blog-post.html · 1 file`, kind: "html", output: "mdx", status: "confirmed", confirmedBy: spec.developer, confirmedAt: lagos("2026-08-12 11:00"), mappings: standardMappings(`tm-${site.id}`, true) }]
				: [],
		mergeRequests,
		runs: [
			run({ id: `r-${site.id}-01`, kind: "technical-monitor", trigger: "scheduled", status: "succeeded", agent: "Technical monitor agent", model: "fast", tier: "fast", estimateUsd: 0.9, startedAt: lagos("2026-09-25 07:00"), durationSec: 340, output: site.searchConsole === "connected" ? "Health 94 · 1 issue queued" : "Health 86 · Search Console not connected, indexing unchecked", budget: "text" }),
			run({ id: `r-${site.id}-02`, kind: "keyword-swarm", trigger: "scheduled", status: "succeeded", agent: "Keyword swarm agent", model: "fast", tier: "fast", estimateUsd: 4.2, startedAt: lagos("2026-09-21 09:00"), durationSec: 1180, output: `${ideas + 6} ideas · 6 deduplicated · ${ideas} new in Idea`, budget: "text" }),
		],
		schedules: schedules({ "keyword-swarm": lagos("2026-09-28 09:00"), "technical-monitor": lagos("2026-10-02 07:00"), "biweekly-report": lagos("2026-10-09 07:30") }, site.rankSource ? [] : ["link-prospecting"]),
		ledger,
		trajectory,
		planStatus: spec.plan.map(([id, light, value]) => ({ id, label: PLAN_LABEL[id], value, light, detail: value })),
		reports: [],
		kasSnapshots: [],
		audit: spec.audit ?? [],
		notifications: spec.notifications ?? [],
		liveBaseline: spec.liveBaseline,
		routing: { hero: "open-source", lifestyle: "open-source", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human", ...spec.routing },
		modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", "pillar-pages": "strongest" },
		brandPack: spec.brandPack,
	};
}

const W = (wall: string) => lagos(wall);
const R = (share: number, trend: number[], delta: number, url: string, decaying = false): IRank => ({ share, trend, delta, url, pages: 1, decaying });
const gh = (repo: string, host: "github" | "gitlab" = "github"): NonNullable<ISite["repo"]> => ({ host, repo, baseBranch: "main", contentDir: "content/blog", assetDir: "public/images/blog", branchPattern: "content/{slug}", installedAs: host === "github" ? "Grandeur CMS (GitHub App)" : "Grandeur CMS (GitLab integration)" });
const site = (s: Omit<ISite, "publishing"> & { publishing?: ISite["publishing"] }): ISite => ({ publishing: { autopost: true, autoMergeOnGreenCi: true }, ...s });

function lightSpecs(): ILightSpec[] {
	return [
		{
			site: site({ id: "harbor", slug: "harbor", name: "Harbor Vets", domain: "harborvets.co.uk", industry: "Veterinary clinics", icon: "paw-print", status: "active", createdAt: W("2026-04-20 09:00"), accent: 200, ageMonths: 5, cadenceTarget: 3, repo: gh("harbor-vets/harborvets.co.uk"), searchConsole: "connected", rankSource: "semrush", budgets: { textUsd: 48.2, textCapUsd: 120, imageUsd: 31, imageCapUsd: 80 }, publishing: { autopost: true, autoMergeOnGreenCi: false } }),
			pillars: [["hv-health", "Pet health", 8, 6], ["hv-dental", "Pet dental", 4, 2], ["hv-nutrition", "Nutrition", 5, 3]],
			keywords: [
				kw("hk-vaccines", "puppy vaccination schedule uk", "hv-health", "informational", 29, "Semrush", R(22.4, [9, 8, 8, 7, 6, 6, 5, 5], 1.8, "/blog/puppy-vaccination-schedule")),
				kw("hk-neutering", "cat neutering cost", "hv-health", "commercial", 33, "Semrush", R(16.1, [14, 13, 12, 12, 11, 10, 10, 9], 0.9, "/blog/cat-neutering-cost")),
				kw("hk-dental", "dog teeth cleaning cost", "hv-dental", "commercial", 27, "Semrush", R(9.7, [18, 17, 15, 14, 14, 13, 12, 12], 0.6, "/blog/dog-teeth-cleaning-cost")),
				kw("hk-grain-free", "is grain free food bad for dogs", "hv-nutrition", "informational", 41, "Semrush"),
				kw("hk-senior", "senior dog health checks", "hv-health", "informational", 22, "Semrush"),
				kw("hk-insurance", "pet insurance vs care plan", "hv-health", "commercial", 36, "Semrush"),
			],
			posts: [
				{ id: "hp-grain-free", title: "is grain-free food bad for dogs?", kw: "hk-grain-free", pillar: "hv-nutrition", intent: "informational", state: "idea", type: "faq", week: 40 },
				{ id: "hp-insurance", title: "pet insurance vs a care plan", kw: "hk-insurance", pillar: "hv-health", intent: "commercial", state: "idea", type: "comparison", week: 41 },
				{ id: "hp-senior", title: "senior dog health checks: what we look for", kw: "hk-senior", pillar: "hv-health", intent: "informational", state: "briefed", week: 40, assignee: "m-tb" },
				{ id: "hp-dental-signs", title: "dog dental disease: the early signs", kw: "hk-dental", pillar: "hv-dental", intent: "informational", state: "in-review", days: 1, assignee: "m-tb", held: "Unsourced claim the agent couldn't rewrite safely", openFact: "8 in 10 dogs over three" },
				{ id: "hp-neutering", title: "cat neutering cost and recovery", kw: "hk-neutering", pillar: "hv-health", intent: "commercial", state: "mr-open", days: 1, mr: { number: 18, ci: "passing", at: "2026-09-24 16:10" } },
				{ id: "hp-vaccines", title: "puppy vaccination schedule (uk)", kw: "hk-vaccines", pillar: "hv-health", intent: "informational", state: "live", days: 40, mr: { number: 12, ci: "passing", at: "2026-08-14 10:00" } },
			],
			trajectory: [1180, 0.035, 1200, 0.04],
			liveBaseline: 11,
			regulated: "health",
			specialist: TB,
			developer: KO,
			brandPack: { voice: "Kind, practical, never preachy. UK English. Prices with the year.", palette: TENANT_PALETTES.harbor, styleKeywords: ["Brand: harbour blue, white", "Warm clinic light"], disclaimers: { health: "This article is general information, not veterinary advice. Book a Harbor Vets appointment for your pet." } },
			ledger: [{ id: "l-hv-vaccine-signoff", title: "Vet sign-off on the vaccine schedule table", owner: TB, createdAt: W("2026-09-15 09:00"), ageDays: 10, downstream: "the live vaccine guide keeps last year's dates" }],
			audit: [
				{ id: "a-hv-01", at: W("2026-09-25 09:12"), actor: AUTOPOST, action: "held autopost", target: "dog dental disease: the early signs", detail: "Unsourced claim the agent couldn't rewrite safely" },
				{ id: "a-hv-02", at: W("2026-09-24 16:10"), actor: AUTOPOST, action: "opened MR", target: "#18 content/cat-neutering-cost-and-recovery", detail: "GitHub · main" },
				{ id: "a-hv-03", at: W("2026-09-23 10:02"), actor: TB, action: "approved idea", target: "senior dog health checks: what we look for" },
			],
			notifications: [{ id: "n-hv-01", at: W("2026-09-25 09:12"), tone: "human", title: "Autopost held a post", body: "dog dental disease: the early signs · unsourced claim.", href: "/approvals?post=hp-dental-signs", read: false }],
			plan: [["cadence", "green", "3 / 3 wk"], ["pillar-coverage", "amber", "2 / 3"], ["technical-health", "green", "94"], ["human-execution", "amber", "70%"]],
		},
		{
			site: site({ id: "kora", slug: "kora", name: "Kora Fintech", domain: "korafintech.com", industry: "SME payments", icon: "bank", status: "active", createdAt: W("2026-05-11 09:00"), accent: 265, ageMonths: 4, cadenceTarget: 3, repo: gh("kora/marketing-site", "gitlab"), searchConsole: "connected", rankSource: "ahrefs", budgets: { textUsd: 88, textCapUsd: 100, imageUsd: 12, imageCapUsd: 40 } }),
			pillars: [["kf-payments", "Getting paid", 6, 4], ["kf-fx", "FX and cross-border", 4, 1], ["kf-compliance", "Compliance", 3, 1]],
			keywords: [
				kw("kk-invoice", "how to invoice international clients", "kf-payments", "informational", 31, "Ahrefs", R(19.8, [11, 10, 9, 9, 8, 8, 7, 7], 1.2, "/blog/invoice-international-clients")),
				kw("kk-fx-fees", "hidden fx fees business", "kf-fx", "commercial", 44, "Ahrefs", R(12.5, [21, 20, 18, 17, 16, 15, 15, 14], 0.8, "/blog/hidden-fx-fees")),
				kw("kk-kyb", "kyb verification documents", "kf-compliance", "informational", 26, "Ahrefs", R(6.1, [9, 9, 10, 11, 12, 13, 14, 15], -0.9, "/blog/kyb-documents", true)),
				kw("kk-payment-links", "payment links for small business", "kf-payments", "commercial", 38, "Ahrefs"),
				kw("kk-dom-account", "domiciliary account for freelancers", "kf-fx", "commercial", 35, "Ahrefs"),
				kw("kk-chargebacks", "how to handle chargebacks", "kf-payments", "informational", 29, "Ahrefs"),
			],
			posts: [
				{ id: "kp-payment-links", title: "payment links for small business: a starter guide", kw: "kk-payment-links", pillar: "kf-payments", intent: "commercial", state: "idea", week: 40 },
				{ id: "kp-dom-account", title: "domiciliary accounts for freelancers", kw: "kk-dom-account", pillar: "kf-fx", intent: "commercial", state: "idea", week: 40 },
				{ id: "kp-chargebacks", title: "how to handle chargebacks", kw: "kk-chargebacks", pillar: "kf-payments", intent: "informational", state: "idea", type: "how-to", week: 41 },
				{ id: "kp-fx-fees", title: "hidden fx fees: what your bank doesn't show", kw: "kk-fx-fees", pillar: "kf-fx", intent: "commercial", state: "in-review", days: 2, assignee: "u-zm", held: "Over the text cap" },
				{ id: "kp-kyb", title: "kyb verification: the documents you need", kw: "kk-kyb", pillar: "kf-compliance", intent: "informational", state: "mr-open", days: 3, mr: { number: 31, ci: "failing", at: "2026-09-22 14:30", detail: "lint · broken internal link /pricing/business in kyb-verification.mdx" } },
				{ id: "kp-invoice", title: "how to invoice international clients", kw: "kk-invoice", pillar: "kf-payments", intent: "informational", state: "live", days: 52, mr: { number: 22, ci: "passing", at: "2026-08-03 11:00" } },
			],
			trajectory: [2900, 0.02, 3000, 0.035],
			liveBaseline: 8,
			regulated: "finance",
			specialist: ZM,
			developer: KO,
			brandPack: { voice: "Confident, plain numbers, no hype. Never promise returns.", palette: TENANT_PALETTES.kora, styleKeywords: ["Brand: deep violet, white", "Clean product UI, no faces"], disclaimers: { finance: "This article is general information, not financial advice. Fees and limits change; check the current pricing page." } },
			audit: [
				{ id: "a-kf-01", at: W("2026-09-25 08:40"), actor: AUTOPOST, action: "held autopost", target: "hidden fx fees: what your bank doesn't show", detail: "Over the text cap" },
				{ id: "a-kf-02", at: W("2026-09-22 14:52"), actor: AUTOPOST, action: "stopped at red CI", target: "!31 content/kyb-verification", detail: "The MR stays open until the build is fixed" },
			],
			notifications: [{ id: "n-kf-01", at: W("2026-09-22 14:52"), tone: "block", title: "CI failing on !31", body: "lint · broken internal link /pricing/business", href: "/merge-requests", read: false }],
			plan: [["cadence", "amber", "2 / 3 wk"], ["pillar-coverage", "amber", "2 / 3"], ["technical-health", "green", "92"], ["human-execution", "green", "85%"]],
		},
		{
			site: site({ id: "atlas", slug: "atlas", name: "Atlas Physio", domain: "atlasphysio.ng", industry: "Physiotherapy", icon: "person-simple-walk", status: "onboarding", createdAt: W("2026-09-19 10:00"), accent: 140, ageMonths: 0, cadenceTarget: 2, repo: null, searchConsole: "missing", rankSource: null, budgets: { textUsd: 4.2, textCapUsd: 80, imageUsd: 0, imageCapUsd: 40 } }),
			pillars: [["ap-back", "Back and neck", 5, 0], ["ap-sports", "Sports injuries", 4, 0], ["ap-rehab", "Post-surgery rehab", 3, 0]],
			keywords: [
				kw("ak-lower-back", "lower back pain exercises", "ap-back", "informational", 46, "SERP"),
				kw("ak-acl", "acl recovery timeline", "ap-sports", "informational", 34, "SERP"),
				kw("ak-cost", "physiotherapy cost lagos", "ap-back", "commercial", 18, "SERP"),
				kw("ak-knee", "knee replacement rehab", "ap-rehab", "informational", 30, "SERP"),
			],
			posts: [
				{ id: "ap-lower-back", title: "lower back pain: 6 exercises that help", kw: "ak-lower-back", pillar: "ap-back", intent: "informational", state: "idea", type: "listicle", week: 41 },
				{ id: "ap-acl", title: "acl recovery timeline, week by week", kw: "ak-acl", pillar: "ap-sports", intent: "informational", state: "idea", week: 41 },
				{ id: "ap-cost", title: "physiotherapy cost in lagos (2026)", kw: "ak-cost", pillar: "ap-back", intent: "commercial", state: "idea", type: "money-page", week: 42 },
			],
			trajectory: null,
			liveBaseline: 0,
			regulated: "health",
			specialist: ZM,
			developer: KO,
			brandPack: { voice: "Encouraging, specific, clinically careful.", palette: TENANT_PALETTES.atlas, styleKeywords: ["Brand: green, white", "Movement, daylight"], disclaimers: { health: "This article is general information, not medical advice. Book an Atlas Physio assessment before starting a programme." } },
			ledger: [{ id: "l-ap-repo", title: "Connect the website repo", owner: KO, createdAt: W("2026-09-19 10:00"), ageDays: 6, downstream: "nothing can ship until the repo is connected" }],
			audit: [{ id: "a-ap-01", at: W("2026-09-19 10:00"), actor: AE, action: "added site", target: "Atlas Physio", detail: "atlasphysio.ng" }],
			plan: [["cadence", "amber", "0 / 2 wk"], ["pillar-coverage", "amber", "No data"], ["technical-health", "amber", "Not checked"], ["human-execution", "amber", "—"]],
		},
		{
			site: site({ id: "sable", slug: "sable", name: "Sable Coffee", domain: "sablecoffee.co", industry: "Specialty coffee (DTC)", icon: "coffee", status: "active", createdAt: W("2026-03-02 09:00"), accent: 28, ageMonths: 6, cadenceTarget: 2, repo: gh("sable-coffee/shop"), searchConsole: "connected", rankSource: null, budgets: { textUsd: 22.5, textCapUsd: 90, imageUsd: 46, imageCapUsd: 60 }, publishing: { autopost: false, autoMergeOnGreenCi: false } }),
			pillars: [["sc-brewing", "Brewing guides", 6, 5], ["sc-origins", "Origins", 4, 3], ["sc-gear", "Gear", 3, 1]],
			keywords: [
				kw("sk-v60", "v60 recipe", "sc-brewing", "informational", 35, "SERP", R(24.3, [8, 7, 7, 6, 6, 5, 5, 4], 2.2, "/blog/v60-recipe")),
				kw("sk-ethiopia", "ethiopian coffee flavour notes", "sc-origins", "informational", 21, "SERP", R(13.9, [12, 12, 11, 10, 10, 9, 9, 8], 0.7, "/blog/ethiopian-coffee")),
				kw("sk-grinder", "best burr grinder under 200", "sc-gear", "commercial", 47, "SERP"),
				kw("sk-cold-brew", "cold brew ratio", "sc-brewing", "informational", 30, "SERP"),
				kw("sk-decaf", "swiss water decaf", "sc-origins", "informational", 19, "SERP"),
			],
			posts: [
				{ id: "sp-decaf", title: "swiss water decaf, explained", kw: "sk-decaf", pillar: "sc-origins", intent: "informational", state: "idea", week: 40 },
				{ id: "sp-grinder", title: "best burr grinders under £200", kw: "sk-grinder", pillar: "sc-gear", intent: "commercial", state: "idea", type: "listicle", week: 41 },
				{ id: "sp-cold-brew", title: "cold brew ratio: the only guide you need", kw: "sk-cold-brew", pillar: "sc-brewing", intent: "informational", state: "needs-assets", days: 8, hero: "human-only", assignee: "m-tb" },
				{ id: "sp-ethiopia", title: "ethiopian coffee: flavour notes by region", kw: "sk-ethiopia", pillar: "sc-origins", intent: "informational", state: "in-review", days: 1 },
				{ id: "sp-v60", title: "v60 recipe for beginners", kw: "sk-v60", pillar: "sc-brewing", intent: "informational", state: "live", days: 70, mr: { number: 9, ci: "passing", at: "2026-07-16 09:30" } },
			],
			trajectory: [1650, 0.028, 1600, 0.03],
			liveBaseline: 8,
			specialist: TB,
			developer: ZM,
			routing: { hero: "human", photo: "human" },
			brandPack: { voice: "Warm, nerdy in moderation, grams and degrees not cups.", palette: TENANT_PALETTES.sable, styleKeywords: ["Brand: espresso brown, copper", "Hands and cups, real roastery"], disclaimers: {} },
			audit: [
				{ id: "a-sc-01", at: W("2026-09-24 17:05"), actor: WRITER, action: "generated draft", target: "ethiopian coffee: flavour notes by region", detail: "1,450 words · 1 image slot" },
				{ id: "a-sc-02", at: W("2026-09-17 09:00"), actor: TB, action: "marked human-only", target: "Hero", detail: "cold brew ratio: the only guide you need" },
			],
			notifications: [{ id: "n-sc-01", at: W("2026-09-24 17:05"), tone: "human", title: "Approval requested", body: "ethiopian coffee: flavour notes by region is ready for review.", href: "/approvals?post=sp-ethiopia", read: false }],
			plan: [["cadence", "green", "2 / 2 wk"], ["pillar-coverage", "green", "3 / 3"], ["technical-health", "green", "97"], ["human-execution", "amber", "60%"]],
		},
		{
			site: site({ id: "meridian", slug: "meridian", name: "Meridian Realty", domain: "meridianrealty.ng", industry: "Real estate", icon: "house-line", status: "paused", createdAt: W("2026-02-09 09:00"), accent: 45, ageMonths: 7, cadenceTarget: 2, repo: gh("meridian/meridianrealty.ng"), searchConsole: "expired", rankSource: "semrush", budgets: { textUsd: 12.4, textCapUsd: 60, imageUsd: 3, imageCapUsd: 30 }, publishing: { autopost: true, autoMergeOnGreenCi: false } }),
			pillars: [["mr-buying", "Buying", 5, 4], ["mr-renting", "Renting", 4, 3], ["mr-areas", "Area guides", 6, 4]],
			keywords: [
				kw("mk-lekki", "living in lekki phase 1", "mr-areas", "informational", 32, "Semrush", R(21.0, [6, 6, 6, 7, 7, 7, 8, 8], -0.4, "/blog/living-in-lekki-phase-1", true)),
				kw("mk-cofo", "what is a c of o", "mr-buying", "informational", 25, "Semrush", R(15.3, [10, 10, 9, 9, 9, 8, 8, 8], 0.3, "/blog/what-is-a-c-of-o")),
				kw("mk-rent", "how much is rent in yaba", "mr-renting", "commercial", 28, "Semrush"),
				kw("mk-agent-fee", "agency fee lagos rent", "mr-renting", "informational", 22, "Semrush"),
			],
			posts: [
				{ id: "mp-agent-fee", title: "agency and legal fees on a lagos rental", kw: "mk-agent-fee", pillar: "mr-renting", intent: "informational", state: "idea", week: 41 },
				{ id: "mp-rent-yaba", title: "rent in yaba: 2026 prices by street", kw: "mk-rent", pillar: "mr-renting", intent: "commercial", state: "briefed", week: 40, type: "money-page" },
				{ id: "mp-cofo", title: "what is a c of o, and do you need one?", kw: "mk-cofo", pillar: "mr-buying", intent: "informational", state: "mr-open", days: 6, mr: { number: 27, ci: "pending", status: "conflict", at: "2026-09-19 12:00", detail: "Base branch moved: content/blog/index.json changed upstream" } },
				{ id: "mp-lekki", title: "living in lekki phase 1: an honest guide", kw: "mk-lekki", pillar: "mr-areas", intent: "informational", state: "decaying", days: 21, mr: { number: 14, ci: "passing", at: "2026-06-30 10:00" } },
			],
			trajectory: [2100, -0.004, 2150, 0.025],
			liveBaseline: 10,
			specialist: ZM,
			developer: KO,
			brandPack: { voice: "Straight-talking, local, numbers first.", palette: TENANT_PALETTES.meridian, styleKeywords: ["Brand: gold, cream", "Streets and interiors, no faces"], disclaimers: {} },
			ledger: [{ id: "l-mr-sc", title: "Renew the Search Console token", owner: KO, createdAt: W("2026-09-08 09:00"), ageDays: 17, downstream: "trajectory shows a data gap until renewed" }],
			audit: [{ id: "a-mr-01", at: W("2026-09-20 15:00"), actor: AE, action: "paused site", target: "Meridian Realty", detail: "Client contract renewal pending · agents stopped" }],
			notifications: [{ id: "n-mr-01", at: W("2026-09-20 15:00"), tone: "neutral", title: "Site paused", body: "Agents and schedules are stopped until an admin resumes the site.", href: "/settings", read: true }],
			plan: [["cadence", "red", "0 / 2 wk"], ["pillar-coverage", "green", "3 / 3"], ["technical-health", "amber", "Token expired"], ["human-execution", "red", "35%"]],
		},
		{
			site: site({ id: "juniper", slug: "juniper", name: "Juniper Skincare", domain: "juniperskin.co", industry: "Skincare (DTC)", icon: "drop", status: "onboarding", createdAt: W("2026-09-08 09:00"), accent: 330, ageMonths: 1, cadenceTarget: 2, repo: gh("juniper-skin/storefront"), searchConsole: "connected", rankSource: null, budgets: { textUsd: 9.6, textCapUsd: 100, imageUsd: 5.4, imageCapUsd: 60 }, publishing: { autopost: false, autoMergeOnGreenCi: false } }),
			pillars: [["jp-routines", "Routines", 5, 0], ["jp-ingredients", "Ingredients", 6, 0], ["jp-concerns", "Skin concerns", 4, 0]],
			keywords: [
				kw("jk-niacinamide", "niacinamide and vitamin c together", "jp-ingredients", "informational", 39, "SERP"),
				kw("jk-routine", "skincare routine for oily skin", "jp-routines", "informational", 52, "SERP"),
				kw("jk-hyperpig", "hyperpigmentation dark skin treatment", "jp-concerns", "commercial", 37, "SERP"),
				kw("jk-spf", "best spf for dark skin no white cast", "jp-concerns", "commercial", 44, "SERP"),
			],
			posts: [
				{ id: "jp-niacinamide", title: "can you use niacinamide and vitamin c together?", kw: "jk-niacinamide", pillar: "jp-ingredients", intent: "informational", state: "idea", type: "faq", week: 40 },
				{ id: "jp-routine", title: "a simple routine for oily skin", kw: "jk-routine", pillar: "jp-routines", intent: "informational", state: "idea", week: 41 },
				{ id: "jp-spf", title: "spf for dark skin with no white cast", kw: "jk-spf", pillar: "jp-concerns", intent: "commercial", state: "idea", type: "listicle", week: 41 },
				{ id: "jp-hyperpig", title: "hyperpigmentation on dark skin: what works", kw: "jk-hyperpig", pillar: "jp-concerns", intent: "commercial", state: "briefed", week: 40, assignee: "u-zm" },
			],
			trajectory: [380, 0.06, 400, 0.05],
			liveBaseline: 2,
			regulated: "health",
			specialist: ZM,
			developer: DC,
			brandPack: { voice: "Calm, evidence-led, inclusive of every skin tone.", palette: TENANT_PALETTES.juniper, styleKeywords: ["Brand: berry, blush", "Texture close-ups, diverse skin"], disclaimers: { health: "This article is general information, not medical advice. See a dermatologist for persistent skin concerns." } },
			ledger: [{ id: "l-jp-template", title: "Upload the storefront blog template", owner: DC, createdAt: W("2026-09-12 09:00"), ageDays: 13, downstream: "nothing renders until a manifest is confirmed" }],
			audit: [{ id: "a-jp-01", at: W("2026-09-23 11:20"), actor: AE, action: "invited", target: "david.c@fieldwork.dev", detail: "Developer · Juniper Skincare, Sable Coffee" }],
			plan: [["cadence", "amber", "0 / 2 wk"], ["pillar-coverage", "amber", "0 / 3"], ["technical-health", "green", "95"], ["human-execution", "amber", "—"]],
		},
	];
}

// ─── Workspace, people and memberships ───────────────────────────────────────

export const WORKSPACE_ID = "ws-grandeur";
export const USER_IDS = { tolu: "m-tb", kunle: "m-ko", amaka: "m-ae", ada: "m-ao", james: "u-jh", zainab: "u-zm", david: "u-dc" } as const;
export const SEED_SITE_IDS = ["lumen", "northwind", "harbor", "kora", "atlas", "sable", "meridian", "juniper"] as const;

function seedUsers(): IUser[] {
	return [
		{ id: "m-tb", name: TB, initials: "TB", email: "tolu@grandeur.agency", title: "Content specialist", avatarHue: 24, status: "active" },
		{ id: "m-ko", name: KO, initials: "KO", email: "kunle@grandeur.agency", title: "Developer", avatarHue: 210, status: "active" },
		{ id: "m-ae", name: AE, initials: "AE", email: "amaka@grandeur.agency", title: "Agency lead", avatarHue: 320, status: "active" },
		{ id: "m-ao", name: "Dr Ada Okafor", initials: "AO", email: "ada@lumendental.co", title: "Clinical director, Lumen Dental", avatarHue: 160, status: "active" },
		{ id: "u-jh", name: "James Hart", initials: "JH", email: "james@northwindlegal.co.uk", title: "Managing partner, Northwind Legal", avatarHue: 255, status: "active" },
		{ id: "u-zm", name: ZM, initials: "ZM", email: "zainab@grandeur.agency", title: "Content specialist", avatarHue: 40, status: "active" },
		{ id: "u-dc", name: DC, initials: "DC", email: "david.c@fieldwork.dev", title: "Freelance developer", avatarHue: 100, status: "invited", invitedBy: "m-ae", invitedAt: lagos("2026-09-23 11:20") },
	];
}

function seedMemberships(): IMembership[] {
	const m = (userId: string, siteId: string, role: TRole, wall = "2026-06-25 09:00"): IMembership => ({ userId, siteId, role, addedAt: lagos(wall), addedBy: "m-ae" });
	return [
		// Tolu: specialist on 4 sites.
		m("m-tb", LUMEN_ID, "specialist"),
		m("m-tb", NORTHWIND_ID, "specialist", "2026-07-20 09:00"),
		m("m-tb", "harbor", "specialist", "2026-04-20 09:00"),
		m("m-tb", "sable", "specialist", "2026-03-02 09:00"),
		// Kunle: developer on 6 sites.
		m("m-ko", LUMEN_ID, "developer"),
		m("m-ko", NORTHWIND_ID, "developer", "2026-07-20 09:00"),
		m("m-ko", "harbor", "developer", "2026-04-20 09:00"),
		m("m-ko", "kora", "developer", "2026-05-11 09:00"),
		m("m-ko", "atlas", "developer", "2026-09-19 10:00"),
		m("m-ko", "meridian", "developer", "2026-02-09 09:00"),
		// Client stakeholders, each scoped to their own site.
		m("m-ao", LUMEN_ID, "stakeholder"),
		m("u-jh", NORTHWIND_ID, "stakeholder", "2026-07-20 09:00"),
		// Zainab: specialist on 4, developer on Sable (roles are per site).
		m("u-zm", "kora", "specialist", "2026-05-11 09:00"),
		m("u-zm", "atlas", "specialist", "2026-09-19 10:00"),
		m("u-zm", "meridian", "specialist", "2026-02-09 09:00"),
		m("u-zm", "juniper", "specialist", "2026-09-08 09:00"),
		m("u-zm", "sable", "developer", "2026-03-02 09:00"),
		// Invited, not yet accepted.
		m("u-dc", "juniper", "developer", "2026-09-23 11:20"),
		m("u-dc", "sable", "developer", "2026-09-23 11:20"),
	];
}

function seedPresence(): IPresence[] {
	return [
		{ userId: "m-ko", siteId: LUMEN_ID, path: "/s/lumen/merge-requests", at: lagos("2026-09-25 10:40") },
		{ userId: "m-ao", siteId: LUMEN_ID, path: "/s/lumen/approvals", at: lagos("2026-09-25 10:39") },
		{ userId: "m-ae", siteId: LUMEN_ID, path: "/s/lumen/posts/p-veneers", at: lagos("2026-09-25 10:42") },
		{ userId: "u-zm", siteId: "kora", path: "/s/kora/plan", at: lagos("2026-09-25 10:41") },
		{ userId: "u-jh", siteId: NORTHWIND_ID, path: "/s/northwind/posts/np-unfair-dismissal", at: lagos("2026-09-25 10:35") },
	];
}

/** Assembles the v2 seed around the hand-written Lumen and Northwind data. */
export function assembleSeed({ lumen, northwind }: { lumen: ISiteData; northwind: ISiteData }): ICmsState {
	const light = lightSpecs();
	// Amaka has the veneers draft open (soft edit lock demo: Tolu sees "Amaka E. is editing").
	const veneers = lumen.posts.find((p) => p.id === "p-veneers");
	if (veneers) veneers.editingBy = { userId: "m-ae", since: lagos("2026-09-25 10:42") };
	for (const p of lumen.posts) if (p.id === "p-root-canal" || p.id === "p-implant-vs-bridge") p.assigneeId = "m-tb";
	const nud = northwind.posts.find((p) => p.id === "np-unfair-dismissal");
	if (nud) nud.assigneeId = "m-tb";
	const users = seedUsers();
	const workspaceRoles: Record<string, TWorkspaceRole> = Object.fromEntries(users.map((u) => [u.id, u.id === "m-ae" ? "owner" : "member"]));
	return {
		version: STATE_VERSION,
		workspace: { id: WORKSPACE_ID, name: "Grandeur", plan: "agency", seatsUsed: users.filter((u) => u.status !== "suspended").length, seats: 10 },
		users,
		workspaceRoles,
		memberships: seedMemberships(),
		sites: [
			{
				id: LUMEN_ID,
				slug: "lumen",
				name: "Lumen Dental",
				domain: "lumendental.co",
				industry: "Dental clinics",
				icon: "tooth",
				status: "active",
				createdAt: lagos("2026-06-25 09:00"),
				accent: 174,
				ageMonths: 3,
				cadenceTarget: 4,
				repo: { host: "github", repo: "lumen/lumendental.co", baseBranch: "main", contentDir: "content/blog", assetDir: "public/images/blog", branchPattern: "content/{slug}", installedAs: "Grandeur CMS (GitHub App)" },
				searchConsole: "connected",
				rankSource: "ahrefs",
				budgets: { textUsd: 61.4, textCapUsd: 150, imageUsd: 142, imageCapUsd: 200 },
				publishing: { autopost: true, autoMergeOnGreenCi: true },
			},
			{
				id: NORTHWIND_ID,
				slug: "northwind",
				name: "Northwind Legal",
				domain: "northwindlegal.co.uk",
				industry: "Law firm",
				icon: "scales",
				status: "active",
				createdAt: lagos("2026-07-20 09:00"),
				accent: 220,
				ageMonths: 2,
				cadenceTarget: 2,
				repo: null,
				searchConsole: "missing",
				rankSource: null,
				budgets: { textUsd: 96.5, textCapUsd: 100, imageUsd: 4.2, imageCapUsd: 50 },
				publishing: { autopost: false, autoMergeOnGreenCi: false },
			},
			...light.map((l) => l.site),
		],
		data: { [LUMEN_ID]: lumen, [NORTHWIND_ID]: northwind, ...Object.fromEntries(light.map((l) => [l.site.id, lightData(l)])) },
		jobs: [],
		presence: seedPresence(),
		audit: [
			{ id: "a-ws-01", at: lagos("2026-09-23 11:20"), actor: AE, action: "invited", target: "david.c@fieldwork.dev", detail: "Developer · Juniper Skincare, Sable Coffee" },
			{ id: "a-ws-02", at: lagos("2026-09-20 15:00"), actor: AE, action: "paused site", target: "Meridian Realty" },
			{ id: "a-ws-03", at: lagos("2026-09-19 10:00"), actor: AE, action: "added site", target: "Atlas Physio", detail: "atlasphysio.ng" },
		],
		accessRequests: [],
	};
}
