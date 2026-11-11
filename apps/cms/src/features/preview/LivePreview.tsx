"use client";
// Live preview — the post rendered into the site's own template, exactly as it will be posted (PRD Module 4).
// Renders with `renderPost` (never invents markup) inside a sandboxed iframe at true device width, scaled to fit.
import clsx from "clsx";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Chip, DataGap, Icon, IconButton, SegmentedControl, Skeleton, Tooltip } from "@/ds";
import { nowIso } from "@/lib/clock";
import { useSiteManifest, useSiteCms, useSiteMrForPost, useSitePost, useSiteSlotsForPost } from "@/features/shared/site-source";
import type { IPost, ITemplateManifest } from "@/lib/types";
import { renderPost, type IRenderResult } from "@/render";
import { SiteFrame } from "./SiteFrame";
import { browserParse, useTemplateSource } from "./source";
import { sitePath, previewPath } from "@/lib/routes";

export type TPreviewDevice = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTH: Record<TPreviewDevice, number> = { desktop: 1280, tablet: 834, mobile: 390 };
export const DEVICE_OPTIONS = [
	{ value: "desktop" as const, label: "Desktop" },
	{ value: "tablet" as const, label: "Tablet" },
	{ value: "mobile" as const, label: "Mobile" },
];

export interface ILivePreviewProps {
	postId: string;
	device?: TPreviewDevice;
	/** Compact chrome for a pane inside the editor; adds an "Open full preview" link. */
	embedded?: boolean;
	/** Preview against a specific (e.g. not yet confirmed) manifest instead of the active one. */
	manifestId?: string;
	/** Controlled device: when set, the chrome hides its own device switch (the host renders one). */
	onDeviceChange?: (d: TPreviewDevice) => void;
	className?: string;
}

function useDebounced<T>(value: T, ms: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}

/** Open fact markers anchored in the post's current blocks. */
export function openFactCount(post: IPost): number {
	const anchored = new Set(post.blocks.flatMap((b) => b.factMarkerIds ?? []));
	return post.facts.filter((f) => f.status === "open" && anchored.has(f.id)).length;
}

