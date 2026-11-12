"use client";
// /s/[site]/discovery (prd-site-discovery F26–F27): what discovery found and why. Coverage, the site profile and brand
// pack draft (edit, accept), pillars and keywords with their evidence, the content map and refresh candidates,
// competitor notes, the ideas it created, run cost and history. Every figure shows its source or a data gap.
import { useState } from "react";
import { Button, Callout, Card, CardHeader, Chip, DataGap, DataTable, EmptyState, KeyValue, PageHeader, RoleGate, Section, SourceNote, StatStrip, Tabs, TextArea, type IDataTableColumn } from "@/ds";
import { TopBarCta } from "@/features/shared/app-shell";
import { PageLoading } from "@/features/shared/page-loading";
import { useSiteCms } from "@/features/shared/site-source";
import { fmtUsd, PERMISSIONS } from "@/lib/logic";
import { sitePath } from "@/lib/routes";
import { useSite, useToast } from "@/lib/store";
import { useDiscovery, type IDiscoveryData, type TDiscoveryOverview } from "./data";
import { DiscoveryChips, DiscoveryProgressCard, host, ReadinessBanner, RunButton } from "./parts";

type TTab = "overview" | "keywords" | "content" | "coverage";
type TProfile = NonNullable<TDiscoveryOverview["profile"]>;
type TLatest = NonNullable<TDiscoveryOverview["latest"]>;

/** An evidence item: a crawled page (its path), a Search Console query, or a competitor URL (its host). */
function Evidence({ items, domain }: { items: string[]; domain: string }) {
	if (!items.length) return <span className="text-xs text-ink-4">No evidence</span>;
	return (
		<span className="flex flex-wrap gap-1">
			{items.slice(0, 4).map((e) =>
				e.startsWith("gsc:") ? (
					<Chip key={e} size="sm" icon="GoogleLogo">
						{e.slice(4)}
					</Chip>
				) : (
					<a key={e} href={e} target="_blank" rel="noreferrer" className="rounded-pill bg-sunken px-2 py-0.5 font-mono text-xs text-ink-2 hover:text-ink">
						{host(e) === domain.replace(/^www\./, "") ? new URL(e).pathname : host(e)}
					</a>
				),
			)}
			{items.length > 4 && <span className="text-xs text-ink-4">+{items.length - 4}</span>}
		</span>
	);
}

export function DiscoveryReport() {
	const d = useDiscovery();
	const { site, role } = useSiteCms();
	const [tab, setTab] = useState<TTab>("overview");
	if (d.loading) return <PageLoading rows={4} />;
	const data = d.data;
	const latest = data?.latest ?? null;
	const actions = (
		<RoleGate role={role} allow={PERMISSIONS["discovery.run"]} action="run site discovery">
			<span className="flex gap-2">
				{latest?.status === "succeeded" && <RunButton d={d} label="Generate more ideas" mode="more-ideas" />}
				<RunButton d={d} label={latest ? "Re-run discovery" : "Run discovery"} variant="primary" />
			</span>
		</RoleGate>
	);
	return (
		<div className="flex flex-col gap-5">
			<PageHeader title="Site discovery" subtitle={`What ${site.domain} sells, the pillars and keywords worth owning, and the ideas that came from it, each with its evidence.`} />
			<TopBarCta>{actions}</TopBarCta>
			{d.demo && (
				<Callout tone="info" icon="Info" title="Demo data">
					A seeded example result. With the backend connected, discovery reads the real site.
				</Callout>
			)}
			{!data ? (
				<EmptyState icon="TreeStructure" title="No discovery for this site yet" body="Run discovery to read the site and propose pillars, keywords and a first batch of ideas." />
			) : (
				<>
					<ReadinessBanner d={d} />
					<DiscoveryProgressCard d={d} />
					{latest && <Stats latest={latest} />}
					<Tabs
						value={tab}
						onChange={(v) => setTab(v as TTab)}
						tabs={[
							{ id: "overview", label: "Overview" },
							{ id: "keywords", label: "Pillars & keywords", count: latest?.pillars.reduce((n, p) => n + p.keywords.length, 0) ?? 0 },
							{ id: "content", label: "Content map", count: data.contentMap.length },
							{ id: "coverage", label: "Coverage & history" },
						]}
					/>
					{tab === "overview" && <Overview d={d} data={data} />}
					{tab === "keywords" && <Keywords data={data} domain={site.domain} />}
					{tab === "content" && <ContentMap d={d} data={data} domain={site.domain} />}
					{tab === "coverage" && <Coverage data={data} />}
				</>
			)}
		</div>
	);
}

