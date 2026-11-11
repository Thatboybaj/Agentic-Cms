// HTTP routes (api-map §11). Each webhook resolves the tenant from the provider payload, never from the query string (I7).
import { httpRouter } from "convex/server";
import { Webhook } from "svix";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

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

export default http;
