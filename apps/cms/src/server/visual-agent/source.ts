// Source route (SKILL Step 5): openly licensed images from Openverse, Wikimedia Commons, or the site's connected
// stock API (Unsplash / Pexels). No scraping. Records license, creator, attribution, source page and license URL for
// every candidate. Refuses NC (commercial sites) and ND (assets get cropped) unless the brand pack allows them, and
// — best effort, from tags/titles — images that look like identifiable people, watermarks or logos.
import type { IConnection } from "../../features/connections/catalog";
import { getSecret } from "./deps";
import { acceptLicense, isRelevant, looksUnsafe, queriesFor, rankByShape, type IRawImage } from "./source-filter";
import type { IAgentBrandPack, IAgentCandidate, TAgentSlot } from "./types";

export const SOURCE_TIMEOUT_MS = 15_000;
const UA = "StudioAgenticCMS/0.1 (visual-asset agent; https://github.com/The-Utopia-Studio/studio-product-framework)";

export class SourceError extends Error {}

async function getJson(url: string, headers: Record<string, string>, label: string): Promise<unknown> {
	let res: Response;
	try {
		res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS), cache: "no-store" });
	} catch (e) {
		if ((e as Error)?.name === "TimeoutError" || /timeout|aborted/i.test(String((e as Error)?.message))) throw new SourceError(`No response from ${label} within ${SOURCE_TIMEOUT_MS / 1000} seconds.`);
		throw new SourceError(`Couldn't reach ${label}. Check the server's network.`);
	}
	if (res.status === 401 || res.status === 403) throw new SourceError(`${label} rejected the key (${res.status}).`);
	if (res.status === 429) throw new SourceError(`${label} is rate-limiting this server (429). Try again in a minute.`);
	if (!res.ok) throw new SourceError(`${label} answered with an error (${res.status}).`);
	return res.json().catch(() => {
		throw new SourceError(`${label} sent a response that isn't JSON.`);
	});
}

// ─── Providers → IRawImage ───────────────────────────────────────────────────

async function openverse(q: string, brand: IAgentBrandPack, secret: string | null): Promise<IRawImage[]> {
	const params = new URLSearchParams({ q, page_size: "20", mature: "false" });
	const commercial = brand.commercial !== false && !brand.allowNonCommercial;
	const lt = [commercial ? "commercial" : "", brand.allowNoDerivatives ? "" : "modification"].filter(Boolean).join(",");
	if (lt) params.set("license_type", lt);
	const body = (await getJson(`https://api.openverse.org/v1/images/?${params}`, secret ? { Authorization: `Bearer ${secret}` } : {}, "Openverse")) as { results?: IOpenverse[] };
	return (body.results ?? []).map((r) => ({
		provider: "openverse",
		url: r.url,
		title: r.title ?? "",
		tags: (r.tags ?? []).map((t) => t.name),
		width: r.width ?? undefined,
		height: r.height ?? undefined,
		license: licenseName(r.license, r.license_version),
		licenseCode: r.license ?? "",
		licenseUrl: r.license_url ?? undefined,
		creator: r.creator ?? undefined,
		attribution: r.attribution ?? `"${r.title ?? "Untitled"}" by ${r.creator ?? "unknown"} is licensed under ${licenseName(r.license, r.license_version)}.`,
		sourceUrl: r.foreign_landing_url ?? r.detail_url ?? r.url,
		mature: r.mature === true,
		via: r.source ?? r.provider,
	}));
}
interface IOpenverse {
	title?: string;
	url: string;
	creator?: string;
	license?: string;
	license_version?: string;
	license_url?: string;
	attribution?: string;
	foreign_landing_url?: string;
	detail_url?: string;
	tags?: { name: string }[];
	width?: number | null;
	height?: number | null;
	mature?: boolean;
	source?: string;
	provider?: string;
}

export function licenseName(code?: string, version?: string): string {
	const c = (code ?? "").toLowerCase();
	if (c === "cc0") return "CC0 1.0";
	if (c === "pdm") return "Public Domain Mark 1.0";
	return c ? `CC ${c.toUpperCase().replace(/-/g, "-")}${version ? ` ${version}` : ""}` : "Unknown license";
}

