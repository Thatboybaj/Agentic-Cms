import "server-only";
// Diagram + chart routes (SKILL Step 4). With an Anthropic connection, Claude draws the SVG (structured output,
// SVG only), which is then sanitized and fact-checked (every number in its text must appear in the post); anything
// that fails falls back to the deterministic template diagram. Charts are only ever the inline SVG from svg.ts.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { getSecret, type IConnection } from "../connections";
import { brandColors, chartSvg, deterministicDiagrams, sanitizeSvg, stepsFor } from "./svg";
import type { IAgentBrandPack, IPostExcerpt, TAgentSlot } from "./types";

/** Harness workhorse tier (harness-config.yaml visual-asset-agent.model); the connection's `model` overrides it. */
export const DEFAULT_DIAGRAM_MODEL = "claude-sonnet-5";
const TIMEOUT_MS = 90_000;
const MAX_EXCERPT_CHARS = 12_000;

export class DiagramError extends Error {}

const DiagramSchema = z.object({
	svg: z.string().describe("One complete <svg> element, nothing else"),
	source_refs: z.array(z.string()).describe("Headings or quoted phrases from the excerpt the diagram was built from"),
});

const SYSTEM = [
	"You draw one accessible SVG diagram for a blog post.",
	"Use only facts, steps, labels and numbers that are present in the provided post excerpt. Never invent numbers, percentages, durations, prices or scales; if a value is not stated, leave it out.",
	"Use only the brand palette given. Keep text contrast at 4.5:1 or better against its fill.",
	"Include <title> and <desc> as the first children of <svg>; <desc> summarises what the diagram shows in one sentence.",
	'Set viewBox and no fixed pixel width. Use font-family="system-ui, -apple-system, Segoe UI, sans-serif". Minimum label size 14px at the given width. At most 7 nodes. Logical reading order (left-to-right or top-to-bottom).',
	"No external fonts, no @import, no <style>, no <script>, no <foreignObject>, no <image>, no links, no event handlers, no animation.",
	"Return the SVG in the `svg` field and the excerpt sections you used in `source_refs`.",
].join("\n");

function excerptText(post: IPostExcerpt): string {
	const body = post.blocks?.length
		? post.blocks.map((b) => (b.kind === "h2" ? `## ${b.text}` : b.kind === "h3" ? `### ${b.text}` : b.kind === "ul" ? b.text.split("\n").map((l) => `- ${l}`).join("\n") : b.text)).join("\n\n")
		: [...post.headings.map((h) => `## ${h}`), ...post.listItems.map((l) => `- ${l}`), ...post.paragraphs].join("\n\n");
	return `# ${post.title}\n\n${body}`.slice(0, MAX_EXCERPT_CHARS);
}

