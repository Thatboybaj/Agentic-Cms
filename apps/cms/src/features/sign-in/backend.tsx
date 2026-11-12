"use client";
// Real sign-in (Clerk) shown when the backend is enabled (src/lib/backend.tsx). Signed out → Clerk's sign-in.
// Signed in without an active organization → pick or create one (the workspace). Signed in with one → what Convex
// knows about this person and workspace, and "Continue to sites" (the shell bridges into the demo data for the
// site pages that aren't on Convex yet). The demo picker below stays for demo-only use.

import { OrganizationSwitcher, SignIn as ClerkSignIn, SignUp as ClerkSignUp, useAuth, useOrganizationList, UserButton } from "@clerk/nextjs";
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
			{sites && workspace && workspace.role !== "member" && (sites.length === 0 ? <SeedDemo what="sites" /> : <SeedDemo what="posts" />)}
		</div>
	);
}

/**
 * Dev deployments only (CMS_DEV_TOOLS=1). "sites": the prototype's demo sites. "posts": their content plans (pillars,
 * keywords, posts, gate checks, image slots); sites that already have a plan are skipped, so pressing it twice is safe.
 */
function SeedDemo({ what }: { what: "sites" | "posts" }) {
	const devTools = useQuery(api.devSeed.enabled, {});
	const seedSites = useMutation(api.devSeed.seedSites);
	const seedContent = useMutation(api.devSeed.seedContent);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState<string | null>(null);
	if (!devTools) return null;
	const seed = async () => {
		if (what === "sites") return void (await seedSites({}));
		const r = await seedContent({});
		setDone(r.filled.length ? `Loaded posts for ${r.filled.length} site${r.filled.length === 1 ? "" : "s"}` : "Every site already has a plan");
	};
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
						await seed();
					} catch (e) {
						setError(e instanceof ConvexError ? String((e.data as { reason?: string }).reason ?? `Couldn't load the demo ${what}`) : `Couldn't load the demo ${what}`);
					} finally {
						setBusy(false);
					}
				}}
			>
				Load demo {what} (dev only)
			</Button>
			{error && <span className="text-xs text-block">{error}</span>}
			{done && <span className="text-xs text-ink-3">{done}</span>}
		</div>
	);
}

/** Who to ask for access, shown to people without an invitation. Optional: NEXT_PUBLIC_CMS_ADMIN_CONTACT (an email). */
const ADMIN_CONTACT = process.env.NEXT_PUBLIC_CMS_ADMIN_CONTACT?.trim() || null;

function AskAdministrator({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<Callout tone="info" icon="LockSimple" title={title}>
			{children}
			{ADMIN_CONTACT ? (
				<>
					{" "}
					Contact your administrator at{" "}
					<a className="underline" href={`mailto:${ADMIN_CONTACT}`}>
						{ADMIN_CONTACT}
					</a>
					.
				</>
			) : (
				" Ask your administrator to send you an invitation."
			)}
		</Callout>
	);
}

/** An invitation link from Clerk (invites.create → email) lands here with a one-time ticket for a new account. */
function invitedToSignUp(): boolean {
	if (typeof window === "undefined") return false;
	const q = new URLSearchParams(window.location.search);
	return !!q.get("__clerk_ticket") && q.get("__clerk_status") === "sign_up";
}

// Hides Clerk's "Don't have an account? Sign up" footer: accounts come from invitations only.
const NO_SIGN_UP_LINK = { elements: { footerAction: { display: "none" } } } as const;

/**
 * Signed in, but not part of any workspace yet. Memberships and pending invitations are offered; there's no way to
 * create a workspace here (a workspace comes from the agency's own Clerk organization, set up by an administrator).
 */
function NoWorkspace() {
	const { isLoaded, setActive, userMemberships, userInvitations } = useOrganizationList({ userMemberships: true, userInvitations: true });
	const [busy, setBusy] = useState<string | null>(null);
	if (!isLoaded || userMemberships.isLoading || userInvitations.isLoading) return <Skeleton className="h-24 w-full" />;
	const memberships = userMemberships.data ?? [];
	const invitations = (userInvitations.data ?? []).filter((i) => i.status === "pending");
	if (!memberships.length && !invitations.length)
		return (
			<AskAdministrator title="Your account isn't part of a workspace.">
				Access to this CMS is by invitation only, and new workspaces can't be created here.
			</AskAdministrator>
		);
	return (
		<div className="flex flex-col gap-2">
			<p className="text-md text-ink-3">Choose your workspace.</p>
			{memberships.map((m) => (
				<Button key={m.id} variant="secondary" fullWidth loading={busy === m.id} onClick={async () => (setBusy(m.id), await setActive({ organization: m.organization.id }), setBusy(null))}>
					{m.organization.name}
				</Button>
			))}
			{invitations.map((i) => (
				<Button
					key={i.id}
					variant="primary"
					fullWidth
					loading={busy === i.id}
					onClick={async () => {
						setBusy(i.id);
						const accepted = await i.accept();
						await setActive({ organization: accepted.publicOrganizationData.id });
						setBusy(null);
					}}
				>
					Accept invitation · {i.publicOrganizationData.name}
				</Button>
			))}
		</div>
	);
}

export function BackendPanel() {
	const { isLoaded, isSignedIn, orgId } = useAuth();

	if (!isLoaded) return <Skeleton className="h-[420px] w-full max-w-[440px]" />;

	if (!isSignedIn) {
		// Accounts come from invitations only. An invitation link carries a ticket and gets the sign-up form; anyone
		// else gets sign-in. (Clerk's own "Restricted" sign-up mode enforces the same on the server.)
		if (invitedToSignUp())
			return (
				<div className="flex w-full max-w-[440px] justify-center">
					<ClerkSignUp routing="hash" />
				</div>
			);
		return (
			<div className="flex w-full max-w-[440px] flex-col items-center gap-3">
				<ClerkSignIn routing="hash" appearance={NO_SIGN_UP_LINK} />
				<div className="w-full">
					<AskAdministrator title="No account yet?">Accounts are created by invitation only.</AskAdministrator>
				</div>
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
				<NoWorkspace />
			)}
		</Card>
	);
}
