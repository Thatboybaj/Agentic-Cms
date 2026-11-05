"use client";
// Real template ingestion (C12): read the upload in the browser (fflate for .zip), pick the sample post, parse it
// with the pure parser, then upload the bundle's html/css/images/fonts so the preview can load the site's CSS.
import { unzip } from "fflate";
import { MAX_BUNDLE_BYTES, kindOfPath, parseTemplate, pickSamplePost, resolveInBundle, safeBundlePath, type IParsedTemplate } from "@/render";
import { browserParse } from "@/features/preview/source";

export interface IReadBundle {
	kind: "html" | "zip";
	name: string;
	files: { path: string; data: Uint8Array }[];
	samplePath: string;
	parsed: IParsedTemplate;
	bytes: number;
	/** Relative CSS/images the sample links that the upload doesn't contain. */
	missing: string[];
	skipped: number;
}

export class IngestError extends Error {}

/** UTF-8 first; legacy exports saved as Windows-1252 decode without replacement characters. */
function decodeText(data: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(data);
	} catch {
		return new TextDecoder("windows-1252").decode(data);
	}
}

function unzipAsync(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
	return new Promise((res, rej) =>
		unzip(buf, { filter: (f) => !f.name.endsWith("/") && !!kindOfPath(f.name) && f.originalSize <= MAX_BUNDLE_BYTES }, (err, out) => (err ? rej(err) : res(out))),
	);
}

/** Reads and parses an upload. Throws IngestError with a message a developer can act on. */
export async function readBundle(file: File): Promise<IReadBundle> {
	const kind = /\.zip$/i.test(file.name) ? "zip" : /\.html?$/i.test(file.name) ? "html" : null;
	if (!kind) throw new IngestError("Upload one rendered blog post as .html, or a .zip with the template, partials, CSS and a sample post.");
	if (file.size > MAX_BUNDLE_BYTES) throw new IngestError("Keep the upload under 50 MB; drop node_modules and source images.");
	const buf = new Uint8Array(await file.arrayBuffer());
	let files: { path: string; data: Uint8Array }[];
	let skipped = 0;
	if (kind === "html") {
		files = [{ path: safeBundlePath(file.name) ?? "post.html", data: buf }];
	} else {
		let entries: Record<string, Uint8Array>;
		try {
			entries = await unzipAsync(buf);
		} catch {
			throw new IngestError("That ZIP couldn't be opened. Re-export it (standard deflate) and try again.");
		}
		files = [];
		for (const [name, data] of Object.entries(entries)) {
			const p = safeBundlePath(name);
			if (!p) {
				skipped++;
				continue;
			}
			files.push({ path: p, data });
		}
		const bytes = files.reduce((n, f) => n + f.data.byteLength, 0);
		if (bytes > MAX_BUNDLE_BYTES) throw new IngestError("Unpacked, the template is over 50 MB. Drop source images and fonts you don't serve.");
	}
	const html = files.filter((f) => kindOfPath(f.path) === "html").map((f) => ({ path: f.path, html: decodeText(f.data) }));
	const samplePath = pickSamplePost(html);
	if (!samplePath) throw new IngestError("No HTML file in the ZIP. Include one rendered blog post (for example blog/sample-post.html).");
	const sampleHtml = html.find((h) => h.path === samplePath)!.html;
	let parsed: IParsedTemplate;
	try {
		parsed = parseTemplate(sampleHtml, browserParse, `pm-${Date.now().toString(36)}`);
	} catch (e) {
		throw new IngestError(e instanceof Error ? e.message : "The sample post couldn't be parsed.");
	}
	const present = new Set(files.map((f) => f.path));
	const missing = [...parsed.assets.stylesheets, ...parsed.assets.images]
		.map((u) => ({ u, p: resolveInBundle(samplePath, u) }))
		.filter((x) => x.p && !present.has(x.p))
		.map((x) => x.u);
	return { kind, name: file.name, files, samplePath, parsed, bytes: files.reduce((n, f) => n + f.data.byteLength, 0), missing: [...new Set(missing)], skipped };
}

/** POST /api/templates with real upload progress. Resolves with the stored bundle info. */
export function uploadBundle(siteId: string, bundleId: string, b: IReadBundle, onProgress: (loaded: number, total: number) => void): Promise<{ samplePath: string; files: number }> {
	const form = new FormData();
	form.append("siteId", siteId);
	form.append("bundleId", bundleId);
	form.append("samplePath", b.samplePath);
	for (const f of b.files) {
		form.append("paths", f.path);
		form.append("files", new Blob([f.data as BlobPart]), f.path.split("/").pop() ?? "file");
	}
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", "/api/templates");
		xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
		xhr.onload = () => {
			let body: { bundle?: { samplePath: string; files: number }; error?: string } = {};
			try {
				body = JSON.parse(xhr.responseText) as typeof body;
			} catch {
				/* non-JSON error page */
			}
			if (xhr.status >= 200 && xhr.status < 300 && body.bundle) resolve(body.bundle);
			else reject(new IngestError(body.error ?? `Upload failed (${xhr.status})`));
		};
		xhr.onerror = () => reject(new IngestError("Upload failed · check the connection and try again"));
		xhr.send(form);
	});
}

/** Renames the uploaded bundle to the manifest id the store assigned. */
export async function linkBundle(bundleId: string, manifestId: string): Promise<void> {
	const r = await fetch(`/api/templates/${encodeURIComponent(bundleId)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifestId }) });
	if (!r.ok) throw new IngestError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't link the upload (${r.status})`);
}

export const sourceLabel = (b: IReadBundle) => `${b.name} · ${b.files.length} file${b.files.length === 1 ? "" : "s"}`;
