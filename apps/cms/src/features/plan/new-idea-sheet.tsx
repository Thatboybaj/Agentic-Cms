"use client";
// S03 New idea — Sheet over /plan (end 480, bottom on mobile). Topic or keyword → agent enrichment preview → addIdea.
// The store decides the final intent/type; this preview mirrors its rules and never invents difficulty or impressions.

import { useEffect, useId, useMemo, useState } from "react";
import { AgentBadge, Button, Callout, Chip, DataGap, KeyValue, LockedAction, Select, Sheet, Skeleton, STATE_LABEL, TextField } from "@/ds";
import { INTENT_LABEL } from "@/lib/logic";
import { useCms, useSite } from "@/lib/store";
import type { IPost, TIntent } from "@/lib/types";
import { isoWeek } from "@/lib/clock";
import { sitePath } from "@/lib/routes";

const TYPE_LABEL: Record<IPost["contentType"], string> = { guide: "Guide", comparison: "Comparison", listicle: "Listicle", "how-to": "How-to", faq: "FAQ", pillar: "Pillar", "money-page": "Money page" };

/** Same heuristics addIdea applies, so the preview matches what lands on the board. */
function preview(lower: string): { intent: TIntent; type: IPost["contentType"] } {
	const type: IPost["contentType"] = / vs\.? /.test(lower) ? "comparison" : /^how to /.test(lower) ? "how-to" : /\b(cost|price|prices)\b/.test(lower) ? "money-page" : /\?$/.test(lower) ? "faq" : "guide";
	const intent: TIntent = /\b(cost|price|vs|best)\b/.test(lower) ? "commercial" : /\b(near me|book|emergency)\b/.test(lower) ? "transactional" : "informational";
	return { intent, type };
}

function useIsMobile() {
	const [m, setM] = useState(false);
	useEffect(() => {
		const mq = window.matchMedia("(max-width: 767px)");
		const on = () => setM(mq.matches);
		on();
		mq.addEventListener("change", on);
		return () => mq.removeEventListener("change", on);
	}, []);
	return m;
}

