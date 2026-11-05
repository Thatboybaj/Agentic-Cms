"use client";

// Full-bleed AppFrame fixture, rendered by /styleguide?frame=app and embedded in the AppFrame kit as
// iframes, so its 390 / 1440 breakpoints resolve against the frame width, not the styleguide window.
import { useState } from "react";
import {
	AgentStatusPill,
	AppFrame,
	Avatar,
	Button,
	Card,
	CardHeader,
	CommandSearch,
	IconButton,
	IconRail,
	MobileTabBar,
	PageHeader,
	PostCard,
	SiteSwitcher,
	SourceNote,
	SplitPane,
	StatStrip,
	StatusLight,
	TopBar,
	type IRailItem,
	type TWash,
} from "@/ds";
import { evaluateGate } from "@/lib/logic";
import { activeManifest, useCms, useStats } from "@/lib/store";

export const RAIL: IRailItem[] = [
	{ href: "/plan", icon: "Kanban", label: "Content plan" },
	{ href: "/posts/p-root-canal", icon: "NotePencil", label: "Editor" },
	{ href: "/assets", icon: "ImagesSquare", label: "Image pipeline", dot: "human" },
	{ href: "/templates", icon: "BracketsAngle", label: "Templates" },
	{ href: "/approvals", icon: "SealCheck", label: "Approvals", dot: "block" },
	{ href: "/seo", icon: "ChartLineUp", label: "SEO trajectory" },
];

export function FrameDemo({ wash = "blue-peach" }: { wash?: TWash }) {
	const { state, site, data, me, actions } = useCms();
	const stats = useStats();
	const [strip, setStrip] = useState("in-review");
	const review = data.posts.filter((p) => p.state === "in-review");
	const pillar = (id: string) => data.pillars.find((p) => p.id === id);
	const keyword = (id: string) => data.keywords.find((k) => k.id === id);
	return (
		<AppFrame
			wash={wash}
			rail={<IconRail items={RAIL} activeHref="/plan" footer={<IconButton icon="GearSix" label="Settings" href="/settings" />} />}
			mobileNav={<MobileTabBar items={RAIL.slice(0, 5)} activeHref="/plan" />}
		>
			<TopBar>
				<SiteSwitcher site={site} sites={state.sites} onChange={(id) => actions.setSite(id)} />
				<CommandSearch placeholder="Search posts, keywords, runs" onOpen={() => {}} hotkey={false} className="hidden md:flex" />
				<div className="flex-1" />
				<AgentStatusPill running={stats.agentsRunning} />
				<IconButton icon="BellSimple" label="Notifications" dot={stats.unread > 0 ? "human" : undefined} />
				<Avatar name={me.name} initials={me.initials} size={44} />
			</TopBar>
			<PageHeader title="Content plan" subtitle={`${site.name} · week 39 · ${stats.cadence.shipped} of ${stats.cadence.target} shipped`} actions={<Button icon="Plus">New idea</Button>} />
			<StatStrip
				items={[
					{ id: "idea", label: "Idea", value: stats.counts.idea, active: strip === "idea", onClick: () => setStrip("idea") },
					{ id: "drafting", label: "Drafting", value: stats.counts.drafting, active: strip === "drafting", onClick: () => setStrip("drafting") },
					{ id: "needs", label: "Needs you", value: stats.needsHuman, tone: "human", onClick: () => setStrip("needs") },
					{ id: "in-review", label: "In review", value: stats.counts["in-review"], active: strip === "in-review", onClick: () => setStrip("in-review") },
					{ id: "live", label: "Live", value: stats.counts.live, active: strip === "live", onClick: () => setStrip("live") },
				]}
			/>
			<SplitPane
				asideLabel="Plan status"
				aside={
					<Card padding="lg" className="flex flex-col gap-3">
						<CardHeader icon="Target" title="Plan status" />
						{data.planStatus.slice(0, 3).map((s) => (
							<StatusLight key={s.id} light={s.light} label={s.label} value={s.value} detail={s.detail} />
						))}
						<SourceNote>Search Console · lags 2–3 days</SourceNote>
					</Card>
				}
			>
				<div className="grid gap-3 md:grid-cols-2">
					{review.map((p) => (
						<PostCard key={p.id} post={p} pillar={pillar(p.pillarId)} keyword={keyword(p.keywordId)} href={`/posts/${p.id}`} blocks={evaluateGate(p, data.slots.filter((s) => s.postId === p.id), activeManifest(data)).hard} />
					))}
				</div>
			</SplitPane>
		</AppFrame>
	);
}
