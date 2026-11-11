"use client";
// Where the site pages (content plan, approvals, post editor) read and write. With the real backend on
// (BACKEND_ENABLED) it is Convex: one `plan.bundle` subscription for the site, mapped to the prototype's shapes by
// src/lib/adapter.ts toPlanData, plus `postEdits.detail` for the post a page focuses on (PostDetailProvider). Otherwise
// it is the demo store, exactly as before. BACKEND_ENABLED is a build-time constant, so each exported binding picks
// one implementation for the app's lifetime (hook order never changes).

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toPlanData } from "@/lib/adapter";
import { BACKEND_ENABLED } from "@/lib/backend";
import { evaluateGate, isPendingIdea, ledgerAge, ledgerStatus, lockReason, roleCan, type TPermission } from "@/lib/logic";
import {
	emptySiteData,
	useActiveManifest,
	useAutopostHold,
	useCms,
	useEditLock,
	useGate,
	useLedger,
	useMergeRequest,
	useMrForPost,
	usePendingIdeas,
	usePost,
	useSite,
	useSlotsForPost,
	useStats,
	useToast,
	type ICmsStats,
	type IGateView,
	type ILedgerView,
	type TResult,
} from "@/lib/store";
import type { ICandidate, IImageSlot, IJob, ILedgerItem, IMember, IMergeRequest, IPost, ISite, ISiteData, ITemplateManifest, TProvider, TRole, TRunKind, TSlotType } from "@/lib/types";
import { activeManifest, computeStats, type IEditLockHolder } from "@/lib/workspace";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TMaybeAsync<T> = T | Promise<T>;
type TLockResult = TResult | { ok: false; reason: string; heldBy?: unknown };

export interface ISiteActions {
	addIdea(topic: string, pillarId?: string): TMaybeAsync<TResult>;
	approveIdea(postId: string): TMaybeAsync<TResult>;
	rejectIdea(postId: string, note: string): TMaybeAsync<TResult>;
	promoteToBrief(postId: string): TMaybeAsync<TResult>;
	generateNow(postId: string): TMaybeAsync<TResult>;
	movePostToWeek(postId: string, week: number): TMaybeAsync<TResult>;
	runNow(kind: TRunKind): TMaybeAsync<TResult>;
	/** Convex: starts Google OAuth (redirects); demo: simulated connect. */
	connectSearchConsole(siteId: string): TMaybeAsync<TResult>;
	setBudget(kind: "text" | "image", capUsd: number): TMaybeAsync<TResult>;
	setModelRouting(task: keyof ISiteData["modelRouting"], tier: "fast" | "workhorse" | "strongest"): TMaybeAsync<TResult>;
	confirmManifest(manifestId: string): TMaybeAsync<TResult>;
	mapTemplateItem(manifestId: string, mappingId: string, role: ITemplateManifest["mappings"][number]["role"], label?: string): TMaybeAsync<TResult>;
	setOutputFormat(manifestId: string, output: ITemplateManifest["output"]): TMaybeAsync<TResult>;
	/** Convex only: upload the original .html/.zip; the server parse is authoritative. */
	ingestTemplateFile?: (file: File) => Promise<TResult>;
	toggleSchedule(kind: TRunKind): TMaybeAsync<TResult>;
	resolveLedgerItem(itemId: string): TMaybeAsync<TResult>;
	markNotificationRead(id: string): TMaybeAsync<TResult>;
	markAllNotificationsRead(): TMaybeAsync<TResult>;
	approve(postId: string, overrides?: Record<string, string>): TMaybeAsync<TResult>;
	sendBack(postId: string, note: string): TMaybeAsync<TResult>;
	shipNow(postId: string): TMaybeAsync<TResult>;
	editBlock(postId: string, blockId: string, text: string): TMaybeAsync<TResult>;
	editSeoTitle(postId: string, seoTitle: string): TMaybeAsync<TResult>;
	restoreVersion(postId: string, versionId: string): TMaybeAsync<TResult>;
	addFactSource(postId: string, markerId: string, url: string): TMaybeAsync<TResult>;
	rewriteFactWithout(postId: string, markerId: string): TMaybeAsync<TResult>;
	overrideCheck(postId: string, checkId: string, reason: string): TMaybeAsync<TResult>;
	fixCheck(postId: string, checkId: string): TMaybeAsync<TResult>;
	instructAgent(postId: string, instruction: string, blockId?: string): TMaybeAsync<TResult>;
	acceptSuggestion(postId: string, suggestionId: string): TMaybeAsync<TResult>;
	rejectSuggestion(postId: string, suggestionId: string): TMaybeAsync<TResult>;
	addComment(postId: string, text: string): TMaybeAsync<TResult>;
	startEditing(postId: string, opts?: { takeOver?: boolean }): TMaybeAsync<TLockResult>;
	stopEditing(postId: string): TMaybeAsync<TResult>;
	sendToReview(postId: string): TMaybeAsync<TResult>;
	pickCandidate(slotId: string, candidateId: string): TMaybeAsync<TResult>;
	useCandidate(slotId: string): TMaybeAsync<TResult>;
	markHumanOnly(slotId: string): TMaybeAsync<TResult>;
	regenerateSlot(slotId: string, prompt?: string, override?: "generate" | "diagram" | "source"): TMaybeAsync<TResult>;
	/** Convex only: upload the file itself (checked, converted and stored server-side). */
	uploadOwnFile?: (slotId: string, file: File) => Promise<TResult>;
	uploadOwn(slotId: string, fileName: string): TMaybeAsync<TResult>;
	setSlotCandidates(slotId: string, candidates: ICandidate[], meta?: { provider: TProvider; model?: string }): TMaybeAsync<TResult>;
	setRouting(slotType: TSlotType, provider: TProvider): TMaybeAsync<TResult>;
	mergeMr(mrId: string): TMaybeAsync<TResult>;
	rebaseMr(mrId: string): TMaybeAsync<TResult>;
}

