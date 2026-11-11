"use client";
// Settings · spend report + subscription (handoff 08), Convex only. Numbers come from the run ledger; nothing is
// estimated here. The checkout opens Polar when billing is configured on the deployment.
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { Button, Callout, Card, CardHeader, Chip, DataGap, KeyValue } from "@/ds";
import { RUN_META } from "@/lib/logic";
import type { TRunKind } from "@/lib/types";
import { useSite } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const usd = (n: number) => `$${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;

export function LiveSpendCard() {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const report = useQuery(api.billing.report, siteId ? { siteId } : "skip");
	const billing = useQuery(api.billing.status, siteId ? { siteId } : "skip");
	const checkout = useAction(api.billing.beginCheckout);
	const [error, setError] = useState<string | null>(null);
	if (!report || !billing) return null;
	return (
		<Card className="flex flex-col gap-3">
			<CardHeader icon="Receipt" title="Spend & billing" meta={report.month} />
			<KeyValue
				rows={[
					{ k: "Text", v: `${usd(report.text.spentUsd)} of ${usd(report.text.capUsd)}` },
					{ k: "Image", v: `${usd(report.image.spentUsd)} of ${usd(report.image.capUsd)}` },
					{ k: "Cost per shipped post", v: report.costPerShippedPost === null ? "No posts shipped this month" : usd(report.costPerShippedPost) },
				]}
			/>
			{report.byKind.length ? (
				<KeyValue rows={report.byKind.map((k) => ({ k: RUN_META[k.kind as TRunKind]?.label ?? k.kind, v: `${usd(k.usd)} · ${k.runs} run${k.runs === 1 ? "" : "s"}` }))} />
			) : (
				<DataGap label="No paid runs this month" reason="Spend appears here as runs settle." />
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Chip tone={billing.entitled ? "pass" : "block"} icon={billing.entitled ? "CheckCircle" : "Warning"}>
					{billing.enforced ? (billing.entitled ? `Subscription ${billing.subscription?.status ?? "active"}` : "No active subscription · agents paused") : "Billing not enforced on this deployment"}
				</Chip>
				{billing.enforced && !billing.entitled && (
					<Button
						variant="secondary"
						size="sm"
						icon="Receipt"
						disabled={!billing.checkoutConfigured}
						onClick={async () => {
							if (!siteId) return;
							setError(null);
							const r = await checkout({ siteId });
							if (!r.ok) return setError(r.reason);
							if (r.url) window.location.assign(r.url);
						}}
					>
						Subscribe
					</Button>
				)}
			</div>
			{error && <Callout tone="block" title="Checkout didn't open.">{error}</Callout>}
		</Card>
	);
}
