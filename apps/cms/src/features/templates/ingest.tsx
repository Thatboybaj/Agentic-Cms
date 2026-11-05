"use client";
// S10 /templates/ingest — Upload › Parse › Confirm › Versioned (Ref 04; F7b).
import clsx from "clsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
	AgentBadge,
	Button,
	Callout,
	Card,
	CardHeader,
	Chip,
	EmptyState,
	FileDrop,
	Icon,
	IconButton,
	KeyValue,
	LockedAction,
	ManifestMappingRow,
	OUTPUT_LABEL,
	OutputFormatPicker,
	ProgressBar,
	ROLE_LABEL,
	RoleGate,
	Section,
	SegmentedControl,
	Sheet,
	Skeleton,
	SourceCodeFrame,
	SourceNote,
	Stepper,
} from "@/ds";
import { fmtDateTime } from "@/lib/logic";
import { SIM_MS, useCms, useSite } from "@/lib/store";
import type { ITemplateManifest, ITemplateMapping, TRole } from "@/lib/types";
import { invalidateTemplateSource, useTemplateSource } from "@/features/preview/source";
import { SampleFrame, realSourceHighlights } from "./sample-frame";
import { IngestError, linkBundle, readBundle, sourceLabel, uploadBundle } from "./upload";
import { SAMPLE_PATH, SAMPLE_SOURCE, UPLOAD_NOTES, pickPreviewPost, groupCounts, handMapped, isHand, mappedCount, openItems, renderedHighlights, roleForLabel, sourceHighlights, summaryRows } from "./sample";
import { sitePath, previewPath } from "@/lib/routes";

const STEPS = [
	{ id: "upload", label: "Upload" },
	{ id: "parse", label: "Parse" },
	{ id: "confirm", label: "Confirm" },
	{ id: "versioned", label: "Versioned" },
];
const PARSE_STEPS = ["Reading files", "Detecting content region", "Classifying structures", "Finding image containers", "Reading metadata and schema"];
const MAX_BYTES = 50 * 1024 * 1024;
const CAN_ACT: TRole[] = ["developer", "admin"];
const READ_ONLY = "Only a developer or admin can ingest templates.";

