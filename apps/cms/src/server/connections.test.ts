// Storage contract for src/server/connections.ts: secrets never listed, tenant filter, AES-GCM round-trip.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const SECRET = "sk-test-DO-NOT-LEAK-1234abcd";
let dir: string;

async function load() {
	vi.resetModules();
	return import("./connections");
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "cms-conn-"));
	process.env.CMS_DATA_DIR = dir;
	delete process.env.CMS_SECRET_KEY;
});

afterEach(() => {
	delete process.env.CMS_DATA_DIR;
	delete process.env.CMS_SECRET_KEY;
	rmSync(dir, { recursive: true, force: true });
});

describe("connections storage", () => {
	it("seeds Lumen with keyless Openverse on first read, nothing else", async () => {
		const m = await load();
		const lumen = await m.listConnections("lumen");
		expect(lumen).toHaveLength(1);
		expect(lumen[0]).toMatchObject({ provider: "openverse", kind: "web-source", enabled: true, usedFor: ["stock"], hasSecret: false });
		expect(await m.listConnections("other-site")).toEqual([]);
	});

	it("never returns secrets from listConnections / getConnection / upsert, and keeps them out of connections.json", async () => {
		const m = await load();
		const c = await m.upsertConnection({ siteId: "lumen", provider: "openai-images", model: "some-model" }, SECRET);
		expect(c.hasSecret).toBe(true);
		expect(c.secretHint).toBe("••••abcd");
		const listed = JSON.stringify(await m.listConnections("lumen"));
		expect(listed).not.toContain(SECRET);
		expect(JSON.stringify(c)).not.toContain(SECRET);
		expect(JSON.stringify(await m.getConnection(c.id))).not.toContain(SECRET);
		expect(readFileSync(join(dir, "connections.json"), "utf8")).not.toContain(SECRET);
		expect(await m.getSecret(c.id)).toBe(SECRET);
	});

	it("filters by siteId (tenant isolation)", async () => {
		const m = await load();
		const a = await m.upsertConnection({ siteId: "site-a", provider: "pexels" }, "pexels-key-aaaaaaaa");
		const b = await m.upsertConnection({ siteId: "site-b", provider: "unsplash" }, "unsplash-key-bbbbbbbb");
		expect((await m.listConnections("site-a")).map((c) => c.id)).toEqual([a.id]);
		expect((await m.listConnections("site-b")).map((c) => c.id)).toEqual([b.id]);
		expect(await m.getConnectionForSite(a.id, "site-b")).toBeNull();
		// Updating another tenant's connection by id is refused.
		await expect(m.upsertConnection({ id: a.id, siteId: "site-b", provider: "pexels", label: "hijack" })).rejects.toBeInstanceOf(m.ConnectionNotFoundError);
	});

	it("encrypts at rest with CMS_SECRET_KEY (AES-256-GCM round-trip)", async () => {
		process.env.CMS_SECRET_KEY = "test-key-please-use-32-random-bytes-in-prod";
		const m = await load();
		const c = await m.upsertConnection({ siteId: "lumen", provider: "anthropic" }, SECRET);
		const raw = readFileSync(join(dir, "secrets.json"), "utf8");
		expect(raw).not.toContain(SECRET);
		expect(raw).not.toContain(Buffer.from(SECRET).toString("base64"));
		expect(raw).toContain("enc:v1:");
		expect(await m.getSecret(c.id)).toBe(SECRET);
		expect((await m.storageInfo()).encrypted).toBe(true);

		// Wrong key → secret unavailable, never garbage.
		process.env.CMS_SECRET_KEY = "a-different-key";
		await expect(m.getSecret(c.id)).rejects.toThrow(/can't be decrypted/);
	});

	it("marks unencrypted local storage and removes secrets with the connection", async () => {
		const m = await load();
		const c = await m.upsertConnection({ siteId: "lumen", provider: "replicate" }, SECRET);
		expect((await m.storageInfo()).encrypted).toBe(false);
		expect(readFileSync(join(dir, "secrets.json"), "utf8")).toContain("UNENCRYPTED");
		await m.deleteConnection(c.id);
		expect(await m.getConnection(c.id)).toBeNull();
		expect(await m.getSecret(c.id)).toBeNull();
	});

	it("resets status when the endpoint or secret changes; rejects stdio unless allowed", async () => {
		const m = await load();
		const c = await m.upsertConnection({ siteId: "lumen", provider: "custom-mcp", transport: "stdio", command: "node", args: ["server.js"] });
		const tested = await m.testConnection(c.id);
		expect(tested.status).toBe("failed");
		expect(tested.lastError).toMatch(/CMS_ALLOW_STDIO_MCP=1/);
		const moved = await m.upsertConnection({ id: c.id, siteId: "lumen", provider: "custom-mcp", transport: "streamable-http", url: "https://example.invalid/mcp" });
		expect(moved.status).toBe("untested");
		expect(moved.lastError).toBeUndefined();
	});
});
