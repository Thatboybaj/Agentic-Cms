"use client";
// Client fetch helpers for /api/connections. Secrets are write-only: sent once in `secret`, never read back.
import { useCallback, useEffect, useRef, useState } from "react";
import type { IConnection, IConnectionInput } from "./catalog";

export interface IStorageInfo {
	encrypted: boolean;
	lockedSecrets: number;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
	let res: Response;
	try {
		res = await fetch(url, { ...init, cache: "no-store", headers: init?.body ? { "Content-Type": "application/json" } : undefined });
	} catch {
		throw new Error("Couldn't reach the CMS server. Check it's running.");
	}
	if (res.status === 204) return undefined as T;
	const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
	if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
	return body as T;
}

const q = (siteId: string) => `siteId=${encodeURIComponent(siteId)}`;

export const connectionsApi = {
	list: (siteId: string) => call<{ connections: IConnection[]; storage: IStorageInfo }>(`/api/connections?${q(siteId)}`),
	/** `secret`: string sets/replaces, null removes, undefined keeps. */
	save: (input: IConnectionInput, secret?: string | null) =>
		call<{ connection: IConnection }>("/api/connections", { method: "POST", body: JSON.stringify(secret === undefined ? input : { ...input, secret }) }).then((r) => r.connection),
	remove: (siteId: string, id: string) => call<void>(`/api/connections/${encodeURIComponent(id)}?${q(siteId)}`, { method: "DELETE" }),
	test: (siteId: string, id: string) => call<{ connection: IConnection }>(`/api/connections/${encodeURIComponent(id)}/test?${q(siteId)}`, { method: "POST" }).then((r) => r.connection),
};

export interface IUseConnections {
	connections: IConnection[];
	storage: IStorageInfo | null;
	loading: boolean;
	error: string | null;
	/** Ids with a test in flight. */
	testing: ReadonlySet<string>;
	refresh: () => Promise<void>;
	save: (input: IConnectionInput, secret?: string | null) => Promise<IConnection>;
	remove: (id: string) => Promise<void>;
	test: (id: string) => Promise<IConnection>;
}

/** Connections for one site: fetch, mutate, re-fetch after every mutation. Mutations reject with a human message. */
export function useConnections(siteId: string): IUseConnections {
	const [connections, setConnections] = useState<IConnection[]>([]);
	const [storage, setStorage] = useState<IStorageInfo | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [testing, setTesting] = useState<ReadonlySet<string>>(new Set());
	const current = useRef(siteId);
	current.current = siteId;

	const refresh = useCallback(async () => {
		const forSite = siteId;
		try {
			const r = await connectionsApi.list(forSite);
			if (current.current !== forSite) return; // site switched mid-flight
			setConnections(r.connections);
			setStorage(r.storage);
			setError(null);
		} catch (e) {
			if (current.current === forSite) setError((e as Error).message);
		} finally {
			if (current.current === forSite) setLoading(false);
		}
	}, [siteId]);

	useEffect(() => {
		setLoading(true);
		setConnections([]);
		void refresh();
	}, [refresh]);

	const save = useCallback(
		async (input: IConnectionInput, secret?: string | null) => {
			const c = await connectionsApi.save({ ...input, siteId }, secret);
			await refresh();
			return c;
		},
		[siteId, refresh],
	);

	const remove = useCallback(
		async (id: string) => {
			await connectionsApi.remove(siteId, id);
			await refresh();
		},
		[siteId, refresh],
	);

	const test = useCallback(
		async (id: string) => {
			setTesting((s) => new Set(s).add(id));
			try {
				const c = await connectionsApi.test(siteId, id);
				await refresh();
				return c;
			} finally {
				setTesting((s) => {
					const n = new Set(s);
					n.delete(id);
					return n;
				});
			}
		},
		[siteId, refresh],
	);

	return { connections, storage, loading, error, testing, refresh, save, remove, test };
}

// ─── Convex (handoff 04) ─────────────────────────────────────────────────────

import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { SITE_ON_CONVEX } from "@/features/shared/site-source";
import { useSite } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Same contract as the local hook; rows come live from Convex and keys are sealed server-side per tenant. */
function useLiveConnections(_siteId: string): IUseConnections {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const rows = useQuery(api.connections.list, siteId ? { siteId } : "skip");
	const upsert = useMutation(api.connections.upsert);
	const removeM = useMutation(api.connections.remove);
	const testA = useAction(api.connections.test);
	const [testing, setTesting] = useState<ReadonlySet<string>>(new Set());
	const need = () => {
		if (!siteId) throw new Error("Still loading the site");
		return siteId;
	};
	const find = (id: string) => rows?.connections.find((c) => c.id === id);
	const save = useCallback(
		async (input: IConnectionInput, secret?: string | null) => {
			const sid = need();
			const { siteId: _ignored, command: _c, args: _a, ...rest } = input;
			const r = await upsert({ siteId: sid, ...(rest as Omit<IConnectionInput, "siteId" | "command" | "args">), ...(input.id ? { id: input.id as Id<"connections"> } : {}), ...(secret !== undefined ? { secret } : {}) } as never);
			if (!r.ok) throw new Error(r.reason);
			return (find(r.id ?? "") ?? ({ id: r.id, ...input, hasSecret: !!secret, status: "untested", usedFor: input.usedFor ?? [], enabled: input.enabled ?? true, kind: "mcp", label: input.label ?? "", createdAt: new Date().toISOString() } as IConnection));
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[siteId, upsert, rows],
	);
	const remove = useCallback(
		async (id: string) => {
			const r = await removeM({ siteId: need(), id: id as Id<"connections"> });
			if (!r.ok) throw new Error(r.reason);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[siteId, removeM],
	);
	const test = useCallback(
		async (id: string) => {
			setTesting((s) => new Set(s).add(id));
			try {
				const r = await testA({ siteId: need(), id: id as Id<"connections"> });
				if (!r.ok) throw new Error(r.reason);
				return find(id)!;
			} finally {
				setTesting((s) => {
					const n = new Set(s);
					n.delete(id);
					return n;
				});
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[siteId, testA, rows],
	);
	return { connections: rows?.connections ?? [], storage: rows?.storage ?? null, loading: rows === undefined, error: null, testing, refresh: async () => undefined, save, remove, test };
}

export const useSiteConnections: (siteId: string) => IUseConnections = SITE_ON_CONVEX ? useLiveConnections : useConnections;
