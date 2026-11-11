"use client";

// S07 /posts/[id]/assets — image pipeline for one post (ref 03; flow F4).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	AgentBadge,
	Button,
	Callout,
	CandidateGrid,
	Card,
	Chip,
	Dialog,
	EmptyState,
	FileDrop,
	HumanBadge,
	Icon,
	IconButton,
	KeyValue,
	LedgerItem,
	LockedAction,
	Menu,
	Meter,
	PaginationDots,
	PROVIDER_LABEL,
	PromptEditor,
	ProviderBadge,
	ProvenanceCard,
	RoleGate,
	Section,
	Select,
	Sheet,
	Skeleton,
	SlotRow,
	STATE_LABEL,
	TextArea,
	Tooltip,
	providerText,
	type IMenuItem,
} from "@/ds";
import { checkCap, fmtUsdWhole, isFilled } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteLedger, useSiteSlotsForPost } from "@/features/shared/site-source";
import { PageLoading } from "@/features/shared/page-loading";
import type { IImageSlot, IPost } from "@/lib/types";
import { findPost } from "../editor/util";
import { ConnectionsSummary } from "../settings/connections";
import { FillAllButton, OnlyWebSourcesCallout, VisualAgentProvider, VisualAgentRow } from "../visual-agent";
import { ChartSchematic, defaultSlot, GUARDRAIL_COPY, guardrailHit, ROUTABLE, slotStatusWord, UploadSheet } from "./parts";
import { sitePath } from "@/lib/routes";

const cap1 = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Header pieces ───────────────────────────────────────────────────────────

function BudgetPill() {
	const { site } = useSiteCms();
	return (
		<div className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-pill bg-surface py-1.5 ps-4 pe-5">
			<Icon name="Wallet" size={16} />
			<Meter label="Image budget" value={site.budgets.imageUsd} max={site.budgets.imageCapUsd} format={fmtUsdWhole} className="w-[210px]" />
		</div>
	);
}

function SendAction({ post, slots, compact }: { post: IPost; slots: IImageSlot[]; compact?: boolean }) {
	const { slug } = useSite();
	const { actions, can } = useSiteCms();
	const filled = slots.filter(isFilled).length;
	const count = `${filled} / ${slots.length} filled`;
	if (post.state === "in-review")
		return (
			<Button variant="primary" icon="SealCheck" href={sitePath(slug, `/approvals?post=${post.id}`)}>
				{compact ? "Approval" : "Go to approval"}
			</Button>
		);
	if (post.state !== "needs-assets")
		return (
			<Button variant="secondary" icon="NotePencil" href={sitePath(slug, `/posts/${post.id}`)}>
				Open draft
			</Button>
		);
	if (!can("post.sendToReview")) return <LockedAction label="Send to review" reasons={["Your role can view images. Tolu B. picks them."]} summary={count} />;
	const unfilled = slots.filter((s) => !isFilled(s));
	if (unfilled.length)
		return <LockedAction label="Send to review" icon="ArrowRight" reasons={unfilled.map((s) => `${s.name} · ${slotStatusWord(s)}`)} summary={count} />;
	return (
		<Button variant="primary" icon="ArrowRight" onClick={() => actions.sendToReview(post.id)} trailing={<span className="font-sans text-sm font-normal opacity-60">{count}</span>}>
			Send to review
		</Button>
	);
}

function ProviderControl({ slot }: { slot: IImageSlot }) {
	const { actions, can, data } = useSiteCms();
	if (slot.provider === "inline-svg" || slot.provider === "human" || !can("routing.set"))
		return (
			<Tooltip label={slot.type === "chart" ? "Charts are rendered from the post's data, never generated" : slot.provider === "inline-svg" ? "Drawn as SVG from the post by the visual agent" : "Routing is set per slot type by an agency admin"}>
				<span tabIndex={0} className="inline-flex rounded-pill">
					<ProviderBadge provider={slot.provider} model={slot.model} />
				</span>
			</Tooltip>
		);
	return (
		<Select
			icon="GitFork"
			align="end"
			value={slot.provider}
			onChange={(v) => v !== slot.provider && actions.setRouting(slot.type, v)}
			options={ROUTABLE.map((p) => ({
				value: p,
				label: p === slot.provider ? providerText(p, slot.model) : providerText(p, p === "open-source" ? "flux-dev" : undefined),
				hint: p === slot.provider ? "This slot" : data.routing[slot.type] === p ? `Current route for ${slot.type} slots` : `Route new ${slot.type} slots here`,
			}))}
		/>
	);
}

