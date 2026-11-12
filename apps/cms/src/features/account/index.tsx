"use client";
// /account — who I am, the sites I can open with my role on each, sign out.

import { useRouter } from "next/navigation";
import { Avatar, Button, Card, Chip, EmptyState, IconButton, KeyValue, PageHeader, ROLE_LABEL, Section, SiteAvatar, WORKSPACE_ROLE_LABEL } from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { PageLoading } from "@/features/shared/page-loading";
import { PAGES_ON_CONVEX, usePageSiteRows, usePageWorkspaceActions, usePageWorkspaceView } from "@/features/workspace/data";
import { STATUS_LABEL, plural } from "@/features/workspace/labels";
import { sitePath, WORKSPACE_ROUTES } from "@/lib/routes";

export function Account() {
	const router = useRouter();
	const { workspace, me, myWorkspaceRole, loading } = usePageWorkspaceView();
	const { signOut } = usePageWorkspaceActions();
	const rows = usePageSiteRows();

	const out = () => {
		signOut();
		// Live: Clerk signs out and redirects itself; the demo store just clears the person.
		if (!PAGES_ON_CONVEX) router.push(WORKSPACE_ROUTES.signIn);
	};
	if (loading) return <PageLoading rows={3} />;

	return (
		<>
			<TopBarCta>
				<Button variant="primary" icon="SignOut" onClick={out}>
					Sign out
				</Button>
			</TopBarCta>
			<PageHeader title="Account" subtitle={`Your profile in ${workspace.name}`} />
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
				<Card className="flex flex-col gap-4 self-start">
					<div className="flex items-center gap-3">
						<Avatar name={me.name} initials={me.initials} size={44} />
						<div className="flex min-w-0 flex-col">
							<h2 className="truncate font-display text-xl leading-snug text-ink">{me.name}</h2>
							{me.title && <span className="truncate text-sm text-ink-3">{me.title}</span>}
						</div>
					</div>
					<KeyValue
						rows={[
							{ k: "Email", v: me.email },
							{ k: "Workspace", v: workspace.name },
							{
								k: "Workspace role",
								v: (
									<Chip size="sm" tone={myWorkspaceRole === "member" ? "neutral" : "ink"}>
										{WORKSPACE_ROLE_LABEL[myWorkspaceRole]}
									</Chip>
								),
							},
							{ k: "Sites", v: plural(rows.length, "site") },
						]}
					/>
					<p className="text-xs text-ink-3">{PAGES_ON_CONVEX ? "Name, email and photo come from your sign-in account (Clerk). Site roles are set by a workspace admin on the Team page." : "Demo data · with the backend connected, this shows your sign-in account."}</p>
				</Card>

				<Section title="My sites" count={rows.length}>
					<Card padding="sm">
						{rows.length === 0 ? (
							<EmptyState icon="Globe" title="No sites yet" body="A workspace admin adds you to client sites from the Team page." />
						) : (
							<ul className="flex flex-col" aria-label="My sites and roles">
								{rows.map((r) => (
									<li key={r.id} className="flex min-h-14 items-center gap-3 border-b border-line-2 px-2 py-2 last:border-b-0">
										<SiteAvatar name={r.name} hue={r.hue} size={32} />
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate font-display text-md font-medium text-ink">{r.name}</span>
											<span className="truncate text-xs text-ink-3">
												{r.domain} · {STATUS_LABEL[r.status]}
											</span>
										</span>
										<Chip size="sm">{r.role ? ROLE_LABEL[r.role] : "No access"}</Chip>
										<IconButton icon="ArrowUpRight" label={`Open ${r.name}`} variant="outline" size="sm" href={sitePath(r.slug)} />
									</li>
								))}
							</ul>
						)}
					</Card>
				</Section>
			</div>
		</>
	);
}
