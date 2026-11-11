// Search Console (handoff 07 steps 1–4, 6): PKCE OAuth with the read-only scope, property pick, daily import into
// positionHistory + keyword roll-ups, weekly impressions roll-up, token refresh, disconnect. Tokens and the PKCE
// verifier are sealed per tenant in `secrets` (lib/crypto). Missing data stays null (never 0). Configure with
// GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the Convex deployment; the redirect URI is
// <CONVEX_SITE_URL>/oauth/google/callback.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { aadFor, hintOf, open, seal } from "./lib/crypto";
import { siteAction, siteMutation, siteQuery } from "./lib/functions";
import { notify, siteAudienceWith } from "./lib/notify";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const PROVIDER = "google-search-console" as const;
const DAY = 86_400_000;
const LAG_DAYS = 3; // Search Analytics data lags ~2–3 days
type TResult = { ok: true; url?: string } | { ok: false; reason: string };

const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const redirectUri = () => `${process.env.CONVEX_SITE_URL}/oauth/google/callback`;
const NOT_CONFIGURED = "Google OAuth isn't set up on this deployment yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)";

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomUrlSafe = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha256UrlSafe = async (s: string) => b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));

async function connectionOf(ctx: { db: MutationCtx["db"] }, siteId: Id<"sites">) {
	return (await ctx.db.query("oauthConnections").withIndex("by_site_provider", (q) => q.eq("siteId", siteId).eq("provider", PROVIDER)).take(1))[0] ?? null;
}

export const status = siteQuery({
	permission: "seo.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const c = (await ctx.db.query("oauthConnections").withIndex("by_site_provider", (q) => q.eq("siteId", siteId).eq("provider", PROVIDER)).take(1))[0];
		return { configured: configured(), status: c?.status ?? null, email: c?.email ?? null, propertyUri: c?.propertyUri ?? null, lastImportAt: c?.lastImportAt ?? null, lastImportedDate: c?.lastImportedDate ?? null, lastErrorCode: c?.lastErrorCode ?? null };
	},
});

export const beginOAuth = siteMutation({
	permission: "searchConsole.connect",
	/** Where Google sends the person back: the site's Settings (default) or the onboarding wizard's Search Console step. */
	args: { returnTo: v.optional(v.literal("onboarding")) },
	handler: async (ctx, { siteId, returnTo }): Promise<TResult> => {
		if (!configured()) return { ok: false, reason: NOT_CONFIGURED };
		const state = randomUrlSafe();
		const verifier = randomUrlSafe(48);
		const stateHash = await sha256UrlSafe(state);
		const sealed = await seal(verifier, aadFor(siteId, "oauth-state", stateHash));
		await ctx.db.insert("oauthStates", { stateHash, siteId, userId: ctx.access.user._id, provider: PROVIDER, codeVerifierEncrypted: sealed.ciphertext, redirectTo: returnTo === "onboarding" ? `/s/${ctx.access.site.slug}/onboarding` : `/s/${ctx.access.site.slug}/settings?tab=site`, expiresAt: Date.now() + 10 * 60_000 });
		const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri(), response_type: "code", scope: `openid email ${SCOPE}`, access_type: "offline", prompt: "consent", include_granted_scopes: "false", state, code_challenge: await sha256UrlSafe(verifier), code_challenge_method: "S256" });
		return { ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
	},
});

/** The callback consumes a state exactly once (expiry + single use), returning what the exchange needs. */
export const consumeState = internalMutation({
	args: { state: v.string() },
	handler: async (ctx, { state }) => {
		const stateHash = await sha256UrlSafe(state);
		const row = await ctx.db.query("oauthStates").withIndex("by_stateHash", (q) => q.eq("stateHash", stateHash)).unique();
		if (!row || row.consumedAt || row.expiresAt < Date.now()) return null;
		await ctx.db.patch(row._id, { consumedAt: Date.now() });
		const verifier = await open(row.codeVerifierEncrypted, aadFor(row.siteId, "oauth-state", stateHash));
		// Only ever back to this site's own pages (no open redirect).
		const redirectTo = /^\/s\/[a-z0-9-]+\/(settings|onboarding)(\?[a-z=&-]*)?$/i.test(row.redirectTo) ? row.redirectTo : "/sites";
		return { siteId: row.siteId, userId: row.userId, verifier, redirectTo };
	},
});

