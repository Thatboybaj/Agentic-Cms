// Generate route: image APIs (OpenAI images, Replicate, fal) over HTTP, and image MCP servers (Higgsfield / custom)
// through callMcpTool. Keys come from getSecret() and go only into request headers — never into prompts, results,
// errors or logs. Every failure is a short sentence (GenerateError) so run.ts can fall through to the next route.
import type { IConnection } from "../../features/connections/catalog";
import { callMcpTool, getSecret } from "./deps";
import { withMcpClient, type IMcpTarget } from "../mcp";
import { gatewayImages } from "../../lib/gateway";

export const API_TIMEOUT_MS = 120_000;
const SCHEMA_TIMEOUT_MS = 20_000;

export class GenerateError extends Error {}

export interface IGenerateInput {
	prompt: string;
	negative: string;
	width: number;
	height: number;
	n: number;
}

export interface IGenerated {
	urls: string[];
	model?: string;
}

async function secretFor(c: IConnection, required: boolean): Promise<string | null> {
	let s: string | null;
	try {
		s = await getSecret(c.id);
	} catch {
		throw new GenerateError(`The stored ${c.label} key can't be read. Enter it again in Settings → Connections.`);
	}
	if (!s && required) throw new GenerateError(`Add your ${c.label} key in Settings → Connections.`);
	return s;
}

async function post(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(API_TIMEOUT_MS), cache: "no-store" });
	} catch (e) {
		const msg = String((e as Error)?.message ?? e);
		if ((e as Error)?.name === "TimeoutError" || /timeout|aborted/i.test(msg)) throw new GenerateError(`No response from ${label} within ${API_TIMEOUT_MS / 1000} seconds.`);
		throw new GenerateError(`Couldn't reach ${label}. Check the server's network.`);
	}
	const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!res.ok) {
		if (res.status === 401 || res.status === 403) throw new GenerateError(`${label} rejected the key (${res.status}).`);
		if (res.status === 429) throw new GenerateError(`${label} is rate-limiting or out of credit (429).`);
		if (res.status === 404) throw new GenerateError(`${label} doesn't know that model (404). Check the model id on the connection.`);
		const detail = errorDetail(json);
		throw new GenerateError(`${label} answered with an error (${res.status})${detail ? `: ${detail}` : "."}`);
	}
	return json;
}

function errorDetail(json: Record<string, unknown> | null): string {
	const e = json?.error ?? json?.detail;
	const msg = typeof e === "string" ? e : typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message : "";
	return msg.replace(/\s+/g, " ").replace(/(sk|r8|key)[-_][\w-]{6,}/gi, "•••").slice(0, 140);
}

// ─── OpenAI images ───────────────────────────────────────────────────────────

/** Nearest supported size for the model family (gpt-image-*: 1024², 1536×1024, 1024×1536; dall-e-3: 1024², 1792×1024, 1024×1792). */
export function openAiSize(model: string, w: number, h: number): string {
	const r = w / h;
	if (/^dall-e-2/i.test(model)) return "1024x1024";
	const wide = /^dall-e-3/i.test(model) ? "1792x1024" : "1536x1024";
	const tall = /^dall-e-3/i.test(model) ? "1024x1792" : "1024x1536";
	return r > 1.2 ? wide : r < 0.83 ? tall : "1024x1024";
}

async function openAi(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	const model = c.model?.trim();
	if (!model) throw new GenerateError("Set a model id on the OpenAI connection in Settings → Connections.");
	const key = (await secretFor(c, true))!;
	const size = openAiSize(model, g.width, g.height);
	const one = (n: number) => post("https://api.openai.com/v1/images/generations", { Authorization: `Bearer ${key}` }, { model, prompt: g.prompt, n, size }, "OpenAI");
	// dall-e-3 only accepts n=1 per request.
	const bodies = /^dall-e-3/i.test(model) ? await Promise.all(Array.from({ length: g.n }, () => one(1))) : [await one(g.n)];
	const urls = bodies.flatMap((b) => ((b as { data?: { url?: string; b64_json?: string }[] })?.data ?? []).map((d) => d.url ?? (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ""))).filter(Boolean);
	if (!urls.length) throw new GenerateError("OpenAI returned no images.");
	return { urls, model };
}

