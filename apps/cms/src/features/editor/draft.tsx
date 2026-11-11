"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { createContext, Fragment, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { AgentBadge, AgentDiff, Button, Callout, Chip, Dialog, FactHighlight, FactMarkerCard, HumanBadge, Icon, IconButton, OverrideReason, Tooltip } from "@/ds";
import { now } from "@/lib/clock";
import { fmtInt } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteSlotsForPost } from "@/features/shared/site-source";
import type { IAgentSuggestion, IFactMarker, IGateCheck, IImageSlot, IPost, IPostBlock } from "@/lib/types";
import { diffContext, factsInBlock, isStale, narrowDiff, segmentFacts } from "./util";
import { sitePath } from "@/lib/routes";

// ─── Formatting bridge: the toolbar formats whichever block is being edited ──

type TFormatter = (open: string, close: string, placeholder: string) => void;
const FormatCtx = createContext<{ current: TFormatter | null }>({ current: null });

export function FormatProvider({ children }: { children: ReactNode }) {
	const ref = useRef<TFormatter | null>(null);
	return <FormatCtx.Provider value={ref}>{children}</FormatCtx.Provider>;
}

// ─── Toolbar (region 2) ──────────────────────────────────────────────────────

export function DraftToolbar({ post, canEdit, readOnlyNote }: { post: IPost; canEdit: boolean; readOnlyNote: string }) {
	const { slug } = useSite();
	const fmt = useContext(FormatCtx);
	const tool = "press grid size-[34px] shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-sunken aria-disabled:cursor-not-allowed aria-disabled:text-ink-5 aria-disabled:hover:bg-transparent";
	const apply = (l: string, r: string, ph: string) => (e: MouseEvent) => {
		e.preventDefault();
		fmt.current?.(l, r, ph);
	};
	const structural = "Block types follow the template manifest. Ask the agent to restructure a section.";
	return (
		<div className="flex min-h-[62px] items-center gap-1 border-b border-line px-4 py-3.5 sm:px-[18px]">
			{canEdit ? (
				<div role="toolbar" aria-label="Formatting" className="flex items-center gap-1">
					<Tooltip label={structural}>
						<button type="button" aria-disabled="true" aria-label="Heading 2 (structure changes go through the agent)" className={clsx(tool, "font-display text-md")}>
							H2
						</button>
					</Tooltip>
					<Tooltip label="Bold · select text in a paragraph">
						<button type="button" aria-label="Bold" onMouseDown={apply("**", "**", "bold text")} className={tool}>
							<Icon name="TextB" size={17} />
						</button>
					</Tooltip>
					<Tooltip label="Italic · select text in a paragraph">
						<button type="button" aria-label="Italic" onMouseDown={apply("_", "_", "italic text")} className={clsx(tool, "max-sm:hidden")}>
							<Icon name="TextItalic" size={17} />
						</button>
					</Tooltip>
					<Tooltip label="Link · wraps the selection">
						<button type="button" aria-label="Link" onMouseDown={apply("[", "](https://)", "link text")} className={tool}>
							<Icon name="LinkSimple" size={17} />
						</button>
					</Tooltip>
					<Tooltip label={structural}>
						<button type="button" aria-disabled="true" aria-label="Bulleted list (structure changes go through the agent)" className={tool}>
							<Icon name="ListBullets" size={17} />
						</button>
					</Tooltip>
					<Tooltip label={structural}>
						<button type="button" aria-disabled="true" aria-label="Quote (structure changes go through the agent)" className={clsx(tool, "max-sm:hidden")}>
							<Icon name="Quotes" size={17} />
						</button>
					</Tooltip>
					<Tooltip label="Image slots for this post">
						<Link href={sitePath(slug, `/posts/${post.id}/assets`)} aria-label="Image slots" className={tool}>
							<Icon name="Image" size={17} />
						</Link>
					</Tooltip>
				</div>
			) : (
				<Chip tone="neutral" icon="Eye" size="sm">
					{readOnlyNote}
				</Chip>
			)}
			<span className="tabular ms-auto whitespace-nowrap ps-3 text-sm text-ink-3">
				{fmtInt(post.words)} words · target {fmtInt(post.wordTarget)}
			</span>
		</div>
	);
}

// ─── SEO title (region 3) ────────────────────────────────────────────────────

