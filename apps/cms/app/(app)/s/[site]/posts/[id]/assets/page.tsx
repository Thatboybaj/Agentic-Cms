import { Suspense } from "react";
import { PostAssets } from "@/features/assets";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return (
		<Suspense>
			<PostAssets id={id} />
		</Suspense>
	);
}