async function putSecret(ctx: MutationCtx, site: Doc<"sites">, ownerKind: "oauth-access" | "oauth-refresh", ownerId: string, value: string, prev?: Id<"secrets">) {
	const sealed = await seal(value, aadFor(site._id, ownerKind, ownerId));
	const id = await ctx.db.insert("secrets", { workspaceId: site.workspaceId, siteId: site._id, ownerKind, ownerId, ciphertext: sealed.ciphertext, keyVersion: sealed.keyVersion, hint: hintOf(value), createdAt: Date.now() });
	if (prev) await ctx.db.delete(prev);
	return id;
}

export const storeTokens = internalMutation({
	args: { siteId: v.id("sites"), userId: v.id("users"), accessToken: v.string(), refreshToken: v.optional(v.string()), expiresIn: v.number(), scopes: v.array(v.string()), email: v.optional(v.string()) },
	handler: async (ctx, a) => {
		const site = (await ctx.db.get(a.siteId))!;
		const user = (await ctx.db.get(a.userId))!;
		const prev = await connectionOf(ctx, a.siteId);
		const hasScope = a.scopes.includes(SCOPE);
		const id = prev?._id ?? (await ctx.db.insert("oauthConnections", { workspaceId: site.workspaceId, siteId: site._id, provider: PROVIDER, status: "connected", scopes: [], connectedBy: user._id, updatedAt: Date.now() }));
		const accessTokenSecretId = await putSecret(ctx, site, "oauth-access", id, a.accessToken, prev?.accessTokenSecretId);
		const refreshTokenSecretId = a.refreshToken ? await putSecret(ctx, site, "oauth-refresh", id, a.refreshToken, prev?.refreshTokenSecretId) : prev?.refreshTokenSecretId;
		await ctx.db.patch(id, { status: hasScope ? "connected" : "missing_scope", scopes: a.scopes, ...(a.email ? { email: a.email } : {}), accessTokenSecretId, ...(refreshTokenSecretId ? { refreshTokenSecretId } : {}), accessTokenExpiresAt: Date.now() + a.expiresIn * 1000, lastErrorCode: undefined, connectedBy: user._id, updatedAt: Date.now() });
		await ctx.db.patch(site._id, { searchConsole: hasScope ? "connected" : "missing" });
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: user, action: hasScope ? "connected Search Console" : "Search Console scope missing", target: site.domain, detail: hasScope ? "Read-only · positions, impressions, clicks" : "Grant read access to Search Console and try again" });
		return { ok: hasScope };
	},
});

// ─── Tokens (actions) ────────────────────────────────────────────────────────

export const tokenInput = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const c = (await ctx.db.query("oauthConnections").withIndex("by_site_provider", (q) => q.eq("siteId", siteId).eq("provider", PROVIDER)).take(1))[0];
		if (!c || c.status === "revoked") return null;
		const read = async (id?: Id<"secrets">) => {
			const s = id ? await ctx.db.get(id) : null;
			return s && s.siteId === siteId ? { ciphertext: s.ciphertext, aad: aadFor(siteId, s.ownerKind, s.ownerId) } : null;
		};
		return { connectionId: c._id, status: c.status, propertyUri: c.propertyUri ?? null, expiresAt: c.accessTokenExpiresAt ?? 0, access: await read(c.accessTokenSecretId), refresh: await read(c.refreshTokenSecretId), lastImportedDate: c.lastImportedDate ?? null };
	},
});

export const markState = internalMutation({
	args: { siteId: v.id("sites"), status: v.union(v.literal("connected"), v.literal("reconnect_required"), v.literal("revoked")), code: v.optional(v.string()) },
	handler: async (ctx, { siteId, status, code }) => {
		const c = await connectionOf(ctx, siteId);
		const site = await ctx.db.get(siteId);
		if (!c || !site) return;
		if (c.status === status) return;
		await ctx.db.patch(c._id, { status, ...(code ? { lastErrorCode: code } : {}), updatedAt: Date.now() });
		await ctx.db.patch(siteId, { searchConsole: status === "connected" ? "connected" : status === "revoked" ? "missing" : "expired" });
		if (status === "reconnect_required") await notify(ctx, { workspaceId: site.workspaceId, siteId, userIds: await siteAudienceWith(ctx, site, "searchConsole.connect"), tone: "block", title: "Search Console access expired", body: "Reconnect it in Settings · until then rankings show as data gaps.", href: "/settings", dedupeKey: `gsc-expired:${siteId}` });
	},
});

