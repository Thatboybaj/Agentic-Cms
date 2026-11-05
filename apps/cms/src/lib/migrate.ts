// Persisted-state loading: v2 as-is (with additive fix-ups), v1 → v2 migration, anything else → reseed.
import { createSeed, STATE_VERSION } from "./seed";
import type { ICmsState, ICmsStateV1, ISite } from "./types";

export const STATE_KEY = "cms.state.v2";
export const V1_STATE_KEY = "cms.state.v1";

export interface ILoadResult {
	state: ICmsState;
	/** What happened, for the console: "loaded" | "migrated" | "reseeded" | "seeded". */
	outcome: "loaded" | "migrated" | "reseeded" | "seeded";
	note?: string;
	/** v1's shared `siteId`, kept as this tab's last-used site. */
	lastSiteId?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "site";

/** Additive fix-ups for any v2 state (older v2 saves, merged v1 sites). Mutates and returns `s`. */
export function normalizeV2(s: ICmsState, seed: ICmsState = createSeed()): ICmsState {
	s.presence ??= [];
	s.audit ??= [];
	s.accessRequests ??= [];
	s.memberships ??= [];
	s.workspaceRoles ??= {};
	s.users ??= seed.users;
	s.workspace ??= seed.workspace;
	for (const site of s.sites) {
		const ref = seed.sites.find((x) => x.id === site.id);
		site.slug ||= ref?.slug ?? slugify(site.id);
		site.industry ||= ref?.industry ?? "Other";
		site.status ||= ref?.status ?? "active";
		site.createdAt ||= ref?.createdAt ?? new Date().toISOString();
		site.accent ??= ref?.accent;
		// C10: sites saved before publishing settings existed get the seed's mode.
		if (!site.publishing) site.publishing = structuredClone(ref?.publishing ?? { autopost: true, autoMergeOnGreenCi: true });
		if (!s.data[site.id]) s.data[site.id] = structuredClone(seed.data[site.id] ?? seed.data[seed.sites[0].id]);
	}
	return s;
}

function isV2(v: Record<string, unknown>): v is Record<string, unknown> & ICmsState {
	return v.version === 2 && Array.isArray(v.sites) && Array.isArray(v.users) && isObj(v.data) && Array.isArray(v.jobs);
}

function isV1(v: Record<string, unknown>): v is Record<string, unknown> & ICmsStateV1 {
	return v.version === 1 && Array.isArray(v.sites) && isObj(v.data) && Array.isArray(v.jobs);
}

/**
 * v1 → v2: the seed's workspace, people and memberships, with every v1 site (and its data and in-flight jobs) carried
 * over. v1's shared `role` is dropped (the current user is per tab now); its `siteId` becomes the tab's last-used site.
 */
export function migrateV1(v1: ICmsStateV1): ILoadResult {
	const seed = createSeed();
	const sites: ISite[] = [...seed.sites];
	let added = 0;
	for (const old of v1.sites) {
		const i = sites.findIndex((x) => x.id === old.id);
		const ref = i >= 0 ? sites[i] : undefined;
		const merged: ISite = {
			...(ref ?? { slug: slugify(old.id), industry: "Other", status: "onboarding" as const, createdAt: new Date().toISOString() }),
			...old,
			slug: ref?.slug ?? slugify(old.id),
		} as ISite;
		if (i >= 0) sites[i] = merged;
		else {
			sites.push(merged);
			added++;
		}
		if (v1.data[old.id]) seed.data[old.id] = v1.data[old.id];
	}
	const state = normalizeV2({ ...seed, version: STATE_VERSION, sites, jobs: v1.jobs }, createSeed());
	return {
		state,
		outcome: "migrated",
		lastSiteId: v1.siteId,
		note: `Migrated saved demo data v1 → v2: kept ${v1.sites.length} site(s)${added ? ` (${added} not in the seed, visible to workspace admins)` : ""}; the shared role "${v1.role}" is now per tab (signed in as the default user).`,
	};
}

/** Parses whatever is stored. Never throws: unreadable or unknown data reseeds with a note. */
export function loadPersisted(rawV2: string | null, rawV1: string | null): ILoadResult {
	if (rawV2) {
		try {
			const parsed: unknown = JSON.parse(rawV2);
			if (isObj(parsed) && isV2(parsed)) return { state: normalizeV2(parsed as ICmsState), outcome: "loaded" };
			if (isObj(parsed) && isV1(parsed)) return migrateV1(parsed as ICmsStateV1);
			return { state: createSeed(), outcome: "reseeded", note: `Saved demo data (version ${isObj(parsed) ? String(parsed.version) : "?"}) isn't recognised; reseeded.` };
		} catch {
			return { state: createSeed(), outcome: "reseeded", note: "Saved demo data couldn't be read; reseeded." };
		}
	}
	if (rawV1) {
		try {
			const parsed: unknown = JSON.parse(rawV1);
			if (isObj(parsed) && isV1(parsed)) return migrateV1(parsed as ICmsStateV1);
			return { state: createSeed(), outcome: "reseeded", note: "Saved v1 demo data has an unexpected shape; reseeded." };
		} catch {
			return { state: createSeed(), outcome: "reseeded", note: "Saved v1 demo data couldn't be read; reseeded." };
		}
	}
	return { state: createSeed(), outcome: "seeded" };
}
