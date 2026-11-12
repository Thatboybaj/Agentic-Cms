"use client";
// Site discovery screens' data (prd-site-discovery §9). Live: the Convex overview + actions. Demo (backend off): a
// seeded example result so the screens can be walked through without a backend (PRD §14 P0).
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useMemo } from "react";
import { SITE_ON_CONVEX } from "@/features/shared/site-source";
import { useSite } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { DEMO_DISCOVERY } from "./demo";

export type TDiscoveryOverview = FunctionReturnType<typeof api.discovery.queries.overview>;
export type TResult = { ok: true; [k: string]: unknown } | { ok: false; reason: string };

export interface IDiscoveryData {
	loading: boolean;
	demo: boolean;
	data: TDiscoveryOverview | null;
	run(mode: "full" | "more-ideas"): Promise<TResult>;
	acceptProfile(): Promise<TResult>;
	editProfile(e: { sells?: string; audience?: string; voice?: string; styleKeywords?: string[]; disclaimers?: string[] }): Promise<TResult>;
	answerInterview(answers: { question: string; answer: string }[]): Promise<TResult>;
	sendRefresh(urls: string[]): Promise<TResult>;
	setSettings(s: TDiscoveryOverview["settings"]): Promise<TResult>;
}

const DEMO_SAYS: TResult = { ok: false, reason: "Demo data · connect the backend to run discovery" };

function useLive(): IDiscoveryData {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const data = useQuery(api.discovery.queries.overview, siteId ? { siteId } : "skip");
	const runM = useMutation(api.discovery.run.run);
	const acceptM = useMutation(api.discovery.queries.acceptProfile);
	const editM = useMutation(api.discovery.queries.editProfile);
	const answerM = useMutation(api.discovery.queries.answerInterview);
	const refreshM = useMutation(api.discovery.queries.sendRefreshCandidates);
	const settingsM = useMutation(api.discovery.queries.setSettings);
	/** Runs a mutation for this site; a refusal comes back as {ok:false} (the screens show the reason). */
	const call = useCallback(async (f: (siteId: Id<"sites">) => Promise<unknown>): Promise<TResult> => (siteId ? ((await f(siteId)) as TResult) : { ok: false, reason: "Still loading the site" }), [siteId]);
	return useMemo(
		() => ({
			loading: data === undefined,
			demo: false,
			data: data ?? null,
			run: (mode) => call((siteId) => runM({ siteId, mode })),
			acceptProfile: () => call((siteId) => acceptM({ siteId })),
			editProfile: (e) => call((siteId) => editM({ siteId, ...e })),
			answerInterview: (answers) => call((siteId) => answerM({ siteId, answers })),
			sendRefresh: (urls) => call((siteId) => refreshM({ siteId, urls })),
			setSettings: (st) => call((siteId) => settingsM({ siteId, ...st })),
		}),
		[data, call, runM, acceptM, editM, answerM, refreshM, settingsM],
	);
}

function useDemo(): IDiscoveryData {
	const { slug } = useSite();
	return useMemo(() => {
		const say = async () => DEMO_SAYS;
		return { loading: false, demo: true, data: slug === "lumen" ? DEMO_DISCOVERY : null, run: say, acceptProfile: say, editProfile: say, answerInterview: say, sendRefresh: say, setSettings: say };
	}, [slug]);
}

/** SITE_ON_CONVEX is a build-time constant, so the hook order is stable. */
export const useDiscovery: () => IDiscoveryData = SITE_ON_CONVEX ? useLive : useDemo;

export const STAGES = ["seed", "crawl", "extract", "profile", "keywords", "ideas", "finish"] as const;
export const STAGE_LABEL: Record<string, string> = { seed: "Finding pages", crawl: "Reading the site", extract: "Reading what each page is about", profile: "Understanding the business", keywords: "Choosing pillars and keywords", ideas: "Writing the first ideas", finish: "Done" };