function Stats({ latest }: { latest: TLatest }) {
	const kw = latest.pillars.reduce((n, p) => n + p.keywords.length, 0);
	return (
		<StatStrip
			items={[
				{ id: "pages", label: "Pages read", value: latest.coverage.crawled },
				{ id: "skipped", label: "Skipped", value: latest.coverage.skipped.length },
				{ id: "pillars", label: "Pillars", value: latest.pillars.length },
				{ id: "keywords", label: "Keywords", value: kw },
				{ id: "ideas", label: "Ideas", value: latest.ideaCount, tone: latest.ideaCount ? "human" : undefined },
				{ id: "cost", label: "Run cost", value: fmtUsd(latest.costUsd) },
			]}
		/>
	);
}

function Overview({ d, data }: { d: IDiscoveryData; data: TDiscoveryOverview }) {
	const { slug } = useSite();
	return (
		<div className="flex flex-col gap-5">
			{data.needsInterview && <Interview d={d} questions={[...data.interviewQuestions]} />}
			{data.profile ? <ProfileCard d={d} profile={data.profile} /> : <DataGap label="Site profile" reason="Written after the site is read." />}
			<Section title="Ideas from discovery" count={data.ideas.length} action={<Button variant="ghost" size="sm" icon="Kanban" href={sitePath(slug, "/plan")}>Open the plan</Button>}>
				{data.ideas.length ? (
					<Card padding="none" className="divide-y divide-line-2">
						{data.ideas.map((i) => (
							<a key={i.id} href={sitePath(slug, `/posts/${i.id}`)} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-sunken">
								<span className="min-w-0 flex-1 truncate text-md text-ink">{i.title}</span>
								<Chip size="sm">{i.contentType === "pillar" ? "Pillar page" : i.contentType === "money-page" ? "Money page" : "Cluster"}</Chip>
								<Chip size="sm">W{i.week}</Chip>
								<Chip size="sm" tone={i.ideaStatus === "pending" ? "human" : i.ideaStatus === "rejected" ? "neutral" : "pass"}>{i.ideaStatus === "pending" ? "Waiting for approval" : i.ideaStatus === "rejected" ? "Rejected" : i.state}</Chip>
								<DiscoveryChips waiting={i.waiting} />
							</a>
						))}
					</Card>
				) : (
					<DataGap label="Ideas" reason={data.latest?.status === "succeeded" ? "No new ideas this time · see what was dropped under Pillars & keywords." : "Written at the end of a run."} />
				)}
			</Section>
		</div>
	);
}

