"use client";
// Idea approval (founder direction C10: only ideas need a person). Shared by the plan board, the mobile list and
// Approvals → Ideas. Approve is the human decision; under autopost the agents take the post from there.

import { clsx } from "clsx";
import { useState } from "react";
import { Button, Dialog, LockedAction, RoleGate, TextArea } from "@/ds";
import { estimateRun, fmtUsd, round2 } from "@/lib/logic";
import { usePlanCms } from "./source";
import type { IPost, ISite, ISiteData, TIdeaSource, TProvider } from "@/lib/types";

export const IDEA_SOURCE_LABEL: Record<TIdeaSource, string> = {
	"kas-gap": "KAS gap",
	"site-discovery": "Site discovery",
	"keyword-swarm": "Keyword swarm",
	manual: "Added by hand",
	refresh: "Refresh cycle",
};

const IMAGE_USD: Record<TProvider, number> = { higgsfield: 0.18, openai: 0.08, "open-source": 0.12, "web-source": 0, "inline-svg": 0, human: 0 };

/** Estimated cost to produce the post: the draft run plus the hero image (charts render from data for free). */
export function ideaCost(site: Pick<ISite, "cadenceTarget">, data: Pick<ISiteData, "routing">, post: IPost) {
	const strong = post.strongModel || post.contentType === "pillar" || post.contentType === "money-page";
	const text = estimateRun("post-generation", site, { strongModel: strong }).usd;
	const image = IMAGE_USD[data.routing.hero] ?? 0;
	return { text, image, usd: round2(text + image), strong };
}

/** Approve / Reject for one pending idea. Locked roles see the action with the reason, never a silent gap. */
export function IdeaApprovalRow({ post, className }: { post: IPost; className?: string }) {
	const { site, role, actions, why } = usePlanCms();
	const [rejecting, setRejecting] = useState(false);
	const auto = !!site.publishing?.autopost;
	return (
		<div className={clsx("flex flex-wrap items-center gap-2 px-1.5", className)}>
			<RoleGate role={role} allow={["specialist", "admin"]} action="approve ideas" fallback={<LockedAction size="sm" label="Approve idea" reasons={[why("idea.approve") ?? ""]} summary="Specialist" />}>
				<Button variant="secondary" size="sm" icon="SealCheck" onClick={() => actions.approveIdea(post.id)} title={auto ? "Approve · the agents draft, fill images and ship it" : "Approve · it becomes a brief for the writer"}>
					Approve idea
				</Button>
				<Button variant="ghost" size="sm" icon="X" onClick={() => setRejecting(true)}>
					Reject
				</Button>
			</RoleGate>
			<RejectIdeaDialog post={post} open={rejecting} onClose={() => setRejecting(false)} />
		</div>
	);
}

export function RejectIdeaDialog({ post, open, onClose }: { post: IPost; open: boolean; onClose: () => void }) {
	const { actions } = usePlanCms();
	const [note, setNote] = useState("");
	const submit = async () => {
		if ((await actions.rejectIdea(post.id, note)).ok) {
			setNote("");
			onClose();
		}
	};
	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="Reject this idea"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="X" disabled={note.trim().length < 3} onClick={submit}>
						Reject idea
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-sm text-ink-3">
					“{post.title}” leaves the plan. Your note goes to the audit trail and the keyword swarm won&apos;t suggest it again.
				</p>
				<TextArea label="Why not this idea?" value={note} onChange={setNote} rows={3} placeholder="e.g. We don't offer this treatment." hint={note.trim().length < 3 ? "A short note is required" : undefined} />
			</div>
		</Dialog>
	);
}

/** "Est. $1.98 to produce" line for idea rows. */
export function IdeaCostNote({ post }: { post: IPost }) {
	const { site, data } = usePlanCms();
	const c = ideaCost(site, data, post);
	return (
		<span className="tabular text-xs text-ink-3">
			Est. {fmtUsd(c.usd)} to produce · draft {fmtUsd(c.text)}
			{c.image > 0 ? ` + hero ${fmtUsd(c.image)}` : ""}
		</span>
	);
}