const fileName = (m: ITemplateManifest) => m.source.split(" · ")[0]!;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function fmtSize(bytes: number): string {
	return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function SampleMeta() {
	return (
		<>
			<span className="text-2xs uppercase tracking-wide text-ink-4">General · 12 Mar 2025 · Dr Ada Okafor</span>
			<span className="font-display text-2xl font-medium leading-tight text-ink">Sample post title goes here</span>
		</>
	);
}

export function IngestView() {
	const { slug } = useSite();
	const { site, data, role, actions, can } = useCms();
	const canAct = can("template.ingest") && can("template.confirm");
	const [confirmedId, setConfirmedId] = useState<string | null>(null);
	const pending = useMemo(
		() => data.manifests.filter((m) => m.status === "parsing" || m.status === "needs-confirmation").sort((a, b) => b.version - a.version)[0] ?? null,
		[data.manifests],
	);
	const confirmed = confirmedId ? (data.manifests.find((m) => m.id === confirmedId) ?? null) : null;
	// While a real upload is still linking its files, stay on Upload so the confirm frame never loads half-stored assets.
	const [busy, setBusy] = useState(false);
	const step = confirmed ? 3 : busy ? 0 : pending?.status === "parsing" ? 1 : pending ? 2 : 0;
	const nextVersion = pending?.version ?? data.manifests.reduce((mx, m) => Math.max(mx, m.version), 0) + 1;

	if (!site.repo)
		return (
			<>
				<Header step={0} title={site.name} role={role} />
				<Card className="mx-auto w-full max-w-[720px]">
					<EmptyState
						icon="PlugsConnected"
						title="Connect the repo first"
						body={`${site.name} has no repo connected, so there's nowhere to render into. Connect the site, then ingest one sample post.`}
						action={
							<RoleGate role={role} allow={CAN_ACT} fallback={<span className="text-sm text-ink-3">Only a developer or admin can connect repos.</span>}>
								<Button variant="primary" icon="PlugsConnected" href={sitePath(slug, "/onboarding")}>
									Connect a site
								</Button>
							</RoleGate>
						}
					/>
				</Card>
			</>
		);

	const confirm = (m: ITemplateManifest) => {
		const r = actions.confirmManifest(m.id);
		if (r.ok) setConfirmedId(m.id);
	};

	const primary = (m: ITemplateManifest | null) => {
		if (step === 0 || step === 3 || !m) return null;
		const label = `Confirm manifest v${m.version}`;
		const open = openItems(m);
		return (
			<RoleGate role={role} allow={CAN_ACT} fallback={<LockedAction label={label} reasons={[READ_ONLY]} summary="read-only" />}>
				{m.status === "parsing" ? (
					<LockedAction label={label} reasons={["Still parsing the template"]} summary="parsing" />
				) : (
					<LockedAction
						label={label}
						icon="SealCheck"
						unlocked={open.length === 0}
						onClick={() => confirm(m)}
						reasons={open.map((x) => `Map ${x.selector}`)}
						summary={`map ${plural(open.length, "item")}`}
					/>
				)}
			</RoleGate>
		);
	};

	const shown = confirmed ?? pending;
	return (
		<>
			<Header step={step} title={shown ? fileName(shown) : site.name} subtitle={shown?.source} role={role} action={primary(pending)} />
			{!canAct && <Callout tone="info" icon="Eye" title="Read-only" className="shrink-0">{READ_ONLY} Switch to Developer to map and confirm.</Callout>}
			{step === 0 && <UploadStep canAct={canAct} nextVersion={nextVersion} onBusy={setBusy} />}
			{step === 1 && pending && <ParseStep manifest={pending} />}
			{step === 2 && pending && <ConfirmStep manifest={pending} canAct={canAct} action={primary(pending)} />}
			{step === 3 && confirmed && <VersionedStep manifest={confirmed} />}
		</>
	);
}

// ---- Header (desktop row as ref; mobile "Step 3 of 4 · Confirm") -----------

function Header({ step, title, subtitle, role, action }: { step: number; title: string; subtitle?: string; role: TRole; action?: ReactNode }) {
	const { slug } = useSite();
	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:hidden">
				<div className="flex h-11 items-center gap-2.5 rounded-pill bg-surface px-[18px]">
					<Icon name="BracketsAngle" size={16} />
					<h1 className="font-display text-base font-medium text-ink">Templates</h1>
					{subtitle && <span className="whitespace-nowrap text-sm text-ink-4">{subtitle}</span>}
				</div>
				<div className="flex h-11 items-center rounded-pill bg-surface px-3.5">
					<Stepper steps={STEPS} current={step} />
				</div>
				<div className="flex-1" />
				<Chip icon="Code" className="h-11 bg-surface px-4">
					{ROLE_LABEL[role]}
				</Chip>
				{action}
			</div>
			<div className="flex shrink-0 flex-col gap-3 md:hidden">
				<div className="flex items-center gap-2">
					<IconButton icon="ArrowLeft" label="Back to templates" variant="white" href={sitePath(slug, "/templates")} />
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="text-xs text-ink-4" aria-live="polite">
							Step {step + 1} of {STEPS.length} · {STEPS[step]!.label}
						</span>
						<h1 className="truncate font-display text-base font-medium text-ink">{title}</h1>
					</div>
					<Chip icon="Code" size="sm">
						{ROLE_LABEL[role]}
					</Chip>
				</div>
				<ol aria-hidden className="flex gap-[5px]">
					{STEPS.map((s, i) => (
						<li key={s.id} className={clsx("h-1 flex-1 rounded-pill", i < step ? "bg-pass" : i === step ? "bg-ink" : "bg-line-3")} />
					))}
				</ol>
			</div>
		</>
	);
}