function ProfileCard({ d, profile: p }: { d: IDiscoveryData; profile: TProfile }) {
	const { site, role, can } = useSiteCms();
	const toast = useToast();
	const [editing, setEditing] = useState(false);
	const [sells, setSells] = useState(p.sells.value);
	const [audience, setAudience] = useState(p.audience.value);
	const [voice, setVoice] = useState(p.brandPack.voice);
	const [disclaimers, setDisclaimers] = useState(p.brandPack.disclaimers.join("\n"));
	const list = (xs: { value: string }[]) => (xs.length ? xs.map((x) => x.value).join(" · ") : <span className="text-ink-4">Not on the site</span>);
	const regulated = p.regulated.category !== "none";
	const save = async () => {
		const r = await d.editProfile({ sells, audience, voice, disclaimers: disclaimers.split("\n") });
		toast(r.ok ? { text: "Profile saved · accept it to update the brand pack", tone: "pass" } : { text: r.reason, tone: "block" });
		if (r.ok) setEditing(false);
	};
	return (
		<Card className="flex flex-col gap-4">
			<CardHeader
				icon="UserFocus"
				title={`Site profile · v${p.version}`}
				meta={
					<span className="flex gap-1.5">
						{p.confidence === "low" && <Chip tone="human" size="sm">Low confidence · few pages</Chip>}
						{regulated && <Chip tone="block" size="sm">Regulated · {p.regulated.category}</Chip>}
						{p.accepted ? <Chip tone="pass" size="sm" icon="CheckCircle">Accepted</Chip> : <Chip tone="human" size="sm">Not accepted yet</Chip>}
					</span>
				}
			/>
			{regulated && !p.accepted && (
				<Callout tone="human" icon="ShieldCheck" title={`A ${p.regulated.category} site: the first draft waits until this profile is accepted.`}>
					Check the disclaimers below; accepting copies the voice, style and disclaimer into {site.name}'s brand pack.
				</Callout>
			)}
			{editing ? (
				<div className="flex flex-col gap-3">
					<TextArea label="What the business sells" value={sells} onChange={setSells} rows={2} />
					<TextArea label="Audience" value={audience} onChange={setAudience} rows={2} />
					<TextArea label="Voice" value={voice} onChange={setVoice} rows={3} />
					<TextArea label="Disclaimers (one per line)" value={disclaimers} onChange={setDisclaimers} rows={3} />
					<span className="flex gap-2">
						<Button variant="primary" size="sm" icon="Check" onClick={save}>Save</Button>
						<Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
					</span>
				</div>
			) : (
				<KeyValue
					rows={[
						{ k: "Sells", v: <span className="flex flex-col gap-1">{p.sells.value || <span className="text-ink-4">Not clear from the site</span>}<Evidence items={p.sells.evidence} domain={site.domain} /></span> },
						{ k: "Offerings", v: list(p.offerings) },
						{ k: "Audience", v: p.audience.value || <span className="text-ink-4">Not clear from the site</span> },
						{ k: "Regions", v: list(p.regions) },
						{ k: "Price", v: p.pricePositioning?.value || <span className="text-ink-4">Not on the site</span> },
						{ k: "Differentiators", v: list(p.differentiators) },
						{ k: "Competitors named", v: list(p.competitorsNamed) },
						{ k: "Blog covers", v: list(p.blogCoverage) },
					]}
				/>
			)}
			<div className="flex flex-col gap-2 rounded-lg bg-sunken p-3">
				<span className="font-display text-md font-medium text-ink">Brand pack draft</span>
				<p className="text-md text-ink-2">{p.brandPack.voice || <span className="text-ink-4">No voice description</span>}</p>
				{p.brandPack.voiceExamples.map((q) => (
					<blockquote key={q.value} className="border-s-2 border-line-3 ps-3 text-sm text-ink-3">
						“{q.value}” <Evidence items={q.evidence} domain={site.domain} />
					</blockquote>
				))}
				{p.brandPack.styleKeywords.length > 0 && <span className="flex flex-wrap gap-1">{p.brandPack.styleKeywords.map((k) => <Chip key={k} size="sm">{k}</Chip>)}</span>}
				{p.brandPack.disclaimers.map((x) => (
					<p key={x} className="text-sm text-ink-2">
						<strong>Disclaimer:</strong> {x}
					</p>
				))}
			</div>
			{p.gaps.length > 0 && <SourceNote icon="Info">Gaps: {p.gaps.join(" · ")}</SourceNote>}
			<RoleGate role={role} allow={PERMISSIONS["discovery.run"]} action="edit or accept the profile">
				<span className="flex gap-2">
					{!editing && <Button variant="secondary" size="sm" icon="PencilSimple" onClick={() => setEditing(true)} disabled={!can("discovery.run")}>Edit profile</Button>}
					{!p.accepted && !editing && (
						<Button
							variant="primary"
							size="sm"
							icon="Check"
							disabled={!can("discovery.run")}
							onClick={async () => {
								const r = await d.acceptProfile();
								toast(r.ok ? { text: "Profile accepted · brand pack updated", tone: "pass" } : { text: r.reason, tone: "block" });
							}}
						>
							Accept profile
						</Button>
					)}
				</span>
			</RoleGate>
		</Card>
	);
}