/** A valid access token for one site (refreshed when within 2 minutes of expiry). Null + reconnect_required on failure. */
export async function accessToken(ctx: Pick<ActionCtx, "runQuery" | "runMutation">, siteId: Id<"sites">): Promise<{ token: string; propertyUri: string | null; lastImportedDate: string | null } | null> {
	const t = await ctx.runQuery(internal.gsc.tokenInput, { siteId });
	if (!t || !t.access) return null;
	if (t.expiresAt - Date.now() > 120_000) return { token: await open(t.access.ciphertext, t.access.aad), propertyUri: t.propertyUri, lastImportedDate: t.lastImportedDate };
	if (!t.refresh) {
		await ctx.runMutation(internal.gsc.markState, { siteId, status: "reconnect_required", code: "no_refresh_token" });
		return null;
	}
	const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token", refresh_token: await open(t.refresh.ciphertext, t.refresh.aad) }) });
	if (!res.ok) {
		await ctx.runMutation(internal.gsc.markState, { siteId, status: "reconnect_required", code: `refresh_${res.status}` });
		return null;
	}
	const body = (await res.json()) as { access_token: string; expires_in: number; scope?: string };
	await ctx.runMutation(internal.gsc.refreshed, { siteId, accessToken: body.access_token, expiresIn: body.expires_in });
	return { token: body.access_token, propertyUri: t.propertyUri, lastImportedDate: t.lastImportedDate };
}

export const refreshed = internalMutation({
	args: { siteId: v.id("sites"), accessToken: v.string(), expiresIn: v.number() },
	handler: async (ctx, { siteId, accessToken: tok, expiresIn }) => {
		const c = await connectionOf(ctx, siteId);
		const site = await ctx.db.get(siteId);
		if (!c || !site) return;
		const accessTokenSecretId = await putSecret(ctx, site, "oauth-access", c._id, tok, c.accessTokenSecretId);
		await ctx.db.patch(c._id, { accessTokenSecretId, accessTokenExpiresAt: Date.now() + expiresIn * 1000, updatedAt: Date.now() });
	},
});

// ─── Property ────────────────────────────────────────────────────────────────

export const listProperties = siteAction({
	permission: "searchConsole.connect",
	args: {},
	handler: async (ctx, { siteId }): Promise<{ ok: true; properties: { uri: string; permission: string }[]; suggested: string | null } | { ok: false; reason: string }> => {
		const t = await accessToken(ctx, siteId);
		if (!t) return { ok: false, reason: "Search Console isn't connected (or access expired) · connect it again" };
		const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${t.token}` } });
		if (!res.ok) return { ok: false, reason: `Google answered ${res.status} listing properties` };
		const body = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
		const properties = (body.siteEntry ?? []).filter((e) => e.permissionLevel !== "siteUnverifiedUser").map((e) => ({ uri: e.siteUrl, permission: e.permissionLevel }));
		const domain = await ctx.runQuery(internal.gsc.domainOf, { siteId });
		const suggested = properties.find((p) => p.uri === `sc-domain:${domain}`)?.uri ?? properties.find((p) => p.uri.includes(domain))?.uri ?? null;
		return { ok: true, properties, suggested };
	},
});

export const domainOf = internalQuery({ args: { siteId: v.id("sites") }, handler: async (ctx, { siteId }) => (await ctx.db.get(siteId))?.domain.replace(/^www\./, "") ?? "" });

export const setProperty = siteMutation({
	permission: "searchConsole.connect",
	args: { propertyUri: v.string() },
	handler: async (ctx, { siteId, propertyUri }): Promise<TResult> => {
		const c = await connectionOf(ctx, siteId);
		if (!c || c.status !== "connected") return { ok: false, reason: "Connect Search Console first" };
		if (!/^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+)$/i.test(propertyUri)) return { ok: false, reason: "That isn't a Search Console property" };
		await ctx.db.patch(c._id, { propertyUri, updatedAt: Date.now() });
		await audit(ctx, { workspaceId: ctx.access.site.workspaceId, siteId, actor: ctx.access.user, action: "picked Search Console property", target: propertyUri });
		await ctx.scheduler.runAfter(0, internal.gsc.importSite, { siteId });
		return { ok: true };
	},
});

export const disconnect = siteAction({
	permission: "searchConsole.connect",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		const t = await ctx.runQuery(internal.gsc.tokenInput, { siteId });
		if (t?.refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await open(t.refresh.ciphertext, t.refresh.aad))}`, { method: "POST" }).catch(() => undefined);
		await ctx.runMutation(internal.gsc.dropConnection, { siteId });
		return { ok: true };
	},
});

