// Deterministic autopost fixes, ported from src/lib/store.tsx (rewriteWithout, agentFixCheck) so the backend behaves
// exactly like the prototype until handoff 03 moves real rewrites into fixStep (a model call). Pure: no ctx.
import type { IPostBlock } from "../../src/lib/types";

/** Removes an unsourced claim: softens "NN% of …" to "Most …", otherwise drops the sentence that holds it. */
export function rewriteWithout(text: string, claim: string): string {
	const softened = claim.replace(/^(around|about|over|nearly|almost)?\s*\d+(\.\d+)?%\s+of\s+/i, "Most ");
	if (softened !== claim) return text.replace(claim, softened);
	const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
	return sentences.filter((s) => !s.includes(claim)).join("").trim() || text.replace(claim, "").trim();
}

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

export interface ICheckFix {
	blocks: IPostBlock[];
	seoTitle: string;
	wordsDelta: number;
	/** New status/value for the gate check row. */
	check: { status: "pass"; value?: string };
}

/** One agent fix for a failing hard on-page check (only AGENT_FIXABLE_CHECKS reach here). */
export function fixCheck(checkId: string, blocks: IPostBlock[], seoTitle: string, keyword: string, currentValue: string): ICheckFix {
	const out = blocks.map((b) => ({ ...b }));
	if (checkId === "kw-first-100") {
		const intro = out.find((b) => b.kind === "p");
		let delta = 0;
		if (intro && !intro.text.toLowerCase().includes(keyword.toLowerCase())) {
			intro.text = `If you're searching for ${keyword}, here's the short answer. ${intro.text}`;
			delta = 9;
		}
		return { blocks: out, seoTitle, wordsDelta: delta, check: { status: "pass", value: "Word 9" } };
	}
	if (checkId === "title-length") {
		let t = "";
		for (const w of seoTitle.split(/\s+/)) if (`${t} ${w}`.trim().length <= 60) t = `${t} ${w}`.trim();
		const next = t || seoTitle.slice(0, 60);
		return { blocks: out, seoTitle: next, wordsDelta: 0, check: { status: "pass", value: `${next.length} / 60` } };
	}
	return { blocks: out, seoTitle, wordsDelta: 0, check: { status: "pass", value: checkId === "meta-description" ? "148 ch" : currentValue } };
}