function Interview({ d, questions }: { d: IDiscoveryData; questions: string[] }) {
	const toast = useToast();
	const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
	return (
		<Card className="flex flex-col gap-3">
			<CardHeader icon="ChatCircle" title="A few questions about the business" meta={<Chip tone="human" size="sm">Needs you</Chip>} />
			<p className="text-md text-ink-3">The site couldn't be read (its robots rules block crawling, or it has very few pages). Answer what you can; discovery builds the profile, pillars and ideas from your answers.</p>
			{questions.map((q, i) => (
				<TextArea key={q} label={`${i + 1}. ${q}`} value={answers[i]!} onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} rows={2} />
			))}
			<span>
				<Button
					variant="primary"
					size="sm"
					icon="PaperPlaneTilt"
					onClick={async () => {
						const r = await d.answerInterview(questions.map((question, i) => ({ question, answer: answers[i]! })));
						toast(r.ok ? { text: "Thanks · discovery is working from your answers", tone: "agent" } : { text: r.reason, tone: "block" });
					}}
				>
					Send answers
				</Button>
			</span>
		</Card>
	);
}

type TKwRow = TLatest["pillars"][number]["keywords"][number] & { id: string };

function Keywords({ data, domain }: { data: TDiscoveryOverview; domain: string }) {
	const latest = data.latest;
	if (!latest?.pillars.length) return <DataGap label="Pillars and keywords" reason="Proposed after the site profile is written." />;
	const cols: IDataTableColumn<TKwRow>[] = [
		{ key: "term", header: "Keyword", render: (k) => <span className="font-medium text-ink">{k.term}</span> },
		{ key: "intent", header: "Intent", render: (k) => <span className="text-sm text-ink-2">{k.intent} · {k.funnel}</span> },
		{ key: "vol", header: "Volume", render: (k) => <span className="text-sm">{k.volume}{k.volumeSource === "estimate" && <span className="block text-xs text-ink-4">tier, not a number</span>}</span> },
		{ key: "flags", header: "", render: (k) => <span className="flex flex-wrap gap-1">{k.quickWin && <Chip tone="pass" size="sm">Quick win</Chip>}{k.existingPageUrl && <Chip size="sm" icon="FileText">Covered by {new URL(k.existingPageUrl).pathname}</Chip>}</span> },
		{ key: "ev", header: "Evidence", render: (k) => <Evidence items={k.evidence} domain={domain} /> },
	];
	return (
		<div className="flex flex-col gap-5">
			{latest.pillars.map((p) => (
				<Section key={p.name} title={p.name} count={p.keywords.length} meta={p.why}>
					<DataTable dense columns={cols} rows={p.keywords.map((k) => ({ ...k, id: k.term }))} caption={`${p.name} keywords`} />
				</Section>
			))}
			<Section title="Who ranks" count={latest.competitorNotes.length}>
				{latest.competitorNotes.length ? (
					<Card padding="none" className="divide-y divide-line-2">
						{latest.competitorNotes.map((n) => (
							<div key={n.keyword} className="flex flex-wrap items-center gap-2 px-4 py-3">
								<span className="min-w-0 flex-1 text-md text-ink">{n.keyword}</span>
								<Chip size="sm" tone={n.difficulty === "high" ? "block" : n.difficulty === "low" ? "pass" : "neutral"}>Difficulty {n.difficulty}</Chip>
								<Evidence items={n.ranking} domain={domain} />
							</div>
						))}
					</Card>
				) : (
					<DataGap label="Competitor check" reason={data.settings.competitorCheck ? "No search results recorded for this run." : "Turned off in Settings."} />
				)}
			</Section>
			{latest.dropped.length > 0 && (
				<Section title="Dropped" count={latest.dropped.length} meta="Kept out so the plan only holds what the evidence supports">
					<ul className="flex flex-col gap-1 text-sm text-ink-3">{latest.dropped.slice(0, 40).map((x) => <li key={x}>{x}</li>)}</ul>
				</Section>
			)}
			<SourceNote icon="Info">Volume is Search Console impressions when connected, otherwise a tier the agent estimated (never a made-up number). Difficulty comes from who ranks.</SourceNote>
		</div>
	);
}

type TPageRow = TDiscoveryOverview["contentMap"][number] & { id: string };

