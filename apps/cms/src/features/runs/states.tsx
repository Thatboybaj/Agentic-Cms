"use client";
// Loading + error states for /runs (Skeleton in the loaded geometry; Callout block + Try again).
import { Button, Callout, Card, Skeleton } from "@/ds";

export function RunsSkeleton() {
	return (
		<div aria-busy="true" aria-label="Loading runs" className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
			<Skeleton className="h-8 w-56" />
			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
				<Card className="flex flex-col gap-3">
					<Skeleton className="h-6 w-40" />
					{Array.from({ length: 8 }, (_, i) => (
						<Skeleton key={i} className="h-12 w-full" />
					))}
				</Card>
				<div className="flex flex-col gap-3">
					<Skeleton className="h-36 w-full" radius={22} />
					<Skeleton className="h-36 w-full" radius={22} />
					<Card className="flex flex-col gap-3">
						{Array.from({ length: 3 }, (_, i) => (
							<Skeleton key={i} className="h-16 w-full" />
						))}
					</Card>
				</div>
			</div>
			<Card className="flex flex-col gap-3">
				{Array.from({ length: 6 }, (_, i) => (
					<Skeleton key={i} className="h-9 w-full" />
				))}
			</Card>
		</div>
	);
}

export function RouteError({ thing, onRetry }: { thing: string; onRetry: () => void }) {
	return (
		<Card>
			<Callout
				tone="block"
				title={`Couldn't load ${thing}.`}
				action={
					<Button variant="secondary" size="sm" icon="ArrowClockwise" onClick={onRetry}>
						Try again
					</Button>
				}
			>
				Nothing was changed. Other pages still work.
			</Callout>
		</Card>
	);
}
