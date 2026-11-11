"use node";
// Visual-asset agent, live (handoff 04 steps 4–6): runs src/server/visual-agent (route plan → generate / diagram /
// source / chart, retry once, next route, else hold) inside this site's connection scope, then stores every
// candidate's bytes: data URIs decoded, remote URLs fetched behind the SSRF guard (each redirect re-checked), SVG
// sanitised, rasters converted to the slot's format/size with sharp, hashed and deduped per site. Spend: the run's
// estimate is debited to the site's image budget (text for an LLM-drawn diagram) through the spend ledger.
import { createHash } from "node:crypto";
import { v, type Infer } from "convex/values";
import { agentBrandPack, agentSlot, excerptOf } from "../../src/features/visual-agent/api";
import { withConnections } from "../../src/server/visual-agent/deps";
import { runVisualAgent } from "../../src/server/visual-agent/run";
import { sanitizeSvg } from "../../src/server/visual-agent/svg";
import type { IAgentCandidate, TRouteOverride } from "../../src/server/visual-agent/types";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { agentDeps, assertPublicUrl } from "../connectionsNode";
import { vFillSlotOutput } from "../pipeline/steps";
import { ledgerFor } from "./sdk";

const MAX_BYTES = 15 * 1024 * 1024;

/** Provenance with known fields only (the schema is strict; unknown agent fields never fail a store). */
function provenanceOf(c: IAgentCandidate): { kind: "generated" | "diagram" | "sourced" | "upload"; provider: string; model?: string; license?: string; attribution?: string; sourceUrl?: string; licenseUrl?: string; creator?: string; note?: string } {
	const s = (c.source ?? { kind: "generated", provider: "unknown" }) as unknown as Record<string, unknown>;
	const str = (k: string) => (typeof s[k] === "string" && s[k] ? { [k]: (s[k] as string).slice(0, 2000) } : {});
	const kind = s.kind === "diagram" || s.kind === "sourced" || s.kind === "upload" ? s.kind : "generated";
	const remote = c.url && !c.url.startsWith("data:") && !s.sourceUrl ? { sourceUrl: c.url.slice(0, 2000) } : {};
	return { kind, provider: typeof s.provider === "string" ? s.provider : "unknown", ...str("model"), ...str("license"), ...str("attribution"), ...str("sourceUrl"), ...str("licenseUrl"), ...str("creator"), ...str("note"), ...remote };
}
const RASTER = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

async function fetchPublic(url: string): Promise<{ bytes: Buffer; type: string }> {
	let current = url;
	for (let hop = 0; hop < 4; hop++) {
		await assertPublicUrl(current);
		const res = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(30_000), headers: { "User-Agent": "agentic-cms-visual-agent" } });
		if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
			current = new URL(res.headers.get("location")!, current).toString();
			continue;
		}
		if (!res.ok) throw new Error(`The image couldn't be downloaded (${res.status})`);
		const len = Number(res.headers.get("content-length") ?? 0);
		if (len > MAX_BYTES) throw new Error("The image is over 15 MB");
		const bytes = Buffer.from(await res.arrayBuffer());
		if (bytes.length > MAX_BYTES) throw new Error("The image is over 15 MB");
		return { bytes, type: (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase() };
	}
	throw new Error("Too many redirects");
}

function decodeDataUri(uri: string): { bytes: Buffer; type: string } {
	const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uri);
	if (!m) throw new Error("Malformed data URI");
	const bytes = m[2] ? Buffer.from(m[3]!, "base64") : Buffer.from(decodeURIComponent(m[3]!), "utf8");
	if (bytes.length > MAX_BYTES) throw new Error("The image is over 15 MB");
	return { bytes, type: m[1]!.toLowerCase() };
}

