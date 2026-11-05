// Pure routing for the visual-asset agent — no I/O, safe to import on the client (the slot panel previews the
// chosen route before running). Follows the harness routing table (IMAGE_ROUTING in @studio/seo-harness):
//   brand_imagery → MCP (Higgsfield preferred) → image API · text_in_image → image API (OpenAI) · volume → open-source
//   diagram → SVG from the post · chart → inline SVG, never generated · stock / real-world / photo → licensed web source
// and falls through to the next connected route, else holds. When two routes fit: diagram, source, generate.
import { IMAGE_ROUTING } from "@studio/seo-harness";
import { PROVIDERS, type TConnectionProvider } from "../../features/connections/catalog";
import type { IAgentBrandPack, IAgentConnection, IRouteDecision, TAgentSlot, TRouteOverride, TRoutingNeed } from "./types";

/** Estimated USD per generated image, by provider. Estimates only — shown before every run (SKILL "Spend"). */
export const UNIT_USD: Partial<Record<TConnectionProvider, number>> = {
	"higgsfield-mcp": 0.045,
	"custom-mcp": 0.03,
	"openai-images": 0.04,
	replicate: 0.03,
	fal: 0.03,
};
export const GENERATE_COUNT = 4;
export const SOURCE_COUNT = 4;

const MCP_ORDER: TConnectionProvider[] = ["higgsfield-mcp", "custom-mcp"];
const BRAND_API_ORDER: TConnectionProvider[] = ["openai-images", "fal", "replicate"];
const TEXT_API_ORDER: TConnectionProvider[] = ["openai-images", "fal", "replicate"];
const VOLUME_ORDER: TConnectionProvider[] = ["fal", "replicate", "custom-mcp"];
const SOURCE_ORDER: TConnectionProvider[] = ["openverse", "wikimedia", "unsplash", "pexels"];

const TEXT_IN_IMAGE = /\b(text|label(?:led|ed|s)?|legible|caption|headline|lettering|words?|typography|annotat\w*)\b/i;
const REAL_WORLD = /\b(real (?:photo|place|premises|building|product)|landmark|reception|premises|storefront|building|street|city ?scape|historic\w*|museum|artwork)\b/i;

const brandPrefersVolume = (slot: TAgentSlot) => slot.provider === "open-source";

/** Usable = enabled and not failing its last test (untested is allowed: the seeded Openverse is untested). */
export function usable(c: IAgentConnection): boolean {
	if (!c.enabled || c.status === "failed") return false;
	const spec = PROVIDERS[c.provider];
	if (spec?.secret === "required" && !c.hasSecret) return false;
	if (spec?.kind === "mcp" && !c.toolName) return false;
	return true;
}

function pick(connections: IAgentConnection[], order: TConnectionProvider[], usedFor?: string): IAgentConnection[] {
	const ok = connections.filter(usable);
	const out: IAgentConnection[] = [];
	for (const p of order) for (const c of ok) if (c.provider === p && !out.includes(c)) out.push(c);
	// Connections explicitly tagged for this need come first within the same provider order.
	if (usedFor) out.sort((a, b) => Number(b.usedFor.includes(usedFor)) - Number(a.usedFor.includes(usedFor)));
	return out;
}

/** The routing need for a slot (SKILL Step 1). */
export function needOf(slot: TAgentSlot): TRoutingNeed {
	if (slot.humanPinned) return "human_only";
	if (slot.type === "chart") return "chart";
	if (slot.type === "diagram") return "diagram";
	if (slot.type === "photo" || slot.type === "screenshot") return "stock_or_real_world";
	const brief = `${slot.prompt} ${slot.alt}`;
	if (REAL_WORLD.test(brief)) return "stock_or_real_world";
	if (TEXT_IN_IMAGE.test(slot.prompt)) return "text_in_image";
	if (brandPrefersVolume(slot)) return "volume";
	return "brand_imagery";
}

const commercialNote = (brand?: IAgentBrandPack) => (brand?.commercial === false || brand?.allowNonCommercial ? "openly licensed" : "licensed for commercial use");

function generateDecision(c: IAgentConnection, need: TRoutingNeed, count: number): IRouteDecision {
	const isMcp = PROVIDERS[c.provider].kind === "mcp";
	const unit = UNIT_USD[c.provider] ?? 0.04;
	return {
		route: isMcp ? "generate-mcp" : "generate-api",
		need,
		connectionId: c.id,
		provider: c.provider,
		label: `Will generate with ${c.label}${isMcp ? " MCP" : ""}${c.model ? ` · ${c.model}` : ""}`,
		reason: need === "text_in_image" ? "Text must appear in the image, so a text-capable image model draws it" : need === "volume" ? "Volume slot: open-source model first" : "Brand imagery: no real-world fact is depicted, so it's generated in the brand's look",
		count,
		estimateUsd: +(unit * count).toFixed(3),
	};
}

function sourceDecision(c: IAgentConnection, need: TRoutingNeed, brand: IAgentBrandPack | undefined, why: string): IRouteDecision {
	return {
		route: "source",
		need,
		connectionId: c.id,
		provider: c.provider,
		label: `Will source from ${c.label} · ${commercialNote(brand)}`,
		reason: why,
		count: SOURCE_COUNT,
		estimateUsd: 0,
	};
}

function diagramDecision(connections: IAgentConnection[], need: TRoutingNeed, why: string): IRouteDecision {
	const llm = pick(connections, ["anthropic"])[0];
	return {
		route: "diagram",
		need,
		connectionId: llm?.id,
		provider: llm ? "anthropic-svg" : "svg-template",
		label: llm ? "Will draw a diagram from this post's content with Claude" : "Will draw a diagram from this post's steps",
		reason: why,
		count: 2,
		estimateUsd: llm ? 0.02 : 0,
	};
}

