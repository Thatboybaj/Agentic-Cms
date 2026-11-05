"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	Button,
	Card,
	CardHeader,
	Chip,
	CommentThread,
	Dialog,
	GateChecklist,
	Icon,
	OverrideReason,
	Skeleton,
	SourceNote,
	Timeline,
	VersionList,
	useToast,
	type ITimelineItem,
	type TIconName,
} from "@/ds";
import { LivePreview } from "@/features/preview";
import { fmtDateTime } from "@/lib/logic";
import { useCms, useGate, useSite } from "@/lib/store";
import type { IGateCheck, IPost, TTone } from "@/lib/types";
import { clockAfter, latestVersion } from "./util";
import { sitePath } from "@/lib/routes";

const MIN_REASON = 20;

// ─── Gate (region 7) ─────────────────────────────────────────────────────────

export function GateCard({ post, loading }: { post: IPost; loading?: boolean }) {
	const { slug } = useSite();
	const { actions, can, me } = useCms();
	const gate = useGate(post.id);
	const [overriding, setOverriding] = useState<IGateCheck | null>(null);
	const [reason, setReason] = useState("");
	const canFix = can("post.edit");
	const canOverride = can("gate.override");

	if (loading || !gate)
		return (
			<Card variant="solid" padding="md" className="flex flex-col gap-3" aria-busy="true">
				<div className="flex items-center gap-2">
					<Icon name="ListChecks" size={17} />
					<h3 className="font-display text-lg">On-page gate</h3>
					<span className="ms-auto text-sm text-ink-3">after the draft</span>
				</div>
				{[0, 1, 2, 3, 4].map((i) => (
					<Skeleton key={i} className="h-5 w-full" />
				))}
			</Card>
		);

	// Derived soft blocks (word count, disclaimer) sit outside the optimizer's 12-check score.
	const extra = gate.soft.filter((c) => !post.gate.some((g) => g.id === c.id));
	const close = () => {
		setOverriding(null);
		setReason("");
	};

	return (
		<>
			<GateChecklist
				checks={post.gate}
				onFix={canFix ? (id) => actions.fixCheck(post.id, id) : undefined}
				onOverride={canOverride ? (id) => setOverriding(post.gate.find((c) => c.id === id) ?? null) : undefined}
			/>
			{(extra.length > 0 || gate.unfilledSlots.length > 0 || gate.missingStructures.length > 0) && (
				<Card variant="solid" padding="md" className="flex flex-col gap-2.5">
					<span className="text-xs text-ink-3">Also checked before approval</span>
					<ul className="flex flex-col gap-2">
						{gate.unfilledSlots.length > 0 && (
							<li className="flex items-center gap-2 text-[12.5px]">
								<Icon name="XCircle" size={16} className="shrink-0 text-block" />
								<span className="flex-1">
									{gate.unfilledSlots.length} image slot{gate.unfilledSlots.length > 1 ? "s" : ""} unfilled
								</span>
								<Button variant="ghost" size="sm" href={sitePath(slug, `/posts/${post.id}/assets`)}>
									Open
								</Button>
							</li>
						)}
						{gate.missingStructures.map((s) => (
							<li key={s} className="flex items-center gap-2 text-[12.5px]">
								<Icon name="XCircle" size={16} className="shrink-0 text-block" />
								<span className="flex-1">Template has no {s}</span>
								<Chip tone="block" size="sm">
									Developer
								</Chip>
							</li>
						))}
						{extra.map((c) => (
							<li key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
								<Icon name="WarningCircle" size={16} className="shrink-0 text-ink-3" />
								<span className="min-w-0 flex-1">
									{c.label}
									{c.override && <span className="block text-xs italic text-ink-3">Overridden by {c.override.by}: “{c.override.reason}”</span>}
								</span>
								<Chip tone="human" size="sm">
									{c.value} · soft
								</Chip>
								{canFix && !c.override && (
									<button type="button" onClick={() => actions.fixCheck(post.id, c.id)} className="press font-display text-xs underline underline-offset-2">
										Fix
									</button>
								)}
								{canOverride && !c.override && (
									<button type="button" onClick={() => setOverriding(c)} className="press font-display text-xs underline underline-offset-2">
										Override
									</button>
								)}
							</li>
						))}
					</ul>
				</Card>
			)}
			{!canFix && <SourceNote icon="LockSimple">Your role can view the gate. Tolu B. fixes and overrides.</SourceNote>}
			<Dialog
				open={!!overriding}
				onClose={close}
				title="Override a soft block"
				footer={
					<>
						<Button variant="ghost" onClick={close}>
							Cancel
						</Button>
						<Button
							variant="primary"
							disabled={reason.trim().length < MIN_REASON}
							onClick={() => {
								if (!overriding) return;
								const r = actions.overrideCheck(post.id, overriding.id, reason);
								if (r.ok) close();
							}}
						>
							Override as {me.name}
						</Button>
					</>
				}
			>
				{overriding && (
					<div className="flex flex-col gap-2">
						<OverrideReason check={overriding} value={reason} onChange={setReason} />
						<span className="tabular text-sm text-ink-3">
							{reason.trim().length < MIN_REASON ? `At least ${MIN_REASON} characters · ${MIN_REASON - reason.trim().length} to go` : "Ready to log"}
						</span>
					</div>
				)}
			</Dialog>
		</>
	);
}

// ─── Fact markers (region 8) ─────────────────────────────────────────────────

