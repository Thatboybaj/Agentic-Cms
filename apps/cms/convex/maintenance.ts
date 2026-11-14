// One-off repairs that apply to every site (run from the CLI with `npx convex run maintenance:<name>`).
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { titleMaxOf } from "../src/lib/logic";
import { cleanText } from "./agents/writerCore";
import { extractNotes } from "../src/render/inline";

/**
 * Post text in the canonical form across all sites: HTML a model wrote into block text (<a href>, <strong>, …) becomes
 * [anchor](url) links or plain text, headings lose links, editorial notes ([VERIFY …]) are removed and listed. Paginated; call again with the returned cursor until done.
 */
export const normalizePostText = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())), dryRun: v.optional(v.boolean()) },
	handler: async (ctx, { cursor, dryRun }) => {
		const page = await ctx.db.query("posts").paginate({ cursor: cursor ?? null, numItems: 200 });
		const changed: { siteId: string; postId: string; title: string; state: string; blocks: number; notes: string[] }[] = [];
		for (const p of page.page) {
			let n = 0;
			const notes: string[] = [];
			const blocks = p.blocks.map((b) => {
				if (b.kind === "image") return b;
				for (const x of extractNotes(b.text).notes) notes.push(`${b.id} · ${x.kind}: ${x.body}`);
				const text = cleanText(b.kind, b.text);
				if (text === b.text) return b;
				n++;
				return { ...b, text };
			});
			if (!n) continue;
			changed.push({ siteId: p.siteId, postId: p._id, title: p.title, state: p.state, blocks: n, notes });
			if (!dryRun) await ctx.db.patch(p._id, { blocks, updatedAt: Date.now() });
		}
		return { changed, isDone: page.isDone, cursor: page.continueCursor };
	},
});

/**
 * Title-length checks follow the site's limit and are soft (overridable with a reason). Re-evaluates the stored rows
 * on every site once; later edits and gate runs keep them current.
 */
export const refreshTitleChecks = internalMutation({
	args: { cursor: v.optional(v.union(v.string(), v.null())) },
	handler: async (ctx, { cursor }) => {
		const page = await ctx.db.query("gateChecks").paginate({ cursor: cursor ?? null, numItems: 300 });
		let changed = 0;
		const sites = new Map<string, number>();
		for (const c of page.page) {
			if (c.checkId !== "title-length") continue;
			const post = await ctx.db.get(c.postId);
			if (!post) continue;
			if (!sites.has(c.siteId)) sites.set(c.siteId, titleMaxOf(await ctx.db.get(c.siteId)));
			const max = sites.get(c.siteId)!;
			const len = post.seoTitle.length;
			const next = { status: (len && len <= max ? "pass" : "fail") as "pass" | "fail", value: `${len} / ${max}`, severity: "soft" as const };
			if (c.status === next.status && c.value === next.value && c.severity === "soft") continue;
			await ctx.db.patch(c._id, next);
			changed++;
		}
		return { changed, isDone: page.isDone, cursor: page.continueCursor };
	},
});
