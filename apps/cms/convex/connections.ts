// Connections (handoff 04 step 2; api-map §8): the site's image providers, MCP servers, licensed sources and the
// diagram LLM. Keys are sealed per tenant (lib/crypto.ts) into `secrets`; nothing here ever returns a secret, only
// hasSecret + secretHint. Validation and wording are the prototype's (src/server/connections.ts). No stdio MCP in
// production: only HTTPS servers (http://localhost allowed on dev deployments).
import { v } from "convex/values";
import { kindOf, PROVIDERS, type IConnection, type TConnectionProvider, type TUsedFor } from "../src/features/connections/catalog";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { aadFor, hintOf, seal } from "./lib/crypto";
import { siteAction, siteMutation, siteQuery } from "./lib/functions";
import { internal } from "./_generated/api";

type TResult = { ok: true; id?: string } | { ok: false; reason: string };
const fail = (reason: string): TResult => ({ ok: false, reason });
const providerIds = Object.keys(PROVIDERS) as TConnectionProvider[];
const vUsedFor = v.union(v.literal("brand_imagery"), v.literal("text_in_image"), v.literal("volume"), v.literal("diagram"), v.literal("stock"));
const devDeployment = () => (process.env.FRONTEND_URL ?? "").startsWith("http://localhost");

/** URL rule shared with the Node test (which also resolves DNS and refuses private ranges before connecting). */
export function urlError(url: string): string | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return "Enter the server's full URL, starting with https://.";
	}
	const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
	if (u.protocol !== "https:" && !(u.protocol === "http:" && local && devDeployment())) return "Use an https:// URL (http://localhost only works on a development deployment).";
	if (!local && (/^(10|127|0)\./.test(u.hostname) || /^192\.168\./.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname) || /^169\.254\./.test(u.hostname) || /^\[?(::1|f[cd]|fe80)/i.test(u.hostname) || /(^|\.)internal$|\.local$/i.test(u.hostname))) return "That address is on a private network · use the server's public https:// URL.";
	return null;
}

function toPublic(c: Doc<"connections">): IConnection {
	return {
		id: c._id,
		siteId: c.siteId,
		kind: c.kind,
		provider: c.provider as TConnectionProvider,
		label: c.label,
		...(c.transport ? { transport: c.transport } : {}),
		...(c.url ? { url: c.url } : {}),
		...(c.model ? { model: c.model } : {}),
		...(c.toolName ? { toolName: c.toolName } : {}),
		...(c.tools ? { tools: c.tools } : {}),
		usedFor: c.usedFor as TUsedFor[],
		enabled: c.enabled,
		status: c.status,
		...(c.statusNote ? { statusNote: c.statusNote } : {}),
		...(c.lastTestedAt ? { lastTestedAt: new Date(c.lastTestedAt).toISOString() } : {}),
		...(c.lastError ? { lastError: c.lastError } : {}),
		hasSecret: !!c.secretId,
		...(c.secretHint ? { secretHint: c.secretHint } : {}),
		createdAt: new Date(c.createdAt).toISOString(),
	};
}

export async function siteConnections(ctx: QueryCtx, siteId: Id<"sites">) {
	return ctx.db.query("connections").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
}

export const list = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => ({ connections: (await siteConnections(ctx, siteId)).map(toPublic), storage: { encrypted: true, lockedSecrets: 0 } }),
});

