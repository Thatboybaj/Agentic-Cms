// Approve → ship, and hold (README §6). Shared by the autopost gate and the human Approve button, ported from the
// prototype's openMergeRequest (approval half) and holdPost. The MR itself is opened by the shipPost workflow.
import { AUTOPOST_ACTOR, type IGateResult } from "../../src/lib/logic";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { workflow } from "../workflows/manager";
import { audit } from "./audit";
import { notify, siteAudienceWith } from "./notify";
import { transitionPost } from "./transition";

type TActor = Doc<"users"> | { system: string };
const actorName = (a: TActor) => ("system" in a ? a.system : a.name);

async function closeLedger(ctx: MutationCtx, siteId: Id<"sites">, postId: Id<"posts">, match: (l: Doc<"ledgerItems">) => boolean, by?: Id<"users">) {
	const items = await ctx.db.query("ledgerItems").withIndex("by_post", (q) => q.eq("postId", postId)).take(100);
	for (const l of items) if (l.siteId === siteId && !l.done && match(l)) await ctx.db.patch(l._id, { done: true, doneAt: Date.now(), ...(by ? { doneBy: by } : {}) });
}

/** Autopost holds the post for a person: In review + one open "Autopost held: <reason>" ledger item. */
export async function holdPost(ctx: MutationCtx, site: Doc<"sites">, post: Doc<"posts">, reason: string) {
	if (post.state !== "in-review") {
		const r = await transitionPost(ctx, post, "in-review");
		if (!r.ok) return;
	}
	await ctx.db.patch(post._id, { progress: undefined });
	await closeLedger(ctx, site._id, post._id, (l) => l.kind === "autopost-hold");
	await ctx.db.insert("ledgerItems", {
		siteId: site._id,
		title: `Autopost held: ${reason}`,
		owner: "Content specialist",
		createdAt: Date.now(),
		downstream: "holds 1 post in In review",
		postId: post._id,
		kind: "autopost-hold",
		origin: "autopost",
		dedupeKey: `autopost-hold:${post._id}`,
		done: false,
	});
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: { system: AUTOPOST_ACTOR }, action: "held autopost", target: post.title, detail: reason });
	await notify(ctx, {
		workspaceId: site.workspaceId,
		siteId: site._id,
		userIds: await siteAudienceWith(ctx, site, "post.approve"),
		tone: "human",
		title: "Autopost held a post",
		body: `${post.title} · ${reason}. It waits in Approvals for a person.`,
		href: `/approvals?post=${post._id}`,
		dedupeKey: `autopost-held:${post._id}:${post.currentVersion}`,
	});
}

/**
 * Records the approval of `post` at its current version and starts shipPost. Soft overrides are written onto the
 * gate checks (derived checks are inserted); each one a person typed is audited as "overrode soft block".
 */
export async function approveAndShip(
	ctx: MutationCtx,
	site: Doc<"sites">,
	post: Doc<"posts">,
	gate: IGateResult,
	actor: TActor,
	opts: { explicit: Record<string, string>; autopost: boolean; approvalDetail?: string },
): Promise<string> {
	const at = Date.now();
	const by = actorName(actor);
	const byUserId = "system" in actor ? undefined : actor._id;
	for (const c of gate.soft) {
		const reason = c.override!.reason;
		const row = await ctx.db.query("gateChecks").withIndex("by_post_check", (q) => q.eq("postId", post._id).eq("checkId", c.id)).unique();
		const override = { reason, by, at, ...(byUserId ? { byUserId } : {}) };
		if (row && !row.override) await ctx.db.patch(row._id, { override });
		if (!row) await ctx.db.insert("gateChecks", { siteId: site._id, postId: post._id, checkId: c.id, label: c.label, section: c.section, status: c.status, value: c.value, severity: c.severity, override, evaluatedAt: at, evaluatedForVersion: post.currentVersion });
		if (opts.explicit[c.id]) await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor, action: "overrode soft block", target: post.title, detail: `${c.label} ${c.value} · "${reason}"` });
	}
	const overrides = gate.soft.map((c) => `${c.label} ${c.value}: ${c.override!.reason}`);
	await ctx.db.patch(post._id, { approvedVersion: post.currentVersion, progress: { label: "Rendering into the template", value: 85 }, updatedAt: at });
	await closeLedger(ctx, site._id, post._id, (l) => /review/i.test(l.title) || l.kind === "autopost-hold", byUserId);
	await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor, action: "approved", target: post.title, detail: opts.approvalDetail ?? `Facts, voice and brand asserted · ${overrides.length} override${overrides.length === 1 ? "" : "s"}` });
	return workflow.start(ctx, internal.workflows.shipPost.shipPost, { siteId: site._id, postId: post._id, version: post.currentVersion, autopost: opts.autopost, overrides }, { startAsync: true });
}
