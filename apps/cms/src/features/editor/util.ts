// Pure helpers for the post editor (no React). Domain data always comes from the store.
import { now } from "@/lib/clock";
import { fmtAgo } from "@/lib/logic";
import type { IAgentSuggestion, IFactMarker, IPost, IPostBlock, ISiteData, IVersion } from "@/lib/types";

/**
 * The pinned demo clock restarts on reload, so work saved in an earlier session can sit a minute "in the
 * future". Relative ages use the later of the clock and the newest timestamp shown — never "in 1 min".
 */
export function clockAfter(isos: string[]): number {
	return Math.max(now().getTime(), ...isos.map((i) => new Date(i).getTime()).filter(Number.isFinite));
}

export const ago = (iso: string) => fmtAgo(iso, new Date(clockAfter([iso])));

/** Routes accept the post id ("p-root-canal") or its slug ("root-canal-recovery", as in the flows doc). */
export function findPost(data: ISiteData, idOrSlug: string): IPost | undefined {
	const key = decodeURIComponent(idOrSlug);
	return data.posts.find((p) => p.id === key) ?? data.posts.find((p) => p.slug === key);
}

export function latestVersion(post: IPost): IVersion | undefined {
	return post.versions.reduce<IVersion | undefined>((m, v) => (!m || v.n > m.n ? v : m), undefined);
}

export interface ISegment {
	text: string;
	fact?: IFactMarker;
}

/** Split a paragraph into plain runs and fact-marker claims (first occurrence of each claim). */
export function segmentFacts(text: string, facts: IFactMarker[]): ISegment[] {
	const hits = facts
		.map((f) => ({ f, i: f.claim ? text.indexOf(f.claim) : -1 }))
		.filter((h) => h.i >= 0)
		.sort((a, b) => a.i - b.i);
	const out: ISegment[] = [];
	let pos = 0;
	for (const h of hits) {
		if (h.i < pos) continue;
		if (h.i > pos) out.push({ text: text.slice(pos, h.i) });
		out.push({ text: h.f.claim, fact: h.f });
		pos = h.i + h.f.claim.length;
	}
	if (pos < text.length) out.push({ text: text.slice(pos) });
	return out;
}

/** Facts whose claim appears in this block (open ones render a card under the block). */
export function factsInBlock(block: IPostBlock, facts: IFactMarker[]): IFactMarker[] {
	return facts.filter((f) => block.factMarkerIds?.includes(f.id) || (f.claim && block.text.includes(f.claim)));
}

/** A pending replace-diff is stale once the human edited the block and the "before" text is gone. */
export function isStale(s: IAgentSuggestion, block: IPostBlock | undefined): boolean {
	if (!block || s.insertKind) return false;
	return !!s.before && !block.text.includes(s.before) && block.text !== s.before;
}

/** Text around the changed span so the diff card reads as the whole paragraph. */
export function diffContext(s: IAgentSuggestion, block: IPostBlock | undefined): { lead: string; tail: string } {
	if (!block || s.insertKind || !s.before) return { lead: "", tail: "" };
	const i = block.text.indexOf(s.before);
	if (i < 0) return { lead: "", tail: "" };
	return { lead: block.text.slice(0, i), tail: block.text.slice(i + s.before.length) };
}

export const pendingSuggestions = (post: IPost) => post.suggestions.filter((s) => s.status === "pending");

/** Nearest H2 above a block — the Composer scope label ("This section · The first 24 hours"). */
export function sectionOf(post: IPost, blockId: string): string | null {
	const i = post.blocks.findIndex((b) => b.id === blockId);
	for (let j = i; j >= 0; j--) if (post.blocks[j].kind === "h2") return post.blocks[j].text;
	return null;
}

// ─── Version diff as committed MDX source ───────────────────────────────────

function wrap(text: string, width: number): string[] {
	const out: string[] = [];
	let line = "";
	for (const w of text.split(/\s+/).filter(Boolean)) {
		if (line && line.length + 1 + w.length > width) {
			out.push(line);
			line = w;
		} else line = line ? `${line} ${w}` : w;
	}
	if (line) out.push(line);
	return out.length ? out : [""];
}

function blockLines(b: IPostBlock, width: number): string[] {
	switch (b.kind) {
		case "h2":
			return wrap(`## ${b.text}`, width);
		case "h3":
			return wrap(`### ${b.text}`, width);
		case "ul":
			return b.text.split("\n").flatMap((l) => wrap(`- ${l}`, width));
		case "quote":
			return wrap(b.text, width - 2).map((l) => `> ${l}`);
		case "image":
			return [`<PostMedia slot="${b.text}" />`];
		case "faq":
			return ["<Faq>", ...b.text.split("\n").flatMap((l, i) => wrap(i % 2 === 0 ? `Q: ${l}` : `A: ${l}`, width)), "</Faq>"];
		case "disclaimer":
			return ["<Disclaimer>", ...wrap(b.text, width), "</Disclaimer>"];
		default:
			return wrap(b.text, width);
	}
}

/** Line markers double as SourceCodeFrame highlight needles (selector "x.＋" → needle "＋"). */
export const MARK_ADDED = "＋";
export const MARK_REMOVED = "−";

/**
 * One side of a two-pane diff: `blocks` rendered as MDX, every line of a block that differs from `other`
 * prefixed with `mark` (so SourceCodeFrame tints it). Unchanged lines keep two spaces.
 */
export function diffSource(blocks: IPostBlock[], other: IPostBlock[], mark: string, seoTitle?: string, otherSeoTitle?: string, width = 46): { source: string; changed: number } {
	const byId = new Map(other.map((b) => [b.id, b]));
	const lines: string[] = [];
	let changed = 0;
	if (seoTitle !== undefined) {
		const diff = otherSeoTitle !== undefined && seoTitle !== otherSeoTitle;
		if (diff) changed++;
		for (const l of wrap(`title: "${seoTitle}"`, width)) lines.push(`${diff ? mark : " "} ${l}`);
		lines.push("");
	}
	for (const b of blocks) {
		const o = byId.get(b.id);
		const diff = !o || o.text !== b.text || o.kind !== b.kind;
		if (diff) changed++;
		for (const l of blockLines(b, width)) lines.push(`${diff ? mark : " "} ${l}`);
		lines.push("");
	}
	return { source: lines.join("\n").trimEnd(), changed };
}

/** Narrow a before/after pair to the changed words so the diff doesn't strike a whole paragraph for a one-line insert. */
export function narrowDiff(before: string, after: string): { pre: string; before: string; after: string; post: string } {
	if (!before || !after) return { pre: "", before, after, post: "" };
	const min = Math.min(before.length, after.length);
	let p = 0;
	while (p < min && before[p] === after[p]) p++;
	while (p > 0 && !/\s/.test(before[p - 1])) p--;
	let q = 0;
	while (q < min - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
	while (q > 0 && !(before.length - q === p || /\s/.test(before[before.length - q - 1]))) q--;
	return { pre: before.slice(0, p), before: before.slice(p, before.length - q), after: after.slice(p, after.length - q), post: before.slice(before.length - q) };
}
