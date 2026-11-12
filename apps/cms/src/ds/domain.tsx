"use client";

// Agentic CMS — domain kit (inventory §E). CMS-specific compositions of controls + surfaces.
// Tone law: agent (blue) = the machine did / is doing it · human (amber) = waiting on a person ·
// block (red) = hard block · pass (green) = passing. Tokens only; logical properties only.

import { clsx } from "clsx";
import { useState, type DragEvent, type ReactNode } from "react";
import type {
	IAgentSuggestion,
	ICandidate,
	IFactMarker,
	IGateCheck,
	IImageSlot,
	IKeyword,
	ILedgerItem,
	IMergeRequest,
	IPillar,
	IPost,
	IRepoConnection,
	IRun,
	ISchedule,
	ISite,
	ITemplateManifest,
	ITemplateMapping,
	IVersion,
	TContentType,
	TIntent,
	TOwner,
	TPostState,
	TProvider,
	TRole,
	TRunKind,
	TTone,
	TVersionOrigin,
	TWorkspaceRole,
} from "@/lib/types";
import { fmtAgo, fmtDate, fmtDateTime, mrRef } from "@/lib/logic";
import { Button, Chip, Dot, Icon, IconButton, Select, SegmentedControl, Toggle, Tooltip } from "./controls";
import type { TIconName } from "./icons";
import { Avatar, Card, CardHeader, KeyValue, Meter, ProgressBar } from "./surfaces";

// ============================================================================
// Pure helpers (screens reuse these)
// ============================================================================

export const STATE_LABEL: Record<TPostState, string> = {
	idea: "Idea",
	briefed: "Briefed",
	drafting: "Drafting",
	"needs-assets": "Needs assets",
	"in-review": "In review",
	"mr-open": "MR open",
	live: "Live",
	decaying: "Decaying",
};

export const STATE_ORDER: TPostState[] = ["idea", "briefed", "drafting", "needs-assets", "in-review", "mr-open", "live", "decaying"];

/**
 * Owner tone per state (IA §Post state machine). `needs-assets` is human only when a human-only
 * slot exists — pass `humanOnly: false` when every slot is still with the agent.
 */
export function stateTone(state: TPostState, humanOnly = true): TTone {
	switch (state) {
		case "idea":
		case "briefed":
		case "drafting":
		case "decaying":
			return "agent";
		case "needs-assets":
			return humanOnly ? "human" : "agent";
		case "in-review":
			return "human";
		case "mr-open":
			return "ink";
		case "live":
			return "pass";
	}
}

export const ORIGIN_LABEL: Record<TVersionOrigin, string> = {
	"agent-generation": "Agent generation",
	"agent-edit": "Agent edit",
	"human-edit": "Human edit",
	refresh: "Refresh",
};

export const PROVIDER_LABEL: Record<TProvider, string> = {
	higgsfield: "Higgsfield",
	openai: "OpenAI",
	"open-source": "Open-source",
	"web-source": "Licensed web image",
	"inline-svg": "Inline SVG",
	human: "Human upload",
};

/** How the provider is reached. */
export const PROVIDER_ROUTE: Record<TProvider, string> = {
	higgsfield: "MCP",
	openai: "API",
	"open-source": "MCP",
	"web-source": "web search",
	"inline-svg": "no model",
	human: "your upload",
};

export const INTENT_LABEL: Record<TIntent, string> = {
	transactional: "Transactional",
	commercial: "Commercial",
	informational: "Informational",
	navigational: "Navigational",
};

export const CONTENT_TYPE_LABEL: Record<TContentType, string> = {
	guide: "Guide",
	comparison: "Comparison",
	listicle: "Listicle",
	"how-to": "How-to",
	faq: "FAQ",
	pillar: "Pillar",
	"money-page": "Money page",
};

export const ROLE_LABEL: Record<TRole, string> = {
	specialist: "Content specialist",
	developer: "Developer",
	stakeholder: "Client stakeholder",
	admin: "Agency admin",
};

export const OWNER_LABEL: Record<TOwner | "mixed", string> = {
	agent: "Agent",
	human: "You",
	developer: "Developer",
	system: "System",
	mixed: "Mixed",
};


/** "$0.40" under $100, "$142" at and above. */
export function formatUsd(n: number): string {
	if (!Number.isFinite(n)) return "—";
	const sign = n < 0 ? "−" : "";
	const a = Math.abs(n);
	return a >= 100 ? `${sign}$${Math.round(a).toLocaleString("en-US")}` : `${sign}$${a.toFixed(2)}`;
}

/** "25 Sep 2026, 10:42" — UTC so server and client render identically. */
export function formatDateTime(iso: string): string {
	return Number.isNaN(new Date(iso).getTime()) ? "—" : fmtDateTime(iso);
}

/** "25 Sep" in the tenant's time zone. */
export function formatDay(iso: string): string {
	return Number.isNaN(new Date(iso).getTime()) ? "—" : fmtDate(iso);
}

/** "4 min ago", "2 h ago", "3 days ago"; future times read "in 4 min". Relative to the app clock. */
export function formatRelative(iso: string, now?: number | Date): string {
	if (Number.isNaN(new Date(iso).getTime())) return "—";
	return fmtAgo(iso, now === undefined ? undefined : new Date(now));
}

function initialsOf(name: string): string {
	return name
		.replace(/[^\p{L}\s]/gu, "")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]!.toUpperCase())
		.join("");
}

