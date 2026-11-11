"use client";
// S15 /runs — Schedules, budgets, run log, human ledger, notifications (F9, F11). Spec: docs/uxer/04-screen-specs.md.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BudgetCard, Button, Callout, Card, CardHeader, Icon, Menu, Meter, PageHeader, RoleGate, ScheduleRow, SourceNote, Tabs } from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { fmtUsd, fmtUsdWhole, PERMISSIONS } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteStats } from "@/features/shared/site-source";
import { PageLoading } from "@/features/shared/page-loading";
import { LedgerCard } from "./ledger";
import { NotificationsCard } from "./notifications";
import { useRunLauncher } from "./run-dialog";
import { RunLog } from "./run-log";
import { planRun, resetDay } from "./run-plan";
import { sitePath } from "@/lib/routes";

type TTab = "schedules" | "log" | "ledger";

export function RunsScreen() {
	const { slug } = useSite();
	const { site, data, role, actions, can, why, loading } = useSiteCms();
	const stats = useSiteStats();
	const router = useRouter();
	const { request, dialog } = useRunLauncher();
	const [tab, setTab] = useState<TTab>("schedules");
	const { text, image } = stats.budgets;
	const reset = resetDay();
	const canRun = can("run.trigger");
	// Bell → /runs#notifications (and #ledger): the store hydrates client-side, so scroll once the section exists.
	useEffect(() => {
		const go = () => {
			const id = window.location.hash.slice(1);
			if (id === "ledger") setTab("ledger");
			if (id === "notifications" || id === "ledger") window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: "start" }), 50);
		};
		go();
		window.addEventListener("hashchange", go);
		return () => window.removeEventListener("hashchange", go);
	}, []);
	const nextScheduled = data.schedules.filter((s) => s.enabled).map((s) => s.nextAt).sort()[0] ?? null;

	const cta = canRun ? (
		<Menu
			align="end"
			label="Run now"
			trigger={
				<Button variant="primary" icon="Play" trailing={<Icon name="CaretDown" size={14} />}>
					Run now
				</Button>
			}
			items={data.schedules.map((s) => ({
				id: s.kind,
				label: `${s.label} · est. ${fmtUsd(planRun(s.kind, site, data).estimate.usd)}`,
				icon: "Play" as const,
				onSelect: () => request(s.kind),
			}))}
		/>
	) : (
		<RoleGate role={role} allow={PERMISSIONS["run.trigger"]} action="trigger runs">
			<Button variant="primary" icon="Play" disabled>
				Run now
			</Button>
		</RoleGate>
	);

	const schedules = (
		<Card as="section" aria-label="Schedules" className="flex flex-col gap-1">
			<CardHeader icon="CalendarDots" title="Schedules" meta={`${data.schedules.filter((s) => s.enabled).length} of ${data.schedules.length} on · per site`} />
			<p className="pb-1 text-xs text-ink-3">Every scheduled run also has a Run now. Manual and scheduled runs behave the same, so a missed week can be caught up.</p>
			{!canRun && (
				<Callout tone="neutral" icon="LockSimple" title="Your role can't trigger runs.">
					{why("run.trigger")}. Schedules keep running on their own; the log and ledger stay visible.
				</Callout>
			)}
			<div>
				{data.schedules.map((s) => (
					<ScheduleRow
						key={s.kind}
						schedule={s}
						estimateUsd={planRun(s.kind, site, data).estimate.usd}
						onRunNow={request}
						onToggle={(k) => actions.toggleSchedule(k)}
						locked={canRun ? undefined : "Your role can't trigger runs"}
					/>
				))}
			</div>
		</Card>
	);

	const budgets = (
		<div className="flex flex-col gap-3">
			<div className="grid gap-3 max-lg:hidden">
				<BudgetCard label="Text generation" spent={text.spent} cap={text.cap} onEdit={can("budget.set") ? () => router.push(sitePath(slug, "/settings?tab=providers")) : undefined} />
				<BudgetCard label="Image generation" spent={image.spent} cap={image.cap} onEdit={can("budget.set") ? () => router.push(sitePath(slug, "/settings?tab=providers")) : undefined} />
			</div>
			<Card className="flex flex-col gap-3 lg:hidden" aria-label="Budgets">
				<CardHeader icon="Wallet" title="Budgets" meta={`resets ${reset}`} href={sitePath(slug, "/settings?tab=providers")} />
				<Meter value={text.spent} max={text.cap} label="Text generation" format={fmtUsd} />
				<Meter value={image.spent} max={image.cap} label="Image generation" format={fmtUsd} />
			</Card>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
				<SourceNote icon="Receipt">Run table · this month · resets {reset}</SourceNote>
				<span className="text-xs text-ink-3">Refuses above cap · admins alerted at 80%</span>
				{!can("budget.set") && (
					<span className="flex items-center gap-1 text-xs text-ink-3">
						<Icon name="LockSimple" size={12} />
						{why("budget.set")}
					</span>
				)}
			</div>
		</div>
	);

	if (loading) return <PageLoading rows={6} />;
	return (
		<>
			<TopBarCta>{cta}</TopBarCta>
			<PageHeader title="Runs & ledger" subtitle={`Text ${fmtUsd(text.spent)} of ${fmtUsdWhole(text.cap)} · Image ${fmtUsd(image.spent)} of ${fmtUsdWhole(image.cap)} · resets ${reset}`} />
			<div className="lg:hidden">{budgets}</div>
			<Tabs
				className="lg:hidden"
				label="Runs sections"
				value={tab}
				onChange={(v) => setTab(v as TTab)}
				tabs={[
					{ id: "schedules", label: "Schedules", count: data.schedules.length },
					{ id: "log", label: "Run log", count: data.runs.length },
					{ id: "ledger", label: "Ledger", count: stats.needsHuman },
				]}
			/>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
				<div className="thin-scrollbar flex min-w-0 flex-col gap-4 max-lg:contents lg:min-h-0 lg:overflow-y-auto">
					<div className={tab === "schedules" ? "" : "max-lg:hidden"}>{schedules}</div>
					<div className={tab === "log" ? "" : "max-lg:hidden"}>
						<RunLog nextScheduled={nextScheduled} />
					</div>
					<div className="max-lg:order-3">
						<NotificationsCard />
					</div>
				</div>
				<aside aria-label="Budgets and human ledger" className="thin-scrollbar flex min-w-0 flex-col gap-4 max-lg:order-2 lg:min-h-0 lg:overflow-y-auto">
					<div className="max-lg:hidden">{budgets}</div>
					<div className={tab === "ledger" ? "" : "max-lg:hidden"}>
						<LedgerCard />
					</div>
				</aside>
			</div>
			{dialog}
		</>
	);
}
