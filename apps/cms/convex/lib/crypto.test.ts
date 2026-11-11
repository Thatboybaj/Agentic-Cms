// Handoff 04 step 1: sealing round-trips, binds to its tenant (AAD), rotates, and fails closed.
import { expect, test } from "vitest";
import { aadFor, hintOf, open, seal, SecretError } from "./crypto";

const key = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const env1 = { CMS_SECRETS_KEY_V1: key() };

test("round-trips; another tenant's AAD can't open it", async () => {
	const { ciphertext, keyVersion } = await seal("sk-test-123", aadFor("s1", "connection", "c1"), env1);
	expect(keyVersion).toBe(1);
	expect(ciphertext).not.toContain("sk-test");
	expect(await open(ciphertext, aadFor("s1", "connection", "c1"), env1)).toBe("sk-test-123");
	await expect(open(ciphertext, aadFor("s2", "connection", "c1"), env1)).rejects.toBeInstanceOf(SecretError);
});

test("the newest key seals; older keys still open (rotation)", async () => {
	const old = await seal("a", "x", env1);
	const env2 = { ...env1, CMS_SECRETS_KEY_V2: key() };
	const fresh = await seal("b", "x", env2);
	expect(fresh.keyVersion).toBe(2);
	expect(await open(old.ciphertext, "x", env2)).toBe("a");
});

test("no key configured or wrong key fails closed with a sentence", async () => {
	await expect(seal("a", "x", {})).rejects.toThrow(/No CMS_SECRETS_KEY/);
	const { ciphertext } = await seal("a", "x", env1);
	await expect(open(ciphertext, "x", { CMS_SECRETS_KEY_V1: key() })).rejects.toThrow(/can't be read/);
	expect(hintOf("sk-abcdef1234")).toBe("••••1234");
});
