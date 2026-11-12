"use client";

// S05 /posts/[id] — split editor (ref 02) + S06 versions Sheet. Flows F2 (generation states), F3, F10.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	AgentBadge,
	Button,
	Callout,
	Card,
	Chip,
	Composer,
	Dialog,
	EmptyState,
	Icon,
	IconButton,
	KeyValue,
	LockedAction,
	Menu,
	ORIGIN_LABEL,
	ProgressBar,
	RoleGate,
	SegmentedControl,
	Sheet,
	Skeleton,
	STATE_LABEL,
	TextArea,
	type IMenuItem,
	SoftLockBanner,
} from "@/ds";
import { checkCap, estimateRun, fmtUsd, INTENT_LABEL, mrRef, TIER_LABEL } from "@/lib/logic";
import { type IGateView, useSite } from "@/lib/store";
import { useSiteCms, useSiteEditLock, useSiteGate, useSiteMrForPost } from "@/features/shared/site-source";
import { PageLoading } from "@/features/shared/page-loading";
import type { IPost, TRole } from "@/lib/types";
import { IdeaCostNote, RejectIdeaDialog } from "@/features/plan/idea-actions";
import { DiffReadyBar, DraftBlocks, DraftToolbar, FormatProvider, SeoTitleField } from "./draft";
import { CommentsCard, FactsCard, GateCard, PreviewCard, VersionsCard } from "./rail";
import { ago, findPost, latestVersion, sectionOf } from "./util";
import { VersionsSheet } from "./versions-sheet";
import { DiscoveryEvidenceCard } from "@/features/discovery/parts";
import { sitePath } from "@/lib/routes";

const EDITABLE_STATES: IPost["state"][] = ["needs-assets", "in-review"];
const SUGGESTIONS = ["Add an FAQ", "Put keyword in intro", "Change the angle"];

function readOnlyCopy(role: TRole, post: IPost): string {
	if (role === "stakeholder") return "Stakeholders can read and comment. Edits come from the Lumen team at Grandeur.";
	if (role === "developer") return "Developers review MRs; content edits are the specialist's.";
	if (post.state === "mr-open") return "MR open · changes after approval need a new approval.";
	if (post.state === "live" || post.state === "decaying") return "Live · edits go through a refresh cycle.";
	if (post.state === "drafting") return "The agent is writing. The draft unlocks when it's done.";
	return "Read-only";
}

// ─── Approve (header primary) ────────────────────────────────────────────────

function ApproveAction({ post, gate, compact }: { post: IPost; gate: IGateView | null; compact?: boolean }) {
	const { slug } = useSite();
	const router = useRouter();
	const { can, site, actions, state } = useSiteCms();
	const mr = useSiteMrForPost(post.id);
	const [busy, setBusy] = useState(false);
	if (post.state === "mr-open" && mr)
		return (
			<Button variant="primary" icon="GitPullRequest" href={sitePath(slug, `/merge-requests?mr=${mr.id}`)}>
				{compact ? mrRef(mr) : `View MR ${mrRef(mr)}`}
			</Button>
		);
	if (post.state === "live" || post.state === "decaying")
		return (
			<Button variant="secondary" icon="Globe" href={`https://${site.domain}/blog/${post.slug}`}>
				{compact ? "Live" : "View live page"}
			</Button>
		);
	if (!can("post.approve")) return <LockedAction label="Approve" reasons={["Your role can comment. Tolu B. approves."]} summary={compact ? undefined : "Tolu B. approves"} />;

	// Autopost sites: the specialist can run the agent gate now instead of approving (it ships or holds the post).
	if (site.publishing?.autopost && post.state !== "in-review") {
		// Only a provider call still in flight blocks Ship now; a stalled slot is re-queued and filled by the agent.
		const generating = gate?.unfilledSlots.some((s) => s.status === "generating" && state.jobs.some((j) => j.kind === "slot-candidates" && j.payload.slotId === s.id));
		const why =
			post.state === "idea" || post.state === "briefed" ? ["No draft yet"] : post.state === "drafting" ? ["The agent is still writing the draft"] : generating ? ["Images are still generating"] : [];
		return (
			<LockedAction
				label="Ship now"
				icon="Lightning"
				reasons={why}
				unlocked={why.length === 0}
				loading={busy}
				summary={compact && why.length ? String(why.length) : why.length ? why[0] : undefined}
				onClick={() => {
					setBusy(true);
					window.setTimeout(() => {
						actions.shipNow(post.id);
						setBusy(false);
					}, 500);
				}}
			/>
		);
	}

	let reasons: string[];
	if (post.state === "idea" || post.state === "briefed") reasons = ["No draft yet"];
	else if (post.state === "drafting") reasons = ["The agent is still writing the draft"];
	else reasons = gate?.hard ?? [];
	if (!reasons.length && post.state !== "in-review") reasons = ["Send it to review first"];
	const unlocked = post.state === "in-review" && reasons.length === 0;
	return (
		<LockedAction
			label="Approve"
			icon={unlocked ? "SealCheck" : undefined}
			reasons={reasons}
			unlocked={unlocked}
			summary={compact && reasons.length ? String(reasons.length) : undefined}
			onClick={() => router.push(sitePath(slug, `/approvals?post=${post.id}`))}
		/>
	);
}

