"use client";
// Real sign-in (Clerk) shown when the backend is enabled (src/lib/backend.tsx). Signed out → Clerk's sign-in.
// Signed in without an active organization → pick or create one (the workspace). Signed in with one → what Convex
// knows about this person and workspace, and "Continue to sites" (the shell bridges into the demo data for the
// site pages that aren't on Convex yet). The demo picker below stays for demo-only use.

import { OrganizationList, OrganizationSwitcher, SignIn as ClerkSignIn, useAuth, UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button, Card, Callout, Chip, Icon, Skeleton, WORKSPACE_ROLE_LABEL } from "@/ds";
import { ROLE_LABEL } from "@/lib/logic";
import type { TRole } from "@/lib/types";
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
			{sites && sites.length > 0 && (
				<ul className="flex flex-col gap-1" aria-label="Sites in Convex">
					{sites.map((s) => (
						<li key={s._id} className="flex items-center justify-between gap-2 text-xs">
							<span className="truncate text-ink">
								{s.name} <span className="text-ink-3">· {s.domain}</span>
							</span>
							<Chip size="sm">{ROLE_LABEL[s.role as TRole] ?? s.role}</Chip>
						</li>
					))}
				</ul>
			)}
			{sites && sites.length === 0 && workspace && workspace.role !== "member" && <SeedDemoSites />}
		</div>
	);
}

/** Dev deployments only (CMS_DEV_TOOLS=1): loads the prototype's demo sites into this workspace. */
function SeedDemoSites() {
	const devTools = useQuery(api.devSeed.enabled, {});
	const seed = useMutation(api.devSeed.seedSites);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	if (!devTools) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<Button
				variant="secondary"
				size="sm"
				loading={busy}
				onClick={async () => {
					setBusy(true);
					setError(null);
					try {
						await seed({});
					} catch (e) {
						setError(e instanceof ConvexError ? String((e.data as { reason?: string }).reason ?? "Couldn't load the demo sites") : "Couldn't load the demo sites");
					} finally {
						setBusy(false);
					}
				}}
			>
				Load demo sites (dev only)
			</Button>
			{error && <span className="text-xs text-block">{error}</span>}
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
					<Button variant="primary" href="/sites" fullWidth trailing={<Icon name="ArrowRight" size={16} className="rtl:-scale-x-100" />}>
						Continue to sites
					</Button>
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