function pluralize(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

// Static class maps (Tailwind needs literal class names).
const TONE_TEXT: Record<TTone, string> = {
	neutral: "text-ink-3",
	ink: "text-ink",
	agent: "text-agent-ink",
	human: "text-human-ink",
	block: "text-block-ink",
	pass: "text-pass-ink",
	info: "text-ink-3",
};

const TONE_ICON: Record<TTone, string> = {
	neutral: "text-ink-4",
	ink: "text-ink",
	agent: "text-agent",
	human: "text-human",
	block: "text-block",
	pass: "text-pass",
	info: "text-ink-3",
};

const ART = ["bg-art-1", "bg-art-2", "bg-art-3", "bg-art-4"] as const;

// ============================================================================
// StateChip · AgentBadge · HumanBadge · OriginTag · ProviderBadge
// ============================================================================

export interface IStateChipProps {
	state: TPostState;
	count?: number;
	/** Needs assets without a human-only slot renders agent tone. */
	humanOnly?: boolean;
	className?: string;
}

export function StateChip({ state, count, humanOnly, className }: IStateChipProps) {
	return (
		<Chip tone={stateTone(state, humanOnly)} size="sm" className={className}>
			{STATE_LABEL[state]}
			{count != null && <span className="tabular ms-1 opacity-70">{count}</span>}
		</Chip>
	);
}

export interface IAgentBadgeProps {
	label?: string;
	running?: boolean;
	model?: string;
	className?: string;
}

/** The Agent-blue rule's carrier: anything a machine made or is making. */
export function AgentBadge({ label = "Agent", running, model, className }: IAgentBadgeProps) {
	return (
		<span className={clsx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill bg-agent-soft ps-2 pe-2.5 font-display text-xs text-agent-ink", className)}>
			{running ? <span aria-hidden className="c-pulse size-1.5 rounded-pill bg-agent" /> : <Icon name="Robot" size={13} className="text-agent" />}
			{label}
			{model && <span className="font-mono text-2xs opacity-80">· {model}</span>}
			{running && <span className="sr-only">(running)</span>}
		</span>
	);
}

export interface IHumanBadgeProps {
	label?: string;
	className?: string;
}

/** Human-amber rule: this is waiting on a person. */
export function HumanBadge({ label = "Human-only · waiting on you", className }: IHumanBadgeProps) {
	return (
		<span className={clsx("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill bg-human-soft ps-2 pe-2.5 font-display text-xs text-human-ink", className)}>
			<Icon name="Hand" size={13} className="text-human" />
			{label}
		</span>
	);
}

export interface IOriginTagProps {
	origin: TVersionOrigin;
	className?: string;
}

const ORIGIN_TONE: Record<TVersionOrigin, TTone> = { "agent-generation": "agent", "agent-edit": "agent", "human-edit": "neutral", refresh: "info" };
const ORIGIN_ICON: Record<TVersionOrigin, TIconName> = { "agent-generation": "Robot", "agent-edit": "Robot", "human-edit": "User", refresh: "ArrowsClockwise" };

export function OriginTag({ origin, className }: IOriginTagProps) {
	return (
		<Chip tone={ORIGIN_TONE[origin]} icon={ORIGIN_ICON[origin]} size="sm" className={className}>
			{ORIGIN_LABEL[origin]}
		</Chip>
	);
}

export interface IProviderBadgeProps {
	provider: TProvider;
	model?: string;
	className?: string;
}

export function providerText(provider: TProvider, model?: string): string {
	if (provider === "inline-svg") return "Inline SVG · no model";
	if (provider === "human") return "Human upload";
	if (provider === "open-source" && model) {
		const family = model.split(/[-_/]/)[0] ?? model;
		return `${family.charAt(0).toUpperCase()}${family.slice(1)} via MCP`;
	}
	return `${PROVIDER_LABEL[provider]} · ${PROVIDER_ROUTE[provider]}`;
}

export function ProviderBadge({ provider, model, className }: IProviderBadgeProps) {
	const icon: TIconName = provider === "inline-svg" ? "ChartBar" : provider === "human" ? "UploadSimple" : "GitFork";
	return (
		<Chip tone="neutral" icon={icon} className={className}>
			{providerText(provider, model)}
		</Chip>
	);
}

// ============================================================================
// PostCard · PipelineColumn (ref 01)
// ============================================================================

export interface IPostCardProps {
	post: IPost;
	keyword?: IKeyword;
	pillar?: IPillar;
	href: string;
	/** Blocker lines (in review): "1 unresolved fact marker". */
	blocks?: string[];
	/** Slots for the mini tile row (needs assets). */
	slots?: IImageSlot[];
	/** The post's merge request (store keeps MRs in `data.mergeRequests`; pass `useMrForPost(id)`). */
	mr?: IMergeRequest;
	selected?: boolean;
	draggable?: boolean;
	onDragStart?: (postId: string, e: DragEvent<HTMLElement>) => void;
	className?: string;
}

function MiniSlotTile({ slot }: { slot: IImageSlot }) {
	const base = "grid h-11 flex-1 place-items-center rounded-sm";
	const label = `${slot.name}: ${slot.status.replace("-", " ")}`;
	switch (slot.status) {
		case "selected":
			return (
				<span title={label} className={clsx(base, "bg-sunken text-pass ring-1 ring-inset ring-line")}>
					<Icon name="Check" size={16} />
					<span className="sr-only">{label}</span>
				</span>
			);
		case "human-only":
			return (
				<span title={label} className={clsx(base, "border-[1.5px] border-dashed border-human-line bg-human-soft text-human")}>
					<Icon name="UserFocus" size={16} />
					<span className="sr-only">{label}</span>
				</span>
			);
		case "failed":
			return (
				<span title={label} className={clsx(base, "bg-block-soft text-block")}>
					<Icon name="Warning" size={16} />
					<span className="sr-only">{label}</span>
				</span>
			);
		case "candidates":
			return (
				<span title={label} className={clsx(base, "bg-agent-soft text-agent")}>
					<Icon name="Images" size={16} />
					<span className="sr-only">{label}</span>
				</span>
			);
		default:
			return (
				<span title={label} className={clsx(base, "bg-agent-soft text-agent")}>
					<Icon name="CircleNotch" size={16} className="c-spin" />
					<span className="sr-only">{label}</span>
				</span>
			);
	}
}

export function PostCard({ post, keyword, pillar, href, blocks, slots, mr, selected, draggable, onDragStart, className }: IPostCardProps) {
	const blockCount = blocks?.length ?? 0;
	const humanSlots = slots?.filter((s) => s.status === "human-only").length ?? 0;
	const busySlot = slots?.find((s) => s.status === "generating" || s.status === "queued");

	return (
		<div
			draggable={draggable}
			onDragStart={
				draggable
					? (e) => {
							e.dataTransfer.setData("text/plain", post.id);
							e.dataTransfer.effectAllowed = "move";
							onDragStart?.(post.id, e);
						}
					: undefined
			}
			className={clsx(draggable && "cursor-grab active:cursor-grabbing", className)}
		>
			<Card variant="solid" padding="md" selected={selected} className="flex flex-col gap-3">
				{/* Chips row + arrow */}
				<div className="flex min-w-0 items-center gap-1.5">
					{pillar && (
						<Chip tone="neutral" size="sm">
							{pillar.name}
						</Chip>
					)}
					{post.source === "kas-gap" && (post.state === "idea" || post.state === "briefed") && (
						<Chip tone="agent" size="sm">
							KAS gap
						</Chip>
					)}
					{post.source === "site-discovery" && (post.state === "idea" || post.state === "briefed") && (
						<Chip tone="agent" size="sm" icon="TreeStructure">
							Site discovery
						</Chip>
					)}
					{post.contentType === "pillar" && (
						<Chip tone="ink" size="sm">
							Pillar
						</Chip>
					)}
					{post.state === "in-review" &&
						(blockCount > 0 ? (
							<Chip tone="block" size="sm">
								{pluralize(blockCount, "hard block")}
							</Chip>
						) : (
							<Chip tone="pass" size="sm">
								Ready
							</Chip>
						))}
					{post.state === "decaying" && (
						<Chip tone="block" size="sm" icon="TrendDown">
							Decaying
						</Chip>
					)}
					<IconButton href={href} icon="ArrowUpRight" label={`Open ${post.title}`} variant={selected ? "ink" : "outline"} size="sm" className="ms-auto shrink-0" />
				</div>

				<p className="font-display text-lg leading-snug text-ink">{post.title}</p>

				{/* Body per state */}
				{(post.state === "idea" || post.state === "briefed") && (
					<div className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-ink-3">
						<span>{INTENT_LABEL[post.intent]}</span>
						{keyword && <span>{keyword.difficultyEvidence}</span>}
						<span>{CONTENT_TYPE_LABEL[post.contentType]}</span>
					</div>
				)}

				{post.state === "drafting" && (
					<div className="flex flex-col gap-1.5">
						<div className="flex justify-between gap-2 text-sm text-ink-3">
							<span className="truncate">{post.progress?.label ?? "Queued for the writer agent"}</span>
							<span className="shrink-0">{post.strongModel ? "Strong model" : `${Math.round(post.progress?.value ?? 0)}%`}</span>
						</div>
						<ProgressBar value={(post.progress?.value ?? 0) / 100} tone="agent" />
					</div>
				)}

				{post.state === "needs-assets" && slots && slots.length > 0 && (
					<>
						<div className="flex gap-1.5">
							{slots.map((s) => (
								<MiniSlotTile key={s.id} slot={s} />
							))}
						</div>
						{humanSlots > 0 ? (
							<span className="flex items-center gap-2 text-sm text-human-ink">
								<Icon name="Hand" size={14} />
								{humanSlots === 1 ? "1 slot marked human-only · you" : `${humanSlots} slots marked human-only · you`}
							</span>
						) : busySlot ? (
							<span className="flex items-center gap-2 text-sm text-ink-3">
								<Dot tone="agent" pulse />
								{PROVIDER_LABEL[busySlot.provider]} {busySlot.status === "queued" ? "queued" : "generating candidates"}
							</span>
						) : null}
					</>
				)}

				{post.state === "in-review" &&
					(blockCount > 0 ? (
						<ul className="flex flex-col gap-1.5 text-sm text-ink-3">
							{blocks!.map((b) => (
								<li key={b} className="flex items-center gap-2">
									<Icon name="WarningDiamond" size={14} className="shrink-0 text-block" />
									{b}
								</li>
							))}
						</ul>
					) : (
						<div aria-hidden className="h-1 rounded-pill bg-pass" />
					))}

				{post.state === "mr-open" && (mr ?? post.mr) && (
					<div className="flex items-center gap-2 text-sm text-ink-3">
						<Icon name="GitPullRequest" size={14} />
						<span>MR {mrRef(mr ?? post.mr)}</span>
						<CIStatus ci={(mr ?? post.mr)!.ci} status={(mr ?? post.mr)!.status} className="ms-auto" />
					</div>
				)}

				{post.state === "live" && (
					<div className="flex gap-3.5 text-sm text-ink-3">
						<span>Live</span>
						{post.kasContribution != null && <span className="tabular">KAS {post.kasContribution.toFixed(1)}%</span>}
						{keyword?.position != null && <span className="tabular">Position {keyword.position}</span>}
					</div>
				)}

				{post.state === "decaying" && (
					<div className="flex gap-3.5 text-sm text-ink-3">
						{keyword?.position != null && <span className="tabular text-block-ink">Position {keyword.position} ↓</span>}
						<span>Refresh queued for the agent</span>
					</div>
				)}
			</Card>
		</div>
	);
}

export interface IPipelineColumnProps {
	state: TPostState;
	count: number;
	owner: TOwner | "mixed";
	children: ReactNode;
	onDrop?: (postId: string) => void;
	/** Header text override (e.g. "Idea · needs approval"); defaults to the state label. */
	title?: string;
	className?: string;
}

const OWNER_ICON: Record<TOwner | "mixed", TIconName> = { agent: "Robot", human: "User", developer: "Code", system: "GearSix", mixed: "User" };

export function PipelineColumn({ state, count, owner, children, onDrop, title, className }: IPipelineColumnProps) {
	const [over, setOver] = useState(false);
	return (
		<section
			aria-label={`${title ?? STATE_LABEL[state]}, ${count} posts, owner ${OWNER_LABEL[owner]}`}
			onDragOver={
				onDrop
					? (e) => {
							e.preventDefault();
							e.dataTransfer.dropEffect = "move";
							if (!over) setOver(true);
						}
					: undefined
			}
			onDragLeave={onDrop ? () => setOver(false) : undefined}
			onDrop={
				onDrop
					? (e) => {
							e.preventDefault();
							setOver(false);
							const id = e.dataTransfer.getData("text/plain");
							if (id) onDrop(id);
						}
					: undefined
			}
			className={clsx("flex min-w-0 flex-col gap-2.5 rounded-xl transition-colors", over && "bg-agent-soft/60 ring-2 ring-agent-line", className)}
		>
			<header className="flex items-center gap-2 px-1.5 py-1">
				<h3 className="font-display text-base text-ink">{title ?? STATE_LABEL[state]}</h3>
				<span className="tabular text-sm text-ink-5">{count}</span>
				<span className={clsx("ms-auto flex items-center gap-1 whitespace-nowrap text-xs", owner === "agent" ? "text-agent-ink" : owner === "human" ? "text-human-ink" : "text-ink-3")}>
					<Icon name={OWNER_ICON[owner]} size={13} />
					{OWNER_LABEL[owner]}
				</span>
			</header>
			{children}
		</section>
	);
}

// ============================================================================
// Editor: GateChecklist · FactMarkerCard · FactHighlight · AgentDiff · VersionList (ref 02)
// ============================================================================

export interface IGateChecklistProps {
	checks: IGateCheck[];
	onFix?: (id: string) => void;
	onOverride?: (id: string) => void;
	title?: string;
	className?: string;
}

/** Hard block = failing hard check in sections 1–5. Everything else that isn't passing is soft. */
export function isHardBlock(c: IGateCheck): boolean {
	return c.status === "fail" && c.severity === "hard" && c.section <= 5;
}

export function GateChecklist({ checks, onFix, onOverride, title = "On-page gate", className }: IGateChecklistProps) {
	const pass = checks.filter((c) => c.status === "pass").length;
	const hard = checks.filter(isHardBlock).length;
	const soft = checks.length - pass - hard;

	return (
		<Card variant="solid" padding="md" className={clsx("flex flex-col gap-3", className)}>
			<div className="flex items-center gap-2">
				<Icon name="ListChecks" size={17} />
				<h3 className="font-display text-lg">{title}</h3>
				<span className="tabular ms-auto font-display text-md" aria-label={`${pass} of ${checks.length} passing`}>
					{pass}
					<span className="text-ink-5">/{checks.length}</span>
				</span>
			</div>
			<div aria-hidden className="flex gap-0.5">
				{pass > 0 && <div className="h-1 rounded-pill bg-pass" style={{ flex: pass }} />}
				{soft > 0 && <div className="h-1 rounded-pill bg-human-line" style={{ flex: soft }} />}
				{hard > 0 && <div className="h-1 rounded-pill bg-block" style={{ flex: hard }} />}
			</div>
			<ul className="flex flex-col">
				{checks.map((c) => {
					if (c.status === "pass")
						return (
							<li key={c.id} className="flex items-center gap-2.5 py-2 text-[12.5px]">
								<Icon name="CheckCircle" size={16} className="shrink-0 text-pass" />
								<span className="flex-1">{c.label}</span>
								<span className="text-ink-4">{c.value}</span>
							</li>
						);
					if (isHardBlock(c))
						return (
							<li key={c.id} className="-mx-2.5 flex items-start gap-2.5 rounded-md bg-block-soft p-2.5 text-[12.5px]">
								<Icon name="XCircle" size={16} className="mt-px shrink-0 text-block" />
								<span className="flex flex-1 flex-col gap-0.5">
									<span className="text-ink">{c.label}</span>
									<span className="text-xs text-block-ink">
										Hard block · section {c.section}
										{c.value ? ` · ${c.value}` : ""}
									</span>
								</span>
								{onFix && (
									<button type="button" onClick={() => onFix(c.id)} className="press rounded-xs font-display text-xs text-ink underline underline-offset-2">
										Fix
									</button>
								)}
							</li>
						);
					return (
						<li key={c.id} className="flex items-start gap-2.5 py-2 text-[12.5px]">
							<Icon name="WarningCircle" size={16} className="mt-px shrink-0 text-human" />
							<span className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span>{c.label}</span>
								{c.override && (
									<span className="text-xs italic text-ink-4">
										Overridden by {c.override.by}: “{c.override.reason}”
									</span>
								)}
							</span>
							<span className="shrink-0 text-human-ink">
								{c.value && /\bsoft$/.test(c.value) ? c.value : `${c.value ? `${c.value} · ` : ""}soft`}
							</span>
							{onOverride && !c.override && (
								<button type="button" onClick={() => onOverride(c.id)} className="press shrink-0 rounded-xs font-display text-xs text-ink underline underline-offset-2">
									Override
								</button>
							)}
						</li>
					);
				})}
			</ul>
		</Card>
	);
}

export interface IFactMarkerCardProps {
	marker: IFactMarker;
	onAddSource: (id: string, url: string) => void;
	onRewrite: (id: string) => void;
	className?: string;
}

function isUrl(v: string): boolean {
	try {
		const u = new URL(v.trim());
		return u.protocol === "http:" || u.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Unsourced statistic. There is deliberately NO override path: the only exits are a source or a
 * rewrite. Approval stays locked while any marker is open (PRD non-negotiable 1).
 */
export function FactMarkerCard({ marker, onAddSource, onRewrite, className }: IFactMarkerCardProps) {
	const [adding, setAdding] = useState(false);
	const [url, setUrl] = useState("");
	const valid = isUrl(url);

	if (marker.status === "resolved")
		return (
			<div className={clsx("flex items-center gap-2 rounded-lg bg-surface p-3 text-sm shadow-card ring-1 ring-line", className)}>
				<Icon name="SealCheck" size={16} className="shrink-0 text-pass" />
				<span className="min-w-0 flex-1 truncate">
					Sourced: <span className="text-ink-3">“{marker.claim}”</span>
				</span>
				{marker.source && (
					<a href={marker.source} target="_blank" rel="noreferrer noopener" className="max-w-[40%] truncate font-mono text-xs text-pass-ink underline underline-offset-2">
						{marker.source}
					</a>
				)}
			</div>
		);

	return (
		<div role="group" aria-label="Unsourced statistic" className={clsx("flex flex-col gap-2.5 rounded-lg bg-surface p-3.5 shadow-float ring-1 ring-line", className)}>
			<div className="flex items-center gap-2">
				<span className="grid size-[26px] shrink-0 place-items-center rounded-pill bg-block-soft text-block-ink">
					<Icon name="SealQuestion" size={14} />
				</span>
				<span className="font-display text-md">Unsourced statistic</span>
				<Chip tone="block" size="sm" icon="LockSimple" className="ms-auto">
					Can&apos;t override
				</Chip>
			</div>
			<p className="text-sm leading-normal text-ink-3">
				<span className="text-ink-2">“{marker.claim}”</span> — {marker.note}
			</p>

			{adding ? (
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (!valid) return;
						onAddSource(marker.id, url.trim());
						setAdding(false);
						setUrl("");
					}}
				>
					<label className="flex flex-col gap-1">
						<span className="text-xs text-ink-4">Source URL · must support the exact claim</span>
						<input
							type="url"
							inputMode="url"
							autoFocus
							required
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://"
							aria-invalid={url.length > 0 && !valid}
							className={clsx(
								"h-9 rounded-sm border bg-surface px-3 font-mono text-sm text-ink outline-none placeholder:text-ink-5 focus-visible:border-agent",
								url.length > 0 && !valid ? "border-block" : "border-line-2",
							)}
						/>
						{url.length > 0 && !valid && <span className="text-xs text-block-ink">Enter a full http(s) link.</span>}
					</label>
					<div className="flex gap-1.5">
						<Button type="submit" variant="primary" size="sm" icon="Check" disabled={!valid}>
							Save source
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => {
								setAdding(false);
								setUrl("");
							}}
						>
							Cancel
						</Button>
					</div>
				</form>
			) : (
				<div className="flex flex-wrap gap-1.5">
					<Button variant="primary" size="sm" icon="Link" onClick={() => setAdding(true)}>
						Add source
					</Button>
					<Button variant="agent" size="sm" icon="Sparkle" onClick={() => onRewrite(marker.id)}>
						Rewrite without it
					</Button>
				</div>
			)}
			<span className="flex items-center gap-1.5 text-xs text-ink-4">
				<Icon name="LockSimple" size={12} />
				Approval stays locked until this is sourced or rewritten.
			</span>
		</div>
	);
}

export interface IFactHighlightProps {
	children: ReactNode;
	status: "open" | "resolved";
	className?: string;
}

export function FactHighlight({ children, status, className }: IFactHighlightProps) {
	return (
		<mark
			className={clsx(
				"rounded-[3px] px-0.5 text-inherit",
				status === "open" ? "border-b-2 border-block bg-block-soft" : "border-b border-dashed border-pass bg-transparent",
				className,
			)}
		>
			{children}
			<span className="sr-only">{status === "open" ? " (unsourced claim — needs a source)" : " (sourced)"}</span>
		</mark>
	);
}

export interface IAgentDiffProps {
	suggestion: IAgentSuggestion;
	onAccept: (id: string) => void;
	onReject: (id: string) => void;
	/** Unchanged text before / after the changed span so the diff reads as the whole paragraph (ref 02). */
	lead?: ReactNode;
	tail?: ReactNode;
	className?: string;
}

/** Every agent change is an inline diff with Accept / Reject (P3, C9). */
export function AgentDiff({ suggestion, onAccept, onReject, lead, tail, className }: IAgentDiffProps) {
	const [local, setLocal] = useState<IAgentSuggestion["status"]>(suggestion.status);
	const status = suggestion.status !== "pending" ? suggestion.status : local;

	if (status !== "pending")
		return (
			<div className={clsx("flex items-center gap-2 rounded-md bg-sunken-2 px-3 py-2 text-sm text-ink-3", className)} role="status">
				<Icon name={status === "accepted" ? "CheckCircle" : "XCircle"} size={15} className={status === "accepted" ? "text-pass" : "text-ink-4"} />
				<span className="min-w-0 flex-1 truncate">
					Agent edit {status} · “{suggestion.instruction}”
				</span>
				<Icon name="Robot" size={13} className="text-agent" />
			</div>
		);

	return (
		<div role="group" aria-label={`Agent edit: ${suggestion.instruction}`} className={clsx("flex flex-col gap-2.5 rounded-lg bg-agent-soft/30 px-4 py-3.5 ring-1 ring-agent-soft", className)}>
			<div className="flex flex-wrap items-center gap-2 font-display text-sm text-agent-ink">
				<Icon name="Robot" size={15} className="text-agent" />
				<span className="min-w-0 flex-1">Agent edit · “{suggestion.instruction}”</span>
				<span className="ms-auto flex gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						icon="X"
						onClick={() => {
							setLocal("rejected");
							onReject(suggestion.id);
						}}
					>
						Reject
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon="Check"
						onClick={() => {
							setLocal("accepted");
							onAccept(suggestion.id);
						}}
					>
						Accept
					</Button>
				</span>
			</div>
			<p className="whitespace-pre-line text-base leading-prose text-ink-2">
				{lead}
				{suggestion.before && (
					<>
						<del className="bg-block-soft text-block-ink line-through">
							<span className="sr-only">Removed: </span>
							{suggestion.before}
						</del>{" "}
					</>
				)}
				<ins className="bg-pass-soft text-pass-ink no-underline">
					<span className="sr-only">Added: </span>
					{suggestion.after}
				</ins>
				{tail}
			</p>
		</div>
	);
}

export interface IVersionListProps {
	versions: IVersion[];
	currentId: string;
	onRestore?: (id: string) => void;
	onDiff?: (id: string) => void;
	/** Reference time for relative ages (epoch ms); pass the app clock when it is pinned. */
	now?: number;
	className?: string;
}

export function VersionList({ versions, currentId, onRestore, onDiff, now, className }: IVersionListProps) {
	const sorted = [...versions].sort((a, b) => b.n - a.n);
	return (
		<ol className={clsx("flex flex-col gap-1", className)}>
			{sorted.map((v) => {
				const current = v.id === currentId;
				const agent = v.origin === "agent-generation" || v.origin === "agent-edit";
				return (
					<li key={v.id} className={clsx("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm", current && "bg-sunken")}>
						<Dot tone={agent ? "agent" : v.origin === "refresh" ? "info" : "ink"} />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="flex items-center gap-1.5">
								<span className="font-display">v{v.n}</span>
								<span className="truncate">· {ORIGIN_LABEL[v.origin]}</span>
								{current && <span className="text-xs text-ink-4">· current</span>}
							</span>
							<span className="truncate text-xs text-ink-4">
								{v.actor} · {v.words.toLocaleString("en-US")} words{v.note ? ` · ${v.note}` : ""}
							</span>
						</span>
						<span className="shrink-0 text-xs text-ink-4">{formatRelative(v.at, now)}</span>
						{!current && onDiff && <IconButton icon="Eye" label={`Compare v${v.n} with current`} variant="ghost" size="sm" onClick={() => onDiff(v.id)} />}
						{!current && onRestore && <IconButton icon="ArrowUUpLeft" label={`Restore v${v.n}`} variant="ghost" size="sm" onClick={() => onRestore(v.id)} />}
					</li>
				);
			})}
		</ol>
	);
}

// ============================================================================
// TemplatePreview (ref 02 right pane)
// ============================================================================

export interface ITemplatePreviewProps {
	site: ISite;
	post: IPost;
	device: "desktop" | "mobile";
	manifestVersion: number;
	/** Eyebrow category; falls back to the content type. */
	pillar?: IPillar;
	className?: string;
}

export function TemplatePreview({ site, post, device, manifestVersion, pillar, className }: ITemplatePreviewProps) {
	const minutes = Math.max(1, Math.round(post.words / 250));
	const eyebrow = `${(pillar?.name ?? CONTENT_TYPE_LABEL[post.contentType]).toUpperCase()} · ${minutes} MIN READ`;
	const paragraphs = post.blocks.filter((b) => b.kind === "p").slice(0, 2);
	const mobile = device === "mobile";

	return (
		<div className={clsx("flex flex-col overflow-hidden", className)}>
			<div className="flex-1 bg-sunken-2 p-3.5">
				<div
					aria-label={`${site.name} ${device} preview, manifest v${manifestVersion}`}
					className={clsx("mx-auto flex flex-col overflow-hidden rounded-md bg-surface", mobile ? "max-w-[300px] rounded-lg ring-4 ring-line-2" : "w-full")}
				>
					<div className="flex h-[34px] items-center gap-3 whitespace-nowrap border-b border-line px-3.5 font-display text-2xs text-ink-3">
						<span className="text-ink">{site.name}</span>
						{mobile ? (
							<Icon name="ListBullets" size={13} className="ms-auto" />
						) : (
							<>
								<span className="ms-auto">Services</span>
								<span>Blog</span>
								<span>Book</span>
							</>
						)}
					</div>
					<div className="flex flex-col gap-1.5 px-4 pb-1.5 pt-4">
						<span className="text-[9px] tracking-wide text-ink-4">{eyebrow}</span>
						<span className={clsx("font-display leading-snug text-ink", mobile ? "text-lg" : "text-xl")}>{post.seoTitle}</span>
					</div>
					<figure className={clsx("mx-4 my-2 grid place-items-center rounded-sm border border-dashed border-line-3 bg-sunken px-2 text-center font-mono text-2xs text-ink-4", mobile ? "h-[120px]" : "h-[150px]")}>
						figure.post-media · hero 1600×900
					</figure>
					<div className="flex flex-col gap-2 px-4 pb-4 pt-1">
						{paragraphs.length > 0 ? (
							paragraphs.map((p) => (
								<p key={p.id} className={clsx("text-ink-2", mobile ? "text-xs leading-normal" : "text-sm leading-relaxed", p.factMarkerIds?.length && "rounded-xs bg-block-soft/60")}>
									{p.text}
								</p>
							))
						) : (
							<p className="text-xs text-ink-4">No body paragraphs yet — the writer agent hasn&apos;t produced any.</p>
						)}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-3">
				<Icon name="CheckCircle" size={14} className="shrink-0 text-pass" />
				<span className="flex-1">Renders with site classes · no invented markup</span>
				<span className="shrink-0 text-ink-4">manifest v{manifestVersion}</span>
			</div>
		</div>
	);
}

// ============================================================================
// Image pipeline: SlotRow · CandidateGrid · PromptEditor · ProvenanceCard (ref 03)
// ============================================================================

export interface ISlotRowProps {
	slot: IImageSlot;
	selected?: boolean;
	onSelect: (id: string) => void;
	className?: string;
}

function slotStatusText(slot: IImageSlot): string {
	if (slot.provider === "inline-svg") return "Inline SVG · no model";
	if (slot.status === "human-only") return "Human-only · waiting on you";
	const who = `${PROVIDER_LABEL[slot.provider]} · ${PROVIDER_ROUTE[slot.provider]}`;
	switch (slot.status) {
		case "candidates":
			return `${who} · ${pluralize(slot.candidates.length, "candidate")}`;
		case "failed":
			return `${who} · failed`;
		default:
			return `${who} · ${slot.status}`;
	}
}

export function SlotRow({ slot, selected, onSelect, className }: ISlotRowProps) {
	const human = slot.status === "human-only";
	let tile = "bg-sunken ring-1 ring-inset ring-line";
	let icon: TIconName = "Images";
	let iconCls = "";
	if (slot.provider === "inline-svg" || slot.type === "chart") icon = "ChartBar";
	if (slot.status === "selected") {
		icon = "CheckCircle";
		iconCls = "text-pass";
	} else if (slot.status === "generating" || slot.status === "queued") {
		tile = "bg-agent-soft";
		icon = slot.status === "queued" ? "HourglassMedium" : "CircleNotch";
		iconCls = clsx("text-agent-ink", slot.status === "generating" && "c-spin");
	} else if (human) {
		tile = "border-[1.5px] border-dashed border-human-line";
		icon = "UserFocus";
		iconCls = "text-human";
	} else if (slot.status === "failed") {
		tile = "bg-block-soft";
		icon = "Warning";
		iconCls = "text-block";
	}
	if (selected) {
		tile = "bg-ink-hover";
		iconCls = slot.status === "generating" ? "c-spin" : "";
	}

	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={() => onSelect(slot.id)}
			className={clsx(
				"press flex w-full items-center gap-3 rounded-lg p-2.5 text-start",
				selected ? "bg-ink text-on-ink" : human ? "bg-human-soft hover:bg-human-soft/70" : "hover:bg-sunken",
				className,
			)}
		>
			<span className={clsx("grid size-[52px] shrink-0 place-items-center rounded-md", tile)}>
				<Icon name={icon} size={18} className={iconCls} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-display text-[13.5px]">{slot.name}</span>
				<span className={clsx("truncate text-xs", selected ? "text-ink-5" : human ? "text-human-ink" : "text-ink-4")}>{slotStatusText(slot)}</span>
			</span>
		</button>
	);
}