// ---- Upload ----------------------------------------------------------------

type TUploadPhase = { phase: "reading" | "parsing" | "uploading" | "linking"; name: string; loaded: number; total: number };
const PHASE_LABEL: Record<TUploadPhase["phase"], string> = { reading: "Reading files", parsing: "Detecting content region, structures, images and metadata", uploading: "Uploading", linking: "Versioning the manifest" };

function UploadStep({ canAct, nextVersion, onBusy }: { canAct: boolean; nextVersion: number; onBusy: (busy: boolean) => void }) {
	const { actions, data, site } = useCms();
	const current = data.manifests.find((m) => m.status === "confirmed");
	const [error, setError] = useState<string | null>(null);
	const [upload, setUpload] = useState<TUploadPhase | null>(null);

	const onFile = async (f: File) => {
		setError(null);
		const kind = /\.zip$/i.test(f.name) ? "zip" : /\.html?$/i.test(f.name) ? "html" : null;
		if (!kind) return setError("Upload one rendered blog post as .html, or a .zip with the template, partials, CSS and a sample post.");
		if (f.size > MAX_BYTES) return setError("Keep the ZIP under 50 MB; drop node_modules and images.");
		onBusy(true);
		try {
			setUpload({ phase: "reading", name: f.name, loaded: 0, total: f.size });
			const bundle = await readBundle(f);
			setUpload({ phase: "parsing", name: f.name, loaded: 0, total: bundle.bytes });
			const bundleId = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
			await uploadBundle(site.id, bundleId, bundle, (loaded, total) => setUpload({ phase: "uploading", name: f.name, loaded, total }));
			setUpload({ phase: "linking", name: f.name, loaded: bundle.bytes, total: bundle.bytes });
			const r = actions.ingestTemplate(f.name, bundle.kind, { mappings: bundle.parsed.mappings, sampleHtml: bundle.parsed.sampleHtml, source: sourceLabel(bundle) });
			if (!r.ok) throw new IngestError(r.reason);
			if (r.id) {
				UPLOAD_NOTES.set(r.id, { samplePath: bundle.samplePath, missing: bundle.missing, skipped: bundle.skipped });
				await linkBundle(bundleId, r.id).catch((e: unknown) => UPLOAD_NOTES.set(r.id!, { samplePath: bundle.samplePath, missing: bundle.missing, skipped: bundle.skipped, linkError: e instanceof Error ? e.message : "link failed" }));
				invalidateTemplateSource(r.id);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : "That file can't be ingested.");
		} finally {
			setUpload(null);
			onBusy(false);
		}
	};

	return (
		<Card className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
			<CardHeader icon="UploadSimple" title={`Upload · becomes v${nextVersion}`} meta=".html or .zip · up to 50 MB" />
			{upload ? (
				<div className="flex min-h-44 flex-col justify-center gap-3 rounded-2xl bg-sunken p-6" aria-live="polite">
					<span className="flex items-center gap-2">
						<span className="font-mono text-sm text-ink">{upload.name}</span>
						<AgentBadge label="Template parser" running />
					</span>
					<ProgressBar
						value={upload.phase === "uploading" ? upload.loaded / Math.max(1, upload.total) : upload.phase === "linking" ? 1 : upload.phase === "parsing" ? 0.15 : 0.05}
						tone="agent"
						size="md"
						label={upload.phase === "uploading" ? `Uploading ${fmtSize(upload.loaded)} of ${fmtSize(upload.total)}` : `${PHASE_LABEL[upload.phase]}…`}
					/>
				</div>
			) : (
				<FileDrop
					accept=".html,.htm,.zip"
					onFile={onFile}
					disabled={!canAct}
					title="Drop the blog template"
					hint="One rendered blog post as HTML, or a ZIP with the template, partials, CSS and a sample post."
				/>
			)}
			{error && (
				<Callout tone="block" title="That file can't be ingested.">
					{error}
				</Callout>
			)}
			<KeyValue
				dense
				rows={[
					{ k: "Parse", v: "Content region, structures, image containers, metadata and schema" },
					{ k: "Confirm", v: "Anything unclassified is mapped once, by you" },
					{ k: "Live until then", v: current ? `Manifest v${current.version} · ${current.source}` : "No manifest yet · posts can't render" },
				]}
			/>
			<SourceNote icon="Stack">Versioned. A redesign means re-ingesting, not rebuilding.</SourceNote>
		</Card>
	);
}