export function NewIdeaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { slug } = useSite();
	const { data, site, state, can, why, actions } = useCms();
	const mobile = useIsMobile();
	const [text, setText] = useState("");
	const [pillarId, setPillarId] = useState<string | null>(null);
	const [week, setWeek] = useState<number | null>(null);
	const [enriching, setEnriching] = useState(false);

	const title = text.trim().replace(/\s+/g, " ");
	const lower = title.toLowerCase();
	const ready = title.length >= 3;

	// Simulated keyword-agent lookup: ~0.7 s after typing stops.
	useEffect(() => {
		if (!ready) return setEnriching(false);
		setEnriching(true);
		const t = window.setTimeout(() => setEnriching(false), 700);
		return () => window.clearTimeout(t);
	}, [lower, ready]);

	// Focus lands in the field (the Sheet focuses its close button first).
	const fieldId = useId();
	useEffect(() => {
		if (!open) return;
		const t = window.setTimeout(() => document.getElementById(fieldId)?.focus(), 60);
		return () => window.clearTimeout(t);
	}, [open, fieldId]);

	useEffect(() => {
		if (!open) {
			setText("");
			setPillarId(null);
			setWeek(null);
		}
	}, [open]);

	const keyword = ready ? data.keywords.find((k) => k.term.toLowerCase() === lower.replace(/[?:]/g, "")) : undefined;
	const dupe = ready ? data.posts.find((p) => p.title.toLowerCase() === lower) : undefined;
	const { intent, type } = preview(lower);
	const defaultPillar = keyword?.pillarId ?? [...data.pillars].sort((a, b) => a.kasShare - b.kasShare)[0]?.id ?? null;
	const pillar = pillarId ?? defaultPillar;
	const nextWeek = isoWeek() + 1;
	const chosenWeek = week ?? nextWeek;
	const strong = type === "pillar" || type === "money-page";

	const weekOptions = useMemo(() => {
		const now = isoWeek();
		return Array.from({ length: 6 }, (_, i) => now + i).map((w) => {
			const planned = data.posts.filter((p) => p.week === w && p.state !== "live" && p.state !== "decaying").length;
			return { value: w, label: `W${w} · ${planned} of ${site.cadenceTarget} planned` };
		});
	}, [data.posts, site.cadenceTarget]);

	const specialist = state.members.find((m) => m.role === "specialist")?.name ?? "The content specialist";
	const allowed = can("idea.create");

	const add = () => {
		const r = actions.addIdea(title, pillar ?? undefined);
		if (!r.ok) return;
		if (r.id && chosenWeek !== nextWeek) actions.movePostToWeek(r.id, chosenWeek);
		onClose();
	};

	const footer = allowed ? (
		<>
			<Button variant="ghost" onClick={onClose}>
				Cancel
			</Button>
			{dupe ? (
				<LockedAction label="Add to plan · duplicate" reasons={[]} />
			) : (
				<Button variant="primary" icon="Plus" disabled={!ready} onClick={add}>
					Add to plan
				</Button>
			)}
		</>
	) : (
		<Button variant="ghost" onClick={onClose}>
			Close
		</Button>
	);

	return (
		<Sheet open={open} onClose={onClose} title="New idea" side={mobile ? "bottom" : "end"} width={480} footer={footer}>
			{!allowed ? (
				<Callout tone="neutral" icon="LockSimple" title="Your role can view the plan.">
					{why("idea.create")}. {specialist} adds ideas.
				</Callout>
			) : (
				<form
					className="flex flex-col gap-5 pt-1"
					onSubmit={(e) => {
						e.preventDefault();
						if (ready && !dupe) add();
					}}
				>
					<TextField label="Topic or keyword" value={text} onChange={setText} placeholder="e.g. dental crown cost lagos" hint="Paste a keyword or describe the post" icon="MagnifyingGlass" id={fieldId} />
					{!ready ? (
						<p className="text-sm text-ink-3">The agent fills intent, difficulty and pillar.</p>
					) : dupe ? (
						<Callout
							tone="info"
							title={`Already planned: “${dupe.title}” · ${STATE_LABEL[dupe.state]}`}
							action={
								<Button variant="secondary" size="sm" href={sitePath(slug, `/posts/${dupe.id}`)}>
									Open it
								</Button>
							}
						>
							Each keyword gets one post. Open the existing one instead.
						</Callout>
					) : (
						<section aria-live="polite" aria-busy={enriching} className="flex flex-col gap-4">
							<div className="flex items-center gap-2">
								<AgentBadge label="Keyword agent" running={enriching} />
								{!enriching && <span className="text-xs text-ink-3">Intent {INTENT_LABEL[intent].toLowerCase()}{keyword ? `, difficulty ${keyword.difficulty}` : ""}</span>}
							</div>
							{enriching ? (
								<div className="flex flex-col gap-3">
									{Array.from({ length: 5 }, (_, i) => (
										<Skeleton key={i} className="h-5 w-full" />
									))}
								</div>
							) : (
								<>
									<KeyValue
										rows={[
											{ k: "Intent", v: INTENT_LABEL[keyword?.intent ?? intent] },
											{ k: "Difficulty", v: keyword && keyword.difficulty > 0 ? keyword.difficultyEvidence : <span className="text-ink-3">Pending · next keyword swarm</span> },
											{
												k: "Content type",
												v: (
													<span className="inline-flex items-center gap-1.5">
														{TYPE_LABEL[type]}
														{strong && (
															<Chip tone="ink" size="sm">
																Strong model
															</Chip>
														)}
													</span>
												),
											},
										]}
									/>
									{(!keyword || keyword.impressions === 0) && <DataGap label="No impressions yet" reason="Search Console has no data for this keyword. The swarm enriches it on Monday." />}
									<div className="grid gap-3 sm:grid-cols-2">
										<Select label="Pillar" value={pillar} options={data.pillars.map((p) => ({ value: p.id, label: p.name }))} onChange={setPillarId} />
										<Select label="Week" value={chosenWeek} options={weekOptions} onChange={setWeek} />
									</div>
								</>
							)}
						</section>
					)}
				</form>
			)}
		</Sheet>
	);
}
