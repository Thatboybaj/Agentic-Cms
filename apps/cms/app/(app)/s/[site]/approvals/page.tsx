import { Suspense } from "react";
import { Skeleton } from "@/ds";
import { Approvals } from "@/features/approvals";

function Loading() {
	return (
		<div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col" aria-busy="true" aria-label="Loading approvals">
			<div className="flex flex-col gap-2.5 lg:w-[290px]">
				<Skeleton className="h-24" radius={22} />
				<Skeleton className="h-24" radius={22} />
				<Skeleton className="h-24" radius={22} />
			</div>
			<Skeleton className="min-h-96 flex-1" radius={28} />
			<Skeleton className="min-h-64 lg:w-[380px]" radius={24} />
		</div>
	);
}

export default function Page() {
	return (
		<Suspense fallback={<Loading />}>
			<Approvals />
		</Suspense>
	);
}
