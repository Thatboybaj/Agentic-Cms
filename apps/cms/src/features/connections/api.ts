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
