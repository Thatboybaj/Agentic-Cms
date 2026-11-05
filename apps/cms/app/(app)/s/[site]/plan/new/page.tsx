import { Suspense } from "react";
import { PlanFeature, PlanSkeleton } from "@/features/plan";

/** S03 — the New idea sheet rendered over the plan (deep-linkable). */
export default function NewIdeaPage() {
	return (
		<Suspense fallback={<PlanSkeleton />}>
			<PlanFeature newIdea />
		</Suspense>
	);
}
