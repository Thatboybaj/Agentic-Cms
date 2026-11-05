"use client";

// S08 /assets — every image slot across posts, human-only work first (P1).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
	BudgetCard,
	Button,
	Card,
	Chip,
	EmptyState,
	LedgerItem,
	PageHeader,
	PROVIDER_LABEL,
	AgentBadge,
	RoleGate,
	Section,
	SegmentedControl,
	ShareBar,
	SlotRow,
	SourceNote,
	StateChip,
	DataGap,
} from "@/ds";
import { fmtDateTime, fmtUsd, isFilled } from "@/lib/logic";
import { useCms, useLedger, useSite } from "@/lib/store";
import type { IImageSlot, TProvider } from "@/lib/types";
import { slotStatusWord, UploadSheet } from "./parts";
import { sitePath } from "@/lib/routes";

type TView = "human" | "open" | "filled";

const MODEL_PROVIDER: [RegExp, TProvider][] = [
	[/higgsfield/, "higgsfield"],
	[/openai/, "openai"],
	[/flux|sdxl|open/, "open-source"],
];

export function AssetsQueue() {
	const { slug } = useSite();
	const router = useRouter();
	const { data, site, role, can } = useCms();
	const ledger = useLedger();
	const [view, setView] = useState<TView>("open");
	const [uploadId, setUploadId] = useState<string | null>(null);
	const postOf = (s: IImageSlot) => data.posts.find((p) => p.id === s.postId);

	const open = data.slots.filter((s) => !isFilled(s) && postOf(s));
	const human = open.filter((s) => s.status === "human-only").sort((a, b) => (ledger.find((l) => l.slotId === b.id)?.age ?? 0) - (ledger.find((l) => l.slotId === a.id)?.age ?? 0));
	const agent = open.filter((s) => s.status !== "human-only");
	const filled = data.slots
		.filter((s) => isFilled(s) && postOf(s))
		.sort((a, b) => (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""))
		.slice(0, 12);
	const postsOpen = new Set(open.map((s) => s.postId)).size;
	const byPost = useMemo(() => {
		const m = new Map<string, IImageSlot[]>();
		for (const s of agent) m.set(s.postId, [...(m.get(s.postId) ?? []), s]);
		return [...m.entries()];
	}, [agent]);

	const spend = useMemo(() => {
		const runs = data.runs.filter((r) => r.kind === "image-generation" && r.costUsd > 0);
		const sums = new Map<TProvider, number>();
		for (const r of runs) {
			const p = MODEL_PROVIDER.find(([re]) => re.test(r.model))?.[1];
			if (p) sums.set(p, (sums.get(p) ?? 0) + r.costUsd);
		}
		const total = runs.reduce((a, r) => a + r.costUsd, 0);
		return { runs: runs.length, total, rows: [...sums.entries()].map(([p, v]) => ({ id: p, label: PROVIDER_LABEL[p], value: total ? Math.round((v / total) * 1000) / 10 : 0, note: fmtUsd(v) })) };
	}, [data.runs]);

	const canUpload = can("asset.manage");
	const showHuman = view !== "filled" && human.length > 0;
	const showAgent = view === "open" && agent.length > 0;

	return (
		<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			<PageHeader
				title="Image pipeline"
				subtitle={open.length ? `${open.length} slot${open.length > 1 ? "s" : ""} open across ${postsOpen} post${postsOpen > 1 ? "s" : ""} · ${human.length} human-only` : "Every slot is filled"}
				actions={
					<SegmentedControl<TView>
						label="Slot filter"
						value={view}
						onChange={setView}
						options={[
							{ value: "human", label: `Human-only${human.length ? ` · ${human.length}` : ""}` },
							{ value: "open", label: "All open" },
							{ value: "filled", label: "Recently filled" },
						]}
					/>
				}
			/>
			<div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
				<div className="thin-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-6 lg:overflow-y-auto">
					{view !== "filled" && open.length === 0 && (
						<Card variant="solid" padding="lg">
							<EmptyState icon="CheckCircle" title="Every slot is filled" body="New slots arrive with each draft's image sheet." />
						</Card>
					)}
					{view === "human" && human.length === 0 && open.length > 0 && (
						<Card variant="solid" padding="lg">
							<EmptyState icon="Hand" title="Nothing waiting on you" body={`${agent.length} slot${agent.length === 1 ? " is" : "s are"} with the agents.`} />
						</Card>
					)}

					{showHuman && (
						<Section title="Waiting on you" count={human.length} meta="real photos · never generated">
							<div className="grid gap-3 xl:grid-cols-2">
								{human.map((s, i) => {
									const post = postOf(s)!;
									const item = ledger.find((l) => l.slotId === s.id);
									return (
										<Card key={s.id} variant="solid" padding="md" className="flex flex-col gap-3">
											<SlotRow slot={s} onSelect={() => router.push(sitePath(slug, `/posts/${s.postId}/assets?slot=${s.id}`))} />
											<Link href={sitePath(slug, `/posts/${post.id}/assets?slot=${s.id}`)} className="-mt-1 flex items-center gap-2 px-2.5 text-sm text-ink-3 hover:text-ink">
												<span className="truncate">{post.title}</span>
												<StateChip state={post.state} className="shrink-0" />
											</Link>
											{item ? <LedgerItem item={item} /> : <SourceNote icon="Hand">Not in the ledger yet · marked human-only by the brief</SourceNote>}
											<div className="flex flex-wrap gap-2">
												<RoleGate role={role} allow={["specialist", "admin"]} action="upload images">
													<Button variant={i === 0 ? "primary" : "secondary"} icon="UploadSimple" onClick={() => setUploadId(s.id)} disabled={!canUpload}>
														Upload
													</Button>
												</RoleGate>
												<Button variant="ghost" href={sitePath(slug, `/posts/${s.postId}/assets?slot=${s.id}`)}>
													Open slot
												</Button>
											</div>
										</Card>
									);
								})}
							</div>
						</Section>
					)}

					{showAgent && (
						<Section title="Agents working" count={agent.length} meta="routed by slot type">
							<div className="flex flex-col gap-3">
								{byPost.map(([postId, slots]) => {
									const post = data.posts.find((p) => p.id === postId)!;
									return (
										<Card key={postId} variant="solid" padding="md" className="flex flex-col gap-2">
											<div className="flex items-center gap-2 px-1">
												<Link href={sitePath(slug, `/posts/${postId}/assets`)} className="min-w-0 truncate font-display text-base hover:underline">
													{post.title}
												</Link>
												<StateChip state={post.state} humanOnly={data.slots.some((x) => x.postId === postId && x.status === "human-only")} className="shrink-0" />
											</div>
											{slots.map((s) => (
												<div key={s.id} className="flex flex-col gap-1.5">
													<SlotRow slot={s} onSelect={() => router.push(sitePath(slug, `/posts/${s.postId}/assets?slot=${s.id}`))} />
													{(s.status === "generating" || s.status === "queued") && (
														<span role="status" className="px-2.5">
															<AgentBadge running={s.status === "generating"} label={`${PROVIDER_LABEL[s.provider]} ${s.status === "queued" ? "queued" : "returning 4 candidates · usually under a minute"}`} />
														</span>
													)}
													{s.status === "candidates" && <span className="px-2.5 text-xs text-ink-3">{slotStatusWord(s)} · a person picks</span>}
													{s.status === "failed" && (
														<Chip tone="block" size="sm" className="ms-2.5 self-start">
															Provider failed · try again or upload
														</Chip>
													)}
												</div>
											))}
										</Card>
									);
								})}
							</div>
						</Section>
					)}

					{view === "filled" && (
						<Section title="Recently filled" count={filled.length}>
							{filled.length ? (
								<Card variant="solid" padding="md" className="flex flex-col gap-1">
									{filled.map((s) => (
										<div key={s.id} className="flex items-center gap-2">
											<SlotRow slot={s} onSelect={() => router.push(sitePath(slug, `/posts/${s.postId}/assets?slot=${s.id}`))} className="min-w-0 flex-1" />
											<span className="hidden shrink-0 flex-col items-end text-xs text-ink-3 sm:flex">
												<span className="max-w-56 truncate">{postOf(s)?.title}</span>
												<span>{s.generatedAt ? fmtDateTime(s.generatedAt) : "—"}</span>
											</span>
										</div>
									))}
								</Card>
							) : (
								<Card variant="solid" padding="lg">
									<EmptyState icon="Images" title="Nothing filled yet" body="Slots appear here once a candidate or upload is committed with the post." />
								</Card>
							)}
						</Section>
					)}
				</div>

				<aside aria-label="Image budget" className="thin-scrollbar flex min-h-0 w-full shrink-0 flex-col gap-3 lg:w-[320px] lg:overflow-y-auto">
					<BudgetCard label="Image budget" spent={site.budgets.imageUsd} cap={site.budgets.imageCapUsd} onEdit={can("budget.set") ? () => router.push(sitePath(slug, "/settings?tab=providers")) : undefined} />
					<Card variant="solid" padding="md" className="flex flex-col gap-3">
						<h3 className="font-display text-lg">Spend by provider</h3>
						{spend.rows.length ? (
							<>
								<ShareBar rows={spend.rows} />
								<SourceNote>
									Run log · {spend.runs} image run{spend.runs === 1 ? "" : "s"} · {fmtUsd(spend.total)} of {fmtUsd(site.budgets.imageUsd)} this month
								</SourceNote>
							</>
						) : (
							<DataGap label="No priced image runs yet" reason="Spend by provider appears once an image run completes." />
						)}
						<SourceNote icon="CalendarBlank">This month · resets 1 Oct</SourceNote>
					</Card>
				</aside>
			</div>

			<UploadSheet slot={data.slots.find((s) => s.id === uploadId)} open={!!uploadId} onClose={() => setUploadId(null)} />
		</div>
	);
}
