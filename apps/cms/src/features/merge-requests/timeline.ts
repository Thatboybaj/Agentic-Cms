import type { ITimelineItem } from "@/ds";
import { addHours, now } from "@/lib/clock";
import { fmtAgo, fmtDateTime, mrRef, postUrl } from "@/lib/logic";
import type { IMergeRequest, IPost, ISite, ISiteData } from "@/lib/types";

/** Stable 7-char merge commit for the demo (the host would report the real one). */
export function mergeSha(mr: IMergeRequest): string {
	let h = 2166136261;
	for (const ch of `${mr.id}:${mr.mergedAt ?? ""}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
	return h.toString(16).padStart(8, "0").slice(0, 7);
}

/** When the current CI run started: the latest rebase, else when the MR opened. */
export function ciSince(mr: IMergeRequest, data: ISiteData): string {
	const tag = `${mrRef(mr)} `;
	const rebases = data.audit.filter((a) => a.target.startsWith(tag) && a.action === "rebased and re-rendered").map((a) => a.at);
	return [mr.openedAt, ...rebases].sort().pop()!;
}

type TEvent = ITimelineItem & { at: number };

/** Post timeline for one MR: approval → opened → CI / conflict / rebase → merged → Live → indexing → KAS. */
export function mrTimeline(mr: IMergeRequest, post: IPost | undefined, data: ISiteData, site: ISite): ITimelineItem[] {
	const t = (iso: string) => new Date(iso).getTime();
	const nowMs = now().getTime();
	const out: TEvent[] = [];
	const tag = `${mrRef(mr)} `;

	const approval = post ? [...data.audit].reverse().find((a) => a.action === "approved" && a.target === post.title && t(a.at) <= t(mr.openedAt) + 60000) : undefined;
	if (approval) out.push({ id: "approved", icon: "SealCheck", tone: "pass", title: `Approved by ${approval.actor}`, meta: fmtDateTime(approval.at), body: approval.detail, at: t(approval.at) - 1 });

	out.push({ id: "opened", icon: "GitPullRequest", tone: "neutral", title: `MR !${mr.number} opened · ${mr.branch} → ${mr.base}`, meta: `${fmtDateTime(mr.openedAt)}${mr.manifestVersion ? ` · manifest v${mr.manifestVersion}` : ""}`, at: t(mr.openedAt) });

	for (const a of data.audit.filter((x) => x.target.startsWith(tag) && x.action === "rebased and re-rendered")) {
		out.push({ id: a.id, icon: "ArrowsClockwise", tone: "agent", title: `Rebased on ${mr.base} · re-rendered with manifest v${mr.manifestVersion ?? "?"}`, meta: `${fmtDateTime(a.at)} · ${a.actor}`, at: t(a.at) });
	}

	if (mr.status === "conflict") {
		out.push({ id: "conflict", icon: "Warning", tone: "block", title: "Conflict with the base branch · public/sitemap.xml", meta: "Never auto-merged · a developer rebases", body: mr.conflictDetail, at: nowMs });
	} else if (mr.status === "open") {
		if (mr.ci === "pending") out.push({ id: "ci", icon: "CircleNotch", tone: "agent", title: "Checks running", meta: `Waiting on the repo's checks · ${fmtAgo(ciSince(mr, data)).replace(" ago", "")}`, at: nowMs });
		if (mr.ci === "failing") out.push({ id: "ci", icon: "XCircle", tone: "block", title: "Checks failing", meta: "Reported by the repo's CI", body: mr.ciDetail, at: nowMs });
		if (mr.ci === "passing") out.push({ id: "ci", icon: "CheckCircle", tone: "pass", title: "Checks passing", meta: "Ready for a developer to merge", at: nowMs });
		if (mr.ci === "none") out.push({ id: "ci", icon: "Minus", tone: "neutral", title: "No checks configured", meta: "The repo runs no CI on this branch", at: nowMs });
	}

	if (mr.status === "merged" && mr.mergedAt) {
		const m = t(mr.mergedAt);
		out.push({ id: "ci", icon: "CheckCircle", tone: "pass", title: "Checks passing", meta: "Before merge", at: m - 2 });
		out.push({ id: "merged", icon: "GitMerge", tone: "pass", title: `Merged ${mergeSha(mr)}${mr.mergedBy ? ` by ${mr.mergedBy}` : ""}`, meta: fmtDateTime(mr.mergedAt), at: m });
		if (post && (post.state === "live" || post.state === "decaying")) {
			out.push({ id: "live", icon: "Globe", tone: "pass", title: "Live", meta: `${site.domain}${postUrl(post)}`, at: m + 1 });
		}
		out.push(
			site.searchConsole === "connected"
				? { id: "index", icon: "MagnifyingGlass", tone: "agent", title: "Submitted for indexing · Search Console", meta: fmtDateTime(mr.mergedAt), at: m + 2 }
				: { id: "index", icon: "Plugs", tone: "neutral", title: "Indexing not requested", meta: "Search Console not connected", at: m + 2 },
		);
		const run = data.runs.find((r) => r.kind === "kas-recalc" && r.postId === mr.postId && t(r.startedAt) >= m);
		const kasAt = run?.startedAt ?? addHours(mr.mergedAt, 24);
		const pending = t(kasAt) > nowMs || run?.status === "queued";
		out.push(
			pending
				? { id: "kas", icon: "ChartLineUp", tone: "agent", title: "KAS recalculation scheduled in 24 h", meta: fmtDateTime(kasAt), at: m + 3 }
				: { id: "kas", icon: "ChartLineUp", tone: "pass", title: "KAS recalculated · 24 h after merge", meta: fmtDateTime(kasAt), at: m + 3 },
		);
	}

	if (mr.status === "closed") out.push({ id: "closed", icon: "X", tone: "neutral", title: "Closed without merging", meta: "Post back to In review", at: nowMs });

	return out.sort((a, b) => a.at - b.at).map(({ at: _at, ...it }) => it);
}

/** The two sides of a sitemap conflict: what main has now vs what the branch wrote. */
export function sitemapSides(mr: IMergeRequest, post: IPost | undefined, site: ISite, livePosts: IPost[]) {
	const host = `https://${site.domain}`;
	const url = (path: string, day: string) => `  <url><loc>${host}${path}</loc><lastmod>${day}</lastmod></url>`;
	const shared = livePosts.slice(0, 3).map((p) => url(postUrl(p), "2026-09-18"));
	const head = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
	const mainOnly = [url("/locations/ikoyi", "2026-09-24"), url("/services/emergency-dentist", "2026-09-24")];
	const branchLine = url(post ? postUrl(post) : `/blog/${mr.branch.split("/").pop()}`, "2026-09-21");
	return {
		main: [...head, ...shared, ...mainOnly, "</urlset>"].join("\n"),
		branch: [...head, ...shared, branchLine, "</urlset>"].join("\n"),
		mainNeedles: ["url.ikoyi", "url.emergency-dentist"],
		branchNeedle: `url.${(post?.slug ?? mr.branch.split("/").pop() ?? "").replace(/\./g, "")}`,
	};
}