export function SeoTitleField({ post, canEdit, compact }: { post: IPost; canEdit: boolean; compact?: boolean }) {
	const { actions } = useSiteCms();
	const [val, setVal] = useState(post.seoTitle);
	useEffect(() => setVal(post.seoTitle), [post.seoTitle]);
	const n = val.trim().length;
	const over = n > 60;
	const commit = () => {
		if (val.trim() && val.trim() !== post.seoTitle) actions.editSeoTitle(post.id, val);
		else setVal(post.seoTitle);
	};
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 text-xs text-ink-3">
				<label htmlFor={`seo-${post.id}`}>SEO title</label>
				<span aria-live={n >= 55 ? "polite" : "off"} className={clsx("tabular ms-auto font-medium", over ? "text-block-ink" : "text-pass-ink")}>
					{n} / 60{over ? " · too long" : ""}
				</span>
			</div>
			<textarea
				id={`seo-${post.id}`}
				value={val}
				rows={1}
				readOnly={!canEdit}
				onChange={(e) => setVal(e.target.value.replace(/\n/g, " "))}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						(e.target as HTMLTextAreaElement).blur();
					}
					if (e.key === "Escape") setVal(post.seoTitle);
				}}
				className={clsx(
					"tracking-display w-full resize-none rounded-sm bg-transparent font-display font-medium leading-snug text-ink outline-none [field-sizing:content] focus-visible:bg-sunken-2",
					compact ? "text-2xl" : "text-[28px]",
				)}
			/>
		</div>
	);
}

// ─── Editable block ──────────────────────────────────────────────────────────

interface IEditableProps {
	text: string;
	canEdit: boolean;
	label: string;
	onSave: (text: string) => void;
	onActivate: () => void;
	active: boolean;
	className: string;
	children: ReactNode;
}

function Editable({ text, canEdit, label, onSave, onActivate, active, className, children }: IEditableProps) {
	const fmt = useContext(FormatCtx);
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(text);
	const ta = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (!editing) setVal(text);
	}, [text, editing]);

	if (editing)
		return (
			<textarea
				ref={ta}
				autoFocus
				aria-label={`Edit ${label}`}
				value={val}
				onChange={(e) => setVal(e.target.value)}
				onFocus={() => {
					fmt.current = (l, r, ph) => {
						const el = ta.current;
						if (!el) return;
						const [s, e] = [el.selectionStart, el.selectionEnd];
						const sel = val.slice(s, e) || ph;
						const next = `${val.slice(0, s)}${l}${sel}${r}${val.slice(e)}`;
						setVal(next);
						requestAnimationFrame(() => el.setSelectionRange(s + l.length, s + l.length + sel.length));
					};
				}}
				onBlur={() => {
					fmt.current = null;
					setEditing(false);
					if (val.trim() !== text.trim()) onSave(val);
				}}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						setVal(text);
						setEditing(false);
					}
				}}
				className={clsx("-mx-2 w-[calc(100%+16px)] resize-none rounded-sm bg-sunken-2 px-2 outline-none ring-1 ring-line-3 [field-sizing:content]", className)}
			/>
		);

	return (
		<div
			role={canEdit ? "button" : undefined}
			tabIndex={canEdit ? 0 : undefined}
			{...(canEdit ? { "aria-description": `Editable ${label}. Press Enter to edit.` } : {})}
			onClick={() => {
				onActivate();
				if (canEdit && !window.getSelection()?.toString()) setEditing(true);
			}}
			onKeyDown={(e) => {
				if (canEdit && e.key === "Enter") {
					e.preventDefault();
					onActivate();
					setEditing(true);
				}
			}}
			className={clsx(
				"-mx-2 rounded-sm px-2 transition-colors duration-200",
				canEdit && "cursor-text hover:bg-sunken-2/70",
				active && "bg-sunken-2/70",
				className,
			)}
		>
			{children}
		</div>
	);
}

// ─── Disclaimer (regulated topic) ────────────────────────────────────────────

