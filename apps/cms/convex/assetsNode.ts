"use node";
// A person's own image for a slot (handoff 04 step 8): the browser uploads to Convex storage (slots.uploadUrl), then
// this action re-checks type and size server-side, converts rasters to the slot's format/size (sharp), sanitises SVG,
// stores it as an asset (deduped per site) and makes it the slot's selected candidate.
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { sanitizeSvg } from "../src/server/visual-agent/svg";
import { internal } from "./_generated/api";
import { siteAction } from "./lib/functions";

const MAX_BYTES = 15 * 1024 * 1024;
const RASTER = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

export const attachUpload = siteAction({
	permission: "asset.manage",
	args: { slotId: v.id("imageSlots"), storageId: v.id("_storage"), fileName: v.string() },
	handler: async (ctx, { siteId, slotId, storageId, fileName }): Promise<{ ok: true } | { ok: false; reason: string }> => {
		const drop = async (reason: string) => {
			await ctx.storage.delete(storageId);
			return { ok: false as const, reason };
		};
		const d = await ctx.runQuery(internal.visualData.forSlot, { siteId, slotId });
		if (!d) return drop("Slot not found");
		const blob = await ctx.storage.get(storageId);
		if (!blob) return { ok: false, reason: "The upload didn't arrive · try again" };
		if (blob.size > MAX_BYTES) return drop("Keep the image under 15 MB");
		const raw = Buffer.from(await blob.arrayBuffer());
		const head = raw.subarray(0, 200).toString("utf8");
		let bytes: Buffer;
		let type: string;
		let width: number | undefined;
		let height: number | undefined;
		if (blob.type === "image/svg+xml" || /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head)) {
			const clean = sanitizeSvg(raw.toString("utf8"));
			if (!clean) return drop("That SVG failed the safety checks (scripts, external references or event handlers)");
			bytes = Buffer.from(clean, "utf8");
			type = "image/svg+xml";
		} else {
			if (!RASTER.has(blob.type)) return drop("Upload a PNG, JPG, WebP, AVIF or SVG");
			const sharp = (await import("sharp")).default;
			try {
				const img = sharp(raw, { failOn: "error" }).rotate().resize({ width: d.slot.width, height: d.slot.height, fit: "cover", withoutEnlargement: true });
				const out = d.slot.format === "avif" ? await img.avif({ quality: 55 }).toBuffer({ resolveWithObject: true }) : await img.webp({ quality: 84 }).toBuffer({ resolveWithObject: true });
				bytes = out.data;
				type = d.slot.format === "avif" ? "image/avif" : "image/webp";
				width = out.info.width;
				height = out.info.height;
			} catch {
				return drop("That image couldn't be read · re-export it and try again");
			}
		}
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const stored = await ctx.storage.store(new Blob([bytes as BlobPart], { type }));
		await ctx.storage.delete(storageId);
		const who = await ctx.runQuery(internal.users.nameOf, { userId: ctx.access.userId });
		const assetId = await ctx.runMutation(internal.visualData.insertAsset, { siteId, storageId: stored, contentType: type, bytes: bytes.length, sha256, ...(width ? { width } : {}), ...(height ? { height } : {}), kind: type === "image/svg+xml" ? "svg" : "upload", format: type.split("/")[1]!.replace("svg+xml", "svg"), provenance: { kind: "upload", provider: "human", creator: who }, createdBy: who });
		await ctx.runMutation(internal.visualData.attachUpload, { siteId, slotId, assetId, fileName: fileName.slice(0, 120), by: who });
		return { ok: true };
	},
});
