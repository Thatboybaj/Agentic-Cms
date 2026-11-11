import { Suspense } from "react";
import { PostEditor } from "@/features/editor";
import { PostDetailProvider } from "@/features/shared/site-source";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<Suspense>
			<PostDetailProvider postId={decodeURIComponent(id)}>
				<PostEditor id={id} />
			</PostDetailProvider>
		</Suspense>
	);
}
