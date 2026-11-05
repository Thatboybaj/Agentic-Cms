"use client";
// O2 — Notifications, rendered as a section on /runs anchored at #notifications (the top-bar bell links here).
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { Button, Card, CardHeader, DataTable, Dot, EmptyState, IconButton, PaginationDots, type IDataTableColumn } from "@/ds";
import { fmtAgo } from "@/lib/logic";
import { useCms } from "@/lib/store";
import type { INotification } from "@/lib/types";

const PAGE = 5;

export function NotificationsCard() {
	const { data, actions } = useCms();
	const router = useRouter();
	const [page, setPage] = useState(0);
	const list = useMemo(() => [...data.notifications].sort((a, b) => b.at.localeCompare(a.at)), [data.notifications]);
	const unread = list.filter((n) => !n.read).length;
	const pages = Math.max(1, Math.ceil(list.length / PAGE));
	const p = Math.min(page, pages - 1);
	const rows = list.slice(p * PAGE, p * PAGE + PAGE);

	const open = (n: INotification) => {
		actions.markNotificationRead(n.id);
		if (n.href) router.push(n.href);
	};
	const markRead = (e: MouseEvent, n: INotification) => {
		e.stopPropagation();
		actions.markNotificationRead(n.id);
	};

	const readButton = (n: INotification) =>
		n.read ? <span className="text-xs text-ink-4">Read</span> : <IconButton icon="Check" label={`Mark "${n.title}" read`} variant="ghost" size="sm" onClick={(e) => markRead(e, n)} />;

	const columns: IDataTableColumn<INotification>[] = [
		{
			key: "what",
			header: "Notification",
			render: (n) => (
				<span className="flex min-w-0 items-start gap-2.5 py-2">
					<Dot tone={n.tone} label={n.read ? undefined : "Unread"} className="mt-1.5" />
					<span className="flex min-w-0 flex-col gap-0.5">
						<span className={n.read ? "font-display text-md text-ink-3" : "font-display text-md"}>{n.title}</span>
						<span className="text-xs text-ink-3">{n.body}</span>
					</span>
				</span>
			),
		},
		{ key: "at", header: "When", align: "end", width: 110, render: (n) => <span className="whitespace-nowrap text-xs text-ink-3">{fmtAgo(n.at)}</span> },
		{ key: "read", header: <span className="sr-only">Read state</span>, align: "end", width: 64, render: readButton },
	];

	const empty = <EmptyState icon="BellSimple" title="You're all caught up" body="Approval requests, blockers, CI failures and refused runs land here." />;

	return (
		<Card as="section" id="notifications" aria-label="Notifications" className="flex scroll-mt-4 flex-col gap-3">
			<CardHeader
				icon="BellSimple"
				title="Notifications"
				meta={unread ? `${unread} unread` : "All read"}
				action={
					<Button variant="ghost" size="sm" icon="Check" onClick={() => actions.markAllNotificationsRead()} disabled={unread === 0} title={unread === 0 ? "Nothing unread" : undefined}>
						Mark all read
					</Button>
				}
			/>
			<div className="max-md:hidden">
				<DataTable dense columns={columns} rows={rows} onRowClick={open} caption="Notifications" empty={empty} />
			</div>
			<ul className="flex flex-col md:hidden">
				{rows.length === 0
					? empty
					: rows.map((n) => (
							<li key={n.id} className="flex items-start gap-2 border-b border-line py-2.5 last:border-b-0">
								<button type="button" onClick={() => open(n)} className="press flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-start">
									<Dot tone={n.tone} label={n.read ? undefined : "Unread"} className="mt-1.5" />
									<span className="flex min-w-0 flex-col gap-0.5">
										<span className={n.read ? "font-display text-md text-ink-3" : "font-display text-md"}>{n.title}</span>
										<span className="text-xs text-ink-3">{n.body}</span>
										<span className="text-xs text-ink-4">{fmtAgo(n.at)}</span>
									</span>
								</button>
								{readButton(n)}
							</li>
						))}
			</ul>
			{pages > 1 && <PaginationDots count={pages} index={p} onChange={setPage} className="self-end" />}
		</Card>
	);
}
