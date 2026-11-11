"use node";
// Node side of connections (handoff 04 steps 2–3): the real network test (MCP listTools / image-API probes), the SSRF
// guard (resolve the host, refuse private, link-local and metadata ranges before connecting), and agentDeps(): the
// site's connections + decrypted keys for one visual-agent run (src/server/visual-agent/deps.ts).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { v } from "convex/values";
import type { IConnection, IConnectionTool } from "../src/features/connections/catalog";
import type { IConnectionDeps } from "../src/server/visual-agent/deps";
import { humanizeMcpError, withMcpClient } from "../src/server/mcp";
import { probeApi } from "../src/server/probes";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import { open } from "./lib/crypto";

const MAX_TOOL_PAGES = 5;

/** True for addresses an outbound fetch must never reach (RFC1918, loopback, link-local/metadata, CGNAT, ULA). */
export function privateAddress(ip: string): boolean {
	if (isIP(ip) === 6) {
		const x = ip.toLowerCase();
		if (x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb")) return true;
		const v4 = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x)?.[1];
		return v4 ? privateAddress(v4) : false;
	}
	const [a, b] = ip.split(".").map(Number) as [number, number];
	return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Throws a human sentence when the URL's host resolves to a private address (DNS rebinding covered per call). */
export async function assertPublicUrl(url: string): Promise<void> {
	const u = new URL(url);
	const dev = (process.env.FRONTEND_URL ?? "").startsWith("http://localhost");
	if (dev && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return;
	const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true });
	if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("That address is on a private network · use the server's public https:// URL.");
}

export async function agentDeps(ctx: ActionCtx, siteId: Id<"sites">): Promise<IConnectionDeps> {
	const rows = await ctx.runQuery(internal.connections.forAgent, { siteId });
	const list: IConnection[] = rows.map((r) => r.pub);
	const cache = new Map<string, string | null>();
	return {
		list: async () => list,
		secret: async (id) => {
			if (cache.has(id)) return cache.get(id)!;
			const row = rows.find((r) => r.pub.id === id);
			if (!row?.secretId) return null;
			const c = await ctx.runQuery(internal.connections.cipherFor, { siteId, connectionId: id as Id<"connections"> });
			const s = c ? await open(c.ciphertext, c.aad) : null;
			cache.set(id, s);
			return s;
		},
	};
}

const pickImageTool = (tools: IConnectionTool[]): string | undefined => {
	if (tools.length === 1) return tools[0]!.name;
	const hits = tools.filter((t) => /image|generat|render|draw|picture/i.test(t.name));
	return hits.length === 1 ? hits[0]!.name : undefined;
};

export const test = internalAction({
	args: { siteId: v.id("sites"), id: v.id("connections") },
	handler: async (ctx, { siteId, id }): Promise<{ ok: true } | { ok: false; reason: string }> => {
		const deps = await agentDeps(ctx, siteId);
		const c = (await deps.list()).find((x) => x.id === id);
		if (!c) return { ok: false, reason: "Connection not found" };
		let secret: string | null = null;
		try {
			secret = await deps.secret(id);
		} catch (e) {
			const msg = (e as Error).message;
			await ctx.runMutation(internal.connections.recordTest, { id, status: "failed", lastError: msg });
			return { ok: false, reason: msg };
		}
		try {
			if (c.kind === "mcp") {
				if (!c.url) throw new Error("Enter the server's full URL, starting with https://.");
				await assertPublicUrl(c.url);
				const tools = await withMcpClient({ transport: c.transport ?? "streamable-http", url: c.url, secret }, async (client, signal) => {
					const out: IConnectionTool[] = [];
					let cursor: string | undefined;
					for (let page = 0; page < MAX_TOOL_PAGES; page++) {
						const res = await client.listTools(cursor ? { cursor } : undefined, { signal });
						for (const t of res.tools) out.push(t.description ? { name: t.name, description: t.description.replace(/\s+/g, " ").slice(0, 300) } : { name: t.name });
						cursor = res.nextCursor;
						if (!cursor) break;
					}
					return out;
				});
				const keep = c.toolName && tools.some((t) => t.name === c.toolName) ? c.toolName : pickImageTool(tools);
				await ctx.runMutation(internal.connections.recordTest, { id, status: tools.length ? "ok" : "failed", statusNote: tools.length ? `${tools.length} tool${tools.length === 1 ? "" : "s"} available` : "Connected, but the server lists no tools", tools, ...(keep ? { toolName: keep } : {}), ...(tools.length ? {} : { lastError: "The server lists no tools, so there is nothing to generate images with." }) });
				return tools.length ? { ok: true } : { ok: false, reason: "The server lists no tools" };
			}
			const r = await probeApi(c.provider, secret);
			await ctx.runMutation(internal.connections.recordTest, { id, status: "ok", ...(r.note ? { statusNote: r.note } : {}) });
			return { ok: true };
		} catch (e) {
			const msg = c.kind === "mcp" && c.url ? humanizeMcpError(e, { transport: c.transport ?? "streamable-http", url: c.url, secret: null }) : (e as Error).message || "The test failed unexpectedly. Try again.";
			await ctx.runMutation(internal.connections.recordTest, { id, status: "failed", lastError: msg });
			return { ok: false, reason: msg };
		}
	},
});
