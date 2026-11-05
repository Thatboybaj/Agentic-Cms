import "server-only";
// AES-256-GCM sealing for provider secrets at rest. Key = CMS_SECRET_KEY (any high-entropy string; a 32-byte
// random value, e.g. `openssl rand -base64 32`, is recommended). It is stretched with SHA-256 to 32 bytes.
// Without CMS_SECRET_KEY, local dev storage is UNENCRYPTED (plain prefix) and the UI warns about it.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENC = "enc:v1:";
const PLAIN = "plain:";

const keyFromEnv = (): Buffer | null => {
	const raw = process.env.CMS_SECRET_KEY;
	return raw && raw.trim() ? createHash("sha256").update(raw.trim(), "utf8").digest() : null;
};

export const encryptionEnabled = (): boolean => keyFromEnv() !== null;

/** Seal a secret for storage. Encrypted when CMS_SECRET_KEY is set; otherwise stored plainly (local dev only). */
export function seal(secret: string): string {
	const key = keyFromEnv();
	if (!key) return PLAIN + Buffer.from(secret, "utf8").toString("base64");
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${ENC}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export class SecretUnavailableError extends Error {}

/** Open a sealed secret. Throws SecretUnavailableError if it is encrypted and the key is missing or wrong. */
export function unseal(stored: string): string {
	if (stored.startsWith(PLAIN)) return Buffer.from(stored.slice(PLAIN.length), "base64").toString("utf8");
	if (!stored.startsWith(ENC)) throw new SecretUnavailableError("Stored secret has an unknown format. Enter the key again.");
	const key = keyFromEnv();
	if (!key) throw new SecretUnavailableError("This key is encrypted at rest. Set CMS_SECRET_KEY on the server to use it.");
	const [iv, tag, data] = stored.slice(ENC.length).split(":");
	try {
		const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
		decipher.setAuthTag(Buffer.from(tag, "base64"));
		return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
	} catch {
		throw new SecretUnavailableError("This key can't be decrypted with the current CMS_SECRET_KEY. Enter the key again.");
	}
}

export const isEncrypted = (stored: string) => stored.startsWith(ENC);

/** "••••a1b2" — the only form a secret is ever shown in after entry. */
export const hintOf = (secret: string) => {
	const s = secret.trim();
	return s.length >= 12 ? `••••${s.slice(-4)}` : "••••"; // short secrets: show nothing of them
};
