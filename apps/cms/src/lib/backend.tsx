"use client";
// Real backend wiring (handoff 00 step 2, handoff 01 step 11 groundwork): Clerk sign-in + Convex client with the Clerk
// JWT template "convex". It is switched on only when both public keys are present AND NEXT_PUBLIC_CMS_BACKEND=convex,
// so the prototype keeps running on demo data (localStorage store) until the store adapter lands.
//
// The store (src/lib/store.tsx) is untouched: pages still read demo data. What runs on Convex today is identity:
// sign-in, the user row (users.ensure) and the active workspace (workspace.current) — see <BackendStatus>.

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useEffect, useRef, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** True when the app should talk to Clerk + Convex instead of the demo sign-in. */
export const BACKEND_ENABLED = process.env.NEXT_PUBLIC_CMS_BACKEND === "convex" && Boolean(CONVEX_URL && CLERK_KEY);

let client: ConvexReactClient | null = null;
function convexClient(): ConvexReactClient {
	client ??= new ConvexReactClient(CONVEX_URL!);
	return client;
}

/** Creates the caller's user row the first time they're authenticated (the Clerk webhook can lag behind). */
function EnsureUser() {
	const { isAuthenticated } = useConvexAuth();
	const ensure = useMutation(api.users.ensure);
	const done = useRef(false);
	useEffect(() => {
		if (!isAuthenticated || done.current) return;
		done.current = true;
		ensure({}).catch(() => {
			done.current = false; // retry on the next auth change
		});
	}, [isAuthenticated, ensure]);
	return null;
}

export function BackendProvider({ children }: { children: ReactNode }) {
	if (!BACKEND_ENABLED) return <>{children}</>;
	return (
		<ClerkProvider publishableKey={CLERK_KEY} signInUrl="/sign-in">
			<ConvexProviderWithClerk client={convexClient()} useAuth={useAuth}>
				<EnsureUser />
				{children}
			</ConvexProviderWithClerk>
		</ClerkProvider>
	);
}
