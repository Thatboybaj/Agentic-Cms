import { Suspense } from "react";
import { PlanFeature, PlanSkeleton } from "@/features/plan";

export default function PlanPage() {
	return (
		<Suspense fallback={<PlanSkeleton />}>
			<PlanFeature />
		</Suspense>
	);
}