/** Bytes for one candidate, normalised to what the repo will carry (slot format, no upscaling). */
async function prepare(c: IAgentCandidate, slot: { width: number; height: number; format: string }): Promise<{ bytes: Buffer; type: string; width?: number; height?: number; kind: "original" | "svg" }> {
	if (!c.url) throw new Error("No image");
	const raw = c.url.startsWith("data:") ? decodeDataUri(c.url) : await fetchPublic(c.url);
	if (raw.type === "image/svg+xml" || /^\s*<svg[\s>]/i.test(raw.bytes.subarray(0, 200).toString("utf8"))) {
		const clean = sanitizeSvg(raw.bytes.toString("utf8"));
		if (!clean) throw new Error("The SVG failed the safety checks");
		return { bytes: Buffer.from(clean, "utf8"), type: "image/svg+xml", kind: "svg" };
	}
	if (!RASTER.has(raw.type)) throw new Error(`Unsupported image type ${raw.type || "unknown"}`);
	const sharp = (await import("sharp")).default;
	const img = sharp(raw.bytes, { failOn: "error" }).rotate().resize({ width: slot.width, height: slot.height, fit: "cover", withoutEnlargement: true });
	const out = slot.format === "avif" ? await img.avif({ quality: 55 }).toBuffer({ resolveWithObject: true }) : await img.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
	return { bytes: out.data, type: slot.format === "avif" ? "image/avif" : "image/webp", width: out.info.width, height: out.info.height, kind: "original" };
}

async function store(ctx: ActionCtx, siteId: Id<"sites">, c: IAgentCandidate, slot: { width: number; height: number; format: string }) {
	const p = await prepare(c, slot);
	const sha256 = createHash("sha256").update(p.bytes).digest("hex");
	const storageId = await ctx.storage.store(new Blob([p.bytes as BlobPart], { type: p.type }));
	const src = provenanceOf(c);
	return ctx.runMutation(internal.visualData.insertAsset, { siteId, storageId, contentType: p.type, bytes: p.bytes.length, sha256, ...(p.width ? { width: p.width } : {}), ...(p.height ? { height: p.height } : {}), kind: p.kind, format: p.type.split("/")[1]!.replace("svg+xml", "svg"), provenance: src, createdBy: "visual-asset-agent" });
}

export const fill = internalAction({
	args: { siteId: v.id("sites"), slotId: v.id("imageSlots"), runId: v.optional(v.id("runs")), override: v.optional(v.union(v.literal("generate"), v.literal("diagram"), v.literal("source"))) },
	returns: vFillSlotOutput,
	handler: async (ctx, { siteId, slotId, runId, override }): Promise<Infer<typeof vFillSlotOutput>> => {
		const d = await ctx.runQuery(internal.visualData.forSlot, { siteId, slotId });
		if (!d) return { ok: false, candidates: 0, note: "Slot not found", costUsd: 0 };
		const deps = await agentDeps(ctx, siteId);
		const result = await withConnections(siteId, deps, () => runVisualAgent({ siteId, slot: agentSlot(d.slot), post: excerptOf(d.post, d.keyword), brandPack: agentBrandPack(d.brandPack), estimateCapUsd: d.remainingImageUsd, ...(override ? { override: override as TRouteOverride } : {}) }));
		// Money: providers don't report a price, so the route's estimate is what the site pays (capped by the ledger).
		const cost = result.held ? 0 : result.costEstimateUsd;
		if (cost > 0) {
			const budget = result.route === "diagram" ? "text" : "image";
			const key = `agent:${runId ?? `slot:${slotId}:${Date.now()}`}:visual`;
			const ledger = ledgerFor(ctx, siteId, budget, runId);
			const held = await ledger.hold(key, Math.ceil(cost * 1e6));
			if (held.ok) await ledger.settle(key, Math.ceil(cost * 1e6));
		}
		const stored: { label: string; hue: number; assetId: Id<"assets">; source: ReturnType<typeof provenanceOf> }[] = [];
		const problems: string[] = [];
		for (const c of result.candidates.slice(0, 4)) {
			try {
				const assetId = await store(ctx, siteId, c, d.slot);
				stored.push({ label: c.label.slice(0, 120), hue: c.hue, assetId, source: provenanceOf(c) });
			} catch (e) {
				problems.push((e as Error).message);
			}
		}
		const held = result.held?.reason ?? (stored.length ? undefined : problems[0] ? `Candidates couldn't be stored: ${problems[0]}` : undefined);
		const detail = `${result.route} · ${result.provider ?? "-"}${result.model ? ` · ${result.model}` : ""}${problems.length ? ` · ${problems.length} dropped` : ""}`;
		await ctx.runMutation(internal.visualData.agentResult, { siteId, slotId, ...(runId ? { runId } : {}), candidates: stored, ...(held ? { held } : {}), detail, ...(result.meta?.provider ? { provider: result.meta.provider } : {}), ...(result.meta?.model ? { model: result.meta.model } : {}) });
		return { ok: !held, candidates: stored.length, note: held ?? detail, costUsd: cost };
	},
});
