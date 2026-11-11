"use client";

// Visual-asset agent — the real, manual path in the per-post image pipeline (C13). The specialist runs the agent
// per slot (or "Fill all slots"); results land through actions.setSlotCandidates with provenance. Holds add nothing.
// Under autopost the store's simulated pipeline still fills slots on its own; nothing here runs automatically.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentBadge, Button, Callout, Chip, Icon, LockedAction, Select, Skeleton } from "@/ds";
import { isFilled } from "@/lib/logic";
import { useSiteCms } from "@/features/shared/site-source";
import type { IImageSlot, IPost } from "@/lib/types";
import { useConnections, type IConnection } from "@/features/connections";
import { availableOverrides, chooseRoute, onlyWebSources } from "@/server/visual-agent/route";
import type { IRouteDecision } from "@/server/visual-agent/types";
import { agentBrandPack, agentSlot, excerptOf, remainingImageUsd, runVisualAgentApi, type IVisualAgentResult, type TRouteOverride } from "./api";

export * from "./api";

interface ISlotRun {
	result?: IVisualAgentResult;
	error?: string;
	/** Store refusal when applying candidates (e.g. permissions). */
	applyError?: string;
}

interface IVisualAgentCtx {
	connections: IConnection[];
	loading: boolean;
	connError: string | null;
	busy: ReadonlySet<string>;
	runs: Record<string, ISlotRun>;
	overrides: Record<string, TRouteOverride | undefined>;
	setOverride: (slotId: string, o: TRouteOverride | undefined) => void;
	decisionFor: (slot: IImageSlot) => IRouteDecision;
	run: (slot: IImageSlot) => Promise<void>;
	fill: { running: boolean; done: number; total: number; current?: string } | null;
	fillAll: (slots: IImageSlot[]) => Promise<void>;
}

const Ctx = createContext<IVisualAgentCtx | null>(null);

/** Slots "Fill all" works on: unfilled, no candidates waiting, not a chart, not pinned to a person. */
export const fillable = (s: IImageSlot) => !isFilled(s) && s.type !== "chart" && !s.humanPinned && s.candidates.length === 0;

