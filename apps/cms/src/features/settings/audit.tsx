"use client";
// Settings · Audit log — every run, edit, approval, override and merge with actor, time and target.
// "Who approved a claim" is one query: filter the action to "approved" and search the post.
import { useMemo, useState } from "react";
import { AgentBadge, Button, Card, CardHeader, DataTable, EmptyState, PaginationDots, Select, SourceNote, TextField, Timeline, type IDataTableColumn, type TIconName } from "@/ds";
import { fmtDateTime } from "@/lib/logic";
import { useCms } from "@/lib/store";
import type { IAuditEvent, TTone } from "@/lib/types";

const PAGE = 10;
const ALL = "__all";

const isMachine = (actor: string) => /agent$|^system$/i.test(actor.trim());

function iconFor(action: string): { icon: TIconName; tone: TTone } {
	const a = action.toLowerCase();
	if (a.includes("refused") || a.includes("disconnected")) return { icon: "XCircle", tone: "block" };
	if (a.includes("override") || a.includes("overrode")) return { icon: "WarningCircle", tone: "neutral" };
	if (a.startsWith("approved")) return { icon: "SealCheck", tone: "pass" };
	if (a.includes("merge")) return { icon: "GitMerge", tone: "neutral" };
	if (a.includes("run") || a.includes("recalculated") || a.includes("generated")) return { icon: "Play", tone: "agent" };
	return { icon: "PencilSimple", tone: "neutral" };
}

export function AuditTab() {
	const { data } = useCms();
	const [actor, setActor] = useState<string>(ALL);
	const [action, setAction] = useState<string>(ALL);
	const [q, setQ] = useState("");
	const [page, setPage] = useState(0);

	const events = useMemo(() => [...data.audit].sort((a, b) => b.at.localeCompare(a.at)), [data.audit]);
	const actors = useMemo(() => [...new Set(events.map((e) => e.actor))].sort(), [events]);
	const actions = useMemo(() => [...new Set(events.map((e) => e.action))].sort(), [events]);
	const needle = q.trim().toLowerCase();
	const rows = events.filter((e) => (actor === ALL || e.actor === actor) && (action === ALL || e.action === action) && (!needle || `${e.target} ${e.detail ?? ""} ${e.actor}`.toLowerCase().includes(needle)));
	const pages = Math.max(1, Math.ceil(rows.length / PAGE));
	const p = Math.min(page, pages - 1);
	const shown = rows.slice(p * PAGE, p * PAGE + PAGE);
	const filtered = actor !== ALL || action !== ALL || !!needle;

	const who = (e: IAuditEvent) => (isMachine(e.actor) ? <AgentBadge label={e.actor} /> : <span className="font-display text-md">{e.actor}</span>);

	const columns: IDataTableColumn<IAuditEvent>[] = [
		{ key: "at", header: "When", width: 170, render: (e) => <span className="whitespace-nowrap text-xs text-ink-3">{fmtDateTime(e.at)}</span> },
		{ key: "actor", header: "Actor", width: 200, render: who },
		{ key: "action", header: "Action", width: 180, render: (e) => <span className="text-sm">{e.action}</span> },
		{
			key: "target",
			header: "Target",
			render: (e) => (
				<span className="flex min-w-0 flex-col py-2">
					<span className="text-sm">{e.target}</span>
					{e.detail && <span className="text-xs text-ink-3">{e.detail}</span>}
				</span>
			),
		},
	];

	const empty = filtered ? (
		<EmptyState icon="MagnifyingGlass" title="No matching events" body="Try another actor or action, or clear the search." action={<Button variant="secondary" size="sm" onClick={() => (setActor(ALL), setAction(ALL), setQ(""))}>Clear filters</Button>} />
	) : (
		<EmptyState icon="Receipt" title="No activity yet" body="Runs, edits, approvals, overrides and merges appear here with who and when." />
	);

	const reset = () => setPage(0);

	return (
		<div className="flex flex-col gap-4">
			<p className="px-1 text-sm text-ink-3">Every run, edit, approval, override and merge — with who and when. When a client asks who approved a claim, the answer is one query.</p>
			<Card className="flex flex-col gap-3">
				<CardHeader
					icon="Receipt"
					title="Audit log"
					meta={`${rows.length} of ${events.length} events`}
					action={
						<Button variant="secondary" size="sm" icon="SealCheck" onClick={() => (setAction(events.some((e) => e.action === "approved") ? "approved" : ALL), setActor(ALL), reset())}>
							Who approved what
						</Button>
					}
				/>
				<div className="grid gap-3 sm:grid-cols-3">
					<Select<string> label="Actor" value={actor} options={[{ value: ALL, label: "Everyone" }, ...actors.map((a) => ({ value: a, label: a }))]} onChange={(v) => (setActor(v), reset())} icon="User" />
					<Select<string> label="Action" value={action} options={[{ value: ALL, label: "All actions" }, ...actions.map((a) => ({ value: a, label: a }))]} onChange={(v) => (setAction(v), reset())} icon="Funnel" />
					<TextField label="Search" value={q} onChange={(v) => (setQ(v), reset())} placeholder="Post, keyword, MR…" icon="MagnifyingGlass" />
				</div>
				<div className="max-md:hidden">
					<DataTable columns={columns} rows={shown} caption="Audit log" empty={empty} />
				</div>
				<div className="md:hidden">
					{shown.length === 0 ? (
						empty
					) : (
						<Timeline
							items={shown.map((e) => ({
								id: e.id,
								...iconFor(e.action),
								title: `${e.actor} · ${e.action}`,
								meta: fmtDateTime(e.at),
								body: (
									<span className="flex flex-col">
										<span>{e.target}</span>
										{e.detail && <span className="text-xs text-ink-3">{e.detail}</span>}
									</span>
								),
							}))}
						/>
					)}
				</div>
				<div className="flex items-center gap-2">
					<SourceNote icon="Receipt">Audit trail · actor, timestamp and inputs</SourceNote>
					{pages > 1 && <PaginationDots count={pages} index={p} onChange={setPage} className="ms-auto" />}
				</div>
			</Card>
		</div>
	);
}