export interface ISiteCms {
	data: ISiteData;
	site: ISite;
	role: TRole;
	me: IMember;
	state: { members: IMember[]; jobs: IJob[]; siteId: string };
	can: (p: TPermission) => boolean;
	why: (p: TPermission) => string | null;
	actions: ISiteActions;
	/** Convex only: true until the first bundle arrives. */
	loading: boolean;
	/** Convex only: who holds a fresh edit lock on the focused post (PostDetailProvider). */
	lockHolder?: IEditLockHolder | null;
}

// ─── Demo store ───────────────────────────────────────────────────────────────

function useStoreSite(): ISiteCms {
	const c = useCms();
	return useMemo(
		() => ({ data: c.data, site: c.site, role: c.role, me: c.me, state: { members: c.state.members, jobs: c.state.jobs, siteId: c.state.siteId }, can: c.can, why: c.why, actions: c.actions, loading: false }),
		[c],
	);
}

// ─── Convex: focused post detail ──────────────────────────────────────────────

const DetailCtx = createContext<{ postId: string; siteId?: Id<"sites"> } | null>(null);

/** Wrap a page that focuses one post (the editor). With the backend off it renders its children unchanged. */
export function PostDetailProvider({ postId, children }: { postId: string; children: ReactNode }) {
	return <DetailCtx.Provider value={{ postId }}>{children}</DetailCtx.Provider>;
}

const SESSION_KEY = "cms.editSession";
function sessionId(): string {
	try {
		let s = sessionStorage.getItem(SESSION_KEY);
		if (!s) {
			s = Math.random().toString(36).slice(2);
			sessionStorage.setItem(SESSION_KEY, s);
		}
		return s;
	} catch {
		return "tab";
	}
}

// ─── Convex: site ─────────────────────────────────────────────────────────────

const asId = <T extends "posts" | "pillars" | "factMarkers" | "suggestions" | "postVersions" | "imageSlots" | "candidates" | "mergeRequests">(id: string) => id as Id<T>;
const reasonOf = (e: unknown) => (e instanceof ConvexError ? String((e.data as { reason?: string })?.reason ?? "Not allowed") : "Couldn't reach the server. Try again.");

