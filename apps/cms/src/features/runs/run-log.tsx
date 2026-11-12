"use client";
// Run log (S15 region 5) + run detail Sheet (inputs / outputs / model / tokens / cost).
import Link from "next/link";
import { STAGE_LABEL } from "@/features/discovery/data";
import { useMemo, useState } from "react";
import {
	AgentBadge,
	Button,
	Callout,
	Card,
	CardHeader,
	Chip,
	DataTable,
	Dot,
	EmptyState,
	Icon,
	KeyValue,
	PaginationDots,
	RUN_KIND_ICON,
	RunRow,
	Sheet,
	SourceNote,
	type IDataTableColumn,
	type TIconName,
} from "@/ds";
import { fmtDate, fmtDateTime, fmtDay, fmtInt, fmtTime, fmtUsd, RUN_META } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms } from "@/features/shared/site-source";
import type { IRun, TTone } from "@/lib/types";
import { fmtDuration } from "./run-plan";
import { sitePath } from "@/lib/routes";

const PAGE = 6;

const STATUS: Record<IRun["status"], { tone: TTone; label: string; icon?: TIconName }> = {
	queued: { tone: "neutral", label: "Queued", icon: "HourglassMedium" },
	running: { tone: "agent", label: "Running" },
	succeeded: { tone: "pass", label: "Succeeded", icon: "CheckCircle" },
	failed: { tone: "block", label: "Failed", icon: "XCircle" },
	"refused-over-cap": { tone: "block", label: "Refused · over cap", icon: "Wallet" },
};

export function RunStatusChip({ status }: { status: IRun["status"] }) {
	const s = STATUS[status];
	if (status === "running")
		return (
			<Chip tone="agent" size="sm">
				<Dot tone="agent" pulse className="me-1" />
				Running
			</Chip>
		);
	return (
		<Chip tone={s.tone} icon={s.icon} size="sm">
			{s.label}
		</Chip>
	);
}

const modelText = (r: IRun) => (r.tier && r.model !== r.tier ? `${r.tier} · ${r.model}` : r.model);
const tokenText = (r: IRun) => (r.budget === "image" && r.tokens === 0 ? "—" : fmtInt(r.tokens));

