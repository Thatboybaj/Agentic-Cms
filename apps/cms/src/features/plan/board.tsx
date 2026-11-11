"use client";
// Board view (S02 region 5): 8 PipelineColumns, 4 wide in the first viewport, the rest collapsed and reachable by
// horizontal scroll or the StatStrip. Drag only where the state machine has an action: Idea → Briefed (promoteToBrief).

import { clsx } from "clsx";
import Link from "next/link";
import { useId, type KeyboardEvent } from "react";
import { Button, Card, PipelineColumn, PostCard, RoleGate, STATE_LABEL, Tooltip } from "@/ds";
import { checkCap, estimateRun, fmtUsd, isPendingIdea, POST_STATES, TIER_LABEL } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { usePlanCms } from "./source";
import type { TPostState } from "@/lib/types";
import { IdeaApprovalRow, IdeaCostNote } from "./idea-actions";
import { cardPost, type IBoardPost, type IPlanModel } from "./model";
import { sitePath } from "@/lib/routes";

const EMPTY_COPY: Record<TPostState, string> = {
	idea: "No ideas waiting. The keyword swarm fills this column on Monday.",
	briefed: "Nothing briefed",
	drafting: "Nothing drafting",
	"needs-assets": "No posts waiting on images",
	"in-review": "Nothing in review",
	"mr-open": "No open merge requests",
	live: "Nothing live yet",
	decaying: "Nothing decaying",
};

export interface IBoardProps {
	model: IPlanModel;
	expanded: Set<TPostState>;
	focus: TPostState | null;
	onExpand: (state: TPostState, open: boolean) => void;
	columnRef: (state: TPostState, el: HTMLElement | null) => void;
}

export function Board({ model, expanded, focus, onExpand, columnRef }: IBoardProps) {
	const { slug } = useSite();
	const { can, actions } = usePlanCms();
	const hintId = useId();
	const canPromote = can("post.promote");
	const liveCount = useCountLive();

	const promote = (postId: string) => {
		const p = model.columns.idea.find((x) => x.post.id === postId);
		if (p) actions.promoteToBrief(postId);
	};

	return (
		<div className="thin-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 lg:min-h-0 lg:flex-1" role="group" aria-label="Pipeline board">
			{canPromote && (
				<span id={hintId} className="sr-only">
					Drag an idea onto Briefed to approve it, or press Alt plus Right arrow on a focused idea.
				</span>
			)}
			{POST_STATES.map((state) => {
				const items = model.columns[state];
				const count = state === "live" ? Math.max(items.length, liveCount) : items.length;
				const wide = expanded.has(state);
				const pending = state === "idea" ? items.filter((bp) => isPendingIdea(bp.post)).length : 0;
				return (
					<div
						key={state}
						ref={(el) => columnRef(state, el)}
						className={clsx("flex shrink-0 snap-start flex-col lg:min-h-0", wide ? "w-[calc((100%_-_168px)/4)] min-w-[200px]" : "w-[120px]")}
					>
						<PipelineColumn
							state={state}
							count={state === "idea" ? pending : count}
							owner={model.owner[state]}
							title={state === "idea" ? "Idea · needs approval" : undefined}
							onDrop={state === "briefed" && canPromote ? promote : undefined}
							className={clsx("lg:min-h-0 lg:flex-1", !wide && "[&_header]:flex-wrap [&_header]:gap-y-0.5", focus === state && "bg-surface/50 ring-1 ring-line-3")}
						>
							{wide ? (
								<div className="thin-scrollbar flex flex-col gap-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2">
									{items.length === 0 && <p className="px-1.5 py-3 text-sm text-ink-3">{EMPTY_COPY[state]}</p>}
									{items.map((bp) => (
										<BoardCard key={bp.post.id} bp={bp} selected={bp.post.id === model.mostStuckId} canPromote={canPromote} hintId={hintId} onPromote={promote} />
									))}
									{state === "live" && count > items.length && (
										<p className="px-1.5 text-sm text-ink-3">
											{count - items.length} older posts went live before the CMS.{" "}
											<Link href={sitePath(slug, "/posts?state=live")} className="underline underline-offset-2 hover:text-ink">
												See Posts
											</Link>
										</p>
									)}
									{!defaultWide(state) && (
										<Button variant="ghost" size="sm" icon="CaretLeft" onClick={() => onExpand(state, false)} className="self-start">
											Collapse
										</Button>
									)}
								</div>
							) : (
								<CollapsedBody items={items} count={count} state={state} onOpen={() => onExpand(state, true)} />
							)}
						</PipelineColumn>
					</div>
				);
			})}
		</div>
	);
}