export const dropConnection = internalMutation({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const c = await connectionOf(ctx, siteId);
		if (!c) return;
		for (const id of [c.accessTokenSecretId, c.refreshTokenSecretId]) if (id) await ctx.db.delete(id);
		await ctx.db.patch(c._id, { status: "revoked", accessTokenSecretId: undefined, refreshTokenSecretId: undefined, updatedAt: Date.now() });
		await ctx.db.patch(siteId, { searchConsole: "missing" });
	},
});

// ─── Import (daily) ──────────────────────────────────────────────────────────

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const normQuery = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?:]/g, "");

export const importSite = internalAction({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		const t = await accessToken(ctx, siteId);
		if (!t || !t.propertyUri) return;
		const end = iso(Date.now() - LAG_DAYS * DAY);
		const start = t.lastImportedDate ? iso(Date.parse(t.lastImportedDate) + DAY) : iso(Date.now() - (LAG_DAYS + 90) * DAY);
		if (start > end) return;
		const rows: { query: string; page: string; date: string; clicks: number; impressions: number; position: number }[] = [];
		for (let startRow = 0; startRow < 250_000; startRow += 25_000) {
			const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(t.propertyUri)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query", "page", "date"], rowLimit: 25_000, startRow, dataState: "final" }) });
			if (res.status === 401 || res.status === 403) {
				await ctx.runMutation(internal.gsc.markState, { siteId, status: "reconnect_required", code: `import_${res.status}` });
				return; // never write zeros for a failed import
			}
			if (!res.ok) throw new Error(`Search Analytics ${res.status}`);
			const body = (await res.json()) as { rows?: { keys: [string, string, string]; clicks: number; impressions: number; position: number }[] };
			for (const r of body.rows ?? []) rows.push({ query: r.keys[0], page: r.keys[1], date: r.keys[2], clicks: r.clicks, impressions: r.impressions, position: r.position });
			if ((body.rows?.length ?? 0) < 25_000) break;
		}
		for (let i = 0; i < rows.length; i += 2000) await ctx.runMutation(internal.gsc.writeRows, { siteId, rows: rows.slice(i, i + 2000) });
		await ctx.runMutation(internal.gsc.finishImport, { siteId, lastImportedDate: end, rowCount: rows.length });
	},
});

const vRow = v.object({ query: v.string(), page: v.string(), date: v.string(), clicks: v.number(), impressions: v.number(), position: v.number() });

/** Rows → positionHistory, one per (keyword, date, gsc); unknown queries are not auto-added (the swarm decides). */
export const writeRows = internalMutation({
	args: { siteId: v.id("sites"), rows: v.array(vRow) },
	handler: async (ctx, { siteId, rows }) => {
		const site = (await ctx.db.get(siteId))!;
		const host = site.domain.replace(/^www\./, "");
		const ids = new Map<string, Id<"keywords"> | null>();
		const byKey = new Map<string, { keywordId: Id<"keywords">; date: string; clicks: number; impressions: number; posImp: number; page: string; pageImp: number }>();
		for (const r of rows) {
			const term = normQuery(r.query);
			if (!ids.has(term)) ids.set(term, (await ctx.db.query("keywords").withIndex("by_site_term", (q) => q.eq("siteId", siteId).eq("termNormalized", term)).unique())?._id ?? null);
			const keywordId = ids.get(term);
			if (!keywordId) continue;
			const k = `${keywordId}:${r.date}`;
			const path = (() => {
				try {
					const u = new URL(r.page);
					return u.hostname.replace(/^www\./, "") === host ? u.pathname : r.page;
				} catch {
					return r.page;
				}
			})();
			const cur = byKey.get(k) ?? { keywordId, date: r.date, clicks: 0, impressions: 0, posImp: 0, page: path, pageImp: 0 };
			cur.clicks += r.clicks;
			cur.impressions += r.impressions;
			cur.posImp += r.position * r.impressions;
			if (r.impressions > cur.pageImp) {
				cur.page = path;
				cur.pageImp = r.impressions;
			}
			byKey.set(k, cur);
		}
		for (const x of byKey.values()) {
			const existing = (await ctx.db.query("positionHistory").withIndex("by_keyword_date", (q) => q.eq("keywordId", x.keywordId).eq("date", x.date)).take(5)).find((p) => p.source === "gsc");
			const row = { siteId, keywordId: x.keywordId, date: x.date, position: x.impressions ? Math.round((x.posImp / x.impressions) * 10) / 10 : null, impressions: x.impressions, clicks: x.clicks, page: x.page, source: "gsc" as const };
			if (existing) await ctx.db.patch(existing._id, row);
			else await ctx.db.insert("positionHistory", row);
		}
	},
});