export function RunLog({ nextScheduled }: { nextScheduled: string | null }) {
	const { slug } = useSite();
	const { data } = useSiteCms();
	const [page, setPage] = useState(0);
	const [openId, setOpenId] = useState<string | null>(null);
	const runs = useMemo(() => [...data.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [data.runs]);
	const pages = Math.max(1, Math.ceil(runs.length / PAGE));
	const p = Math.min(page, pages - 1);
	const rows = runs.slice(p * PAGE, p * PAGE + PAGE);
	const open = runs.find((r) => r.id === openId) ?? null;
	const spent = runs.reduce((s, r) => s + r.costUsd, 0);

	const columns: IDataTableColumn<IRun>[] = [
		{
			key: "run",
			header: "Run",
			render: (r) => (
				<span className="flex min-w-0 items-center gap-2.5 py-1.5">
					<span className="grid size-8 shrink-0 place-items-center rounded-pill bg-agent-soft text-agent-ink">
						<Icon name={RUN_KIND_ICON[r.kind]} size={15} />
					</span>
					<span className="flex min-w-0 flex-col">
						<span className="truncate font-display text-md">{RUN_META[r.kind].label}</span>
						<span className="max-w-[26ch] truncate text-xs text-ink-3">{r.agent}</span>
					</span>
				</span>
			),
		},
		{
			key: "trigger",
			header: "Trigger",
			render: (r) => (
				<Chip tone="neutral" size="sm" icon={r.trigger === "scheduled" ? "CalendarBlank" : "Hand"}>
					{r.trigger === "scheduled" ? "Scheduled" : "Manual"}
				</Chip>
			),
		},
		{ key: "model", header: "Model", render: (r) => <span className="whitespace-nowrap font-mono text-xs text-ink-3">{modelText(r)}</span> },
		{ key: "tokens", header: "Tokens", align: "end", render: (r) => <span className="text-xs text-ink-3">{tokenText(r)}</span> },
		{
			key: "cost",
			header: "Cost / est.",
			align: "end",
			render: (r) => (
				<span className="whitespace-nowrap text-xs">
					<span className={r.costUsd > r.estimateUsd * 1.1 ? "text-human-ink" : "text-ink"}>{fmtUsd(r.costUsd)}</span>
					<span className="text-ink-4"> / {fmtUsd(r.estimateUsd)}</span>
				</span>
			),
		},
		{ key: "status", header: "Status", render: (r) => <RunStatusChip status={r.status} /> },
		{ key: "duration", header: "Duration", align: "end", render: (r) => <span className="text-xs text-ink-3">{fmtDuration(r.durationSec)}</span> },
		{ key: "started", header: "Started", align: "end", render: (r) => <span className="whitespace-nowrap text-xs text-ink-3">{`${fmtDate(r.startedAt)} · ${fmtTime(r.startedAt)}`}</span> },
	];

	const empty = (
		<EmptyState icon="ClockCounterClockwise" title="No runs yet" body={nextScheduled ? `Scheduled runs start ${fmtDay(nextScheduled)} at ${fmtTime(nextScheduled)}.` : "Turn on a schedule or press Run now."} />
	);

	return (
		<Card as="section" aria-label="Run log" className="flex flex-col gap-3">
			<CardHeader icon="ClockCounterClockwise" title="Run log" meta={`${runs.length} runs · ${fmtUsd(spent)} logged`} href={sitePath(slug, "/settings?tab=audit")} />
			<p className="text-xs text-ink-3">Every agent execution with its inputs, outputs, model and token cost. Manual and scheduled runs behave the same.</p>
			<div className="max-md:hidden">
				<DataTable dense columns={columns} rows={rows} onRowClick={(r) => setOpenId(r.id)} caption="Run log" empty={empty} />
			</div>
			<div className="md:hidden">
				{rows.length === 0
					? empty
					: rows.map((r) => (
							<button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="press block w-full rounded-md text-start" aria-label={`${RUN_META[r.kind].label} · ${STATUS[r.status].label} · open details`}>
								<RunRow run={r} />
							</button>
						))}
			</div>
			<div className="flex items-center gap-2">
				<SourceNote icon="Receipt">Run table · per-client cost is reportable</SourceNote>
				{pages > 1 && <PaginationDots count={pages} index={p} onChange={setPage} className="ms-auto" />}
			</div>
			<RunSheet run={open} onClose={() => setOpenId(null)} />
		</Card>
	);
}

function RunSheet({ run, onClose }: { run: IRun | null; onClose: () => void }) {
	const { slug } = useSite();
	const { data, site } = useSiteCms();
	if (!run) return <Sheet open={false} onClose={onClose} title="Run">{null}</Sheet>;
	const post = run.postId ? data.posts.find((p) => p.id === run.postId) : undefined;
	const slot = run.slotId ? data.slots.find((s) => s.id === run.slotId) : undefined;
	const meta = RUN_META[run.kind];
	return (
		<Sheet
			open
			onClose={onClose}
			title={meta.label}
			footer={
				post ? (
					<Button variant="secondary" icon="ArrowUpRight" href={sitePath(slug, slot ? `/posts/${post.id}/assets?slot=${slot.id}` : `/posts/${post.id}`)}>
						{slot ? "Open slot" : "Open post"}
					</Button>
				) : undefined
			}
		>
			<div className="flex flex-col gap-5">
				<div className="flex flex-wrap items-center gap-2">
					<RunStatusChip status={run.status} />
					<Chip tone="neutral" size="sm" icon={run.trigger === "scheduled" ? "CalendarBlank" : "Hand"}>
						{run.trigger === "scheduled" ? "Scheduled" : "Manual"}
					</Chip>
					<AgentBadge label={run.agent} running={run.status === "running"} model={run.tier} />
				</div>
				{run.kind === "site-discovery" && (run.stage || run.pages) && (
					<Callout tone={run.status === "running" ? "agent" : "neutral"} icon="TreeStructure" title={run.status === "running" ? (STAGE_LABEL[run.stage ?? ""] ?? "Working") : "Site discovery"} action={<Button variant="secondary" size="sm" href={sitePath(slug, "/discovery")}>Open the report</Button>}>
						{run.pages ? `${run.pages.crawled} of ${run.pages.total} pages read${run.pages.skipped ? ` · ${run.pages.skipped} skipped` : ""}` : null}
					</Callout>
				)}
				{run.status === "failed" && (
					<Callout tone="block" title="Run failed">
						{run.output}
					</Callout>
				)}
				{run.status === "refused-over-cap" && (
					<Callout tone="block" title="Refused · over cap">
						{run.output} Nothing was billed.
					</Callout>
				)}
				<section className="flex flex-col gap-2.5">
					<h3 className="font-display text-md">Inputs</h3>
					<KeyValue
						rows={[
							{ k: "Site", v: `${site.name} · ${site.domain}` },
							{ k: "Job", v: `${meta.label} · ${meta.cadence}` },
							...(post ? [{ k: "Post", v: <Link href={sitePath(slug, `/posts/${post.id}`)} className="underline decoration-line-3 underline-offset-2 hover:text-ink-3">{post.title}</Link> }] : []),
							...(slot ? [{ k: "Image slot", v: `${slot.name} · ${slot.width} × ${slot.height}` }] : []),
							{ k: "Brand pack", v: `Voice + ${data.brandPack.styleKeywords.length} style keywords injected` },
							{ k: "Budget check", v: `${run.budget === "image" ? "Image" : "Text"} cap · est. ${fmtUsd(run.estimateUsd)} before start` },
						]}
					/>
				</section>
				<section className="flex flex-col gap-2.5">
					<h3 className="font-display text-md">Outputs</h3>
					<p className="rounded-lg bg-sunken px-3.5 py-3 text-sm leading-body text-ink-2">{run.output}</p>
					<span className="text-xs text-ink-3">Produces: {meta.produces}</span>
				</section>
				<section className="flex flex-col gap-2.5">
					<h3 className="font-display text-md">Model and cost</h3>
					<KeyValue
						rows={[
							{ k: "Model", v: <span className="font-mono text-xs">{modelText(run)}</span> },
							{ k: "Tokens", v: <span className="tabular">{tokenText(run) === "—" ? "— · image run, billed per candidate" : `${tokenText(run)} tokens`}</span> },
							{ k: "Cost", v: <span className="tabular">{`${fmtUsd(run.costUsd)} / est. ${fmtUsd(run.estimateUsd)}`}</span> },
							{ k: "Started", v: fmtDateTime(run.startedAt) },
							{ k: "Duration", v: run.status === "running" ? "Running" : fmtDuration(run.durationSec) },
						]}
					/>
				</section>
				<SourceNote icon="Receipt">Run table · id {run.id}</SourceNote>
			</div>
		</Sheet>
	);
}