// ---- Parse -----------------------------------------------------------------

function ParseStep({ manifest }: { manifest: ITemplateManifest }) {
	const [i, setI] = useState(0);
	useEffect(() => {
		const t = setInterval(() => setI((n) => Math.min(PARSE_STEPS.length - 1, n + 1)), SIM_MS.parse / PARSE_STEPS.length);
		return () => clearInterval(t);
	}, []);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
			<Card className="flex min-w-0 flex-1 flex-col gap-4">
				<CardHeader title="Sample post" meta={<span className="font-mono text-xs">{SAMPLE_PATH}</span>} action={<AgentBadge label="Template parser" running />} />
				<div aria-live="polite">
					<ProgressBar value={(i + 1) / (PARSE_STEPS.length + 1)} tone="agent" size="md" label={`${PARSE_STEPS[i]}… ${i + 1} of ${PARSE_STEPS.length}`} />
				</div>
				<div className="flex flex-col gap-3 rounded-md bg-sunken-2 p-6">
					<Skeleton className="h-6 w-2/3" />
					<Skeleton className="h-36 w-full" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			</Card>
			<Card className="flex flex-col gap-3 lg:w-[440px] lg:shrink-0">
				<CardHeader title="Manifest" meta={`Parsing ${manifest.source}`} />
				{Array.from({ length: 7 }, (_, n) => (
					<Skeleton key={n} className="h-9 w-full" />
				))}
			</Card>
		</div>
	);
}

// ---- Confirm ---------------------------------------------------------------