export interface ICandidateGridProps {
	candidates: ICandidate[];
	onPick: (id: string) => void;
	className?: string;
}

export function CandidateGrid({ candidates, onPick, className }: ICandidateGridProps) {
	return (
		<div role="radiogroup" aria-label="Generated candidates" className={clsx("grid grid-cols-2 gap-3", className)}>
			{candidates.map((c) => (
				<button
					key={c.id}
					type="button"
					role="radio"
					aria-checked={c.selected}
					onClick={() => onPick(c.id)}
					className={clsx(
						"press relative flex aspect-[3/2] flex-col items-start justify-between overflow-hidden rounded-xl p-3 text-start",
						ART[((Math.round(c.hue) % 4) + 4) % 4],
						c.selected ? "ring-2 ring-ink" : "ring-1 ring-inset ring-line hover:ring-line-3",
					)}
				>
					{c.url ? (
						// Real candidate (generated, sourced or diagram SVG data URI) — additive: placeholder art otherwise.
						<img src={c.url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={clsx("absolute inset-0 size-full", c.source?.kind === "diagram" ? "bg-surface object-contain" : "object-cover")} />
					) : (
						<span aria-hidden className="absolute inset-0 bg-linear-to-br from-surface/55 via-transparent to-ink/5" />
					)}
					{!c.url && <Icon name="Image" size={18} className="relative text-ink-4" />}
					<span className={clsx("relative text-xs", c.url ? "mt-auto rounded-pill bg-surface/90 px-2 py-0.5 text-ink-2" : c.selected ? "text-ink-2" : "text-ink-3")}>{c.label}</span>
					{c.selected && (
						<span className="absolute end-3 top-3 grid size-[30px] place-items-center rounded-pill bg-ink text-on-ink">
							<Icon name="Check" size={15} />
						</span>
					)}
				</button>
			))}
		</div>
	);
}

export interface IPromptEditorProps {
	prompt: string;
	styleKeywords: string[];
	onChange: (prompt: string) => void;
	onRegenerate: () => void;
	estimateUsd: number;
	onUpload: () => void;
	onHumanOnly: () => void;
	busy?: boolean;
	className?: string;
}

export function PromptEditor({ prompt, styleKeywords, onChange, onRegenerate, estimateUsd, onUpload, onHumanOnly, busy, className }: IPromptEditorProps) {
	return (
		<div className={clsx("flex flex-col gap-3", className)}>
			<div className="flex flex-col gap-2.5 rounded-xl bg-sunken-2 px-4 py-3.5">
				<div className="flex flex-wrap items-center gap-2 font-display text-sm text-ink-3">
					<Icon name="TextAa" size={15} />
					<label htmlFor="prompt-editor">Prompt</label>
					<span className="ms-auto flex flex-wrap gap-1.5">
						{styleKeywords.map((k) => (
							<span key={k} className="whitespace-nowrap rounded-pill bg-surface px-2 py-1 text-xs text-ink">
								{k}
							</span>
						))}
					</span>
				</div>
				<textarea
					id="prompt-editor"
					value={prompt}
					onChange={(e) => onChange(e.target.value)}
					rows={3}
					className="w-full resize-none bg-transparent text-md leading-normal text-ink-2 outline-none placeholder:text-ink-5"
					placeholder="Describe the image. Brand keywords are added for you."
				/>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="secondary" icon="ArrowsClockwise" onClick={onRegenerate} loading={busy}>
					Regenerate
				</Button>
				<Button variant="secondary" icon="UploadSimple" onClick={onUpload}>
					Upload own
				</Button>
				<Button variant="secondary" icon="Hand" onClick={onHumanOnly}>
					Mark human-only
				</Button>
				<span className="tabular ms-auto text-sm text-ink-3">Est. {formatUsd(estimateUsd)} per regenerate</span>
			</div>
		</div>
	);
}

export interface IProvenanceCardProps {
	slot: IImageSlot;
	/** Additive: when a candidate carries agent provenance (ICandidate.source), show it instead of the slot's routing. */
	candidate?: ICandidate;
	className?: string;
}

const SOURCE_KIND_LABEL: Record<NonNullable<ICandidate["source"]>["kind"], string> = { generated: "Generated", diagram: "Diagram from the post", sourced: "Sourced · licensed", upload: "Human upload" };

const LICENSING: Record<TProvider, string> = {
	higgsfield: "Higgsfield commercial terms",
	openai: "OpenAI usage terms",
	"open-source": "No per-asset license",
	"web-source": "Per-image license · see attribution",
	"inline-svg": "Rendered from post data",
	human: "Supplied by the team",
};

export function ProvenanceCard({ slot, candidate, className }: IProvenanceCardProps) {
	const src = candidate?.source;
	if (src)
		return (
			<Card variant="solid" padding="md" className={clsx("flex flex-col gap-3", className)}>
				<CardHeader icon="Fingerprint" title="Provenance" />
				<KeyValue
					dense
					rows={[
						{ k: "Route", v: SOURCE_KIND_LABEL[src.kind] },
						{ k: "Provider", v: src.provider },
						...(src.model ? [{ k: "Model", v: <span className="font-mono text-xs break-all">{src.model}</span> }] : []),
						...(src.license ? [{ k: "License", v: src.license }] : []),
						...(src.creator ? [{ k: "Creator", v: <span className="break-words">{src.creator}</span> }] : []),
						{ k: "Retrieved", v: slot.generatedAt ? formatDateTime(slot.generatedAt) : <span className="text-ink-4">Just now</span> },
					]}
				/>
				{src.attribution && <p className="text-xs leading-normal break-words text-ink-3">{src.attribution}</p>}
				{src.sourceUrl && (
					<a href={src.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 self-start text-xs text-ink underline underline-offset-2">
						Source page
						<Icon name="ArrowUpRight" size={12} />
					</a>
				)}
			</Card>
		);
	return (
		<Card variant="solid" padding="md" className={clsx("flex flex-col gap-3", className)}>
			<CardHeader icon="Fingerprint" title="Provenance" />
			<KeyValue
				dense
				rows={[
					{ k: "Provider", v: `${PROVIDER_LABEL[slot.provider]} · ${PROVIDER_ROUTE[slot.provider]}` },
					{ k: "Model", v: slot.provider === "inline-svg" || slot.provider === "human" ? "None" : <span className="font-mono text-xs">{slot.model}</span> },
					{ k: "Generated", v: slot.generatedAt ? formatDateTime(slot.generatedAt) : <span className="text-ink-4">Not generated yet</span> },
					{ k: "Licensing", v: LICENSING[slot.provider] },
				]}
			/>
		</Card>
	);
}

// ============================================================================
// Template ingestion: ManifestMappingRow · SourceCodeFrame · OutputFormatPicker (ref 04)
// ============================================================================

type TMappingRole = ITemplateMapping["role"];

const ROLE_OPTIONS: { value: TMappingRole; label: string }[] = [
	{ value: "unclassified", label: "Choose type" },
	{ value: "content-region", label: "Content region" },
	{ value: "heading", label: "Heading" },
	{ value: "list", label: "List" },
	{ value: "quote", label: "Quote" },
	{ value: "table", label: "Table" },
	{ value: "image", label: "Image" },
	{ value: "meta", label: "Meta" },
	{ value: "schema", label: "Schema" },
];

export const MAPPING_ROLE_LABEL: Record<TMappingRole, string> = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.value === "unclassified" ? "Unclassified" : o.label])) as Record<TMappingRole, string>;

