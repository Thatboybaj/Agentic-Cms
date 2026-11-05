"use client";
// S02 region 5b (Calendar, F12) and 5c (Pillar matrix).

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarWeekGrid, Card, Chip, IconButton, PaginationDots, PillarMatrix, SourceNote, stateTone, type ICalendarWeek } from "@/ds";
import { isoWeek } from "@/lib/clock";
import { useCms, useSite } from "@/lib/store";
import type { TPostState } from "@/lib/types";
import { sitePath } from "@/lib/routes";

const PLANNED: TPostState[] = ["idea", "briefed", "drafting", "needs-assets", "in-review", "mr-open"];

export function CalendarView() {
	const { slug } = useSite();
	const { data, site, can, why, actions } = useCms();
	const canMove = can("post.schedule");
	const scroller = useRef<HTMLDivElement>(null);
	const [page, setPage] = useState(0);

	const weeks: ICalendarWeek[] = useMemo(() => {
		const now = isoWeek();
		return Array.from({ length: 6 }, (_, i) => now + i).map((w) => ({
			week: w,
			label: `W${w}`,
			target: site.cadenceTarget,
			items: data.posts
				.filter((p) => p.week === w && PLANNED.includes(p.state))
				.map((p) => ({
					id: p.id,
					title: p.title,
					tone: stateTone(p.state, data.slots.some((s) => s.postId === p.id && s.status === "human-only")),
					href: sitePath(slug, `/posts/${p.id}`),
					movable: p.state === "idea" || p.state === "briefed",
				})),
		}));
	}, [data, site.cadenceTarget, slug]);

	// Mobile: one week per screen, dots follow the scroll position.
	const grid = () => scroller.current?.firstElementChild as HTMLElement | null;
	useEffect(() => {
		const el = grid();
		if (!el) return;
		const on = () => setPage(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
		el.addEventListener("scroll", on, { passive: true });
		return () => el.removeEventListener("scroll", on);
	}, []);
	const go = (i: number) => {
		const el = grid();
		el?.querySelectorAll("section")[i]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
	};

	return (
		<div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
			<div className="flex flex-wrap items-center gap-2 px-1">
				{canMove ? (
					<SourceNote icon="Info">Drag an idea or brief to another week · keyboard: Alt + ← / →</SourceNote>
				) : (
					<SourceNote icon="LockSimple">View only · {why("post.schedule")}</SourceNote>
				)}
				<span className="text-xs text-ink-3">Drafting and later are pinned to their week.</span>
			</div>
			<div ref={scroller} className="lg:min-h-0 lg:flex-1">
				<CalendarWeekGrid
					weeks={weeks}
					onMove={canMove ? (id, w) => actions.movePostToWeek(id, w) : undefined}
					className="max-md:snap-x max-md:snap-mandatory max-md:auto-cols-[100%] max-md:*:snap-start lg:h-full lg:items-start"
				/>
			</div>
			<div className="flex items-center justify-center gap-3 md:hidden">
				<IconButton icon="CaretLeft" label="Previous week" variant="white" size="sm" disabled={page === 0} onClick={() => go(page - 1)} />
				<PaginationDots count={weeks.length} index={page} onChange={go} />
				<IconButton icon="CaretRight" label="Next week" variant="white" size="sm" disabled={page >= weeks.length - 1} onClick={() => go(page + 1)} />
			</div>
		</div>
	);
}

export function MatrixView() {
	const { data } = useCms();
	const cells = useMemo(() => {
		const map = new Map<string, number>();
		for (const p of data.posts) map.set(`${p.pillarId}|${p.state}`, (map.get(`${p.pillarId}|${p.state}`) ?? 0) + 1);
		return [...map].map(([key, count]) => {
			const [pillarId, state] = key.split("|") as [string, TPostState];
			return { pillarId, state, count };
		});
	}, [data.posts]);
	const thin = data.pillars.filter((p) => p.livePosts < p.plannedPosts / 2 || p.claimedButUnearned);
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm text-ink-3">Posts per pillar by state, against planned coverage.</span>
				{thin.map((p) => (
					<Chip key={p.id} tone="human" size="sm" icon="Hand">
						{p.name} · thin
					</Chip>
				))}
			</div>
			{data.pillars.length === 0 ? (
				<p className="py-6 text-center text-sm text-ink-3">No pillars yet. Pillars come from the strategy agent.</p>
			) : (
				<PillarMatrix pillars={data.pillars} cells={cells} className="[&_tbody_th]:sticky [&_tbody_th]:start-0 [&_tbody_th]:z-10 [&_tbody_th]:bg-surface [&_thead_th:first-child]:sticky [&_thead_th:first-child]:start-0 [&_thead_th:first-child]:bg-surface" />
			)}
		</Card>
	);
}