export function FactsCard({ post }: { post: IPost }) {
	const open = post.facts.filter((f) => f.status === "open").length;
	const resolved = post.facts.length - open;
	const sourced = post.facts.filter((f) => f.status === "resolved" && f.source).length;
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-2.5">
			<CardHeader
				icon="SealQuestion"
				title="Fact markers"
				action={
					open > 0 ? (
						<Chip tone="block" size="sm">
							{open} open
						</Chip>
					) : post.facts.length ? (
						<Chip tone="pass" size="sm" icon="CheckCircle">
							All clear
						</Chip>
					) : undefined
				}
			/>
			<p className="text-sm leading-normal text-ink-3">
				{post.facts.length === 0
					? "No statistics or claims flagged in this draft."
					: open > 0
						? `${resolved} resolved${sourced ? " with sources" : ""} · ${open} need${open === 1 ? "s" : ""} you. Approval stays locked until ${open === 1 ? "it's" : "they're"} cleared.`
						: `${resolved} resolved · ${sourced} with a source. Nothing blocks approval here.`}
			</p>
		</Card>
	);
}

// ─── Versions (region 9) ─────────────────────────────────────────────────────

export function VersionsCard({ post, className }: { post: IPost; className?: string }) {
	const { slug } = useSite();
	const router = useRouter();
	const { actions, can } = useCms();
	const cur = latestVersion(post);
	const recent = [...post.versions].sort((a, b) => b.n - a.n).slice(0, 3);
	return (
		<Card variant="solid" padding="md" className={className ? `flex flex-col gap-2 ${className}` : "flex flex-col gap-2"}>
			<CardHeader
				icon="GitCommit"
				title="Versions"
				action={
					<Button variant="ghost" size="sm" href={sitePath(slug, `/posts/${post.id}/versions`)}>
						All versions
					</Button>
				}
			/>
			{cur ? (
				<VersionList
					versions={recent}
					currentId={cur.id}
					now={clockAfter(recent.map((v) => v.at))}
					onDiff={(id) => router.push(sitePath(slug, `/posts/${post.id}/versions?v=${id}`))}
					onRestore={can("post.edit") ? (id) => actions.restoreVersion(post.id, id) : undefined}
				/>
			) : (
				<p className="text-sm text-ink-3">Edits appear here as versions.</p>
			)}
		</Card>
	);
}

// ─── Comments + post timeline (region 10) ────────────────────────────────────

const AUDIT_ICON: [RegExp, TIconName, TTone][] = [
	[/generated|refresh/, "Robot", "agent"],
	[/accepted agent edit|instructed|asked agent/, "Sparkle", "agent"],
	[/rejected/, "X", "neutral"],
	[/approved|merged/, "SealCheck", "pass"],
	[/overrode/, "Hand", "human"],
	[/source|resolved/, "SealCheck", "pass"],
	[/opened MR|MR/, "GitPullRequest", "ink"],
	[/comment/, "ChatCircle", "neutral"],
];

export function CommentsCard({ post, id }: { post: IPost; id?: string }) {
	const { actions, can, data, role, me } = useCms();
	const { toast } = useToast();
	const items: ITimelineItem[] = useMemo(
		() =>
			data.audit
				.filter((a) => a.target === post.title)
				.slice(-40)
				.reverse()
				.slice(0, 5)
				.map((a) => {
					const hit = AUDIT_ICON.find(([re]) => re.test(a.action));
					return { id: a.id, icon: hit?.[1] ?? "Note", tone: hit?.[2] ?? "neutral", title: `${a.actor} ${a.action}`, meta: `${fmtDateTime(a.at)}${a.detail ? ` · ${a.detail}` : ""}` };
				}),
		[data.audit, post.title],
	);
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3" id={id}>
			<CardHeader icon="ChatCircle" title="Comments" meta={post.comments.length ? `${post.comments.length}` : undefined} />
			<CommentThread
				comments={post.comments}
				now={clockAfter(post.comments.map((c) => c.at))}
				readOnly={!can("post.comment")}
				onAdd={(text) => {
					const r = actions.addComment(post.id, text);
					if (r.ok) toast({ title: role === "specialist" || role === "admin" ? `Comment added as ${me.name}` : "Comment sent to Tolu B.", tone: "neutral" });
				}}
			/>
			{(post.state === "mr-open" || post.state === "live") && <SourceNote>Comments after approval are flagged “After approval” for the specialist</SourceNote>}
			{items.length > 0 && (
				<div className="flex flex-col gap-2.5 border-t border-line pt-3">
					<span className="text-xs text-ink-3">Activity</span>
					<Timeline items={items} />
				</div>
			)}
		</Card>
	);
}

// ─── Live preview (region 6) ─────────────────────────────────────────────────

export function PreviewCard({ post, className }: { post: IPost; className?: string }) {
	// The real page: the post rendered into the site's own template (HTML, CSS, image containers, metadata) —
	// the same output the merge request carries. Device switch, held structures and the no-template state live
	// in LivePreview's chrome.
	return (
		<Card variant="solid" padding="none" className={`flex flex-col overflow-hidden rounded-3xl lg:min-h-0 ${className ?? ""}`}>
			<div className="flex items-center gap-2 border-b border-line px-4 py-3">
				<h3 className="font-display text-base">Live preview</h3>
				<span className="text-xs text-ink-3">as it will look on the site</span>
			</div>
			<LivePreview postId={post.id} embedded className="min-h-0 flex-1" />
		</Card>
	);
}

