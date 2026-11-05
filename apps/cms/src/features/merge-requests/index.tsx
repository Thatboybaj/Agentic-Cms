"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
	Button,
	Callout,
	Card,
	CardHeader,
	CIStatus,
	DataGap,
	DataTable,
	Dot,
	EmptyState,
	Icon,
	KeyValue,
	LockedAction,
	PageHeader,
	RoleGate,
	ScopeNote,
	Section,
	SegmentedControl,
	Sheet,
	SourceCodeFrame,
	Timeline,
	type IDataTableColumn,
} from "@/ds";
import { fmtAgo, fmtDate, fmtDateTime, mrRef, postUrl } from "@/lib/logic";
import { useCms, useSite } from "@/lib/store";
import type { IMergeRequest, IPost, TRole } from "@/lib/types";
import { ciSince, mergeSha, mrTimeline, sitemapSides } from "./timeline";
import { sitePath } from "@/lib/routes";

type TFilter = "all" | "open" | "merged" | "closed";
const DEVS: TRole[] = ["developer", "admin"];
const isOpen = (m: IMergeRequest) => m.status === "open" || m.status === "conflict";
const needsAttention = (m: IMergeRequest) => m.status === "conflict" || (m.status === "open" && m.ci === "failing");

function useMediaQuery(q: string): boolean {
	const [match, setMatch] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia(q);
		const on = () => setMatch(mq.matches);
		on();
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, [q]);
	return match;
}

