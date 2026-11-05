"use client";
// /inbox — cross-site work that needs *me*, grouped by kind. Ideas approve inline (reject needs a note);
// everything else deep-links into the site that owns it.

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Chip, EmptyState, formatRelative, Icon, PageHeader, Section, Select, SiteAvatar, StatStrip, TextField, type TIconName } from "@/ds";
import { useInboxRows, useWorkspaceActions, type IInboxRow, type TInboxGroup } from "@/features/workspace/data";
import { plural } from "@/features/workspace/labels";

const GROUPS: {
	id: TInboxGroup;
	label: string;
	icon: TIconName;
	open: string;
}[] = [
	{
		id: "ideas",
		label: "Ideas to approve",
		icon: "Lightning",
		open: "Open idea",
	},
	{
		id: "held",
		label: "Held posts",
		icon: "HourglassMedium",
		open: "Review hold",
	},
	{
		id: "review",
		label: "Ready for review",
		icon: "SealCheck",
		open: "Review",
	},
	{
		id: "images",
		label: "Human-only images",
		icon: "ImagesSquare",
		open: "Add image",
	},
	{ id: "ledger", label: "Overdue ledger", icon: "Timer", open: "Open" },
	{ id: "ci", label: "Failing CI", icon: "GitPullRequest", open: "Open MR" },
	{
		id: "assigned",
		label: "Assigned to you",
		icon: "NotePencil",
		open: "Open post",
	},
	{
		id: "invites",
		label: "Invites & access",
		icon: "UserPlus",
		open: "Open Team",
	},
];

/** ?kind= values used by the portfolio stat strip. */
const KIND_PARAM: Record<string, TInboxGroup> = {
	idea: "ideas",
	held: "held",
	ci: "ci",
	images: "images",
	ledger: "ledger",
	review: "review",
	invites: "invites",
};

export function Inbox() {
	const router = useRouter();
	const params = useSearchParams();
	const rows = useInboxRows();
	const [site, setSite] = useState<string>("all");
	const kind = KIND_PARAM[params.get("kind") ?? ""] ?? null;

	const sites = useMemo(() => {
		const m = new Map<string, { id: string; name: string; n: number }>();
		for (const r of rows)
			if (r.siteId)
				m.set(r.siteId, {
					id: r.siteId,
					name: r.siteName ?? r.siteId,
					n: (m.get(r.siteId)?.n ?? 0) + 1,
				});
		return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
	}, [rows]);

	const visible = rows.filter((r) => (site === "all" || r.siteId === site) && (!kind || r.group === kind));
	const count = (g: TInboxGroup) => rows.filter((r) => r.group === g && (site === "all" || r.siteId === site)).length;
	const setKind = (g: TInboxGroup | null) => router.replace(g ? `/inbox?kind=${Object.entries(KIND_PARAM).find(([, v]) => v === g)?.[0]}` : "/inbox", { scroll: false });

	return (
		<>
			<PageHeader
				title={`Inbox · ${rows.length}`}
				subtitle="Work across your sites that's waiting on you — oldest blockers inside each group first"
				actions={
					sites.length > 1 && (
						<Select
							label="Site"
							value={site}
							onChange={setSite}
							icon="Globe"
							align="end"
							options={[
								{ value: "all", label: "All sites" },
								...sites.map((s) => ({
									value: s.id,
									label: s.name,
									hint: plural(s.n, "item"),
								})),
							]}
							className="w-52 [&>span:first-child]:sr-only"
						/>
					)
				}
			/>

			{rows.length > 0 && (
				<StatStrip
					className="shrink-0"
					items={GROUPS.filter((g) => count(g.id) > 0).map((g) => ({
						id: g.id,
						label: g.label,
						value: count(g.id),
						tone: g.id === "ci" ? "block" : g.id === "assigned" || g.id === "invites" ? undefined : "human",
						active: kind === g.id,
						onClick: () => setKind(kind === g.id ? null : g.id),
					}))}
				/>
			)}

			{rows.length === 0 ? (
				<Card className="flex flex-1 items-center justify-center">
					<EmptyState
						icon="CheckCircle"
						title="All caught up"
						body="Nothing across your sites is waiting on you. New ideas, holds and failing checks land here as the agents find them."
						action={
							<Button variant="secondary" icon="SquaresFour" href="/sites">
								Go to sites
							</Button>
						}
					/>
				</Card>
			) : visible.length === 0 ? (
				<Card>
					<EmptyState
						icon="Funnel"
						title="Nothing here for this filter"
						body="Everything in this group is done, or it's on another site."
						action={
							<Button
								variant="secondary"
								onClick={() => {
									setSite("all");
									setKind(null);
								}}
							>
								Show everything
							</Button>
						}
					/>
				</Card>
			) : (
				GROUPS.map((g) => {
					const items = visible.filter((r) => r.group === g.id);
					if (!items.length) return null;
					return (
						<Section key={g.id} title={g.label} count={items.length}>
							<ul className="flex flex-col gap-2.5">
								{items.map((r) => (
									<li key={r.id}>
										<InboxRow row={r} openLabel={g.open} icon={g.icon} />
									</li>
								))}
							</ul>
						</Section>
					);
				})
			)}
		</>
	);
}

