"use client";
// Real sign-in (Clerk) shown when the backend is enabled (src/lib/backend.tsx). Signed out → Clerk's sign-in.
// Signed in without an active organization → pick or create one (the workspace). Signed in with one → what Convex
// knows about this person and workspace. The demo picker below it still drives the pages until the store adapter lands.

import { OrganizationList, OrganizationSwitcher, SignIn as ClerkSignIn, useAuth, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { Card, Callout, Chip, Skeleton, WORKSPACE_ROLE_LABEL } from "@/ds";
import { api } from "../../../convex/_generated/api";

function WorkspaceStatus() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const workspace = useQuery(api.workspace.current, isAuthenticated ? {} : "skip");
	const sites = useQuery(api.sites.list, isAuthenticated ? {} : "skip");

	if (isLoading || (isAuthenticated && workspace === undefined)) return <Skeleton className="h-16 w-full" />;
	if (!isAuthenticated) {
		return (
			<Callout tone="block" icon="Warning" title="Convex didn't accept the sign-in">
				Check that the Clerk JWT template is named "convex" and CLERK_JWT_ISSUER_DOMAIN is set on the deployment.
			</Callout>
		);
	}
	return (
		<div className="flex flex-col gap-2 rounded-md bg-sunken p-3 text-md">
			<div className="flex items-center justify-between gap-2">
				<span className="font-display font-medium text-ink">{workspace?.name}</span>
				{workspace && <Chip size="sm">{WORKSPACE_ROLE_LABEL[workspace.role]}</Chip>}
			</div>
			<span className="text-xs text-ink-3">
				{sites === undefined ? "Loading sites…" : sites.length === 0 ? "No sites yet in this workspace." : `${sites.length} site${sites.length === 1 ? "" : "s"} you can open`}
			</span>
		</div>
	);
}

export function BackendPanel() {
	const { isLoaded, isSignedIn, orgId } = useAuth();

	if (!isLoaded) return <Skeleton className="h-[420px] w-full max-w-[440px]" />;

	if (!isSignedIn) {
		return (
			<div className="flex w-full max-w-[440px] justify-center">
				{/* withSignUp: one combined flow, so a new person can create an account without a separate /sign-up route. */}
				<ClerkSignIn routing="hash" withSignUp />
			</div>
		);
	}

	return (
		<Card padding="lg" className="flex w-full max-w-[440px] flex-col gap-4">
			<div className="flex items-center justify-between gap-3">
				<h2 className="font-display text-lg font-medium text-ink">Signed in</h2>
				<UserButton />
			</div>
			{orgId ? (
				<>
					<OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/sign-in" afterCreateOrganizationUrl="/sign-in" />
					<WorkspaceStatus />
				</>
			) : (
				<>
					<p className="text-md text-ink-3">Choose or create your agency workspace.</p>
					<OrganizationList hidePersonal afterSelectOrganizationUrl="/sign-in" afterCreateOrganizationUrl="/sign-in" />
				</>
			)}
		</Card>
	);
}
