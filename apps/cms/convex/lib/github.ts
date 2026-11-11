// GitHub helpers that run in either runtime (Web Crypto): the signed install `state`, webhook signature checks, and
// the CI roll-up. The App's private key and REST calls live in gitNode.ts ("use node").

const enc = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let d = 0;
	for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return d === 0;
}

export interface IInstallState {
	siteId: string;
	userId: string;
	exp: number;
}

const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

/** state = base64url(json).hmac — binds the install round-trip to one site + user, expiring. */
export async function signState(secret: string, s: IInstallState): Promise<string> {
	const body = b64u(JSON.stringify(s));
	return `${body}.${await hmacHex(secret, body)}`;
}

export async function verifyState(secret: string, state: string, now = Date.now()): Promise<IInstallState | null> {
	const [body, sig] = state.split(".");
	if (!body || !sig) return null;
	if (!safeEqual(await hmacHex(secret, body), sig)) return null;
	try {
		const s = JSON.parse(unb64u(body)) as IInstallState;
		return s.exp > now && s.siteId && s.userId ? s : null;
	} catch {
		return null;
	}
}

/** X-Hub-Signature-256 over the raw body. */
export async function verifyWebhook(secret: string, rawBody: string, header: string | null): Promise<boolean> {
	if (!header?.startsWith("sha256=")) return false;
	return safeEqual(`sha256=${await hmacHex(secret, rawBody)}`, header);
}

export type TCi = "pending" | "passing" | "failing" | "none";

/**
 * Rolls every check run + commit status on a head SHA into one CI state: any failure → failing; anything still
 * running → pending; at least one success and nothing else → passing; nothing configured → none.
 */
export function rollUpCi(checkRuns: { status: string; conclusion: string | null; name: string }[], statuses: { state: string; context: string }[]): { ci: TCi; detail?: string } {
	const bad = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
	const failing = [...checkRuns.filter((c) => c.status === "completed" && c.conclusion && bad.has(c.conclusion)).map((c) => c.name), ...statuses.filter((s) => s.state === "failure" || s.state === "error").map((s) => s.context)];
	if (failing.length) return { ci: "failing", detail: `Failing: ${failing.slice(0, 4).join(", ")}` };
	if (checkRuns.some((c) => c.status !== "completed") || statuses.some((s) => s.state === "pending")) return { ci: "pending" };
	if (!checkRuns.length && !statuses.length) return { ci: "none" };
	return { ci: "passing" };
}
