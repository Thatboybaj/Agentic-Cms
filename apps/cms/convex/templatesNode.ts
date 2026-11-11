"use node";
// Server template parse (handoff 05 step 2), authoritative over the browser's pre-parse: read the upload from
// storage, unzip (fflate), sanitise paths (safeBundlePath), cap bytes/files, store each html/css/image/font file
// individually, pick the sample post, and parse it with the same pure parser the client uses (linkedom DOM).
import { unzipSync } from "fflate";
import { DOMParser } from "linkedom";
import { v } from "convex/values";
import { CONTENT_TYPE, extOf, kindOfPath, MAX_BUNDLE_BYTES, MAX_BUNDLE_FILES, parseTemplate, pickSamplePost, resolveInBundle, safeBundlePath, type TParseHtml } from "../src/render";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const linkedomParse: TParseHtml = (html) => new DOMParser().parseFromString(html, "text/html") as unknown as Document;

/** UTF-8 first; legacy exports saved as Windows-1252 decode without replacement characters. */
export function decodeText(data: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(data);
	} catch {
		return new TextDecoder("windows-1252").decode(data);
	}
}

class BundleError extends Error {}

/** Pure bundle read (unit-tested): paths sanitised, kinds filtered, caps enforced. */
export function readBundle(kind: "html" | "zip", name: string, buf: Uint8Array) {
	let files: { path: string; data: Uint8Array }[] = [];
	let skipped = 0;
	if (kind === "html") files = [{ path: safeBundlePath(name) ?? "post.html", data: buf }];
	else {
		let entries: Record<string, Uint8Array>;
		try {
			entries = unzipSync(buf, { filter: (f) => !f.name.endsWith("/") && !!kindOfPath(f.name) && f.originalSize <= MAX_BUNDLE_BYTES });
		} catch {
			throw new BundleError("That ZIP couldn't be opened. Re-export it (standard deflate) and try again.");
		}
		for (const [n, data] of Object.entries(entries)) {
			const p = safeBundlePath(n);
			if (!p) {
				skipped++;
				continue;
			}
			files.push({ path: p, data });
		}
	}
	if (files.length > MAX_BUNDLE_FILES) throw new BundleError(`The template has ${files.length} files; keep it under ${MAX_BUNDLE_FILES}.`);
	const bytes = files.reduce((n, f) => n + f.data.byteLength, 0);
	if (bytes > MAX_BUNDLE_BYTES) throw new BundleError("Unpacked, the template is over 50 MB. Drop source images and fonts you don't serve.");
	const html = files.filter((f) => kindOfPath(f.path) === "html").map((f) => ({ path: f.path, html: decodeText(f.data) }));
	const samplePath = pickSamplePost(html);
	if (!samplePath) throw new BundleError("No HTML file in the upload. Include one rendered blog post (for example blog/sample-post.html).");
	const sampleHtml = html.find((h) => h.path === samplePath)!.html;
	const parsed = parseTemplate(sampleHtml, linkedomParse, `pm-${Date.now().toString(36)}`);
	const present = new Set(files.map((f) => f.path));
	const missing = [...new Set([...parsed.assets.stylesheets, ...parsed.assets.images].map((u) => ({ u, p: resolveInBundle(samplePath, u) })).filter((x) => x.p && !present.has(x.p)).map((x) => x.u))];
	return { files, samplePath, mappings: parsed.mappings, skipped, missing };
}

export const parse = internalAction({
	args: { siteId: v.id("sites"), manifestId: v.id("templateManifests") },
	handler: async (ctx, { manifestId }) => {
		const input = await ctx.runQuery(internal.templates.parseInput, { manifestId });
		if (!input) return;
		try {
			const blob = await ctx.storage.get(input.storageId);
			if (!blob) throw new BundleError("The upload is gone · upload the template again");
			const read = readBundle(input.kind, input.source.split(" · ")[0] ?? "post.html", new Uint8Array(await blob.arrayBuffer()));
			if (!read.mappings.length) throw new BundleError("The parser found nothing to map. Upload one rendered blog post");
			const files: { path: string; storageId: Id<"_storage">; contentType: string; bytes: number; kind: "html" | "css" | "image" | "font" }[] = [];
			for (const f of read.files) {
				const contentType = CONTENT_TYPE[extOf(f.path)] ?? "application/octet-stream";
				const storageId = await ctx.storage.store(new Blob([f.data as BlobPart], { type: contentType }));
				files.push({ path: f.path, storageId, contentType, bytes: f.data.byteLength, kind: kindOfPath(f.path)! });
			}
			await ctx.runMutation(internal.templates.parsed, { manifestId, files, samplePath: read.samplePath, mappings: read.mappings, skipped: read.skipped, missing: read.missing });
		} catch (e) {
			await ctx.runMutation(internal.templates.parseFailed, { manifestId, error: e instanceof Error ? e.message : "The sample post couldn't be parsed." });
		}
	},
});
