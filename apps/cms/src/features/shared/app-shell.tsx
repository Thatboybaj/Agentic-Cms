"use client";
// App shell, two levels (docs/multi-site-contract.md §1):
//   workspace routes (/sites /inbox /team /account) — rail: Sites · Inbox · Team; switcher reads "All sites"
//   site routes (/s/<slug>/…)                      — workspace mark → /sites, then the post lifecycle for that site
// The site comes from the URL, never from shared state, so two tabs can be on two sites as two people.

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
	AgentStatusPill,
	AppFrame,
	Avatar,
	Button,
	CommandPalette,
	CommandSearch,
	IconButton,
	IconRail,
	Menu,
	MobileTabBar,
	PresenceBadge,
	RailButton,
	ROLE_SHORT,
	SiteSwitcher,
	TopBar,
	ToastProvider,
	Tooltip,
	useToast,
	WORKSPACE_ROLE_LABEL,
	type ICommandGroup,
	type IRailItem,
	type TIconName,
	type TWash,
} from "@/ds";
import { AddSiteSheet } from "@/features/workspace/add-site-sheet";
import {
	PAGES_ON_CONVEX,
	useInboxRows,
	usePageSiteRows,
	usePageWorkspaceActions,
	usePageWorkspaceView,
	useShellToasts,
	useSitePresence,
	useSiteRows,
	useSiteSearch,
	useWorkspaceActions,
	useWorkspaceView,
	type ISiteRow,
} from "@/features/workspace/data";
import { CmsProvider } from "@/lib/store";
import { siteSlugFromPath, sitePath, stripSite, WORKSPACE_ROUTES } from "@/lib/routes";

// ---- Rail items ------------------------------------------------------------

/** Rail order = the post lifecycle (docs/uxer/02-information-architecture.md), built for one site. */
function siteRail(slug: string, row: ISiteRow | undefined, editorHref: string): IRailItem[] {
	return [
		{ href: sitePath(slug, "/plan"), icon: "Kanban", label: "Content plan" },
		{ href: editorHref, icon: "NotePencil", label: "Editor" },
		{
			href: sitePath(slug, "/assets"),
			icon: "ImagesSquare",
			label: "Image pipeline",
			dot: row && row.humanOnly > 0 ? "human" : undefined,
		},
		{
			href: sitePath(slug, "/templates"),
			icon: "BracketsAngle",
			label: "Templates",
		},
		// Pending ideas (the one decision under autopost) + posts waiting in review (held by autopost, or every post when it's off).
		{
			href: sitePath(slug, "/approvals"),
			icon: "SealCheck",
			label: "Approvals",
			dot: row && row.approvalsWaiting > 0 ? "block" : row && row.ideasPending > 0 ? "human" : undefined,
		},
		{
			href: sitePath(slug, "/seo"),
			icon: "ChartLineUp",
			label: "SEO trajectory",
		},
	];
}

function workspaceRail(inboxCount: number): IRailItem[] {
	return [
		{ href: WORKSPACE_ROUTES.sites, icon: "SquaresFour", label: "Sites" },
		{
			href: WORKSPACE_ROUTES.inbox,
			icon: "Tray",
			label: inboxCount ? `Inbox · ${inboxCount} need you` : "Inbox",
			dot: inboxCount > 0 ? "human" : undefined,
		},
		{ href: WORKSPACE_ROUTES.team, icon: "UsersThree", label: "Team" },
	];
}

