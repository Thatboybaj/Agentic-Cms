import { Suspense } from "react";
import { SeoSkeleton } from "@/features/seo";
import { SeoReports } from "@/features/seo/reports";

export default function Page() {
	return (
		<Suspense fallback={<SeoSkeleton />}>
			<SeoReports />
		</Suspense>
	);
}
