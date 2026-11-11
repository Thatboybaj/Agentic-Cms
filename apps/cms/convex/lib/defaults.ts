// New-site defaults (api-map §1 `sites.add`). Values mirror the prototype's addSite + emptySiteData (src/lib/store.tsx)
// and the schedule rows in src/lib/seed.ts `schedules()`, plus a machine `rule` the scheduler (handoff 07/03) reads.
import type { Doc, Id } from "../_generated/dataModel";
import type { TRunKind } from "../../src/lib/types";

export const DEFAULT_TIMEZONE = "Africa/Lagos";
const LAGOS_OFFSET_MS = 3_600_000; // UTC+1, no DST (src/lib/clock.ts)
const DAY = 86_400_000;

/** "2026-11" in the site's calendar (the spend month). */
export function spendMonth(at: number): string {
	return new Date(at + LAGOS_OFFSET_MS).toISOString().slice(0, 7);
}

/** Slug from a site name, URL-safe, ≤ 63 chars (SLUG_RE in middleware.ts). */
export function slugify(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 63)
		.replace(/-$/, "");
}

export const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Hue 0–359 from a string, same idea as the prototype's hueFor. */
export function hueFor(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return h % 360;
}

export function newSiteFields(input: { workspaceId: Id<"workspaces">; slug: string; name: string; domain: string; industry: string; icon: string }, at: number): Omit<Doc<"sites">, "_id" | "_creationTime"> {
	return {
		workspaceId: input.workspaceId,
		slug: input.slug,
		name: input.name,
		domain: input.domain,
		industry: input.industry,
		icon: input.icon,
		accent: hueFor(input.slug),
		status: "onboarding",
		createdAt: at,
		siteStartedAt: at,
		cadenceTarget: 2,
		searchConsole: "missing",
		rankSource: null,
		budgetCaps: { textCapUsd: 100, imageCapUsd: 50 },
		spend: { month: spendMonth(at), textMicroUsd: 0, imageMicroUsd: 0 },
		publishing: { autopost: true, autoMergeOnGreenCi: true },
		routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
		modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" },
		brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} },
		liveBaseline: 0,
		timezone: DEFAULT_TIMEZONE,
	};
}

type TRule = { kind: TRunKind; label: string; cadence: string; produces: string; rule: string };

/** Same rows as src/lib/seed.ts schedules(); `rule` is what the scheduler parses. */
export const DEFAULT_SCHEDULES: readonly TRule[] = [
	{ kind: "keyword-swarm", label: "Keyword swarm", cadence: "Monday weekly", produces: "New ideas in the plan", rule: "weekly:mon@07:00" },
	{ kind: "post-generation", label: "Post generation", cadence: "Per publish slot", produces: "Drafts in review", rule: "per-publish-slot" },
	{ kind: "technical-monitor", label: "Technical monitor", cadence: "Friday weekly", produces: "Health digest, issues in the queue", rule: "weekly:fri@07:00" },
	{ kind: "qa-sweep", label: "QA sweep", cadence: "Friday light, bi-weekly full", produces: "Scorecard and the human ledger", rule: "weekly:fri@09:00" },
	{ kind: "content-refresh", label: "Content refresh", cadence: "Monthly", produces: "Refresh drafts and a prune list", rule: "monthly:1@07:00" },
	{ kind: "link-prospecting", label: "Link prospecting", cadence: "Monthly", produces: "Prospects and outreach drafts", rule: "monthly:1@09:00" },
	{ kind: "biweekly-report", label: "Bi-weekly report", cadence: "Alternate Fridays", produces: "The visual progress report", rule: "biweekly:fri@16:00" },
	{ kind: "kas-recalc", label: "KAS recalculation", cadence: "24 hours post-merge, then weekly", produces: "Updated attribution", rule: "weekly:mon@06:00" },
	{ kind: "image-generation", label: "Image generation", cadence: "On slot creation", produces: "Candidates for each image slot", rule: "on-slot-creation" },
];

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Next firing (epoch ms) for a rule in Lagos time. Event-driven rules get a placeholder a week out. */
export function nextAtFor(rule: string, from: number): number {
	const m = /^(weekly|biweekly|monthly):([a-z0-9]+)@(\d\d):(\d\d)$/.exec(rule);
	if (!m) return from + 7 * DAY;
	const [, kind, when, hh, mm] = m;
	const local = new Date(from + LAGOS_OFFSET_MS); // fields read as UTC = Lagos wall time
	const at = (y: number, mo: number, d: number) => Date.UTC(y, mo, d, Number(hh), Number(mm)) - LAGOS_OFFSET_MS;
	if (kind === "monthly") {
		const day = Number(when);
		let t = at(local.getUTCFullYear(), local.getUTCMonth(), day);
		if (t <= from) t = at(local.getUTCFullYear(), local.getUTCMonth() + 1, day);
		return t;
	}
	const target = DOW[when] ?? 1;
	const delta = (target - local.getUTCDay() + 7) % 7;
	let t = at(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + delta);
	if (t <= from) t += 7 * DAY;
	return kind === "biweekly" ? t + 7 * DAY : t;
}
