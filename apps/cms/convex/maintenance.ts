// One-off repairs that apply to every site (run from the CLI with `npx convex run maintenance:<name>`).
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { cleanText } from "./agents/writerCore";

/**
 * Post text in the canonical form across all sites: HTML a model wrote into block text (<a href>, <strong>, …) becomes
 * [anchor](url) links or plain text, headings lose links. Paginated; call again with the returned cursor until done.
 */
export const normalizePostText = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
	handler: async (ctx, { cursor, dryRun }) => {
		const page = await ctx.db.query("posts").paginate({ cursor: cursor ?? null, numItems: 200 });
		const changed: { siteId: string; postId: string; title: string; blocks: number }[] = [];
		for (const p of page.page) {
			let n = 0;
			const blocks = p.blocks.map((b) => {
				if (b.kind === "image") return b;
				const text = cleanText(b.kind, b.text);
				if (text === b.text) return b;
				n++;
				return { ...b, text };
			});
			if (!n) continue;
			changed.push({ siteId: p.siteId, postId: p._id, title: p.title, blocks: n });
			if (!dryRun) await ctx.db.patch(p._id, { blocks, updatedAt: Date.now() });
		}
		return { changed, isDone: page.isDone, cursor: page.continueCursor };
	},
});
