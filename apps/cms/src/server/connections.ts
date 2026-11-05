import "server-only";
// Connections — the server contract the visual-asset agent builds on (C12/C13 in docs/uxer/00-decisions.md).
//
//   listConnections(siteId) · getConnection(id) · upsertConnection(input, secret?) · deleteConnection(id)
//   getSecret(id) · testConnection(id) · callMcpTool(id, toolName, args)
//
// Storage: apps/cms/.data/connections.json (no secrets) + .data/secrets.json (secrets only; AES-256-GCM when
// CMS_SECRET_KEY is set, otherwise UNENCRYPTED local dev storage). Secrets never leave this module except via
// getSecret(), which no route calls with a response body. Tenant isolation: every list/read-by-site filters siteId.
import { randomUUID } from "node:crypto";
import { LUMEN_ID } from "../lib/seed";
import {
	PROVIDERS,
	kindOf,
	type IConnection,
	type IConnectionInput,
	type IConnectionTool,
	type TConnectionKind,
	type TConnectionProvider,
	type TUsedFor,
} from "../features/connections/catalog";
import { exclusive, readJson, writeJson } from "./json-store";
import { ConnectionError, humanizeMcpError, withMcpClient, type IMcpTarget } from "./mcp";
import { probeApi } from "./probes";
import { SecretUnavailableError, encryptionEnabled, hintOf, isEncrypted, seal, unseal } from "./secret-box";

export type { IConnection, IConnectionInput, IConnectionTool, TConnectionKind, TConnectionProvider, TUsedFor };
export { ConnectionError };

const CONNECTIONS_FILE = "connections.json";
const SECRETS_FILE = "secrets.json";
const MAX_TOOL_PAGES = 5;
export const MCP_CALL_TIMEOUT_MS = 120_000; // image generation is slow

type TStored = Omit<IConnection, "hasSecret">;
interface IConnectionsFile {
	version: 1;
	connections: TStored[];
}
interface ISecretsFile {
	_comment: string;
	secrets: Record<string, string>;
}

export class ConnectionNotFoundError extends Error {
	constructor() {
		super("That connection doesn't exist for this site.");
	}
}
export class ConnectionInputError extends Error {}

// ---- storage -----------------------------------------------------------------

function seedFile(): IConnectionsFile {
	return {
		version: 1,
		connections: [
			{
				id: "conn-lumen-openverse",
				siteId: LUMEN_ID,
				kind: "web-source",
				provider: "openverse",
				label: "Openverse",
				usedFor: ["stock"],
				enabled: true,
				status: "untested",
				createdAt: new Date().toISOString(),
			},
		],
	};
}

/** Read-or-seed without taking the lock — only call inside `exclusive` (or via loadConnections). */
async function readOrSeed(): Promise<IConnectionsFile> {
	const file = await readJson<IConnectionsFile>(CONNECTIONS_FILE);
	if (file) return file;
	// Seed on first read only: Lumen Dental gets keyless Openverse so sourcing works out of the box.
	const seeded = seedFile();
	await writeJson(CONNECTIONS_FILE, seeded);
	return seeded;
}

/** Lock-free read for read paths; seeding (a write) takes the lock. Never call inside `exclusive`. */
async function loadConnections(): Promise<IConnectionsFile> {
	return (await readJson<IConnectionsFile>(CONNECTIONS_FILE)) ?? exclusive(readOrSeed);
}

const secretsComment = () =>
	encryptionEnabled()
		? "Provider secrets, AES-256-GCM sealed with CMS_SECRET_KEY. Never commit this file."
		: "LOCAL DEV STORAGE — UNENCRYPTED (base64 only). Set CMS_SECRET_KEY to encrypt at rest. Never commit this file.";

async function loadSecrets(): Promise<ISecretsFile> {
	return (await readJson<ISecretsFile>(SECRETS_FILE)) ?? { _comment: secretsComment(), secrets: {} };
}

async function saveSecrets(file: ISecretsFile): Promise<void> {
	await writeJson(SECRETS_FILE, { ...file, _comment: secretsComment() });
}

const toPublic = (c: TStored, secrets: ISecretsFile): IConnection => {
	const hasSecret = typeof secrets.secrets[c.id] === "string";
	const out: IConnection = { ...c, hasSecret };
	if (!hasSecret) delete out.secretHint;
	return out;
};

/** Whether secrets are encrypted at rest, and whether any stored secret needs a key this server lacks. */
export async function storageInfo(): Promise<{ encrypted: boolean; lockedSecrets: number }> {
	const encrypted = encryptionEnabled();
	const secrets = await loadSecrets();
	const lockedSecrets = encrypted ? 0 : Object.values(secrets.secrets).filter(isEncrypted).length;
	return { encrypted, lockedSecrets };
}

// ---- reads ---------------------------------------------------------------------