export function MergeRequests() {
	const { slug } = useSite();
	const router = useRouter();
	const params = useSearchParams();
	const { data, site } = useCms();
	const desktop = useMediaQuery("(min-width: 1024px)");
	const [filter, setFilter] = useState<TFilter>("all");

	const mrs = data.mergeRequests;
	const open = mrs.filter(isOpen);
	const attention = open.filter(needsAttention);
	const postOf = (m: IMergeRequest) => data.posts.find((p) => p.id === m.postId);

	const paramId = params.get("mr");
	const fallbackId = (attention[0] ?? open[0] ?? mrs[0])?.id;
	const selectedId = paramId ?? (desktop ? fallbackId : undefined);
	const selected = mrs.find((m) => m.id === selectedId);
	const select = (id: string | null) => router.replace(sitePath(slug, id ? `/merge-requests?mr=${id}` : "/merge-requests"), { scroll: false });

	const groups = useMemo(() => {
		const g: { id: TFilter; title: string; rows: IMergeRequest[] }[] = [
			{ id: "open", title: "Open", rows: mrs.filter(isOpen).sort((a, b) => b.number - a.number) },
			{ id: "merged", title: "Merged", rows: mrs.filter((m) => m.status === "merged").sort((a, b) => b.number - a.number) },
			{ id: "closed", title: "Closed", rows: mrs.filter((m) => m.status === "closed") },
		];
		return g.filter((x) => (filter === "all" ? x.rows.length > 0 || x.id !== "closed" : x.id === filter));
	}, [mrs, filter]);

	const columns: IDataTableColumn<IMergeRequest>[] = [
		{ key: "n", header: "#", width: 56, render: (m) => <span className="tabular font-display">!{m.number}</span> },
		{
			key: "post",
			header: "Post · branch",
			render: (m) => (
				<span className="flex min-w-0 max-w-[26rem] flex-col gap-0.5">
					<span className={`truncate ${m.id === selectedId ? "font-display" : ""}`}>{postOf(m)?.title ?? m.title ?? m.branch}</span>
					<span className="truncate font-mono text-2xs text-ink-3" title={`${m.branch} → ${m.base}`}>
						{m.branch} → {m.base}
					</span>
					{m.status === "conflict" && <span className="text-xs text-block-ink">Conflict · public/sitemap.xml</span>}
					{m.status === "open" && m.ci === "failing" && m.ciDetail && <span className="truncate text-xs text-block-ink">{m.ciDetail.split(" · ")[0]} failing</span>}
				</span>
			),
		},
		{ key: "status", header: "Status", width: 190, render: (m) => <CIStatus ci={m.ci} status={m.status} /> },
		{ key: "opened", header: "Opened", width: 80, render: (m) => <span className="tabular whitespace-nowrap text-sm text-ink-3">{fmtDate(m.status === "merged" && m.mergedAt ? m.mergedAt : m.openedAt)}</span> },
		{ key: "ov", header: "Overrides", width: 80, align: "end", render: (m) => <span className={`tabular text-sm ${m.overrides.length ? "text-human-ink" : "text-ink-4"}`}>{m.overrides.length}</span> },
	];

	const header = (
		<PageHeader
			title="Merge requests"
			subtitle={`${open.length} open · ${attention.length} need${attention.length === 1 ? "s" : ""} attention`}
			actions={
				<SegmentedControl<TFilter>
					label="Show"
					size="sm"
					value={filter}
					onChange={setFilter}
					options={[
						{ value: "all", label: "All" },
						{ value: "open", label: "Open" },
						{ value: "merged", label: "Merged" },
						{ value: "closed", label: "Closed" },
					]}
				/>
			}
		/>
	);

	if (!site.repo) {
		return (
			<div className="flex flex-col gap-4">
				{header}
				<DataGap label="Repo not connected" reason="Merge requests appear once a developer connects the site's repo." action={<Button variant="secondary" href={sitePath(slug, "/settings")} icon="PlugsConnected">Open settings</Button>} />
			</div>
		);
	}

	const list = (
		<div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
			{mrs.length === 0 ? (
				<Card variant="solid" padding="lg">
					<EmptyState icon="GitPullRequest" title="No open merge requests" body="Approved posts open one branch each here." action={<Button variant="secondary" href={sitePath(slug, "/approvals")} icon="SealCheck">Go to approvals</Button>} />
				</Card>
			) : (
				groups.map((g) => (
					<Card key={g.id} variant="solid" padding="lg" as="section">
						<Section title={g.title} count={g.rows.length}>
							{/* Desktop / tablet table */}
							<DataTable<IMergeRequest>
								columns={columns}
								rows={g.rows}
								dense
								caption={`${g.title} merge requests`}
								onRowClick={(m) => select(m.id)}
								empty={<span className="text-sm text-ink-3">No {g.title.toLowerCase()} merge requests.</span>}
								className="max-md:hidden"
							/>
							{/* Mobile cards */}
							<ul className="flex flex-col gap-2 md:hidden">
								{g.rows.map((m) => (
									<li key={m.id}>
										<button type="button" onClick={() => select(m.id)} className="press flex w-full flex-col gap-2 rounded-lg bg-sunken-2 p-3.5 text-start">
											<span className="flex items-center gap-2">
												<span className="tabular font-display text-sm">!{m.number}</span>
												<span className="min-w-0 flex-1 truncate font-display text-md">{postOf(m)?.title ?? m.title}</span>
											</span>
											<CIStatus ci={m.ci} status={m.status} />
											{needsAttention(m) && <span className="text-xs text-block-ink">{m.status === "conflict" ? "Conflict · public/sitemap.xml" : m.ciDetail}</span>}
										</button>
									</li>
								))}
								{g.rows.length === 0 && <li className="text-sm text-ink-3">No {g.title.toLowerCase()} merge requests.</li>}
							</ul>
						</Section>
					</Card>
				))
			)}
		</div>
	);

	const detail = selected ? <MrDetail mr={selected} post={postOf(selected)} /> : null;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4">
			{header}
			{desktop ? (
				<div className="flex min-h-0 flex-1 gap-4">
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">{list}</div>
					{detail && (
						<aside aria-label="Merge request detail" className={`thin-scrollbar flex min-h-0 shrink-0 flex-col overflow-y-auto rounded-xl bg-surface p-5 ${selected?.status === "conflict" ? "w-[560px]" : "w-[440px]"}`}>
							{detail}
						</aside>
					)}
				</div>
			) : (
				<>
					{list}
					<Sheet open={!!paramId && !!selected} onClose={() => select(null)} title={selected ? `${mrRef(selected)} · ${postOf(selected)?.title ?? selected.title}` : "Merge request"} width={560}>
						{detail}
					</Sheet>
				</>
			)}
		</div>
	);
}

// ─── Detail ───────────────────────────────────────────────────────────────────

