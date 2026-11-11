// Runs & ledger page (api-map §8): resolve a human-ledger item, and the signed-in user's notifications for this site
// (the plan bundle carries the list; these mark them read). Wording is the prototype's (store.tsx).
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { audit } from "./lib/audit";
import { siteMutation } from "./lib/functions";

type TResult = { ok: true } | { ok: false; reason: string };
const DAY = 86_400_000;

export const resolveLedgerItem = siteMutation({
	permission: "post.edit",
	args: { itemId: v.id("ledgerItems") },
	handler: async (ctx, { siteId, itemId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const item = await ctx.db.get(itemId);
		if (!item || item.siteId !== siteId) return { ok: false, reason: "Item not found" };
		if (item.done) return { ok: true };
		await ctx.db.patch(itemId, { done: true, doneAt: Date.now(), doneBy: user._id });
		const days = Math.max(0, Math.floor((Date.now() - item.createdAt) / DAY));
		await audit(ctx, { workspaceId: site.workspaceId, siteId, ...(item.postId ? { postId: item.postId } : {}), actor: user, action: "resolved ledger item", target: item.title, detail: `after ${days} day${days === 1 ? "" : "s"}` });
		return { ok: true };
	},
});

export const markNotificationRead = siteMutation({
	permission: "plan.view",
	args: { notificationId: v.id("notifications") },
	handler: async (ctx, { siteId, notificationId }): Promise<TResult> => {
		const n = await ctx.db.get(notificationId);
		// Only your own notifications, and only this site's (I4).
		if (!n || n.userId !== ctx.access.user._id || (n.siteId && n.siteId !== siteId)) return { ok: false, reason: "Notification not found" };
		if (!n.read) await ctx.db.patch(notificationId, { read: true });
		return { ok: true };
	},
});

export const markAllNotificationsRead = siteMutation({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		const userId: Id<"users"> = ctx.access.user._id;
		const unread = await ctx.db.query("notifications").withIndex("by_user_read_at", (q) => q.eq("userId", userId).eq("read", false)).take(500);
		for (const n of unread) if (!n.siteId || n.siteId === siteId) await ctx.db.patch(n._id, { read: true });
		return { ok: true };
	},
});