/** OpenAI image models through Vercel AI Gateway: the connection's key, or the server's AI_GATEWAY_API_KEY. */
async function gatewayOpenAi(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	const model = c.model?.trim() || "openai/gpt-image-2";
	const key = (await secretFor(c, false)) ?? process.env.AI_GATEWAY_API_KEY?.trim() ?? null;
	if (!key) throw new GenerateError("Add an AI Gateway key to this connection, or set AI_GATEWAY_API_KEY on the server.");
	const bare = model.replace(/^openai\//, "");
	try {
		const urls = await gatewayImages(key, { model, prompt: g.prompt, n: g.n, size: openAiSize(bare, g.width, g.height) }, AbortSignal.timeout(API_TIMEOUT_MS));
		if (!urls.length) throw new GenerateError("Vercel AI Gateway returned no images.");
		return { urls, model };
	} catch (e) {
		if (e instanceof GenerateError) throw e;
		const s = (e as { status?: number }).status;
		if ((e as Error)?.name === "TimeoutError") throw new GenerateError(`No response from Vercel AI Gateway within ${API_TIMEOUT_MS / 1000} seconds.`);
		if (s === 401 || s === 403) throw new GenerateError("Vercel AI Gateway rejected the key.");
		if (s === 402) throw new GenerateError((e as Error).message);
		if (s === 404) throw new GenerateError(`Vercel AI Gateway doesn't know the model "${model}".`);
		if (s === 429) throw new GenerateError("Vercel AI Gateway is rate-limiting or out of credit (429).");
		throw new GenerateError(`Vercel AI Gateway answered with an error${s ? ` (${s})` : ""}.`);
	}
}

// ─── Replicate (POST /v1/models/{owner}/{name}/predictions or /v1/predictions with owner/name:version) ─────

async function replicate(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	const model = c.model?.trim();
	if (!model) throw new GenerateError("Set a model id on the Replicate connection (owner/name or owner/name:version).");
	const key = (await secretFor(c, true))!;
	const input = { prompt: g.prompt, negative_prompt: g.negative, aspect_ratio: nearestAspect(g.width, g.height), num_outputs: g.n };
	const headers = { Authorization: `Bearer ${key}`, Prefer: "wait=60" };
	const url = model.includes(":") ? "https://api.replicate.com/v1/predictions" : `https://api.replicate.com/v1/models/${model.split("/").map(encodeURIComponent).join("/")}/predictions`;
	let body = (await post(url, headers, model.includes(":") ? { version: model, input } : { input }, "Replicate")) as IReplicatePrediction;
	// Prefer: wait holds up to 60 s; poll briefly after that.
	const deadline = Date.now() + API_TIMEOUT_MS;
	while (body && (body.status === "starting" || body.status === "processing") && body.urls?.get && Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, 2500));
		const res = await fetch(body.urls.get, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000), cache: "no-store" }).catch(() => null);
		if (!res?.ok) break;
		body = (await res.json()) as IReplicatePrediction;
	}
	if (body?.status === "failed" || body?.status === "canceled") throw new GenerateError(`Replicate's prediction ${body.status}${body.error ? `: ${String(body.error).slice(0, 120)}` : "."}`);
	const out = body?.output;
	const urls = (Array.isArray(out) ? out : [out]).filter((u): u is string => typeof u === "string" && /^(https?:|data:image)/.test(u));
	if (!urls.length) throw new GenerateError(body?.status === "succeeded" ? "Replicate returned no images." : "Replicate didn't finish in time.");
	return { urls: urls.slice(0, g.n), model };
}
interface IReplicatePrediction {
	status?: string;
	output?: unknown;
	error?: unknown;
	urls?: { get?: string };
}

function nearestAspect(w: number, h: number): string {
	const r = w / h;
	const opts: [string, number][] = [["1:1", 1], ["16:9", 16 / 9], ["3:2", 1.5], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:4", 0.75], ["9:16", 9 / 16]];
	return opts.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r))[0][0];
}

