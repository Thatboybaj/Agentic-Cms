"use client";
// F8 step 4 — keyword detail: position trend, raw weight formula with real numbers, page attribution,
// and the before/after of the last merge ("prove a post did something").
import { Callout, Chip, KeyValue, Sheet, SourceNote, Sparkline, Timeline, type ITimelineItem } from "@/ds";
import { fmtDate, fmtDateTime, fmtDelta, fmtInt, fmtShare, INTENT_LABEL, postKas, postUrl, round1 } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms } from "@/features/shared/site-source";
import type { IKeyword } from "@/lib/types";
import { clsx } from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { keywordHistory, lastMergeEffect, mrRef, snapshotLabel, weightBreakdown } from "./model";
import { sitePath } from "@/lib/routes";

const deltaCls = (d: number) => (Math.abs(d) < 0.05 ? "text-ink-4" : d > 0 ? "text-pass-ink" : "text-block-ink");

function Block({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2.5 border-t border-line-2 pt-4 first:border-t-0 first:pt-0">
			<div className="flex items-baseline gap-2">
				<h3 className="font-display text-md">{title}</h3>
				{meta && <span className="ms-auto truncate text-xs text-ink-3">{meta}</span>}
			</div>
			{children}
		</section>
	);
}

export function KeywordSheet({ keyword, onClose }: { keyword: IKeyword | undefined; onClose: () => void }) {
	return (
		<Sheet open={!!keyword} onClose={onClose} title={keyword?.term ?? ""} width={480}>
			{keyword && <KeywordDetail k={keyword} />}
		</Sheet>
	);
}

