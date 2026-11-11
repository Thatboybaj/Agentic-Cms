// Content plan (api-map §2 `posts.board` + the reads the plan page needs in one subscription): posts with their gate
// checks and fact markers, keywords, pillars, image slots, MRs, schedules, open ledger items, recent runs, the
// confirmed manifest, and the site's people with their roles. Bounded reads only (I3). Plus moveToWeek (api-map §3).
import { v } from "convex/values";
import { siteRoleFor } from "./lib/access";
import { audit } from "./lib/audit";
import { activeManifest, activeRepo } from "./lib/gateInputs";
import { siteMutation, siteQuery } from "./lib/functions";
import { isoWeek } from "./posts";

type TResult = { ok: true } | { ok: false; reason: string };

export const bundle = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const { site, role } = ctx.access;
		const allPosts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(500);
		const posts = [];
		for (const p of allPosts) {
			if (p.ideaStatus === "rejected") continue;
			const checks = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", p._id)).take(60);
			const facts = await ctx.db.query("factMarkers").withIndex("by_post", (q) => q.eq("postId", p._id)).take(60);
			posts.push({ ...p, checks, facts });
		}
		const slots = await ctx.db.query("imageSlots").withIndex("by_site_status", (q) => q.eq("siteId", siteId)).take(2000);
		// Candidates only where a person may pick (the image pipeline shows them); bounded per slot.
		const candidates = [];
		for (const s of slots) {
			if (s.status !== "candidates" && s.status !== "selected") continue;
			for (const c of await ctx.db.query("candidates").withIndex("by_slot", (q) => q.eq("slotId", s._id)).take(12)) {
				// Stored candidates show from Convex storage (the file the MR will carry), not the provider's URL.
				const asset = c.assetId ? await ctx.db.get(c.assetId) : null;
				const assetUrl = asset?.storageId && asset.siteId === siteId ? await ctx.storage.getUrl(asset.storageId) : null;
				candidates.push({ ...c, ...(assetUrl ? { assetUrl } : {}) });
			}
		}
		// Recent site activity (MR timelines, editor activity outside the focused post).
		const audit = (await ctx.db.query("auditEvents").withIndex("by_site_at", (q) => q.eq("siteId", siteId)).order("desc").take(150)).map((a) => ({ id: a._id, at: a.at, actor: a.actor, action: a.action, target: a.target, detail: a.detail, postId: a.postId }));
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(2000);
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const mergeRequests = await ctx.db.query("mergeRequests").withIndex("by_site_status", (q) => q.eq("siteId", siteId)).take(500);
		const schedules = await ctx.db.query("schedules").withIndex("by_site_kind", (q) => q.eq("siteId", siteId)).take(20);
		const ledger = await ctx.db.query("ledgerItems").withIndex("by_site_done", (q) => q.eq("siteId", siteId).eq("done", false)).take(200);
		const runs = await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId)).order("desc").take(50);
		// The signed-in user's notifications for this site (newest first); never anyone else's.
		const notifications = (await ctx.db.query("notifications").withIndex("by_user_site", (q) => q.eq("userId", ctx.access.user._id).eq("siteId", siteId)).order("desc").take(60)).map((n) => ({ id: n._id, at: n.at, tone: n.tone, title: n.title, body: n.body, href: n.href, read: n.read }));
		const manifest = await activeManifest(ctx, siteId);
		const repo = await activeRepo(ctx, siteId);
		// People on the site (names + effective roles) for "who does this" copy; never emails.
		const memberRows = await ctx.db.query("memberships").withIndex("by_site_user", (q) => q.eq("siteId", siteId)).take(200);
		const wsRows = await ctx.db.query("workspaceMembers").withIndex("by_workspace_user", (q) => q.eq("workspaceId", site.workspaceId)).take(500);
		const ids = new Set([...memberRows.map((m) => m.userId), ...wsRows.filter((w) => w.status === "active" && w.role !== "member").map((w) => w.userId)]);
		const members = [];
		for (const userId of ids) {
			const u = await ctx.db.get(userId);
			const r = u ? await siteRoleFor(ctx, site, userId) : null;
			if (u && r && u.status === "active") members.push({ id: u._id, name: u.name, initials: u.initials, role: r });
		}
		return {
			site: { ...site, role },
			repo: repo ? { host: repo.host, repo: repo.repo, baseBranch: repo.baseBranch, contentDir: repo.contentDir, assetDir: repo.assetDir, branchPattern: repo.branchPattern, installedAs: repo.installedAs } : null,
			posts,
			slots,
			candidates,
			audit,
			keywords,
			pillars,
			mergeRequests,
			schedules,
			ledger,
			runs,
			notifications,
			manifest,
			members,
			meId: ctx.access.user._id,
			now: Date.now(),
		};
	},
});

export const moveToWeek = siteMutation({
	permission: "post.schedule",
	args: { postId: v.id("posts"), week: v.number() },
	handler: async (ctx, { siteId, postId, week }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await ctx.db.get(postId);
		if (!post || post.siteId !== siteId) return { ok: false, reason: "Post not found" };
		if (post.state !== "idea" && post.state !== "briefed") return { ok: false, reason: "Only planned posts (Idea, Briefed) can be rescheduled" };
		if (!Number.isInteger(week) || week < isoWeek(Date.now()) || week > 53) return { ok: false, reason: "Pick this week or a later one" };
		if (week === post.week) return { ok: true };
		await ctx.db.patch(postId, { week, updatedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: "rescheduled", target: post.title, detail: `W${post.week} → W${week} · generation run moves with it` });
		return { ok: true };
	},
});