/** Longest rail href that prefixes the path (editor/assets share /posts). */
function activeFor(path: string, items: IRailItem[], slug: string | null): string {
	if (slug) {
		const sub = stripSite(path);
		if (sub.startsWith("/posts/") && sub.endsWith("/assets")) return sitePath(slug, "/assets");
		if (sub.startsWith("/posts")) return items[1]!.href;
	}
	const hit = items.filter((i) => path === i.href || path.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
	return hit?.href ?? path;
}

const WASH: [RegExp, TWash][] = [
	[/^\/seo/, "blue"],
	[/^\/approvals|^\/merge-requests/, "green"],
	[/^\/settings|^\/onboarding|^\/templates/, "neutral"],
];

/** Sub-paths that are safe to carry to another site (entity ids don't exist there). */
function carryPath(sub: string): string {
	if (/^\/posts\/[^/]+/.test(sub)) return "/posts";
	if (sub === "/" || sub === "") return "/plan";
	return sub.replace(/\?.*$/, "");
}

// ---- Toasts ----------------------------------------------------------------

function ToastBridge() {
	const { toasts, dismiss, undo } = useShellToasts();
	const { toast } = useToast();
	const seen = useRef(new Set<string>());
	useEffect(() => {
		for (const t of toasts) {
			if (seen.current.has(t.id)) continue;
			seen.current.add(t.id);
			toast({
				title: t.text,
				tone: t.tone,
				action: t.undo ? { label: "Undo", onClick: () => undo() } : undefined,
			});
			dismiss(t.id);
		}
	}, [toasts, toast, dismiss, undo]);
	return null;
}

// ---- Shell -----------------------------------------------------------------

function Shell({ children, cta }: { children: ReactNode; cta?: ReactNode }) {
	const path = usePathname();
	const router = useRouter();
	const slug = siteSlugFromPath(path);
	// Workspace identity, switcher and the account menu come from the page data source (Convex when the backend is
	// on). Inside a site, search, presence, agents and unread still come from the demo store: those pages aren't
	// ported yet, so we look the store's copy of the site up by slug.
	const storeView = useWorkspaceView();
	const pageView = usePageWorkspaceView();
	const { workspace, me, users, myWorkspaceRole, canAddSite, addSiteWhy } = pageView;
	const signedIn = PAGES_ON_CONVEX ? pageView.signedIn : storeView.signedIn;
	const { signInAs, signOut: storeSignOut, resetDemo } = useWorkspaceActions();
	const { signOut: pageSignOut } = usePageWorkspaceActions();
	const storeRows = useSiteRows();
	const rows = usePageSiteRows();
	const inbox = useInboxRows();
	const row = slug ? rows.find((r) => r.slug === slug) : undefined;
	const storeRow = slug ? storeRows.find((r) => r.slug === slug) : undefined;
	const search = useSiteSearch(storeRow?.id);
	// Everyone else on this site right now (any page); the tooltip names them.
	const here = useSitePresence(storeRow?.id);
	const signOut = () => {
		storeSignOut();
		if (PAGES_ON_CONVEX) pageSignOut();
	};

	// Bridge (until the site pages move to Convex): a real sign-in also enters the demo data as its owner, so
	// /s/<site> pages open without picking a demo person. Real access is still enforced by Convex on live pages.
	useEffect(() => {
		if (!PAGES_ON_CONVEX || !pageView.signedIn || pageView.loading || storeView.signedIn) return;
		const owner = storeView.users.find((u) => storeView.workspaceRoles[u.id] === "owner" && u.status === "active");
		if (owner) signInAs(owner.id);
	}, [pageView.signedIn, pageView.loading, storeView.signedIn, storeView.users, storeView.workspaceRoles, signInAs]);
	const [palette, setPalette] = useState(false);
	const [adding, setAdding] = useState(false);

	useEffect(() => {
		if (!signedIn) router.replace(WORKSPACE_ROUTES.signIn);
	}, [signedIn, router]);

	const items = useMemo(() => (slug ? siteRail(slug, row, search.editorHref ?? sitePath(slug, "/posts")) : workspaceRail(inbox.length)), [slug, row, search.editorHref, inbox.length]);
	const active = activeFor(path, items, slug);
	const sub = slug ? stripSite(path) : path;
	const wash = slug ? (WASH.find(([re]) => re.test(sub))?.[1] ?? "blue-peach") : "blue-peach";

	const groups = useMemo<ICommandGroup[]>(() => {
		const wsItems = [
			{
				id: "ws-sites",
				label: "All sites",
				icon: "SquaresFour" as TIconName,
				href: WORKSPACE_ROUTES.sites,
			},
			{
				id: "ws-inbox",
				label: "Inbox",
				hint: inbox.length ? `${inbox.length} need you` : undefined,
				icon: "Tray" as TIconName,
				href: WORKSPACE_ROUTES.inbox,
			},
			{
				id: "ws-team",
				label: "Team",
				icon: "UsersThree" as TIconName,
				href: WORKSPACE_ROUTES.team,
			},
			{
				id: "ws-account",
				label: "Account",
				icon: "User" as TIconName,
				href: WORKSPACE_ROUTES.account,
			},
		];
		const out: ICommandGroup[] = [];
		if (slug)
			out.push({
				label: `Go to · ${row?.name ?? slug}`,
				items: [
					...items,
					{
						href: sitePath(slug, "/runs"),
						icon: "ClockCounterClockwise" as TIconName,
						label: "Runs & ledger",
					},
					{
						href: sitePath(slug, "/settings"),
						icon: "GearSix" as TIconName,
						label: "Settings",
					},
				].map((i) => ({
					id: i.href,
					label: i.label,
					icon: i.icon,
					href: i.href,
				})),
			});
		out.push({ label: "Workspace", items: wsItems });
		out.push({
			label: "Sites",
			items: rows.map((r) => ({
				id: `site-${r.id}`,
				label: r.name,
				hint: r.domain,
				icon: "Globe" as TIconName,
				href: sitePath(r.slug, carryPath(sub)),
			})),
		});
		if (slug) {
			if (search.posts.length) out.push({ label: "Posts", items: search.posts });
			if (search.keywords.length) out.push({ label: "Keywords", items: search.keywords });
		}
		return out;
	}, [items, rows, slug, row?.name, sub, search, inbox.length]);

	if (!signedIn) return null;

	const switchSite = (id: string) => {
		const target = rows.find((r) => r.id === id);
		if (!target) return;
		router.push(sitePath(target.slug, slug ? carryPath(sub) : target.status === "onboarding" ? "/onboarding" : "/plan"));
	};

	// Demo person switching only makes sense on demo data; with the backend on, people are real accounts.
	const others = PAGES_ON_CONVEX ? [] : users.filter((u) => u.id !== me.id && u.status === "active");
	/** Me + "Switch user" (demo of multiple people) + account + sign out. On mobile it also carries the routes the
	 *  5-slot tab bar can't fit (the "More" of the IA). */
	const accountMenu = (side: "top" | "bottom", withNav = false) => (
		<Menu
			align={side === "top" ? "start" : "end"}
			side={side}
			label={`${me.name} · account`}
			trigger={
				<span className="grid size-11 place-items-center rounded-pill" aria-label={`${me.name} · account menu`}>
					<Avatar name={me.name} initials={me.initials} size={44} />
				</span>
			}
			items={[
				{
					id: "me",
					disabled: true,
					label: (
						<span className="flex flex-col text-ink">
							<span>{me.name}</span>
							<span className="font-sans text-xs font-normal text-ink-3">
								{me.email} · {WORKSPACE_ROLE_LABEL[myWorkspaceRole]}
								{row?.role ? ` · ${ROLE_SHORT[row.role]} here` : ""}
							</span>
						</span>
					),
					onSelect: () => {},
				},
				...(withNav
					? slug
						? [
								{
									id: "nav-assets",
									label: "Image pipeline",
									icon: "ImagesSquare" as const,
									onSelect: () => router.push(sitePath(slug, "/assets")),
								},
								{
									id: "nav-templates",
									label: "Templates",
									icon: "BracketsAngle" as const,
									onSelect: () => router.push(sitePath(slug, "/templates")),
								},
								{
									id: "nav-runs",
									label: "Runs & ledger",
									icon: "ClockCounterClockwise" as const,
									onSelect: () => router.push(sitePath(slug, "/runs")),
								},
								{
									id: "nav-settings",
									label: "Settings",
									icon: "GearSix" as const,
									onSelect: () => router.push(sitePath(slug, "/settings")),
								},
								{
									id: "nav-inbox",
									label: `Inbox${inbox.length ? ` · ${inbox.length}` : ""}`,
									icon: "Tray" as const,
									onSelect: () => router.push(WORKSPACE_ROUTES.inbox),
								},
								{
									id: "nav-team",
									label: "Team",
									icon: "UsersThree" as const,
									onSelect: () => router.push(WORKSPACE_ROUTES.team),
								},
							]
						: []
					: []),
				{
					id: "account",
					label: "Account",
					icon: "User" as const,
					onSelect: () => router.push(WORKSPACE_ROUTES.account),
				},
				...others.map((u) => ({
					id: `as-${u.id}`,
					label: `Demo · switch to ${u.name}`,
					icon: "UserSwitch" as const,
					onSelect: () => signInAs(u.id),
				})),
				{
					id: "reset",
					label: "Reset demo data",
					icon: "ArrowsClockwise" as const,
					onSelect: () => resetDemo(),
				},
				{
					id: "signout",
					label: "Sign out",
					icon: "SignOut" as const,
					onSelect: () => {
						signOut();
						router.push(WORKSPACE_ROUTES.signIn);
					},
				},
			]}
		/>
	);

	const mark = (
		<Tooltip label={`${workspace.name} · all sites`} side="end">
			<a
				href={WORKSPACE_ROUTES.sites}
				onClick={(e) => {
					e.preventDefault();
					router.push(WORKSPACE_ROUTES.sites);
				}}
				aria-label={`${workspace.name} — all sites`}
				className="press grid size-12 place-items-center rounded-full bg-surface text-ink"
			>
				<span className="font-display text-lg font-medium" aria-hidden>
					{workspace.name[0]}
				</span>
			</a>
		</Tooltip>
	);

	const footer = slug ? (
		<>
			<RailButton href={sitePath(slug, "/runs")} icon="ClockCounterClockwise" label="Runs & ledger" active={sub.startsWith("/runs")} dot={storeRow && storeRow.overdue > 0 ? "human" : undefined} />
			<RailButton href={sitePath(slug, "/settings")} icon="GearSix" label="Settings" active={sub.startsWith("/settings")} />
			{accountMenu("top")}
		</>
	) : (
		<>
			<RailButton href={WORKSPACE_ROUTES.account} icon="User" label="Account" active={path.startsWith(WORKSPACE_ROUTES.account)} />
			{accountMenu("top")}
		</>
	);

	const mobileItems: IRailItem[] = slug
		? [items[0]!, items[1]!, items[4]!, items[5]!, { href: sitePath(slug, "/settings"), icon: "DotsThree", label: "More" }]
		: [...items, { href: WORKSPACE_ROUTES.account, icon: "User", label: "Account" }];

	const entries = rows.map((r) => ({
		id: r.id,
		name: r.name,
		domain: r.domain,
		hue: r.hue,
		status: r.status,
		role: r.role ? ROLE_SHORT[r.role] : undefined,
		needsMe: r.needsMe,
	}));
	const addSiteButton = canAddSite ? (
		<Button variant="secondary" size="sm" icon="Plus" onClick={() => setAdding(true)}>
			Add site
		</Button>
	) : (
		<Tooltip label={addSiteWhy ?? "Only workspace admins can add sites"}>
			<span tabIndex={0} className="inline-flex cursor-not-allowed" aria-label={`Add site — ${addSiteWhy ?? "only workspace admins can add sites"}`}>
				<Button variant="secondary" size="sm" icon="LockSimple" disabled>
					Add site
				</Button>
			</span>
		</Tooltip>
	);

	return (
		<AppFrame wash={wash} rail={<IconRail items={items} activeHref={active} footer={footer} mark={mark} />} mobileNav={<MobileTabBar items={mobileItems} activeHref={active} />}>
			<TopBar>
				<SiteSwitcher
					site={
						row
							? {
									id: row.id,
									name: row.name,
									domain: row.domain,
									icon: row.site.icon,
								}
							: null
					}
					sites={[]}
					entries={entries}
					hue={row?.hue}
					allLabel={`${workspace.name} · all sites`}
					onChange={switchSite}
					onAllSites={() => router.push(WORKSPACE_ROUTES.sites)}
					footer={addSiteButton}
					className="min-w-0 max-sm:flex-1"
				/>
				<CommandSearch placeholder={slug ? "Search posts, keywords, sites" : "Search sites and pages"} onOpen={() => setPalette(true)} className="max-lg:hidden" />
				<div className="flex-1 max-sm:hidden" />
				{slug && <PresenceBadge people={here} where={`on ${row?.name ?? "this site"} now`} className="max-md:hidden" />}
				<AgentStatusPill
					running={slug ? (storeRow?.agentsRunning ?? 0) : rows.reduce((a, r) => a + r.agentsRunning, 0)}
					onClick={slug ? () => router.push(sitePath(slug, "/runs")) : undefined}
					className="max-md:hidden"
				/>
				{slug ? (
					<>
						<IconButton
							icon="BellSimple"
							label={`Notifications${storeRow?.unread ? ` · ${storeRow.unread} unread` : ""}`}
							variant="white"
							dot={storeRow?.unread ? "block" : undefined}
							href={`${sitePath(slug, "/runs")}#notifications`}
							className="max-sm:hidden"
						/>
						<IconButton icon="CalendarBlank" label="Calendar" variant="white" href={`${sitePath(slug, "/plan")}?view=calendar`} className="max-md:hidden" />
					</>
				) : (
					<IconButton
						icon="Tray"
						label={`Inbox${inbox.length ? ` · ${inbox.length} need you` : ""}`}
						variant="white"
						dot={inbox.length ? "human" : undefined}
						href={WORKSPACE_ROUTES.inbox}
						className="max-sm:hidden"
					/>
				)}
				{cta}
				<div className="lg:hidden">{accountMenu("bottom", true)}</div>
			</TopBar>
			{children}
			<CommandPalette open={palette} onClose={() => setPalette(false)} groups={groups} placeholder={slug ? "Search posts, keywords, sites" : "Search sites and pages"} />
			<AddSiteSheet open={adding} onClose={() => setAdding(false)} />
			<ToastBridge />
		</AppFrame>
	);
}

/** Route-level CTA slot: pages render <TopBarCta> to put their one black button in the top bar. */
export function TopBarCta({ children }: { children: ReactNode }) {
	const [el, setEl] = useState<HTMLElement | null>(null);
	useEffect(() => setEl(document.getElementById("cms-topbar-cta")), []);
	return el ? createPortal(children, el) : null;
}

export function AppShell({ children }: { children: ReactNode }) {
	return (
		<CmsProvider>
			<ToastProvider>
				<Shell cta={<span id="cms-topbar-cta" className="contents" />}>{children}</Shell>
			</ToastProvider>
		</CmsProvider>
	);
}
