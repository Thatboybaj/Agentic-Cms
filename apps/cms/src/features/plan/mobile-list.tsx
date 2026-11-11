"use client";
// S02 mobile 390: StatStrip filter ("Needs you" first) → filtered PostCard list → ledger items.

import { PostCard } from "@/ds";
import { isPendingIdea } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { usePlanCms, usePlanLedger } from "./source";
import type { TPostState } from "@/lib/types";
import { LedgerLink } from "./aside";
import { GenerateRow } from "./board";
import { IdeaApprovalRow } from "./idea-actions";
import { cardPost, type IBoardPost, type IPlanModel } from "./model";
import { sitePath } from "@/lib/routes";

export type TMobileFilter = TPostState | "needs-you";

export function MobileList({ model, filter }: { model: IPlanModel; filter: TMobileFilter }) {
	const { slug } = useSite();
	const { data } = usePlanCms();
	const ledger = usePlanLedger();
	const inReviewIds = new Set(model.columns["in-review"].map((p) => p.post.id));
	const cards: IBoardPost[] = filter === "needs-you" ? model.humanPosts : model.columns[filter];
	const ledgerItems = filter === "needs-you" ? ledger.filter((l) => !l.postId || !inReviewIds.has(l.postId)) : [];

	return (
		<div className="flex flex-col gap-3">
			{cards.length === 0 && ledgerItems.length === 0 && <p className="px-1 py-4 text-sm text-ink-3">{filter === "needs-you" ? "Nothing needs you. The agents have it." : "Nothing here yet."}</p>}
			{cards.map((bp) => {
				const mr = bp.post.mrId ? data.mergeRequests.find((m) => m.id === bp.post.mrId) : undefined;
				return (
					<div key={bp.post.id} className="flex flex-col gap-1.5">
						<PostCard
							post={cardPost(bp.post, mr)}
							keyword={data.keywords.find((k) => k.id === bp.post.keywordId)}
							pillar={data.pillars.find((p) => p.id === bp.post.pillarId)}
							href={sitePath(slug, `/posts/${bp.post.id}`)}
							blocks={bp.post.state === "in-review" ? bp.blocks : undefined}
							slots={bp.post.state === "needs-assets" ? bp.slots : undefined}
							selected={bp.post.id === model.mostStuckId}
						/>
						{isPendingIdea(bp.post) && <IdeaApprovalRow post={bp.post} />}
						{bp.post.state === "briefed" && <GenerateRow postId={bp.post.id} strong={bp.post.strongModel || bp.post.contentType === "pillar" || bp.post.contentType === "money-page"} />}
					</div>
				);
			})}
			{ledgerItems.map((l) => (
				<LedgerLink key={l.id} item={l} className="bg-surface" />
			))}
		</div>
	);
}
