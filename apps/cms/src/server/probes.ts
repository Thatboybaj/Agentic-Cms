// Real, lightweight auth/reachability checks per API provider. Each returns ok + optional note, or throws a
// ConnectionError with a short human sentence. Secrets go only into request headers — never into messages or logs.
import type { TConnectionProvider } from "../features/connections/catalog";
import { PROVIDERS } from "../features/connections/catalog";
import { ConnectionError } from "./mcp";
import { compatUrl } from "../lib/qwen";

export const PROBE_TIMEOUT_MS = 15_000;
const UA = "StudioAgenticCMS/0.1 (connection test; https://github.com/The-Utopia-Studio/studio-product-framework)";

export interface IProbeResult {
	note?: string;
}

async function hit(url: string, headers: Record<string, string>, label: string): Promise<Response> {
	try {
		return await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), cache: "no-store" });
	} catch (e) {
		const msg = String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? "");
		if (/timeout|aborted/i.test(msg) || (e as Error)?.name === "TimeoutError") throw new ConnectionError(`No response from ${label} within ${PROBE_TIMEOUT_MS / 1000} seconds.`);
		throw new ConnectionError(`Couldn't reach ${label}. Check the server's network connection.`);
	}
}

function expectOk(res: Response, label: string, keyed: boolean): void {
	if (res.ok) return;
	if (res.status === 401 || res.status === 403) throw new ConnectionError(keyed ? `${label} rejected the key (${res.status}). Check it and save again.` : `${label} refused the request (${res.status}).`);
	if (res.status === 429) throw new ConnectionError(`${label} is rate-limiting this server (429). Try again in a minute.`);
	throw new ConnectionError(`${label} answered with an error (${res.status}).`);
}

function need(secret: string | null, provider: TConnectionProvider): string {
	if (secret) return secret;
	throw new ConnectionError(`Add your ${PROVIDERS[provider].label} ${PROVIDERS[provider].secretLabel?.toLowerCase() ?? "key"} to test this connection.`);
}

export async function probeApi(provider: TConnectionProvider, secret: string | null): Promise<IProbeResult> {
	const label = PROVIDERS[provider].label;
	switch (provider) {
		case "openai-images": {
			const res = await hit("https://api.openai.com/v1/models", { Authorization: `Bearer ${need(secret, provider)}` }, label);
			expectOk(res, label, true);
			return { note: "Key accepted" };
		}
		case "gateway-images": {
			const key = secret?.trim() || process.env.AI_GATEWAY_API_KEY?.trim();
			if (!key) throw new ConnectionError("Add an AI Gateway key, or set AI_GATEWAY_API_KEY on the server.");
			const res = await hit("https://ai-gateway.vercel.sh/v1/credits", { Authorization: `Bearer ${key}` }, label);
			expectOk(res, label, true);
			return { note: "Key accepted" };
		}
		case "replicate": {
			const res = await hit("https://api.replicate.com/v1/account", { Authorization: `Bearer ${need(secret, provider)}` }, label);
			expectOk(res, label, true);
			const body = (await res.json().catch(() => null)) as { username?: string } | null;
			return { note: body?.username ? `Key accepted · account ${body.username}` : "Key accepted" };
		}
		case "fal": {
			// fal has no documented "whoami" endpoint. The queue status route authenticates before it looks the
			// request up: an invalid key → 401, a valid key → 404 for this all-zero request id.
			const res = await hit("https://queue.fal.run/fal-ai/fast-sdxl/requests/00000000-0000-0000-0000-000000000000/status", { Authorization: `Key ${need(secret, provider)}` }, label);
			if (res.status === 401 || res.status === 403) throw new ConnectionError(`${label} rejected the key (${res.status}). Check it and save again.`);
			if (res.status === 404 || res.ok) return { note: "Key accepted by fal's queue API · generation not tried" };
			throw new ConnectionError(`${label} answered with an error (${res.status}).`);
		}
		case "openverse": {
			const res = await hit("https://api.openverse.org/v1/images/?q=dental&page_size=1", secret ? { Authorization: `Bearer ${secret}` } : {}, label);
			expectOk(res, label, !!secret);
			const body = (await res.json().catch(() => null)) as { result_count?: number } | null;
			return { note: typeof body?.result_count === "number" ? `Search works · ${body.result_count.toLocaleString("en")} results for "dental"` : "Search works" };
		}
		case "wikimedia": {
			const res = await hit("https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=dental&srnamespace=6&srlimit=1&format=json", {}, label);
			expectOk(res, label, false);
			const body = (await res.json().catch(() => null)) as { query?: { searchinfo?: { totalhits?: number } } } | null;
			const n = body?.query?.searchinfo?.totalhits;
			return { note: typeof n === "number" ? `Search works · ${n.toLocaleString("en")} files for "dental"` : "Search works" };
		}
		case "unsplash": {
			const res = await hit("https://api.unsplash.com/search/photos?query=dental&per_page=1", { Authorization: `Client-ID ${need(secret, provider)}`, "Accept-Version": "v1" }, label);
			expectOk(res, label, true);
			return { note: "Key accepted · search works" };
		}
		case "pexels": {
			const res = await hit("https://api.pexels.com/v1/search?query=dental&per_page=1", { Authorization: need(secret, provider) }, label);
			expectOk(res, label, true);
			return { note: "Key accepted · search works" };
		}
		case "qwen": {
			const res = await hit(compatUrl("/models"), { Authorization: `Bearer ${need(secret, provider)}` }, label);
			expectOk(res, label, true);
			return { note: "Key accepted" };
		}
		default:
			throw new ConnectionError(`${label} is an MCP server; test it over MCP.`);
	}
}
