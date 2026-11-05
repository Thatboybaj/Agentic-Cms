"use client";
// /preview/<site>/<postId>?device=&manifest= — full-bleed "exactly what gets posted" view, outside the app shell.
// Mounts its own CmsProvider (persisted) so it reads the same localStorage data as the app.
import { useRouter, useSearchParams } from "next/navigation";
import { Button, IconButton, SegmentedControl, Skeleton } from "@/ds";
import { CmsProvider, SiteScope, usePost, useSite } from "@/lib/store";
import { DEVICE_OPTIONS, LivePreview, type TPreviewDevice } from "./LivePreview";
import { sitePath, previewPath } from "@/lib/routes";

const isDevice = (v: string | null): v is TPreviewDevice => v === "desktop" || v === "tablet" || v === "mobile";

export function PreviewPage({ siteSlug, postId }: { siteSlug: string; postId: string }) {
	return (
		<CmsProvider fallback={<PageSkeleton />}>
			<SiteScope slug={siteSlug}>
				<PreviewScreen postId={postId} />
			</SiteScope>
		</CmsProvider>
	);
}

function PreviewScreen({ postId }: { postId: string }) {
	const { slug } = useSite();
	const router = useRouter();
	const params = useSearchParams();
	const device: TPreviewDevice = isDevice(params.get("device")) ? (params.get("device") as TPreviewDevice) : "desktop";
	const manifestId = params.get("manifest") ?? undefined;
	const post = usePost(postId);
	const setDevice = (d: TPreviewDevice) => {
		const q = new URLSearchParams(params.toString());
		q.set("device", d);
		router.replace(`${previewPath(slug, postId)}?${q.toString()}`, { scroll: false });
	};

	return (
		<div className="flex h-dvh flex-col bg-canvas">
			<header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 py-2 sm:px-4">
				<IconButton icon="ArrowLeft" label="Back to editor" variant="outline" size="sm" href={sitePath(slug, `/posts/${postId}`)} />
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="text-2xs uppercase tracking-wide text-ink-4">Preview · exactly what gets posted</span>
					<h1 className="truncate font-display text-md font-medium text-ink">{post ? post.seoTitle || post.title : "Post preview"}</h1>
				</div>
				<SegmentedControl<TPreviewDevice> size="sm" label="Preview device" options={DEVICE_OPTIONS} value={device} onChange={setDevice} className="max-sm:hidden" />
				<Button
					variant="secondary"
					size="sm"
					icon="ArrowUpRight"
					className="max-sm:hidden"
					onClick={() => window.open(`${window.location.pathname}${window.location.search}`, "_blank", "noopener")}
				>
					Open in new tab
				</Button>
			</header>
			<div className="flex shrink-0 justify-center border-b border-line bg-surface px-3 py-2 sm:hidden">
				<SegmentedControl<TPreviewDevice> size="sm" label="Preview device" options={DEVICE_OPTIONS} value={device} onChange={setDevice} />
			</div>
			<LivePreview postId={postId} device={device} onDeviceChange={setDevice} manifestId={manifestId} className="min-h-0 flex-1" />
		</div>
	);
}

function PageSkeleton() {
	return (
		<div className="flex h-dvh flex-col gap-3 bg-canvas p-4" aria-busy="true" aria-label="Loading preview">
			<Skeleton className="h-10 w-full" />
			<Skeleton className="min-h-0 w-full flex-1" radius={16} />
		</div>
	);
}