function DisclaimerBlock({ post, block, canEdit }: { post: IPost; block: IPostBlock; canEdit: boolean }) {
	const { actions, data } = useSiteCms();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const standard = (post.regulated && data.brandPack.disclaimers[post.regulated]) || block.text;
	const pseudoCheck: IGateCheck = { id: "disclaimer", label: `${post.regulated ? post.regulated[0].toUpperCase() + post.regulated.slice(1) : "Regulated"} disclaimer`, section: 7, status: "fail", severity: "soft", value: "Regulated topic" };

	if (!block.text.trim())
		return (
			<Callout tone="human" icon="Hand" title="Disclaimer removed with a logged reason" action={canEdit ? <Button variant="secondary" size="sm" icon="ArrowUUpLeft" onClick={() => actions.editBlock(post.id, block.id, standard)}>Restore</Button> : undefined}>
				The reason is in the comment thread and the audit log.
			</Callout>
		);

	return (
		<>
			<Callout
				tone="info"
				icon="ShieldCheck"
				title="Regulated topic · disclaimer"
				action={canEdit ? <IconButton icon="X" label="Remove disclaimer (needs a reason)" variant="ghost" size="sm" onClick={() => setOpen(true)} /> : undefined}
			>
				{block.text}
			</Callout>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Remove the disclaimer?"
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Keep it
						</Button>
						<Button
							variant="primary"
							icon="Trash"
							disabled={reason.trim().length < 20}
							onClick={async () => {
								const r1 = await actions.editBlock(post.id, block.id, "");
								if (r1.ok) await actions.addComment(post.id, `Override · removed the ${post.regulated ?? "regulated-topic"} disclaimer: ${reason.trim()}`);
								setOpen(false);
								setReason("");
							}}
						>
							Remove with reason
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<p>Regulated topic · removing the disclaimer needs a reason. It&apos;s logged and listed in the MR.</p>
					<OverrideReason check={pseudoCheck} value={reason} onChange={setReason} />
					{reason.trim().length > 0 && reason.trim().length < 20 && <span className="text-sm text-ink-3">{20 - reason.trim().length} more characters</span>}
				</div>
			</Dialog>
		</>
	);
}

// ─── Image slot placeholder inside the draft ─────────────────────────────────

function SlotFigure({ post, slot }: { post: IPost; slot: IImageSlot | undefined }) {
	const { slug } = useSite();
	if (!slot) return <div className="grid h-16 place-items-center rounded-md bg-sunken font-mono text-2xs text-ink-3">figure.post-media · slot missing</div>;
	const status =
		slot.status === "selected" ? (
			<Chip tone="pass" icon="CheckCircle" size="sm">
				Filled
			</Chip>
		) : slot.status === "human-only" ? (
			<HumanBadge />
		) : slot.status === "generating" || slot.status === "queued" ? (
			<AgentBadge running label="Generating" />
		) : slot.status === "failed" ? (
			<Chip tone="block" size="sm">
				Failed
			</Chip>
		) : (
			<Chip tone="neutral" size="sm">
				Pick a candidate
			</Chip>
		);
	return (
		<Link
			href={sitePath(slug, `/posts/${post.id}/assets?slot=${slot.id}`)}
			className="press flex items-center gap-3 rounded-md bg-sunken px-3.5 py-3 ring-1 ring-inset ring-line hover:ring-line-3"
			aria-label={`Image slot ${slot.name} · open in the image pipeline`}
		>
			<Icon name={slot.type === "chart" ? "ChartBar" : "Image"} size={18} className="shrink-0 text-ink-3" />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-display text-md">{slot.name}</span>
				<span className="truncate font-mono text-2xs text-ink-3">
					figure.post-media · {slot.width}×{slot.height}
				</span>
			</span>
			{status}
		</Link>
	);
}

// ─── Fact marker, read-only (stakeholder / developer) ────────────────────────

function FactMarkerReadOnly({ marker }: { marker: IFactMarker }) {
	return (
		<Callout tone="block" icon="SealQuestion" title="Unsourced statistic · Can't override">
			“{marker.claim}” — {marker.note} Tolu B. adds a source or has the agent rewrite it.
		</Callout>
	);
}

// ─── Blocks (region 4) ───────────────────────────────────────────────────────

export interface IDraftBlocksProps {
	post: IPost;
	canEdit: boolean;
	scopeId: string | null;
	onScope: (blockId: string) => void;
	compact?: boolean;
}

const RECENT_MS = 60 * 60 * 1000;

