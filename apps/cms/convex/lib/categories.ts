// Post categories (every site). A site with fixed blog categories (its listing and CI accept only those) files each
// post under one of them: the pillar's chosen category, else the closest by words, else the first. A site without
// them shows the pillar's public name, as before.
import type { Doc } from "../_generated/dataModel";
import { publicPillarName } from "../../src/render/inline";

type TCat = NonNullable<Doc<"sites">["categories"]>[number];

const STOP = new Set(["and", "the", "for", "with", "in", "of", "to", "a", "ai", "automation", "business", "businesses", "qatar"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/&/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, "")));

/** The category a pillar's posts go under, or null when the site has no fixed categories. */
export function categoryOf(cats: TCat[] | undefined, pillar: Pick<Doc<"pillars">, "name" | "categoryKey"> | null): TCat | null {
	if (!cats?.length) return null;
	if (!pillar) return cats[0]!;
	const chosen = pillar.categoryKey ? cats.find((c) => c.key === pillar.categoryKey) : undefined;
	if (chosen) return chosen;
	const pw = words(pillar.name);
	let best: TCat = cats[0]!;
	let score = 0;
	for (const c of cats) {
		const cw = words(`${c.label} ${c.key.replace(/-/g, " ")} ${c.covers ?? ""}`);
		const n = [...pw].filter((w) => cw.has(w)).length;
		if (n > score) {
			score = n;
			best = c;
		}
	}
	return best;
}

/** The label a post shows for its category in a language (main language when `lang` is omitted). */
export function categoryLabel(cats: TCat[] | undefined, pillar: Pick<Doc<"pillars">, "name" | "categoryKey"> | null, lang?: string): string | undefined {
	const c = categoryOf(cats, pillar);
	if (c) return (lang ? c.labels?.find((l) => l.lang === lang)?.label : undefined) ?? (lang ? undefined : c.label);
	return pillar ? publicPillarName(pillar.name) : undefined;
}
