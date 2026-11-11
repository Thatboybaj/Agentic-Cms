// Where the visual-asset agent gets its connections and keys (handoff 04 step 4). On Convex, a Node action runs the
// agent inside withConnections(...) with the site's rows and decrypted secrets (AsyncLocalStorage keeps concurrent
// slot runs apart). Without a scope (the backend-off prototype), it falls back to the local JSON store.
import { AsyncLocalStorage } from "node:async_hooks";
import type { IConnection } from "../../features/connections/catalog";
import { ConnectionError, humanizeMcpError, withMcpClient, type IMcpTarget } from "../mcp";

export interface IConnectionDeps {
	/** This site's connections (no secrets). */
	list(): Promise<IConnection[]>;
	/** The decrypted key for one of this site's connections, or null. */
	secret(connectionId: string): Promise<string | null>;
}

const scope = new AsyncLocalStorage<{ siteId: string; deps: IConnectionDeps }>();

export function withConnections<T>(siteId: string, deps: IConnectionDeps, fn: () => Promise<T>): Promise<T> {
	return scope.run({ siteId, deps }, fn);
}

const local = () => import("../connections");
const MCP_CALL_TIMEOUT_MS = 120_000;

export async function listConnections(siteId: string): Promise<IConnection[]> {
	const s = scope.getStore();
	if (!s) return (await local()).listConnections(siteId);
	if (s.siteId !== siteId) return []; // isolation: a scope only ever serves its own site
	return s.deps.list();
}

export async function getConnectionForSite(id: string, siteId: string): Promise<IConnection | null> {
	const s = scope.getStore();
	if (!s) return (await local()).getConnectionForSite(id, siteId);
	if (s.siteId !== siteId) return null;
	return (await s.deps.list()).find((c) => c.id === id) ?? null;
}

export async function getSecret(id: string): Promise<string | null> {
	const s = scope.getStore();
	if (!s) return (await local()).getSecret(id);
	if (!(await s.deps.list()).some((c) => c.id === id)) return null;
	return s.deps.secret(id);
}

const mcpTarget = (c: IConnection, secret: string | null): IMcpTarget => ({ transport: c.transport ?? "streamable-http", url: c.url, command: c.command, args: c.args, secret });

/** Calls a tool on an enabled HTTP MCP connection. Throws ConnectionError with a human sentence. */
export async function callMcpTool(id: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
	const s = scope.getStore();
	if (!s) return (await local()).callMcpTool(id, toolName, args);
	const c = (await s.deps.list()).find((x) => x.id === id);
	if (!c) throw new ConnectionError("That connection no longer exists for this site.");
	if (c.kind !== "mcp") throw new ConnectionError(`${c.label} isn't an MCP server.`);
	if (!c.enabled) throw new ConnectionError(`${c.label} is turned off in Settings → Connections.`);
	if (c.transport === "stdio") throw new ConnectionError("Local (stdio) MCP servers can't run in production. Use an HTTP MCP server.");
	const target = mcpTarget(c, await s.deps.secret(id));
	try {
		const result = await withMcpClient(target, (client, signal) => client.callTool({ name: toolName, arguments: args }, undefined, { signal, timeout: MCP_CALL_TIMEOUT_MS }), MCP_CALL_TIMEOUT_MS);
		if (result && (result as { isError?: boolean }).isError) {
			const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
			const text = content.find((p) => p.type === "text")?.text?.replace(/\s+/g, " ").slice(0, 200);
			throw new ConnectionError(`${c.label} couldn't run ${toolName}${text ? `: ${text}` : "."}`);
		}
		return result;
	} catch (e) {
		if (e instanceof ConnectionError && !/No response from the MCP server/.test(e.message)) throw e;
		throw new ConnectionError(humanizeMcpError(e, { ...target, secret: null }));
	}
}
