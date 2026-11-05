"use client";
// Settings · Publishing (founder direction C10/C11). Self-contained panel: autopost per site, auto-merge on green CI,
// and what happens to a new idea in the current mode. Toggles save immediately (audited, undoable); gated controls
// stay visible with the reason.
import { clsx } from "clsx";
import { Callout, Card, CardHeader, Chip, Icon, SourceNote, Toggle, type TIconName } from "@/ds";
import { publishingSteps } from "@/lib/logic";
import { useCms } from "@/lib/store";
import { LockLine } from "./shared";

const OWNER_META: Record<"human" | "agent" | "developer", { icon: TIconName; label: string; tone: "human" | "agent" | "neutral" }> = {
	human: { icon: "User", label: "You", tone: "human" },
	agent: { icon: "Robot", label: "Agent", tone: "agent" },
	developer: { icon: "Code", label: "Developer", tone: "neutral" },
};

const GUARDRAILS: { icon: TIconName; text: string }[] = [
	{ icon: "SealCheck", text: "No fabricated stats: an open fact marker is never shipped. The agent rewrites the post without the claim, logged as an agent edit." },
	{ icon: "WarningDiamond", text: "Hard blocks hold the post: a template that can't render it, a budget cap or a provider failure sends it to Approvals with a ledger item." },
	{ icon: "WarningCircle", text: "Soft blocks are accepted with a logged reason, listed in the merge request." },
	{ icon: "GitPullRequest", text: "Repo scope and CI still apply: writes only to the content and asset folders, never to the base branch." },
];

export function PublishingSettings() {
	const { site, actions, can } = useCms();
	const p = site.publishing ?? { autopost: false, autoMergeOnGreenCi: false };
	const canAutopost = can("publishing.set");
	const canMerge = can("publishing.autoMerge");
	const steps = publishingSteps(p);

	return (
		<div className="flex flex-col gap-4">
			<Card className="flex flex-col gap-4">
				<CardHeader icon="Lightning" title="Publishing" meta={`${site.name} · ${p.autopost ? "autopost on" : "human review"}`} />

				<div className="flex flex-col gap-2">
					<Toggle
						checked={p.autopost}
						onChange={(on) => actions.setAutopost(site.id, on)}
						disabled={!canAutopost}
						label="Autopost"
						caption={
							p.autopost
								? "On: once you approve an idea, the agents draft it, fill its images, run the gate and open the merge request. Content ships without review."
								: "Off: every post stops In review and a person approves it before a merge request opens."
						}
					/>
					<LockLine perm="publishing.set" />
				</div>

				<ul className="flex flex-col gap-2 rounded-lg bg-sunken px-4 py-3">
					<li className="font-display text-sm">{p.autopost ? "Guardrails that still hold under autopost" : "Guardrails (autopost keeps all of these)"}</li>
					{GUARDRAILS.map((g) => (
						<li key={g.text} className="flex items-start gap-2 text-sm text-ink-2">
							<Icon name={g.icon} size={15} className="mt-0.5 shrink-0 text-ink-3" />
							{g.text}
						</li>
					))}
				</ul>

				<div className="flex flex-col gap-2">
					<Toggle
						checked={p.autoMergeOnGreenCi}
						onChange={(on) => actions.setAutoMerge(site.id, on)}
						disabled={!canMerge || !p.autopost}
						label="Auto-merge on green CI"
						caption={
							!p.autopost
								? "Applies only to posts the agent ships. Turn autopost on first; with it off, a developer merges every merge request."
								: p.autoMergeOnGreenCi
									? "On: merge requests the agent opened merge themselves when the repo's CI passes. A red build stays open for a developer."
									: "Off: a developer merges every merge request, including ones the agent opened."
						}
					/>
					<LockLine perm="publishing.autoMerge" />
				</div>

				{!site.repo && (
					<Callout tone="human" icon="Plugs" title="No repo connected">
						Autopost holds every post until a developer connects the repo. The merge request needs somewhere to open.
					</Callout>
				)}
			</Card>

			<Card className="flex flex-col gap-3">
				<CardHeader icon="ListChecks" title="What happens to a new idea" meta={p.autopost ? "Autopost" : "Human review"} />
				<ol className="flex flex-col">
					{steps.map((s, i) => {
						const o = OWNER_META[s.owner];
						return (
							<li key={s.id} className={clsx("flex items-center gap-3 border-line py-2.5", i < steps.length - 1 && "border-b")}>
								<span className="tabular grid size-6 shrink-0 place-items-center rounded-full bg-sunken font-display text-xs">{i + 1}</span>
								<span className="min-w-0 flex-1 text-sm text-ink-2">{s.label}</span>
								<Chip size="sm" tone={o.tone} icon={o.icon}>
									{o.label}
								</Chip>
							</li>
						);
					})}
				</ol>
				<SourceNote icon="Info">Every step is written to the audit log with the agent or person who did it</SourceNote>
			</Card>
		</div>
	);
}
