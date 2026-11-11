"use client";
// Where the Content plan reads and writes. With the real backend on (BACKEND_ENABLED) it is Convex, through one
// `plan.bundle` subscription mapped to the prototype's shapes (src/lib/adapter.ts toPlanData); otherwise the demo
// store, exactly as before. The plan's components use these hooks instead of useCms/useStats/useLedger directly.
// BACKEND_ENABLED is a build-time constant, so each binding below picks one implementation for the app's lifetime.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useMemo } from "react";
import { toPlanData } from "@/lib/adapter";
import { BACKEND_ENABLED } from "@/lib/backend";
import { ledgerAge, ledgerStatus, lockReason, roleCan, type TPermission } from "@/lib/logic";
import { emptySiteData, useActiveManifest, useCms, useLedger, useSite, useStats, useToast, type ICmsStats, type ILedgerView, type TResult } from "@/lib/store";
import type { IMember, ISite, ISiteData, ITemplateManifest, TRole, TRunKind } from "@/lib/types";
import { activeManifest, computeStats } from "@/lib/workspace";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type TMaybeAsync<T> = T | Promise<T>;

export interface IPlanActions {
	addIdea(topic: string, pillarId?: string): TMaybeAsync<TResult>;
	approveIdea(postId: string): TMaybeAsync<TResult>;
	rejectIdea(postId: string, note: string): TMaybeAsync<TResult>;
	promoteToBrief(postId: string): TMaybeAsync<TResult>;
	generateNow(postId: string): TMaybeAsync<TResult>;
	movePostToWeek(postId: string, week: number): TMaybeAsync<TResult>;
	runNow(kind: TRunKind): TMaybeAsync<TResult>;
}

export interface IPlanCms {
	data: ISiteData;
	site: ISite;
	role: TRole;
	state: { members: IMember[] };
	can: (p: TPermission) => boolean;
	why: (p: TPermission) => string | null;
	actions: IPlanActions;
	/** Convex only: true until the first bundle arrives. */
	loading: boolean;
}

// ─── Demo store ───────────────────────────────────────────────────────────────

function useStorePlan(): IPlanCms {
	const c = useCms();
	return useMemo(() => ({ data: c.data, site: c.site, role: c.role, state: { members: c.state.members }, can: c.can, why: c.why, actions: c.actions, loading: false }), [c]);
}

// ─── Convex ───────────────────────────────────────────────────────────────────

function useLivePlanBundle() {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const bundle = useQuery(api.plan.bundle, siteId ? { siteId } : "skip");
	return { siteId, bundle, resolved };
}

function reasonOf(e: unknown) {
	return e instanceof ConvexError ? String((e.data as { reason?: string })?.reason ?? "Not allowed") : "Couldn't reach the server. Try again.";
}

function useLivePlan(): IPlanCms {
	const fallback = useCms(); // the demo store's copy of this site, shown only while the first bundle loads
	const { siteId, bundle } = useLivePlanBundle();
	const toast = useToast();
	const addIdea = useMutation(api.posts.addIdea);
	const approveIdea = useMutation(api.posts.approveIdea);
	const rejectIdea = useMutation(api.posts.rejectIdea);
	const promoteToBrief = useMutation(api.posts.promoteToBrief);
	const generateNow = useMutation(api.posts.generateNow);
	const moveToWeek = useMutation(api.plan.moveToWeek);
	const runNow = useMutation(api.schedules.runNow);

	const mapped = useMemo(() => (bundle ? toPlanData(bundle) : null), [bundle]);

	const actions = useMemo<IPlanActions>(() => {
		const run = async (fn: () => Promise<unknown>, ok?: { text: string; tone?: "neutral" | "agent" | "pass" }): Promise<TResult> => {
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
		const pid = (id: string) => id as Id<"posts">;
		const auto = mapped?.site.publishing.autopost ?? false;
		return {
			addIdea: (topic, pillarId) => run(() => addIdea({ siteId: siteId!, topic, ...(pillarId ? { pillarId: pillarId as Id<"pillars"> } : {}) }), { text: "Idea added to the plan" }),
			approveIdea: (postId) => run(() => approveIdea({ siteId: siteId!, postId: pid(postId) }), { text: auto ? "Idea approved · the agents take it from here: draft, images, gate, merge request" : "Idea approved · briefed", tone: auto ? "agent" : "neutral" }),
			rejectIdea: (postId, note) => run(() => rejectIdea({ siteId: siteId!, postId: pid(postId), note }), { text: "Idea rejected" }),
			promoteToBrief: (postId) => run(() => promoteToBrief({ siteId: siteId!, postId: pid(postId) }), { text: "Promoted to brief · the blog writer picks it up at the next publish slot", tone: "agent" }),
			generateNow: (postId) => run(() => generateNow({ siteId: siteId!, postId: pid(postId) }), { text: "Generating · the writer has started", tone: "agent" }),
			movePostToWeek: (postId, week) => run(() => moveToWeek({ siteId: siteId!, postId: pid(postId), week }), { text: `Rescheduled to W${week}` }),
			runNow: (kind) => run(() => runNow({ siteId: siteId!, kind }), { text: "Run started", tone: "agent" }),
		};
	}, [siteId, mapped, toast, addIdea, approveIdea, rejectIdea, promoteToBrief, generateNow, moveToWeek, runNow]);

	return useMemo(() => {
		if (!mapped) return { data: emptySiteData(), site: fallback.site, role: fallback.role, state: { members: [] }, can: () => false, why: () => "Loading…", actions, loading: true };
		const { site, data, role, members } = mapped;
		return { data, site, role, state: { members }, can: (p) => roleCan(role, p), why: (p) => lockReason(role, p), actions, loading: false };
	}, [mapped, fallback.site, fallback.role, actions]);
}

function useLiveStats(): ICmsStats {
	const { data, site } = useLivePlan();
	return useMemo(() => computeStats(site, data), [site, data]);
}

function useLiveLedger(): ILedgerView[] {
	const { data } = useLivePlan();
	return useMemo(
		() =>
			data.ledger
				.filter((l) => !l.done)
				.map((l) => {
					const age = ledgerAge(l);
					return { ...l, age, ageDays: age, status: ledgerStatus(age) };
				})
				.sort((a, b) => b.age - a.age),
		[data],
	);
}

function useLiveManifest(): ITemplateManifest | null {
	const { data } = useLivePlan();
	return useMemo(() => activeManifest(data), [data]);
}

export const usePlanCms: () => IPlanCms = BACKEND_ENABLED ? useLivePlan : useStorePlan;
export const usePlanStats: () => ICmsStats = BACKEND_ENABLED ? useLiveStats : useStats;
export const usePlanLedger: () => ILedgerView[] = BACKEND_ENABLED ? useLiveLedger : useLedger;
export const usePlanManifest: () => ITemplateManifest | null = BACKEND_ENABLED ? useLiveManifest : useActiveManifest;
/** True when the plan shows Convex data (index.tsx shows a "live" note and a loading state). */
export const PLAN_ON_CONVEX = BACKEND_ENABLED;
