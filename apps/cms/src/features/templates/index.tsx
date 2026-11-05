"use client";
// S09 /templates — manifest versions + output format. S10 lives in ./ingest.
import Link from "next/link";
import { useMemo } from "react";
import {
	Button,
	Callout,
	Card,
	CardHeader,
	Chip,
	DataTable,
	EmptyState,
	KeyValue,
	LockedAction,
	OUTPUT_LABEL,
	OutputFormatPicker,
	PageHeader,
	RoleGate,
	SourceNote,
	type IDataTableColumn,
} from "@/ds";
import { fmtDate } from "@/lib/logic";
import { useActiveManifest, useCms, useSite } from "@/lib/store";
import type { ITemplateManifest, TRole, TTone } from "@/lib/types";
import { TopBarCta } from "@/features/shared/app-shell";
import { handMapped, openItems, pickPreviewPost, summaryRows } from "./sample";
import { sitePath, previewPath } from "@/lib/routes";

export { IngestView } from "./ingest";

const CAN_ACT: TRole[] = ["developer", "admin"];
const STATUS: Record<ITemplateManifest["status"], { label: string; tone: TTone }> = {
	confirmed: { label: "Current", tone: "pass" },
	superseded: { label: "Superseded", tone: "neutral" },
	"needs-confirmation": { label: "Needs confirmation", tone: "human" },
	parsing: { label: "Parsing", tone: "agent" },
};
const STRUCTURE_ROLE = { table: "table", list: "list", quote: "quote", image: "image", schema: "schema" } as const;