function ConfirmStep({ manifest: m, canAct, action }: { manifest: ITemplateManifest; canAct: boolean; action: ReactNode }) {
	const { slug } = useSite();
	const { actions, role, site, data } = useCms();
	const [mode, setMode] = useState<"rendered" | "source">("rendered");
	const [all, setAll] = useState(false);
	const hand = handMapped(m);
	const open = openItems(m);
	const { content, media } = summaryRows(m);
	const auto = m.mappings.filter((x) => x.status === "mapped" && !isHand(x));
	const onMapLabel = canAct ? (id: string, label: string) => actions.mapTemplateItem(m.id, id, roleForLabel(m.mappings.find((x) => x.id === id)!, label), label) : undefined;
	const picker = canAct ? (
		<OutputFormatPicker value={m.output} onChange={(v) => actions.setOutputFormat(m.id, v)} />
	) : (
		<RoleGate role={role} allow={CAN_ACT} action="change the output format">
			<OutputFormatPicker value={m.output} onChange={() => undefined} />
		</RoleGate>
	);
	const segment = (
		<SegmentedControl<"rendered" | "source">
			size="sm"
			label="Sample view"
			options={[
				{ value: "rendered", label: "Rendered" },
				{ value: "source", label: "Source" },
			]}
			value={mode}
			onChange={setMode}
		/>
	);
	// Real upload: the sample in a sandboxed frame with the site's CSS; the fixture only backs the seeded demo manifest.
	const src = useTemplateSource(m.sampleHtml ? m : null, site);
	const note = UPLOAD_NOTES.get(m.id);
	const samplePath = src.samplePath ?? note?.samplePath ?? (m.sampleHtml ? fileName(m) : SAMPLE_PATH);
	const frame = m.sampleHtml ? (
		mode === "rendered" ? (
			src.status === "loading" ? (
				<Skeleton className="m-6 h-[420px]" radius={16} />
			) : (
				<SampleFrame manifest={m} html={m.sampleHtml} baseHref={src.baseHref} className="min-h-[440px] flex-1" />
			)
		) : (
			<SourceCodeFrame html={m.sampleHtml} mode="source" highlights={realSourceHighlights(m)} />
		)
	) : (
		<SourceCodeFrame html={SAMPLE_SOURCE} mode={mode} highlights={mode === "rendered" ? renderedHighlights(m, <SampleMeta />) : sourceHighlights(m)} />
	);
	const previewPost = pickPreviewPost(data.posts);
	const previewLink = previewPost && (
		<Button variant="ghost" size="sm" icon="Eye" href={`${previewPath(slug, previewPost.id)}?manifest=${m.id}`}>
			Preview on site
		</Button>
	);
	const assetNote = (note?.missing.length ?? 0) > 0 || note?.linkError || src.note;

	return (
		<>
			{/* Desktop / tablet: sample post beside the manifest */}
			<div className="flex min-h-0 flex-1 flex-col gap-4 max-md:hidden lg:flex-row">
				<Card padding="none" className="flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
					<CardHeader
						title="Sample post"
						meta={<span className="font-mono text-xs">{samplePath}</span>}
						action={
							<>
								{previewLink}
								{segment}
							</>
						}
						className="border-b border-line px-[18px] py-3"
					/>
					{assetNote && (
						<Callout tone="human" icon="WarningCircle" title="Some site assets didn't come with the upload" className="mx-[18px] mt-3">
							{note?.linkError ? `Files were uploaded but not linked to v${m.version}: ${note.linkError}. ` : ""}
							{note?.missing.length ? `Missing from the bundle: ${note.missing.slice(0, 4).join(", ")}${note.missing.length > 4 ? ` +${note.missing.length - 4}` : ""}. ` : ""}
							{src.note ? `${src.note}. ` : ""}
							The preview shows the markup without them; re-ingest a ZIP with the CSS to see the real page.
						</Callout>
					)}
					<div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-auto bg-sunken-2">{frame}</div>
				</Card>
				<Card padding="none" className="flex min-h-0 flex-col overflow-hidden lg:w-[440px] lg:shrink-0">
					<div className="flex flex-col gap-3 px-5 pb-2.5 pt-4">
						<CardHeader title="Manifest" meta={`${mappedCount(m)} mapped · ${open.length} need you`} />
						{picker}
					</div>
					<div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 py-1">
						{hand.length > 0 && (
							<Section
								title={
									open.length ? (
										<span className="flex items-center gap-1.5 text-human-ink">
											<Icon name="WarningCircle" size={14} />
											Unclassified · map once
										</span>
									) : (
										<span className="flex items-center gap-1.5 text-pass-ink">
											<Icon name="CheckCircle" size={14} />
											Mapped by you
										</span>
									)
								}
								className="gap-2"
							>
								{hand.map((x) => (
									<ManifestMappingRow key={x.id} mapping={x} onMapLabel={onMapLabel} />
								))}
							</Section>
						)}
						<Section title="Content structures" className="gap-0">
							<div>{content.map((x) => <ManifestMappingRow key={x.id} mapping={x} />)}</div>
						</Section>
						<Section title="Images · metadata · schema" className="gap-0">
							<div>{media.map((x) => <ManifestMappingRow key={x.id} mapping={x} />)}</div>
						</Section>
						<Section
							title="Every selector"
							count={auto.length}
							className="gap-0 pb-2"
							action={
								<Button variant="ghost" size="sm" icon={all ? "CaretUp" : "CaretDown"} aria-expanded={all} onClick={() => setAll((a) => !a)}>
									{all ? "Hide" : "Show"}
								</Button>
							}
						>
							{all && <div>{auto.map((x) => <ManifestMappingRow key={x.id} mapping={x} />)}</div>}
						</Section>
					</div>
					<div className="border-t border-line px-5 py-3.5">
						<SourceNote icon="Stack">Versioned. A redesign means re-ingesting, not rebuilding.</SourceNote>
					</div>
				</Card>
			</div>
			<MobileConfirm manifest={m} canAct={canAct} action={action} hand={hand} open={open} frame={frame} segment={segment} samplePath={samplePath} previewLink={previewLink} />
		</>
	);
}

