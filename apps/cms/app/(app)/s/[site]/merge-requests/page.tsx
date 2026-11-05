import { Suspense } from "react";
import { Skeleton } from "@/ds";
import { MergeRequests } from "@/features/merge-requests";

function Loading() {
	return (
		<div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Loading merge requests">
			<Skeleton className="h-10 w-72" />
			<Skeleton className="h-14" />
			<Skeleton className="h-14" />
			<Skeleton className="h-14" />
			<Skeleton className="h-14" />
		</div>
	);
}

export default function Page() {
	return (
		<Suspense fallback={<Loading />}>
			<MergeRequests />
		</Suspense>
	);
}
