// Template bundle helpers (pure; used by the ingest wizard in the browser and by the upload route on the server).
// PRD Module 4: an upload is one rendered post (.html) or a ZIP with the template, partials, CSS and a sample post.

export type TBundleFileKind = "html" | "css" | "image" | "font";

const EXT_KIND: Record<string, TBundleFileKind> = {
	html: "html",
	htm: "html",
	css: "css",
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	webp: "image",
	avif: "image",
	svg: "image",
	ico: "image",
	woff: "font",
	woff2: "font",
	ttf: "font",
	otf: "font",
};

export const CONTENT_TYPE: Record<string, string> = {
	html: "text/html; charset=utf-8",
	htm: "text/html; charset=utf-8",
	css: "text/css; charset=utf-8",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	avif: "image/avif",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	woff: "font/woff",
	woff2: "font/woff2",
	ttf: "font/ttf",
	otf: "font/otf",
};

export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
export const MAX_BUNDLE_FILES = 2000;

export const extOf = (path: string) => (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? "").toLowerCase();

/** Allowed file kinds only (html, css, images, fonts); anything else is dropped from the bundle. */
export function kindOfPath(path: string): TBundleFileKind | null {
	return EXT_KIND[extOf(path)] ?? null;
}

/**
 * Normalises a bundle-relative path, or returns null when it is unsafe: absolute paths, drive letters,
 * `..` segments, NUL bytes, empty segments. Also drops macOS resource forks and dotfiles.
 */
export function safeBundlePath(raw: string): string | null {
	if (!raw || raw.length > 400 || raw.includes("\0")) return null;
	const p = raw.replace(/\\/g, "/");
	if (p.startsWith("/") || /^[a-z]:/i.test(p) || p.startsWith("//")) return null;
	const segs = p.split("/").filter((s) => s !== "" && s !== ".");
	if (segs.length === 0) return null;
	if (segs.some((s) => s === ".." || s.startsWith(".") || s === "__MACOSX" || /[<>:"|?*]/.test(s))) return null;
	return segs.join("/");
}

const SAMPLE_NAME = /(^|\/)[^/]*(post|article|entry|sample)[^/]*\.html?$/i;
const SAMPLE_DIR = /(^|\/)(blog|posts?|articles?|news|journal)\/[^/]+\.html?$/i;
const hasArticle = (html: string) => /<article[\s>]/i.test(html);
const paragraphs = (html: string) => (html.match(/<p[\s>]/gi) ?? []).length;

/**
 * Picks the sample post in a bundle: a file named like *post*.html / *article*.html or under blog/,
 * else the largest HTML with an <article>, else the HTML with the most paragraphs.
 */
export function pickSamplePost(files: { path: string; html: string }[]): string | null {
	const html = files.filter((f) => kindOfPath(f.path) === "html");
	if (html.length === 0) return null;
	const byWeight = (a: { html: string }, b: { html: string }) => Number(hasArticle(b.html)) - Number(hasArticle(a.html)) || paragraphs(b.html) - paragraphs(a.html) || b.html.length - a.html.length;
	const named = html.filter((f) => (SAMPLE_NAME.test(f.path) || SAMPLE_DIR.test(f.path)) && paragraphs(f.html) >= 2);
	if (named.length) return [...named].sort(byWeight)[0]!.path;
	const withArticle = html.filter((f) => hasArticle(f.html));
	if (withArticle.length) return [...withArticle].sort((a, b) => b.html.length - a.html.length)[0]!.path;
	return [...html].sort(byWeight)[0]!.path;
}

/** Directory of a bundle path with a trailing slash ("" for the root). */
export const dirOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "");

/** Resolves a URL found in `fromPath` against the bundle root; null for absolute / external / data URLs. */
export function resolveInBundle(fromPath: string, url: string): string | null {
	if (!url || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return null;
	const clean = url.split(/[?#]/)[0]!;
	const base = clean.startsWith("/") ? [] : dirOf(fromPath).split("/").filter(Boolean);
	for (const seg of clean.split("/")) {
		if (seg === "" || seg === ".") continue;
		if (seg === "..") base.pop();
		else base.push(decodeURIComponent(seg));
	}
	return base.length ? base.join("/") : null;
}