export function TemplatesView() {
	const { slug } = useSite();
	const { site, data, role, state, actions, can } = useCms();
	const active = useActiveManifest();
	const canManage = can("template.ingest");
	const developer = state.members.find((m) => m.role === "developer")?.name ?? "the developer";
	const pending = useMemo(
		() => data.manifests.filter((m) => m.status === "parsing" || m.status === "needs-confirmation").sort((a, b) => b.version - a.version)[0] ?? null,
		[data.manifests],
	);
	const versions = useMemo(() => [...data.manifests].sort((a, b) => b.version - a.version), [data.manifests]);
	const held = useMemo(() => {
		if (!active) return [];
		const absent = new Set(active.mappings.filter((m) => m.status === "absent").map((m) => m.role));
		return data.posts.filter((p) => p.state !== "live" && p.state !== "decaying" && p.requires?.some((r) => absent.has(STRUCTURE_ROLE[r])));
	}, [active, data.posts]);

	if (!site.repo)
		return (
			<>
				<PageHeader title="Templates" subtitle={`${site.name} · no repo connected`} />
				<Card className="w-full max-w-[720px]">
					<EmptyState
						icon="PlugsConnected"
						title="Connect the repo first"
						body={
							canManage
								? `Posts render into ${site.name}'s own template, and the CMS can only read it from the repo. Connect the site, then ingest one sample post.`
								: `Posts render into ${site.name}'s own template, and the repo isn't connected yet. Ask ${developer} to connect it.`
						}
						action={
							<RoleGate role={role} allow={CAN_ACT} fallback={<LockedAction label="Connect a site" reasons={["Only a developer or admin can connect repos."]} summary="developer only" />}>
								<Button variant="primary" icon="PlugsConnected" href={sitePath(slug, "/onboarding")}>
									Connect a site
								</Button>
							</RoleGate>
						}
					/>
				</Card>
			</>
		);

	const ingestCta = (label: string) => (
		<RoleGate role={role} allow={CAN_ACT} fallback={<LockedAction label={label} reasons={["Only a developer or admin can change the template."]} summary="developer only" />}>
			<Button variant="primary" icon="UploadSimple" href={sitePath(slug, "/templates/ingest")}>
				{label}
			</Button>
		</RoleGate>
	);

	const columns: IDataTableColumn<ITemplateManifest>[] = [
		{ key: "version", header: "Version", width: 90, render: (m) => <span className="font-display font-medium">v{m.version}</span> },
		{ key: "source", header: "Source", render: (m) => <span className="font-mono text-xs">{m.source}</span> },
		{ key: "output", header: "Output", render: (m) => <span className="whitespace-nowrap">{OUTPUT_LABEL[m.output]}</span> },
		{ key: "status", header: "Status", render: (m) => <Chip tone={STATUS[m.status].tone} size="sm">{STATUS[m.status].label}</Chip> },
		{ key: "by", header: "Confirmed by", render: (m) => m.confirmedBy ?? <span className="text-ink-4">Not yet</span> },
		{ key: "date", header: "Date", align: "end", render: (m) => (m.confirmedAt ? <span className="whitespace-nowrap">{fmtDate(m.confirmedAt)}</span> : <span className="text-ink-4">—</span>) },
	];

	if (!active)
		return (
			<>
				<PageHeader title="Templates" subtitle={pending ? pending.source : "No template yet"} />
				{pending && <PendingCallout manifest={pending} canManage={canManage} live={false} />}
				<Card className="w-full max-w-[720px]">
					<EmptyState
						icon="BracketsAngle"
						title="No template yet"
						body={`Upload one rendered blog post (HTML) or a ZIP with partials and CSS. Posts render into it exactly.${canManage ? "" : ` Ask ${developer} to ingest it.`}`}
						action={pending ? undefined : ingestCta("Ingest template")}
					/>
				</Card>
			</>
		);

	const { content, media } = summaryRows(active);
	const previewPost = pickPreviewPost(data.posts);
	const rows = [
		{ k: "Content region", v: <span className="font-mono text-xs">{active.mappings.find((m) => m.role === "content-region")?.selector ?? "—"}</span> },
		...[...content, ...media].map((r) => ({
			k: r.label,
			v: r.status === "absent" ? <span className="text-ink-4">{r.detail}</span> : <span className="font-mono text-xs">{r.selector}</span>,
		})),
		...handMapped(active).map((r) => ({ k: r.label ?? "Mapped", v: <span className="font-mono text-xs">{r.selector}</span> })),
	];

	return (
		<>
			<TopBarCta>{ingestCta("Re-ingest template")}</TopBarCta>
			<PageHeader title="Templates" subtitle={`${active.source} · ${OUTPUT_LABEL[active.output]}`} />
			{pending && <PendingCallout manifest={pending} canManage={canManage} live />}
			<div className="grid shrink-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
				<Card className="flex flex-col gap-4">
					<CardHeader
						icon="BracketsAngle"
						title={`Manifest v${active.version}`}
						meta={
							active.confirmedBy ? (
								<>
									<span className="max-sm:hidden">Confirmed by </span>
									{active.confirmedBy} · {active.confirmedAt ? fmtDate(active.confirmedAt) : ""}
								</>
							) : undefined
						}
						action={
							<Chip tone="pass" size="sm" icon="CheckCircle">
								Current
							</Chip>
						}
					/>
					<KeyValue rows={rows} />
					<RoleGate role={role} allow={CAN_ACT} action="change the output format">
						<OutputFormatPicker value={active.output} onChange={(v) => actions.setOutputFormat(active.id, v)} />
					</RoleGate>
					{previewPost && (
						<Button variant="secondary" size="sm" icon="Eye" href={previewPath(slug, previewPost.id)} className="self-start">
							Preview on site · {previewPost.title}
						</Button>
					)}
					<SourceNote icon="Stack">Versioned. A redesign means re-ingesting, not rebuilding.</SourceNote>
				</Card>
				<div className="flex min-w-0 flex-col gap-4">
					{held.length > 0 && (
						<Callout
							tone="block"
							title={`${held.length} post${held.length > 1 ? "s" : ""} held · ${held[0]!.title} needs a table`}
							action={
								<RoleGate role={role} allow={CAN_ACT} fallback={<span className="text-sm text-ink-3">Ask {developer} to extend the template.</span>}>
									<Button variant="secondary" size="sm" icon="UploadSimple" href={sitePath(slug, "/templates/ingest")}>
										Extend template
									</Button>
								</RoleGate>
							}
						>
							The {site.name} template has no table. Posts that need one wait until the template is extended.{" "}
							{held.map((p, i) => (
								<span key={p.id}>
									{i > 0 && " · "}
									<Link href={sitePath(slug, `/posts/${p.id}`)} className="underline underline-offset-2">
										Open {p.title}
									</Link>
								</span>
							))}
						</Callout>
					)}
					<Card className="flex flex-col gap-3">
						<CardHeader icon="Stack" title="Versions" meta={`${versions.length} manifest${versions.length === 1 ? "" : "s"}`} />
						<div className="max-md:hidden">
							<DataTable columns={columns} rows={versions} dense caption="Template manifest versions" />
						</div>
						<ol className="flex flex-col md:hidden">
							{versions.map((m) => (
								<li key={m.id} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
									<span className="font-display text-base font-medium">v{m.version}</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-mono text-xs text-ink">{m.source}</span>
										<span className="text-xs text-ink-4">
											{OUTPUT_LABEL[m.output]} · {m.confirmedBy ? `${m.confirmedBy} · ${m.confirmedAt ? fmtDate(m.confirmedAt) : ""}` : "Not confirmed"}
										</span>
									</span>
									<Chip tone={STATUS[m.status].tone} size="sm">
										{STATUS[m.status].label}
									</Chip>
								</li>
							))}
						</ol>
					</Card>
				</div>
			</div>
		</>
	);
}

function PendingCallout({ manifest: m, canManage, live }: { manifest: ITemplateManifest; canManage: boolean; live: boolean }) {
	const { slug } = useSite();
	const open = openItems(m);
	const parsing = m.status === "parsing";
	return (
		<Callout
			tone={parsing ? "agent" : "human"}
			icon={parsing ? "CircleNotch" : "WarningCircle"}
			className="shrink-0"
			title={parsing ? `Parsing v${m.version} · ${m.source}` : `Manifest v${m.version} needs confirmation · ${open.length ? `${open.length} item${open.length > 1 ? "s" : ""} to map` : "ready to confirm"}`}
			action={
				<Button variant="secondary" size="sm" icon="ArrowRight" href={sitePath(slug, "/templates/ingest")}>
					{canManage ? "Review and confirm" : "View"}
				</Button>
			}
		>
			{parsing ? "The parser is reading the upload." : m.source + "."}{" "}
			{live ? `The current manifest stays live until a developer confirms v${m.version}.` : `Nothing renders until a developer confirms v${m.version}.`}
		</Callout>
	);
}