function useLiveSite(): ISiteCms {
	const fallback = useCms(); // the demo store's copy of this site, shown only while the first bundle loads
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const bundle = useQuery(api.plan.bundle, siteId ? { siteId } : "skip");
	const focus = useContext(DetailCtx);
	const focusId = focus && bundle?.posts.some((p) => p._id === focus.postId) ? (focus.postId as Id<"posts">) : undefined;
	const detail = useQuery(api.postEdits.detail, siteId && focusId ? { siteId, postId: focusId } : "skip");
	const toast = useToast();
	const attachUpload = useAction(api.assetsNode.attachUpload);

	const m = {
		addIdea: useMutation(api.posts.addIdea),
		approveIdea: useMutation(api.posts.approveIdea),
		rejectIdea: useMutation(api.posts.rejectIdea),
		promoteToBrief: useMutation(api.posts.promoteToBrief),
		generateNow: useMutation(api.posts.generateNow),
		moveToWeek: useMutation(api.plan.moveToWeek),
		runNow: useMutation(api.schedules.runNow),
		beginGsc: useMutation(api.gsc.beginOAuth),
		setBudget: useMutation(api.billing.setBudget),
		setModelRouting: useMutation(api.billing.setModelRouting),
		confirmManifest: useMutation(api.templates.confirm),
		mapTemplateItem: useMutation(api.templates.mapItem),
		setOutputFormat: useMutation(api.templates.setOutput),
		templateUploadUrl: useMutation(api.templates.uploadUrl),
		ingestTemplate: useMutation(api.templates.ingest),
		toggleSchedule: useMutation(api.schedules.toggle),
		resolveLedgerItem: useMutation(api.inbox.resolveLedgerItem),
		markNotificationRead: useMutation(api.inbox.markNotificationRead),
		markAllNotificationsRead: useMutation(api.inbox.markAllNotificationsRead),
		approve: useMutation(api.posts.approve),
		sendBack: useMutation(api.review.sendBack),
		shipNow: useMutation(api.posts.shipNow),
		editBlock: useMutation(api.editor.editBlock),
		editSeoTitle: useMutation(api.postEdits.editSeoTitle),
		restoreVersion: useMutation(api.postEdits.restoreVersion),
		addFactSource: useMutation(api.postEdits.addFactSource),
		rewriteFactWithout: useMutation(api.postEdits.rewriteFactWithout),
		overrideCheck: useMutation(api.postEdits.overrideCheck),
		fixCheck: useMutation(api.postEdits.fixCheck),
		instructAgent: useMutation(api.postEdits.instructAgent),
		acceptSuggestion: useMutation(api.postEdits.acceptSuggestion),
		rejectSuggestion: useMutation(api.postEdits.rejectSuggestion),
		addComment: useMutation(api.postEdits.addComment),
		startEditing: useMutation(api.postEdits.startEditing),
		stopEditing: useMutation(api.postEdits.stopEditing),
		sendToReview: useMutation(api.posts.sendToReview),
		pickCandidate: useMutation(api.slots.pickCandidate),
		useCandidate: useMutation(api.slots.useCandidate),
		markHumanOnly: useMutation(api.slots.markHumanOnly),
		regenerateSlot: useMutation(api.slots.regenerateSlot),
		uploadOwn: useMutation(api.slots.uploadOwn),
		setSlotCandidates: useMutation(api.slots.setSlotCandidates),
		slotUploadUrl: useMutation(api.slots.uploadUrl),
		setRouting: useMutation(api.slots.setRouting),
		mergeMr: useMutation(api.git.mergeMr),
		rebaseMr: useMutation(api.git.rebaseMr),
	};

	// Template versions with their sample HTML (fetched once per stored sample) and the /tpl asset base.
	const tplRows = useQuery(api.templates.list, siteId ? { siteId } : "skip");
	const [samples, setSamples] = useState<Record<string, string>>({});
	useEffect(() => {
		for (const r of tplRows ?? []) {
			if (!r.sampleUrl || samples[r._id] !== undefined) continue;
			const id = r._id;
			setSamples((s) => ({ ...s, [id]: "" }));
			fetch(r.sampleUrl)
				.then((x) => x.text())
				.then((html) => setSamples((s) => ({ ...s, [id]: html })))
				.catch(() => undefined);
		}
	}, [tplRows, samples]);
	const manifests = useMemo<ITemplateManifest[] | null>(() => {
		if (!tplRows) return null;
		const siteUrl = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(/\.convex\.cloud\/?$/, ".convex.site");
		return tplRows.map((r) => {
			const dir = r.samplePath && r.samplePath.includes("/") ? r.samplePath.slice(0, r.samplePath.lastIndexOf("/") + 1) : "";
			const html = samples[r._id];
			return {
				id: r._id, version: r.version, source: r.source, kind: r.kind, output: r.output, status: r.status, mappings: r.mappings,
				...(r.confirmedBy ? { confirmedBy: r.confirmedBy } : {}), ...(r.confirmedAt ? { confirmedAt: new Date(r.confirmedAt).toISOString() } : {}),
				...(html ? { sampleHtml: html } : {}), ...(r.samplePath ? { samplePath: r.samplePath, assetBase: `${siteUrl}/tpl/${r._id}/${dir}` } : {}), ...(r.parseError ? { parseError: r.parseError } : {}),
			};
		});
	}, [tplRows, samples]);

	const mapped = useMemo(() => {
		if (!bundle) return null;
		const out = toPlanData(bundle);
		if (manifests) out.data = { ...out.data, manifests };
		if (detail && focusId) {
			out.data = {
				...out.data,
				posts: out.data.posts.map((p) =>
					p.id !== focusId
						? p
						: {
								...p,
								versions: [...detail.versions].reverse().map((x) => ({ id: x.id, n: x.n, origin: x.origin, actor: x.actor, at: new Date(x.at).toISOString(), words: x.words, blocks: x.blocks, ...(x.seoTitle ? { seoTitle: x.seoTitle } : {}), ...(x.note ? { note: x.note } : {}) })),
								suggestions: detail.suggestions.map((s) => ({ id: s._id, instruction: s.instruction, before: s.before, after: s.after, blockId: s.blockId, status: s.status, ...(s.fixesCheckId ? { fixesCheckId: s.fixesCheckId } : {}), ...(s.resolvesFactId ? { resolvesFactId: s.resolvesFactId } : {}), ...(s.insertKind ? { insertKind: s.insertKind } : {}), createdAt: new Date(s.createdAt).toISOString() })),
								comments: detail.comments.map((c) => ({ id: c._id, by: c.by, role: c.role, text: c.text, at: new Date(c.at).toISOString() })),
								...(detail.lock && detail.lock.fresh ? { editingBy: { userId: detail.lock.userId, since: new Date(detail.lock.heartbeatAt).toISOString() } } : {}),
							},
				),
				audit: detail.activity.map((a) => ({ id: a.id, at: new Date(a.at).toISOString(), actor: a.actor, action: a.action, target: a.target, ...(a.detail ? { detail: a.detail } : {}) })),
			};
		}
		return out;
	}, [bundle, detail, focusId, manifests]);

	const versionOf = useMemo(() => new Map((bundle?.posts ?? []).map((p) => [p._id as string, p.currentVersion])), [bundle]);
	const lockHolder = detail?.lock && detail.lock.fresh ? detail.lock : null;

	const actions = useMemo<ISiteActions>(() => {
		const run = async (fn: () => Promise<unknown>, ok?: { text: string; tone?: "neutral" | "agent" | "pass" | "human" }): Promise<TResult> => {
			if (!siteId) return { ok: false, reason: "Still loading the site" };
			try {
				const r = (await fn()) as TResult;
				if (!r.ok) toast({ text: r.reason, tone: "block" });
				else if (ok) toast({ text: ok.text, tone: ok.tone ?? "neutral" });
				return r;
			} catch (e) {
				const reason = reasonOf(e);
				toast({ text: reason, tone: "block" });
				return { ok: false, reason };
			}
		};
		const s = siteId!;
		const auto = mapped?.site.publishing.autopost ?? false;
		return {
			addIdea: (topic, pillarId) => run(() => m.addIdea({ siteId: s, topic, ...(pillarId ? { pillarId: asId<"pillars">(pillarId) } : {}) }), { text: "Idea added to the plan" }),
			approveIdea: (postId) => run(() => m.approveIdea({ siteId: s, postId: asId(postId) }), { text: auto ? "Idea approved · the agents take it from here: draft, images, gate, merge request" : "Idea approved · briefed", tone: auto ? "agent" : "neutral" }),
			rejectIdea: (postId, note) => run(() => m.rejectIdea({ siteId: s, postId: asId(postId), note }), { text: "Idea rejected" }),
			promoteToBrief: (postId) => run(() => m.promoteToBrief({ siteId: s, postId: asId(postId) }), { text: "Promoted to brief · the blog writer picks it up at the next publish slot", tone: "agent" }),
			generateNow: (postId) => run(() => m.generateNow({ siteId: s, postId: asId(postId) }), { text: "Generating · the writer has started", tone: "agent" }),
			movePostToWeek: (postId, week) => run(() => m.moveToWeek({ siteId: s, postId: asId(postId), week }), { text: `Rescheduled to W${week}` }),
			runNow: (kind) => run(() => m.runNow({ siteId: s, kind }), { text: "Run started", tone: "agent" }),
			setBudget: (kind, capUsd) => run(() => m.setBudget({ siteId: s, budget: kind, capUsd }), { text: (kind === "text" ? "Text" : "Image") + " cap set to " + "\u0024" + capUsd.toFixed(2) + " / month" }),
			setModelRouting: (task, tier) => run(() => m.setModelRouting({ siteId: s, task: task === "pillar-pages" ? "pillarPages" : (task as "mechanical" | "writing" | "strategy"), tier })),
			connectSearchConsole: () =>
				run(async () => {
					const r = await m.beginGsc({ siteId: s });
					if (r.ok && r.url) window.location.assign(r.url);
					return r;
				}),
			confirmManifest: (manifestId) => run(() => m.confirmManifest({ siteId: s, manifestId: manifestId as Id<"templateManifests"> }), { text: "Manifest confirmed · new posts render into it", tone: "pass" }),
			mapTemplateItem: (manifestId, mappingId, role, label) => run(() => m.mapTemplateItem({ siteId: s, manifestId: manifestId as Id<"templateManifests">, mappingId, role, ...(label ? { label } : {}) })),
			setOutputFormat: (manifestId, output) => run(() => m.setOutputFormat({ siteId: s, manifestId: manifestId as Id<"templateManifests">, output })),
			ingestTemplateFile: (file) =>
				run(async () => {
					const url = await m.templateUploadUrl({ siteId: s });
					const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
					if (!res.ok) return { ok: false, reason: `Upload failed (${res.status})` };
					const { storageId } = (await res.json()) as { storageId: string };
					return m.ingestTemplate({ siteId: s, storageId: storageId as Id<"_storage">, fileName: file.name });
				}, { text: "Uploaded · the server is parsing the template", tone: "agent" }),
			toggleSchedule: (kind) => run(() => m.toggleSchedule({ siteId: s, kind })),
			resolveLedgerItem: (itemId) => run(() => m.resolveLedgerItem({ siteId: s, itemId: itemId as Id<"ledgerItems"> }), { text: "Done · removed from the ledger", tone: "pass" }),
			markNotificationRead: (id) => run(() => m.markNotificationRead({ siteId: s, notificationId: id as Id<"notifications"> })),
			markAllNotificationsRead: () => run(() => m.markAllNotificationsRead({ siteId: s })),
			approve: (postId, overrides = {}) => run(() => m.approve({ siteId: s, postId: asId(postId), overrides: Object.entries(overrides).map(([checkId, reason]) => ({ checkId, reason })) }), { text: "Approved · opening the merge request", tone: "pass" }),
			sendBack: (postId, note) => run(() => m.sendBack({ siteId: s, postId: asId(postId), note }), { text: "Sent back · the agent is revising", tone: "agent" }),
			shipNow: (postId) => run(() => m.shipNow({ siteId: s, postId: asId(postId) }), { text: "Running the autopost gate", tone: "agent" }),
			editBlock: (postId, blockId, text) => run(() => m.editBlock({ siteId: s, postId: asId(postId), blockId, text, baseVersion: versionOf.get(postId) ?? 0 }), { text: "Saved as a new version" }),
			editSeoTitle: (postId, seoTitle) => run(() => m.editSeoTitle({ siteId: s, postId: asId(postId), seoTitle })),
			restoreVersion: (postId, versionId) => run(() => m.restoreVersion({ siteId: s, postId: asId(postId), versionId: asId<"postVersions">(versionId) }), { text: "Restored as a new version" }),
			addFactSource: (postId, markerId, url) => run(() => m.addFactSource({ siteId: s, postId: asId(postId), markerId: asId<"factMarkers">(markerId), url }), { text: "Source added · marker resolved", tone: "pass" }),
			rewriteFactWithout: (postId, markerId) => run(() => m.rewriteFactWithout({ siteId: s, postId: asId(postId), markerId: asId<"factMarkers">(markerId) }), { text: "The agent is rewriting it · the diff appears here to review", tone: "agent" }),
			overrideCheck: (postId, checkId, reason) => run(() => m.overrideCheck({ siteId: s, postId: asId(postId), checkId, reason }), { text: "Override logged to the audit trail and listed in the MR", tone: "human" }),
			fixCheck: (postId, checkId) => run(() => m.fixCheck({ siteId: s, postId: asId(postId), checkId }), { text: "The agent is fixing it · the diff appears here to review", tone: "agent" }),
			instructAgent: (postId, instruction, blockId) => run(() => m.instructAgent({ siteId: s, postId: asId(postId), instruction, ...(blockId ? { blockId } : {}) }), { text: `The agent is on "${instruction}" · the diff appears here to review`, tone: "agent" }),
			acceptSuggestion: (postId, suggestionId) => run(() => m.acceptSuggestion({ siteId: s, postId: asId(postId), suggestionId: asId<"suggestions">(suggestionId) }), { text: "Agent edit accepted" }),
			rejectSuggestion: (postId, suggestionId) => run(() => m.rejectSuggestion({ siteId: s, postId: asId(postId), suggestionId: asId<"suggestions">(suggestionId) }), { text: "Agent edit rejected · content unchanged" }),
			addComment: (postId, text) => run(() => m.addComment({ siteId: s, postId: asId(postId), text })),
			// Locks: quiet (no toasts); the editor shows the holder from the detail query.
			startEditing: async (postId, opts) => {
				if (!siteId) return { ok: false, reason: "Still loading the site" };
				try {
					return (await m.startEditing({ siteId: s, postId: asId(postId), sessionId: sessionId(), ...(opts?.takeOver ? { takeOver: true } : {}) })) as TLockResult;
				} catch (e) {
					return { ok: false, reason: reasonOf(e) };
				}
			},
			sendToReview: (postId) => run(() => m.sendToReview({ siteId: s, postId: asId(postId) }), { text: "In review" }),
			pickCandidate: (slotId, candidateId) => run(() => m.pickCandidate({ siteId: s, slotId: asId<"imageSlots">(slotId), candidateId: asId<"candidates">(candidateId) })),
			useCandidate: (slotId) => run(() => m.useCandidate({ siteId: s, slotId: asId<"imageSlots">(slotId) }), { text: "Selected · it ships with the post", tone: "pass" }),
			markHumanOnly: (slotId) => run(() => m.markHumanOnly({ siteId: s, slotId: asId<"imageSlots">(slotId) }), { text: "Sent to your task queue with the brief attached · the post holds in Needs assets", tone: "human" }),
			regenerateSlot: (slotId, prompt, override) => run(() => m.regenerateSlot({ siteId: s, slotId: asId<"imageSlots">(slotId), ...(prompt ? { prompt } : {}), ...(override ? { override } : {}) }), { text: "The visual agent is on it", tone: "agent" }),
			uploadOwnFile: (slotId, file) =>
				run(async () => {
					const url = await m.slotUploadUrl({ siteId: s });
					const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
					if (!res.ok) return { ok: false, reason: `Upload failed (${res.status})` };
					const { storageId } = (await res.json()) as { storageId: string };
					return attachUpload({ siteId: s, slotId: asId<"imageSlots">(slotId), storageId: storageId as Id<"_storage">, fileName: file.name });
				}, { text: "Uploaded · it ships with the post", tone: "pass" }),
			uploadOwn: (slotId, fileName) => run(() => m.uploadOwn({ siteId: s, slotId: asId<"imageSlots">(slotId), fileName }), { text: "Upload recorded · the file is stored when image storage lands", tone: "pass" }),
			setSlotCandidates: (slotId, candidates, meta) =>
				run(() =>
					m.setSlotCandidates({
						siteId: s,
						slotId: asId<"imageSlots">(slotId),
						candidates: candidates.map((c) => ({ label: c.label, hue: c.hue, ...(c.url ? { url: c.url } : {}), ...(c.source ? { source: c.source } : {}) })),
						...(meta ? { meta } : {}),
					}),
				),
			setRouting: (slotType, provider) => run(() => m.setRouting({ siteId: s, slotType, provider })),
			mergeMr: (mrId) => run(() => m.mergeMr({ siteId: s, mrId: asId<"mergeRequests">(mrId) }), { text: "Merging", tone: "pass" }),
			rebaseMr: (mrId) => run(() => m.rebaseMr({ siteId: s, mrId: asId<"mergeRequests">(mrId) }), { text: "Rebased and re-rendered · waiting for CI", tone: "agent" }),
			stopEditing: async (postId) => {
				if (!siteId) return { ok: true };
				try {
					return (await m.stopEditing({ siteId: s, postId: asId(postId) })) as TResult;
				} catch {
					return { ok: true };
				}
			},
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- mutation functions are stable
	}, [siteId, mapped?.site.publishing.autopost, versionOf, toast, attachUpload]);

	return useMemo<ISiteCms>(() => {
		if (!mapped) {
			return { data: emptySiteData(), site: fallback.site, role: fallback.role, me: fallback.me, state: { members: [], jobs: [], siteId: fallback.site.id }, can: () => false, why: () => "Loading…", actions, loading: true };
		}
		const { site, data, role, members } = mapped;
		const me = members.find((x) => x.id === bundle?.meId) ?? { id: String(bundle?.meId ?? ""), name: "You", initials: "YO", role, email: "" };
		const holder = lockHolder && lockHolder.userId !== me.id ? { userId: lockHolder.userId, name: lockHolder.name, since: new Date(lockHolder.since).toISOString() } : null;
		return { data, site, role, me, state: { members, jobs: [], siteId: site.id }, can: (p) => roleCan(role, p), why: (p) => lockReason(role, p), actions, loading: false, lockHolder: holder };
	}, [mapped, bundle?.meId, fallback.site, fallback.role, fallback.me, actions, lockHolder]);
}

// ─── Convex: derived views (same logic as the store's hooks) ──────────────────

function useLiveStats(): ICmsStats {
	const { data, site } = useLiveSite();
	return useMemo(() => computeStats(site, data), [site, data]);
}
function useLiveLedger(): ILedgerView[] {
	const { data } = useLiveSite();
	return useMemo(() => data.ledger.filter((l) => !l.done).map((l) => ({ ...l, age: ledgerAge(l), ageDays: ledgerAge(l), status: ledgerStatus(ledgerAge(l)) })).sort((a, b) => b.age - a.age), [data]);
}
function useLiveManifest(): ITemplateManifest | null {
	const { data } = useLiveSite();
	return useMemo(() => activeManifest(data), [data]);
}
function useLiveGate(postId: string | undefined): IGateView | null {
	const { data } = useLiveSite();
	return useMemo(() => {
		const post = postId ? data.posts.find((p) => p.id === postId) : undefined;
		if (!post) return null;
		const manifest = activeManifest(data);
		return { ...evaluateGate(post, data.slots, manifest), manifest, post };
	}, [data, postId]);
}
function useLiveEditLock(postId: string | undefined): { holder: IEditLockHolder | null; mine: boolean } {
	const { data, me, lockHolder } = useLiveSite();
	return useMemo(() => {
		const post = postId ? data.posts.find((p) => p.id === postId) : undefined;
		const lock = post?.editingBy;
		if (!lock) return { holder: null, mine: false };
		if (lock.userId === me.id) return { holder: null, mine: true };
		return { holder: lockHolder ?? null, mine: false };
	}, [data, postId, me.id, lockHolder]);
}
function useLiveMergeRequest(id: string | undefined): IMergeRequest | undefined {
	const { data } = useLiveSite();
	return useMemo(() => (id ? data.mergeRequests.find((x) => x.id === id) : undefined), [data, id]);
}
function useLiveMrForPost(postId: string | undefined): IMergeRequest | undefined {
	const { data } = useLiveSite();
	return useMemo(() => {
		if (!postId) return undefined;
		const post = data.posts.find((p) => p.id === postId);
		return data.mergeRequests.find((x) => x.id === post?.mrId) ?? data.mergeRequests.find((x) => x.postId === postId);
	}, [data, postId]);
}
function useLivePost(postId: string | undefined): IPost | undefined {
	const { data } = useLiveSite();
	return useMemo(() => (postId ? data.posts.find((p) => p.id === postId) : undefined), [data.posts, postId]);
}

function useLiveSlotsForPost(postId: string | undefined): IImageSlot[] {
	const { data } = useLiveSite();
	return useMemo(() => (postId ? data.slots.filter((x) => x.postId === postId) : []), [data, postId]);
}
function useLiveAutopostHold(postId: string | undefined): ILedgerItem | undefined {
	const { data } = useLiveSite();
	return useMemo(() => (postId ? data.ledger.find((l) => !l.done && l.postId === postId && l.kind === "autopost-hold") : undefined), [data, postId]);
}
function useLivePendingIdeas(): IPost[] {
	const { data } = useLiveSite();
	return useMemo(() => data.posts.filter(isPendingIdea).sort((a, b) => a.week - b.week), [data]);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

const on = BACKEND_ENABLED;
export const useSiteCms: () => ISiteCms = on ? useLiveSite : useStoreSite;
export const useSiteStats: () => ICmsStats = on ? useLiveStats : useStats;
export const useSiteLedger: () => ILedgerView[] = on ? useLiveLedger : useLedger;
export const useSiteManifest: () => ITemplateManifest | null = on ? useLiveManifest : useActiveManifest;
export const useSiteGate: (postId: string | undefined) => IGateView | null = on ? useLiveGate : useGate;
export const useSiteEditLock: (postId: string | undefined) => { holder: IEditLockHolder | null; mine: boolean } = on ? useLiveEditLock : useEditLock;
export const useSiteMergeRequest: (id: string | undefined) => IMergeRequest | undefined = on ? useLiveMergeRequest : useMergeRequest;
export const useSiteMrForPost: (postId: string | undefined) => IMergeRequest | undefined = on ? useLiveMrForPost : useMrForPost;
export const useSitePost: (postId: string | undefined) => IPost | undefined = on ? useLivePost : usePost;
export const useSiteSlotsForPost: (postId: string | undefined) => IImageSlot[] = on ? useLiveSlotsForPost : useSlotsForPost;
export const useSiteAutopostHold: (postId: string | undefined) => ILedgerItem | undefined = on ? useLiveAutopostHold : useAutopostHold;
export const useSitePendingIdeas: () => IPost[] = on ? useLivePendingIdeas : usePendingIdeas;
/** True when site pages show Convex data. */
export const SITE_ON_CONVEX = on;
