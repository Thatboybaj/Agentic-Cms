// SEO module view-model: pure derivations over the store (no copies of domain data).
import { computeKas, ctr, fmtDate, INTENT_VALUE, kasRawWeight, postKas, postUrl, rankingKeywords, round1 } from "@/lib/logic";
import { isoWeek } from "@/lib/clock";
import type { IKasSnapshot, IKeyword, IMergeRequest, IPost, ISiteData, IWeekPoint } from "@/lib/types";

export type TRange = "8w" | "quarter" | "launch";
export type TMetric = "sessions" | "impressions";

export const RANGE_OPTIONS: { value: TRange; label: string }[] = [
	{ value: "8w", label: "8 weeks" },
	{ value: "quarter", label: "Quarter" },
	{ value: "launch", label: "Since launch" },
];

const RANGE_WEEKS: Record<TRange, number> = { "8w": 8, quarter: 13, launch: Number.POSITIVE_INFINITY };

/** Stored weeks for a range. We never pad a range with invented weeks; `short` says how many are missing. */
export function pointsFor(points: IWeekPoint[], range: TRange): { points: IWeekPoint[]; wanted: number; short: boolean } {
	const wanted = RANGE_WEEKS[range];
	const slice = Number.isFinite(wanted) ? points.slice(-wanted) : points;
	return { points: slice, wanted, short: Number.isFinite(wanted) && slice.length < wanted };
}

/** Headline gap on the last complete week (E2: a missing latest week is skipped and named, never zero). */
export function headlineGap(points: IWeekPoint[]) {
	let idx = -1;
	for (let i = points.length - 1; i >= 0; i--)
		if (points[i].sessions !== null) {
			idx = i;
			break;
		}
	if (idx < 0) return null;
	const p = points[idx];
	if (p.projected <= 0 || p.sessions === null) return null;
	const skipped = points.slice(idx + 1).map((x) => x.week);
	return { pct: round1(((p.sessions - p.projected) / p.projected) * 100), actual: p.sessions, projected: p.projected, week: p.week, skipped };
}

import { mrRef } from "@/lib/logic";
export { mrRef };

/** Snapshots newest first. */
export const snapshotsOf = (data: ISiteData) => [...data.kasSnapshots].sort((a, b) => +new Date(b.at) - +new Date(a.at));

export function snapshotLabel(s: IKasSnapshot, data: ISiteData): string {
	const mr = s.mrId ? data.mergeRequests.find((m) => m.id === s.mrId) : undefined;
	if (s.trigger === "post-merge") return `After ${mr ? `${mrRef(mr)} ` : ""}merged · ${fmtDate(s.at)}`;
	if (s.trigger === "weekly") return `Weekly · ${fmtDate(s.at)}`;
	return `Manual · ${fmtDate(s.at)}`;
}

/**
 * KAS table rows for a snapshot. "latest" = live keyword scores. A stored snapshot shows its own shares,
 * Δ against the snapshot before it, and the position move between the two (arrows derive from positionTrend).
 */
export function kasRows(data: ISiteData, snapshotId: string): IKeyword[] {
	if (snapshotId === "latest") return rankingKeywords(data.keywords);
	const list = snapshotsOf(data);
	const i = list.findIndex((s) => s.id === snapshotId);
	if (i < 0) return rankingKeywords(data.keywords);
	const snap = list[i];
	const prev = list[i + 1];
	const prevBy = new Map(prev?.shares.map((s) => [s.keywordId, s]) ?? []);
	return snap.shares
		.filter((s) => s.position !== null && s.share > 0)
		.map((s) => {
			const k = data.keywords.find((x) => x.id === s.keywordId);
			if (!k) return null;
			const before = prevBy.get(s.keywordId);
			return {
				...k,
				kasShare: s.share,
				kasDelta: before ? round1(s.share - before.share) : 0,
				position: s.position,
				positionTrend: before?.position != null && s.position != null ? [before.position, s.position] : [s.position as number],
			} satisfies IKeyword;
		})
		.filter((k): k is IKeyword => !!k)
		.sort((a, b) => b.kasShare - a.kasShare);
}

/** Raw weight breakdown for one keyword, with the actual numbers from logic.ts. */
export function weightBreakdown(k: IKeyword, data: ISiteData) {
	const curve = data.ctrCurve;
	const c = ctr(k.position, curve);
	const v = INTENT_VALUE[k.intent];
	const raw = kasRawWeight(k, curve);
	const total = computeKas(data.keywords, curve).reduce((s, r) => s + r.raw, 0);
	return { impressions: k.impressions, c, v, raw, total, share: total > 0 ? (raw / total) * 100 : 0, curve: curve ? "client" : "modeled" };
}

/** Before/after the most recent post-merge recalculation for one keyword ("prove a post did something"). */
export function lastMergeEffect(k: IKeyword, data: ISiteData) {
	const list = snapshotsOf(data);
	const i = list.findIndex((s) => s.trigger === "post-merge");
	if (i < 0) return null;
	const after = list[i];
	const before = list[i + 1];
	const mr = after.mrId ? data.mergeRequests.find((m) => m.id === after.mrId) : undefined;
	const post = after.postId ? data.posts.find((p) => p.id === after.postId) : undefined;
	const a = after.shares.find((s) => s.keywordId === k.id);
	const b = before?.shares.find((s) => s.keywordId === k.id);
	return { after, before, mr, post, a, b, shipped: !!post && post.keywordId === k.id };
}

/** Per-snapshot history of one keyword (newest first). */
export function keywordHistory(k: IKeyword, data: ISiteData) {
	const list = snapshotsOf(data);
	return list.map((s, i) => {
		const cur = s.shares.find((x) => x.keywordId === k.id);
		const prev = list[i + 1]?.shares.find((x) => x.keywordId === k.id);
		return { snap: s, share: cur?.share ?? null, position: cur?.position ?? null, delta: cur && prev ? round1(cur.share - prev.share) : null };
	});
}

export interface IPerfRow {
	id: string;
	post: IPost;
	keyword: IKeyword | undefined;
	position: number | null;
	trend: number[];
	impressions: number;
	clicks: number; // modeled: impressions × C(p)
	kas: number;
	page2: boolean;
}

export const isPage2 = (position: number | null) => position !== null && position >= 11 && position <= 20;

/** Every live post the CMS shipped, with the keyword it ranks for. */
export function performanceRows(data: ISiteData): IPerfRow[] {
	return data.posts
		.filter((p) => p.state === "live" || p.state === "decaying")
		.map((post) => {
			const url = postUrl(post);
			const keyword = data.keywords.find((k) => k.id === post.keywordId) ?? data.keywords.find((k) => k.rankingUrl === url);
			const ranks = keyword?.rankingUrl === url && keyword.position !== null;
			const position = ranks ? keyword.position : null;
			const impressions = ranks ? keyword.impressions : 0;
			return {
				id: post.id,
				post,
				keyword,
				position,
				trend: ranks ? keyword.positionTrend : [],
				impressions,
				clicks: Math.round(impressions * ctr(position, data.ctrCurve)),
				kas: postKas(post, data.keywords),
				page2: isPage2(position),
			};
		});
}

/** ISO week label ("W37") of an instant. */
export const weekOf = (iso: string) => `W${isoWeek(iso)}`;

/** Trajectory frozen at an edition's publish week (stored weekly points only; nothing back-filled). */
export function frozenPoints(points: IWeekPoint[], publishedAt: string): IWeekPoint[] {
	const wk = isoWeek(publishedAt);
	return points.filter((p) => Number(p.week.slice(1)) <= wk);
}