export interface IManifestMappingRowProps {
	mapping: ITemplateMapping;
	onMap?: (id: string, role: TMappingRole) => void;
	/** Map by meaning: when set and the mapping has `options` ("CTA block", "Callout", "Ignore"), the row offers
	 *  those labels and stays editable until the manifest is confirmed. */
	onMapLabel?: (id: string, label: string) => void;
	className?: string;
}

export function ManifestMappingRow({ mapping, onMap, onMapLabel, className }: IManifestMappingRowProps) {
	if (onMapLabel && mapping.options?.length) {
		const open = mapping.status === "needs-you";
		const suggested = open && mapping.detail?.endsWith("?") ? mapping.detail : undefined;
		return (
			<div className={clsx("flex items-center gap-2.5 rounded-lg px-3.5 py-3", open ? "bg-human-soft" : "bg-sunken", className)}>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate font-mono text-sm text-ink">{mapping.selector}</span>
					{!open && (
						<span className="flex items-center gap-1 text-xs text-pass-ink">
							<Icon name="CheckCircle" size={12} />
							Mapped · {mapping.label}
						</span>
					)}
				</span>
				<div role="group" aria-label={`Type for ${mapping.selector}`} className="shrink-0">
					<Select
						value={open ? null : (mapping.label ?? null)}
						placeholder={suggested ?? "Choose type"}
						options={mapping.options.map((o) => ({ value: o, label: o }))}
						onChange={(v) => onMapLabel(mapping.id, v)}
						align="end"
					/>
				</div>
			</div>
		);
	}
	const needsYou = mapping.role === "unclassified" || mapping.status === "needs-you";
	if (needsYou)
		return (
			<div className={clsx("flex items-center gap-2.5 rounded-lg bg-human-soft px-3.5 py-3", className)}>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="truncate font-mono text-sm text-ink">{mapping.selector}</span>
					{mapping.detail && <span className="truncate text-xs text-human-ink">{mapping.detail}</span>}
				</span>
				{onMap ? (
					<Select
						value={mapping.role === "unclassified" ? null : mapping.role}
						placeholder="Choose type"
						options={ROLE_OPTIONS.filter((o) => o.value !== "unclassified")}
						onChange={(v) => onMap(mapping.id, v as TMappingRole)}
						className="shrink-0"
					/>
				) : (
					<Chip tone="human" size="sm">
						Needs you
					</Chip>
				)}
			</div>
		);

	const absent = mapping.status === "absent";
	return (
		<div className={clsx("flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0", className)}>
			<span className="w-24 shrink-0 text-sm text-ink-3">{mapping.label ?? MAPPING_ROLE_LABEL[mapping.role]}</span>
			<span className={clsx("min-w-0 flex-1 truncate", absent ? "text-sm text-ink-4" : "font-mono text-xs text-ink")} title={absent ? mapping.detail : mapping.selector}>
				{absent ? mapping.detail : mapping.selector}
			</span>
			<Icon name={absent ? "MinusCircle" : "CheckCircle"} size={16} className={clsx("shrink-0", absent ? "text-ink-5" : "text-pass")} />
			<span className="sr-only">{absent ? "Not in template" : "Mapped"}</span>
		</div>
	);
}

