"use client";
import { RouteError } from "@/features/runs/states";

export default function Error({ reset }: { error: Error; reset: () => void }) {
	return <RouteError thing="runs and the ledger" onRetry={reset} />;
}