// ─── Draft states (F2) ───────────────────────────────────────────────────────

function IdeaEmpty({ post }: { post: IPost }) {
	const { actions, role, site } = useSiteCms();
	const [rejecting, setRejecting] = useState(false);
	const auto = !!site.publishing?.autopost;
	return (
		<>
			<EmptyState
				icon="Lightning"
				title="This idea needs your approval"
				body={
					auto
						? "Approve it and the agents take it from here: brief, draft, images, the gate and the merge request. Content ships without review; hard blocks still hold it."
						: "Approve it and it becomes a brief. The draft comes back to you for review before anything ships."
				}
				action={
					<RoleGate role={role} allow={["specialist", "admin"]} action="approve ideas">
						<div className="flex flex-wrap items-center justify-center gap-2">
							<Button variant="ghost" icon="X" onClick={() => setRejecting(true)}>
								Reject
							</Button>
							<Button variant="primary" icon="SealCheck" onClick={() => actions.approveIdea(post.id)}>
								Approve idea
							</Button>
						</div>
					</RoleGate>
				}
			/>
			<IdeaCostNote post={post} />
			<div className="mx-auto w-full max-w-md">
				<DiscoveryEvidenceCard post={post} />
			</div>
			<RejectIdeaDialog post={post} open={rejecting} onClose={() => setRejecting(false)} />
		</>
	);
}

function BriefPanel({ post }: { post: IPost }) {
	const { actions, data, role, site } = useSiteCms();
	const gate = useSiteGate(post.id);
	const kw = data.keywords.find((k) => k.id === post.keywordId);
	const pillar = data.pillars.find((p) => p.id === post.pillarId);
	const strong = post.strongModel || post.contentType === "pillar" || post.contentType === "money-page";
	const est = estimateRun("post-generation", site, { strongModel: strong });
	const cap = checkCap(site, "post-generation", est);
	const left = Math.max(0, site.budgets.textCapUsd - site.budgets.textUsd);
	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Icon name="Note" size={17} />
				<h2 className="font-display text-lg">Brief</h2>
				<AgentBadge label="Brief by the blog writer agent" className="ms-auto" />
			</div>
			<KeyValue
				rows={[
					{ k: "Keyword", v: kw?.term ?? post.title },
					{ k: "Intent", v: INTENT_LABEL[post.intent] },
					{ k: "Difficulty", v: kw?.difficultyEvidence ?? "KD pending · next keyword swarm" },
					{ k: "Pillar", v: pillar?.name ?? "—" },
					{ k: "Scheduled", v: `W${post.week} · generates in its publish slot` },
					{ k: "Template", v: gate?.manifest ? `Slots from manifest v${gate.manifest.version}` : "No confirmed manifest" },
				]}
			/>
			<div className="flex flex-wrap items-center gap-3">
				{cap.status === "refused" ? (
					<LockedAction label="Generate now" reasons={[cap.message]} summary="over cap" />
				) : (
					<RoleGate role={role} allow={["specialist", "admin"]} action="generate drafts">
						<Button variant="primary" icon="Sparkle" onClick={() => actions.generateNow(post.id)}>
							Generate now
						</Button>
					</RoleGate>
				)}
				<span className="tabular text-sm text-ink-3">
					Est. {fmtUsd(est.usd)} · {TIER_LABEL[est.tier].toLowerCase()} model · {fmtUsd(left)} left of text cap
				</span>
			</div>
		</div>
	);
}

