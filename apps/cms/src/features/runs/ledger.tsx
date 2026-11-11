"use client";
// Human ledger (S15 region 4, F11): items age automatically — Overdue at 7 days, named Blocker at 14 with the downstream cost.
import { useState } from "react";
import { Button, Card, CardHeader, EmptyState, Icon, LedgerItem, PaginationDots, RoleGate, SourceNote } from "@/ds";
import { LEDGER_LABEL, PERMISSIONS } from "@/lib/logic";
import { useSite } from "@/lib/store";
import { useSiteCms, useSiteLedger } from "@/features/shared/site-source";
import { sitePath } from "@/lib/routes";

const PAGE = 4;

export function LedgerCard() {
	const { slug } = useSite();
	const { role, actions, can, why } = useSiteCms();
	const items = useSiteLedger();
	const [page, setPage] = useState(0);
	const pages = Math.max(1, Math.ceil(items.length / PAGE));
	const p = Math.min(page, pages - 1);
	const rows = items.slice(p * PAGE, p * PAGE + PAGE);
	const blockers = items.filter((i) => i.status === "blocker").length;
	const overdue = items.filter((i) => i.status === "overdue").length;

	return (
		<Card as="section" id="ledger" aria-label="Human ledger" className="flex scroll-mt-4 flex-col gap-3">
			<CardHeader icon="Hand" title="Human ledger" meta={items.length ? `${items.length} open${blockers ? ` · ${blockers} ${LEDGER_LABEL.blocker.toLowerCase()}` : ""}${overdue ? ` · ${overdue} overdue` : ""}` : "Clear"} href={sitePath(slug, "/seo/reports")} />
			<p className="text-xs leading-body text-ink-3">Overdue at 7 days, named blocker at 14 with the downstream cost. The ledger also appears in every bi-weekly report, so the client sees it too.</p>
			{items.length === 0 ? (
				<EmptyState icon="CheckCircle" title="No human items open · nice." body="Items land here when a slot is marked human-only, a QA sweep lists a task, a prune list waits for sign-off or a draft waits in review." />
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map((item) => (
						<li key={item.id} className="flex flex-col gap-1">
							<LedgerItem item={{ ...item, ageDays: item.age }} />
							<div className="flex items-center justify-end gap-1">
								{item.postId && (
									<Button variant="ghost" size="sm" icon="ArrowUpRight" href={sitePath(slug, item.slotId ? `/posts/${item.postId}/assets?slot=${item.slotId}` : `/posts/${item.postId}`)}>
										{item.slotId ? "Open slot" : "Open post"}
									</Button>
								)}
								<RoleGate role={role} allow={PERMISSIONS["post.edit"]} action="resolve ledger items">
									<Button variant="ghost" size="sm" icon="Check" onClick={() => actions.resolveLedgerItem(item.id)}>
										Resolve
									</Button>
								</RoleGate>
							</div>
						</li>
					))}
				</ul>
			)}
			{!can("post.edit") && items.length > 0 && (
				<span className="flex items-center gap-1.5 text-xs text-ink-3">
					<Icon name="LockSimple" size={12} />
					{why("post.edit")} · the ledger stays visible so accountability is shared.
				</span>
			)}
			<div className="flex items-center gap-2">
				<SourceNote icon="Timer">Ages from creation · no snooze</SourceNote>
				{pages > 1 && <PaginationDots count={pages} index={p} onChange={setPage} className="ms-auto" />}
			</div>
		</Card>
	);
}