export function LivePreview({ postId, device: deviceProp = "desktop", embedded = false, manifestId, onDeviceChange, className }: ILivePreviewProps) {
	const { site, data } = useSiteCms();
	const post = useSitePost(postId);
	const slots = useSiteSlotsForPost(postId);
	const active = useSiteManifest();
	const mr = useSiteMrForPost(postId);
	const manifest: ITemplateManifest | null = (manifestId ? data.manifests.find((m) => m.id === manifestId) : null) ?? active;
	const source = useTemplateSource(manifest, site);
	const [ownDevice, setOwnDevice] = useState<TPreviewDevice>(deviceProp);
	useEffect(() => setOwnDevice(deviceProp), [deviceProp]);
	const device = onDeviceChange ? deviceProp : ownDevice;
	const setDevice = onDeviceChange ?? setOwnDevice;
	const [renderedAt] = useState(() => nowIso());
	const publishedAt = mr?.mergedAt ?? renderedAt;
	const pillarName = data.pillars.find((p) => p.id === post?.pillarId)?.name;

	// Debounce edits (~250 ms) so typing doesn't reload the frame on every keystroke.
	const input = useDebounced(useMemo(() => ({ post, slots }), [post, slots]), 250);
	const result: (IRenderResult & { error?: string }) | null = useMemo(() => {
		if (!input.post || !manifest || source.status !== "ready" || !source.html) return null;
		try {
			return renderPost({
				manifestHtml: source.html,
				post: input.post,
				slots: input.slots,
				site,
				pillarName,
				mode: "preview",
				parseHtml: browserParse,
				mappings: manifest.mappings,
				baseHref: source.baseHref ?? undefined,
				rootHref: source.rootHref ?? null,
				publishedAt,
			});
		} catch (e) {
			return { html: "", held: [], warnings: [], url: "", stats: { blocks: 0, images: 0, placeholders: 0 }, error: e instanceof Error ? e.message : "Render failed" };
		}
	}, [input, manifest, source, site, pillarName, publishedAt]);

	if (!post)
		return (
			<Frame className={className}>
				<DataGap label="Post not found" reason="It may belong to another site, or was removed." action={<Button variant="secondary" size="sm" href={sitePath(site.slug, "/posts")} icon="ArrowLeft">All posts</Button>} className="m-4" />
			</Frame>
		);

	const noTemplate = !manifest || source.status === "none";
	const url = result?.url || `https://${site.domain}/blog/${post.slug}`;
	const facts = openFactCount(post);
	const held = result?.held ?? [];
	const fullHref = `${previewPath(site.slug, post.id, device)}${manifestId ? `&manifest=${manifestId}` : ""}`;

	const deviceSwitch = !onDeviceChange && (
		<SegmentedControl<TPreviewDevice> size="sm" label="Preview device" options={DEVICE_OPTIONS} value={device} onChange={setDevice} />
	);

	return (
		<Frame className={className}>
			<div className="flex shrink-0 flex-col gap-2 border-b border-line px-3.5 py-2.5" role="group" aria-label={`Live preview, manifest v${manifest?.version ?? "none"}`}>
				<div className="flex min-w-0 items-center gap-2">
					{deviceSwitch}
					<span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-sunken px-3 py-1.5" title={url}>
						<Icon name="LockSimple" size={12} className="shrink-0 text-ink-4" />
						<span className="truncate font-mono text-xs text-ink-2">{url.replace(/^https:\/\//, "")}</span>
					</span>
					{manifest && (
						<Chip size="sm" icon="BracketsAngle">
							manifest v{manifest.version}
							{manifest.status === "superseded" ? " · superseded" : manifest.status !== "confirmed" ? " · unconfirmed" : ""}
						</Chip>
					)}
					{embedded && <IconButton icon="ArrowUpRight" label="Open full preview" variant="outline" size="sm" href={fullHref} />}
				</div>
				{!noTemplate && (
					<div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
						{result && !result.error && held.length === 0 && (
							<Chip tone="pass" size="sm" icon="CheckCircle">
								Renders with site classes · no invented markup
							</Chip>
						)}
						{held.length > 0 && (
							<Chip tone="block" size="sm" icon="MinusCircle">
								Held: {held[0]!.reason.replace(/^Template has/, "template has")}
								{held.length > 1 && ` +${held.length - 1}`}
							</Chip>
						)}
						{facts > 0 && (
							<Chip tone="block" size="sm" icon="SealQuestion">
								{facts} open fact marker{facts === 1 ? "" : "s"} · ships as plain text
							</Chip>
						)}
						{result && result.stats.placeholders > 0 && (
							<Chip tone="human" size="sm" icon="ImagesSquare">
								{result.stats.placeholders} of {result.stats.images} image{result.stats.images === 1 ? "" : "s"} still placeholder{result.stats.placeholders === 1 ? "" : "s"}
							</Chip>
						)}
						{source.note && (
							<Tooltip label={source.note}>
								<Chip size="sm" icon="Info">
									{source.baseHref ? "Partial assets" : "No site CSS"}
								</Chip>
							</Tooltip>
						)}
					</div>
				)}
			</div>

			{noTemplate ? (
				<div className="flex flex-1 items-start p-4">
					<DataGap
						className="w-full"
						label="No template yet — upload one to see the real page"
						reason={`${site.name} has no confirmed template manifest, so there is nothing to render this post into. Posts never render into a generic layout.`}
						action={
							<Button variant="secondary" size="sm" icon="UploadSimple" href={sitePath(site.slug, "/templates/ingest")}>
								Upload template
							</Button>
						}
					/>
				</div>
			) : source.status === "error" || result?.error ? (
				<div className="flex flex-1 items-start p-4">
					<DataGap className="w-full" label={`Preview couldn't render with manifest v${manifest!.version}`} reason={result?.error ?? source.note ?? "The template could not be loaded."} />
				</div>
			) : !result ? (
				<PreviewSkeleton />
			) : (
				<div className="relative flex min-h-0 flex-1 flex-col bg-sunken-2">
					{held.length > 0 && (
						<div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-1.5">
							{held.map((h, i) => (
								<div key={i} role="status" className="pointer-events-auto flex items-center gap-2 self-start rounded-pill bg-block-soft px-3 py-1.5 font-display text-sm text-block-ink shadow-sm ring-1 ring-block/30">
									<Icon name="MinusCircle" size={14} />
									Held: {h.reason.replace(/^Template has/, "template has")}
									{h.blockId ? " · block omitted" : " · post can't ship until the template is extended"}
								</div>
							))}
						</div>
					)}
					<SiteFrame html={result.html} width={DEVICE_WIDTH[device]} device={device} title={`${site.name} ${device} preview of ${post.seoTitle || post.title}, manifest v${manifest!.version}`} className="flex-1" />
				</div>
			)}
		</Frame>
	);
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
	return <section className={clsx("flex min-h-0 flex-col overflow-hidden bg-surface", className)}>{children}</section>;
}

function PreviewSkeleton() {
	return (
		<div aria-busy="true" aria-label="Rendering preview" className="flex flex-1 flex-col gap-3 bg-sunken-2 p-6">
			<Skeleton className="h-8 w-full" />
			<div className="mx-auto flex w-full max-w-[620px] flex-col gap-3 pt-6">
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-9 w-4/5" />
				<Skeleton className="h-52 w-full" radius={14} />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-11/12" />
				<Skeleton className="h-3 w-3/4" />
			</div>
		</div>
	);
}