function DraftingPanel({ post }: { post: IPost }) {
	const pct = Math.max(0, Math.min(100, post.progress?.value ?? 0)) / 100;
	return (
		<div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-lg bg-sunken-2 p-4">
			<div className="flex flex-wrap items-center gap-2">
				<AgentBadge running label="Blog writer agent" model={post.strongModel ? "strongest" : "workhorse"} />
				<span className="text-sm text-ink-3">{post.sendBackNote ? `Revising from your note: “${post.sendBackNote}”` : "The draft is read-only while the agent writes"}</span>
			</div>
			<ProgressBar value={pct} label={post.progress?.label ?? "Queued for the writer agent"} size="md" />
		</div>
	);
}

function StateBanner({ post }: { post: IPost }) {
	const { slug } = useSite();
	const { actions, can, site } = useSiteCms();
	const gate = useSiteGate(post.id);
	const mr = useSiteMrForPost(post.id);
	if (post.state === "needs-assets") {
		const n = gate?.unfilledSlots.length ?? 0;
		return (
			<Callout
				tone="human"
				icon="Hand"
				title={n ? `${n} image slot${n > 1 ? "s" : ""} still unfilled` : "Every slot is filled"}
				action={
					<Button variant="secondary" size="sm" icon="ImagesSquare" href={sitePath(slug, `/posts/${post.id}/assets`)}>
						Image slots
					</Button>
				}
			>
				{site.publishing?.autopost
					? "Autopost is on: the visual-asset agent fills what's left and the CMS agent runs the gate. Slots you mark human-only wait for you."
					: n
						? "The post moves to In review when every slot is filled."
						: "Send it to review from the image pipeline."}
			</Callout>
		);
	}
	if (post.state === "mr-open")
		return (
			<Callout
				tone="human"
				icon="Hand"
				title={mr ? `MR !${mr.number} is open · changes after approval need a new approval` : "MR open · changes after approval need a new approval"}
				action={
					mr ? (
						<Button variant="secondary" size="sm" icon="GitPullRequest" href={sitePath(slug, `/merge-requests?mr=${mr.id}`)}>
							View MR
						</Button>
					) : undefined
				}
			>
				The draft is read-only here. Send notes in the comments.
			</Callout>
		);
	if (post.state === "live")
		return (
			<Callout
				tone="pass"
				icon="CheckCircle"
				title="Live · read-only"
				action={
					mr ? (
						<Button variant="secondary" size="sm" icon="GitMerge" href={sitePath(slug, `/merge-requests?mr=${mr.id}`)}>
							MR !{mr.number}
						</Button>
					) : undefined
				}
			>
				Edits to a live post go through a refresh cycle, which drafts a new version.
			</Callout>
		);
	if (post.state === "decaying")
		return (
			<Callout
				tone="block"
				icon="TrendDown"
				title="Decaying · read-only"
				action={
					can("post.generate") ? (
						<Button variant="agent" size="sm" icon="Sparkle" onClick={() => actions.generateNow(post.id)}>
							Refresh now
						</Button>
					) : undefined
				}
			>
				Position is slipping. A refresh redrafts it as a new version for review.
			</Callout>
		);
	return null;
}

// ─── Composer (region 5) ─────────────────────────────────────────────────────

function ComposerArea({ post, canEdit, scopeId, onClearScope }: { post: IPost; canEdit: boolean; scopeId: string | null; onClearScope: () => void }) {
	const { actions, role, state } = useSiteCms();
	const [value, setValue] = useState("");
	const busy = state.jobs.some((j) => j.kind === "suggestion-ready" && j.siteId === state.siteId && j.payload.postId === post.id);
	if (!canEdit) {
		if (role !== "stakeholder" && role !== "developer") return null;
		return (
			<Callout tone="info" icon="LockSimple" title={role === "stakeholder" ? "You can read and comment" : "Read-only for developers"}>
				{readOnlyCopy(role, post)}
			</Callout>
		);
	}
	const section = scopeId ? sectionOf(post, scopeId) : null;
	return (
		<div className="flex flex-col gap-2">
			{scopeId && (
				<Chip tone="neutral" icon="TextAa" size="sm" onRemove={onClearScope} removeLabel="Clear scope" className="self-start">
					This section{section ? ` · ${section}` : ""}
				</Chip>
			)}
			<Composer
				surface="sunken"
				placeholder="Instruct the agent — every change comes back as a diff"
				value={value}
				onChange={setValue}
				busy={busy}
				suggestions={SUGGESTIONS}
				onSuggestion={(s) => actions.instructAgent(post.id, s.toLowerCase())}
				onSubmit={async (v) => {
					const r = await actions.instructAgent(post.id, v, scopeId ?? undefined);
					if (r.ok) setValue("");
				}}
			/>
		</div>
	);
}