export function VisualAgentProvider({ post, children }: { post: IPost; children: ReactNode }) {
	const { site, data, actions } = useSiteCms();
	const { connections, loading, error: connError } = useConnections(site.id);
	const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
	const [runs, setRuns] = useState<Record<string, ISlotRun>>({});
	const [overrides, setOverrides] = useState<Record<string, TRouteOverride | undefined>>({});
	const [fill, setFill] = useState<IVisualAgentCtx["fill"]>(null);
	const live = useRef({ site, data, post, overrides });
	live.current = { site, data, post, overrides };

	const keyword = data.keywords.find((k) => k.id === post.keywordId)?.term ?? post.title;
	const brand = useMemo(() => agentBrandPack(data.brandPack), [data.brandPack]);

	const decisionFor = useCallback((slot: IImageSlot) => chooseRoute(agentSlot(slot), connections, brand, overrides[slot.id]), [connections, brand, overrides]);

	const run = useCallback(
		async (slot: IImageSlot) => {
			const { site: s, post: p, overrides: o } = live.current;
			setBusy((b) => new Set(b).add(slot.id));
			setRuns((r) => ({ ...r, [slot.id]: {} }));
			try {
				const result = await runVisualAgentApi({ siteId: s.id, slot: agentSlot(slot), post: excerptOf(p, keyword), brandPack: brand, estimateCapUsd: remainingImageUsd(s), override: o[slot.id] });
				let applyError: string | undefined;
				// Charts are never stored as candidates (the store refuses them); the preview stays in the panel.
				if (result.candidates.length && result.route !== "chart-svg" && result.route !== "hold") {
					const r = await actions.setSlotCandidates(slot.id, result.candidates, result.meta);
					if (!r.ok) applyError = r.reason;
				}
				setRuns((r) => ({ ...r, [slot.id]: { result, applyError } }));
			} catch (e) {
				setRuns((r) => ({ ...r, [slot.id]: { error: (e as Error).message } }));
			} finally {
				setBusy((b) => {
					const n = new Set(b);
					n.delete(slot.id);
					return n;
				});
			}
		},
		[actions, brand, keyword],
	);

	const fillAll = useCallback(
		async (slots: IImageSlot[]) => {
			const todo = slots.filter(fillable);
			setFill({ running: true, done: 0, total: todo.length });
			for (let i = 0; i < todo.length; i++) {
				setFill({ running: true, done: i, total: todo.length, current: todo[i].name });
				await run(todo[i]);
			}
			setFill({ running: false, done: todo.length, total: todo.length });
		},
		[run],
	);

	const setOverride = useCallback((slotId: string, v: TRouteOverride | undefined) => setOverrides((o) => ({ ...o, [slotId]: v })), []);

	const value = useMemo<IVisualAgentCtx>(() => ({ connections, loading, connError, busy, runs, overrides, setOverride, decisionFor, run, fill, fillAll }), [connections, loading, connError, busy, runs, overrides, setOverride, decisionFor, run, fill, fillAll]);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVisualAgent(): IVisualAgentCtx {
	const v = useContext(Ctx);
	if (!v) throw new Error("useVisualAgent must be used inside <VisualAgentProvider>");
	return v;
}

const OVERRIDE_LABEL: Record<TRouteOverride, string> = { generate: "Generate", diagram: "Diagram", source: "Source" };
const ROUTE_WORD: Record<IRouteDecision["route"], string> = { "generate-mcp": "Generate", "generate-api": "Generate", diagram: "Diagram", source: "Source", "chart-svg": "Chart", hold: "Hold" };
const usd = (n: number) => (n > 0 ? `Est. $${n.toFixed(2)}` : "No generation cost");

/** The slot panel's agent row: chosen route, override, estimate, Run, and the last result or hold. */
export function VisualAgentRow({ slot, primary }: { slot: IImageSlot; primary?: boolean }) {
	const { can, why } = useSiteCms();
	const va = useVisualAgent();
	const decision = va.decisionFor(slot);
	const busy = va.busy.has(slot.id);
	const run = va.runs[slot.id];
	const overrides = availableOverrides(agentSlot(slot), va.connections);
	const allowed = can("asset.manage");
	const isChart = slot.type === "chart";
	const label = isChart ? "Render chart from the post" : "Run visual agent";
	const cantRun = decision.route === "hold";

	return (
		<section aria-label="Visual agent" className="flex flex-col gap-2.5 rounded-xl bg-sunken-2 px-4 py-3.5">
			<div className="flex flex-wrap items-center gap-2">
				<span className="flex items-center gap-1.5 font-display text-sm text-ink-3">
					<Icon name="Robot" size={15} />
					Visual agent
				</span>
				{va.loading ? (
					<Skeleton className="h-[18px] w-48" />
				) : (
					<span className="min-w-0 text-sm text-ink-2" aria-live="polite">
						{decision.label}
					</span>
				)}
				<span className="tabular ms-auto text-sm text-ink-3">{usd(decision.estimateUsd)}</span>
			</div>
			{!va.loading && <p className="text-xs leading-normal text-ink-3">{decision.reason}</p>}
			{va.connError && <p className="text-xs text-block">Connections unavailable: {va.connError}</p>}
			<div className="flex flex-wrap items-center gap-2">
				{overrides.length > 0 && allowed && (
					<Select<"auto" | TRouteOverride>
						icon="GitFork"
						value={va.overrides[slot.id] ?? "auto"}
						disabled={busy}
						onChange={(v) => va.setOverride(slot.id, v === "auto" ? undefined : v)}
						options={[{ value: "auto", label: "Auto route", hint: "Per the harness routing table" }, ...overrides.map((o) => ({ value: o, label: OVERRIDE_LABEL[o], hint: o === "generate" ? "Connected MCP or image API · costs credits" : o === "diagram" ? "SVG from this post's own content" : "Licensed web image with attribution" }))]}
					/>
				)}
				{allowed ? (
					<Button variant={primary ? "primary" : "secondary"} icon={isChart ? "ChartBar" : "Sparkle"} loading={busy} disabled={busy || va.loading || cantRun} onClick={() => void va.run(slot)}>
						{busy ? "Running…" : label}
					</Button>
				) : (
					<LockedAction label={label} reasons={[why("asset.manage") ?? "Your role can view images only."]} />
				)}
				{busy && <AgentBadge running label={`${ROUTE_WORD[decision.route]} · ${decision.provider ?? "agent"}`} />}
				{cantRun && !busy && <span className="text-xs text-human-ink">{decision.reason}</span>}
			</div>
			<RunOutcome slot={slot} run={run} />
		</section>
	);
}

function RunOutcome({ slot, run }: { slot: IImageSlot; run?: ISlotRun }) {
	if (!run) return null;
	if (run.error) return <Callout tone="block" icon="Warning" title="The visual agent didn't finish">{run.error}</Callout>;
	const r = run.result;
	if (!r) return null;
	if (r.held)
		return (
			<Callout tone="human" icon="Hand" title="Held · nothing was added">
				{r.held.reason}
				{slot.type === "chart" ? "" : " Upload your own or mark the slot human-only."}
			</Callout>
		);
	if (run.applyError) return <Callout tone="block" title="Candidates couldn't be added">{run.applyError}</Callout>;
	const failed = r.attempts.filter((a) => !a.ok);
	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
				<Chip tone="agent" size="sm" icon="Robot">
					{r.candidates.length} {r.route === "chart-svg" ? "chart" : `candidate${r.candidates.length === 1 ? "" : "s"}`} · {ROUTE_WORD[r.route]}
				</Chip>
				<span>{r.attempts.filter((a) => a.ok).map((a) => a.note).join(" · ")}</span>
				{r.costEstimateUsd > 0 && <span className="tabular">· est. ${r.costEstimateUsd.toFixed(2)}</span>}
			</div>
			{failed.length > 0 && <p className="text-xs text-ink-3">Tried first: {failed.map((a) => a.note).join(" ")}</p>}
			{r.route === "source" && slot.type === "photo" && (
				<Callout tone="neutral" icon="Info" title="Sourced photos show other places">
					A licensed image can stand in for a generic scene, but it isn&apos;t your premises. Check the alt text still tells the truth before you use one.
				</Callout>
			)}
			{r.route === "chart-svg" && r.candidates[0] && (
				<figure className="flex flex-col gap-2 rounded-xl bg-surface p-3">
					<img src={r.candidates[0].url} alt={slot.alt} className="w-full" />
					<figcaption className="text-xs text-ink-3">Preview · renders from the post&apos;s own numbers when the MR builds. Nothing to pick.</figcaption>
				</figure>
			)}
		</div>
	);
}

