// Spend and billing (handoff 08): budgets (admin only), model routing, the spend report (month × budget × run kind ×
// post, cost per shipped post), and the Polar subscription gate. The site ledger (spend.ts) is the source of truth
// for money; Polar only decides whether a site may run agents. Autumn metering waits on D3/D4/D15 (who is the
// customer, entity shape, feature names): nothing here depends on it.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { siteAction, siteMutation, siteQuery } from "./lib/functions";
import { spendMonth } from "./lib/defaults";

type TResult = { ok: true; url?: string } | { ok: false; reason: string };
const fmt = (n: number) => `$${n.toFixed(2)}`;
const vTier = v.union(v.literal("fast"), v.literal("workhorse"), v.literal("strongest"));

// ─── Entitlement ─────────────────────────────────────────────────────────────

const ACTIVE = new Set(["active", "trialing"]);
export const NOT_ENTITLED = "This site's subscription isn't active · an admin renews it in Settings → Billing";

/** True unless billing is enforced (BILLING_ENFORCED=1) and the site has no active/trialing Polar subscription. */
export async function siteEntitled(ctx: QueryCtx, siteId: Id<"sites">): Promise<boolean> {
	if (process.env.BILLING_ENFORCED !== "1") return true;
	const subs = await ctx.db.query("siteSubscriptions").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(20);
	return subs.some((s) => ACTIVE.has(s.status) && (!s.currentPeriodEnd || s.currentPeriodEnd > Date.now()));
}

export const status = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const subs = await ctx.db.query("siteSubscriptions").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(20);
		const latest = subs.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
		return { enforced: process.env.BILLING_ENFORCED === "1", entitled: await siteEntitled(ctx, siteId), checkoutConfigured: !!(process.env.POLAR_ACCESS_TOKEN && process.env.POLAR_PRODUCT_ID), subscription: latest ? { status: latest.status, currentPeriodEnd: latest.currentPeriodEnd ?? null } : null };
	},
});

// ─── Budgets + routing (admin) ───────────────────────────────────────────────

export const setBudget = siteMutation({
	permission: "budget.set",
	args: { budget: v.union(v.literal("text"), v.literal("image")), capUsd: v.number() },
	handler: async (ctx, { siteId, budget, capUsd }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (!Number.isFinite(capUsd) || capUsd < 0 || capUsd > 100_000) return { ok: false, reason: "Enter a monthly cap in dollars" };
		const cap = Math.round(capUsd * 100) / 100;
		const before = budget === "text" ? site.budgetCaps.textCapUsd : site.budgetCaps.imageCapUsd;
		if (before === cap) return { ok: true };
		await ctx.db.patch(siteId, { budgetCaps: { ...site.budgetCaps, [budget === "text" ? "textCapUsd" : "imageCapUsd"]: cap } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "changed budget", target: `${budget === "text" ? "Text" : "Image"} generation cap`, detail: `${fmt(before)} → ${fmt(cap)} / month` });
		return { ok: true };
	},
});

export const setModelRouting = siteMutation({
	permission: "routing.set",
	args: { task: v.union(v.literal("mechanical"), v.literal("writing"), v.literal("strategy"), v.literal("pillarPages")), tier: vTier },
	handler: async (ctx, { siteId, task, tier }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.modelRouting[task] === tier) return { ok: true };
		await ctx.db.patch(siteId, { modelRouting: { ...site.modelRouting, [task]: tier } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "changed model routing", target: task === "pillarPages" ? "pillar-pages" : task, detail: tier });
		return { ok: true };
	},
});

// ─── Spend report ────────────────────────────────────────────────────────────

export const report = siteQuery({
	permission: "budget.set",
	args: { month: v.optional(v.string()) },
	handler: async (ctx, { siteId, month }) => {
		const site = ctx.access.site;
		const m = month ?? spendMonth(Date.now());
		const [y, mo] = m.split("-").map(Number) as [number, number];
		const from = Date.UTC(y, mo - 1, 1);
		const to = Date.UTC(y, mo, 1);
		const runs = (await ctx.db.query("runs").withIndex("by_site_started", (q) => q.eq("siteId", siteId).gte("startedAt", from).lt("startedAt", to)).take(5000)).filter((r) => r.costUsd > 0);
		const byKind = new Map<string, { usd: number; runs: number }>();
		const byPost = new Map<string, number>();
		for (const r of runs) {
			const k = byKind.get(r.kind) ?? { usd: 0, runs: 0 };
			k.usd += r.costUsd;
			k.runs++;
			byKind.set(r.kind, k);
			if (r.postId) byPost.set(r.postId, (byPost.get(r.postId) ?? 0) + r.costUsd);
		}
		const shipped = (await ctx.db.query("posts").withIndex("by_site_state", (q) => q.eq("siteId", siteId).eq("state", "live")).take(2000)).filter((p) => p.liveAt && p.liveAt >= from && p.liveAt < to);
		const perShipped = shipped.map((p) => ({ postId: p._id, title: p.title, usd: Math.round((byPost.get(p._id) ?? 0) * 10000) / 10000 }));
		const posts: { postId: Id<"posts">; title: string; usd: number }[] = [];
		for (const [pid, usd] of [...byPost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
			const p = (await ctx.db.get(pid as Id<"posts">)) as Doc<"posts"> | null;
			if (p && p.siteId === siteId) posts.push({ postId: p._id, title: p.title, usd: Math.round(usd * 10000) / 10000 });
		}
		const spent = site.spend.month === m ? site.spend : { textMicroUsd: 0, imageMicroUsd: 0 };
		return {
			month: m,
			text: { spentUsd: spent.textMicroUsd / 1e6, capUsd: site.budgetCaps.textCapUsd },
			image: { spentUsd: spent.imageMicroUsd / 1e6, capUsd: site.budgetCaps.imageCapUsd },
			byKind: [...byKind.entries()].map(([kind, x]) => ({ kind, usd: Math.round(x.usd * 10000) / 10000, runs: x.runs })).sort((a, b) => b.usd - a.usd),
			byPost: posts,
			costPerShippedPost: perShipped.length ? Math.round((perShipped.reduce((n, p) => n + p.usd, 0) / perShipped.length) * 10000) / 10000 : null,
			shipped: perShipped,
		};
	},
});

// ─── Polar ───────────────────────────────────────────────────────────────────

const polarApi = () => (process.env.POLAR_SERVER === "production" ? "https://api.polar.sh" : "https://sandbox-api.polar.sh");

export const beginCheckout = siteAction({
	permission: "budget.set",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		const token = process.env.POLAR_ACCESS_TOKEN;
		const product = process.env.POLAR_PRODUCT_ID;
		if (!token || !product) return { ok: false, reason: "Billing isn't set up on this deployment yet (POLAR_ACCESS_TOKEN, POLAR_PRODUCT_ID)" };
		const res = await fetch(`${polarApi()}/v1/checkouts/`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ products: [product], metadata: { siteId, workspaceId: ctx.access.workspaceId }, success_url: `${process.env.FRONTEND_URL ?? ""}/sites?billing=success` }) });
		if (!res.ok) return { ok: false, reason: `Polar answered ${res.status} creating the checkout` };
		const body = (await res.json()) as { url?: string };
		return body.url ? { ok: true, url: body.url } : { ok: false, reason: "Polar returned no checkout URL" };
	},
});

