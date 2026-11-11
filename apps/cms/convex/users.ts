// Users: lazy upsert on first authenticated call (Clerk webhooks can lag: handoff 01 step 4).
import { identityMutation, identityQuery } from "./lib/functions";

/** "Tolu Adeyemi" → "TA"; one word → first two letters. */
export function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable hue 0–359 from the Clerk user id, so the avatar colour never changes between sessions. */
export function hueOf(seed: string): number {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return h % 360;
}

/** Called by the client right after sign-in. Creates the user row if the webhook hasn't yet; never un-suspends. */
export const ensure = identityMutation({
	args: {},
	handler: async (ctx) => {
		const { identity } = ctx;
		const existing = await ctx.db
			.query("users")
			.withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
			.unique();
		if (existing) return existing._id;
		const name = identity.name ?? identity.email ?? "New user";
		return await ctx.db.insert("users", {
			clerkUserId: identity.subject,
			tokenIdentifier: identity.tokenIdentifier,
			name,
			initials: initialsOf(name),
			email: identity.email ?? "",
			avatarHue: hueOf(identity.subject),
			status: "active",
			lastSeenAt: Date.now(),
		});
	},
});

/** The caller's own user row, or null before `ensure` has run. */
export const me = identityQuery({
	args: {},
	handler: async (ctx) =>
		ctx.db
			.query("users")
			.withIndex("by_token", (q) => q.eq("tokenIdentifier", ctx.identity.tokenIdentifier))
			.unique(),
});
