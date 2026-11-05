"use client";
// Where a manifest's template comes from for the live preview:
//   uploaded (manifest.sampleHtml)   → HTML from the store; CSS/images from /api/templates/<id>/files/<sample dir>/
//   seeded demo manifest (no sample) → the tenant's demo template under /public/demo-templates/<site>/
//   neither                          → no template (the preview shows a DataGap)
import { useEffect, useState } from "react";
import { dirOf, type TParseHtml } from "@/render";
import type { ISite, ITemplateManifest } from "@/lib/types";

/** Seeded tenants whose confirmed manifest predates real uploads: their template lives in /public. */
export const DEMO_TEMPLATES: Record<string, { html: string; base: string; samplePath: string }> = {
	lumen: { html: "/demo-templates/lumen/post.html", base: "/demo-templates/lumen/", samplePath: "post.html" },
};

export const browserParse: TParseHtml = (html) => new DOMParser().parseFromString(html, "text/html");

export interface ITemplateSource {
	status: "loading" | "ready" | "none" | "error";
	html: string | null;
	/** Absolute base URL for the site's relative CSS/images, or null when the files weren't uploaded. */
	baseHref: string | null;
	samplePath: string | null;
	origin: "upload" | "demo" | null;
	/** Why assets may be missing (e.g. a single .html upload with relative CSS). */
	note: string | null;
}

const NONE: ITemplateSource = { status: "none", html: null, baseHref: null, samplePath: null, origin: null, note: null };
const cache = new Map<string, Promise<ITemplateSource>>();

const abs = (path: string) => (typeof window === "undefined" ? path : new URL(path, window.location.origin).toString());
const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function load(manifest: ITemplateManifest, siteId: string): Promise<ITemplateSource> {
	if (manifest.sampleHtml) {
		try {
			const r = await fetch(`/api/templates/${encodeURIComponent(manifest.id)}`, { cache: "no-store" });
			if (!r.ok) throw new Error(String(r.status));
			const { bundle } = (await r.json()) as { bundle: { samplePath: string; files: number } };
			return {
				status: "ready",
				html: manifest.sampleHtml,
				baseHref: abs(`/api/templates/${encodeURIComponent(manifest.id)}/files/${encodePath(dirOf(bundle.samplePath))}`),
				samplePath: bundle.samplePath,
				origin: "upload",
				note: null,
			};
		} catch {
			return { status: "ready", html: manifest.sampleHtml, baseHref: null, samplePath: null, origin: "upload", note: "Template files weren't found on the server · showing markup without the site's CSS" };
		}
	}
	const demo = DEMO_TEMPLATES[siteId];
	if (!demo) return NONE;
	const r = await fetch(demo.html);
	if (!r.ok) return { ...NONE, status: "error", note: `Demo template missing (${r.status})` };
	return { status: "ready", html: await r.text(), baseHref: abs(demo.base), samplePath: demo.samplePath, origin: "demo", note: null };
}

/** Resolves (and caches per manifest) the template HTML + asset base for the preview. */
export function useTemplateSource(manifest: ITemplateManifest | null, site: Pick<ISite, "id">): ITemplateSource {
	const key = manifest ? `${site.id}:${manifest.id}:${manifest.sampleHtml ? manifest.sampleHtml.length : "demo"}` : null;
	const [state, setState] = useState<{ key: string | null; src: ITemplateSource }>({ key: null, src: { ...NONE, status: "loading" } });
	useEffect(() => {
		if (!manifest || !key) return;
		let live = true;
		let p = cache.get(key);
		if (!p) {
			p = load(manifest, site.id).catch((): ITemplateSource => ({ ...NONE, status: "error", note: "Couldn't load the template" }));
			cache.set(key, p);
		}
		p.then((src) => live && setState({ key, src }));
		return () => {
			live = false;
		};
	}, [key, manifest, site.id]);
	if (!manifest) return NONE;
	return state.key === key ? state.src : { ...NONE, status: "loading" };
}

/** Forget cached sources for a manifest (after a re-upload / link). */
export function invalidateTemplateSource(manifestId: string) {
	for (const k of cache.keys()) if (k.includes(`:${manifestId}:`)) cache.delete(k);
}
