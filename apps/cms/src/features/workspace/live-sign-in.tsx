"use client";
// Shown on pages that read Convex (Sites, Team) when the real backend is on but nobody is signed in with Clerk —
// e.g. someone entered through the demo picker. Without it those pages would say "no access", which isn't true.

import { Button, Card, EmptyState, PageHeader } from "@/ds";
import { WORKSPACE_ROUTES } from "@/lib/routes";

export function LiveSignInPrompt({ what }: { what: string }) {
	return (
		<>
			<PageHeader title="Sign in to see live data" subtitle="This page reads the real backend" />
			<Card className="flex flex-1 items-center justify-center">
				<EmptyState
					icon="LockSimple"
					title={`Sign in with your account to see ${what}`}
					body="The demo people don't have an account on the backend. Use the Continue to Agentic CMS box on the sign-in page."
					action={
						<Button variant="secondary" icon="SignIn" href={WORKSPACE_ROUTES.signIn}>
							Go to sign-in
						</Button>
					}
				/>
			</Card>
		</>
	);
}
