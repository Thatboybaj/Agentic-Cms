"use client";
// Settings · Model routing — per-task tier (fast / workhorse / strongest). Model ids come from the harness config,
// verified against current provider docs, never hardcoded here.
import { useState } from "react";
import { Card, CardHeader, Chip, DataTable, Select, SourceNote, type IDataTableColumn, type ISelectOption } from "@/ds";
import { TIER_LABEL } from "@/lib/logic";
import { useCms } from "@/lib/store";
import type { ISiteData, TModelTier } from "@/lib/types";
import { LockLine, LockNote, SaveBar, sameRecord } from "./shared";

type TTask = keyof ISiteData["modelRouting"];
type TRow = { id: TTask; label: string; detail: string; def: TModelTier };

const TASKS: TRow[] = [
	{ id: "mechanical", label: "Crawling and diffing", detail: "Technical monitor, KAS recalculation, keyword swarm", def: "fast" },
	{ id: "writing", label: "Writing and judgment", detail: "Drafts, edits, QA sweep, refresh", def: "workhorse" },
	{ id: "pillar-pages", label: "Pillar pages", detail: "Pillar and money pages", def: "strongest" },
	{ id: "strategy", label: "Strategy and pivot analysis", detail: "Bi-weekly report, pivot triggers", def: "strongest" },
];

const TIERS: ISelectOption<TModelTier>[] = (["fast", "workhorse", "strongest"] as TModelTier[]).map((t) => ({ value: t, label: TIER_LABEL[t] }));

export function ModelRoutingTab() {
	const { data, actions, can } = useCms();
	const admin = can("routing.set");
	const [draft, setDraft] = useState(data.modelRouting);
	const dirty = !sameRecord(draft, data.modelRouting);

	const tierCell = (r: TRow) =>
		admin ? (
			<Select<TModelTier> value={draft[r.id]} options={TIERS} onChange={(t) => setDraft((d) => ({ ...d, [r.id]: t }))} />
		) : (
			<Chip tone="neutral" size="sm">
				{TIER_LABEL[draft[r.id]]}
			</Chip>
		);

	const columns: IDataTableColumn<TRow>[] = [
		{
			key: "task",
			header: "Task",
			render: (r) => (
				<span className="flex flex-col py-2">
					<span className="font-display text-md">{r.label}</span>
					<span className="text-xs text-ink-3">{r.detail}</span>
				</span>
			),
		},
		{ key: "tier", header: "Tier", width: 200, render: tierCell },
		{ key: "default", header: "Default", width: 110, render: (r) => <span className="text-xs text-ink-3">{draft[r.id] === r.def ? "Default" : `Default ${TIER_LABEL[r.def].toLowerCase()}`}</span> },
		{ key: "model", header: "Model id", width: 190, render: () => <span className="font-mono text-xs text-ink-4">from harness config</span> },
	];

	return (
		<div className="flex flex-col gap-4">
			<SaveBar perm="routing.set" dirty={dirty} onSave={() => (Object.keys(draft) as TTask[]).forEach((t) => draft[t] !== data.modelRouting[t] && actions.setModelRouting(t, draft[t]))} onDiscard={() => setDraft(data.modelRouting)}>
				Per task, per client. Pillar and money pages default to the strongest tier.
			</SaveBar>
			<LockNote perm="routing.set" title="Only an agency admin can change budgets and routing." />
			<Card className="flex flex-col gap-3">
				<CardHeader icon="Robot" title="Model routing" meta="Inherited from the harness config" />
				<div className="max-md:hidden">
					<DataTable columns={columns} rows={TASKS} caption="Model routing per task" />
				</div>
				<ul className="flex flex-col md:hidden">
					{TASKS.map((r) => (
						<li key={r.id} className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
							<span className="flex flex-col">
								<span className="font-display text-md">{r.label}</span>
								<span className="text-xs text-ink-3">{r.detail}</span>
							</span>
							{tierCell(r)}
						</li>
					))}
				</ul>
				<LockLine perm="routing.set" />
				<div className="flex flex-wrap items-center gap-2">
					<SourceNote icon="ShieldCheck">Model ids are verified against current provider docs, not hardcoded</SourceNote>
					<span className="text-xs text-ink-3">Fast for mechanical work · workhorse for writing · strongest for strategy and pillar pages.</span>
				</div>
			</Card>
		</div>
	);
}
