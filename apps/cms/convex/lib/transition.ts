// Post state changes (handoff 02 step 2). `transitionPost` is the ONLY code that writes posts.state; the CI check in
// scripts/check-cms-convex-auth.mjs fails on any other `state:` write to posts. Edges come only from TRANSITIONS
// (src/lib/logic.ts) via nextState(); `from` is optimistic, so a late step from an old workflow can't move a post a
// person already moved. Audit and notifications stay with the caller, as in the prototype (each action has its own
// wording: "approved idea", "generated draft", "moved to In review"...).
import { ConvexError } from "convex/values";
import { STATE_OWNER, nextState } from "../../src/lib/logic";
import type { TPostState } from "../../src/lib/types";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type TTransitionResult = { ok: true; post: Doc<"posts"> } | { ok: false; reason: string };

export async function transitionPost(ctx: MutationCtx, post: Doc<"posts">, to: TPostState, opts: { from?: TPostState; extra?: Partial<Doc<"posts">> } = {}): Promise<TTransitionResult> {
	const from = opts.from ?? post.state;
	const fresh = await ctx.db.get(post._id);
	if (!fresh || fresh.state !== from) return { ok: false, reason: `The post moved on (now ${fresh?.state ?? "gone"})` };
	const t = nextState(from, to);
	if (!t.ok) return { ok: false, reason: t.reason };
	const now = Date.now();
	const keepProgress = to === "drafting" || to === "needs-assets";
	await ctx.db.patch(post._id, {
		state: to,
		owner: STATE_OWNER[to],
		stateChangedAt: now,
		updatedAt: now,
		...(keepProgress ? {} : { progress: undefined }),
		...opts.extra,
	});
	return { ok: true, post: (await ctx.db.get(post._id))! };
}

/** For workflow steps: same rules, but a refused edge is an error the workflow sees. */
export async function mustTransition(ctx: MutationCtx, post: Doc<"posts">, to: TPostState, opts: { from?: TPostState; extra?: Partial<Doc<"posts">> } = {}) {
	const r = await transitionPost(ctx, post, to, opts);
	if (!r.ok) throw new ConvexError({ code: "CONFLICT", reason: r.reason });
	return r.post;
}
