// HTTP routes (api-map §11). Each webhook resolves the tenant from the provider payload, never from the query string (I7).
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { verifyState, verifyWebhook } from "./lib/github";

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

http.route({ path: "/github/setup", method: "GET", handler: githubSetup });
http.route({ path: "/github/webhook", method: "POST", handler: githubWebhook });

export default http;
