// Client helpers for POST /api/visual-agent/run: build the request from store data (slot, the post's own content,
// brand pack, remaining image budget) and call the route. No secrets ever pass through the client.
import type { IBrandPack, IImageSlot, IPost, ISite } from "@/lib/types";
import type { IAgentBrandPack, IPostExcerpt, IVisualAgentResult, TAgentSlot, TRouteOverride } from "@/server/visual-agent/types";

export type { IVisualAgentResult, TRouteOverride };

/** The post's own content — headings, list items, paragraphs, in order — for diagrams and search keywords. */
export function excerptOf(post: IPost, keyword: string): IPostExcerpt {
	const blocks = post.blocks.filter((b): b is typeof b & { kind: "h2" | "h3" | "p" | "ul" } => b.kind === "h2" || b.kind === "h3" || b.kind === "p" || b.kind === "ul").map((b) => ({ kind: b.kind, text: b.text.slice(0, 6000) }));
	return {
		title: post.seoTitle || post.title,
		keyword,
		headings: blocks.filter((b) => b.kind === "h2" || b.kind === "h3").map((b) => b.text.slice(0, 300)).slice(0, 60),
		listItems: blocks.filter((b) => b.kind === "ul").flatMap((b) => b.text.split("\n")).map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 500)).slice(0, 120),
		paragraphs: blocks.filter((b) => b.kind === "p").map((b) => b.text.slice(0, 4000)).slice(0, 120),
		blocks: blocks.slice(0, 200),
	};
}

export const agentBrandPack = (b: IBrandPack): IAgentBrandPack => ({ palette: b.palette.slice(0, 12), styleKeywords: b.styleKeywords.slice(0, 20), commercial: true });

export const agentSlot = (s: IImageSlot): TAgentSlot => ({
	id: s.id,
	name: s.name,
	type: s.type,
	placement: s.placement,
	width: s.width,
	height: s.height,
	alt: s.alt,
	prompt: s.prompt,
	styleKeywords: s.styleKeywords,
	provider: s.provider,
	model: s.model,
	...(s.humanPinned ? { humanPinned: true } : {}),
});

export const remainingImageUsd = (site: ISite) => Math.max(0, site.budgets.imageCapUsd - site.budgets.imageUsd);

export async function runVisualAgentApi(body: { siteId: string; slot: TAgentSlot; post: IPostExcerpt; brandPack: IAgentBrandPack; estimateCapUsd?: number; override?: TRouteOverride }): Promise<IVisualAgentResult> {
	let res: Response;
	try {
		res = await fetch("/api/visual-agent/run", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	} catch {
		throw new Error("Couldn't reach the CMS server. Check it's running.");
	}
	const json = (await res.json().catch(() => null)) as (IVisualAgentResult & { error?: string }) | null;
	if (!res.ok || !json) throw new Error(json?.error ?? `The visual agent failed (${res.status}).`);
	return json;
}
