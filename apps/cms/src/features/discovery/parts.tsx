"use client";
// Site discovery pieces shared by the onboarding, Plan and report screens (prd-site-discovery §9): the progress
// card (agent-blue while running) and the publish-readiness banner (human-amber while setup is incomplete).
import { Button, Callout, Card, CardHeader, Chip, Meter, SourceNote } from "@/ds";
import { fmtUsd, READINESS_LABEL, READINESS_STEP, type TReadinessItem } from "@/lib/logic";
import { sitePath } from "@/lib/routes";
import { useSite, useToast } from "@/lib/store";
import { useSiteCms } from "@/features/shared/site-source";
import { STAGES, STAGE_LABEL, useDiscovery, type IDiscoveryData } from "./data";

const host = (u: string) => {
	try {
		return new URL(u).hostname.replace(/^www\./, "");
	} catch {
		return u;
	}
};

/** "Reading baynor.qa · 84 of 150 pages" while discovery runs; the outcome once it's done. */
export function DiscoveryProgressCard({ d: given, compact }: { d?: IDiscoveryData; compact?: boolean }) {
	const own = useDiscovery();
	const d = given ?? own;
	const { slug } = useSite();
	const { site, can } = useSiteCms();
	if (d.loading || !d.data) return null;
	const { latest, running, blocked } = d.data;
	if (!latest) {
		return (
			<Card className="flex flex-col gap-2">
				<CardHeader icon="TreeStructure" title="Site discovery" meta="Not run yet" />
				<p className="text-md text-ink-3">Discovery reads {site.domain}, understands the business and proposes pillars, keywords and a first batch of ideas, each with the page it came from.</p>
				{blocked ? <SourceNote icon="Info">{blocked}</SourceNote> : can("discovery.run") ? <RunButton d={d} label="Run discovery" /> : null}
			</Card>
		);
	}
	const step = Math.max(0, STAGES.indexOf(latest.stage as (typeof STAGES)[number]));
	const p = latest.progress;
	const title = running ? (latest.stage === "crawl" && p ? `Reading ${site.domain} · ${p.pagesCrawled} of ${p.pagesTotal} pages` : STAGE_LABEL[latest.stage] ?? "Working") : latest.status === "succeeded" ? `${latest.ideaCount} idea${latest.ideaCount === 1 ? "" : "s"} from site discovery` : latest.status === "needs-interview" ? "Discovery needs a few answers" : "Discovery stopped";
	return (
		<Card className="flex flex-col gap-3" aria-live="polite">
			<CardHeader icon="TreeStructure" title="Site discovery" meta={running ? <Chip tone="agent" size="sm">Running</Chip> : latest.status === "succeeded" ? <Chip tone="pass" size="sm">Done</Chip> : <Chip tone={latest.status === "needs-interview" ? "human" : "block"} size="sm">{latest.status === "needs-interview" ? "Needs you" : "Stopped"}</Chip>} href={sitePath(slug, "/discovery")} />
			<p className="font-display text-lg text-ink">{title}</p>
			{running && <Meter value={step} max={STAGES.length - 1} label={STAGE_LABEL[latest.stage] ?? latest.stage} format={() => `Step ${step + 1} of ${STAGES.length}`} />}
			{!running && latest.status !== "succeeded" && latest.error && <p className="text-sm text-ink-3">{latest.error}</p>}
			{!compact && (
				<SourceNote icon="Receipt">
					{fmtUsd(latest.costUsd)} spent{running && latest.estimateUsd ? ` · est. ${fmtUsd(latest.estimateUsd)}` : ""} · {latest.coverage.crawled} pages read{latest.coverage.skipped.length ? ` · ${latest.coverage.skipped.length} skipped` : ""}
				</SourceNote>
			)}
			{!running && (
				<div className="flex flex-wrap gap-2">
					<Button variant="secondary" size="sm" icon="ArrowRight" href={sitePath(slug, "/discovery")}>
						{latest.status === "needs-interview" ? "Answer the questions" : "Open the report"}
					</Button>
				</div>
			)}
		</Card>
	);
}

export function RunButton({ d, label, mode = "full", variant = "secondary" }: { d: IDiscoveryData; label: string; mode?: "full" | "more-ideas"; variant?: "primary" | "secondary" }) {
	const { toast } = useSiteToast();
	return (
		<Button
			variant={variant}
			size="sm"
			icon="Play"
			disabled={!!d.data?.running || !!d.data?.blocked}
			onClick={async () => {
				const r = await d.run(mode);
				toast(r.ok ? { text: mode === "full" ? "Discovery started" : "Generating another batch of ideas", tone: "agent" } : { text: r.reason, tone: "block" });
			}}
		>
			{label}
		</Button>
	);
}

