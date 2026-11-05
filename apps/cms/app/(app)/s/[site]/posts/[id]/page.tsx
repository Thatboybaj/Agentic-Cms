import { Suspense } from "react";
import { PostEditor } from "@/features/editor";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<Suspense>
			<PostEditor id={id} />
		</Suspense>
	);
}
