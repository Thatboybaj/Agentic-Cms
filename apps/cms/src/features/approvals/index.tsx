"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
	ApprovalQueueItem,
	AssertionList,
	ASSERTIONS,
	Button,
	Callout,
	Card,
	Chip,
	DataGap,
	Dialog,
	EmptyState,
	Icon,
	IconButton,
	LockedAction,
	MRPreview,
	ORIGIN_LABEL,
	OverrideReason,
	PageHeader,
	PaginationDots,
	ReadinessGrid,
	RoleGate,
	ScopeNote,
	SegmentedControl,
	TextArea,
	TextField,
	useToast,
} from "@/ds";
import { evaluateGate, fmtInt, INTENT_LABEL } from "@/lib/logic";
import { IDEA_SOURCE_LABEL, IdeaApprovalRow, IdeaCostNote } from "@/features/plan/idea-actions";
import { useSite } from "@/lib/store";
import { type ISiteCms, useSiteManifest, useSiteAutopostHold, useSiteCms, useSiteGate, useSiteMergeRequest, useSitePendingIdeas, useSiteStats } from "@/features/shared/site-source";
import type { IGateView } from "@/lib/store";
import type { IMergeRequest, IPost, TRole } from "@/lib/types";
import { draftMr, hardBlocks, MIN_REASON, pendingSoft, readinessItems, withTypedOverrides, type IHardBlock } from "./gate-view";
import { sitePath } from "@/lib/routes";

type TAsserts = [boolean, boolean, boolean];
const NONE: TAsserts = [false, false, false];
const APPROVERS: TRole[] = ["specialist", "admin"];
/** Mobile sticky bar: the primary fills the row and its inline reason truncates instead of overflowing. */
const MOBILE_WIDE = "min-w-0 max-md:flex-1 max-md:[&>button]:w-full max-md:[&>button]:min-w-0 max-md:[&>button]:overflow-hidden max-md:[&>button]:justify-center max-md:[&>button>span]:truncate";
const ROLE_GATE_COPY = "Your role can't approve content. Tolu B. or an admin can.";

type TApprovalsTab = "ideas" | "review";

/** Approvals · Ideas (C10: the one decision a person always makes) and Content review (the gate, or autopost holds). */
export function Approvals() {
	const { slug } = useSite();
	const router = useRouter();
	const params = useSearchParams();
	const { data } = useSiteCms();
	const ideas = useSitePendingIdeas();
	const inReview = data.posts.filter((p) => p.state === "in-review").length;
	const raw = params.get("tab");
	const tab: TApprovalsTab = raw === "ideas" || raw === "review" ? raw : params.get("post") ? "review" : inReview === 0 && ideas.length > 0 ? "ideas" : "review";
	const setTab = (t: TApprovalsTab) => router.replace(sitePath(slug, `/approvals?tab=${t}`), { scroll: false });
	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			<SegmentedControl<TApprovalsTab>
				label="Approvals"
				value={tab}
				onChange={setTab}
				className="self-start max-md:w-full max-md:[&>button]:flex-1 max-md:[&>button]:justify-center"
				options={[
					{ value: "ideas", label: `Ideas · ${ideas.length}`, icon: "Lightning" },
					{ value: "review", label: `Content review · ${inReview}`, icon: "SealCheck" },
				]}
			/>
			{tab === "ideas" ? <IdeasPanel /> : <ContentReview />}
		</div>
	);
}

// ─── Ideas ────────────────────────────────────────────────────────────────────