export interface ISourceHighlight {
	selector: string;
	label: string;
	tone: TTone;
	/** Text lifted from the sample for this region (e.g. eyebrow + title); replaces the placeholder lines. */
	sample?: ReactNode;
}

export interface ISourceCodeFrameProps {
	html: string;
	highlights?: ISourceHighlight[];
	mode: "rendered" | "source";
	className?: string;
}

const REGION_RING: Record<TTone, string> = {
	agent: "border-[1.5px] border-dashed border-agent-line",
	human: "bg-human-soft ring-[1.5px] ring-human-line",
	block: "bg-block-soft ring-[1.5px] ring-block",
	pass: "ring-[1.5px] ring-pass",
	ink: "ring-[1.5px] ring-ink",
	neutral: "ring-[1.5px] ring-ink",
	info: "ring-[1.5px] ring-line-3",
};

const REGION_TAG: Record<TTone, string> = {
	agent: "bg-agent text-on-ink",
	human: "bg-human-line text-ink",
	block: "bg-block text-on-ink",
	pass: "bg-pass text-on-ink",
	ink: "bg-ink text-on-ink",
	neutral: "bg-ink text-on-ink",
	info: "bg-sunken text-ink-3",
};

const LINE_BG: Record<TTone, string> = {
	agent: "bg-agent-soft",
	human: "bg-human-soft",
	block: "bg-block-soft",
	pass: "bg-pass-soft",
	ink: "bg-sunken",
	neutral: "bg-sunken",
	info: "bg-info-soft",
};

/** The most specific token of a selector, used to find it in the source ("h2.post__heading" → "post__heading"). */
function selectorNeedle(selector: string): string {
	const last = selector.trim().split(/[\s>+~]+/).pop() ?? selector;
	const cls = last.split(".").filter(Boolean);
	if (last.includes(".") && cls.length > 1) return cls[cls.length - 1]!.replace(/\[.*$/, "");
	return `<${last.replace(/[.[#:].*$/, "")}`;
}

function SkeletonLines({ widths, tone = "bg-line" }: { widths: string[]; tone?: string }) {
	return (
		<div aria-hidden className="flex flex-col gap-[7px]">
			{widths.map((w, i) => (
				<div key={i} className={clsx("h-2 rounded-xs", tone)} style={{ width: w }} />
			))}
		</div>
	);
}

/**
 * Sample post with labelled regions. "rendered" is a structural schematic (the tenant's HTML is never
 * injected into the CMS); "source" shows the HTML with the mapped lines tinted.
 */
export function SourceCodeFrame({ html, highlights = [], mode, className }: ISourceCodeFrameProps) {
	if (mode === "source") {
		const lines = html.split("\n");
		const needles = highlights.map((h) => ({ ...h, needle: selectorNeedle(h.selector) }));
		return (
			<div className={clsx("thin-scrollbar overflow-auto rounded-md bg-sunken-2 py-3", className)}>
				<pre className="m-0 min-w-max font-mono text-xs leading-relaxed text-ink-2">
					{lines.map((line, i) => {
						const hit = needles.find((n) => line.includes(n.needle));
						return (
							<div key={i} className={clsx("flex gap-4 pe-4 ps-3", hit && LINE_BG[hit.tone])}>
								<span aria-hidden className="w-6 shrink-0 select-none text-end text-ink-5">
									{i + 1}
								</span>
								<code className="flex-1 whitespace-pre">{line || " "}</code>
								{hit && <span className={clsx("self-center whitespace-nowrap rounded-xs px-1.5 font-display text-2xs", REGION_TAG[hit.tone])}>{hit.label}</span>}
							</div>
						);
					})}
				</pre>
			</div>
		);
	}

	const hasOuter = highlights.length > 0 && highlights[0]!.tone === "agent";
	const outer: ISourceHighlight | undefined = hasOuter ? highlights[0] : undefined;
	const inner: ISourceHighlight[] = hasOuter ? highlights.slice(1) : highlights;
	return (
		<div className={clsx("bg-sunken-2 px-6 py-6 sm:px-14", className)}>
			<div className="relative flex flex-col gap-3.5 rounded-md bg-surface px-7 py-6">
				{outer && (
					<>
						<div aria-hidden className={clsx("pointer-events-none absolute -inset-1.5 rounded-[20px]", REGION_RING[outer.tone])} />
						<span className={clsx("absolute -top-[18px] start-[18px] rounded-pill px-2 py-0.5 font-display text-[10.5px]", REGION_TAG[outer.tone])}>
							{outer.label} · {outer.selector}
						</span>
					</>
				)}
				{inner.length === 0 && <SkeletonLines widths={["100%", "94%", "78%", "88%"]} />}
				{inner.map((h, i) => {
					const isImage = /img|figure|media/i.test(h.selector);
					const isHeading = /^h[1-6]|heading/i.test(h.selector);
					return (
						<div key={`${h.selector}-${i}`} className="flex flex-col gap-3.5">
							<div className={clsx("relative rounded-sm p-2.5", REGION_RING[h.tone])}>
								<span className={clsx("absolute -top-2.5 end-2.5 whitespace-nowrap rounded-xs px-1.5 py-0.5 font-mono text-2xs", REGION_TAG[h.tone])}>{h.label}</span>
								{h.sample ? (
									<div className="flex flex-col gap-1.5">{h.sample}</div>
								) : isImage ? (
									<div className="grid h-[150px] place-items-center rounded-sm bg-sunken text-xs text-ink-3">{h.selector}</div>
								) : isHeading ? (
									<div aria-hidden className="h-3 w-2/5 rounded-xs bg-line-3" />
								) : (
									<SkeletonLines widths={["60%", "80%"]} tone={h.tone === "human" ? "bg-human-line/40" : "bg-line"} />
								)}
							</div>
							{i < inner.length - 1 && <SkeletonLines widths={["100%", "88%"]} />}
						</div>
					);
				})}
			</div>
		</div>
	);
}

type TOutput = ITemplateManifest["output"];

export const OUTPUT_LABEL: Record<TOutput, string> = { mdx: "MDX + frontmatter", html: "HTML", json: "JSON", component: "Component" };

export interface IOutputFormatPickerProps {
	value: TOutput;
	onChange: (v: TOutput) => void;
	className?: string;
}

export function OutputFormatPicker({ value, onChange, className }: IOutputFormatPickerProps) {
	return (
		<div className={clsx("flex flex-col gap-1.5", className)}>
			<span className="text-xs text-ink-4">Output format · what the repo consumes</span>
			<SegmentedControl<TOutput>
				options={(Object.keys(OUTPUT_LABEL) as TOutput[]).map((k) => ({ value: k, label: OUTPUT_LABEL[k] }))}
				value={value}
				onChange={onChange}
				size="sm"
			/>
		</div>
	);
}

// ============================================================================
// Approval: ApprovalQueueItem · ReadinessGrid · OverrideReason · AssertionList (ref 05)
// ============================================================================

export interface IApprovalQueueItemProps {
	post: IPost;
	selected?: boolean;
	onSelect: (id: string) => void;
	blocks: number;
	day: number;
	className?: string;
}

export function ApprovalQueueItem({ post, selected, onSelect, blocks, day, className }: IApprovalQueueItemProps) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={() => onSelect(post.id)}
			className={clsx(
				"press flex w-full flex-col gap-2.5 rounded-xl bg-surface p-4 text-start shadow-card",
				selected ? "ring-[1.5px] ring-ink" : "hover:shadow-raised",
				className,
			)}
		>
			<span className="flex w-full items-center gap-1.5">
				{blocks > 0 ? (
					<Chip tone="block" size="sm">
						{pluralize(blocks, "hard block")}
					</Chip>
				) : post.source === "refresh" ? (
					<Chip tone="neutral" size="sm">
						Refresh cycle
					</Chip>
				) : (
					<Chip tone="pass" size="sm">
						Ready
					</Chip>
				)}
				<span className={clsx("tabular ms-auto text-xs", day >= 7 ? "text-human-ink" : "text-ink-4")}>Day {day}</span>
			</span>
			<span className="font-display text-lg leading-snug">{post.title}</span>
			{blocks === 0 && post.source !== "refresh" && <span aria-hidden className="block h-1 w-full rounded-pill bg-pass" />}
		</button>
	);
}

