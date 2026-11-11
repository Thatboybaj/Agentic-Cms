"use client";
// S02 /plan — Content plan (Ref 01; F1, F2, F11, F12) and S03 /plan/new (New idea sheet over the plan).
// Board · Calendar · Pillar matrix via ?view=. Demo region states via ?demo=loading|error|empty.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Button,
	Callout,
	Card,
	EmptyState,
	IconButton,
	PageHeader,
	RoleGate,
	SegmentedControl,
	Skeleton,
	SourceNote,
	SplitPane,
	STATE_LABEL,
	StatStrip,
	type IStatStripItem,
} from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { fmtDay, fmtTime, POST_STATES } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { usePlanCms } from "./source";
import type { TPostState } from "@/lib/types";
import { PlanAside, RunDialog, type TRegionState } from "./aside";
import { Board } from "./board";
import { MobileList, type TMobileFilter } from "./mobile-list";
import { parseView, usePlanHeadline, usePlanModel, WIDE_BY_DEFAULT, type TPlanView } from "./model";
import { NewIdeaSheet } from "./new-idea-sheet";
import { CalendarView, MatrixView } from "./views";
import { sitePath } from "@/lib/routes";

type TDemo = "loading" | "error" | "empty" | null;

export function PlanFeature({ newIdea = false }: { newIdea?: boolean }) {
	const { slug } = useSite();
	const params = useSearchParams();
	const router = useRouter();
	const path = usePathname();
	const view = parseView(params.get("view"));
	const demoParam = params.get("demo");
	const demoFromUrl: TDemo = demoParam === "loading" || demoParam === "error" || demoParam === "empty" ? demoParam : null;

	const { data, site, role, state, can, loading } = usePlanCms();
	// On Convex, the first bundle takes a moment: reuse the page's own loading state.
	const demo: TDemo = loading ? "loading" : demoFromUrl;
	const model = usePlanModel();
	const { stats, pivot } = usePlanHeadline();

	const [expanded, setExpanded] = useState<Set<TPostState>>(() => new Set(WIDE_BY_DEFAULT));
	const [focus, setFocus] = useState<TPostState | null>("in-review");
	const [mobileFilter, setMobileFilter] = useState<TMobileFilter>("needs-you");
	const [swarmDialog, setSwarmDialog] = useState(false);
	const cols = useRef(new Map<TPostState, HTMLElement>());
	const pendingScroll = useRef<TPostState | null>(null);

	const qs = (v: TPlanView) => (v === "board" ? "" : `?view=${v}`);
	const setView = (v: TPlanView) => router.replace(`${path}${qs(v)}`, { scroll: false });
	const openSheet = () => router.push(sitePath(slug, `/plan/new${qs(view)}`), { scroll: false });
	const closeSheet = () => router.push(sitePath(slug, `/plan${qs(view)}`), { scroll: false });
	const retry = () => router.replace(`${path}${qs(view)}`, { scroll: false });

	const columnRef = useCallback((s: TPostState, el: HTMLElement | null) => {
		if (el) cols.current.set(s, el);
		else cols.current.delete(s);
	}, []);

	// StatStrip → expand + scroll the column into view (after the expansion renders).
	useEffect(() => {
		const s = pendingScroll.current;
		if (!s) return;
		pendingScroll.current = null;
		cols.current.get(s)?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
	});
	const jumpTo = (s: TPostState) => {
		setFocus(s);
		setExpanded((prev) => new Set(prev).add(s));
		pendingScroll.current = s;
		if (view !== "board") setView("board");
	};
	const onExpand = (s: TPostState, open: boolean) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (open) {
				next.add(s);
				pendingScroll.current = s;
			} else next.delete(s);
			return next;
		});

	const { counts, cadence, ideasPending } = stats;
	// Needs you = open ledger items + ideas waiting for approval (C10: ideas are the one human decision).
	const needsHuman = stats.needsHuman + ideasPending;
	const empty = demo === "empty" || data.posts.length === 0;
	const canAdd = can("idea.create");
	const specialistName = state.members.find((m) => m.role === "specialist")?.name ?? "The content specialist";
	const swarm = data.schedules.find((x) => x.kind === "keyword-swarm" && x.enabled);
	const swarmAt = swarm ? `${fmtDay(swarm.nextAt)} at ${fmtTime(swarm.nextAt)}` : null;

	const stripItems: IStatStripItem[] = POST_STATES.map((s) => ({
		id: s,
		label: STATE_LABEL[s],
		value: counts[s],
		tone: s === "idea" && ideasPending > 0 ? "human" : s === "needs-assets" && counts[s] > 0 ? "human" : s === "decaying" && counts[s] > 0 ? "block" : undefined,
		active: focus === s,
		onClick: () => jumpTo(s),
	}));
	const mobileItems: IStatStripItem[] = [
		{ id: "needs-you", label: "Needs you", value: needsHuman, active: mobileFilter === "needs-you", onClick: () => setMobileFilter("needs-you") },
		...POST_STATES.map((s) => ({
			id: s,
			label: STATE_LABEL[s],
			value: counts[s],
			tone: s === "idea" && ideasPending > 0 ? ("human" as const) : s === "needs-assets" && counts[s] > 0 ? ("human" as const) : s === "decaying" && counts[s] > 0 ? ("block" as const) : undefined,
			active: mobileFilter === s,
			onClick: () => setMobileFilter(s),
		})),
	];

	const asideState: TRegionState = demo === "loading" ? "loading" : demo === "error" ? "error" : "ready";

	return (
		<>
			<TopBarCta>
				<RoleGate role={role} allow={["specialist", "admin"]} action="add ideas">
					<Button variant="primary" icon="Plus" onClick={openSheet} className="max-md:hidden">
						New idea
					</Button>
					<IconButton icon="Plus" label="New idea" variant="ink" onClick={openSheet} className="md:hidden" />
				</RoleGate>
			</TopBarCta>

			<SplitPane
				asideWidth={300}
				asideLabel="Plan status"
				className="max-lg:min-h-fit max-lg:flex-none lg:min-h-0"
				aside={
					<div className="thin-scrollbar flex flex-col gap-3 lg:-me-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pe-2">
						<PlanAside state={asideState} onRetry={retry} />
					</div>
				}
			>
				<PageHeader
					title="Content plan"
					subtitle={
						<>
							<span className="max-md:hidden">
								Week {cadence.week} · {cadence.shipped} of {cadence.target} posts on cadence · {needsHuman === 0 ? "nothing needs you" : `${needsHuman} ${needsHuman === 1 ? "item needs" : "items need"} a human`}
							</span>
							<span className="md:hidden">
								Week {cadence.week} · {needsHuman === 0 ? "nothing needs you" : `${needsHuman} ${needsHuman === 1 ? "item needs" : "items need"} you`}
							</span>
						</>
					}
					actions={
						<>
							{!canAdd && <SourceNote icon="LockSimple">{`Your role can view the plan · ${specialistName} adds ideas`}</SourceNote>}
							<SegmentedControl<TPlanView>
								label="Plan view"
								value={view}
								onChange={setView}
								size="md"
								options={[
									{ value: "board", label: "Board", icon: "Kanban" },
									{ value: "calendar", label: "Calendar", icon: "CalendarDots" },
									{ value: "matrix", label: "Pillar matrix", icon: "GridFour" },
								]}
							/>
						</>
					}
				/>

				{!site.repo && (
					<Callout
						tone="human"
						icon="Plugs"
						title={`${site.name} isn't connected to a repo yet.`}
						action={
							can("repo.connect") ? (
								<Button variant="secondary" size="sm" href={sitePath(slug, "/onboarding")}>
									Finish setup
								</Button>
							) : undefined
						}
					>
						Plans and drafts work; merge requests wait for setup.
					</Callout>
				)}
				{pivot && (
					<Callout
						tone="human"
						icon="Flag"
						title={`Pivot trigger · ${pivot}`}
						action={
							<Button variant="secondary" size="sm" href={sitePath(slug, "/seo")}>
								See SEO
							</Button>
						}
					/>
				)}

				{demo === "loading" ? (
					<PlanSkeleton />
				) : demo === "error" ? (
					<Card variant="solid" padding="md">
						<Callout
							tone="block"
							title="Couldn't load the plan."
							action={
								<Button variant="secondary" size="sm" onClick={retry}>
									Try again
								</Button>
							}
						>
							Your ledger and run schedule still work on the right.
						</Callout>
					</Card>
				) : empty ? (
					<Card variant="solid" padding="lg" className="lg:flex-1">
						<EmptyState
							icon="Sparkle"
							title="No posts yet"
							body={`The keyword swarm ${swarmAt ? `runs ${swarmAt}` : "is paused"} and fills the Idea column. Add an idea now or run it early.`}
							action={
								<RoleGate role={role} allow={["specialist", "admin"]} action="trigger runs">
									<Button variant="secondary" icon="Play" onClick={() => setSwarmDialog(true)}>
										Run keyword swarm now
									</Button>
								</RoleGate>
							}
						/>
					</Card>
				) : (
					<>
						<StatStrip items={stripItems} className="shrink-0 max-md:hidden" />
						<StatStrip items={mobileItems} className="-me-4 shrink-0 rounded-e-none md:hidden" />
						{view === "board" && (
							<>
								<div className="max-md:hidden lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
									<Board model={model} expanded={expanded} focus={focus} onExpand={onExpand} columnRef={columnRef} />
								</div>
								<div className="md:hidden">
									<MobileList model={model} filter={mobileFilter} />
								</div>
							</>
						)}
						{view === "calendar" && <CalendarView />}
						{view === "matrix" && <MatrixView />}
					</>
				)}
			</SplitPane>

			<NewIdeaSheet open={newIdea} onClose={closeSheet} />
			<RunDialog kind={swarmDialog ? "keyword-swarm" : null} onClose={() => setSwarmDialog(false)} />
		</>
	);
}

/** Loading geometry: 8 strip tiles, 4 columns × 2 cards (never a full-page spinner). */
export function PlanSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex gap-1.5 rounded-xl bg-surface p-1.5">
				{Array.from({ length: 8 }, (_, i) => (
					<Skeleton key={i} className="h-[52px] min-w-[84px] flex-1" radius={16} />
				))}
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-4">
				{Array.from({ length: 4 }, (_, c) => (
					<div key={c} className="flex flex-col gap-2.5 max-md:[&:nth-child(n+2)]:hidden">
						<Skeleton className="h-6 w-24" />
						{[0, 1].map((k) => (
							<Card key={k} variant="solid" padding="md" className="flex flex-col gap-3">
								<Skeleton className="h-5 w-20" radius={99} />
								<Skeleton className="h-5 w-full" />
								<Skeleton className="h-4 w-2/3" />
							</Card>
						))}
					</div>
				))}
			</div>
		</div>
	);
}