// ─── fal (synchronous POST https://fal.run/{model_id}, Authorization: Key …) ─────────────────────────

async function fal(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	const model = c.model?.trim().replace(/^\/+|\/+$/g, "");
	if (!model) throw new GenerateError("Set a model id on the fal connection (for example the endpoint id from the model's API page).");
	const key = (await secretFor(c, true))!;
	const body = (await post(`https://fal.run/${model.split("/").map(encodeURIComponent).join("/")}`, { Authorization: `Key ${key}` }, { prompt: g.prompt, negative_prompt: g.negative, image_size: { width: g.width, height: g.height }, num_images: g.n }, "fal")) as { images?: { url?: string }[] } | null;
	const urls = (body?.images ?? []).map((i) => i.url).filter((u): u is string => typeof u === "string");
	if (!urls.length) throw new GenerateError("fal returned no images.");
	return { urls, model };
}

// ─── MCP (Higgsfield / custom image servers) ─────────────────────────────────

interface IJsonSchema {
	type?: string;
	properties?: Record<string, IJsonSchema>;
	required?: string[];
	enum?: unknown[];
}

/** Best-effort: read the chosen tool's inputSchema so arguments match what the server expects. */
async function toolSchema(c: IConnection): Promise<IJsonSchema | undefined> {
	try {
		const secret = await getSecret(c.id);
		const target: IMcpTarget = { transport: c.transport ?? "streamable-http", url: c.url, command: c.command, args: c.args, secret };
		const tools = await withMcpClient(target, (client, signal) => client.listTools(undefined, { signal }), SCHEMA_TIMEOUT_MS);
		return tools.tools.find((t) => t.name === c.toolName)?.inputSchema as IJsonSchema | undefined;
	} catch {
		return undefined; // fall back to the conventional {prompt, width, height, n}
	}
}

const firstKey = (props: Record<string, IJsonSchema>, names: string[]) => names.find((n) => n in props);

/** Map {prompt, width, height, n} into a tool's input schema. Exported for tests. */
export function mcpArgs(schema: IJsonSchema | undefined, g: IGenerateInput): Record<string, unknown> {
	const props = schema?.properties;
	if (!props || !Object.keys(props).length) return { prompt: g.prompt, width: g.width, height: g.height, n: g.n };
	const args: Record<string, unknown> = {};
	const promptKey = firstKey(props, ["prompt", "text", "description", "query", "input", "positive_prompt"]) ?? (schema?.required ?? []).find((k) => props[k]?.type === "string");
	if (promptKey) args[promptKey] = g.prompt;
	const neg = firstKey(props, ["negative_prompt", "negativePrompt", "negative"]);
	if (neg) args[neg] = g.negative;
	const wk = firstKey(props, ["width", "w"]);
	const hk = firstKey(props, ["height", "h"]);
	if (wk && hk) {
		args[wk] = g.width;
		args[hk] = g.height;
	}
	const sizeKey = firstKey(props, ["size", "image_size", "imageSize", "resolution"]);
	if (sizeKey && !(wk && hk)) {
		const en = props[sizeKey].enum?.filter((e): e is string => typeof e === "string");
		args[sizeKey] = en?.length ? nearestEnum(en, g.width, g.height) : props[sizeKey].type === "object" ? { width: g.width, height: g.height } : `${g.width}x${g.height}`;
	}
	const arKey = firstKey(props, ["aspect_ratio", "aspectRatio", "ratio"]);
	if (arKey) {
		const en = props[arKey].enum?.filter((e): e is string => typeof e === "string");
		args[arKey] = en?.length ? nearestEnum(en, g.width, g.height) : nearestAspect(g.width, g.height);
	}
	const nKey = firstKey(props, ["n", "num_images", "numImages", "count", "num_outputs", "batch_size", "quantity"]);
	if (nKey) args[nKey] = g.n;
	return args;
}

