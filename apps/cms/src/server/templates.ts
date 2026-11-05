import "server-only";
// Template bundle storage (PRD Module 4). An ingest uploads the bundle's html/css/images/fonts so the live
// preview can load the site's real CSS and images:
//
//   .data/templates/<siteId>/<bundleId>/_bundle.json   { samplePath, files, bytes, uploadedAt }
//   .data/templates/<siteId>/<bundleId>/<bundle path>   the files, paths sanitised by safeBundlePath()
//
// Upload happens before the store creates the manifest, so the bundle is stored under a client bundle id and
// `linkBundle()` renames it to the manifest id once `ingestTemplate` returns one.
// LOCALHOST PROTOTYPE: no session here. Before deployment, enforce developer/admin role + site membership.
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { CONTENT_TYPE, MAX_BUNDLE_BYTES, MAX_BUNDLE_FILES, extOf, kindOfPath, safeBundlePath } from "../render/bundle";
import { dataDir } from "./json-store";

export class TemplateBundleError extends Error {
	constructor(
		message: string,
		readonly status = 400,
	) {
		super(message);
	}
}

export interface IBundleInfo {
	id: string;
	siteId: string;
	samplePath: string;
	files: number;
	bytes: number;
	uploadedAt: string;
}

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const root = () => join(dataDir(), "templates");

function checkId(id: string, what: string) {
	if (!ID.test(id)) throw new TemplateBundleError(`${what} has invalid characters`);
}

/** Resolves `rel` inside `base`, refusing anything that escapes it (defence in depth after safeBundlePath). */
function within(base: string, rel: string): string {
	const abs = resolve(base, rel);
	if (abs !== base && !abs.startsWith(base + sep)) throw new TemplateBundleError("Path escapes the template folder", 403);
	return abs;
}

export async function saveBundle(siteId: string, bundleId: string, samplePath: string, files: { path: string; data: Uint8Array }[]): Promise<IBundleInfo> {
	checkId(siteId, "siteId");
	checkId(bundleId, "bundleId");
	if (files.length === 0) throw new TemplateBundleError("The upload has no files");
	if (files.length > MAX_BUNDLE_FILES) throw new TemplateBundleError(`Too many files (max ${MAX_BUNDLE_FILES})`);
	const bytes = files.reduce((n, f) => n + f.data.byteLength, 0);
	if (bytes > MAX_BUNDLE_BYTES) throw new TemplateBundleError("Keep the upload under 50 MB", 413);
	const sample = safeBundlePath(samplePath);
	const clean = files.map((f) => {
		const p = safeBundlePath(f.path);
		if (!p) throw new TemplateBundleError(`Rejected path: ${f.path.slice(0, 120)}`);
		if (!kindOfPath(p)) throw new TemplateBundleError(`Only html, css, images and fonts are accepted: ${p}`);
		return { path: p, data: f.data };
	});
	if (!sample || !clean.some((f) => f.path === sample)) throw new TemplateBundleError("The sample post is missing from the upload");

	const dir = within(root(), join(siteId, bundleId));
	await mkdir(dir, { recursive: true });
	for (const f of clean) {
		const abs = within(dir, f.path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, f.data);
	}
	const info: IBundleInfo = { id: bundleId, siteId, samplePath: sample, files: clean.length, bytes, uploadedAt: new Date().toISOString() };
	await writeFile(join(dir, "_bundle.json"), JSON.stringify(info, null, "\t"));
	return info;
}

async function findDir(id: string): Promise<{ dir: string; siteId: string } | null> {
	checkId(id, "manifestId");
	let sites: string[] = [];
	try {
		sites = await readdir(root());
	} catch {
		return null;
	}
	for (const siteId of sites) {
		if (!ID.test(siteId)) continue;
		const dir = join(root(), siteId, id);
		try {
			if ((await stat(dir)).isDirectory()) return { dir, siteId };
		} catch {
			/* not this site */
		}
	}
	return null;
}

/** Renames an uploaded bundle to the manifest id the store assigned. Idempotent. */
export async function linkBundle(bundleId: string, manifestId: string): Promise<IBundleInfo> {
	checkId(manifestId, "manifestId");
	if (bundleId === manifestId) return getBundle(manifestId);
	const found = await findDir(bundleId);
	if (!found) {
		if (await findDir(manifestId)) return getBundle(manifestId);
		throw new TemplateBundleError("Upload not found", 404);
	}
	const target = within(root(), join(found.siteId, manifestId));
	await rename(found.dir, target);
	const info = { ...(JSON.parse(await readFile(join(target, "_bundle.json"), "utf8")) as IBundleInfo), id: manifestId };
	await writeFile(join(target, "_bundle.json"), JSON.stringify(info, null, "\t"));
	return info;
}

export async function getBundle(id: string): Promise<IBundleInfo> {
	const found = await findDir(id);
	if (!found) throw new TemplateBundleError("Template files not found", 404);
	try {
		return JSON.parse(await readFile(join(found.dir, "_bundle.json"), "utf8")) as IBundleInfo;
	} catch {
		throw new TemplateBundleError("Template files not found", 404);
	}
}

export async function readBundleFile(id: string, rawPath: string): Promise<{ data: Buffer; contentType: string }> {
	const path = safeBundlePath(rawPath);
	if (!path || !kindOfPath(path)) throw new TemplateBundleError("Not found", 404);
	const found = await findDir(id);
	if (!found) throw new TemplateBundleError("Not found", 404);
	try {
		const data = await readFile(within(found.dir, path));
		return { data, contentType: CONTENT_TYPE[extOf(path)] ?? "application/octet-stream" };
	} catch (e) {
		if (e instanceof TemplateBundleError) throw e;
		throw new TemplateBundleError("Not found", 404);
	}
}
