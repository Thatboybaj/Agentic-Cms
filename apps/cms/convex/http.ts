// HTTP routes (api-map §11). Each webhook resolves the tenant from the provider payload, never from the query string (I7).
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { verifyState, verifyWebhook } from "./lib/github";
import { verifyPolar } from "./billing";

const http = httpRouter();

/** Clerk → Convex sync. Signed by svix with CLERK_WEBHOOK_SIGNING_SECRET; unsigned or tampered bodies are refused. */
export const clerkWebhook = httpAction(async (ctx, req) => {
	const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
	if (!secret) return new Response("Webhook not configured", { status: 500 });
	const id = req.headers.get("svix-id");
	const timestamp = req.headers.get("svix-timestamp");
	const signature = req.headers.get("svix-signature");
	if (!id || !timestamp || !signature) return new Response("Missing signature", { status: 400 });
	const body = await req.text();
	let event: { type: string; data: unknown };
	try {
		// svix ≥2.10 verify() throws on a bad signature and returns nothing; parse only after it passes.
		new Webhook(secret).verify(body, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature });
		event = JSON.parse(body) as typeof event;
	} catch {
		return new Response("Invalid signature", { status: 400 });
	}
	const result = await ctx.runMutation(internal.clerkSync.apply, { deliveryId: id, type: event.type, data: event.data });
	return Response.json(result);
});

http.route({ path: "/clerk/webhook", method: "POST", handler: clerkWebhook });

/**
 * Template bundle files for the live preview: /tpl/<manifestId>/<path>. These are the site's own public CSS, images
 * and fonts; HTML is served as text/plain so a bundle page can never run here (the preview renders the sample itself,
 * in a sandboxed iframe without scripts).
 */
export const templateFile = httpAction(async (ctx, req) => {
	const rest = new URL(req.url).pathname.replace(/^\/tpl\//, "");
	const slash = rest.indexOf("/");
	if (slash < 1) return new Response("Not found", { status: 404 });
	const manifestId = rest.slice(0, slash);
	const path = rest
		.slice(slash + 1)
		.split("/")
		.map((p) => decodeURIComponent(p))
		.join("/");
	if (!path || path.includes("..")) return new Response("Not found", { status: 404 });
	const f = await ctx.runQuery(internal.templates.fileFor, { manifestId, path });
	if (!f) return new Response("Not found", { status: 404 });
	const blob = await ctx.storage.get(f.storageId);
	if (!blob) return new Response("Not found", { status: 404 });
	const type = f.contentType.startsWith("text/html") ? "text/plain; charset=utf-8" : f.contentType;
	return new Response(blob, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" } });
});

http.route({ pathPrefix: "/tpl/", method: "GET", handler: templateFile });

/** GitHub App Setup URL: verifies the signed state, records the installation for that site, sends the developer back. */
export const githubSetup = httpAction(async (ctx, req) => {
	const url = new URL(req.url);
	const front = process.env.FRONTEND_URL ?? "";
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	const installationId = url.searchParams.get("installation_id");
	const state = url.searchParams.get("state");
	if (!secret || !installationId || !/^\d+$/.test(installationId) || !state) return new Response("Missing or invalid installation", { status: 400 });
	const s = await verifyState(secret, state);
	if (!s) return new Response("This install link expired or was tampered with · start again from the CMS", { status: 400 });
	const r = await ctx.runMutation(internal.gitHooks.recordInstall, { siteId: s.siteId as Id<"sites">, userId: s.userId as Id<"users">, installationId });
	if (!r) return new Response("Site not found", { status: 404 });
	return Response.redirect(`${front}/s/${encodeURIComponent(r.slug)}/onboarding?installation=${installationId}`, 302);
});

/** GitHub webhooks: HMAC over the raw body; replays deduped by delivery id; tenant from installation + repo only. */
export const githubWebhook = httpAction(async (ctx, req) => {
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	if (!secret) return new Response("Webhook not configured", { status: 500 });
	const body = await req.text();
	if (!(await verifyWebhook(secret, body, req.headers.get("x-hub-signature-256")))) return new Response("Invalid signature", { status: 401 });
	const deliveryId = req.headers.get("x-github-delivery");
	const event = req.headers.get("x-github-event");
	if (!deliveryId || !event) return new Response("Missing delivery headers", { status: 400 });
	if (event === "ping") return Response.json({ ok: true });
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		return new Response("Bad JSON", { status: 400 });
	}
	const r = await ctx.runMutation(internal.gitHooks.onEvent, { deliveryId, event, payload });
	return Response.json(r);
});

/** Google OAuth callback (Search Console): single-use state, PKCE exchange, scope check, sealed tokens. */
export const googleCallback = httpAction(async (ctx, req) => {
	const url = new URL(req.url);
	const front = process.env.FRONTEND_URL ?? "";
	const state = url.searchParams.get("state");
	const code = url.searchParams.get("code");
	if (!state) return new Response("Missing state", { status: 400 });
	const s = await ctx.runMutation(internal.gsc.consumeState, { state });
	if (!s) return new Response("This sign-in link expired or was already used · start again from the CMS", { status: 400 });
	if (!code) return Response.redirect(`${front}${s.redirectTo}${s.redirectTo.includes("?") ? "&" : "?"}gsc=denied`, 302);
	const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: `${process.env.CONVEX_SITE_URL}/oauth/google/callback`, grant_type: "authorization_code", code_verifier: s.verifier }) });
	if (!res.ok) return Response.redirect(`${front}${s.redirectTo}${s.redirectTo.includes("?") ? "&" : "?"}gsc=failed`, 302);
	const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string };
	let email: string | undefined;
	try {
		email = t.id_token ? (JSON.parse(atob(t.id_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { email?: string }).email : undefined;
	} catch {
		email = undefined;
	}
	const r = await ctx.runMutation(internal.gsc.storeTokens, { siteId: s.siteId, userId: s.userId, accessToken: t.access_token, ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}), expiresIn: t.expires_in, scopes: (t.scope ?? "").split(" ").filter(Boolean), ...(email ? { email } : {}) });
	return Response.redirect(`${front}${s.redirectTo}${s.redirectTo.includes("?") ? "&" : "?"}gsc=${r.ok ? "connected" : "missing-scope"}`, 302);
});

/** Polar subscription webhooks (Standard Webhooks signature; replays deduped). */
export const polarWebhook = httpAction(async (ctx, req) => {
	const secret = process.env.POLAR_WEBHOOK_SECRET;
	if (!secret) return new Response("Webhook not configured", { status: 500 });
	const body = await req.text();
	const id = req.headers.get("webhook-id");
	if (!(await verifyPolar(secret, { id, timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") }, body))) return new Response("Invalid signature", { status: 403 });
	let event: { type?: string; data?: unknown };
	try {
		event = JSON.parse(body) as typeof event;
	} catch {
		return new Response("Bad JSON", { status: 400 });
	}
	const r = await ctx.runMutation(internal.billing.onPolarEvent, { deliveryId: id!, type: event.type ?? "", data: event.data ?? null });
	return Response.json(r);
});

http.route({ path: "/polar/webhook", method: "POST", handler: polarWebhook });
http.route({ path: "/oauth/google/callback", method: "GET", handler: googleCallback });
http.route({ path: "/github/setup", method: "GET", handler: githubSetup });
http.route({ path: "/github/webhook", method: "POST", handler: githubWebhook });

export default http;
