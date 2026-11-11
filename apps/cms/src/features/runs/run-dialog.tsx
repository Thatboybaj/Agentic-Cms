"use client";
// O4 — Run estimate dialog. The estimate is always shown before a run starts (spend guardrail).
// Over cap: the attempt is refused by the store (logged + audited) and the dialog explains why and how to clear it.
import { useCallback, useMemo, useState } from "react";
import { Button, Callout, Dialog, KeyValue, LockedAction, Meter } from "@/ds";
import { fmtUsd, fmtUsdWhole, RUN_META } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms } from "@/features/shared/site-source";
import type { TRunKind } from "@/lib/types";
import { planRun, refusalCopy, runningCopy } from "./run-plan";
import { sitePath } from "@/lib/routes";

export function roleRunReason(why: string | null): string {
	return `Your role can't trigger runs · ${why ?? "Content specialists and agency admins can"}.`;
}

export function useRunLauncher() {
	const { site, data, actions, can, why } = useSiteCms();
	const [kind, setKind] = useState<TRunKind | null>(null);

	const request = useCallback(
		(k: TRunKind) => {
			const p = planRun(k, site, data);
			// F9b: pressing Run now on an over-cap run is refused by the store (run log + audit), then explained here.
			if (can("run.trigger") && !p.running && !p.blocked && p.check.status === "refused") actions.runNow(k);
			setKind(k);
		},
		[site, data, can, actions],
	);

	const close = useCallback(() => setKind(null), []);
	const plan = useMemo(() => (kind ? planRun(kind, site, data) : null), [kind, site, data]);

	const dialog = plan ? (
		<RunDialog
			plan={plan}
			siteName={site.name}
			refusal={refusalCopy(plan, site)}
			canRun={can("run.trigger")}
			roleReason={roleRunReason(why("run.trigger"))}
			isAdmin={can("budget.set")}
			onRun={async () => {
				const r = await actions.runNow(plan.kind);
				if (r.ok) close();
			}}
			onClose={close}
		/>
	) : null;

	return { request, dialog };
}

interface IRunDialogProps {
	plan: ReturnType<typeof planRun>;
	siteName: string;
	refusal: string;
	canRun: boolean;
	roleReason: string;
	isAdmin: boolean;
	onRun: () => void;
	onClose: () => void;
}

function RunDialog({ plan, siteName, refusal, canRun, roleReason, isAdmin, onRun, onClose }: IRunDialogProps) {
	const { slug } = useSite();
	const meta = RUN_META[plan.kind];
	const refused = plan.check.status === "refused";
	const running = runningCopy(plan);
	const budgetName = plan.estimate.budget === "text" ? "Text" : "Image";

	const lock = !canRun ? { label: "Run now", reasons: [roleReason] } : running ? { label: "Run now", reasons: [running] } : plan.blocked ? { label: "Run now", reasons: [plan.blocked] } : refused ? { label: "Run now · over cap", reasons: [`Est. ${fmtUsd(plan.estimate.usd)} > ${fmtUsd(plan.left)} left`] } : null;

	return (
		<Dialog
			open
			onClose={onClose}
			title={`Run ${/^[A-Z][a-z]/.test(plan.label) ? plan.label.charAt(0).toLowerCase() + plan.label.slice(1) : plan.label} now?`}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						{lock ? "Close" : "Cancel"}
					</Button>
					{lock ? <LockedAction label={lock.label} icon="Play" reasons={lock.reasons} /> : <Button variant="primary" icon="Play" onClick={onRun}>Run now</Button>}
				</>
			}
		>
			<div className="flex flex-col gap-4">
				<p className="text-sm text-ink-3">
					{meta.produces} · same output as the scheduled run for {siteName}.
				</p>
				<KeyValue
					rows={[
						{ k: "Estimate", v: <span className="tabular font-display text-md">Est. {fmtUsd(plan.estimate.usd)}</span> },
						{ k: "Model tier", v: `${plan.estimate.tier} · ${meta.agent}` },
						...(plan.post ? [{ k: "Post", v: plan.post.title }] : []),
						{ k: `${budgetName} cap`, v: <span className="tabular">{`${fmtUsd(plan.spent)} of ${fmtUsdWhole(plan.cap)} used · ${fmtUsd(plan.left)} left`}</span> },
					]}
				/>
				<Meter value={plan.check.afterUsd} max={plan.cap} label="After this run" format={fmtUsd} />
				{!canRun && (
					<Callout tone="neutral" icon="LockSimple" title="Your role can't trigger runs.">
						{roleReason} Scheduled runs keep going on their own.
					</Callout>
				)}
				{canRun && running && (
					<Callout tone="agent" icon="Robot" title={running}>
						Wait for it to finish; the log updates on its own.
					</Callout>
				)}
				{canRun && !running && plan.blocked && <Callout tone="neutral" title={plan.blocked} />}
				{canRun && !running && !plan.blocked && refused && (
					<Callout
						tone="block"
						title="Refused · over cap"
						action={
							isAdmin ? (
								<Button variant="secondary" size="sm" href={sitePath(slug, "/settings?tab=providers")}>
									Raise cap
								</Button>
							) : undefined
						}
					>
						{refusal} Nothing was billed; the attempt is in the run log.
					</Callout>
				)}
				{canRun && !running && !plan.blocked && plan.check.status === "warn" && (
					<Callout tone="human" icon="Warning" title={`This run takes you past 80% of the ${plan.estimate.budget} cap.`}>
						Admins get an alert. Runs above the cap are refused, not billed.
					</Callout>
				)}
			</div>
		</Dialog>
	);
}