function MobileConfirm({
	manifest: m,
	canAct,
	action,
	hand,
	open,
	frame,
	segment,
	samplePath,
	previewLink,
}: {
	manifest: ITemplateManifest;
	canAct: boolean;
	action: ReactNode;
	hand: ITemplateMapping[];
	open: ITemplateMapping[];
	frame: ReactNode;
	segment: ReactNode;
	samplePath: string;
	previewLink: ReactNode;
}) {
	const { actions } = useCms();
	const [sheet, setSheet] = useState(false);
	const [expanded, setExpanded] = useState<string | null>(null);
	const [group, setGroup] = useState<string | null>(null);
	const active = expanded ?? open[0]?.id ?? null;
	const groups = groupCounts(m);
	const auto = m.mappings.filter((x) => x.status === "mapped" && !isHand(x)).length;

	return (
		<div className="flex flex-col gap-3 md:hidden">
			<div className="flex items-start gap-2 px-1 pt-1">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<h2 className="font-display text-2xl font-medium tracking-display text-ink">{open.length ? `${plural(open.length, "item")} need${open.length === 1 ? "s" : ""} a mapping` : "Everything is mapped"}</h2>
					<p className="text-sm text-ink-3">
						{auto} detected automatically. {open.length ? `Map these once and the manifest locks as v${m.version}.` : `Confirm to lock the manifest as v${m.version}.`}
					</p>
				</div>
				<Button variant="secondary" size="sm" icon="Eye" onClick={() => setSheet(true)}>
					Sample
				</Button>
			</div>
			{hand.map((x) =>
				x.id === active ? (
					<Card key={x.id} padding="sm" className="flex flex-col gap-3">
						<div aria-hidden className={clsx("flex h-24 items-center gap-2.5 rounded-md p-3.5 ring-[1.5px] ring-inset", x.status === "needs-you" ? "bg-human-soft ring-human-line" : "bg-sunken ring-line-3")}>
							<div className="flex flex-1 flex-col gap-1.5">
								<div className="h-2 w-[70%] rounded-xs bg-human-line/40" />
								<div className="h-1.5 rounded-xs bg-human-line/40" />
							</div>
							<div className="h-6 w-16 rounded-pill bg-human-line/40" />
						</div>
						<span className="font-mono text-sm text-ink">{x.selector}</span>
						{canAct ? (
							<SegmentedControl
								label={`Type for ${x.selector}`}
								options={(x.options ?? []).map((o) => ({ value: o, label: o }))}
								value={x.status === "needs-you" ? "" : (x.label ?? "")}
								onChange={(v) => {
									actions.mapTemplateItem(m.id, x.id, roleForLabel(x, v), v);
									const next = open.find((o) => o.id !== x.id);
									if (next) setExpanded(next.id);
								}}
							/>
						) : (
							<Chip tone="human" size="sm">
								Needs you · developer maps it
							</Chip>
						)}
					</Card>
				) : (
					<Card key={x.id} padding="none" as="button" interactive onClick={() => setExpanded(x.id)} className="flex min-h-14 w-full items-center gap-2.5 px-3.5 py-3 text-start">
						<span className={clsx("grid size-9 shrink-0 place-items-center rounded-full", x.status === "needs-you" ? "bg-human-soft text-human-ink" : "bg-pass-soft text-pass-ink")}>
							<Icon name={x.status === "needs-you" ? "WarningCircle" : "CheckCircle"} size={16} />
						</span>
						<span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{x.selector}</span>
						{x.status !== "needs-you" && <span className="text-xs text-pass-ink">{x.label}</span>}
						<Icon name="CaretRight" size={14} className="text-ink-3" />
					</Card>
				),
			)}
			<Card padding="none" className="px-3.5 py-1.5">
				{groups.map((g, i) => (
					<div key={g.id} className={clsx(i < groups.length - 1 && "border-b border-line")}>
						<button type="button" aria-expanded={group === g.id} onClick={() => setGroup((c) => (c === g.id ? null : g.id))} className="flex min-h-11 w-full items-center gap-2.5 py-2 text-start text-md">
							<Icon name="CheckCircle" size={16} className="text-pass" />
							<span className="flex-1 text-ink">{g.label}</span>
							<span className="tabular text-ink-4">{g.rows.length}</span>
							<Icon name={group === g.id ? "CaretUp" : "CaretDown"} size={12} className="text-ink-4" />
						</button>
						{group === g.id && <div className="pb-2">{g.rows.map((x) => <ManifestMappingRow key={x.id} mapping={x} />)}</div>}
					</div>
				))}
			</Card>
			<SourceNote icon="Stack">Versioned. A redesign means re-ingesting, not rebuilding.</SourceNote>
			<div className="sticky bottom-0 z-10 -mx-4 flex flex-col bg-gradient-to-t from-canvas from-70% to-transparent px-4 pb-1 pt-4 [&>*]:w-full [&_button]:w-full [&_button]:justify-center">
				{canAct && open.length > 0 ? (
					<LockedAction label={`Confirm manifest v${m.version}`} reasons={open.map((x) => `Map ${x.selector}`)} summary={`${open.length} left`} className="w-full" />
				) : (
					action
				)}
			</div>
			<Sheet open={sheet} onClose={() => setSheet(false)} title="Sample post" side="bottom">
				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<span className="truncate font-mono text-xs text-ink-3">{samplePath}</span>
						{previewLink}
						<span className="ms-auto">{segment}</span>
					</div>
					<div className="overflow-hidden rounded-md">{frame}</div>
				</div>
			</Sheet>
		</div>
	);
}

