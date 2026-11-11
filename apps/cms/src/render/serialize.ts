// Output serializers (handoff 05 step 7): the file a merge request carries, in the site's own format.
//   html → the rendered template document (renderPost publish mode), unchanged
//   mdx  → front-matter + Markdown body from the post's blocks (the site's MDX layout supplies the markup)
//   json → front-matter fields + typed blocks + images, for headless sites
// `component` is refused until a pilot repo needs it.
import type { IImageSlot, IPost } from "@/lib/types";

export type TOutput = "html" | "mdx" | "json" | "component";

export interface ISerialized {
	ext: "html" | "mdx" | "json";
	content: string;
}

type TSlot = Pick<IImageSlot, "name" | "filename" | "alt" | "placement" | "type" | "width" | "height">;

export interface ISerializeInput {
	output: TOutput;
	post: Pick<IPost, "title" | "seoTitle" | "slug" | "blocks" | "intent"> & { metaDescription?: string; keyword?: string };
	slots: TSlot[];
	/** The rendered template document (html output). */
	html: string;
	/** Public URL path of the asset dir, e.g. "/images/blog". */
	assetPath: string;
	publishedAt: string;
	author?: string;
	url: string;
}

const yaml = (v: string) => JSON.stringify(v); // JSON strings are valid YAML scalars
const NL = "\n";

function faqParts(text: string) {
	const [q, ...a] = text.split(NL);
	return { q: (q ?? "").trim(), a: a.join(NL).trim() };
}

const items = (text: string) =>
	text
		.split(NL)
		.map((x) => x.trim())
		.filter(Boolean);

export function serialize(i: ISerializeInput): ISerialized {
	if (i.output === "component") throw new Error("Component output isn't supported yet · pick HTML, MDX or JSON for this template");
	if (i.output === "html") return { ext: "html", content: i.html };
	const imageOf = (s: TSlot) => ({ src: `${i.assetPath}/${s.filename}`, alt: s.alt, width: s.width, height: s.height, placement: s.placement, type: s.type });
	const hero = i.slots.find((s) => s.type === "hero");
	if (i.output === "json") {
		const blocks = i.post.blocks
			.filter((b) => b.kind !== "image")
			.map((b) => (b.kind === "faq" ? { kind: "faq", ...faqParts(b.text) } : b.kind === "ul" ? { kind: "ul", items: items(b.text) } : { kind: b.kind, text: b.text }));
		const doc = {
			title: i.post.title,
			seoTitle: i.post.seoTitle,
			description: i.post.metaDescription ?? "",
			slug: i.post.slug,
			url: i.url,
			publishedAt: i.publishedAt,
			...(i.author ? { author: i.author } : {}),
			...(i.post.keyword ? { keyword: i.post.keyword } : {}),
			...(hero ? { image: imageOf(hero) } : {}),
			blocks,
			images: i.slots.map(imageOf),
		};
		return { ext: "json", content: `${JSON.stringify(doc, null, 2)}${NL}` };
	}

	// MDX: front-matter + Markdown. FAQ entries become "### question" + answer (each Q an H3, per the optimizer).
	const front = ["---", `title: ${yaml(i.post.seoTitle || i.post.title)}`, `description: ${yaml(i.post.metaDescription ?? "")}`, `slug: ${yaml(i.post.slug)}`, `date: ${yaml(i.publishedAt)}`];
	if (i.author) front.push(`author: ${yaml(i.author)}`);
	if (hero) front.push(`image: ${yaml(`${i.assetPath}/${hero.filename}`)}`, `imageAlt: ${yaml(hero.alt)}`);
	front.push("---", "");

	const body: string[] = [];
	const img = (x: TSlot) => `![${x.alt.replace(/]/g, "")}](${i.assetPath}/${x.filename})`;
	const pending = i.slots.filter((x) => x.type !== "hero");
	const take = (pred: (x: TSlot) => boolean) => {
		const out = pending.filter(pred);
		for (const x of out) pending.splice(pending.indexOf(x), 1);
		return out.map(img);
	};
	let section: string | null = null;
	let placed = false;
	i.post.blocks.forEach((b, n) => {
		if (b.kind === "faq") {
			const { q, a } = faqParts(b.text);
			body.push(`### ${q}`, "", a, "");
			return;
		}
		if (b.kind === "h2") {
			section = b.text;
			placed = false;
			body.push(`## ${b.text}`, "");
		} else if (b.kind === "h3") body.push(`### ${b.text}`, "");
		else if (b.kind === "ul") body.push(...items(b.text).map((x) => `- ${x}`), "");
		else if (b.kind === "quote") body.push(...b.text.split(NL).map((x) => `> ${x}`), "");
		else if (b.kind === "disclaimer") body.push(`<small>${b.text.replace(/</g, "&lt;")}</small>`, "");
		else if (b.kind !== "image") body.push(b.text, "");
		// A section's image goes after its first paragraph; the opening image after the direct answer.
		if (b.kind === "p" && section !== null && !placed) {
			const here = take((x) => x.placement === `In "${section}"`);
			if (here.length) body.push(...here, "");
			placed = true;
		}
		if (n === 0) {
			const opening = take((x) => x.placement === "After the opening answer");
			if (opening.length) body.push(...opening, "");
		}
	});
	// Anything whose section wasn't found goes at the end, in sheet order (never dropped).
	if (pending.length) body.push(...pending.map(img), "");
	const text = body.join(NL).replace(/\n{3,}/g, "\n\n").trim();
	return { ext: "mdx", content: `${front.join(NL)}${NL}${text}${NL}` };
}