function KeywordDetail({ k }: { k: IKeyword }) {
	const { slug } = useSite();
	const { data } = useSiteCms();
	const w = weightBreakdown(k, data);
	const effect = lastMergeEffect(k, data);
	const history = keywordHistory(k, data);
	const weeks = data.trajectory.slice(-k.positionTrend.length).map((p) => p.week);
	const first = k.positionTrend[0];
	const pillar = data.pillars.find((p) => p.id === k.pillarId);
	const pagePosts = k.rankingUrl ? data.posts.filter((p) => postUrl(p) === k.rankingUrl) : [];
	const targeting = data.posts.filter((p) => p.keywordId === k.id && !pagePosts.includes(p));
	const pageWeight = k.rankingUrl ? round1(data.keywords.filter((x) => x.rankingUrl === k.rankingUrl).reduce((s, x) => s + x.kasShare, 0)) : 0;
	const pageKeywords = k.rankingUrl ? data.keywords.filter((x) => x.rankingUrl === k.rankingUrl).length : 0;

	const timeline: ITimelineItem[] = history.map((h) => ({
		id: h.snap.id,
		icon: h.snap.trigger === "post-merge" ? "GitMerge" : "ClockClockwise",
		tone: h.snap.trigger === "post-merge" ? "agent" : "neutral",
		title: (
			<span className="flex items-baseline gap-2">
				{snapshotLabel(h.snap, data)}
				{h.share !== null && <span className="tabular ms-auto font-display">{fmtShare(h.share)}</span>}
				{h.delta !== null && <span className={clsx("tabular text-sm", deltaCls(h.delta))}>{fmtDelta(h.delta)}</span>}
			</span>
		),
		meta: `${fmtDateTime(h.snap.at)} · CMS agent · ${h.position !== null ? `position ${h.position}` : "not ranking"}`,
	}));

	return (
		<div className="flex flex-col gap-5 text-md">
			<div className="flex flex-wrap items-center gap-1.5">
				<Chip size="sm">{pillar?.name ?? "No pillar"}</Chip>
				<Chip size="sm">{INTENT_LABEL[k.intent]}</Chip>
				{k.rankingPages === 1 && (
					<Chip size="sm" tone="human">
						orphan
					</Chip>
				)}
				{k.decaying && (
					<Chip size="sm" tone="block" icon="TrendDown">
						decaying
					</Chip>
				)}
			</div>

			<div className="grid grid-cols-3 gap-2">
				{[
					{ l: "Share of score", v: fmtShare(k.kasShare), s: <span className={deltaCls(k.kasDelta)}>{fmtDelta(k.kasDelta)} pts</span> },
					{ l: "Position", v: k.position ?? "—", s: first !== undefined && k.position !== null ? `from ${first} in ${weeks[0] ?? "W32"}` : "not ranking" },
					{ l: "Impressions", v: fmtInt(k.impressions), s: "8-week window" },
				].map((t) => (
					<div key={t.l} className="flex min-w-0 flex-col gap-0.5 rounded-md bg-sunken-2 px-3 py-2.5">
						<span className="truncate text-xs text-ink-3">{t.l}</span>
						<span className="tabular font-display text-xl leading-snug">{t.v}</span>
						<span className="truncate text-xs text-ink-3">{t.s}</span>
					</div>
				))}
			</div>

			<Block title="Position" meta={weeks.length ? `${weeks[0]}–${weeks[weeks.length - 1]} · lower is better` : undefined}>
				{k.positionTrend.length > 1 ? (
					<div className="flex flex-col gap-1">
						<Sparkline values={k.positionTrend} invert tone={k.decaying ? "block" : "ink"} className="h-14 w-full" />
						<div className="tabular flex justify-between text-2xs text-ink-4">
							{k.positionTrend.map((p, i) => (
								<span key={i} className="flex flex-col items-center">
									<span>{weeks[i]}</span>
									<span className="text-ink-2">{p}</span>
								</span>
							))}
						</div>
					</div>
				) : (
					<span className="text-sm text-ink-3">One reading so far · Search Console lags 2–3 days.</span>
				)}
			</Block>

			<Block title="Raw weight" meta={w.curve === "client" ? "client CTR curve" : "modeled industry CTR curve"}>
				<div className="flex flex-col gap-2 rounded-md bg-sunken-2 p-3">
					<div className="tabular flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-xs text-ink-2">
						<span>I {fmtInt(w.impressions)}</span>
						<span className="text-ink-4">×</span>
						<span>
							C({k.position ?? "—"}) {w.c.toFixed(3)}
						</span>
						<span className="text-ink-4">×</span>
						<span>
							V({k.intent}) {w.v}
						</span>
						<span className="text-ink-4">=</span>
						<span className="font-display text-md text-ink">{w.raw.toFixed(1)}</span>
					</div>
					<div className="tabular flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-ink-2">
						<span>{w.raw.toFixed(1)}</span>
						<span className="text-ink-4">÷</span>
						<span>{fmtInt(w.total)} total site weight</span>
						<span className="text-ink-4">=</span>
						<span className="font-display text-md text-ink">{fmtShare(w.share)}</span>
					</div>
				</div>
				<span className="text-xs text-ink-3">
					V by intent: transactional 1.5 · commercial 1.25 · informational 1.0 · navigational 0.75. Every live keyword&apos;s score sums to 100%.
				</span>
			</Block>

			<Block title="Page attribution" meta={k.rankingPages === 1 ? "1 ranking page · single point of failure" : `${k.rankingPages} ranking pages`}>
				{k.rankingUrl ? (
					<KeyValue
						dense
						rows={[
							{ k: "Ranking page", v: <span className="font-mono text-xs text-ink-2">{k.rankingUrl}</span> },
							{ k: "Page carries", v: `${fmtShare(pageWeight)} of search weight · ${pageKeywords} keyword${pageKeywords === 1 ? "" : "s"}` },
						]}
					/>
				) : (
					<span className="text-sm text-ink-3">No page ranks for this keyword yet.</span>
				)}
				<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
					{pagePosts.map((p) => (
						<li key={p.id} className="flex items-center gap-2 rounded-md bg-sunken-2 px-3 py-2">
							<Link href={sitePath(slug, `/posts/${p.id}`)} className="min-w-0 flex-1 truncate hover:underline">
								{p.title}
							</Link>
							<span className="tabular font-display">{fmtShare(postKas(p, data.keywords))}</span>
						</li>
					))}
					{targeting.map((p) => (
						<li key={p.id} className="flex items-center gap-2 rounded-md bg-sunken-2 px-3 py-2">
							<Link href={sitePath(slug, `/posts/${p.id}`)} className="min-w-0 flex-1 truncate hover:underline">
								{p.title}
							</Link>
							<span className="shrink-0 text-xs text-ink-3">0.0% · not ranking yet (lags 2–3 days)</span>
						</li>
					))}
					{!pagePosts.length && k.rankingUrl && <li className="text-xs text-ink-3">{k.rankingUrl} is a site page, not a CMS post.</li>}
				</ul>
				{k.decaying && k.kasShare >= 5 && (
					<Callout tone="agent" icon="Robot" title="Refresh agent prioritises this page">
						Decaying while carrying {fmtShare(k.kasShare)} of score. It joins the next content refresh run.
					</Callout>
				)}
			</Block>

			<Block title="After the last merge" meta={effect ? `Recalculated ${fmtDate(effect.after.at)} · 24 h after merge` : undefined}>
				{effect ? (
					<>
						<span className="text-sm text-ink-2">
							{effect.mr ? `${mrRef(effect.mr)} ` : ""}
							{effect.post ? (
								<Link href={sitePath(slug, `/posts/${effect.post.id}`)} className="font-display hover:underline">
									{effect.post.title}
								</Link>
							) : (
								"A post"
							)}{" "}
							merged{effect.mr?.mergedAt ? ` ${fmtDate(effect.mr.mergedAt)}` : ""}.{effect.shipped ? " This is the keyword that post targets." : ""}
						</span>
						<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
							<div className="flex flex-col gap-0.5 rounded-md bg-sunken-2 px-3 py-2.5">
								<span className="text-xs text-ink-3">Before · {effect.before ? snapshotLabel(effect.before, data) : "no earlier snapshot"}</span>
								<span className="tabular font-display text-lg">{effect.b ? fmtShare(effect.b.share) : "—"}</span>
								<span className="text-xs text-ink-3">{effect.b?.position != null ? `position ${effect.b.position}` : "not ranking"}</span>
							</div>
							<span aria-hidden="true" className="text-ink-4">
								→
							</span>
							<div className="flex flex-col gap-0.5 rounded-md bg-agent-soft px-3 py-2.5">
								<span className="text-xs text-agent-ink">After · {fmtDate(effect.after.at)}</span>
								<span className="tabular font-display text-lg">{effect.a ? fmtShare(effect.a.share) : "—"}</span>
								<span className="text-xs text-ink-3">{effect.a?.position != null ? `position ${effect.a.position}` : "not ranking"}</span>
							</div>
						</div>
						{effect.a && effect.b && (
							<span className={clsx("tabular text-sm", deltaCls(effect.a.share - effect.b.share))}>
								{fmtDelta(effect.a.share - effect.b.share)} pts share{" "}
								<span className="text-ink-3">
									· a share change, not just a position move
								</span>
							</span>
						)}
					</>
				) : (
					<Callout tone="info" title="No post-merge snapshot yet">
						Scores recalculate 24 h after each merge, then weekly.
					</Callout>
				)}
			</Block>

			<Block title="Snapshots" meta={`${history.length} stored`}>
				{timeline.length ? <Timeline items={timeline} /> : <span className="text-sm text-ink-3">No snapshots stored yet.</span>}
			</Block>

			<SourceNote>Search Console · lags 2–3 days · modeled CTR curve</SourceNote>
		</div>
	);
}
