import { Suspense } from "react";
import { SeoDashboard, SeoSkeleton } from "@/features/seo";

export default function Page() {
	return (
		<Suspense fallback={<SeoSkeleton />}>
			<SeoDashboard />
		</Suspense>
	);
}
