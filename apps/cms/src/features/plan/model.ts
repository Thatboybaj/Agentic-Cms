"use client";
// Derived view data for the Content plan. Reads only from the store; never copies domain data.

import { useMemo } from "react";
import { usePlanManifest, usePlanCms, usePlanLedger, usePlanStats } from "./source";
import { evaluateGate, isPendingIdea, POST_STATES, STATE_OWNER } from "@/lib/logic";
import type { IImageSlot, IMergeRequest, IPost, TOwner, TPostState } from "@/lib/types";

export type TPlanView = "board" | "calendar" | "matrix";
export const PLAN_VIEWS: TPlanView[] = ["board", "calendar", "matrix"];

export const parseView = (v: string | null): TPlanView => (PLAN_VIEWS.includes(v as TPlanView) ? (v as TPlanView) : "board");

/** Columns the board opens wide; the rest open collapsed ("View 41") so human columns fit the first viewport (P1). */
export const WIDE_BY_DEFAULT: TPostState[] = ["idea", "drafting", "needs-assets", "in-review"];

/**
 * Card-ready post: the MR lives
 * in data.mergeRequests (PostCard reads `post.mr`). Derived per render, never stored.
 */
export function cardPost(post: IPost, mr?: IMergeRequest): IPost {
	return { ...post, mr: mr ?? post.mr };
}

export interface IBoardPost {
	post: IPost;
	blocks: string[];
	slots: IImageSlot[];
	humanOnly: boolean;
}

export interface IPlanModel {
	columns: Record<TPostState, IBoardPost[]>;
	owner: Record<TPostState, TOwner | "mixed">;
	mostStuckId: string | null;
	humanPosts: IBoardPost[];
}

export function usePlanModel(): IPlanModel {
	const { data } = usePlanCms();
	const manifest = usePlanManifest();
	return useMemo(() => {
		const columns = Object.fromEntries(POST_STATES.map((s) => [s, [] as IBoardPost[]])) as Record<TPostState, IBoardPost[]>;
		for (const post of data.posts) {
			const slots = data.slots.filter((s) => s.postId === post.id);
			const blocks = post.state === "in-review" ? evaluateGate(post, data.slots, manifest).hard : [];
			columns[post.state].push({ post, blocks, slots, humanOnly: slots.some((s) => s.status === "human-only") });
		}
		// Most blocked first inside human columns; planned columns by week.
		columns["in-review"].sort((a, b) => b.blocks.length - a.blocks.length || b.post.daysInState - a.post.daysInState);
		columns["needs-assets"].sort((a, b) => Number(b.humanOnly) - Number(a.humanOnly) || b.post.daysInState - a.post.daysInState);
		for (const s of ["idea", "briefed"] as const) columns[s].sort((a, b) => a.post.week - b.post.week);
		const owner = { ...STATE_OWNER } as Record<TPostState, TOwner | "mixed">;
		// Needs assets is mixed when some slots are human-only and some still with the agent.
		const na = columns["needs-assets"];
		if (na.length) owner["needs-assets"] = na.every((p) => p.humanOnly) ? "human" : na.some((p) => p.humanOnly) ? "mixed" : "agent";
		const stuck = columns["in-review"].find((p) => p.blocks.length > 0);
		return {
			columns,
			owner,
			mostStuckId: stuck?.post.id ?? null,
			humanPosts: [...columns["in-review"], ...columns["needs-assets"], ...columns.idea.filter((p) => isPendingIdea(p.post))],
		};
	}, [data, manifest]);
}

/** Everything the aside + header need beyond useStats. */
export function usePlanHeadline() {
	const stats = usePlanStats();
	const ledger = usePlanLedger();
	const { data, site } = usePlanCms();
	const latestReport = data.reports[0];
	const pivot = latestReport?.pivotTriggers[0] ?? null;
	return { stats, ledger, site, pivot, latestReport };
}