export async function listConnections(siteId: string): Promise<IConnection[]> {
	const [file, secrets] = await Promise.all([loadConnections(), loadSecrets()]);
	return file.connections.filter((c) => c.siteId === siteId).map((c) => toPublic(c, secrets));
}

export async function getConnection(id: string): Promise<IConnection | null> {
	const [file, secrets] = await Promise.all([loadConnections(), loadSecrets()]);
	const c = file.connections.find((x) => x.id === id);
	return c ? toPublic(c, secrets) : null;
}

/** Tenant-checked read: null unless the connection belongs to `siteId`. Routes use this. */
export async function getConnectionForSite(id: string, siteId: string): Promise<IConnection | null> {
	const c = await getConnection(id);
	return c && c.siteId === siteId ? c : null;
}

/** Server-only. Never return this from a route, never put it in a prompt, never log it. */
export async function getSecret(id: string): Promise<string | null> {
	const stored = (await loadSecrets()).secrets[id];
	return stored ? unseal(stored) : null;
}

// ---- writes --------------------------------------------------------------------

const MODEL_MAX = 200;

function normalize(input: IConnectionInput, prev: TStored | undefined): TStored {
	const spec = PROVIDERS[input.provider];
	if (!spec) throw new ConnectionInputError("Unknown provider.");
	const kind = kindOf(input.provider);
	const next: TStored = {
		id: prev?.id ?? `conn-${randomUUID()}`,
		siteId: input.siteId,
		kind,
		provider: input.provider,
		label: (input.label ?? prev?.label ?? spec.label).trim().slice(0, 80) || spec.label,
		usedFor: [...new Set(input.usedFor ?? prev?.usedFor ?? spec.defaultUsedFor)],
		enabled: input.enabled ?? prev?.enabled ?? true,
		status: prev?.status ?? "untested",
		statusNote: prev?.statusNote,
		lastTestedAt: prev?.lastTestedAt,
		lastError: prev?.lastError,
		secretHint: prev?.secretHint,
		createdAt: prev?.createdAt ?? new Date().toISOString(),
	};
	if (spec.model) {
		const model = (input.model ?? prev?.model ?? "").trim().slice(0, MODEL_MAX);
		if (model) next.model = model;
	}
	if (kind === "mcp") {
		next.transport = input.transport ?? prev?.transport ?? "streamable-http";
		if (next.transport === "stdio") {
			const command = (input.command ?? prev?.command ?? "").trim();
			if (!command) throw new ConnectionInputError("Enter the command that starts the MCP server.");
			next.command = command;
			next.args = (input.args ?? prev?.args ?? []).map((a) => a.trim()).filter(Boolean);
		} else {
			const url = (input.url ?? prev?.url ?? "").trim();
			try {
				const u = new URL(url);
				if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
			} catch {
				throw new ConnectionInputError("Enter the server's full URL, starting with https://.");
			}
			next.url = url;
		}
		next.tools = prev?.tools;
		const toolName = input.toolName ?? prev?.toolName;
		if (toolName) {
			if (next.tools && !next.tools.some((t) => t.name === toolName)) throw new ConnectionInputError(`The server has no tool called "${toolName}". Test the connection, then pick from its tools.`);
			next.toolName = toolName;
		}
	}
	return next;
}

const targetChanged = (a: TStored | undefined, b: TStored) =>
	!a || a.transport !== b.transport || a.url !== b.url || a.command !== b.command || (a.args ?? []).join("\u0000") !== (b.args ?? []).join("\u0000");

/**
 * Create (no `input.id`) or update a connection. `secret`: a string sets/replaces it, `null` removes it,
 * `undefined` keeps the stored one. Changing the endpoint or secret resets status to "untested".
 */
export async function upsertConnection(input: IConnectionInput, secret?: string | null): Promise<IConnection> {
	const cleanSecret = typeof secret === "string" ? secret.trim() : secret;
	if (typeof cleanSecret === "string" && !cleanSecret) throw new ConnectionInputError("The key is empty.");
	if (cleanSecret && PROVIDERS[input.provider]?.secret === "none") throw new ConnectionInputError(`${PROVIDERS[input.provider].label} doesn't take a key.`);
	return exclusive(async () => {
		const [file, secrets] = await Promise.all([readOrSeed(), loadSecrets()]);
		const idx = input.id ? file.connections.findIndex((c) => c.id === input.id) : -1;
		const prev = idx >= 0 ? file.connections[idx] : undefined;
		if (input.id && (!prev || prev.siteId !== input.siteId)) throw new ConnectionNotFoundError();
		if (prev && prev.provider !== input.provider) throw new ConnectionInputError("A connection's provider can't change. Add a new connection instead.");
		const next = normalize(input, prev);
		if (targetChanged(prev, next) || cleanSecret !== undefined) {
			next.status = "untested";
			delete next.lastError;
			delete next.statusNote;
			if (prev && targetChanged(prev, next)) {
				delete next.tools;
				delete next.toolName;
			}
		}
		if (cleanSecret === null) {
			delete secrets.secrets[next.id];
			delete next.secretHint;
		} else if (cleanSecret) {
			secrets.secrets[next.id] = seal(cleanSecret);
			next.secretHint = hintOf(cleanSecret);
		}
		if (idx >= 0) file.connections[idx] = next;
		else file.connections.push(next);
		if (cleanSecret !== undefined) await saveSecrets(secrets);
		await writeJson(CONNECTIONS_FILE, file);
		return toPublic(next, secrets);
	});
}