function InboxRow({ row: r, openLabel, icon }: { row: IInboxRow; openLabel: string; icon: TIconName }) {
	const { approveIdea, rejectIdea } = useWorkspaceActions();
	const [rejecting, setRejecting] = useState(false);
	const [note, setNote] = useState("");
	const [tried, setTried] = useState(false);
	const noteErr = tried && note.trim().length < 3 ? "Say why in a few words — the swarm uses it to stop suggesting this" : undefined;

	const reject = (e: FormEvent) => {
		e.preventDefault();
		setTried(true);
		if (note.trim().length < 3 || !r.siteId || !r.postId) return;
		rejectIdea(r.siteId, r.postId, note.trim());
	};

	return (
		<Card className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-3">
				{r.siteName ? (
					<SiteAvatar name={r.siteName} hue={r.hue} size={32} />
				) : (
					<span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-sunken text-ink">
						<Icon name={icon} size={15} />
					</span>
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate text-xs text-ink-3">{r.siteName ?? "Workspace"}</span>
					<span className="truncate font-display text-lg leading-snug text-ink">{r.title}</span>
					<span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-3">
						{r.tone === "block" && (
							<Chip size="sm" tone="block">
								Blocked
							</Chip>
						)}
						<span className="truncate">{r.detail}</span>
					</span>
				</div>
				<span className="flex w-full items-center justify-end gap-2 sm:w-auto">
					<span className="tabular me-auto shrink-0 text-sm text-ink-3 sm:me-1">{formatRelative(r.at)}</span>
					{r.kind === "idea" && r.canDecide ? (
						<span className="flex shrink-0 items-center gap-2">
							<Button variant="ghost" size="sm" onClick={() => setRejecting((v) => !v)} aria-expanded={rejecting}>
								Reject
							</Button>
							<Button variant="secondary" size="sm" icon="Check" onClick={() => r.siteId && r.postId && approveIdea(r.siteId, r.postId)}>
								Approve
							</Button>
						</span>
					) : (
						<Button variant="secondary" size="sm" href={r.href} trailing={<Icon name="ArrowRight" size={14} className="rtl:-scale-x-100" />}>
							{openLabel}
						</Button>
					)}
				</span>
			</div>
			{rejecting && (
				<form onSubmit={reject} className="flex flex-wrap items-start gap-2 rounded-md bg-sunken p-3">
					<TextField label="Why reject this idea?" value={note} onChange={setNote} placeholder="Off-brand for this client" error={noteErr} className="min-w-0 flex-1" autoFocus />
					<span className="flex items-center gap-2 pt-6">
						<Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
							Cancel
						</Button>
						<Button variant="danger" size="sm" type="submit">
							Reject idea
						</Button>
					</span>
				</form>
			)}
		</Card>
	);
}