function nearestEnum(values: string[], w: number, h: number): string {
	const target = w / h;
	const ratioOf = (v: string) => {
		const m = v.match(/(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)/);
		return m ? parseFloat(m[1]) / parseFloat(m[2]) : /landscape|wide/i.test(v) ? 1.5 : /portrait|tall/i.test(v) ? 0.67 : /square/i.test(v) ? 1 : NaN;
	};
	const scored = values.map((v) => ({ v, d: Math.abs(ratioOf(v) - target) })).filter((x) => Number.isFinite(x.d));
	return (scored.sort((a, b) => a.d - b.d)[0] ?? { v: values[0] }).v;
}

const IMG_URL = /https?:\/\/[^\s"'<>)\]]+?\.(?:png|jpe?g|webp|avif|gif)(?:\?[^\s"'<>)\]]*)?/gi;

/** Pull image URLs / base64 images out of an MCP CallToolResult. Exported for tests. */
export function extractImages(result: unknown): string[] {
	const out: string[] = [];
	const push = (u: unknown) => typeof u === "string" && /^(https?:\/\/|data:image\/)/.test(u) && !out.includes(u) && out.push(u);
	const walk = (v: unknown, depth = 0) => {
		if (depth > 6 || v == null) return;
		if (typeof v === "string") {
			for (const m of v.match(IMG_URL) ?? []) push(m);
			return;
		}
		if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
		if (typeof v === "object") {
			const o = v as Record<string, unknown>;
			for (const k of ["url", "image_url", "imageUrl", "uri", "src", "output_url"]) if (typeof o[k] === "string" && /^https?:\/\//.test(o[k] as string)) push(o[k]);
			for (const val of Object.values(o)) walk(val, depth + 1);
		}
	};
	const r = result as { content?: unknown[]; structuredContent?: unknown } | null;
	for (const block of r?.content ?? []) {
		const b = block as { type?: string; data?: string; mimeType?: string; text?: string; uri?: string; resource?: { uri?: string; blob?: string; mimeType?: string; text?: string } };
		if (b.type === "image" && b.data) push(`data:${b.mimeType ?? "image/png"};base64,${b.data}`);
		else if (b.type === "resource_link" && b.uri) push(b.uri);
		else if (b.type === "resource" && b.resource) {
			if (b.resource.blob && /^image\//.test(b.resource.mimeType ?? "")) push(`data:${b.resource.mimeType};base64,${b.resource.blob}`);
			else if (b.resource.uri && /^image\//.test(b.resource.mimeType ?? "")) push(b.resource.uri);
			else if (b.resource.text) walk(tryJson(b.resource.text));
		} else if (b.type === "text" && b.text) walk(tryJson(b.text));
	}
	walk(r?.structuredContent);
	return out;
}

const tryJson = (t: string): unknown => {
	try {
		return JSON.parse(t);
	} catch {
		return t;
	}
};

async function mcp(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	if (!c.toolName) throw new GenerateError(`Pick the image tool for ${c.label} in Settings → Connections (test it first).`);
	const schema = await toolSchema(c);
	let result: unknown;
	try {
		result = await callMcpTool(c.id, c.toolName, mcpArgs(schema, g));
	} catch (e) {
		throw new GenerateError((e as Error)?.message?.slice(0, 200) || `${c.label} failed.`);
	}
	const urls = extractImages(result);
	if (!urls.length) throw new GenerateError(`${c.label}'s ${c.toolName} returned no images. If it queues jobs, pick a tool that returns finished images.`);
	return { urls: urls.slice(0, Math.max(g.n, 1)), model: c.toolName };
}

export async function generate(c: IConnection, g: IGenerateInput): Promise<IGenerated> {
	switch (c.provider) {
		case "openai-images":
			return openAi(c, g);
		case "gateway-images":
			return gatewayOpenAi(c, g);
		case "replicate":
			return replicate(c, g);
		case "fal":
			return fal(c, g);
		case "higgsfield-mcp":
		case "custom-mcp":
			return mcp(c, g);
		default:
			throw new GenerateError(`${c.label} can't generate images.`);
	}
}