/** Standard Webhooks (Polar): HMAC-SHA256 over "<id>.<timestamp>.<body>", base64; 5-minute tolerance. */
export async function verifyPolar(secret: string, headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): Promise<boolean> {
	if (!headers.id || !headers.timestamp || !headers.signature) return false;
	const ts = Number(headers.timestamp);
	if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
	const raw = secret.startsWith("whsec_") ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)) : new TextEncoder().encode(secret);
	const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${body}`)))));
	return headers.signature.split(" ").some((part) => part.split(",")[1] === sig);
}

export const onPolarEvent = internalMutation({
	args: { deliveryId: v.string(), type: v.string(), data: v.any() },
	handler: async (ctx, { deliveryId, type, data }) => {
		const seen = await ctx.db.query("webhookEvents").withIndex("by_source_delivery", (q) => q.eq("source", "polar").eq("deliveryId", deliveryId)).unique();
		if (seen) return { status: "duplicate" as const };
		const d = data as { id?: string; status?: string; product_id?: string; current_period_end?: string | null; metadata?: { siteId?: string } };
		const siteId = d.metadata?.siteId ? ctx.db.normalizeId("sites", d.metadata.siteId) : null;
		const site = siteId ? await ctx.db.get(siteId) : null;
		if (!type.startsWith("subscription.") || !site || !d.id || !d.status) {
			await ctx.db.insert("webhookEvents", { source: "polar", deliveryId, type, receivedAt: Date.now(), status: "ignored" });
			return { status: "ignored" as const };
		}
		const existing = (await ctx.db.query("siteSubscriptions").withIndex("by_site", (q) => q.eq("siteId", site._id)).take(20)).find((s) => s.polarSubscriptionId === d.id);
		const row = { status: d.status, ...(d.product_id ? { polarProductId: d.product_id } : {}), ...(d.current_period_end ? { currentPeriodEnd: Date.parse(d.current_period_end) } : {}), updatedAt: Date.now() };
		if (existing) await ctx.db.patch(existing._id, row);
		else await ctx.db.insert("siteSubscriptions", { workspaceId: site.workspaceId, siteId: site._id, provider: "polar", polarSubscriptionId: d.id, ...row });
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: { system: "Polar" }, action: "subscription updated", target: site.name, detail: d.status });
		await ctx.db.insert("webhookEvents", { source: "polar", deliveryId, type, receivedAt: Date.now(), status: "processed", siteId: site._id });
		return { status: "processed" as const };
	},
});


// ─── Publishing (Settings → Publishing) ──────────────────────────────────────

export const setAutopost = siteMutation({
	permission: "publishing.set",
	args: { on: v.boolean() },
	handler: async (ctx, { siteId, on }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.publishing.autopost === on) return { ok: true };
		await ctx.db.patch(siteId, { publishing: { ...site.publishing, autopost: on } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: on ? "turned autopost on" : "turned autopost off", target: site.name, detail: on ? "Content ships without review · hard blocks still hold the post" : "Every post stops at In review for a person" });
		return { ok: true };
	},
});

export const setAutoMerge = siteMutation({
	permission: "publishing.autoMerge",
	args: { on: v.boolean() },
	handler: async (ctx, { siteId, on }): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (site.publishing.autoMergeOnGreenCi === on) return { ok: true };
		if (on && !site.publishing.autopost) return { ok: false, reason: "Turn autopost on first: auto-merge only applies to autopost MRs" };
		await ctx.db.patch(siteId, { publishing: { ...site.publishing, autoMergeOnGreenCi: on } });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: on ? "turned auto-merge on" : "turned auto-merge off", target: site.name, detail: on ? "Autopost MRs merge when the repo's CI passes" : "A developer merges every MR" });
		return { ok: true };
	},
});
