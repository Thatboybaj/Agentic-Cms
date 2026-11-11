// MCP client plumbing (@modelcontextprotocol/sdk 1.x): Streamable HTTP with SSE fallback, or stdio (opt-in).
// Secret forms: "token" → Authorization: Bearer token · "Header-Name: value" → that header ·
// stdio: "ENV_NAME=value" → passed to the spawned process's environment.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { TMcpTransport } from "../features/connections/catalog";

export const MCP_TIMEOUT_MS = 15_000;

export interface IMcpTarget {
	transport: TMcpTransport;
	url?: string;
	command?: string;
	args?: string[];
	secret?: string | null;
}

/** A failure whose message is already a short human sentence, safe to show and store. */
export class ConnectionError extends Error {}

export const stdioAllowed = () => process.env.CMS_ALLOW_STDIO_MCP === "1";

function authHeaders(secret?: string | null): Record<string, string> {
	if (!secret) return {};
	const m = secret.match(/^([A-Za-z0-9-]+):\s+(.+)$/);
	return m ? { [m[1]]: m[2] } : { Authorization: `Bearer ${secret}` };
}

function httpUrl(raw?: string): URL {
	let url: URL;
	try {
		url = new URL(raw ?? "");
	} catch {
		throw new ConnectionError("Enter the server's full URL, starting with https://.");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") throw new ConnectionError("MCP URLs must start with https:// (or http:// for a local server).");
	return url;
}

async function stdioTransport(t: IMcpTarget): Promise<Transport> {
	if (!stdioAllowed()) throw new ConnectionError("Local (stdio) MCP servers are off: they start processes on this machine. Set CMS_ALLOW_STDIO_MCP=1 on the server to allow them.");
	if (!t.command?.trim()) throw new ConnectionError("Enter the command that starts the MCP server.");
	const { StdioClientTransport, getDefaultEnvironment } = await import("@modelcontextprotocol/sdk/client/stdio.js");
	const env = getDefaultEnvironment();
	const kv = t.secret?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/s);
	if (kv) env[kv[1]] = kv[2];
	return new StdioClientTransport({ command: t.command.trim(), args: t.args ?? [], env, stderr: "ignore" });
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		p,
		new Promise<T>((_, reject) => {
			timer = setTimeout(() => {
				onTimeout();
				reject(new ConnectionError(`No response from the MCP server within ${ms / 1000} seconds.`));
			}, ms);
		}),
	]).finally(() => clearTimeout(timer));
}

async function connectClient(t: IMcpTarget, signal: AbortSignal): Promise<Client> {
	const make = () => new Client({ name: "studio-agentic-cms", version: "0.1.0" });
	if (t.transport === "stdio") {
		const client = make();
		await client.connect(await stdioTransport(t), { timeout: MCP_TIMEOUT_MS, signal });
		return client;
	}
	const url = httpUrl(t.url);
	const requestInit: RequestInit = { headers: authHeaders(t.secret), signal };
	if (t.transport === "streamable-http") {
		const client = make();
		try {
			await client.connect(new StreamableHTTPClientTransport(url, { requestInit }), { timeout: MCP_TIMEOUT_MS, signal });
			return client;
		} catch (e) {
			await client.close().catch(() => undefined);
			if (signal.aborted || isAuthError(e)) throw e;
			// Older servers only speak the HTTP+SSE transport — fall back once (spec's backwards-compat path).
		}
	}
	const client = make();
	await client.connect(new SSEClientTransport(url, { requestInit }), { timeout: MCP_TIMEOUT_MS, signal });
	return client;
}

const isAuthError = (e: unknown) => /\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(String((e as Error)?.message ?? e));

/** Short human sentence for any MCP failure. Never includes secrets (we never put them in messages). */
export function humanizeMcpError(e: unknown, t: IMcpTarget): string {
	if (e instanceof ConnectionError) return e.message;
	const msg = String((e as Error)?.message ?? e);
	const code = (e as { code?: unknown })?.code;
	const host = (() => {
		try {
			return new URL(t.url ?? "").host;
		} catch {
			return t.command ?? "the server";
		}
	})();
	if (isAuthError(e)) return `${host} rejected the credentials. Check the token and save again.`;
	if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) return `Couldn't find ${host}. Check the URL.`;
	if (/ECONNREFUSED/i.test(msg)) return `${host} refused the connection. Is the server running?`;
	if (/timed? ?out|RequestTimeout|aborted/i.test(msg) || code === -32001) return `No response from ${host} within ${MCP_TIMEOUT_MS / 1000} seconds.`;
	if (/\b404\b|\b405\b/.test(msg)) return `${host} answered, but not as an MCP server at that path. Check the URL (often ends in /mcp or /sse).`;
	if (/ENOENT|spawn/i.test(msg)) return `Couldn't start "${t.command}". Check the command is installed on the server.`;
	if (/fetch failed|network|socket|ECONNRESET|certificate|SSL|TLS/i.test(msg)) return `Couldn't reach ${host}. Check the URL and your network.`;
	return `The MCP server returned an error: ${msg.replace(/\s+/g, " ").slice(0, 140)}`;
}

/** Connect, run `fn`, always close. Whole exchange bounded by MCP_TIMEOUT_MS (connect) + `callTimeoutMs` (work). */
export async function withMcpClient<T>(t: IMcpTarget, fn: (client: Client, signal: AbortSignal) => Promise<T>, callTimeoutMs = MCP_TIMEOUT_MS): Promise<T> {
	const ctrl = new AbortController();
	let client: Client | null = null;
	try {
		client = await withTimeout(connectClient(t, ctrl.signal), MCP_TIMEOUT_MS, () => ctrl.abort());
		const c = client;
		return await withTimeout(fn(c, ctrl.signal), callTimeoutMs, () => ctrl.abort());
	} finally {
		await client?.close().catch(() => undefined);
	}
}