export async function deleteConnection(id: string): Promise<void> {
	await exclusive(async () => {
		const [file, secrets] = await Promise.all([readOrSeed(), loadSecrets()]);
		const before = file.connections.length;
		file.connections = file.connections.filter((c) => c.id !== id);
		if (file.connections.length === before) return;
		await writeJson(CONNECTIONS_FILE, file);
		if (secrets.secrets[id]) {
			delete secrets.secrets[id];
			await saveSecrets(secrets);
		}
	});
}

async function patchStatus(id: string, patch: Partial<TStored>, clear: (keyof TStored)[]): Promise<IConnection | null> {
	return exclusive(async () => {
		const [file, secrets] = await Promise.all([readOrSeed(), loadSecrets()]);
		const c = file.connections.find((x) => x.id === id);
		if (!c) return null; // deleted while the test was in flight
		Object.assign(c, patch);
		for (const k of clear) delete c[k];
		await writeJson(CONNECTIONS_FILE, file);
		return toPublic(c, secrets);
	});
}

// ---- network -------------------------------------------------------------------

const mcpTarget = (c: IConnection, secret: string | null): IMcpTarget => ({ transport: c.transport ?? "streamable-http", url: c.url, command: c.command, args: c.args, secret });

const pickImageTool = (tools: IConnectionTool[]): string | undefined => {
	if (tools.length === 1) return tools[0].name;
	const hits = tools.filter((t) => /image|generat|render|draw|picture/i.test(t.name));
	return hits.length === 1 ? hits[0].name : undefined;
};

/** Real network test. Updates status / lastTestedAt / lastError / tools (MCP) and returns the updated record. */
export async function testConnection(id: string): Promise<IConnection> {
	const c = await getConnection(id);
	if (!c) throw new ConnectionNotFoundError();
	const lastTestedAt = new Date().toISOString();
	let secret: string | null = null;
	try {
		secret = await getSecret(id);
	} catch (e) {
		const msg = e instanceof SecretUnavailableError ? e.message : "The stored key can't be read. Enter it again.";
		return (await patchStatus(id, { status: "failed", lastTestedAt, lastError: msg }, ["statusNote"])) ?? c;
	}
	try {
		if (c.kind === "mcp") {
			const tools = await withMcpClient(mcpTarget(c, secret), async (client, signal) => {
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
			const note = tools.length ? `${tools.length} tool${tools.length === 1 ? "" : "s"} available` : "Connected, but the server lists no tools";
			const patch: Partial<TStored> = { status: tools.length ? "ok" : "failed", lastTestedAt, tools, statusNote: note };
			if (!tools.length) patch.lastError = "The server lists no tools, so there is nothing to generate images with.";
			if (keep) patch.toolName = keep;
			return (await patchStatus(id, patch, [...(tools.length ? (["lastError"] as const) : []), ...(keep ? [] : (["toolName"] as const))])) ?? c;
		}
		const result = await probeApi(c.provider, secret);
		return (await patchStatus(id, { status: "ok", lastTestedAt, ...(result.note ? { statusNote: result.note } : {}) }, ["lastError", ...(result.note ? [] : (["statusNote"] as const))])) ?? c;
	} catch (e) {
		const msg = c.kind === "mcp" ? humanizeMcpError(e, mcpTarget(c, null)) : e instanceof ConnectionError ? e.message : "The test failed unexpectedly. Try again.";
		return (await patchStatus(id, { status: "failed", lastTestedAt, lastError: msg }, ["statusNote"])) ?? c;
	}
}

/**
 * Call a tool on an enabled MCP connection (the visual-asset agent's generate path). Returns the raw MCP
 * CallToolResult. Throws ConnectionError (human sentence) on failure or when the tool reports isError.
 * Callers must never put the connection's secret or raw tool output containing it into prompts.
 */
export async function callMcpTool(id: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
	const c = await getConnection(id);
	if (!c) throw new ConnectionNotFoundError();
	if (c.kind !== "mcp") throw new ConnectionError(`${c.label} isn't an MCP server.`);
	if (!c.enabled) throw new ConnectionError(`${c.label} is turned off in Settings → Connections.`);
	let secret: string | null;
	try {
		secret = await getSecret(id);
	} catch (e) {
		throw new ConnectionError(e instanceof SecretUnavailableError ? e.message : "The stored key can't be read. Enter it again.");
	}
	const target = mcpTarget(c, secret);
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
