// Runs & ledger page (api-map §8): resolve a human-ledger item, and the signed-in user's notifications for this site
// (the plan bundle carries the list; these mark them read). Wording is the prototype's (store.tsx).
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { ledgerStatus, roleCan } from "../src/lib/logic";
import type { TRole } from "../src/lib/types";
import { siteRoleFor } from "./lib/access";
import { audit } from "./lib/audit";
import { siteMutation, workspaceQuery } from "./lib/functions";

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

// ─── Cross-site inbox (the /inbox page and the rail's "need you" count) ───────────────────────────────────────
// Same rules as the prototype's inboxFor (src/lib/workspace.ts), from real rows: only sites this person can open, and
// each item only when their role on that site may act on it. Bounded reads per site.

type TInboxKind = "idea" | "review" | "held" | "human-slot" | "ledger-overdue" | "ci-failing" | "assigned" | "invite" | "access-request";
type TTone = "block" | "human" | "neutral";
export interface ILiveInboxItem {
	id: string;
	kind: TInboxKind;
	siteId?: string;
	siteSlug?: string;
	siteName?: string;
	hue?: number;
	title: string;
	detail: string;
	at: string;
	href: string;
	tone: TTone;
	postId?: string;
}

const CAP = 200;
const isoAt = (ms: number) => new Date(ms).toISOString();

export const list = workspaceQuery({
	args: {},
	handler: async (ctx): Promise<ILiveInboxItem[]> => {
		const { workspace, user, workspaceRole } = ctx.access;
		const items: ILiveInboxItem[] = [];
		const now = Date.now();
		const sites = await ctx.db.query("sites").withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id)).take(500);
		const open = new Map<string, { site: Doc<"sites">; role: TRole }>();
		for (const site of sites) {
			const role = await siteRoleFor(ctx, site, user._id);
			if (role) open.set(site._id, { site, role });
		}
		for (const { site, role } of open.values()) {
			const base = { siteId: site._id as string, siteSlug: site.slug, siteName: site.name, ...(typeof site.accent === "number" ? { hue: site.accent } : {}) };
			const href = (p: string) => `/s/${site.slug}${p}`;
			if (roleCan(role, "idea.approve"))
				for (const p of await ctx.db.query("posts").withIndex("by_site_idea", (q) => q.eq("siteId", site._id).eq("ideaStatus", "pending")).take(CAP))
					if (p.state === "idea") items.push({ ...base, id: `idea:${site._id}:${p._id}`, kind: "idea", title: p.title, detail: `Idea waiting for approval · W${p.week}`, at: isoAt(p.stateChangedAt), href: href("/approvals?tab=ideas"), tone: "human", postId: p._id });
			const openLedger = await ctx.db.query("ledgerItems").withIndex("by_site_done", (q) => q.eq("siteId", site._id).eq("done", false)).take(500);
			if (roleCan(role, "post.approve"))
				for (const p of await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", site._id).eq("state", "in-review")).take(CAP)) {
					const hold = openLedger.find((l) => l.postId === p._id && l.kind === "autopost-hold");
					items.push({ ...base, id: `${hold ? "held" : "review"}:${site._id}:${p._id}`, kind: hold ? "held" : "review", title: p.title, detail: hold ? hold.title : "Ready for review", at: isoAt(hold?.createdAt ?? p.stateChangedAt), href: href(`/approvals?post=${p._id}`), tone: hold ? "block" : "human", postId: p._id });
				}
			if (roleCan(role, "asset.manage"))
				for (const sl of await ctx.db.query("imageSlots").withIndex("by_site_status", (q) => q.eq("siteId", site._id).eq("status", "human-only")).take(CAP)) {
					const p = await ctx.db.get(sl.postId);
					if (!p) continue;
					items.push({ ...base, id: `slot:${site._id}:${sl._id}`, kind: "human-slot", title: `${sl.name} · ${p.title}`, detail: "Human-only image slot", at: isoAt(sl.generatedAt ?? p.stateChangedAt), href: href(`/posts/${p._id}/assets?slot=${sl._id}`), tone: "human", postId: p._id });
				}
			for (const l of openLedger) {
				if (l.ownerUserId ? l.ownerUserId !== user._id : l.owner !== user.name) continue;
				const status = ledgerStatus(Math.max(0, Math.floor((now - l.createdAt) / 86_400_000)));
				if (status === "open") continue;
				const age = Math.floor((now - l.createdAt) / 86_400_000);
				items.push({ ...base, id: `ledger:${site._id}:${l._id}`, kind: "ledger-overdue", title: l.title, detail: `Day ${age} · ${l.downstream}`, at: isoAt(l.createdAt), href: href(l.postId ? (l.slotId ? `/posts/${l.postId}/assets?slot=${l.slotId}` : `/posts/${l.postId}`) : "/runs#ledger"), tone: status === "blocker" ? "block" : "human", ...(l.postId ? { postId: l.postId } : {}) });
			}
			if (roleCan(role, "mr.rebase")) {
				const conflicts = await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", site._id).eq("status", "conflict")).take(CAP);
				const failing = (await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", site._id).eq("status", "open")).take(CAP)).filter((m) => m.ci === "failing");
				for (const m of [...conflicts, ...failing])
					items.push({ ...base, id: `ci:${site._id}:${m._id}`, kind: "ci-failing", title: m.title ?? m.branch, detail: m.status === "conflict" ? (m.conflictDetail ?? "Conflict with the base branch") : (m.ciDetail ?? "CI failing"), at: isoAt(m.openedAt), href: href("/merge-requests"), tone: "block", ...(m.postId ? { postId: m.postId } : {}) });
			}
		}
		// Assigned to me, on sites I can still open.
		for (const p of await ctx.db.query("posts").withIndex("by_assignee_state", (q) => q.eq("assigneeId", user._id)).take(CAP)) {
			const s = open.get(p.siteId);
			if (!s || p.state === "live" || p.state === "decaying" || p.state === "in-review" || (p.state === "idea" && p.ideaStatus === "pending")) continue;
			items.push({ siteId: s.site._id, siteSlug: s.site.slug, siteName: s.site.name, ...(typeof s.site.accent === "number" ? { hue: s.site.accent } : {}), id: `assigned:${p.siteId}:${p._id}`, kind: "assigned", title: p.title, detail: `Assigned to you · ${p.state.replace("-", " ")}`, at: isoAt(p.stateChangedAt), href: `/s/${s.site.slug}/posts/${p._id}`, tone: "neutral", postId: p._id });
		}
		// Workspace admins: invitations nobody has accepted yet.
		if (workspaceRole === "owner" || workspaceRole === "admin")
			for (const i of await ctx.db.query("invites").withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspace._id).eq("status", "pending")).take(CAP))
				items.push({ id: `invite:${i._id}`, kind: "invite", title: `${i.email} hasn't accepted the invite`, detail: `${i.siteRoles.length} site(s) waiting`, at: isoAt(i.createdAt), href: "/team", tone: "neutral" });
		return items.sort((a, b) => b.at.localeCompare(a.at));
	},
});
