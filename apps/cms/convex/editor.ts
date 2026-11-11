// Editor (api-map §4 `editBlock`). A human edit is a new version; deleting an unsourced claim resolves its marker.
// Editing a post whose MR is open makes the approval stale: the post goes back to In review (TRANSITIONS has the
// mr-open → in-review edge) and the open PR is updated by the next shipPost. Versions coalesce per editor per 2 min.
import { v } from "convex/values";
import { loadPostInSite } from "./lib/access";
import { audit } from "./lib/audit";
import { siteMutation } from "./lib/functions";
import { transitionPost } from "./lib/transition";

type TResult = { ok: true } | { ok: false; reason: string };
const COALESCE_MS = 2 * 60_000;
const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
const EDITABLE = new Set(["drafting", "needs-assets", "in-review", "mr-open", "live", "decaying"]);

export const editBlock = siteMutation({
	permission: "post.edit",
	args: { postId: v.id("posts"), blockId: v.string(), text: v.string(), baseVersion: v.number() },
	handler: async (ctx, { siteId, postId, blockId, text, baseVersion }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await loadPostInSite(ctx, siteId, postId);
		if (!EDITABLE.has(post.state)) return { ok: false, reason: "Nothing to edit yet · the draft comes after the brief" };
		if (post.workflowId) return { ok: false, reason: "An agent is working on this post · wait for it to finish" };
		if (post.currentVersion !== baseVersion) return { ok: false, reason: "Someone changed this block" };
		const lock = (await ctx.db.query("editLocks").withIndex("by_post", (q) => q.eq("postId", postId)).take(1))[0];
		if (lock && lock.userId !== user._id) {
			const holder = await ctx.db.get(lock.userId);
			return { ok: false, reason: `${holder?.name ?? "Someone"} is editing` };
		}
		const idx = post.blocks.findIndex((b) => b.id === blockId);
		if (idx < 0) return { ok: false, reason: "Block not found" };
		const block = post.blocks[idx]!;
		if (block.text === text) return { ok: true };

		const now = Date.now();
		const facts = await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", postId)).take(100);
		for (const f of facts) {
			if (f.status === "open" && (block.factMarkerIds?.includes(f._id) || f.blockId === blockId) && !text.includes(f.claim)) {
				await ctx.db.patch(f._id, { status: "resolved", resolution: "rewritten", resolvedBy: user.name, resolvedAt: now, note: `Removed by ${user.name}.` });
			}
		}
		const stillOpen = new Set(facts.filter((f) => f.status === "open" && text.includes(f.claim)).map((f) => f._id as string));
		const nextBlock = { ...block, text, ...(block.factMarkerIds ? { factMarkerIds: block.factMarkerIds.filter((id) => stillOpen.has(id)) } : {}) };
		if (nextBlock.factMarkerIds && !nextBlock.factMarkerIds.length) delete nextBlock.factMarkerIds;
		const blocks = post.blocks.map((b, i) => (i === idx ? nextBlock : b));
		const words = Math.max(0, post.words + countWords(text) - countWords(block.text));

		// Coalesce: the same person editing again within 2 minutes amends their own latest human-edit version.
		const latest = (await ctx.db.query("postVersions").withIndex("by_post_n", (q) => q.eq("postId", postId)).order("desc").take(1))[0];
		let n = post.currentVersion;
		const coalesce = latest && latest.origin === "human-edit" && latest.actorUserId === user._id && now - latest.at < COALESCE_MS && post.approvedVersion !== latest.n;
		if (coalesce) await ctx.db.patch(latest._id, { blocks, words, at: now });
		else {
			n = post.currentVersion + 1;
			await ctx.db.insert("postVersions", { siteId, postId, n, origin: "human-edit", actor: user.name, actorUserId: user._id, at: now, words, blocks, seoTitle: post.seoTitle });
		}
		await ctx.db.patch(postId, { blocks, words, currentVersion: n, updatedAt: now });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "edited", target: post.title, detail: `v${n} · human edit` });

		if (post.state === "mr-open" && post.approvedVersion !== undefined && post.approvedVersion < n) {
			const r = await transitionPost(ctx, { ...post, currentVersion: n }, "in-review");
			if (r.ok) await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "moved to In review", target: post.title, detail: `Edited after approval (v${post.approvedVersion} → v${n}) · the open MR updates on the next approval` });
		}
		return { ok: true };
	},
});