function IdeasPanel() {
	const { slug } = useSite();
	const { data, site, role, can, why } = useSiteCms();
	const ideas = useSitePendingIdeas();
	const auto = !!site.publishing?.autopost;
	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			<PageHeader
				title="Ideas"
				subtitle={`${ideas.length} waiting · ${auto ? "approved ideas are drafted, illustrated and shipped by the agents" : "approved ideas become briefs; drafts come back here for review"}`}
				className="max-md:hidden"
			/>
			{!can("idea.approve") && (
				<Callout tone="neutral" icon="LockSimple" title="View only">
					{why("idea.approve")}. You can see what&apos;s waiting and why it was suggested.
				</Callout>
			)}
			{ideas.length === 0 ? (
				<Card variant="solid" padding="lg">
					<EmptyState
						icon="Lightning"
						title="No ideas waiting"
						body="The keyword swarm adds ideas on Monday. You can add one from the content plan."
						action={
							<RoleGate role={role} allow={["specialist", "admin"]} action="add ideas">
								<Button variant="secondary" href={sitePath(slug, "/plan/new")} icon="Plus">
									New idea
								</Button>
							</RoleGate>
						}
					/>
				</Card>
			) : (
				<ul aria-label="Ideas waiting for approval" className="thin-scrollbar grid grid-cols-1 gap-3 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto xl:grid-cols-3">
					{ideas.map((post) => {
						const kw = data.keywords.find((k) => k.id === post.keywordId);
						const pillar = data.pillars.find((p) => p.id === post.pillarId);
						return (
							<li key={post.id}>
								<Card variant="solid" padding="md" className="flex h-full flex-col gap-3">
									<div className="flex min-w-0 flex-wrap items-center gap-1.5">
										{pillar && (
											<Chip tone="neutral" size="sm">
												{pillar.name}
											</Chip>
										)}
										<Chip tone={post.source === "kas-gap" ? "agent" : "neutral"} size="sm">
											{IDEA_SOURCE_LABEL[post.source]}
										</Chip>
										<span className="ms-auto text-xs text-ink-3">W{post.week}</span>
									</div>
									<p className="font-display text-lg leading-snug">{post.title}</p>
									<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
										<dt className="text-ink-3">Keyword</dt>
										<dd className="truncate">{kw?.term ?? post.title}</dd>
										<dt className="text-ink-3">Intent</dt>
										<dd>{INTENT_LABEL[post.intent]}</dd>
										<dt className="text-ink-3">Difficulty</dt>
										<dd>{kw?.difficultyEvidence ?? "KD pending · next keyword swarm"}</dd>
									</dl>
									<IdeaCostNote post={post} />
									<IdeaApprovalRow post={post} className="mt-auto -ms-1.5 px-0" />
								</Card>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

// ─── Content review ───────────────────────────────────────────────────────────

function ContentReview() {
	const { slug } = useSite();
	const router = useRouter();
	const params = useSearchParams();
	const { data, site, role, actions, can } = useSiteCms();
	const manifest = useSiteManifest();
	const [query, setQuery] = useState("");
	const auto = !!site.publishing?.autopost;
	const { held } = useSiteStats();

	// Queue = posts in review, freshest first (ref 05: Day 1 · Day 2 · Day 4).
	const queue = useMemo(
		() =>
			data.posts
				.filter((p) => p.state === "in-review")
				.map((p) => ({ post: p, blocks: evaluateGate(p, data.slots, manifest).hard.length }))
				.sort((a, b) => a.post.daysInState - b.post.daysInState),
		[data, manifest],
	);
	const visible = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return queue;
		return queue.filter(({ post }) => post.title.toLowerCase().includes(q) || post.seoTitle.toLowerCase().includes(q));
	}, [queue, query]);

	const [approved, setApproved] = useState<{ postId: string; mrId: string } | null>(null);
	const paramId = params.get("post");
	const selectedId = paramId ?? approved?.postId ?? queue[0]?.post.id;
	const select = (id: string) => {
		setApproved(null);
		router.replace(sitePath(slug, `/approvals?tab=review&post=${id}`), { scroll: false });
	};

	const index = queue.findIndex((q) => q.post.id === selectedId);
	const needsAssets = data.posts.filter((p) => p.state === "needs-assets").length;

	const empty = (
		<EmptyState
			icon="SealCheck"
			title={auto ? "Nothing held for you" : "Nothing waiting for approval"}
			body={
				auto
					? `Autopost ships content once its idea is approved. Posts land here only when the agent holds one. ${needsAssets} ${needsAssets === 1 ? "is" : "are"} in Needs assets.`
					: `Posts land here when every image slot is filled. ${needsAssets} ${needsAssets === 1 ? "is" : "are"} in Needs assets.`
			}
			action={
				<Button variant="secondary" href={sitePath(slug, "/plan")} icon="ImagesSquare">
					See Needs assets
				</Button>
			}
		/>
	);

	const selectedPost = data.posts.find((p) => p.id === selectedId);

	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			<PageHeader
				title="Content review"
				subtitle={auto ? `${held} held by the agent${queue.length > held ? ` · ${queue.length - held} waiting from before autopost` : ""}` : `${queue.length} waiting`}
				className="max-md:hidden"
				actions={<TextField label="Search approvals" hideLabel icon="MagnifyingGlass" placeholder="Search" value={query} onChange={setQuery} className="w-[300px] max-lg:w-60" />}
			/>

			{auto && (
				<Callout
					tone="agent"
					icon="Robot"
					title="Autopost is on — content ships without review."
					action={
						<Button variant="secondary" size="sm" href={sitePath(slug, "/settings?tab=publishing")} icon="GearSix">
							Publishing settings
						</Button>
					}
				>
					Posts appear here only when the agent holds them: a hard block it can&apos;t clear, like a template that can&apos;t render the post or a budget cap. Fact markers are never shipped open.
				</Callout>
			)}

			{queue.length === 0 && !selectedPost ? (
				<Card variant="solid" padding="lg">
					{empty}
				</Card>
			) : (
				<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
					{/* Left · queue */}
					<nav aria-label="Approval queue" className="flex shrink-0 flex-col gap-2.5 max-md:hidden lg:w-[290px]">
						<ul aria-label="Waiting for approval" className="thin-scrollbar flex flex-col gap-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto max-lg:grid max-lg:grid-cols-3">
							{visible.map(({ post, blocks }) => (
								<li key={post.id}>
									<ApprovalQueueItem post={post} blocks={blocks} day={post.daysInState} selected={post.id === selectedId} onSelect={select} />
								</li>
							))}
							{visible.length === 0 && queue.length > 0 && <li className="px-2 text-sm text-ink-3">No post matches “{query}”.</li>}
							{queue.length === 0 && <li className="px-2 text-sm text-ink-3">Queue is clear.</li>}
						</ul>
						<Card variant="glass" padding="sm" className="text-xs leading-normal text-ink-3 max-lg:hidden">
							Approving asserts the facts are right, the voice is right, and the brand stands behind it. It can&apos;t be delegated to an agent.
						</Card>
					</nav>

					{selectedPost ? (
						<GateWorkspace
							key={selectedPost.id}
							post={selectedPost}
							position={{ index, count: queue.length, onChange: (i) => queue[i] && select(queue[i]!.post.id) }}
							approvedMrId={approved?.postId === selectedPost.id ? approved.mrId : undefined}
							onApproved={(mrId) => setApproved({ postId: selectedPost.id, mrId })}
							onNext={() => {
								const next = queue.find((q) => q.post.id !== selectedPost.id);
								if (next) select(next.post.id);
								else {
									setApproved(null);
									router.replace(sitePath(slug, "/approvals?tab=review"), { scroll: false });
								}
							}}
							canApproveRole={can("post.approve")}
							role={role}
							actions={actions}
						/>
					) : (
						<Card variant="solid" padding="lg" className="flex-1">
							<EmptyState icon="MagnifyingGlass" title="Post not found" body="It may have moved on or been deleted. Pick one from the queue." />
						</Card>
					)}
				</div>
			)}
		</div>
	);
}

interface IGateWorkspaceProps {
	post: IPost;
	position: { index: number; count: number; onChange: (i: number) => void };
	approvedMrId?: string;
	onApproved: (mrId: string) => void;
	onNext: () => void;
	canApproveRole: boolean;
	role: TRole;
	actions: ISiteCms["actions"];
}

function GateWorkspace({ post, position, approvedMrId, onApproved, onNext, canApproveRole, role, actions }: IGateWorkspaceProps) {
	const { slug } = useSite();
	const gate = useSiteGate(post.id);
	const approvedMr = useSiteMergeRequest(approvedMrId);
	const postMr = useSiteMergeRequest(post.mrId);

	if (approvedMr) return <ApprovedPanel post={post} mr={approvedMr} onNext={onNext} hasNext={position.count > 0} />;
	if (!gate) return null;
	if (post.state !== "in-review") {
		return (
			<Card variant="solid" padding="lg" className="flex-1">
				<Callout
					tone="neutral"
					title={`“${post.title}” isn't waiting for approval`}
					action={
						postMr ? (
							<Button variant="secondary" size="sm" href={sitePath(slug, `/merge-requests?mr=${postMr.id}`)} icon="GitPullRequest">
								View MR !{postMr.number}
							</Button>
						) : (
							<Button variant="secondary" size="sm" href={sitePath(slug, `/posts/${post.id}`)} icon="Eye">
								Open post
							</Button>
						)
					}
				>
					Only posts in review come through the gate.
				</Callout>
			</Card>
		);
	}
	return <Gate gate={gate} position={position} onApproved={onApproved} canApproveRole={canApproveRole} role={role} actions={actions} />;
}

// ─── The gate ─────────────────────────────────────────────────────────────────

function Gate({ gate, position, onApproved, canApproveRole, role, actions }: Omit<IGateWorkspaceProps, "post" | "approvedMrId" | "onNext"> & { gate: IGateView }) {
	const { slug } = useSite();
	const { data, site } = useSiteCms();
	const { toast } = useToast();
	const post = gate.post;
	const held = useSiteAutopostHold(post.id);
	const keyword = data.keywords.find((k) => k.id === post.keywordId);
	const latest = post.versions[post.versions.length - 1];

	const [overrides, setOverrides] = useState<Record<string, string>>({});
	const [asserts, setAsserts] = useState<TAsserts>(NONE);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sendBackOpen, setSendBackOpen] = useState(false);

	// E5: the draft changed after assertions were ticked → reset and say so.
	const signature = `${post.versions.length}:${post.words}:${post.blocks.length}`;
	const lastSig = useRef(signature);
	useEffect(() => {
		if (lastSig.current === signature) return;
		lastSig.current = signature;
		setAsserts((a) => {
			if (a.some(Boolean)) toast({ title: "The draft changed. Confirm again.", tone: "human" });
			return NONE;
		});
	}, [signature, toast]);

	const hard = hardBlocks(gate, slug);
	// Seed values carry a " · soft" suffix; the soft-block heading already says so.
	const soft = gate.soft.map((c) => ({ ...c, value: c.value.replace(/ · soft$/, "") }));
	const pending = pendingSoft(gate);
	const missingReasons = pending.filter((c) => (overrides[c.id]?.trim().length ?? 0) < MIN_REASON);
	const confirmed = asserts.filter(Boolean).length;
	const repo = site.repo;

	const reasons: string[] = [
		...hard.map((h) => h.text),
		...missingReasons.map((c) => `Add a reason for the soft override · ${c.label} (${MIN_REASON}+ characters)`),
		...ASSERTIONS.filter((_, i) => !asserts[i]).map((a) => `Confirm: ${a.toLowerCase()}`),
		...(repo ? [] : ["Connect a repo first. The MR needs somewhere to open"]),
	];
	const summary = hard.length
		? `${hard.length} hard block${hard.length > 1 ? "s" : ""}`
		: missingReasons.length
			? "Add a reason"
			: !repo
				? "Repo not connected"
				: `${confirmed} of 3 confirmed`;

	const approve = () => {
		setBusy(true);
		setError(null);
		const typed = Object.fromEntries(pending.map((c) => [c.id, overrides[c.id]!.trim()]));
		window.setTimeout(async () => {
			const r = await actions.approve(post.id, typed);
			setBusy(false);
			if (r.ok && r.id) onApproved(r.id);
			else if (!r.ok) setError(r.reason);
		}, 700);
	};

	const primary = (
		<RoleGate
			role={role}
			allow={APPROVERS}
			fallback={<LockedAction label="Approve and open MR" icon="GitPullRequest" reasons={[ROLE_GATE_COPY]} summary="Specialist or admin" className={MOBILE_WIDE} />}
		>
			<LockedAction
				label={busy ? "Opening merge request…" : "Approve and open MR"}
				icon="GitPullRequest"
				reasons={reasons}
				summary={summary}
				unlocked={reasons.length === 0}
				loading={busy}
				onClick={approve}
				className={MOBILE_WIDE}
			/>
		</RoleGate>
	);

	const sendBack = (
		<RoleGate role={role} allow={APPROVERS} action="send content back">
			<Button variant="secondary" size="lg" icon="ArrowUUpLeft" onClick={() => setSendBackOpen(true)} className="max-md:hidden">
				Send back
			</Button>
		</RoleGate>
	);

	const draft = repo ? draftMr(post, data.slots, repo, gate.manifest?.output ?? "mdx", overrides, gate) : null;

	return (
		<>
			{/* ─── Center · post + gate (desktop / tablet) ─── */}
			<section aria-label="Approval gate" className="thin-scrollbar flex min-w-0 flex-col gap-[18px] rounded-2xl bg-surface px-7 py-6 max-md:hidden lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
				<div className="flex items-start gap-3">
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<h2 className="tracking-display font-display text-2xl leading-tight">{post.seoTitle}</h2>
						<div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-ink-3">
							<span>{keyword?.term ?? post.title}</span>
							<Chip size="sm" tone="neutral">
								{INTENT_LABEL[post.intent]}
							</Chip>
							<span className="tabular">{fmtInt(post.words)} words</span>
							{latest && (
								<span>
									v{latest.n} · {ORIGIN_LABEL[latest.origin].toLowerCase()}
								</span>
							)}
						</div>
					</div>
					<Button variant="secondary" size="sm" icon="Eye" href={sitePath(slug, `/posts/${post.id}`)}>
						Open draft
					</Button>
				</div>

				{!canApproveRole && (
					<Callout tone="neutral" icon="LockSimple" title="View only">
						{ROLE_GATE_COPY}
					</Callout>
				)}

				{held && (
					<Callout tone="human" icon="Hand" title={held.title}>
						The CMS agent stopped instead of shipping around the block. Fix it here, then approve, or send it back.
					</Callout>
				)}

				<ReadinessGrid items={readinessItems(gate, data.slots)} />

				{hard.length > 0 && <HardBlockList blocks={hard} />}

				{soft.map((c) =>
					c.override?.reason ? (
						<OverriddenNote key={c.id} label={`${c.label} ${c.value}`} reason={c.override.reason} by={c.override.by} />
					) : (
						<RoleGate key={c.id} role={role} allow={APPROVERS} action="override a soft block">
							<div className="flex flex-col gap-1.5">
								<OverrideReason check={c} value={overrides[c.id] ?? ""} onChange={(v) => setOverrides((o) => ({ ...o, [c.id]: v }))} />
								{(overrides[c.id]?.trim().length ?? 0) > 0 && (overrides[c.id]?.trim().length ?? 0) < MIN_REASON && (
									<span className="text-xs text-human-ink">A few more words · at least {MIN_REASON} characters</span>
								)}
							</div>
						</RoleGate>
					),
				)}

				<RoleGate role={role} allow={APPROVERS} action="approve content">
					<AssertionList values={asserts} onChange={(i, v) => setAsserts((a) => a.map((x, j) => (j === i ? v : x)) as TAsserts)} />
				</RoleGate>

				{error && (
					<Callout tone="block" title="The merge request didn't open. Your approval wasn't recorded.">
						{error}
					</Callout>
				)}

				<div className="sticky bottom-0 z-10 -mx-7 -mb-6 mt-auto flex flex-wrap items-center gap-2.5 bg-surface px-7 pt-3 pb-6">
					{sendBack}
					<span className="flex-1" />
					{reasons.length === 0 && canApproveRole && (
						<span className="text-sm text-ink-4" aria-live="polite">
							3 of 3 confirmed
						</span>
					)}
					{primary}
				</div>
			</section>

			{/* ─── Right · MR preview (desktop / tablet) ─── */}
			<aside aria-label="Merge request preview" className="thin-scrollbar flex shrink-0 flex-col gap-3 max-md:hidden lg:min-h-0 lg:w-[380px] lg:overflow-y-auto">
				{repo && draft && keyword ? (
					<MRPreview mr={draft} post={withTypedOverrides(post, overrides)} keyword={keyword} repo={repo} hideStatus />
				) : (
					<DataGap label="Repo not connected" reason="The MR preview needs the site's repo. A developer connects it in Settings." />
				)}
			</aside>

			{/* ─── Mobile 390 (ref 05 mobile) ─── */}
			<MobileGate
				post={post}
				gate={gate}
				position={position}
				overrides={overrides}
				setOverrides={setOverrides}
				asserts={asserts}
				setAsserts={setAsserts}
				hard={hard}
				role={role}
				primary={primary}
				onSendBack={() => setSendBackOpen(true)}
				error={error}
				branch={draft ? `${draft.branch} → ${draft.base}` : null}
				imageCount={data.slots.filter((s) => s.postId === post.id && s.status === "selected").length}
			/>

			<SendBackDialog open={sendBackOpen} onClose={() => setSendBackOpen(false)} post={post} actions={actions} />
		</>
	);
}

function HardBlockList({ blocks }: { blocks: IHardBlock[] }) {
	return (
		<div role="alert" className="flex flex-col gap-2 rounded-lg bg-block-soft px-4 py-3.5">
			<span className="flex items-center gap-1.5 font-display text-md text-block-ink">
				<Icon name="XCircle" size={15} />
				Hard block{blocks.length > 1 ? "s" : ""} · fix to approve (no override)
			</span>
			<ul className="flex flex-col gap-1.5">
				{blocks.map((b) => (
					<li key={b.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
						<span className="min-w-0 flex-1">{b.text}</span>
						<Button variant="ghost" size="sm" href={b.href} trailing={<Icon name="ArrowUpRight" size={13} />}>
							{b.cta}
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}

function OverriddenNote({ label, reason, by }: { label: string; reason: string; by?: string }) {
	return (
		<div className="flex flex-col gap-2 rounded-lg bg-human-soft/40 px-4 py-3 ring-1 ring-human-line/60">
			<span className="flex items-center gap-2 text-sm">
				<Icon name="WarningCircle" size={15} className="text-human" />
				<span className="flex-1">{label} · overridden</span>
			</span>
			<span className="text-sm leading-normal text-ink-3">
				“{reason}”{by ? ` · ${by}` : ""}
			</span>
		</div>
	);
}

// ─── Mobile ───────────────────────────────────────────────────────────────────

interface IMobileGateProps {
	post: IPost;
	gate: IGateView;
	position: { index: number; count: number; onChange: (i: number) => void };
	overrides: Record<string, string>;
	setOverrides: (fn: (o: Record<string, string>) => Record<string, string>) => void;
	asserts: TAsserts;
	setAsserts: (fn: (a: TAsserts) => TAsserts) => void;
	hard: IHardBlock[];
	role: TRole;
	primary: ReactNode;
	onSendBack: () => void;
	error: string | null;
	branch: string | null;
	imageCount: number;
}

function MobileGate({ post, gate, position, overrides, setOverrides, asserts, setAsserts, hard, role, primary, onSendBack, error, branch, imageCount }: IMobileGateProps) {
	const { slug } = useSite();
	const [open, setOpen] = useState(false);
	const tiles = readinessItems(gate, useSiteCms().data.slots);
	return (
		<div className="flex shrink-0 flex-col gap-3 md:hidden">
			<div className="flex items-center gap-2">
				<IconButton icon="ArrowLeft" label="Back to plan" variant="white" href={sitePath(slug, "/plan")} />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-xs text-ink-4">{position.index >= 0 ? `Approval ${position.index + 1} of ${position.count}` : "Approval"}</span>
					<span className="truncate font-display text-md">{post.title.split(":")[0]}</span>
				</div>
				{position.count > 1 && position.index >= 0 && <PaginationDots count={position.count} index={position.index} onChange={position.onChange} />}
				<IconButton icon="Eye" label="Open draft" variant="white" href={sitePath(slug, `/posts/${post.id}`)} />
			</div>

			<Card variant="solid" padding="md" className="flex flex-col gap-3">
				<h2 className="tracking-display font-display text-[19px] leading-tight">{post.seoTitle}</h2>
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen((o) => !o)}
					className={`press flex items-center gap-2 rounded-md px-3 py-2.5 text-start text-sm ${hard.length ? "bg-block-soft text-block-ink" : "bg-pass-soft text-pass-ink"}`}
				>
					<Icon name={hard.length ? "XCircle" : "CheckCircle"} size={16} />
					<span className="flex-1">{hard.length ? `${hard.length} hard block${hard.length > 1 ? "s" : ""} · fix in the editor` : "All 4 hard checks pass"}</span>
					<Icon name={open ? "CaretUp" : "CaretDown"} size={14} />
				</button>
				{open && <ReadinessGrid items={tiles} />}
				{open && hard.length > 0 && <HardBlockList blocks={hard} />}
				{gate.soft.map((raw) => {
					const c = { ...raw, value: raw.value.replace(/ · soft$/, "") };
					const r = c.override?.reason ?? "";
					if (r) return <OverriddenNote key={c.id} label={`${c.label} ${c.value}`} reason={r} />;
					return (
						<RoleGate key={c.id} role={role} allow={APPROVERS} action="override a soft block">
							<TextArea
								label={`${c.label} ${c.value} · soft block, override with a reason`}
								value={overrides[c.id] ?? ""}
								onChange={(v) => setOverrides((o) => ({ ...o, [c.id]: v }))}
								rows={2}
								placeholder="Why is this fine to ship?"
								hint="Logged to the audit trail and listed in the MR"
							/>
						</RoleGate>
					);
				})}
			</Card>

			<Card variant="solid" padding="sm" className="px-4">
				<RoleGate role={role} allow={APPROVERS} action="approve content">
					<AssertionList values={asserts} onChange={(i, v) => setAsserts((a) => a.map((x, j) => (j === i ? v : x)) as TAsserts)} />
				</RoleGate>
			</Card>

			<Card variant="solid" padding="md" className="flex flex-col gap-2">
				<span className="flex items-center gap-2 font-display text-md">
					<Icon name="GitPullRequest" size={16} />
					Opens on GitHub
				</span>
				{branch ? <span className="font-mono text-xs text-ink-2">{branch}</span> : <span className="text-sm text-ink-3">Repo not connected</span>}
				<span className="text-sm text-ink-3">
					1 post · {imageCount} image{imageCount === 1 ? "" : "s"} · sitemap
				</span>
			</Card>

			{error && (
				<Callout tone="block" title="The merge request didn't open.">
					{error}
				</Callout>
			)}

			<div aria-hidden className="h-2" />
			<div className="sticky -bottom-9 z-10 -mx-4 -mb-9 flex min-w-0 gap-2 bg-linear-to-t from-canvas from-75% to-transparent px-4 pt-5 pb-9">
				<RoleGate role={role} allow={APPROVERS} action="send content back">
					<IconButton icon="ArrowUUpLeft" label="Send back" variant="white" onClick={onSendBack} className="size-[54px]" />
				</RoleGate>
				{primary}
			</div>
		</div>
	);
}

// ─── Send back ────────────────────────────────────────────────────────────────

function SendBackDialog({ open, onClose, post, actions }: { open: boolean; onClose: () => void; post: IPost; actions: IGateWorkspaceProps["actions"] }) {
	const [note, setNote] = useState("");
	const submit = async () => {
		const r = await actions.sendBack(post.id, note);
		if (r.ok) {
			setNote("");
			onClose();
		}
	};
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Send back to the writer agent"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="ArrowUUpLeft" disabled={!note.trim()} onClick={submit}>
						Send back
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-ink-3">The post returns to Drafting and your note becomes the agent&apos;s instruction. Logged to the audit trail.</p>
				<TextArea label="What should change?" value={note} onChange={setNote} rows={4} placeholder="e.g. Soften the pricing claims and add the crown appointment." hint={note.trim() ? undefined : "A note is required"} />
			</div>
		</Dialog>
	);
}

// ─── After approval ───────────────────────────────────────────────────────────

function ApprovedPanel({ post, mr, onNext, hasNext }: { post: IPost; mr: IMergeRequest; onNext: () => void; hasNext: boolean }) {
	const { slug } = useSite();
	const { data, site } = useSiteCms();
	const keyword = data.keywords.find((k) => k.id === post.keywordId);
	return (
		<>
			<section aria-label="Approved" className="flex min-w-0 flex-col gap-4 rounded-2xl bg-surface px-7 py-6 max-md:px-4 max-md:py-4 lg:min-h-0 lg:flex-1">
				<Callout tone="pass" icon="GitPullRequest" title={`MR !${mr.number} opened on ${mr.host === "github" ? "GitHub" : "GitLab"}`}>
					<span className="font-mono text-xs">
						{mr.branch} → {mr.base}
					</span>
				</Callout>
				<h2 className="tracking-display font-display text-2xl leading-tight">{post.seoTitle}</h2>
				<p className="text-sm text-ink-3">
					Approved by you · facts, voice and brand asserted{mr.overrides.length ? ` · ${mr.overrides.length} override${mr.overrides.length > 1 ? "s" : ""} listed in the MR` : ""}. The repo&apos;s CI runs next; a developer merges.
				</p>
				<div className="mt-auto flex flex-wrap items-center gap-2.5">
					{hasNext && (
						<Button variant="secondary" icon="ArrowRight" onClick={onNext}>
							Next in queue
						</Button>
					)}
					<span className="flex-1" />
					<Button variant="primary" icon="GitPullRequest" href={sitePath(slug, `/merge-requests?mr=${mr.id}`)}>
						View MR
					</Button>
				</div>
			</section>
			<aside aria-label="Merge request" className="thin-scrollbar flex shrink-0 flex-col gap-3 lg:min-h-0 lg:w-[380px] lg:overflow-y-auto">
				{site.repo && keyword ? <MRPreview mr={mr} post={post} keyword={keyword} repo={site.repo} /> : site.repo ? <ScopeNote repo={site.repo} /> : null}
			</aside>
		</>
	);
}