/** F25: what's missing before posts can be drafted, with a link to each step; the fix belongs to developer/admin. */
export function ReadinessBanner({ d: given }: { d?: IDiscoveryData }) {
	const own = useDiscovery();
	const d = given ?? own;
	const { slug } = useSite();
	const { can } = useSiteCms();
	if (d.loading || !d.data || d.data.readiness.ready) return null;
	const missing = d.data.readiness.missing as TReadinessItem[];
	const fixer = can("repo.connect") || can("discovery.run");
	return (
		<Callout tone="human" icon="HourglassMedium" title="Waiting for setup · approved ideas wait in Briefed until the site can publish">
			<span className="flex flex-col gap-2">
				<span>Still to do: {missing.map((m) => READINESS_LABEL[m]).join(" · ")}.</span>
				<span className="flex flex-wrap gap-2">
					{missing.filter((m, i, a) => a.findIndex((x) => READINESS_STEP[x] === READINESS_STEP[m]) === i).map((m) => (
						<Button key={m} variant="secondary" size="sm" icon="ArrowRight" href={sitePath(slug, READINESS_STEP[m])} disabled={!fixer && m !== "profile"}>
							{m === "template" ? "Templates" : m === "profile" ? "Review the profile" : "Connect a site"}
						</Button>
					))}
				</span>
				{!fixer && <span className="text-xs text-ink-3">Repo and template setup belongs to the developer.</span>}
			</span>
		</Callout>
	);
}

/** "Site discovery" source chip and the amber "Waiting for setup" chip for a post (Plan, idea detail). */
export function DiscoveryChips({ source, waiting }: { source?: string; waiting?: string[] | null }) {
	return (
		<>
			{source === "site-discovery" && (
				<Chip tone="agent" size="sm" icon="TreeStructure">
					Site discovery
				</Chip>
			)}
			{waiting?.length ? (
				<Chip tone="human" size="sm" icon="HourglassMedium">
					Waiting for setup: {(waiting as TReadinessItem[]).map((m) => READINESS_LABEL[m] ?? m).join(", ")}
				</Chip>
			) : null}
		</>
	);
}

export { host };

function useSiteToast() {
	const toast = useToast();
	return { toast };
}

/** F19 on the idea/post: why discovery proposed it (the pages and queries it came from), the angle, and the links to add. */
export function DiscoveryEvidenceCard({ post }: { post: { source: string; discovery?: { evidence: string[]; angle?: string; secondaryKeywords: string[]; internalLinkTargets: string[] }; waitingFor?: string[] } }) {
	const { slug } = useSite();
	if (post.source !== "site-discovery" && !post.waitingFor?.length) return null;
	const dx = post.discovery;
	const label = (e: string) => (e.startsWith("gsc:") ? `Search Console · “${e.slice(4)}”` : (() => { try { const u = new URL(e); return u.pathname === "/" ? u.hostname : u.pathname; } catch { return e; } })());
	return (
		<Card variant="solid" padding="md" className="flex flex-col gap-2.5">
			<CardHeader icon="TreeStructure" title="Why this idea" meta={<DiscoveryChips source={post.source} />} href={sitePath(slug, "/discovery")} />
			{post.waitingFor?.length ? <DiscoveryChips waiting={post.waitingFor} /> : null}
			{dx?.angle && <p className="text-md text-ink-2">{dx.angle}</p>}
			{dx?.evidence.length ? (
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-ink-3">Came from</span>
					{dx.evidence.slice(0, 6).map((e) =>
						e.startsWith("gsc:") ? (
							<span key={e} className="text-sm text-ink-2">{label(e)}</span>
						) : (
							<a key={e} href={e} target="_blank" rel="noreferrer" className="truncate font-mono text-xs text-ink-2 hover:text-ink">{label(e)}</a>
						),
					)}
				</div>
			) : null}
			{dx?.secondaryKeywords.length ? (
				<span className="flex flex-wrap gap-1">{dx.secondaryKeywords.map((k) => <Chip key={k} size="sm">{k}</Chip>)}</span>
			) : null}
			{dx?.internalLinkTargets.length ? (
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-ink-3">Link to</span>
					{dx.internalLinkTargets.slice(0, 6).map((u) => <span key={u} className="truncate font-mono text-xs text-ink-2">{label(u)}</span>)}
				</div>
			) : null}
		</Card>
	);
}

/** Plan page: the readiness banner plus the progress card while a discovery run is going. */
export function PlanDiscoveryStrip() {
	const d = useDiscovery();
	if (d.loading || !d.data) return null;
	return (
		<>
			<ReadinessBanner d={d} />
			{d.data.running && <DiscoveryProgressCard d={d} compact />}
		</>
	);
}

/** Rough crawl cost shown before a change (Firecrawl: 1 credit per page plus the map, ~$0.0025 per credit). */
export function crawlEstimate(pages: number): string {
	return fmtUsd((pages + 1) * 0.0025);
}
