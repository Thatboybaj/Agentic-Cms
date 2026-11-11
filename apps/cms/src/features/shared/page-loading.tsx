"use client";
// Shown while the first Convex bundle loads, so pages don't flash an empty or "not found" state. With the backend off
// `loading` is always false and this never renders.
import { Card, Skeleton } from "@/ds";

export function PageLoading({ rows = 3 }: { rows?: number }) {
	return (
		<Card variant="solid" padding="lg" className="flex flex-col gap-3 rounded-3xl" aria-busy="true" aria-label="Loading">
			<Skeleton className="h-6 w-40" />
			{Array.from({ length: rows }, (_, i) => (
				<Skeleton key={i} className="h-14 w-full" radius={16} />
			))}
		</Card>
	);
}