export const upsert = siteMutation({
	permission: "repo.connect",
	args: {
		id: v.optional(v.id("connections")),
		provider: v.string(),
		label: v.optional(v.string()),
		transport: v.optional(v.union(v.literal("streamable-http"), v.literal("sse"), v.literal("stdio"))),
		url: v.optional(v.string()),
		model: v.optional(v.string()),
		toolName: v.optional(v.string()),
		usedFor: v.optional(v.array(vUsedFor)),
		enabled: v.optional(v.boolean()),
		/** Write-only: string sets/replaces, null removes, absent keeps. */
		secret: v.optional(v.union(v.string(), v.null())),
	},
	handler: async (ctx, a): Promise<TResult> => {
		const { site, user } = ctx.access;
		if (!providerIds.includes(a.provider as TConnectionProvider)) return fail("Unknown provider.");
		const provider = a.provider as TConnectionProvider;
		const spec = PROVIDERS[provider];
		const prev = a.id ? await ctx.db.get(a.id) : null;
		if (a.id && (!prev || prev.siteId !== site._id)) return fail("Connection not found");
		if (prev && prev.provider !== provider) return fail("A connection's provider can't change. Add a new connection instead.");
		const secret = typeof a.secret === "string" ? a.secret.trim() : a.secret;
		if (typeof secret === "string" && !secret) return fail("The key is empty.");
		if (secret && spec.secret === "none") return fail(`${spec.label} doesn't take a key.`);
		const kind = kindOf(provider);
		let url: string | undefined;
		let transport: "streamable-http" | "sse" | undefined;
		if (kind === "mcp") {
			if ((a.transport ?? prev?.transport) === "stdio") return fail("Local (stdio) MCP servers can't run in production. Use an HTTP MCP server.");
			transport = (a.transport as "streamable-http" | "sse" | undefined) ?? prev?.transport ?? "streamable-http";
			url = (a.url ?? prev?.url ?? "").trim();
			const why = urlError(url);
			if (why) return fail(why);
		}
		const toolName = a.toolName ?? prev?.toolName;
		const targetChanged = !prev || prev.url !== url || prev.transport !== transport;
		if (toolName && !targetChanged && prev?.tools && !prev.tools.some((t) => t.name === toolName)) return fail(`The server has no tool called "${toolName}". Test the connection, then pick from its tools.`);
		const model = spec.model ? (a.model ?? prev?.model ?? "").trim().slice(0, 200) : "";
		const fields = {
			kind,
			provider,
			label: (a.label ?? prev?.label ?? spec.label).trim().slice(0, 80) || spec.label,
			usedFor: [...new Set(a.usedFor ?? (prev?.usedFor as TUsedFor[] | undefined) ?? spec.defaultUsedFor)],
			enabled: a.enabled ?? prev?.enabled ?? true,
			...(transport ? { transport } : {}),
			...(url ? { url } : {}),
			...(model ? { model } : {}),
			...(toolName && !targetChanged ? { toolName } : {}),
		};
		const reset = targetChanged || secret !== undefined ? { status: "untested" as const, lastError: undefined, statusNote: undefined, ...(targetChanged ? { tools: undefined, toolName: undefined } : {}) } : {};
		const id = prev ? prev._id : await ctx.db.insert("connections", { workspaceId: site.workspaceId, siteId: site._id, ...fields, status: "untested", createdAt: Date.now() });
		if (prev) await ctx.db.patch(id, { ...fields, ...reset });
		if (secret === null && prev?.secretId) {
			await ctx.db.delete(prev.secretId);
			await ctx.db.patch(id, { secretId: undefined, secretHint: undefined });
		} else if (secret) {
			const sealed = await seal(secret, aadFor(site._id, "connection", id));
			const old = prev?.secretId;
			const secretId = await ctx.db.insert("secrets", { workspaceId: site.workspaceId, siteId: site._id, ownerKind: "connection", ownerId: id, ciphertext: sealed.ciphertext, keyVersion: sealed.keyVersion, hint: hintOf(secret), createdAt: Date.now() });
			await ctx.db.patch(id, { secretId, secretHint: hintOf(secret) });
			if (old) await ctx.db.delete(old);
		}
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: user, action: prev ? "updated connection" : "added connection", target: fields.label, detail: `${spec.label}${secret ? " · key stored encrypted" : ""}` });
		return { ok: true, id };
	},
});

export const remove = siteMutation({
	permission: "repo.connect",
	args: { id: v.id("connections") },
	handler: async (ctx, { siteId, id }): Promise<TResult> => {
		const c = await ctx.db.get(id);
		if (!c || c.siteId !== siteId) return fail("Connection not found");
		if (c.secretId) await ctx.db.delete(c.secretId);
		await ctx.db.delete(id);
		await audit(ctx, { workspaceId: ctx.access.site.workspaceId, siteId, actor: ctx.access.user, action: "removed connection", target: c.label });
		return { ok: true };
	},
});

export const test = siteAction({
	permission: "repo.connect",
	args: { id: v.id("connections") },
	handler: async (ctx, { siteId, id }): Promise<TResult> => {
		const r = await ctx.runAction(internal.connectionsNode.test, { siteId, id });
		return r.ok ? { ok: true } : { ok: false, reason: r.reason };
	},
});

// ─── Internal (Node actions only) ────────────────────────────────────────────

export const forAgent = internalQuery({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => (await siteConnections(ctx, siteId)).map((c) => ({ pub: toPublic(c), secretId: c.secretId ?? null })),
});

export const cipherFor = internalQuery({
	args: { siteId: v.id("sites"), connectionId: v.id("connections") },
	handler: async (ctx, { siteId, connectionId }) => {
		const c = await ctx.db.get(connectionId);
		if (!c || c.siteId !== siteId || !c.secretId) return null;
		const s = await ctx.db.get(c.secretId);
		if (!s || s.siteId !== siteId || s.ownerId !== connectionId) return null;
		return { ciphertext: s.ciphertext, aad: aadFor(siteId, "connection", connectionId) };
	},
});

export const recordTest = internalMutation({
	args: { id: v.id("connections"), status: v.union(v.literal("ok"), v.literal("failed")), statusNote: v.optional(v.string()), lastError: v.optional(v.string()), tools: v.optional(v.array(v.object({ name: v.string(), description: v.optional(v.string()) }))), toolName: v.optional(v.string()) },
	handler: async (ctx, a) => {
		const c = await ctx.db.get(a.id);
		if (!c) return;
		await ctx.db.patch(a.id, { status: a.status, lastTestedAt: Date.now(), statusNote: a.statusNote, lastError: a.lastError, ...(a.tools ? { tools: a.tools } : {}), ...(a.toolName ? { toolName: a.toolName } : {}) });
	},
});
