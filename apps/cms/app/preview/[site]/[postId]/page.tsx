import type { Metadata } from "next";
import { Suspense } from "react";
import { PreviewPage } from "@/features/preview";

export const metadata: Metadata = { title: "Post preview · Agentic CMS", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ site: string; postId: string }> }) {
	const { site, postId } = await params;
	return (
		<Suspense fallback={null}>
			<PreviewPage siteSlug={decodeURIComponent(site)} postId={postId} />
		</Suspense>
	);
}
