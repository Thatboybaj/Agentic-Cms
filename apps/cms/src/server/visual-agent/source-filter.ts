// Pure filters for the source route: search queries from the slot brief (no brand secrets), license acceptance,
// best-effort people/watermark/logo rejection, and ranking by fit to the slot's shape. Unit-tested.
import type { IAgentBrandPack, TAgentSlot } from "./types";

export interface IRawImage {
	provider: string;
	url: string;
	title: string;
	tags: string[];
	width?: number;
	height?: number;
	license: string;
	/** Machine-ish license id: "by", "by-nc-sa", "cc0", "cc by-sa 4.0", "unsplash"… */
	licenseCode: string;
	licenseUrl?: string;
	creator?: string;
	attribution: string;
	sourceUrl: string;
	mature: boolean;
	via?: string;
	downloadLocation?: string;
}

const STOP = new Set(
	"a an the and or of to in on at for with by from into over under near beside behind its it this that their our your his her is are be being real only photo photograph picture image shot view scene no identifiable person people brand rule never generated".split(" "),
);
const PEOPLE = /\b(person|people|man|men|woman|women|girl|boy|child(?:ren)?|kids?|baby|face|faces|portrait|selfie|patient|smil(?:e|es|ing)|model|couple|family|crowd|headshot|bride|groom|teen(?:ager)?s?|dentists?|doctors?|nurses?|surgeons?|surgery|staff|workers?|students?|waiting|visitors?|customers?|hygienists?|adult)\b/i;
const MARKS = /\b(watermark(?:ed)?|logo|trademark|brand ?mark|copyright)\b/i;
const QUERY_NOISE = /^(cost|costs|price|prices|pricing|best|near|me|cheap|how|what|why|vs|guide|\d+)$/i;

/** 1–5 progressively broader search queries from the slot's alt text, then the post keyword. Proper nouns dropped. */
export function queriesFor(slot: TAgentSlot, keyword: string): string[] {
	const alt = (slot.alt || slot.prompt || slot.name).replace(/[“”"'’().,;:!?]/g, " ");
	const tokens = alt.split(/\s+/).filter(Boolean);
	const terms = tokens
		.filter((w, i) => !(i > 0 && /^[A-Z]/.test(w))) // proper nouns (places, brands, the client's own name)
		.map((w) => w.toLowerCase())
		.filter((w) => !STOP.has(w) && !PEOPLE.test(w) && !/ing$/.test(w) && !/^\d/.test(w) && w.length > 2);
	const kw = keyword
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w && !STOP.has(w) && !QUERY_NOISE.test(w));
	const out = [terms.slice(0, 4), terms.slice(0, 3), terms.slice(0, 2), kw.slice(0, 3), terms.slice(-2), kw.slice(0, 1)].map((t) => t.join(" ").trim()).filter((q) => q.length > 2);
	return [...new Set(out)];
}

const tokensOf = (code: string) => code.toLowerCase().split(/[\s_-]+/);

/** SKILL Step 5: CC0 / PD / CC BY / CC BY-SA / stock license only; NC refused on commercial sites; ND refused (we crop). */
export function acceptLicense(img: Pick<IRawImage, "licenseCode" | "license">, brand: IAgentBrandPack): boolean {
	const code = `${img.licenseCode} ${img.license}`.toLowerCase();
	const t = tokensOf(code);
	const nc = t.includes("nc") || /non-?commercial/.test(code);
	const nd = t.includes("nd") || /no-?deriv/.test(code);
	if (nc && brand.commercial !== false && !brand.allowNonCommercial) return false;
	if (nd && !brand.allowNoDerivatives) return false;
	return /\bcc0\b|\bpdm\b|public domain|\bby\b|unsplash|pexels/.test(code);
}

/** Best effort from metadata: identifiable people (CC licenses carry no model release), watermarks, logos. */
export function looksUnsafe(img: Pick<IRawImage, "title" | "tags">): boolean {
	const text = `${img.title} ${img.tags.join(" ")}`;
	return PEOPLE.test(text) || MARKS.test(text);
}

/** Drop tiny images, then order by closeness to the slot's aspect ratio (landscape slots prefer landscape). */
export function rankByShape<T extends Pick<IRawImage, "width" | "height">>(imgs: T[], w: number, h: number): T[] {
	const target = Math.log(w / h);
	const minW = Math.min(640, w / 2);
	return imgs
		.filter((i) => !i.width || i.width >= minW)
		.map((i, idx) => ({ i, idx, d: i.width && i.height ? Math.abs(Math.log(i.width / i.height) - target) : 0.4 }))
		// Blend shape fit with the source's own relevance order.
		.sort((a, b) => a.d + a.idx * 0.05 - (b.d + b.idx * 0.05))
		.map((x) => x.i);
}

const stem = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);

/**
 * Relevance guard: search engines OR their terms ("clear aligner case" matches night skies), so a result must
 * mention at least two of the query's terms (one for a single-term query) in its title or tags.
 */
export function relevance(img: Pick<IRawImage, "title" | "tags">, query: string): number {
	const hay = new Set(`${img.title} ${img.tags.join(" ")}`.split(/[^A-Za-z0-9]+/).filter(Boolean).map(stem));
	return query.split(/\s+/).filter((t) => t && hay.has(stem(t))).length;
}
export const isRelevant = (img: Pick<IRawImage, "title" | "tags">, query: string) => relevance(img, query) >= Math.min(2, query.split(/\s+/).filter(Boolean).length);
