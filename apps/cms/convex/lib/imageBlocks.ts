// Image blocks in a post body: which slot goes where. The writer's image sheet says where each image belongs (an
// afterBlock index, kept as afterBlockId, or the label "In \"<heading>\""). The renderer only places images that have
// an image block, so a draft whose slots never got blocks shipped with no images at all (Baynor, 13 Nov 2026).

export interface IBlockLite {
	id: string;
	kind: string;
	text: string;
}

export interface ISlotLite {
	id: string;
	type: string;
	placement: string;
	afterBlockId?: string;
}

const HEADING = new Set(["h2", "h3"]);

/** Index to insert after: the block the writer chose, else the first content block under the named heading. */
function anchorIndex(blocks: IBlockLite[], s: ISlotLite): number {
	if (s.afterBlockId) {
		const i = blocks.findIndex((b) => b.id === s.afterBlockId);
		if (i >= 0) {
			// Never directly under a heading: after the paragraph that follows it.
			if (HEADING.has(blocks[i]!.kind)) {
				const next = blocks.findIndex((b, j) => j > i && !HEADING.has(b.kind) && b.kind !== "image");
				return next >= 0 ? next : i;
			}
			return i;
		}
	}
	const m = /^In "(.+)"$/.exec(s.placement.trim());
	if (m) {
		const want = m[1]!.trim().toLowerCase();
		const h = blocks.findIndex((b) => HEADING.has(b.kind) && b.text.trim().toLowerCase() === want);
		if (h >= 0) {
			const next = blocks.findIndex((b, j) => j > h && !HEADING.has(b.kind) && b.kind !== "image");
			if (next >= 0) return next;
		}
	}
	// "After the opening answer" (or a heading that changed): after the first paragraph.
	const p = blocks.findIndex((b) => b.kind === "p");
	return p >= 0 ? p : blocks.length - 1;
}

/** The body with one image block per slot (hero first). Slots that already have a block are left as they are. */
export function placeImageBlocks<T extends IBlockLite>(blocks: T[], slots: ISlotLite[], make: (slotId: string) => T): T[] {
	const has = new Set(blocks.filter((b) => b.kind === "image").map((b) => b.text));
	let out = [...blocks];
	const hero = slots.find((s) => s.type === "hero" && !has.has(s.id));
	for (const s of slots) {
		if (has.has(s.id) || s === hero) continue;
		const at = anchorIndex(out, s);
		out.splice(at + 1, 0, make(s.id));
		has.add(s.id);
	}
	if (hero) out = [make(hero.id), ...out];
	return out;
}