const stripHtml = (s?: string) => (s ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

async function wikimedia(q: string): Promise<IRawImage[]> {
	const params = new URLSearchParams({
		action: "query",
		generator: "search",
		gsrsearch: `${q} filetype:bitmap`,
		gsrnamespace: "6",
		gsrlimit: "20",
		prop: "imageinfo",
		iiprop: "url|size|extmetadata",
		iiurlwidth: "1600",
		format: "json",
		origin: "*",
	});
	const body = (await getJson(`https://commons.wikimedia.org/w/api.php?${params}`, {}, "Wikimedia Commons")) as { query?: { pages?: Record<string, IWikiPage> } };
	return Object.values(body.query?.pages ?? {})
		.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
		.flatMap((p) => {
			const ii = p.imageinfo?.[0];
			if (!ii) return [];
			const m = ii.extmetadata ?? {};
			const license = stripHtml(m.LicenseShortName?.value) || "Unknown license";
			const creator = stripHtml(m.Artist?.value) || undefined;
			const title = p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
			return [
				{
					provider: "wikimedia",
					url: ii.thumburl ?? ii.url,
					title,
					tags: stripHtml(m.Categories?.value).split("|"),
					width: ii.thumbwidth ?? ii.width,
					height: ii.thumbheight ?? ii.height,
					license,
					licenseCode: license.toLowerCase(),
					licenseUrl: stripHtml(m.LicenseUrl?.value) || undefined,
					creator,
					attribution: `"${title}" by ${creator ?? "unknown"}, ${license}, via Wikimedia Commons`,
					sourceUrl: ii.descriptionurl ?? ii.url,
					mature: false,
					via: "wikimedia",
				} satisfies IRawImage,
			];
		});
}
interface IWikiPage {
	title: string;
	index?: number;
	imageinfo?: { url: string; thumburl?: string; width?: number; height?: number; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}

async function unsplash(q: string, key: string): Promise<IRawImage[]> {
	const params = new URLSearchParams({ query: q, per_page: "20", orientation: "landscape", content_filter: "high" });
	const body = (await getJson(`https://api.unsplash.com/search/photos?${params}`, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" }, "Unsplash")) as { results?: IUnsplash[] };
	return (body.results ?? []).map((r) => ({
		provider: "unsplash",
		// Unsplash guidelines: hotlink the returned image URLs; utm params on attribution links.
		url: r.urls.regular,
		title: r.alt_description ?? r.description ?? "",
		tags: (r.tags ?? []).map((t) => t.title ?? ""),
		width: r.width,
		height: r.height,
		license: "Unsplash License",
		licenseCode: "unsplash",
		licenseUrl: "https://unsplash.com/license",
		creator: r.user?.name,
		attribution: `Photo by ${r.user?.name ?? "unknown"} (${r.user?.links?.html ?? "unsplash.com"}?utm_source=studio_cms&utm_medium=referral) on Unsplash (https://unsplash.com/?utm_source=studio_cms&utm_medium=referral)`,
		sourceUrl: `${r.links?.html ?? "https://unsplash.com"}?utm_source=studio_cms&utm_medium=referral`,
		mature: false,
		via: "unsplash",
		downloadLocation: r.links?.download_location,
	}));
}
interface IUnsplash {
	urls: { regular: string };
	alt_description?: string;
	description?: string;
	width?: number;
	height?: number;
	tags?: { title?: string }[];
	user?: { name?: string; links?: { html?: string } };
	links?: { html?: string; download_location?: string };
}

async function pexels(q: string, key: string): Promise<IRawImage[]> {
	const params = new URLSearchParams({ query: q, per_page: "20", orientation: "landscape" });
	const body = (await getJson(`https://api.pexels.com/v1/search?${params}`, { Authorization: key }, "Pexels")) as { photos?: IPexels[] };
	return (body.photos ?? []).map((r) => ({
		provider: "pexels",
		url: r.src.large2x ?? r.src.large ?? r.src.original,
		title: r.alt ?? "",
		tags: [],
		width: r.width,
		height: r.height,
		license: "Pexels License",
		licenseCode: "pexels",
		licenseUrl: "https://www.pexels.com/license/",
		creator: r.photographer,
		attribution: `Photo by ${r.photographer ?? "unknown"} on Pexels (${r.url})`,
		sourceUrl: r.url,
		mature: false,
		via: "pexels",
	}));
}
interface IPexels {
	url: string;
	alt?: string;
	width?: number;
	height?: number;
	photographer?: string;
	src: { large2x?: string; large?: string; original: string };
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface ISourceInput {
	slot: TAgentSlot;
	keyword: string;
	brand: IAgentBrandPack;
	count: number;
	/** URLs already offered (skip duplicates across sources). */
	exclude?: string[];
}

export interface ISourceOut {
	candidates: IAgentCandidate[];
	query: string;
	rejected: number;
}

export async function sourceImages(c: IConnection, input: ISourceInput): Promise<ISourceOut> {
	let secret: string | null = null;
	try {
		secret = await getSecret(c.id);
	} catch {
		secret = null;
	}
	if ((c.provider === "unsplash" || c.provider === "pexels") && !secret) throw new SourceError(`Add your ${c.label} key in Settings → Connections.`);
	const search = (q: string): Promise<IRawImage[]> => {
		switch (c.provider) {
			case "openverse":
				return openverse(q, input.brand, secret);
			case "wikimedia":
				return wikimedia(q);
			case "unsplash":
				return unsplash(q, secret!);
			case "pexels":
				return pexels(q, secret!);
			default:
				throw new SourceError(`${c.label} isn't a web image source.`);
		}
	};
	const seen = new Set(input.exclude ?? []);
	const picked: IRawImage[] = [];
	let rejected = 0;
	let used = "";
	for (const q of queriesFor(input.slot, input.keyword)) {
		const raw = await search(q);
		used ||= q;
		const ok = raw.filter((r) => {
			if (!r.url || seen.has(r.url)) return false;
			if (!isRelevant(r, q)) return false;
			if (!acceptLicense(r, input.brand) || looksUnsafe(r) || r.mature) {
				rejected++;
				return false;
			}
			return true;
		});
		for (const r of rankByShape(ok, input.slot.width, input.slot.height)) {
			if (picked.length >= input.count) break;
			seen.add(r.url);
			picked.push(r);
			used = q;
		}
		if (picked.length >= input.count) break;
	}
	const candidates: IAgentCandidate[] = picked.map((r, i) => ({
		id: "",
		label: `${c.label} ${i + 1}`,
		hue: 30 + i * 60,
		selected: false,
		url: r.url,
		source: {
			kind: "sourced",
			provider: c.provider,
			license: r.license,
			licenseUrl: r.licenseUrl,
			creator: r.creator,
			attribution: r.attribution,
			sourceUrl: r.sourceUrl,
			note: `${r.via && r.via !== c.provider ? `via ${r.via} · ` : ""}query "${used}"${r.downloadLocation ? " · Unsplash asks for a download ping when used" : ""}`,
		},
	}));
	return { candidates, query: used, rejected };
}
