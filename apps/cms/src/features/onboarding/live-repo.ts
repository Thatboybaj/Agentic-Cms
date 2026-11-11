"use client";
// Convex side of the onboarding Repo + Paths steps (handoff 06 step 1): the real GitHub App install round-trip, the
// repos that installation can see, the layout scan, and the verified, path-scoped connect. Null with the backend off
// (the wizard keeps the prototype's simulated install).
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { SITE_ON_CONVEX } from "@/features/shared/site-source";
import { useSite } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export interface IRepoChoice {
	repo: string;
	defaultBranch: string;
	private: boolean;
}

export interface IScanResult {
	defaultBranch: string;
	contentDir: string;
	contentFiles: number;
	assetDir: string;
	indexFiles: string[];
}

export interface ILiveRepoConnect {
	ready: boolean;
	configured: boolean;
	installationId: string | null;
	account: string | null;
	begin(): Promise<{ ok: true; url?: string } | { ok: false; reason: string }>;
	/** One-click App creation (GitHub App Manifest flow). */
	createApp(): Promise<{ ok: true; url?: string } | { ok: false; reason: string }>;
	listRepos(installationId: string): Promise<{ ok: true; account: string; repos: IRepoChoice[] } | { ok: false; reason: string }>;
	scan(installationId: string, repo: string): Promise<({ ok: true } & IScanResult) | { ok: false; reason: string }>;
	connect(a: { installationId: string; repo: string; baseBranch: string; contentDir: string; assetDir: string; branchPattern: string; indexFiles?: string[] }): Promise<{ ok: true } | { ok: false; reason: string }>;
}

function useLive(): ILiveRepoConnect {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const status = useQuery(api.gitConnect.status, siteId ? { siteId } : "skip");
	const beginM = useMutation(api.gitConnect.beginInstall);
	const createM = useMutation(api.gitConnect.beginAppManifest);
	const reposA = useAction(api.gitConnect.installRepos);
	const scanA = useAction(api.gitConnect.scanRepo);
	const connectA = useAction(api.gitConnect.connectRepo);
	const fromUrl = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("installation");
	const known = status?.installations ?? [];
	const installationId = (fromUrl && known.some((i) => i.installationId === fromUrl) ? fromUrl : known[known.length - 1]?.installationId) ?? null;
	const begin = useCallback(async () => (siteId ? beginM({ siteId }) : { ok: false as const, reason: "Still loading the site" }), [siteId, beginM]);
	const createApp = useCallback(async () => (siteId ? createM({ siteId }) : { ok: false as const, reason: "Still loading the site" }), [siteId, createM]);
	const listRepos = useCallback(async (id: string) => (siteId ? reposA({ siteId, installationId: id }) : { ok: false as const, reason: "Still loading the site" }), [siteId, reposA]);
	const scan = useCallback(async (id: string, repo: string) => (siteId ? scanA({ siteId, installationId: id, repo }) : { ok: false as const, reason: "Still loading the site" }), [siteId, scanA]);
	const connect = useCallback<ILiveRepoConnect["connect"]>(async (a) => (siteId ? connectA({ siteId, ...a }) : { ok: false, reason: "Still loading the site" }), [siteId, connectA]);
	return useMemo(() => ({ ready: !!status, configured: !!status?.configured, installationId, account: known.find((k) => k.installationId === installationId)?.account ?? null, begin, createApp, listRepos, scan, connect }), [status, installationId, known, begin, createApp, listRepos, scan, connect]);
}

/** The live connect flow, or null when the backend is off. (SITE_ON_CONVEX is a build-time constant, so hook order is stable.) */
export const useLiveRepoConnect: () => ILiveRepoConnect | null = SITE_ON_CONVEX ? useLive : () => null;
