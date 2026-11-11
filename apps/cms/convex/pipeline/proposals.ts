// Deterministic agent edit proposals, ported from src/lib/store.tsx (FILLER, tighten, proposeEdit) so the editor's
// "ask the agent" actions behave like the prototype until handoff 03 replaces them with model calls. Pure: no ctx.
// Every proposal comes back as a pending suggestion (a diff); nothing is applied until a person accepts it.
import type { IPostBlock } from "../../src/lib/types";

export interface IProposal {
	instruction: string;
	blockId: string;
	before: string;
	after: string;
	fixesCheckId?: string;
	resolvesFactId?: string;
	insertKind?: IPostBlock["kind"];
}

interface IProposalPost {
	blocks: IPostBlock[];
	gate: { id: string; status: string }[];
}

const FILLER: [RegExp, string][] = [
	[/Once the anaesthetic starts to wear off, which for most people is somewhere between two and four hours after you leave, you may/, "As the anaesthetic wears off, two to four hours later, you may"],
	[/,? which for most people is somewhere/g, ""],
	[/\bin order to\b/g, "to"],
	[/\b(really|very|just|actually|basically) /g, ""],
	[/\bstarts to wear off\b/g, "wears off"],
	[/\bit is important to note that /gi, ""],
];

export function tighten(text: string): string {
	let out = text;
	for (const [re, rep] of FILLER) out = out.replace(re, rep);
	if (out !== text) return out;
	const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
	if (sentences.length > 1) return sentences.slice(0, -1).join("").trim();
	const words = text.split(/\s+/);
	return `${words.slice(0, Math.max(6, Math.ceil(words.length * 0.8))).join(" ").replace(/[,;:]$/, "")}.`;
}

export const textBlocks = (post: IProposalPost) => post.blocks.filter((b) => b.kind === "p");
export const lastContentBlock = (post: IProposalPost) => [...post.blocks].reverse().find((b) => b.kind !== "disclaimer" && b.kind !== "image") ?? post.blocks[post.blocks.length - 1];

/** What the agent proposes for a free-text instruction. */
export function proposeEdit(post: IProposalPost, keyword: string, instruction: string, blockId?: string): IProposal | null {
	const target = (blockId && post.blocks.find((b) => b.id === blockId)) || [...textBlocks(post)].sort((a, b) => b.text.length - a.text.length)[0];
	const i = instruction.toLowerCase();
	if (/faq/.test(i)) {
		const anchor = lastContentBlock(post);
		if (!anchor) return null;
		return {
			instruction,
			blockId: anchor.id,
			before: "",
			after: `What does ${keyword} involve?\nYour clinician explains every step at the first consultation, with a written plan and price.\nHow soon can I start?\nMost patients start within two weeks of the consultation.`,
			insertKind: "faq",
			...(post.gate.some((c) => c.id === "faq" && c.status !== "pass") ? { fixesCheckId: "faq" } : {}),
		};
	}
	if (/keyword|intro/.test(i)) {
		const intro = textBlocks(post)[0];
		if (!intro) return null;
		return { instruction, blockId: intro.id, before: intro.text, after: `If you're searching for ${keyword}, here's the short answer. ${intro.text}`, fixesCheckId: "kw-first-100" };
	}
	if (!target) return null;
	if (/angle/.test(i)) return { instruction, blockId: target.id, before: target.text, after: `From the patient's side of the chair: ${target.text[0]!.toLowerCase()}${target.text.slice(1)}` };
	const after = tighten(target.text);
	if (after === target.text) return null;
	const seededPhrase = FILLER[0]![0].exec(target.text)?.[0];
	if (seededPhrase) return { instruction, blockId: target.id, before: seededPhrase, after: FILLER[0]![1] };
	return { instruction, blockId: target.id, before: target.text, after };
}