export function DraftBlocks({ post, canEdit, scopeId, onScope, compact }: IDraftBlocksProps) {
	const { actions, state } = useSiteCms();
	const slots = useSiteSlotsForPost(post.id);
	const t = now().getTime();
	const pending = post.suggestions.filter((s) => s.status === "pending");
	const jobs = state.jobs.filter((j) => j.kind === "suggestion-ready" && j.siteId === state.siteId && j.payload.postId === post.id);
	const blockIds = new Set(post.blocks.map((b) => b.id));
	const orphans = pending.filter((s) => !blockIds.has(s.blockId));
	const pendingCount = pending.length;
	let diffIndex = 0;

	const diffCard = (s: IAgentSuggestion, block?: IPostBlock) => {
		diffIndex++;
		const ctx = diffContext(s, block);
		const n = narrowDiff(s.before, s.after);
		const lead = ctx.lead + n.pre;
		const tail = n.post + ctx.tail;
		const shown = { ...s, before: n.before, after: n.after };
		return (
			<div
				key={s.id}
				tabIndex={canEdit ? 0 : undefined}
				aria-label={`Suggested edit, ${diffIndex} of ${pendingCount}${canEdit ? " · A to accept, R to reject" : ""}`}
				onKeyDown={(e) => {
					if (!canEdit || e.target !== e.currentTarget) return;
					if (e.key === "a" || e.key === "A") actions.acceptSuggestion(post.id, s.id);
					if (e.key === "r" || e.key === "R") actions.rejectSuggestion(post.id, s.id);
				}}
				className="rounded-lg outline-none focus-visible:shadow-[0_0_0_3px_var(--c-focus)]"
			>
				{canEdit ? (
					<AgentDiff suggestion={shown} lead={lead} tail={tail} onAccept={(id) => actions.acceptSuggestion(post.id, id)} onReject={(id) => actions.rejectSuggestion(post.id, id)} />
				) : (
					<Callout tone="agent" icon="Robot" title={`Agent edit waiting for Tolu B. · “${s.instruction}”`}>
						{s.after}
					</Callout>
				)}
			</div>
		);
	};

	const staleCard = (s: IAgentSuggestion, block: IPostBlock) => (
		<Callout
			key={s.id}
			tone="human"
			icon="Warning"
			title="This paragraph changed since the suggestion."
			action={
				canEdit ? (
					<>
						<Button variant="ghost" size="sm" onClick={() => actions.rejectSuggestion(post.id, s.id)}>
							Dismiss
						</Button>
						<Button
							variant="agent"
							size="sm"
							icon="ArrowsClockwise"
							onClick={async () => {
								const r = await actions.instructAgent(post.id, s.instruction, block.id);
								if (r.ok) await actions.rejectSuggestion(post.id, s.id);
							}}
						>
							Regenerate
						</Button>
					</>
				) : undefined
			}
		>
			Agent edit “{s.instruction}” was written against an older version, so it can&apos;t be accepted as is.
		</Callout>
	);

	const jobRow = (j: (typeof jobs)[number]) => (
		<div key={j.id} role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 rounded-lg bg-sunken-2 px-3 py-2.5 text-sm text-ink-3">
			<AgentBadge running label="Agent edit" />
			<span className="min-w-0 flex-1">Writing a diff for “{String(j.payload.instruction)}” · nothing changes until you accept</span>
		</div>
	);

	const renderBlock = (b: IPostBlock) => {
		const active = scopeId === b.id;
		const blockPending = pending.filter((s) => s.blockId === b.id && !s.insertKind);
		const live = blockPending.find((s) => !isStale(s, b));
		const stale = blockPending.filter((s) => isStale(s, b));
		const facts = factsInBlock(b, post.facts);
		const openFacts = facts.filter((f) => f.status === "open");
		const save = (text: string) => actions.editBlock(post.id, b.id, text);
		const common = { canEdit, onSave: save, onActivate: () => onScope(b.id), active };
		const body = "text-base leading-prose text-ink-2";

		let view: ReactNode;
		switch (b.kind) {
			case "h2":
			case "h3":
				view = (
					<Editable {...common} text={b.text} label="heading" className={clsx("font-display font-medium text-ink", b.kind === "h2" ? "mt-1 text-[19px] leading-snug" : "text-lg")}>
						{b.kind === "h2" ? <h2 className="text-[19px] leading-snug">{b.text}</h2> : <h3 className="text-lg">{b.text}</h3>}
					</Editable>
				);
				break;
			case "ul":
				view = (
					<Editable {...common} text={b.text} label="list, one item per line" className={body}>
						<ul className="flex list-disc flex-col gap-1 ps-5 marker:text-ink-4">
							{b.text.split("\n").map((l, i) => (
								<li key={i}>{l}</li>
							))}
						</ul>
					</Editable>
				);
				break;
			case "quote":
				view = (
					<Editable {...common} text={b.text} label="quote" className={body}>
						<blockquote className="border-s-2 border-line-3 ps-4 italic">{b.text}</blockquote>
					</Editable>
				);
				break;
			case "faq": {
				const lines = b.text.split("\n");
				view = (
					<Editable {...common} text={b.text} label="FAQ, question and answer on alternating lines" className={body}>
						<dl className="flex flex-col gap-2.5">
							{lines.map((l, i) =>
								i % 2 === 0 ? (
									<dt key={i} className="font-display font-medium text-ink">
										{l}
									</dt>
								) : (
									<dd key={i} className="-mt-2 ms-0">
										{l}
									</dd>
								),
							)}
						</dl>
					</Editable>
				);
				break;
			}
			case "image":
				view = <SlotFigure post={post} slot={slots.find((s) => s.id === b.text)} />;
				break;
			case "disclaimer":
				view = <DisclaimerBlock post={post} block={b} canEdit={canEdit} />;
				break;
			default:
				view = live ? null : (
					<Editable {...common} text={b.text} label="paragraph" className={body}>
						<p>
							{segmentFacts(b.text, facts).map((seg, i) =>
								seg.fact ? (
									<FactHighlight key={i} status={seg.fact.status}>
										{seg.text}
									</FactHighlight>
								) : (
									<Fragment key={i}>{seg.text}</Fragment>
								),
							)}
						</p>
					</Editable>
				);
		}

		const recent = post.suggestions.filter((s) => s.blockId === b.id && s.status !== "pending" && s.createdAt && t - new Date(s.createdAt).getTime() < RECENT_MS).slice(-1);
		return (
			<Fragment key={b.id}>
				{stale.map((s) => staleCard(s, b))}
				{live && b.kind !== "p" ? view : null}
				{live ? diffCard(live, b) : view}
				{blockPending.filter((s) => s !== live && !stale.includes(s)).map((s) => diffCard(s))}
				{openFacts.map((f) =>
					canEdit ? (
						<FactMarkerCard
							key={f.id}
							marker={f}
							onAddSource={(id, url) => actions.addFactSource(post.id, id, url)}
							onRewrite={(id) => actions.rewriteFactWithout(post.id, id)}
							className={compact ? "" : "sm:ms-28 sm:w-[380px] sm:max-w-[calc(100%-7rem)]"}
						/>
					) : (
						<FactMarkerReadOnly key={f.id} marker={f} />
					),
				)}
				{!live && recent.map((s) => <AgentDiff key={s.id} suggestion={s} onAccept={() => undefined} onReject={() => undefined} />)}
				{pending.filter((s) => s.blockId === b.id && s.insertKind).map((s) => diffCard(s, b))}
				{jobs.filter((j) => j.payload.blockId === b.id).map(jobRow)}
			</Fragment>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			{post.blocks.map(renderBlock)}
			{orphans.map((s) => diffCard(s))}
			{jobs.filter((j) => !blockIds.has(String(j.payload.blockId))).map(jobRow)}
		</div>
	);
}

/** Mobile sticky "Agent edit ready" bar for the first pending diff (ref 02 mobile). */
export function DiffReadyBar({ post }: { post: IPost }) {
	const { actions } = useSiteCms();
	const s = post.suggestions.find((x) => x.status === "pending" && !isStale(x, post.blocks.find((b) => b.id === x.blockId)));
	if (!s) return null;
	return (
		<div className="flex items-center gap-2 rounded-lg bg-surface py-2 ps-3 pe-2 shadow-card ring-1 ring-line">
			<AgentBadge label="Agent edit ready" />
			<span className="min-w-0 flex-1 truncate text-sm text-ink-3">“{s.instruction}”</span>
			<Button variant="secondary" size="sm" onClick={() => actions.rejectSuggestion(post.id, s.id)}>
				Reject
			</Button>
			<Button variant="primary" size="sm" onClick={() => actions.acceptSuggestion(post.id, s.id)}>
				Accept
			</Button>
		</div>
	);
}
