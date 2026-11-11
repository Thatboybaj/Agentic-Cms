"use client";
// Settings · Brand pack — palette, voice, style keywords and regulated-topic disclaimers, injected into every prompt.
// Palette swatches render the tenant's own brand values (client data), so they're the one inline style on this screen.
import { Card, CardHeader, Chip, DataGap, SourceNote } from "@/ds";
import { useSiteCms } from "@/features/shared/site-source";

const TOPIC: Record<"health" | "finance" | "legal", string> = { health: "Health", finance: "Finance", legal: "Legal" };

export function BrandTab() {
	const { site, data } = useSiteCms();
	const bp = data.brandPack;
	const disclaimers = (Object.keys(bp.disclaimers) as (keyof typeof TOPIC)[]).filter((k) => bp.disclaimers[k]);

	return (
		<div className="flex flex-col gap-4">
			<p className="px-1 text-sm text-ink-3">Injected into every prompt, whatever the provider. Never visible to, or used as context for, another client.</p>
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
				<Card className="flex flex-col gap-3">
					<CardHeader icon="TextAa" title="Voice" meta={site.name} />
					{bp.voice ? <p className="text-md leading-body text-ink-2">{bp.voice}</p> : <DataGap label="No voice notes yet" reason="Drafts fall back to plain, neutral copy until voice notes are added." />}
				</Card>
				<Card className="flex flex-col gap-3">
					<CardHeader icon="Sparkle" title="Palette" meta={`${bp.palette.length} colours`} />
					{bp.palette.length === 0 ? (
						<DataGap label="No palette" reason="Image prompts carry no colour guidance until one is added." />
					) : (
						<ul className="flex flex-wrap gap-3">
							{bp.palette.map((value) => (
								<li key={value} className="flex flex-col items-center gap-1.5">
									<span aria-hidden="true" className="block size-14 rounded-lg border border-line-2" style={{ background: value }} />
									<span className="font-mono text-xs text-ink-3">{value}</span>
								</li>
							))}
						</ul>
					)}
				</Card>
				<Card className="flex flex-col gap-3">
					<CardHeader icon="ImagesSquare" title="Style keywords" meta="Every image prompt" />
					{bp.styleKeywords.length === 0 ? (
						<DataGap label="No style keywords" reason="Image prompts use the slot description only." />
					) : (
						<ul className="flex flex-wrap gap-1.5">
							{bp.styleKeywords.map((k) => (
								<li key={k}>
									<Chip tone="neutral">{k}</Chip>
								</li>
							))}
						</ul>
					)}
					<span className="text-xs text-ink-3">No identifiable real people and no imitation of living artists, whatever a prompt asks.</span>
				</Card>
				<Card className="flex flex-col gap-3">
					<CardHeader icon="ShieldCheck" title="Regulated topics" meta={disclaimers.length ? disclaimers.map((d) => TOPIC[d]).join(" · ") : "None"} />
					{disclaimers.length === 0 ? (
						<p className="text-sm text-ink-3">No regulated topic. Posts carry no mandatory disclaimer.</p>
					) : (
						disclaimers.map((d) => (
							<div key={d} className="flex flex-col gap-2">
								<Chip tone="neutral" icon="ShieldCheck" className="self-start">
									Regulated topic · {TOPIC[d].toLowerCase()}
								</Chip>
								<blockquote className="rounded-lg bg-sunken px-3.5 py-3 text-sm leading-body text-ink-2">{bp.disclaimers[d]}</blockquote>
								<span className="text-xs text-ink-3">Mandatory disclaimer block. Removing it from a post needs a logged override.</span>
							</div>
						))
					)}
				</Card>
			</div>
			<SourceNote icon="Info" className="self-start">
				Brand pack · set at onboarding · per client
			</SourceNote>
		</div>
	);
}