function ContentMap({ d, data, domain }: { d: IDiscoveryData; data: TDiscoveryOverview; domain: string }) {
	const { role, can } = useSiteCms();
	const toast = useToast();
	if (!data.contentMap.length) return <DataGap label="Content map" reason="Built from the crawl." />;
	const cols: IDataTableColumn<TPageRow>[] = [
		{ key: "page", header: "Page", render: (p) => <a href={p.url} target="_blank" rel="noreferrer" className="flex flex-col"><span className="text-ink">{p.title}</span><span className="font-mono text-xs text-ink-4">{host(p.url) === domain ? new URL(p.url).pathname : p.url}</span></a> },
		{ key: "type", header: "Type", render: (p) => <Chip size="sm">{p.type ?? "not read yet"}</Chip> },
		{ key: "topic", header: "Topic", render: (p) => <span className="text-sm text-ink-2">{p.topic ?? "—"}{p.targetQuery && <span className="block text-xs text-ink-4">targets “{p.targetQuery}”</span>}</span> },
		{ key: "words", header: "Words", align: "end", render: (p) => p.wordCount.toLocaleString("en-US") },
		{ key: "refresh", header: "", render: (p) => (p.refresh ? <Chip tone="human" size="sm">Refresh · {p.refresh}</Chip> : null) },
	];
	const candidates = data.contentMap.filter((p) => p.refresh);
	return (
		<div className="flex flex-col gap-4">
			{candidates.length > 0 && (
				<Callout
					tone="human"
					icon="ArrowsClockwise"
					title={`${candidates.length} page${candidates.length === 1 ? "" : "s"} could be refreshed instead of written again`}
					action={
						<RoleGate role={role} allow={PERMISSIONS["discovery.run"]} action="send refresh candidates">
							<Button
								variant="secondary"
								size="sm"
								icon="PaperPlaneTilt"
								disabled={!can("discovery.run")}
								onClick={async () => {
									const r = await d.sendRefresh(candidates.map((c) => c.url));
									toast(r.ok ? { text: `${(r as { sent?: number }).sent ?? 0} sent to the human ledger for the refresh agent`, tone: "pass" } : { text: r.reason, tone: "block" });
								}}
							>
								Send to the refresh agent
							</Button>
						</RoleGate>
					}
				>
					Thin or dated pages the crawl found. Discovery never rewrites existing pages; the content-refresh agent does, once a person sends them.
				</Callout>
			)}
			<DataTable dense columns={cols} rows={data.contentMap.map((p) => ({ ...p, id: p.url }))} caption="Pages discovery read" />
		</div>
	);
}

function Coverage({ data }: { data: TDiscoveryOverview }) {
	const latest = data.latest;
	return (
		<div className="flex flex-col gap-5">
			<Section title="Skipped pages" count={latest?.coverage.skipped.length ?? 0} meta={latest?.coverage.limitHit ? `Page limit reached (${data.settings.maxPages})` : undefined}>
				{latest?.coverage.skipped.length ? (
					<Card padding="none" className="divide-y divide-line-2">
						{latest.coverage.skipped.slice(0, 200).map((s) => (
							<div key={s.url} className="flex items-center gap-2 px-4 py-2 text-sm">
								<span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">{s.url}</span>
								<Chip size="sm">{s.reason}</Chip>
							</div>
						))}
					</Card>
				) : (
					<p className="text-sm text-ink-3">Nothing skipped.</p>
				)}
			</Section>
			<Section title="Runs" count={data.history.length}>
				<Card padding="none" className="divide-y divide-line-2">
					{data.history.map((h) => (
						<div key={h.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
							<span className="min-w-0 flex-1 text-ink">{new Date(h.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {h.mode === "more-ideas" ? "More ideas" : h.mode === "interview" ? "From the interview" : "Full run"}</span>
							<Chip size="sm" tone={h.status === "succeeded" ? "pass" : h.status === "running" ? "agent" : h.status === "needs-interview" ? "human" : "block"}>{h.status}</Chip>
							<span className="text-ink-3">{h.crawled} pages · {h.ideas} ideas · {fmtUsd(h.costUsd)}</span>
						</div>
					))}
				</Card>
			</Section>
			<SourceNote icon="Info">Page text is kept for 90 days for re-runs, then deleted; what each page is about stays.</SourceNote>
		</div>
	);
}