export interface IReadinessItem {
	id: string;
	icon: TIconName;
	label: string;
	value: string;
	tone: TTone;
}

export interface IReadinessGridProps {
	items: IReadinessItem[];
	className?: string;
}

export function ReadinessGrid({ items, className }: IReadinessGridProps) {
	return (
		<ul className={clsx("grid grid-cols-2 gap-2 lg:grid-cols-4", className)}>
			{items.map((it) => (
				<li key={it.id} className={clsx("flex flex-col gap-2 rounded-lg p-3.5", it.tone === "block" ? "bg-block-soft" : it.tone === "human" ? "bg-human-soft" : "bg-sunken-2")}>
					<Icon name={it.icon} size={18} className={TONE_ICON[it.tone]} />
					<span className="font-display text-md">{it.label}</span>
					<span className={clsx("text-xs", it.tone === "block" || it.tone === "human" ? TONE_TEXT[it.tone] : "text-ink-3")}>{it.value}</span>
				</li>
			))}
		</ul>
	);
}

export interface IOverrideReasonProps {
	check: IGateCheck;
	value: string;
	onChange: (v: string) => void;
	className?: string;
}

export function OverrideReason({ check, value, onChange, className }: IOverrideReasonProps) {
	const id = `override-${check.id}`;
	return (
		<div className={clsx("flex flex-col gap-2.5", className)}>
			<span className="flex items-center gap-1.5 font-display text-md">
				<Icon name="WarningCircle" size={15} className="text-human" />
				Soft block · override with a reason
			</span>
			<div className="flex flex-col gap-2.5 rounded-lg bg-human-soft/40 px-4 py-3.5 ring-1 ring-human-line/60">
				<div className="flex items-center gap-2 text-[12.5px]">
					<label htmlFor={id} className="flex-1">
						{check.label}
					</label>
					<span className="text-human-ink">{check.value}</span>
				</div>
				<textarea
					id={id}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					rows={2}
					required
					placeholder="Why is this fine to ship? e.g. the linked page ships next week."
					className="w-full resize-y rounded-sm border border-human-line/70 bg-surface px-3 py-2.5 text-[12.5px] leading-normal text-ink-2 outline-none placeholder:text-ink-5 focus-visible:border-human"
				/>
				<span className="flex items-center gap-1.5 text-xs text-human-ink">
					<Icon name="Note" size={13} />
					{value.trim() ? "Logged to the audit trail and listed in the MR" : "A reason is required · logged to the audit trail and listed in the MR"}
				</span>
			</div>
		</div>
	);
}

export interface IAssertionListProps {
	values: [boolean, boolean, boolean];
	onChange: (i: number, v: boolean) => void;
	className?: string;
}

export const ASSERTIONS = ["The facts are right", "The voice is right", "The brand stands behind it"] as const;

export function AssertionList({ values, onChange, className }: IAssertionListProps) {
	return (
		<fieldset className={clsx("m-0 flex flex-col gap-2 border-0 p-0", className)}>
			<legend className="mb-2 font-display text-md">I confirm</legend>
			{ASSERTIONS.map((label, i) => {
				const on = values[i]!;
				return (
					<button
						key={label}
						type="button"
						role="checkbox"
						aria-checked={on}
						onClick={() => onChange(i, !on)}
						className="press flex items-center gap-3 rounded-md bg-sunken-2 px-3.5 py-3 text-start font-sans text-md hover:bg-sunken"
					>
						<span className={clsx("grid size-[22px] shrink-0 place-items-center rounded-xs", on ? "bg-ink text-on-ink" : "border-[1.5px] border-ink-5 bg-surface")}>
							{on && <Icon name="Check" size={13} weight="bold" />}
						</span>
						{label}
					</button>
				);
			})}
		</fieldset>
	);
}

// ============================================================================
// MR: MRPreview · CIStatus · ScopeNote
// ============================================================================

export interface ICIStatusProps {
	ci: IMergeRequest["ci"];
	status: IMergeRequest["status"];
	className?: string;
}

const MR_STATUS: Record<IMergeRequest["status"], { tone: TTone; icon: TIconName; label: string }> = {
	open: { tone: "ink", icon: "GitPullRequest", label: "Open" },
	merged: { tone: "pass", icon: "GitMerge", label: "Merged" },
	closed: { tone: "neutral", icon: "X", label: "Closed" },
	conflict: { tone: "block", icon: "Warning", label: "Conflict" },
};

const CI_STATUS: Record<IMergeRequest["ci"], { tone: TTone; icon: TIconName; label: string }> = {
	pending: { tone: "agent", icon: "CircleNotch", label: "CI running" },
	passing: { tone: "pass", icon: "CheckCircle", label: "CI passing" },
	failing: { tone: "block", icon: "XCircle", label: "CI failing" },
	none: { tone: "neutral", icon: "Minus", label: "No CI" },
};

export function CIStatus({ ci, status, className }: ICIStatusProps) {
	const s = MR_STATUS[status];
	const c = CI_STATUS[ci];
	return (
		<span className={clsx("inline-flex items-center gap-1.5", className)}>
			<Chip tone={s.tone} icon={s.icon} size="sm">
				{s.label}
			</Chip>
			{status !== "merged" && status !== "closed" && (
				<Chip tone={c.tone} icon={c.icon} size="sm">
					{c.label}
				</Chip>
			)}
		</span>
	);
}

export interface IScopeNoteProps {
	repo: IRepoConnection;
	className?: string;
}

/** Repo scope is always visible where a write happens (non-negotiable 6). */
export function ScopeNote({ repo, className }: IScopeNoteProps) {
	return (
		<Card variant="solid" padding="md" className={clsx("flex flex-col gap-2.5", className)}>
			<div className="flex items-center gap-2">
				<Icon name="ShieldCheck" size={17} />
				<span className="font-display text-lg">Scope</span>
			</div>
			<p className="text-sm leading-normal text-ink-3">
				Writes only to <code className="font-mono text-xs text-ink">{repo.contentDir}</code> and <code className="font-mono text-xs text-ink">{repo.assetDir}</code>. Never pushes to{" "}
				<code className="font-mono text-xs text-ink">{repo.baseBranch}</code>. CI runs the repo&apos;s own checks.
			</p>
			<span className="text-xs text-ink-4">
				Branches: <span className="font-mono">{repo.branchPattern}</span> · as {repo.installedAs}
			</span>
		</Card>
	);
}

export interface IMRPreviewProps {
	mr: IMergeRequest;
	post: IPost;
	keyword: IKeyword;
	repo: IRepoConnection;
	/** Pre-approval preview: the MR doesn't exist yet, so no status / CI chips. */
	hideStatus?: boolean;
	className?: string;
}

const FILE_ICON: Record<IMergeRequest["files"][number]["kind"], TIconName> = { post: "FileText", assets: "Image", index: "TreeStructure" };

