import { Suspense } from "react";
import { PostEditor } from "@/features/editor";

/** S06 — the versions Sheet opens over the editor so closing it lands back on the draft. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<Suspense>
			<PostEditor id={id} versions />
		</Suspense>
	);
}