const hold = (need: TRoutingNeed, reason: string): IRouteDecision => ({ route: "hold", need, label: "Will hold this slot for a person", reason, count: 0, estimateUsd: 0 });

export interface IPlanOptions {
	override?: TRouteOverride;
	brandPack?: IAgentBrandPack;
}

/**
 * Ordered route plan for a slot: the preferred route first, then every connected fallback, always ending in `hold`.
 * run.ts walks this list on provider failure (SKILL "Failure handling").
 */
export function planRoutes(slot: TAgentSlot, connections: IAgentConnection[], opts: IPlanOptions = {}): IRouteDecision[] {
	const need = needOf(slot);
	const brand = opts.brandPack;
	if (need === "human_only") return [hold(need, "A person marked this slot human-only. Upload an image, or clear the pin by running the agent from the queue.")];
	if (need === "chart")
		return [{ route: "chart-svg", need, provider: "inline-svg", label: "Will render an inline SVG chart from the post's numbers", reason: "Charts are rendered from the post's own data, never generated", count: 1, estimateUsd: 0 }, hold(need, "Charts are never generated or sourced, so this slot waits for the figures.")];

	const gens = (list: IAgentConnection[], n = GENERATE_COUNT) => list.map((c) => generateDecision(c, need, n));
	const sources = (why: string) => pick(connections, SOURCE_ORDER, "stock").map((c) => sourceDecision(c, need, brand, why));
	const brandGens = () => gens([...pick(connections, MCP_ORDER, "brand_imagery"), ...pick(connections, BRAND_API_ORDER, "brand_imagery")]);

	let plan: IRouteDecision[];
	if (opts.override) {
		plan =
			opts.override === "diagram"
				? [diagramDecision(connections, need, "Override: diagram from the post's own content")]
				: opts.override === "source"
					? sources("Override: licensed web source")
					: need === "text_in_image"
						? gens(pick(connections, TEXT_API_ORDER, "text_in_image"))
						: need === "volume"
							? gens(pick(connections, VOLUME_ORDER, "volume"))
							: brandGens();
		return [...plan, hold(need, overrideHoldReason(opts.override))];
	}

	switch (need) {
		case "diagram":
			plan = [diagramDecision(connections, need, "The post already holds the steps, so a diagram built from them can't drift from the text")];
			break;
		case "stock_or_real_world":
			plan = sources(slot.type === "photo" ? "Real-world subject: a licensed real photo is honest, a generated one would be a fabrication" : "Real-world subject: sourced, never generated");
			break;
		case "text_in_image":
			plan = [...gens(pick(connections, TEXT_API_ORDER, "text_in_image")), diagramDecision(connections, need, "Fallback: the labelled text can be drawn as SVG")];
			break;
		case "volume":
			plan = [...gens(pick(connections, VOLUME_ORDER, "volume")), ...brandGens(), ...sources("Fallback: no generator connected, so a licensed stock image stands in")];
			break;
		default:
			plan = [...brandGens(), ...sources("Fallback: no image generator connected, so a licensed stock image stands in")];
	}
	const seen = new Set<string>();
	plan = plan.filter((d) => {
		const k = `${d.route}:${d.connectionId ?? d.provider}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
	return [...plan, hold(need, holdReason(need))];
}

function holdReason(need: TRoutingNeed): string {
	switch (need) {
		case "stock_or_real_world":
			return "No web image source is connected. Connect Openverse or a stock API in Settings → Connections, or upload a photo.";
		case "text_in_image":
			return "No text-capable image API is connected. Connect OpenAI images in Settings → Connections, or upload your own.";
		default:
			return "No image generator or web source is connected. Connect one in Settings → Connections, or upload your own.";
	}
}

function overrideHoldReason(o: TRouteOverride): string {
	return o === "generate" ? "No image generator is connected for this slot. Connect one in Settings → Connections." : o === "source" ? "No web image source is connected." : "The diagram couldn't be drawn from this post.";
}

/** The first decision — what the slot panel shows before running. */
export function chooseRoute(slot: TAgentSlot, connections: IAgentConnection[], brandPack?: IAgentBrandPack, override?: TRouteOverride): IRouteDecision {
	return planRoutes(slot, connections, { brandPack, override })[0];
}

/** Which overrides make sense for this slot given what is connected (for the Select). Charts get none. */
export function availableOverrides(slot: TAgentSlot, connections: IAgentConnection[]): TRouteOverride[] {
	if (slot.type === "chart" || slot.humanPinned) return [];
	const out: TRouteOverride[] = [];
	const photoLike = needOf(slot) === "stock_or_real_world";
	// Never offer to generate a "photo" of a real-world subject (SKILL: that would be a fabrication).
	if (!photoLike && pick(connections, [...MCP_ORDER, ...BRAND_API_ORDER]).length) out.push("generate");
	out.push("diagram");
	if (pick(connections, SOURCE_ORDER).length) out.push("source");
	return out;
}

/** Harness routing row for a need (for copy/tooltips). */
export const routingRow = (need: TRoutingNeed) => IMAGE_ROUTING.find((r) => r.route === need);

/** True when the only usable connections are web sources (drives the "connect a generator" callout). */
export function onlyWebSources(connections: IAgentConnection[]): boolean {
	const ok = connections.filter(usable);
	return ok.length > 0 && ok.every((c) => PROVIDERS[c.provider].kind === "web-source");
}
