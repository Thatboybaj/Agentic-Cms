// Per-tenant secret sealing (handoff 04 step 1): AES-256-GCM via Web Crypto (works in the default and Node runtimes).
// Ciphertext "<keyVersion>.<iv>.<ct>" (base64url). Keys: CMS_SECRETS_KEY_V<n> (32 random bytes, base64) in the Convex
// env; the newest version seals, any configured version opens (rotation re-seals with the newest). The AAD binds
// a ciphertext to its site + owner, so a row copied to another tenant won't decrypt.

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export class SecretError extends Error {}

function keyVersions(env: Record<string, string | undefined> = process.env): number[] {
	return Object.keys(env)
		.map((k) => /^CMS_SECRETS_KEY_V(\d+)$/.exec(k)?.[1])
		.filter((x): x is string => !!x && !!env[`CMS_SECRETS_KEY_V${x}`])
		.map(Number)
		.sort((a, b) => b - a);
}

async function keyFor(version: number, env: Record<string, string | undefined> = process.env): Promise<CryptoKey> {
	const raw = env[`CMS_SECRETS_KEY_V${version}`];
	if (!raw) throw new SecretError(`Secret key v${version} isn't configured on this deployment`);
	const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
	if (bytes.length !== 32) throw new SecretError(`CMS_SECRETS_KEY_V${version} must be 32 bytes (base64)`);
	return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export const currentKeyVersion = (env?: Record<string, string | undefined>) => keyVersions(env)[0] ?? null;

export async function seal(plaintext: string, aad: string, env?: Record<string, string | undefined>): Promise<{ ciphertext: string; keyVersion: number }> {
	const v = currentKeyVersion(env);
	if (v === null) throw new SecretError("No CMS_SECRETS_KEY_V<n> is configured: secrets can't be stored");
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, await keyFor(v, env), new TextEncoder().encode(plaintext)));
	return { ciphertext: `${v}.${b64u(iv)}.${b64u(ct)}`, keyVersion: v };
}

export async function open(ciphertext: string, aad: string, env?: Record<string, string | undefined>): Promise<string> {
	const [v, iv, ct] = ciphertext.split(".");
	if (!v || !iv || !ct) throw new SecretError("Malformed ciphertext");
	try {
		const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64u(iv), additionalData: new TextEncoder().encode(aad) }, await keyFor(Number(v), env), unb64u(ct));
		return new TextDecoder().decode(pt);
	} catch (e) {
		if (e instanceof SecretError) throw e;
		throw new SecretError("The stored key can't be read (wrong deployment key or tampered data). Enter it again.");
	}
}

/** "••••a1b2" — the only part of a secret anyone sees again. */
export const hintOf = (secret: string) => `••••${secret.trim().slice(-4)}`;

export const aadFor = (siteId: string, ownerKind: string, ownerId: string) => `${siteId}:${ownerKind}:${ownerId}`;