// ---- Versioned -------------------------------------------------------------

function VersionedStep({ manifest: m }: { manifest: ITemplateManifest }) {
	const { slug } = useSite();
	const { data } = useCms();
	const hand = handMapped(m);
	const previewPost = pickPreviewPost(data.posts);
	return (
		<Card className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
			<Callout
				tone="pass"
				icon="SealCheck"
				title={`Manifest v${m.version} confirmed · ${m.confirmedBy ?? "you"} · ${m.confirmedAt ? fmtDateTime(m.confirmedAt) : "now"}`}
				action={
					<Button variant="primary" href={sitePath(slug, "/templates")} icon="ArrowLeft">
						Back to templates
					</Button>
				}
			>
				New posts render into it. Earlier versions stay in the history.
			</Callout>
			<KeyValue
				rows={[
					{ k: "Source", v: m.source },
					{ k: "Output", v: OUTPUT_LABEL[m.output] },
					{ k: "Detected", v: `${mappedCount(m)} selectors` },
					...hand.map((x) => ({ k: x.label ?? "Mapped", v: <span className="font-mono text-xs">{x.selector}</span> })),
				]}
			/>
			{previewPost && (
				<Button variant="secondary" size="sm" icon="Eye" href={`${previewPath(slug, previewPost.id)}?manifest=${m.id}`} className="self-start">
					Preview on site · {previewPost.title}
				</Button>
			)}
			<SourceNote icon="Stack">Versioned. A redesign means re-ingesting, not rebuilding.</SourceNote>
		</Card>
	);
}
