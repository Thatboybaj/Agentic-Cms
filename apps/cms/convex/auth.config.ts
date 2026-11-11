// Clerk → Convex auth. The Clerk JWT template must be named exactly "convex" (handoff 00 step 3).
// CLERK_JWT_ISSUER_DOMAIN is set per deployment with `npx convex env set` (never committed).
export default {
	providers: [
		{
			domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
			applicationID: "convex",
		},
	],
};