const defaultWide = (s: TPostState) => s === "idea" || s === "drafting" || s === "needs-assets" || s === "in-review";

/** Live count includes posts that predate the CMS (liveBaseline) — never show only the seeded objects. */
function useCountLive() {
	const { data } = usePlanCms();
	return data.liveBaseline + data.posts.filter((p) => p.state === "live").length;
}

function CollapsedBody({ items, count, state, onOpen }: { items: IBoardPost[]; count: number; state: TPostState; onOpen: () => void }) {
	return (
		<Card variant="sunken" padding="sm" className="flex flex-col gap-2">
			{items.length === 0 ? (
				<span className="text-xs text-ink-3">{EMPTY_COPY[state]}</span>
			) : (
				<ul className="flex flex-col gap-1.5">
					{items.slice(0, 3).map((bp) => (
						<li key={bp.post.id} className="line-clamp-2 text-xs leading-snug text-ink-2">
							{bp.post.title}
						</li>
					))}
				</ul>
			)}
			{count > 0 && (
				<Button variant="ghost" size="sm" onClick={onOpen} aria-label={`View ${count} ${STATE_LABEL[state]} posts`} className="-ms-1 self-start">
					View {count}
				</Button>
			)}
		</Card>
	);
}

function BoardCard({ bp, selected, canPromote, hintId, onPromote }: { bp: IBoardPost; selected: boolean; canPromote: boolean; hintId: string; onPromote: (id: string) => void }) {
	const { slug } = useSite();
	const { data } = usePlanCms();
	const { post } = bp;
	const isIdea = post.state === "idea";
	const draggable = canPromote && isIdea;
	// The card component reads `post.mr`; the canonical MR lives in data.mergeRequests.
	const mr = post.mrId ? data.mergeRequests.find((m) => m.id === post.mrId) : undefined;
	const view = cardPost(post, mr);

	const onKeyDown = draggable
		? (e: KeyboardEvent<HTMLDivElement>) => {
				if (e.altKey && e.key === "ArrowRight") {
					e.preventDefault();
					onPromote(post.id);
				}
			}
		: undefined;

	return (
		<div className="flex flex-col gap-1.5" onKeyDown={onKeyDown} aria-describedby={draggable ? hintId : undefined}>
			<PostCard
				post={view}
				keyword={data.keywords.find((k) => k.id === post.keywordId)}
				pillar={data.pillars.find((p) => p.id === post.pillarId)}
				href={sitePath(slug, `/posts/${post.id}`)}
				blocks={post.state === "in-review" ? bp.blocks : undefined}
				slots={post.state === "needs-assets" ? bp.slots : undefined}
				selected={selected}
				draggable={draggable}
			/>
			{isIdea && isPendingIdea(post) && (
				<div className="flex flex-col gap-1">
					<IdeaApprovalRow post={post} />
					<span className="px-1.5">
						<IdeaCostNote post={post} />
					</span>
				</div>
			)}
			{post.state === "briefed" && <GenerateRow postId={post.id} strong={post.strongModel || post.contentType === "pillar" || post.contentType === "money-page"} />}
		</div>
	);
}

/** "Generate now" on briefed cards — the estimate is always visible before the run starts (spend guardrail). */
export function GenerateRow({ postId, strong }: { postId: string; strong: boolean }) {
	const { site, role, actions, why } = usePlanCms();
	const est = estimateRun("post-generation", site, { strongModel: strong });
	const cap = checkCap(site, "post-generation", est);
	const over = cap.status === "refused";
	return (
		<div className="flex items-center gap-2 px-1.5">
			<span className={clsx("min-w-0 flex-1 text-xs leading-snug", over ? "text-block-ink" : "text-ink-3")}>
				{over ? "Over text cap · an admin can raise it" : `Est. ${fmtUsd(est.usd)} · ${TIER_LABEL[est.tier].toLowerCase()}`}
			</span>
			<RoleGate role={role} allow={["specialist", "admin"]} action="generate drafts" fallback={<LockedGenerate reason={why("post.generate") ?? ""} />}>
				{over ? (
					<LockedGenerate reason={cap.message} />
				) : (
					<Button variant="agent" size="sm" icon="Sparkle" onClick={() => actions.generateNow(postId)}>
						Generate now
					</Button>
				)}
			</RoleGate>
		</div>
	);
}

function LockedGenerate({ reason }: { reason: string }) {
	return (
		<Tooltip label={reason}>
			<Button variant="agent" size="sm" icon="LockSimple" aria-disabled="true" aria-label={`Generate now · locked · ${reason}`} className="cursor-not-allowed opacity-50" onClick={(e) => e.preventDefault()}>
				Generate now
			</Button>
		</Tooltip>
	);
}
