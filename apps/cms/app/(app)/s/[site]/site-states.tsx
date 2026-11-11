"use client";
// SiteGate: SiteScope for /s/[site]/… plus the DS states shown when the slug doesn't resolve to a site the
// current person can open (not found · no access · signed out). Rendered inside the app shell's content column.
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, type ReactNode } from "react";
import { Button, Callout, Card, EmptyState } from "@/ds";
import { SITE_ON_CONVEX } from "@/features/shared/site-source";
import { WORKSPACE_ROUTES } from "@/lib/routes";
import { SiteScope, useAdoptSite, type ISiteStatus } from "@/lib/store";
import type { TRole } from "@/lib/types";
import { api } from "../../../../convex/_generated/api";

/** A site created on the backend after the prototype seed (sites.add) joins the local store, so its pages open. */
function useAdoptLive(slug: string) {
	const { isAuthenticated } = useConvexAuth();
	const r = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const adopt = useAdoptSite();
	useEffect(() => {
		if (r?.status === "ok") adopt({ role: r.site.role as TRole, slug: r.site.slug, name: r.site.name, domain: r.site.domain, icon: r.site.icon, status: r.site.status, ...(typeof r.site.accent === "number" ? { accent: r.site.accent } : {}) });
	}, [r, adopt]);
}

/** SITE_ON_CONVEX is a build-time constant, so the hook order is stable. */
const useAdopt: (slug: string) => void = SITE_ON_CONVEX ? useAdoptLive : () => {};

export function SiteGate({ slug, children }: { slug: string; children: ReactNode }) {
	useAdopt(slug);
	return (
		<SiteScope slug={slug} fallback={(status) => <SiteStatusState status={status} />}>
			<RememberSite slug={slug} />
			{children}
		</SiteScope>
	);
}

/** Only mounted once the site resolved and the person has access: makes it the redirect target for old flat links (middleware.ts). */
function RememberSite({ slug }: { slug: string }) {
	useEffect(() => {
		document.cookie = `cms.lastSite=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
	}, [slug]);
	return null;
}

const backToSites = (variant: "primary" | "secondary") => (
	<Button variant={variant} icon="ArrowLeft" href={WORKSPACE_ROUTES.sites}>
		Back to all sites
	</Button>
);

function SiteStatusState({ status }: { status: ISiteStatus }) {
	if (status.status === "signed-out")
		return (
			<StateCard>
				<EmptyState
					icon="LockSimple"
					title="Sign in to open this site"
					body="Sites are shared per person, so we need to know who you are first."
					action={
						<Button variant="primary" icon="ArrowRight" href={WORKSPACE_ROUTES.signIn}>
							Sign in
						</Button>
					}
				/>
			</StateCard>
		);

	if (status.status === "no-access") {
		const name = status.site?.name ?? status.slug;
		return (
			<StateCard>
				<EmptyState
					icon="LockSimple"
					title={`You don't have access to ${name}`}
					body="Sites are shared per person. An admin can add you with the role you need."
					action={
						<>
							{backToSites("secondary")}
							<Button variant="primary" icon="Hand" onClick={() => status.requestAccess()} disabled={status.requested}>
								{status.requested ? "Access requested" : "Request access"}
							</Button>
						</>
					}
				/>
				{status.requested && (
					<Callout tone="human" icon="Hand" title="Waiting on a workspace admin">
						Your request is open. {name} appears in your sites once someone grants you a role.
					</Callout>
				)}
			</StateCard>
		);
	}

	return (
		<StateCard>
			<EmptyState icon="Globe" title="Site not found" body={`There's no site called “${status.slug}” in this workspace. It may have been renamed or removed.`} action={backToSites("primary")} />
		</StateCard>
	);
}

function StateCard({ children }: { children: ReactNode }) {
	return (
		<div role="alert" className="flex min-h-0 flex-1 items-start justify-center p-4">
			<Card variant="solid" padding="md" className="flex w-full max-w-xl flex-col gap-3">
				{children}
			</Card>
		</div>
	);
}