// ─── Center: candidates / generating / chart / human-only / failed ──────────

function SlotStage({ post, slot, onUpload }: { post: IPost; slot: IImageSlot; onUpload: () => void }) {
	const { slug } = useSite();
	const { actions, role } = useSiteCms();
	const ledger = useSiteLedger();
	const canAct = role === "specialist" || role === "admin";
	if (slot.type === "chart")
		return (
			<div className="flex flex-col gap-3">
				<ChartSchematic slot={slot} />
				<Callout
					tone="info"
					icon="ChartBar"
					title="Charts are never generated"
					action={
						<Button variant="secondary" size="sm" icon="PencilSimple" href={sitePath(slug, `/posts/${post.id}`)}>
							Edit data
						</Button>
					}
				>
					Inline SVG · no model. It renders from the post&apos;s own numbers, so the chart can&apos;t drift from the text.
				</Callout>
			</div>
		);
	if (slot.status === "generating" || slot.status === "queued")
		return (
			<div className="flex flex-col gap-3">
				<div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
					<AgentBadge running label={`${slot.provider === "open-source" ? providerText(slot.provider, slot.model) : PROVIDER_LABEL[slot.provider]} is returning 4 candidates`} />
					<span>usually under a minute · you can leave this page</span>
				</div>
				<div aria-hidden className="grid grid-cols-2 gap-3">
					{[0, 1, 2, 3].map((i) => (
						<Skeleton key={i} className="aspect-[3/2] w-full" radius={20} />
					))}
				</div>
			</div>
		);
	if (slot.status === "human-only") {
		const item = ledger.find((l) => l.slotId === slot.id);
		return (
			<div className="flex flex-col gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<HumanBadge />
					<span className="text-sm text-ink-3">{slot.prompt}</span>
				</div>
				{item && <LedgerItem item={item} />}
				<RoleGate role={role} allow={["specialist", "admin"]} action="upload images" fallback={<Callout tone="info" icon="LockSimple" title="Your role can view images. Tolu B. picks them." />}>
					<FileDrop
						accept=".png,.jpg,.jpeg,.webp,.avif,.svg"
						title="Drop a JPG, PNG or WebP"
						hint={`min ${slot.width} × ${slot.height} · converted to ${slot.format.toUpperCase()} and renamed ${slot.filename}`}
						onFile={(f) => actions.uploadOwn(slot.id, f.name)}
					/>
				</RoleGate>
			</div>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			{slot.status === "failed" && (
				<Callout
					tone="block"
					title={`${providerText(slot.provider, slot.model)} didn't respond. Retried 3 times.`}
					action={
						canAct ? (
							<>
								<Button variant="secondary" size="sm" icon="ArrowsClockwise" onClick={() => actions.regenerateSlot(slot.id)}>
									Try again
								</Button>
								<Button variant="ghost" size="sm" icon="UploadSimple" onClick={onUpload}>
									Upload own
								</Button>
							</>
						) : undefined
					}
				/>
			)}
			{slot.candidates.length > 0 &&
				(canAct ? (
					<CandidateGrid candidates={slot.candidates} onPick={(cid) => actions.pickCandidate(slot.id, cid)} />
				) : (
					<RoleGate role={role} allow={["specialist", "admin"]} action="pick candidates" className="w-full">
						<CandidateGrid candidates={slot.candidates} onPick={() => undefined} className="w-full" />
					</RoleGate>
				))}
			{slot.status === "selected" && (
				<Chip tone="pass" icon="CheckCircle" className="self-start">
					In use · committed with the post
				</Chip>
			)}
		</div>
	);
}

function PromptBlock({ slot, onUpload, onHumanOnly }: { slot: IImageSlot; onUpload: () => void; onHumanOnly: () => void }) {
	const { actions, role, site, state } = useSiteCms();
	const [prompt, setPrompt] = useState(slot.prompt);
	const [refused, setRefused] = useState(false);
	useEffect(() => {
		setPrompt(slot.prompt);
		setRefused(false);
	}, [slot.id, slot.prompt]);
	if (slot.provider === "inline-svg" || slot.type === "chart" || slot.status === "human-only") return null;
	const admin = state.members.find((m) => m.role === "admin")?.name ?? "an admin";
	const cap = checkCap(site, "image-generation", slot.estimateUsd || 0.12);
	if (role !== "specialist" && role !== "admin")
		return (
			<div className="flex flex-col gap-2 rounded-xl bg-sunken-2 px-4 py-3.5">
				<span className="flex items-center gap-2 font-display text-sm text-ink-3">
					<Icon name="TextAa" size={15} />
					Prompt
				</span>
				<p className="text-md leading-normal text-ink-2">{slot.prompt}</p>
				<span className="text-sm text-ink-3">Your role can view images. Tolu B. picks them.</span>
			</div>
		);
	return (
		<div className="flex flex-col gap-3">
			{cap.status === "refused" && (
				<Callout tone="block" icon="Wallet" title={`Over image cap · ${fmtUsdWhole(site.budgets.imageCapUsd)}`}>
					Regenerating would cost about ${(slot.estimateUsd || 0.12).toFixed(2)}. Ask {admin} to raise it, or upload your own.
				</Callout>
			)}
			{refused && (
				<Callout tone="block" icon="ShieldCheck" title="Can't generate this prompt">
					{GUARDRAIL_COPY}
				</Callout>
			)}
			<PromptEditor
				prompt={prompt}
				styleKeywords={slot.styleKeywords}
				estimateUsd={slot.estimateUsd || 0.12}
				busy={slot.status === "generating"}
				onChange={(v) => {
					setPrompt(v);
					if (refused && !guardrailHit(v)) setRefused(false);
				}}
				onRegenerate={() => {
					if (guardrailHit(prompt)) return setRefused(true);
					actions.regenerateSlot(slot.id, prompt !== slot.prompt ? prompt : undefined);
				}}
				onUpload={onUpload}
				onHumanOnly={onHumanOnly}
			/>
		</div>
	);
}

// ─── Right: spec + provenance + commit ───────────────────────────────────────

function useAlt(slot: IImageSlot | undefined) {
	const [alts, setAlts] = useState<Record<string, string>>({});
	const value = slot ? (alts[slot.id] ?? slot.alt) : "";
	return [value, (v: string) => slot && setAlts((a) => ({ ...a, [slot.id]: v }))] as const;
}

function CommitAction({ slot, alt, next, onNext, full }: { slot: IImageSlot; alt: string; next?: IImageSlot; onNext: (id: string) => void; full?: boolean }) {
	const { actions, role } = useSiteCms();
	const pickIdx = slot.candidates.findIndex((c) => c.selected);
	const label = pickIdx >= 0 ? `Use candidate ${pickIdx + 1}` : "Use candidate";
	const canAct = role === "specialist" || role === "admin";
	if (slot.type === "chart")
		return <span className="text-center text-xs text-ink-3">Rendered with the post · nothing to pick</span>;
	if (slot.status === "selected")
		return (
			<div className="flex flex-col gap-2">
				{next ? (
					<Button variant="primary" size="lg" fullWidth={full} icon="ArrowRight" onClick={() => onNext(next.id)}>
						Next open slot
					</Button>
				) : (
					<Chip tone="pass" icon="CheckCircle" className="self-center">
						Every slot is filled
					</Chip>
				)}
				<span className="text-center text-xs text-ink-3">{next ? `${next.name} · ${slotStatusWord(next)}` : "Compressed, resized and committed with the post"}</span>
			</div>
		);
	if (slot.status === "human-only")
		return <span className="text-center text-xs text-ink-3">Waiting on an upload · the post holds in Needs assets</span>;
	const why = !canAct ? "Your role can view images. Tolu B. picks them." : slot.status !== "candidates" ? "Waiting for candidates" : pickIdx < 0 ? "Pick a candidate first" : !alt.trim() ? "Add alt text — it travels with the asset" : null;
	return (
		<div className="flex flex-col gap-2">
			<Button variant="primary" size="lg" fullWidth={full} icon="Check" disabled={!!why} onClick={() => actions.useCandidate(slot.id)}>
				{label}
			</Button>
			<span className="text-center text-xs text-ink-3">{why ?? "Compressed, resized and committed with the post"}</span>
		</div>
	);
}

function SpecCard({ slot, alt, setAlt }: { slot: IImageSlot; alt: string; setAlt: (v: string) => void }) {
	const { role } = useSiteCms();
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-3">
			<h3 className="font-display text-lg">Slot spec</h3>
			<KeyValue
				dense
				rows={[
					{ k: "Type", v: cap1(slot.type) },
					{ k: "Format", v: slot.format === "svg" ? "SVG" : slot.format === "webp" ? "WebP" : "AVIF" },
					{ k: "Breakpoints", v: slot.breakpoints.join(" · ") },
					{ k: "Filename", v: <span className="font-mono text-2xs">{slot.filename}</span> },
				]}
			/>
			<TextArea
				label="Alt text · travels with the asset"
				value={alt}
				onChange={setAlt}
				rows={2}
				readOnly={role !== "specialist" && role !== "admin"}
				error={!alt.trim() ? "Add alt text — it travels with the asset" : undefined}
			/>
		</Card>
	);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function PostAssets({ id }: { id: string }) {
	const { slug } = useSite();
	const params = useSearchParams();
	const { data, role, actions, loading } = useSiteCms();
	const post = findPost(data, id);
	const slots = useSiteSlotsForPost(post?.id);
	const [selId, setSelId] = useState<string | null>(params.get("slot"));
	const [upload, setUpload] = useState(false);
	const [humanOnly, setHumanOnly] = useState(false);
	const [promptSheet, setPromptSheet] = useState(false);
	const slot = slots.find((s) => s.id === selId) ?? defaultSlot(slots);
	const [alt, setAlt] = useAlt(slot);
	const touch = useRef<number | null>(null);
	// Pin the default pick so committing a slot doesn't jump the view to the next default.
	useEffect(() => {
		if (!selId && slot) setSelId(slot.id);
	}, [selId, slot]);

	if (!post && loading) return <PageLoading rows={4} />;
	if (!post)
		return (
			<Card variant="solid" padding="lg" className="rounded-3xl">
				<EmptyState icon="ImagesSquare" title="Post not found" body={`No post “${decodeURIComponent(id)}” on this site.`} action={<Button variant="secondary" href={sitePath(slug, "/assets")}>All image slots</Button>} />
			</Card>
		);

	const select = (sid: string) => {
		setSelId(sid);
		try {
			window.history.replaceState(window.history.state, "", `${window.location.pathname}?slot=${sid}`);
		} catch {
			/* ignore */
		}
	};
	const idx = slot ? slots.findIndex((s) => s.id === slot.id) : -1;
	const filled = slots.filter(isFilled).length;
	const next = slot ? (slots.slice(idx + 1).find((s) => !isFilled(s)) ?? slots.find((s) => !isFilled(s) && s.id !== slot.id)) : undefined;
	const canAct = role === "specialist" || role === "admin";

	const crumbs = (
		<nav aria-label="Breadcrumb" className="flex h-11 min-w-0 items-center gap-2.5 whitespace-nowrap rounded-pill bg-surface px-[18px] text-md text-ink-3">
			<Link href={sitePath(slug, "/assets")} className="hover:text-ink">
				{STATE_LABEL[post.state]}
			</Link>
			<Icon name="CaretRight" size={11} />
			<h1 aria-current="page" className="truncate font-display text-base text-ink">
				<Link href={sitePath(slug, `/posts/${post.id}`)} className="hover:underline">
					{post.title}
				</Link>
			</h1>
		</nav>
	);

	if (!slots.length || !slot)
		return (
			<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
				<header className="flex shrink-0 items-center gap-2.5">
					<IconButton icon="ArrowLeft" label="Back to the draft" href={sitePath(slug, `/posts/${post.id}`)} />
					{crumbs}
				</header>
				<Card variant="solid" padding="lg" className="rounded-3xl">
					<EmptyState
						icon="ImagesSquare"
						title="No image slots"
						body="This draft didn't ask for images. Send it to review, or ask the agent to add a hero."
						action={
							<Button variant="secondary" icon="NotePencil" href={sitePath(slug, `/posts/${post.id}`)}>
								Back to the draft
							</Button>
						}
					/>
				</Card>
			</div>
		);

	const mobileMenu: IMenuItem[] = [
		{
			id: "send",
			label: post.state === "needs-assets" ? (filled === slots.length ? "Send to review" : `Send to review · ${filled} / ${slots.length} filled`) : "Open draft",
			icon: "ArrowRight",
			disabled: post.state === "needs-assets" && (filled !== slots.length || !canAct),
			onSelect: () => (post.state === "needs-assets" ? actions.sendToReview(post.id) : window.location.assign(sitePath(slug, `/posts/${post.id}`))),
		},
		{ id: "upload", label: "Upload own", icon: "UploadSimple", disabled: !canAct || slot.type === "chart", onSelect: () => setUpload(true) },
		{ id: "human", label: "Mark human-only", icon: "Hand", disabled: !canAct || slot.status === "human-only" || slot.type === "chart", onSelect: () => setHumanOnly(true) },
		{ id: "draft", label: "Back to the draft", icon: "NotePencil", onSelect: () => window.location.assign(sitePath(slug, `/posts/${post.id}`)) },
	];

	const title = (
		<div className="flex min-w-0 flex-col gap-0.5">
			<h2 className="tracking-display font-display text-[20px] leading-snug">{slot.name}</h2>
			<span className="text-sm text-ink-3">
				Placed {slot.placement.replace(/^After/, "after").replace(/^Top/, "at the top")} · {slot.width} × {slot.height}
			</span>
		</div>
	);

	const slotList: ReactNode = (
		<div className="flex flex-col gap-1">
			{slots.map((s) => (
				<SlotRow key={s.id} slot={s} selected={s.id === slot.id} onSelect={select} />
			))}
		</div>
	);

	return (
		<VisualAgentProvider post={post}>
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			{/* Header · desktop */}
			<header className="hidden shrink-0 items-center gap-2.5 lg:flex">
				<IconButton icon="ArrowLeft" label="Back to the draft" href={sitePath(slug, `/posts/${post.id}`)} />
				{crumbs}
				<div className="flex-1" />
				<BudgetPill />
				<FillAllButton slots={slots} />
				<SendAction post={post} slots={slots} />
			</header>

			{/* Desktop three columns */}
			<div className="hidden min-h-0 flex-1 gap-4 lg:flex">
				<Card variant="solid" padding="none" className="thin-scrollbar flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto rounded-3xl p-4">
					<Section title="Image slots" count={slots.length} meta="from production sheet">
						{slotList}
					</Section>
					<div className="flex-1" />
					<Callout tone="neutral" icon="Info" title="Routing is by slot type">
						Brand imagery → Higgsfield MCP or an image API. Diagrams → SVG from the post. Text-in-image → OpenAI. Real-world → licensed web source. Charts are never generated.
					</Callout>
					<ConnectionsSummary className="px-1" />
					<OnlyWebSourcesCallout />
				</Card>

				<Card variant="solid" padding="none" className="thin-scrollbar flex min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-3xl p-5">
					<div className="flex items-center gap-2.5">
						{title}
						<div className="flex-1" />
						<ProviderControl slot={slot} />
					</div>
					<VisualAgentRow slot={slot} primary={slot.candidates.length === 0 && slot.status !== "selected"} />
					<SlotStage post={post} slot={slot} onUpload={() => setUpload(true)} />
					<PromptBlock slot={slot} onUpload={() => setUpload(true)} onHumanOnly={() => setHumanOnly(true)} />
				</Card>

				<div className="thin-scrollbar flex w-[300px] shrink-0 flex-col gap-3 overflow-x-hidden overflow-y-auto">
					<SpecCard slot={slot} alt={alt} setAlt={setAlt} />
					<ProvenanceCard slot={slot} candidate={slot.candidates.find((c) => c.selected && c.source) ?? slot.candidates.find((c) => c.source)} />
					<div className="flex-1" />
					<CommitAction slot={slot} alt={alt} next={next} onNext={select} full />
				</div>
			</div>

			{/* Mobile */}
			<div className="flex flex-col gap-3 lg:hidden">
				<header className="flex items-center gap-2">
					<IconButton icon="ArrowLeft" label="Back to the draft" href={sitePath(slug, `/posts/${post.id}`)} />
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="text-xs text-ink-3">
							Slot {idx + 1} of {slots.length} · {filled} filled
						</span>
						<h1 className="truncate font-display text-base">{slot.name}</h1>
					</div>
					<Menu align="end" trigger={<IconButton icon="DotsThree" label="Slot actions" />} items={mobileMenu} />
				</header>
				<PaginationDots count={slots.length} index={idx} onChange={(i) => select(slots[i].id)} className="self-center" />
				<div className="flex flex-wrap items-center gap-2">
					<ProviderBadge provider={slot.provider} model={slot.model} className="bg-surface" />
					<span className="text-sm text-ink-3">
						{slot.width} × {slot.height} · {slot.format === "svg" ? "SVG" : "WebP"}
					</span>
				</div>
				<div
					onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
					onTouchEnd={(e) => {
						const x0 = touch.current;
						const x1 = e.changedTouches[0]?.clientX;
						touch.current = null;
						if (x0 == null || x1 == null || Math.abs(x1 - x0) < 60) return;
						const to = idx + (x1 < x0 ? 1 : -1);
						if (slots[to]) select(slots[to].id);
					}}
				>
					<SlotStage post={post} slot={slot} onUpload={() => setUpload(true)} />
				</div>
				<VisualAgentRow slot={slot} />
				<FillAllButton slots={slots} compact />
				{slot.provider !== "inline-svg" && slot.status !== "human-only" && (
					<Card variant="solid" padding="md" className="flex flex-col gap-2">
						<div className="flex items-center gap-1.5 font-display text-sm text-ink-3">
							<Icon name="TextAa" size={15} />
							Prompt
							{canAct && (
								<Button variant="ghost" size="sm" icon="PencilSimple" className="ms-auto" onClick={() => setPromptSheet(true)}>
									Edit
								</Button>
							)}
						</div>
						<p className="line-clamp-2 text-md leading-normal text-ink-2">{slot.prompt}</p>
					</Card>
				)}
				<Card variant="solid" padding="md">
					<TextArea label="Alt text" value={alt} onChange={setAlt} rows={2} readOnly={!canAct} error={!alt.trim() ? "Add alt text — it travels with the asset" : undefined} />
				</Card>
				<div className="sticky -bottom-28 z-10 -mx-4 -mb-24 flex items-center gap-2 bg-linear-to-t from-canvas from-80% to-transparent px-4 pt-3 pb-24">
					{canAct && slot.provider !== "inline-svg" && slot.status !== "human-only" && (
						<>
							<IconButton icon="ArrowsClockwise" label={`Regenerate · est. $${(slot.estimateUsd || 0.12).toFixed(2)}`} loading={slot.status === "generating"} onClick={() => actions.regenerateSlot(slot.id)} />
							<IconButton icon="UploadSimple" label="Upload own" onClick={() => setUpload(true)} />
						</>
					)}
					<div className="min-w-0 flex-1">
						<CommitAction slot={slot} alt={alt} next={next} onNext={select} full />
					</div>
				</div>
			</div>

			<UploadSheet slot={slot} open={upload} onClose={() => setUpload(false)} />

			<Sheet open={promptSheet} onClose={() => setPromptSheet(false)} title={`Prompt · ${slot.name}`} side="bottom">
				<PromptBlock slot={slot} onUpload={() => { setPromptSheet(false); setUpload(true); }} onHumanOnly={() => { setPromptSheet(false); setHumanOnly(true); }} />
			</Sheet>

			<Dialog
				open={humanOnly}
				onClose={() => setHumanOnly(false)}
				title="Send to your task queue?"
				footer={
					<>
						<Button variant="ghost" onClick={() => setHumanOnly(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							icon="Hand"
							onClick={() => {
								actions.markHumanOnly(slot.id);
								setHumanOnly(false);
							}}
						>
							Mark human-only
						</Button>
					</>
				}
			>
				The post stays in Needs assets until someone uploads “{slot.name}”. It appears in the ledger as a to-do and turns overdue after 7 days.
			</Dialog>
		</div>
		</VisualAgentProvider>
	);
}