export function MRPreview({ mr, post, keyword, repo, hideStatus, className }: IMRPreviewProps) {
	const total = post.gate.length;
	const passing = post.gate.filter((c) => c.status === "pass" && !c.override).length;
	const overrides = post.gate.filter((c) => c.override).length;
	const find = (re: RegExp) => post.gate.find((c) => re.test(c.label));
	const links = find(/internal link/i);
	const schema = find(/schema/i);
	const notChecked = <span className="text-ink-4">Not checked</span>;

	return (
		<div className={clsx("flex flex-col gap-3", className)}>
			<Card variant="solid" padding="md" className="flex flex-col gap-3.5">
				<div className="flex items-center gap-2">
					<Icon name={mr.host === "github" ? "GithubLogo" : "GitlabLogo"} size={17} />
					<span className="font-display text-lg">Merge request preview</span>
					<Chip tone="neutral" size="sm" className="ms-auto">
						{mr.host === "github" ? "GitHub" : "GitLab"}
					</Chip>
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="max-w-full truncate rounded-xs bg-sunken px-2 py-1 font-mono">{mr.branch}</span>
					<Icon name="ArrowRight" size={13} className="text-ink-4" />
					<span className="sr-only">into</span>
					<span className="rounded-xs bg-sunken px-2 py-1 font-mono">{mr.base}</span>
					{!hideStatus && <CIStatus ci={mr.ci} status={mr.status} className="ms-auto" />}
				</div>
				<ul className="flex flex-col gap-0.5">
					{mr.files.map((f) => (
						<li key={f.path} className="flex items-center gap-2 py-1.5 text-xs">
							<Icon name={FILE_ICON[f.kind]} size={14} className="shrink-0" />
							<span className="min-w-0 flex-1 truncate font-mono" title={f.path}>
								{f.path}
							</span>
							<span className={clsx("tabular shrink-0", f.change.startsWith("+") ? "text-pass-ink" : f.change.startsWith("-") || f.change.startsWith("−") ? "text-block-ink" : "text-ink-4")}>{f.change}</span>
						</li>
					))}
				</ul>
			</Card>

			<Card variant="solid" padding="md" className="flex flex-col gap-2.5">
				<span className="font-display text-lg">Description</span>
				<KeyValue
					dense
					rows={[
						{ k: "Keyword", v: keyword.term },
						{ k: "Intent", v: INTENT_LABEL[keyword.intent] },
						{ k: "On-page", v: `${passing} / ${total}${overrides ? ` · ${pluralize(overrides, "override")}` : ""}` },
						{ k: "Internal links", v: links ? links.value : notChecked },
						{ k: "Schema", v: schema ? schema.value : notChecked },
					]}
				/>
				{mr.overrides.length > 0 && (
					<div className="flex flex-col gap-1.5 rounded-md bg-human-soft px-3 py-2.5">
						<span className="flex items-center gap-1.5 font-display text-xs text-human-ink">
							<Icon name="Note" size={13} />
							Overrides · listed for the reviewer
						</span>
						<ul className="flex list-disc flex-col gap-1 ps-5 text-xs text-ink-2">
							{mr.overrides.map((o) => (
								<li key={o}>{o}</li>
							))}
						</ul>
					</div>
				)}
			</Card>

			<ScopeNote repo={repo} />
		</div>
	);
}

// ============================================================================
// SEO: KasRow · KasTable (ref 06)
// ============================================================================

export interface IKasRowProps {
	keyword: IKeyword;
	onSelect?: (id: string) => void;
}

function formatDelta(d: number): { text: string; cls: string } {
	if (Math.abs(d) < 0.05) return { text: "0.0", cls: "text-ink-4" };
	return d > 0 ? { text: `+${d.toFixed(1)}`, cls: "text-pass-ink" } : { text: `−${Math.abs(d).toFixed(1)}`, cls: "text-block-ink" };
}

export function KasRow({ keyword: k, onSelect }: IKasRowProps) {
	const delta = formatDelta(k.kasDelta);
	const trend = k.positionTrend;
	const first = trend.length > 1 ? trend[0]! : null;
	const improving = first != null && k.position != null && k.position < first;
	const worsening = first != null && k.position != null && k.position > first;
	const orphan = k.rankingPages === 1;
	const cell = "border-t border-line py-2.5";

	return (
		<tr onClick={onSelect ? () => onSelect(k.id) : undefined} className={clsx(onSelect && "cursor-pointer hover:bg-sunken-2")}>
			<td className={clsx(cell, "pe-3")}>
				<span className="flex items-center gap-1.5">
					{onSelect ? (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSelect(k.id);
							}}
							className="min-w-0 truncate rounded-xs text-start hover:underline"
						>
							{k.term}
						</button>
					) : (
						<span className="min-w-0 truncate">{k.term}</span>
					)}
					{orphan && (
						<span className="shrink-0 rounded-pill bg-human-soft px-1.5 py-0.5 font-display text-2xs text-human-ink" title="Only one page carries this keyword's weight">
							orphan
						</span>
					)}
				</span>
			</td>
			<td className={clsx(cell, "tabular pe-3 text-end font-display text-md")}>{k.kasShare.toFixed(1)}%</td>
			<td className={clsx(cell, "tabular pe-3 text-end", delta.cls)}>{delta.text}</td>
			<td className={clsx(cell, "max-w-0 pe-3")}>
				{k.rankingUrl ? <span className="block truncate font-mono text-xs text-ink-2">{k.rankingUrl}</span> : <span className="text-ink-4">Not ranking</span>}
			</td>
			<td className={clsx(cell, "tabular whitespace-nowrap text-end", k.decaying ? "text-block-ink" : "")}>
				{k.position == null ? (
					<span className="text-ink-4">No position</span>
				) : (
					<>
						{k.position}
						{(k.decaying || worsening) && " ↓"}
						{!k.decaying && improving && " ↑"}
						{k.decaying && " decaying"}
					</>
				)}
			</td>
		</tr>
	);
}

export interface IKasTableProps {
	keywords: IKeyword[];
	onSelect?: (id: string) => void;
	className?: string;
}

export function KasTable({ keywords, onSelect, className }: IKasTableProps) {
	return (
		<div className={clsx("overflow-x-auto", className)}>
			<table className="w-full min-w-[560px] border-collapse text-[12.5px]">
				<colgroup>
					<col className="w-[32%]" />
					<col className="w-[70px]" />
					<col className="w-[70px]" />
					<col />
					<col className="w-[110px]" />
				</colgroup>
				<thead>
					<tr className="text-xs text-ink-4">
						<th scope="col" className="py-1.5 pe-3 text-start font-normal">
							Keyword
						</th>
						<th scope="col" className="py-1.5 pe-3 text-end font-normal">
							Share
						</th>
						<th scope="col" className="py-1.5 pe-3 text-end font-normal">
							<abbr title="Change since last period, percentage points" className="no-underline">
								Δ
							</abbr>
						</th>
						<th scope="col" className="py-1.5 pe-3 text-start font-normal">
							Ranking page
						</th>
						<th scope="col" className="py-1.5 text-end font-normal">
							Position
						</th>
					</tr>
				</thead>
				<tbody>
					{keywords.map((k) => (
						<KasRow key={k.id} keyword={k} onSelect={onSelect} />
					))}
				</tbody>
			</table>
		</div>
	);
}

// ============================================================================
// Runs & ledger: LedgerItem · RunRow · ScheduleRow · BudgetCard
// ============================================================================

export interface ILedgerItemProps {
	item: ILedgerItem;
	className?: string;
}

export function ledgerTone(ageDays: number): TTone {
	return ageDays >= 14 ? "block" : ageDays >= 7 ? "human" : "neutral";
}

export function LedgerItem({ item, className }: ILedgerItemProps) {
	const tone = ledgerTone(item.ageDays);
	const chip = tone === "block" ? `Blocker · day ${item.ageDays}` : tone === "human" ? `Overdue · day ${item.ageDays}` : `Day ${item.ageDays}`;
	return (
		<div className={clsx("flex items-start gap-3 rounded-lg p-3", tone === "block" ? "bg-block-soft/50" : tone === "human" ? "bg-human-soft/50" : "bg-surface", className)}>
			<Icon name={tone === "neutral" ? "User" : "Hand"} size={16} className={clsx("mt-0.5 shrink-0", TONE_ICON[tone === "neutral" ? "human" : tone])} />
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="font-display text-md leading-snug">{item.title}</span>
				<span className="text-xs text-ink-4">
					{item.owner} · since {formatDay(item.createdAt)}
				</span>
				<span className={clsx("flex items-center gap-1.5 text-xs", tone === "block" ? "text-block-ink" : "text-ink-3")}>
					{tone === "block" && <Icon name="WarningDiamond" size={12} />}
					{item.downstream}
				</span>
			</div>
			<Chip tone={tone} size="sm" className="shrink-0">
				{chip}
			</Chip>
		</div>
	);
}

export const RUN_KIND_ICON: Record<TRunKind, TIconName> = {
	"keyword-swarm": "MagnifyingGlass",
	"post-generation": "NotePencil",
	"technical-monitor": "Compass",
	"qa-sweep": "ListChecks",
	"content-refresh": "ArrowsClockwise",
	"link-prospecting": "LinkSimple",
	"site-discovery": "TreeStructure",
	"biweekly-report": "ChartLineUp",
	"kas-recalc": "Target",
	"image-generation": "ImagesSquare",
};

const RUN_STATUS: Record<IRun["status"], { tone: TTone; label: string; icon?: TIconName }> = {
	queued: { tone: "neutral", label: "Queued", icon: "HourglassMedium" },
	running: { tone: "agent", label: "Running" },
	succeeded: { tone: "pass", label: "Succeeded", icon: "CheckCircle" },
	failed: { tone: "block", label: "Failed", icon: "XCircle" },
	"refused-over-cap": { tone: "block", label: "Refused · over cap", icon: "Wallet" },
};

function formatTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n);
}

export interface IRunRowProps {
	run: IRun;
	className?: string;
}

export function RunRow({ run, className }: IRunRowProps) {
	const s = RUN_STATUS[run.status];
	const over = run.costUsd > run.estimateUsd * 1.1;
	return (
		<div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0", className)}>
			<span className="grid size-9 shrink-0 place-items-center rounded-pill bg-agent-soft text-agent-ink">
				<Icon name={RUN_KIND_ICON[run.kind]} size={16} />
			</span>
			<div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
				<span className="flex items-center gap-2 font-display text-md">
					{run.agent}
					<Chip tone="neutral" size="sm" icon={run.trigger === "scheduled" ? "CalendarBlank" : "Hand"}>
						{run.trigger === "scheduled" ? "Scheduled" : "Manual"}
					</Chip>
				</span>
				<span className="truncate text-xs text-ink-3">{run.output}</span>
			</div>
			<span className="font-mono text-xs text-ink-3">{run.model}</span>
			<span className="tabular w-20 text-end text-xs text-ink-3">{formatTokens(run.tokens)} tokens</span>
			<span className="tabular w-32 text-end text-xs">
				<span className={over ? "text-human-ink" : "text-ink"}>{formatUsd(run.costUsd)}</span>
				<span className="text-ink-4"> / est. {formatUsd(run.estimateUsd)}</span>
			</span>
			<span className="flex w-40 items-center justify-end gap-2">
				<span className="text-xs text-ink-4">{formatRelative(run.startedAt)}</span>
				{run.status === "running" ? (
					<Chip tone="agent" size="sm">
						<Dot tone="agent" pulse className="me-1" />
						Running
					</Chip>
				) : (
					<Chip tone={s.tone} icon={s.icon} size="sm">
						{s.label}
					</Chip>
				)}
			</span>
		</div>
	);
}