/** 28-day keyword roll-ups + the weekly impressions roll-up, then the import marker. */
export const finishImport = internalMutation({
	args: { siteId: v.id("sites"), lastImportedDate: v.string(), rowCount: v.number() },
	handler: async (ctx, { siteId, lastImportedDate, rowCount }) => {
		const site = (await ctx.db.get(siteId))!;
		const since = iso(Date.parse(lastImportedDate) - 27 * DAY);
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(5000);
		const weekly = new Map<string, number>();
		for (const k of keywords) {
			const hist = (await ctx.db.query("positionHistory").withIndex("by_keyword_date", (q) => q.eq("keywordId", k._id).gte("date", iso(Date.parse(lastImportedDate) - 56 * DAY))).take(200)).filter((h) => h.source === "gsc");
			for (const h of hist) {
				const wk = isoWeekKey(h.date);
				weekly.set(wk, (weekly.get(wk) ?? 0) + h.impressions);
			}
			const recent = hist.filter((h) => h.date >= since);
			if (!recent.length) continue;
			const impressions = recent.reduce((n, h) => n + h.impressions, 0);
			const position = impressions ? Math.round((recent.reduce((n, h) => n + (h.position ?? 0) * h.impressions, 0) / impressions) * 10) / 10 : null;
			const pages = new Map<string, number>();
			for (const h of recent) if (h.page) pages.set(h.page, (pages.get(h.page) ?? 0) + h.impressions);
			const top = [...pages.entries()].sort((a, b) => b[1] - a[1])[0];
			const trend = [...new Set(hist.map((h) => isoWeekKey(h.date)))].sort().slice(-8).map((w) => {
				const ws = hist.filter((h) => isoWeekKey(h.date) === w && h.position !== null);
				const imp = ws.reduce((n, h) => n + h.impressions, 0);
				return imp ? Math.round((ws.reduce((n, h) => n + (h.position ?? 0) * h.impressions, 0) / imp) * 10) / 10 : null;
			});
			const known = trend.filter((x): x is number => x !== null);
			const decaying = known.length >= 3 && known[known.length - 1]! - known[known.length - 3]! >= 3; // 3+ places worse over 2 weeks
			await ctx.db.patch(k._id, { impressions, position, rankingUrl: top?.[0] ?? null, rankingPages: pages.size, positionTrend: known, decaying });
		}
		for (const [wk, impressions] of weekly) {
			const row = (await ctx.db.query("trafficWeekly").withIndex("by_site_week", (q) => q.eq("siteId", siteId).eq("isoWeek", wk)).take(1))[0];
			// GSC has clicks, not sessions: sessions stay null (a labelled gap) until analytics is connected.
			if (row) await ctx.db.patch(row._id, { impressions });
			else await ctx.db.insert("trafficWeekly", { siteId, isoWeek: wk, sessions: null, impressions, projected: 0 });
		}
		const c = await connectionOf(ctx, siteId);
		if (c) await ctx.db.patch(c._id, { lastImportAt: Date.now(), lastImportedDate, updatedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: { system: "Search Console" }, action: "imported Search Console data", target: site.domain, detail: `${rowCount} rows · through ${lastImportedDate}` });
	},
});

export function isoWeekKey(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	const day = (d.getUTCDay() + 6) % 7;
	d.setUTCDate(d.getUTCDate() - day + 3);
	const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
	return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export const connectedSites = internalQuery({
	args: {},
	handler: async (ctx) => (await ctx.db.query("oauthConnections").take(500)).filter((c) => c.status === "connected" && c.propertyUri).map((c) => c.siteId),
});

/** Daily cron: import every connected site, one after another (Google's per-project quota). */
export const importAll = internalAction({
	args: {},
	handler: async (ctx) => {
		for (const siteId of await ctx.runQuery(internal.gsc.connectedSites, {})) {
			try {
				await ctx.runAction(internal.gsc.importSite, { siteId });
			} catch (e) {
				console.log(`gsc import ${siteId}: ${(e as Error).message}`);
			}
		}
	},
});
