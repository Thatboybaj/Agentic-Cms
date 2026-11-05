"use client";
// Loading geometry for /settings (tab row + two cards).
import { Card, Skeleton } from "@/ds";

export function SettingsSkeleton() {
	return (
		<div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-4">
			<Skeleton className="h-8 w-40" />
			<Skeleton className="h-11 w-full max-w-3xl" radius={22} />
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
				<Card className="flex flex-col gap-3">
					{Array.from({ length: 5 }, (_, i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</Card>
				<Card className="flex flex-col gap-3">
					{Array.from({ length: 3 }, (_, i) => (
						<Skeleton key={i} className="h-16 w-full" />
					))}
				</Card>
			</div>
		</div>
	);
}