/** Numbers drawn in the SVG's text that the post never states (the "never invent numbers" check). */
export function inventedNumbers(svg: string, post: IPostExcerpt): string[] {
	const text = [...svg.matchAll(/<(?:text|tspan|title|desc)[^>]*>([^<]*)</g)].map((m) => m[1]).join(" ");
	const source = excerptText(post).replace(/,(?=\d{3}\b)/g, "");
	const nums = (text.replace(/,(?=\d{3}\b)/g, "").match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => n.length > 1 || !/^[1-7]$/.test(n)); // step numbers 1–7 are ordinals, not facts
	return [...new Set(nums.filter((n) => !new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}([^\\d]|$)`).test(source)))];
}

async function claudeDiagram(conn: IConnection, slot: TAgentSlot, post: IPostExcerpt, brand: IAgentBrandPack): Promise<{ svg: string; refs: string[]; model: string }> {
	let apiKey: string | null;
	try {
		apiKey = await getSecret(conn.id);
	} catch {
		throw new DiagramError("The Anthropic key can't be read. Enter it again in Settings → Connections.");
	}
	if (!apiKey) throw new DiagramError("Add your Anthropic API key in Settings → Connections.");
	const model = conn.model?.trim() || DEFAULT_DIAGRAM_MODEL;
	const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
	const c = brandColors(brand.palette);
	const { steps } = stepsFor(slot, post);
	const user = [
		`Slot: ${slot.name} (${slot.type}), ${slot.width}×${slot.height}, placed ${slot.placement}.`,
		`Brief: ${slot.prompt || slot.alt}`,
		`Alt text the diagram must match: ${slot.alt}`,
		`Brand palette: background ${c.bg}, text ${c.ink}, accent ${c.accent}, text on accent ${c.onAccent}.`,
		steps.length >= 2 ? `Candidate steps found in the post (use them if they fit): ${steps.join(" → ")}` : "",
		"",
		"<post_excerpt>",
		excerptText(post),
		"</post_excerpt>",
	].filter((l) => l !== "").join("\n");
	try {
		const res = await client.messages.parse({
			model,
			max_tokens: 16000,
			system: SYSTEM,
			messages: [{ role: "user", content: user }],
			output_config: { format: zodOutputFormat(DiagramSchema) },
		});
		if (res.stop_reason === "refusal") throw new DiagramError("Claude declined to draw this diagram.");
		if (res.stop_reason === "max_tokens") throw new DiagramError("Claude's diagram was cut off before it finished.");
		const out = res.parsed_output;
		if (!out?.svg) throw new DiagramError("Claude returned no SVG.");
		return { svg: out.svg, refs: out.source_refs, model };
	} catch (e) {
		if (e instanceof DiagramError) throw e;
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new DiagramError("Anthropic rejected the key. Check it in Settings → Connections.");
		if (e instanceof Anthropic.NotFoundError) throw new DiagramError(`Anthropic doesn't know the model "${model}". Check the model id on the connection.`);
		if (e instanceof Anthropic.RateLimitError) throw new DiagramError("Anthropic is rate-limiting this key. Try again in a minute.");
		if (e instanceof Anthropic.APIConnectionTimeoutError) throw new DiagramError(`No response from Anthropic within ${TIMEOUT_MS / 1000} seconds.`);
		if (e instanceof Anthropic.APIConnectionError) throw new DiagramError("Couldn't reach Anthropic. Check the server's network.");
		if (e instanceof Anthropic.BadRequestError) throw new DiagramError("Anthropic refused the request as malformed.");
		if (e instanceof Anthropic.APIError) throw new DiagramError(`Anthropic answered with an error (${e.status ?? "unknown"}).`);
		throw new DiagramError("The diagram model failed unexpectedly.");
	}
}

export interface IDiagramOut {
	svgs: { svg: string; note: string }[];
	provider: "anthropic-svg" | "svg-template";
	model: string;
	/** Why the model path was skipped or rejected, if it was. */
	fallbackNote?: string;
}

export async function drawDiagram(slot: TAgentSlot, post: IPostExcerpt, brand: IAgentBrandPack, llm?: IConnection | null): Promise<IDiagramOut> {
	let fallbackNote: string | undefined;
	const templates = deterministicDiagrams(slot, post, brand);
	if (llm) {
		try {
			const r = await claudeDiagram(llm, slot, post, brand);
			const clean = sanitizeSvg(r.svg);
			if (!clean) throw new DiagramError("Claude's SVG didn't survive sanitizing.");
			const invented = inventedNumbers(clean, post);
			if (invented.length) throw new DiagramError(`Claude's diagram showed numbers the post doesn't state (${invented.slice(0, 3).join(", ")}).`);
			const svgs = [{ svg: clean, note: `Drawn by ${r.model} from ${r.refs.slice(0, 3).join(" · ") || "the post excerpt"}` }];
			if (templates[0]) svgs.push({ svg: templates[0].svg, note: `Template ${templates[0].kind} from ${templates[0].from}` });
			return { svgs, provider: "anthropic-svg", model: r.model };
		} catch (e) {
			fallbackNote = e instanceof DiagramError ? e.message : "The diagram model failed.";
		}
	}
	if (!templates.length) throw new DiagramError(`The post has no steps, list or headings to diagram${fallbackNote ? ` (${fallbackNote})` : ""}.`);
	return { svgs: templates.map((t) => ({ svg: t.svg, note: `Template ${t.kind} from ${t.from}` })), provider: "svg-template", model: "svg-template", fallbackNote };
}

export function drawChart(slot: TAgentSlot, post: IPostExcerpt, brand: IAgentBrandPack): string {
	const svg = chartSvg(slot, post, brand);
	if (!svg) throw new DiagramError("The post states no numbers to chart. Add the figures to the post, then run again.");
	return svg;
}