// ─── Draft card (left column) ────────────────────────────────────────────────

function DraftBody({ post, canEdit, scopeId, onScope, compact }: { post: IPost; canEdit: boolean; scopeId: string | null; onScope: (id: string) => void; compact?: boolean }) {
	if (post.state === "idea") return <IdeaEmpty post={post} />;
	if (post.state === "briefed") return <BriefPanel post={post} />;
	return (
		<div className="flex flex-col gap-4">
			<StateBanner post={post} />
			{post.state === "drafting" && <DraftingPanel post={post} />}
			<SeoTitleField post={post} canEdit={canEdit} compact={compact} />
			{post.blocks.length ? (
				<DraftBlocks post={post} canEdit={canEdit} scopeId={scopeId} onScope={onScope} compact={compact} />
			) : (
				<div aria-hidden className="flex flex-col gap-3">
					{["100%", "92%", "78%", "40%", "96%", "84%"].map((w, i) => (
						<Skeleton key={i} className={i === 3 ? "h-5" : "h-3.5"} radius={6} />
					))}
				</div>
			)}
		</div>
	);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export interface IPostEditorProps {
	id: string;
	/** Render the S06 versions Sheet over the editor (route /posts/[id]/versions). */
	versions?: boolean;
}

export function PostEditor({ id, versions }: IPostEditorProps) {
	const { slug } = useSite();
	const router = useRouter();
	const params = useSearchParams();
	const { data, role, can, actions, site, loading } = useSiteCms();
	const post = findPost(data, id);
	const gate = useSiteGate(post?.id);
	const mr = useSiteMrForPost(post?.id);
	const [scopeId, setScopeId] = useState<string | null>(null);
	const [tab, setTab] = useState<"draft" | "preview" | "gate">("draft");
	const [sendBack, setSendBack] = useState(false);
	const [note, setNote] = useState("");
	const [comments, setComments] = useState(false);
	const [preview, setPreview] = useState(false);
	const asideRef = useRef<HTMLElement>(null);

	// Soft edit lock (multi-user): claim it while this person can edit, renew every minute, release on leave.
	// When someone else holds a fresh lock the draft is view-only until they leave or you take over.
	const lock = useSiteEditLock(post?.id);
	const mayEdit = !!post && can("post.edit") && EDITABLE_STATES.includes(post.state);
	const lockedOut = !!lock.holder;
	useEffect(() => {
		if (!post?.id || !mayEdit || lockedOut) return;
		const postId = post.id;
		actions.startEditing(postId);
		const renew = window.setInterval(() => actions.startEditing(postId), 60_000);
		return () => {
			window.clearInterval(renew);
			actions.stopEditing(postId);
		};
	}, [post?.id, mayEdit, lockedOut, actions]);

	if (!post && loading) return <PageLoading rows={5} />;
	if (!post)
		return (
			<Card variant="solid" padding="lg" className="rounded-3xl">
				<EmptyState icon="FileText" title="Post not found" body={`No post “${decodeURIComponent(id)}” on this site. It may belong to another client.`} action={<Button variant="secondary" href={sitePath(slug, "/plan")}>Back to the content plan</Button>} />
			</Card>
		);

	const canEdit = mayEdit && !lockedOut;
	const cur = latestVersion(post);
	const hard = post.state === "in-review" || post.state === "needs-assets" ? (gate?.hard.length ?? 0) : 0;
	const generatable = ["briefed", "decaying"].includes(post.state);
	const drafting = post.state === "drafting";
	const base = sitePath(slug, `/posts/${post.id}`);
	const toolbarNote = role === "stakeholder" ? "Read-only · you can comment" : role === "developer" ? "Read-only · developers review MRs" : post.state === "mr-open" ? "Read-only · MR open" : drafting ? "Read-only · agent writing" : "Read-only";

	const menuItems = (mobile: boolean): IMenuItem[] =>
		[
			mobile ? { id: "versions", label: "Versions", icon: "ClockCounterClockwise" as const, onSelect: () => router.push(`${base}/versions`) } : null,
			mobile ? { id: "comments", label: `Comments${post.comments.length ? ` · ${post.comments.length}` : ""}`, icon: "ChatCircle" as const, onSelect: () => setComments(true) } : null,
			{
				id: "send-back",
				label: can("post.sendBack") ? (post.state === "in-review" ? "Send back to the agent…" : "Send back · only from In review") : "Send back · specialist only",
				icon: "ArrowsClockwise" as const,
				disabled: post.state !== "in-review" || !can("post.sendBack"),
				onSelect: () => setSendBack(true),
			},
			{
				id: "generate",
				label: post.state === "idea" ? "Generate now · approve the idea first" : generatable ? "Generate now" : "Generate now · Briefed or Decaying only",
				icon: "Sparkle" as const,
				disabled: !generatable || !can("post.generate"),
				onSelect: () => actions.generateNow(post.id),
			},
			{ id: "assets", label: "Image slots", icon: "ImagesSquare" as const, onSelect: () => router.push(`${base}/assets`) },
			mr ? { id: "mr", label: `Open MR ${mrRef(mr)}`, icon: "GitPullRequest" as const, onSelect: () => router.push(sitePath(slug, `/merge-requests?mr=${mr.id}`)) } : null,
		].filter((x): x is NonNullable<typeof x> => !!x);

	const focusComments = () => {
		const el = document.getElementById("post-comments");
		if (!el) return setComments(true);
		el.scrollIntoView({ behavior: "smooth", block: "start" });
		el.querySelector("textarea")?.focus({ preventScroll: true });
	};

	const railCards: ReactNode[] = [
		<DiscoveryEvidenceCard key="discovery" post={post} />,
		<GateCard key="gate" post={post} loading={drafting} />,
		<FactsCard key="facts" post={post} />,
		<VersionsCard key="versions" post={post} />,
		<CommentsCard key="comments" post={post} id="post-comments" />,
	];
	// Stakeholders come for the comments (F10): thread at the top of the rail.
	const rail = role === "stakeholder" ? [railCards[4], ...railCards.slice(0, 4)] : railCards;

	const composer = <ComposerArea post={post} canEdit={canEdit} scopeId={scopeId} onClearScope={() => setScopeId(null)} />;

	return (
		<FormatProvider>
			<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
				{lock.holder && (
					<SoftLockBanner
						editor={{ name: lock.holder.name, initials: lock.holder.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() }}
						since={lock.holder.since}
						onTakeOver={mayEdit ? () => actions.startEditing(post.id, { takeOver: true }) : undefined}
						takeOverLocked={mayEdit ? null : "Your role can view this draft but not edit it"}
					/>
				)}
				{/* Header · desktop */}
				<header className="hidden shrink-0 items-center gap-2.5 lg:flex">
					<IconButton icon="ArrowLeft" label="Back to the content plan" href={sitePath(slug, "/plan")} />
					<nav aria-label="Breadcrumb" className="flex h-11 min-w-0 items-center gap-2.5 whitespace-nowrap rounded-pill bg-surface px-[18px] text-md text-ink-3">
						<Link href={sitePath(slug, "/plan")} className="hover:text-ink">
							Content plan
						</Link>
						<Icon name="CaretRight" size={11} />
						<Link href={sitePath(slug, "/plan")} className="hover:text-ink">
							{STATE_LABEL[post.state]}
						</Link>
						<Icon name="CaretRight" size={11} />
						<h1 aria-current="page" className="truncate font-display text-base text-ink">
							{post.title}
						</h1>
					</nav>
					{cur && (
						<Link href={`${base}/versions`} aria-label={`Version ${cur.n}, ${ORIGIN_LABEL[cur.origin]}, ${ago(cur.at)} · open versions`} className="press flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill bg-surface px-4 font-display text-md hover:bg-sunken">
							<Icon name="ClockCounterClockwise" size={16} />v{cur.n}
							<span className="font-sans text-sm text-ink-3 max-xl:hidden">
								{ORIGIN_LABEL[cur.origin]} · {ago(cur.at)}
							</span>
						</Link>
					)}
					<div className="flex-1" />
					{site.publishing?.autopost && <AgentBadge label="Autopost on" className="max-xl:hidden" />}
					<IconButton icon="Eye" label="Live preview" onClick={() => setPreview(true)} className="xl:hidden" />
					<IconButton icon="ChatCircle" label={`Comments${post.comments.length ? ` · ${post.comments.length}` : ""}`} onClick={focusComments} />
					<Menu align="end" trigger={<IconButton icon="ArrowsClockwise" label="Regenerate and more" />} items={menuItems(false)} />
					<ApproveAction post={post} gate={gate} />
				</header>

				{/* Header · mobile */}
				<header className="flex shrink-0 items-center gap-2 lg:hidden">
					<IconButton icon="ArrowLeft" label="Back to the content plan" href={sitePath(slug, "/plan")} />
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="text-xs text-ink-3">
							{STATE_LABEL[post.state]}
							{cur ? ` · v${cur.n}` : ""}
						</span>
						<h1 className="truncate font-display text-base">{post.title}</h1>
					</div>
					<ApproveAction post={post} gate={gate} compact />
					<Menu align="end" trigger={<IconButton icon="DotsThree" label="More actions" />} items={menuItems(true)} />
				</header>

				{/* Mobile tabs */}
				<div className="flex flex-col gap-3 lg:hidden">
					<SegmentedControl
						label="Editor view"
						className="w-full [&>button]:flex-1 [&>button]:justify-center"
						value={tab}
						onChange={setTab}
						options={[
							{ value: "draft", label: "Draft" },
							{ value: "preview", label: "Preview" },
							{ value: "gate", label: hard ? `Gate · ${hard}` : "Gate" },
						]}
					/>
					{hard > 0 && tab !== "gate" && (
						<Callout tone="block" icon="WarningDiamond" title={`${hard} hard block${hard > 1 ? "s" : ""} before approval`} action={<Button variant="ghost" size="sm" onClick={() => setTab("gate")}>Review</Button>} />
					)}
				</div>

				{/* Body */}
				<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
					<Card variant="solid" padding="none" className={`min-w-0 flex-col rounded-3xl lg:min-h-0 lg:flex-1 lg:overflow-hidden ${tab === "draft" ? "flex" : "hidden lg:flex"}`}>
						<div className="hidden lg:block">
							<DraftToolbar post={post} canEdit={canEdit} readOnlyNote={toolbarNote} />
						</div>
						<div className="thin-scrollbar min-h-0 flex-1 px-[18px] py-5 lg:overflow-y-auto lg:px-10">
							<DraftBody post={post} canEdit={canEdit} scopeId={scopeId} onScope={setScopeId} />
						</div>
						{post.blocks.length > 0 && <div className="hidden border-t border-line px-[18px] pt-3.5 pb-[18px] lg:block">{composer}</div>}
					</Card>

					<PreviewCard post={post} className={`xl:w-[380px] xl:shrink-0 ${tab === "preview" ? "max-lg:flex" : "max-lg:hidden"} lg:max-xl:hidden`} />

					<aside
						ref={asideRef}
						aria-label="Gate, fact markers, versions and comments"
						className={`thin-scrollbar min-h-0 shrink-0 flex-col gap-3 lg:w-[290px] lg:overflow-y-auto ${tab === "gate" ? "flex" : "hidden lg:flex"}`}
					>
						{rail}
					</aside>
				</div>

				{/* Mobile: diff bar + composer pinned above the tab bar */}
				{tab === "draft" && post.blocks.length > 0 && (canEdit || role === "stakeholder" || role === "developer") && (
					<div className="sticky -bottom-28 z-10 -mx-4 -mb-24 flex flex-col gap-2.5 bg-linear-to-t from-canvas from-80% to-transparent px-4 pt-3 pb-24 lg:hidden">
						{canEdit && <DiffReadyBar post={post} />}
						{composer}
					</div>
				)}
			</div>

			<VersionsSheet post={post} open={!!versions} onClose={() => router.push(base)} initialId={params.get("v")} />

			<Sheet open={comments} onClose={() => setComments(false)} title="Comments" side="bottom">
				<CommentsCard post={post} />
			</Sheet>

			<Sheet open={preview} onClose={() => setPreview(false)} title="Live preview" width={440}>
				<PreviewCard post={post} className="h-[70vh]" />
			</Sheet>

			<Dialog
				open={sendBack}
				onClose={() => setSendBack(false)}
				title="Send back to the agent"
				footer={
					<>
						<Button variant="ghost" onClick={() => setSendBack(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							icon="ArrowsClockwise"
							disabled={!note.trim()}
							onClick={async () => {
								const r = await actions.sendBack(post.id, note);
								if (r.ok) {
									setSendBack(false);
									setNote("");
								}
							}}
						>
							Send back
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<p>The post returns to Drafting and the agent revises it as a new version. Est. $0.40 of the text cap.</p>
					<TextArea label="What should the agent change?" value={note} onChange={setNote} rows={3} placeholder="e.g. Say 'most patients' instead of a percentage." />
				</div>
			</Dialog>
		</FormatProvider>
	);
}
