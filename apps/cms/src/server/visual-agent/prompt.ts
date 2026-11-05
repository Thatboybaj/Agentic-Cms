// Pure prompt assembly for the generate route (SKILL Step 3). Order, every time, regardless of provider:
// subject → brand pack (palette as hex, style keywords, don'ts) → format → guardrail negatives.
// Never includes secrets, connection details or account ids — only the slot brief and the brand pack.
import type { IAgentBrandPack, TAgentSlot } from "./types";

const HEX = /^#?[0-9a-f]{6}$/i;
const SECRETISH = /\b(sk-[\w-]{8,}|key[-_ ]?[a-z0-9]{16,}|bearer\s+\S+|api[_ -]?key\s*[:=]\s*\S+|r8_[\w]{10,}|[a-f0-9]{32,})\b/gi;
/** Living-artist / named-style requests are stripped before they ever reach a model. */
const STYLE_OF = /\b(in the style of|style of|inspired by|by the artist)\s+[^,.;]+/gi;

export const GUARDRAILS = [
	"no identifiable real people or likenesses",
	"no logos or trademarks",
	"no watermarks",
	"no borders or frames",
] as const;

export function aspectOf(w: number, h: number): string {
	const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
	const d = g(w, h) || 1;
	const r = `${w / d}:${h / d}`;
	// Snap common ratios so prompts read naturally.
	const ratio = w / h;
	const known: [string, number][] = [["16:9", 16 / 9], ["3:2", 3 / 2], ["4:3", 4 / 3], ["1:1", 1], ["2:1", 2], ["8:5", 8 / 5], ["2:3", 2 / 3], ["9:16", 9 / 16]];
	const hit = known.find(([, v]) => Math.abs(v - ratio) < 0.02);
	return hit ? hit[0] : r;
}

function paletteText(palette: string[]): string {
	const hex = palette.map((p) => p.trim()).filter((p) => HEX.test(p)).map((p) => (p.startsWith("#") ? p : `#${p}`).toUpperCase());
	return hex.length ? `brand palette ${hex.join(", ")}` : "";
}

/** Strip anything that looks like a credential, plus living-artist style references. */
export function scrub(text: string): string {
	return text.replace(SECRETISH, "").replace(STYLE_OF, "").replace(/\s{2,}/g, " ").trim();
}

const cleanKeyword = (k: string) => k.replace(/^brand:\s*/i, "").trim();

export interface IBuiltPrompt {
	prompt: string;
	negative: string;
	textInImage: boolean;
}

export function buildPrompt(slot: TAgentSlot, brand: IAgentBrandPack, opts: { textInImage?: boolean; override?: string } = {}): IBuiltPrompt {
	const textInImage = !!opts.textInImage;
	const subject = scrub(opts.override?.trim() || slot.prompt || slot.alt || slot.name);
	const keywords = [...new Set([...slot.styleKeywords, ...brand.styleKeywords].map(cleanKeyword).filter((k) => k && !/no identifiable/i.test(k)))];
	const parts = [
		subject.replace(/[.\s]+$/, ""),
		paletteText(brand.palette),
		keywords.length ? `style: ${keywords.map(scrub).join(", ")}` : "",
		`aspect ratio ${aspectOf(slot.width, slot.height)}, ${slot.width}×${slot.height}, leave clean space for layout`,
	].filter(Boolean);
	const negatives = [...GUARDRAILS, ...(textInImage ? [] : ["no text or lettering in the image"]), ...(brand.avoid ?? []).map(scrub).filter(Boolean)];
	const negative = negatives.join(", ");
	return { prompt: `${parts.join(". ")}. Avoid: ${negative}.`, negative, textInImage };
}