function MrDetail({ mr, post }: { mr: IMergeRequest; post: IPost | undefined }) {
	const { slug } = useSite();
	const { data, site, role, can, why, actions } = useCms();
	const repo = site.repo!;
	const isDev = can("mr.merge");
	const hostName = mr.host === "github" ? "GitHub" : "GitLab";
	const hostUrl = `https://${mr.host === "github" ? "github.com" : "gitlab.com"}/${repo.repo}/${mr.host === "github" ? "pull" : "-/merge_requests"}/${mr.number}`;
	const developer = data.audit.find((a) => a.action === "merged")?.actor ?? "Kunle O.";
	const timeline = mrTimeline(mr, post, data, site);

	const mergeReasons = [
		...(mr.status === "conflict" ? ["Conflict with the base branch. Rebase first"] : []),
		...(mr.status === "open" && mr.ci === "pending" ? ["CI is still running"] : []),
		...(mr.status === "open" && mr.ci === "failing" ? [`CI is failing${mr.ciDetail ? ` · ${mr.ciDetail}` : ""}`] : []),
	];

	let primary: ReactNode = null;
	if (mr.status === "conflict") {
		primary = (
			<RoleGate role={role} allow={DEVS} fallback={<LockedAction label="Rebase and re-render" icon="ArrowsClockwise" reasons={[why("mr.rebase") ?? "Developer only"]} summary="Developer only" />}>
				<Button variant="primary" icon="ArrowsClockwise" onClick={() => actions.rebaseMr(mr.id)}>
					Rebase and re-render
				</Button>
			</RoleGate>
		);
	} else if (mr.status === "open") {
		primary = (
			<RoleGate role={role} allow={DEVS} fallback={<LockedAction label="Merge" icon="GitMerge" reasons={[why("mr.merge") ?? "Developer only"]} summary="Developer only" />}>
				<LockedAction
					label="Merge"
					icon="GitMerge"
					reasons={mergeReasons}
					summary={mr.ci === "pending" ? "CI running" : mr.ci === "failing" ? "CI failing" : undefined}
					unlocked={mergeReasons.length === 0}
					onClick={() => actions.mergeMr(mr.id)}
				/>
			</RoleGate>
		);
	}

	const sides = mr.status === "conflict" ? sitemapSides(mr, post, site, data.posts.filter((p) => p.state === "live")) : null;

	return (
		<div className="flex flex-col gap-4">
			<CardHeader icon="GitPullRequest" title={`${mrRef(mr)} · ${post?.title ?? mr.title ?? mr.branch}`} className="max-lg:hidden" />
			<div className="flex flex-wrap items-center gap-2 text-xs">
				<span className="max-w-full truncate rounded-xs bg-sunken px-2 py-1 font-mono">{mr.branch}</span>
				<Icon name="ArrowRight" size={13} className="text-ink-4" />
				<span className="sr-only">into</span>
				<span className="rounded-xs bg-sunken px-2 py-1 font-mono">{mr.base}</span>
				<CIStatus ci={mr.ci} status={mr.status} className="ms-auto" />
			</div>

			{/* Status the specialist can read without opening the repo */}
			{mr.status === "open" && mr.ci === "failing" && (
				<Callout
					tone="block"
					title={`CI failing${mr.ciDetail ? ` · ${mr.ciDetail.split(" · ")[0]}` : ""}`}
					action={
						post && can("post.edit") ? (
							<Button variant="secondary" size="sm" href={sitePath(slug, `/posts/${post.id}`)} icon="NotePencil">
								Fix in editor
							</Button>
						) : undefined
					}
				>
					{mr.ciDetail ?? "The repo's checks failed. Details are on the host."}
				</Callout>
			)}
			{mr.status === "open" && mr.ci === "pending" && (
				<span className="flex items-center gap-2 text-sm text-agent-ink" aria-live="polite">
					<Dot tone="agent" pulse />
					Waiting on the repo&apos;s checks · {fmtAgo(ciSince(mr, data)).replace(" ago", "")}
				</span>
			)}
			{mr.status === "open" && mr.ci === "none" && <span className="text-sm text-ink-3">No checks configured</span>}
			{mr.status === "conflict" && (
				<>
					<Callout tone="block" title="Conflict · public/sitemap.xml">
						{mr.conflictDetail ?? "The base branch changed the same file after the branch was cut."} Never auto-merged.
					</Callout>
					{!isDev && (
						<Callout tone="human" icon="Hand" title={`Waiting on ${developer} · conflict in public/sitemap.xml`}>
							A developer rebases and re-renders; you don&apos;t need to do anything.
						</Callout>
					)}
					{sides && (
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div className="flex min-w-0 flex-col gap-1.5">
								<span className="flex items-center gap-1.5 text-xs text-ink-3">
									<Icon name="GitBranch" size={13} />
									<span className="font-mono text-ink">{mr.base}</span> · now
								</span>
								<SourceCodeFrame mode="source" html={sides.main} highlights={sides.mainNeedles.map((s) => ({ selector: s, label: `on ${mr.base}`, tone: "block" as const }))} className="max-h-72" />
							</div>
							<div className="flex min-w-0 flex-col gap-1.5">
								<span className="flex items-center gap-1.5 text-xs text-ink-3">
									<Icon name="GitBranch" size={13} />
									<span className="truncate font-mono text-ink">{mr.branch}</span>
								</span>
								<SourceCodeFrame mode="source" html={sides.branch} highlights={[{ selector: sides.branchNeedle, label: "this post", tone: "agent" }]} className="max-h-72" />
							</div>
						</div>
					)}
				</>
			)}
			{mr.status === "merged" && (
				<Callout tone="pass" icon="GitMerge" title={`Merged ${mergeSha(mr)} · ${post?.state === "live" || post?.state === "decaying" ? "post is Live" : "merged"}`}>
					{mr.mergedAt ? `${fmtDateTime(mr.mergedAt)}${mr.mergedBy ? ` · ${mr.mergedBy}` : ""}` : null}
				</Callout>
			)}

			{(primary || role !== "stakeholder") && (
				<div className="flex flex-wrap items-center gap-2.5">
					{role !== "stakeholder" && (
						<Button variant="secondary" size="md" href={hostUrl} icon={mr.host === "github" ? "GithubLogo" : "GitlabLogo"}>
							Open on {hostName}
						</Button>
					)}
					{mr.status === "merged" && post && (
						<Button variant="ghost" size="md" href={`https://${site.domain}${postUrl(post)}`} icon="Globe">
							View live
						</Button>
					)}
					<span className="flex-1" />
					{primary}
				</div>
			)}
			{mr.status !== "merged" && mr.status !== "closed" && <span className="text-xs text-ink-4">Nothing merges on its own. A developer merges once checks pass.</span>}

			<Section title="Post timeline">
				<Timeline items={timeline} />
			</Section>

			<Section title="Files">
				<KeyValue dense rows={mr.files.map((f) => ({ k: <span className="font-mono text-ink-2">{f.path}</span>, v: <span className={f.change.startsWith("+") ? "text-pass-ink" : "text-ink-4"}>{f.change}</span> }))} />
			</Section>

			{mr.overrides.length > 0 && (
				<div className="flex flex-col gap-1.5 rounded-md bg-human-soft px-3 py-2.5">
					<span className="flex items-center gap-1.5 font-display text-xs text-human-ink">
						<Icon name="Note" size={13} />
						Overrides · listed for the reviewer
					</span>
					<ul className="flex list-disc flex-col gap-1 ps-5 text-xs text-ink-2">
						{mr.overrides.map((o) => (
							<li key={o}>{o.replace(" · soft:", ":")}</li>
						))}
					</ul>
				</div>
			)}

			<KeyValue
				dense
				rows={[
					{ k: "Opened", v: fmtDateTime(mr.openedAt) },
					...(mr.mergedAt ? [{ k: "Merged", v: `${fmtDateTime(mr.mergedAt)}${mr.mergedBy ? ` · ${mr.mergedBy}` : ""}` }] : []),
					{ k: "Manifest", v: mr.manifestVersion ? `v${mr.manifestVersion}` : <span className="text-ink-4">Not recorded</span> },
					{ k: "Repo", v: <span className="font-mono">{repo.repo}</span> },
				]}
			/>

			<ScopeNote repo={repo} className="bg-sunken-2" />
		</div>
	);
}