/** Header action: run the agent across every unfilled slot, one after another, with progress. */
export function FillAllButton({ slots, compact }: { slots: IImageSlot[]; compact?: boolean }) {
	const { can } = useSiteCms();
	const va = useVisualAgent();
	const todo = slots.filter(fillable);
	if (!can("asset.manage")) return null;
	const running = !!va.fill?.running;
	return (
		<Button
			variant="secondary"
			icon="Sparkle"
			loading={running}
			disabled={running || va.loading || todo.length === 0 || va.busy.size > 0}
			title={todo.length === 0 ? "Every slot is filled or has candidates waiting" : undefined}
			onClick={() => void va.fillAll(slots)}
			aria-live="polite"
		>
			{running ? `Filling ${Math.min(va.fill!.done + 1, va.fill!.total)} of ${va.fill!.total}${compact || !va.fill?.current ? "" : ` · ${va.fill.current}`}` : todo.length ? `Fill all slots · ${todo.length}` : "All slots have images"}
		</Button>
	);
}

/** Left-column callout when only web sourcing is connected. */
export function OnlyWebSourcesCallout() {
	const va = useVisualAgent();
	if (va.loading || !onlyWebSources(va.connections)) return null;
	return (
		<Callout
			tone="info"
			icon="Plugs"
			title="Only web sourcing is connected — connect an image MCP or API in Settings → Connections to generate brand imagery."
		/>
	);
}
