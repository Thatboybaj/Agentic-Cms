"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button, Callout, DataGap, OriginTag, RoleGate, Sheet, SourceCodeFrame, VersionList } from "@/ds";
import { fmtDateTime, fmtInt } from "@/lib/logic";
import { useCms } from "@/lib/store";
import type { IPost } from "@/lib/types";
import { clockAfter, diffSource, latestVersion, MARK_ADDED, MARK_REMOVED } from "./util";

export interface IVersionsSheetProps {
	post: IPost;
	open: boolean;
	onClose: () => void;
	initialId?: string | null;
}

/** S06 — restore or diff any version against the current one. Restoring creates a new version; history is never rewritten. */
export function VersionsSheet({ post, open, onClose, initialId }: IVersionsSheetProps) {
	const { actions, role } = useCms();
	const cur = latestVersion(post);
	const sorted = useMemo(() => [...post.versions].sort((a, b) => b.n - a.n), [post.versions]);
	const fallback = sorted.find((v) => v.id !== cur?.id)?.id ?? null;
	const [picked, setPicked] = useState<string | null>(initialId ?? null);
	const cmpId = picked && post.versions.some((v) => v.id === picked && v.id !== cur?.id) ? picked : fallback;
	const cmp = post.versions.find((v) => v.id === cmpId);
	const mrOpen = post.state === "mr-open";

	const diff = useMemo(() => {
		if (!cmp?.blocks) return null;
		const left = diffSource(cmp.blocks, post.blocks, MARK_REMOVED, cmp.seoTitle ?? post.seoTitle, post.seoTitle);
		const right = diffSource(post.blocks, cmp.blocks, MARK_ADDED, post.seoTitle, cmp.seoTitle ?? post.seoTitle);
		return { left, right };
	}, [cmp, post.blocks, post.seoTitle]);

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={`Versions · ${post.title}`}
			width={920}
			footer={
				cmp ? (
					<>
						<span className="me-auto text-sm text-ink-3">Restoring creates v{(cur?.n ?? 0) + 1} · Human edit “Restored v{cmp.n}”</span>
						<RoleGate role={role} allow={["specialist", "admin"]} action="restore versions">
							<Button
								variant="primary"
								icon="ArrowUUpLeft"
								disabled={!cmp.blocks}
								onClick={() => {
									const r = actions.restoreVersion(post.id, cmp.id);
									if (r.ok) onClose();
								}}
							>
								Restore v{cmp.n}
							</Button>
						</RoleGate>
					</>
				) : undefined
			}
		>
			<div className="flex flex-col gap-5">
				{mrOpen && (
					<Callout tone="human" icon="Hand" title="Restoring changes an approved post.">
						It will need a new approval, and the open MR updates after it.
					</Callout>
				)}
				<section aria-label="Version list" className="flex flex-col gap-2">
					<VersionList
						versions={sorted}
						currentId={cur?.id ?? ""}
						now={clockAfter(sorted.map((v) => v.at))}
						onDiff={(id) => setPicked(id)}
						onRestore={role === "specialist" || role === "admin" ? (id) => actions.restoreVersion(post.id, id) : undefined}
					/>
					{sorted.length <= 1 && <p className="px-2 text-sm text-ink-3">Edits appear here as versions.</p>}
				</section>

				{!cmp ? (
					<DataGap label="Nothing to compare yet" reason={post.state === "live" ? "Only one version exists." : "Not live yet — nothing to compare. Edits and accepted agent diffs create new versions."} />
				) : !diff ? (
					<DataGap label={`v${cmp.n} can only be viewed`} reason="This version predates stored content, so it can't be diffed or restored." />
				) : (
					<section aria-label={`Diff of v${cmp.n} against v${cur?.n}`} className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
							<span className="font-display text-base text-ink">
								v{cmp.n} vs v{cur?.n} · current
							</span>
							<span>
								{diff.right.changed} block{diff.right.changed === 1 ? "" : "s"} differ · MDX as committed
							</span>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<Pane title={`v${cmp.n}`} meta={`${cmp.actor} · ${fmtDateTime(cmp.at)} · ${fmtInt(cmp.words)} words`} origin={cmp.origin}>
								<SourceCodeFrame mode="source" html={diff.left.source} highlights={[{ selector: `x.${MARK_REMOVED}`, label: "removed", tone: "block" }]} className="max-h-[52vh]" />
							</Pane>
							{cur && (
								<Pane title={`v${cur.n} · current`} meta={`${cur.actor} · ${fmtDateTime(cur.at)} · ${fmtInt(post.words)} words`} origin={cur.origin}>
									<SourceCodeFrame mode="source" html={diff.right.source} highlights={[{ selector: `x.${MARK_ADDED}`, label: "added", tone: "pass" }]} className="max-h-[52vh]" />
								</Pane>
							)}
						</div>
					</section>
				)}
			</div>
		</Sheet>
	);
}

function Pane({ title, meta, origin, children }: { title: string; meta: string; origin: IPost["versions"][number]["origin"]; children: ReactNode }) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-display text-md">{title}</span>
				<OriginTag origin={origin} />
			</div>
			<span className="truncate text-xs text-ink-3">{meta}</span>
			{children}
		</div>
	);
}
