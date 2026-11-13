"use client";
// "Update live post" (every site): re-publishes a live post's current content through the normal ship flow (render →
// PR → CI → merge), e.g. after renderer fixes or an author change. Manual only (prd-rubrics-and-authors RA3).
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button, Dialog, RoleGate, SourceNote, TextField } from "@/ds";
import { SITE_ON_CONVEX, useSiteCms } from "@/features/shared/site-source";
import { PERMISSIONS } from "@/lib/logic";
import { useSite, useToast } from "@/lib/store";
import type { IPost } from "@/lib/types";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

function Live({ post }: { post: IPost }) {
	const { slug } = useSite();
	const { site, role } = useSiteCms();
	const toast = useToast();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const republish = useMutation(api.posts.republishLive);
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("Template and renderer fixes");
	const [busy, setBusy] = useState(false);
	const auto = !!site.publishing?.autopost && !!site.publishing?.autoMergeOnGreenCi;
	return (
		<RoleGate role={role} allow={PERMISSIONS["post.approve"]} action="update live posts">
			<Button variant="secondary" size="sm" icon="ArrowsClockwise" onClick={() => setOpen(true)}>
				Update live post
			</Button>
			<Dialog
				open={open}
				onClose={() => setOpen(false)}
				title="Update the live post"
				footer={
					<>
						<Button variant="ghost" onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							icon="ArrowsClockwise"
							loading={busy}
							disabled={!siteId || reason.trim().length < 3}
							onClick={async () => {
								setBusy(true);
								const r = (await republish({ siteId: siteId!, postId: post.id as Id<"posts">, reason })) as { ok: boolean; reason?: string };
								setBusy(false);
								toast(r.ok ? { text: "Re-publishing · a merge request opens with the current content", tone: "agent" } : { text: r.reason ?? "Couldn't update", tone: "block" });
								if (r.ok) setOpen(false);
							}}
						>
							Update
						</Button>
					</>
				}
			>
				<div className="flex flex-col gap-3">
					<p className="text-md text-ink-2">Renders the post again with its current content, byline and the site's template, and opens a merge request. No AI model runs.</p>
					<TextField label="What this update changes" value={reason} onChange={setReason} />
					<SourceNote icon="Info">{auto ? "This site auto-merges on green CI: the update goes live once checks pass." : "A developer merges the request; it goes live then."}</SourceNote>
				</div>
			</Dialog>
		</RoleGate>
	);
}

export function UpdateLiveButton({ post }: { post: IPost }) {
	if (!SITE_ON_CONVEX || post.state !== "live") return null;
	return <Live post={post} />;
}