export interface IScheduleRowProps {
	schedule: ISchedule;
	onRunNow: (kind: TRunKind) => void;
	onToggle: (kind: TRunKind, v: boolean) => void;
	estimateUsd: number;
	/** Refuse up front when the run would exceed the remaining cap. */
	overCap?: boolean;
	/** Why Run now + the toggle are locked (role, or the same run already running). Shown inline, never hidden. */
	locked?: string;
	className?: string;
}

export function ScheduleRow({ schedule, onRunNow, onToggle, estimateUsd, overCap, locked, className }: IScheduleRowProps) {
	return (
		<div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0", className)}>
			<span className="grid size-9 shrink-0 place-items-center rounded-pill bg-sunken">
				<Icon name={RUN_KIND_ICON[schedule.kind]} size={16} />
			</span>
			<div className="flex min-w-[180px] flex-1 flex-col gap-0.5">
				<span className="font-display text-md">{schedule.label}</span>
				<span className="text-xs text-ink-3">
					{schedule.cadence} · {schedule.produces}
				</span>
				{locked && (
					<span className="flex items-center gap-1 text-xs text-ink-4">
						<Icon name="LockSimple" size={12} />
						{locked}
					</span>
				)}
			</div>
			<span className="text-xs text-ink-4">{schedule.enabled ? `Next ${formatDateTime(schedule.nextAt)}` : "Paused"}</span>
			<Toggle checked={schedule.enabled} onChange={(v: boolean) => onToggle(schedule.kind, v)} label={`${schedule.label} schedule`} disabled={!!locked} />
			{locked ? (
				<Tooltip label={locked}>
					<span tabIndex={0} aria-label={`Run now locked · ${locked}`}>
						<Button variant="secondary" size="sm" icon="LockSimple" disabled>
							Run now · est. {formatUsd(estimateUsd)}
						</Button>
					</span>
				</Tooltip>
			) : overCap ? (
				<Tooltip label="This run would go above the budget cap, so it's refused.">
					<span>
						<Button variant="secondary" size="sm" icon="LockSimple" disabled>
							Over cap · est. {formatUsd(estimateUsd)}
						</Button>
					</span>
				</Tooltip>
			) : (
				<Button variant="secondary" size="sm" icon="Play" onClick={() => onRunNow(schedule.kind)}>
					Run now · est. {formatUsd(estimateUsd)}
				</Button>
			)}
		</div>
	);
}

export interface IBudgetCardProps {
	label: string;
	spent: number;
	cap: number;
	onEdit?: () => void;
	className?: string;
}

export function BudgetCard({ label, spent, cap, onEdit, className }: IBudgetCardProps) {
	const ratio = cap > 0 ? spent / cap : 1;
	return (
		<Card variant="solid" padding="md" className={clsx("flex flex-col gap-3", className)}>
			<CardHeader
				icon="Wallet"
				title={label}
				action={
					onEdit ? (
						<Button variant="ghost" size="sm" icon="PencilSimple" onClick={onEdit}>
							Edit cap
						</Button>
					) : undefined
				}
			/>
			<Meter value={spent} max={cap} label="Spent this period" format={formatUsd} warnAt={0.8} />
			{ratio < 1 && <span className="tabular text-xs text-ink-3">{formatUsd(Math.max(0, cap - spent))} left before runs are refused</span>}
			<span className="flex items-center gap-1.5 text-xs text-ink-3">
				<Icon name="ShieldCheck" size={13} />
				Refuses any run above the cap · estimate shown before each run
			</span>
		</Card>
	);
}

// ============================================================================
// RoleGate · CommentThread
// ============================================================================

export interface IRoleGateProps {
	role: TRole;
	allow: TRole[];
	children: ReactNode;
	fallback?: ReactNode;
	/** Verb for the tooltip ("approve", "merge"); default "do this". */
	action?: string;
	className?: string;
}

/** Locked actions are shown disabled with the reason — never hidden silently (C7). */
export function RoleGate({ role, allow, children, fallback, action = "do this", className }: IRoleGateProps) {
	if (allow.includes(role)) return <>{children}</>;
	if (fallback !== undefined) return <>{fallback}</>;
	const reason = `Your role (${ROLE_LABEL[role]}) can't ${action}`;
	return (
		<Tooltip label={reason}>
			<span className={clsx("inline-flex cursor-not-allowed", className)} tabIndex={0} aria-label={reason}>
				<span aria-disabled="true" inert className="pointer-events-none inline-flex select-none opacity-45">
					{children}
				</span>
			</span>
		</Tooltip>
	);
}

export interface ICommentThreadProps {
	comments: IPost["comments"];
	onAdd?: (text: string) => void;
	readOnly?: boolean;
	/** Reference time for relative ages (epoch ms); pass the app clock when it is pinned. */
	now?: number;
	className?: string;
}

export function CommentThread({ comments, onAdd, readOnly, now, className }: ICommentThreadProps) {
	const [draft, setDraft] = useState("");
	const canAdd = !readOnly && !!onAdd;
	return (
		<div className={clsx("flex flex-col gap-3", className)}>
			{comments.length === 0 ? (
				<p className="text-sm text-ink-4">No comments yet.</p>
			) : (
				<ol className="flex flex-col gap-3">
					{comments.map((c) => (
						<li key={c.id} className="flex gap-2.5">
							<Avatar name={c.by} initials={initialsOf(c.by)} size={32} />
							<div className="flex min-w-0 flex-1 flex-col gap-0.5">
								<span className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
									<span className="font-display text-md text-ink">{c.by}</span>
									<span className="text-ink-4">
										{ROLE_LABEL[c.role]} · {formatRelative(c.at, now)}
									</span>
								</span>
								<p className="text-md leading-normal text-ink-2">{c.text}</p>
							</div>
						</li>
					))}
				</ol>
			)}
			{canAdd && (
				<form
					className="flex flex-col gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						const t = draft.trim();
						if (!t) return;
						onAdd!(t);
						setDraft("");
					}}
				>
					<textarea
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						rows={2}
						aria-label="Add a comment"
						placeholder="Add a comment for the team"
						className="w-full resize-y rounded-md border border-line-2 bg-surface px-3 py-2.5 text-md leading-normal outline-none placeholder:text-ink-5 focus-visible:border-agent"
					/>
					<Button type="submit" variant="secondary" size="sm" icon="ChatCircle" disabled={!draft.trim()} className="self-end">
						Comment
					</Button>
				</form>
			)}
		</div>
	);
}

// ============================================================================
// Workspace (multi-site, multi-user) — docs/multi-site-contract.md
// ============================================================================

/** Workspace-level role labels (TWorkspaceRole). Site roles keep ROLE_LABEL. */
export const WORKSPACE_ROLE_LABEL: Record<TWorkspaceRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

/** Short site-role labels for dense chips and matrices. */
export const ROLE_SHORT: Record<TRole, string> = {
	specialist: "Specialist",
	developer: "Developer",
	stakeholder: "Stakeholder",
	admin: "Admin",
};

export interface IPresencePerson {
	name: string;
	initials: string;
	/** What they are doing, e.g. "editing" or "viewing". */
	activity?: string;
}

export interface IPresenceBadgeProps {
	people: IPresencePerson[];
	/** Where they are, for the accessible label ("on this site", "on this page"). */
	where?: string;
	max?: number;
	className?: string;
}

/** Other people here right now: a white pill with an avatar stack. Renders nothing when you're alone. */
export function PresenceBadge({ people, where = "here", max = 3, className }: IPresenceBadgeProps) {
	if (people.length === 0) return null;
	const shown = people.slice(0, max);
	const rest = people.length - shown.length;
	const label = `${people.map((p) => p.name).join(", ")} ${people.length === 1 ? "is" : "are"} ${where}`;
	return (
		<Tooltip label={label}>
			<span role="status" aria-label={label} tabIndex={0} className={clsx("inline-flex h-11 shrink-0 items-center gap-2 rounded-pill bg-surface ps-2 pe-3.5", className)}>
				<span className="inline-flex items-center">
					{shown.map((p, i) => (
						<span key={`${p.name}-${i}`} className={clsx("relative inline-flex rounded-full ring-2 ring-surface", i > 0 && "-ms-2")}>
							<Avatar name={p.name} initials={p.initials} size={32} />
							<span aria-hidden className="absolute -bottom-px -end-px size-2.5 rounded-full border-2 border-surface bg-pass" />
						</span>
					))}
					{rest > 0 && (
						<span aria-hidden className="tabular -ms-2 inline-grid size-8 place-items-center rounded-full bg-ink font-display text-xs text-on-ink ring-2 ring-surface">
							+{rest}
						</span>
					)}
				</span>
				<span aria-hidden className="tabular hidden font-display text-md font-medium text-ink xl:inline">
					{people.length === 1 ? shown[0]!.name.split(" ")[0] : `${people.length} here`}
				</span>
			</span>
		</Tooltip>
	);
}

export interface ISoftLockBannerProps {
	/** Who holds the soft lock. */
	editor: { name: string; initials: string };
	/** ISO time the lock started. */
	since?: string;
	/** You're viewing read-only; "View only" acknowledges, "Take over" claims the lock. */
	onTakeOver?: () => void;
	/** Why take-over is unavailable for this role (LockedAction-style copy); hides nothing. */
	takeOverLocked?: string | null;
	now?: number | Date;
	className?: string;
}

/** Soft lock when someone else is editing the same post: "Kunle O. is editing · View only · Take over". Human-amber (a person holds it). */
export function SoftLockBanner({ editor, since, onTakeOver, takeOverLocked, now, className }: ISoftLockBannerProps) {
	return (
		<div role="status" className={clsx("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-human-soft px-3.5 py-2.5", className)}>
			<Avatar name={editor.name} initials={editor.initials} size={24} />
			<span className="min-w-0 flex-1 text-md text-human-ink">
				<span className="font-display font-medium">{editor.name} is editing</span>
				{since && <span> · since {formatRelative(since, now)}</span>}
				<span> · View only</span>
			</span>
			{onTakeOver &&
				(takeOverLocked ? (
					<Tooltip label={takeOverLocked}>
						<span tabIndex={0} aria-label={`Take over — ${takeOverLocked}`} className="inline-flex cursor-not-allowed">
							<Button variant="secondary" size="sm" icon="LockSimple" disabled>
								Take over
							</Button>
						</span>
					</Tooltip>
				) : (
					<Button variant="secondary" size="sm" icon="Hand" onClick={onTakeOver}>
						Take over
					</Button>
				))}
		</div>
	);
}
