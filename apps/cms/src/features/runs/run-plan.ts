// Pure helpers for /runs: what a manual run would cost and whether it may start. No domain data is kept here.
import { budgetFor, checkCap, estimateRun, fmtTime, fmtUsd, fmtUsdWhole, RUN_META, type ICapCheck, type IEstimate } from "@/lib/logic";
import { now } from "@/lib/clock";
import type { IPost, IRun, ISite, ISiteData, TRunKind } from "@/lib/types";

export interface IRunPlan {
	kind: TRunKind;
	label: string;
	estimate: IEstimate;
	check: ICapCheck;
	spent: number;
	cap: number;
	left: number;
	/** Same kind already in flight (E3). Post and image runs work per item, so they never lock on this. */
	running: IRun | null;
	/** Nothing to run (no briefed post / no waiting slot). */
	blocked: string | null;
	post: IPost | null;
}

const PER_ITEM: TRunKind[] = ["post-generation", "image-generation"];

export function planRun(kind: TRunKind, site: ISite, data: ISiteData): IRunPlan {
	const meta = RUN_META[kind];
	let estimate = estimateRun(kind, site);
	let blocked: string | null = null;
	let post: IPost | null = null;
	if (kind === "post-generation") {
		post = data.posts.filter((p) => p.state === "briefed").sort((a, b) => a.week - b.week)[0] ?? null;
		const strong = !!post && (post.strongModel || post.contentType === "pillar" || post.contentType === "money-page");
		estimate = estimateRun(kind, site, { strongModel: strong });
		if (!post) blocked = "No briefed posts to generate. Promote an idea first.";
	}
	if (kind === "image-generation" && !data.slots.some((s) => s.status === "queued" || s.status === "failed")) blocked = "No image slots are waiting for generation.";
	const { spent, cap } = budgetFor(site, estimate.budget);
	const running = PER_ITEM.includes(kind) ? null : (data.runs.find((r) => r.kind === kind && (r.status === "running" || r.status === "queued")) ?? null);
	return { kind, label: meta.label, estimate, check: checkCap(site, kind, estimate), spent, cap, left: Math.max(0, cap - spent), running, blocked, post };
}

/** 06 spend guardrail copy: what + why + how to clear it. */
export function refusalCopy(plan: IRunPlan, site: ISite): string {
	return `This run would cost about ${fmtUsd(plan.estimate.usd)}. ${site.name} has ${fmtUsd(plan.left)} left of its ${fmtUsdWhole(plan.cap)} ${plan.estimate.budget} cap this month. Ask an admin to raise the cap, or run a smaller batch.`;
}

export const runningCopy = (plan: IRunPlan) => (plan.running ? `${plan.label} is running · started ${fmtTime(plan.running.startedAt)}` : null);

/** "1 Oct" — caps reset on the first of next month (Lagos). */
export function resetDay(at: Date = now()): string {
	const lagos = new Date(at.getTime() + 3600000);
	const next = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth() + 1, 1, 12));
	return `1 ${new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(next)}`;
}

/** "8m 12s" · "48s" · "—" while running. */
export function fmtDuration(sec?: number): string {
	if (sec === undefined) return "—";
	if (sec < 60) return `${sec}s`;
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
}
