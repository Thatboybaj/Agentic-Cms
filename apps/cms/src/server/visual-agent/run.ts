// runVisualAgent — one slot, one decision, 2–4 candidates with provenance, or a hold with a reason.
// Walks the route plan from route.ts: on provider failure retry once, then try the next route, else hold
// (SKILL "Failure handling"). Refuses a paid route over the remaining image cap (SKILL "Spend"). Each attempt is
// logged by route/provider/outcome only — never prompts' secrets (there are none) or keys.
import type { TProvider } from "../../lib/types";
import type { IConnection } from "../../features/connections/catalog";
import { getConnectionForSite, listConnections } from "./deps";
import { DiagramError, drawChart, drawDiagram } from "./diagram";
import { generate, GenerateError } from "./generate";
import { buildPrompt } from "./prompt";
import { needOf, planRoutes } from "./route";
import { SourceError, sourceImages } from "./source";
import { svgDataUri } from "./svg";
import type { IAgentBrandPack, IAgentCandidate, IAttempt, IPostExcerpt, IRouteDecision, IVisualAgentResult, TAgentSlot, TRouteOverride } from "./types";

export interface IRunInput {
	siteId: string;
	slot: TAgentSlot;
	post: IPostExcerpt;
	brandPack: IAgentBrandPack;
	/** Remaining monthly image budget in USD; paid routes estimated above it are refused. */
	estimateCapUsd?: number;
	override?: TRouteOverride;
}

const MIN_CANDIDATES = 2;
const NO_RETRY = /key|model id|Set a model|Add your|Pick the|can't generate|isn't|turned off|rejected/i;

const storeProvider = (p?: string): TProvider =>
	p === "higgsfield-mcp" ? "higgsfield" : p === "openai-images" || p === "gateway-images" ? "openai" : p === "inline-svg" || p === "svg-template" || p === "qwen-svg" ? "inline-svg" : "open-source";

function log(siteId: string, slotId: string, a: IAttempt) {
	console.info(`[visual-agent] site=${siteId} slot=${slotId} route=${a.route} provider=${a.provider ?? "-"} ok=${a.ok} ms=${a.ms} note=${JSON.stringify(a.note.slice(0, 160))}`);
}

const errMsg = (e: unknown) => (e instanceof GenerateError || e instanceof SourceError || e instanceof DiagramError ? e.message : "The provider failed unexpectedly.");

export async function runVisualAgent(input: IRunInput): Promise<IVisualAgentResult> {
	const { siteId, slot, post, brandPack } = input;
	const connections = await listConnections(siteId);
	const plan = planRoutes(slot, connections, { override: input.override, brandPack });
	const attempts: IAttempt[] = [];
	const record = (d: IRouteDecision, ok: boolean, note: string, t0: number) => {
		const a: IAttempt = { route: d.route, provider: d.provider, ok, note, ms: Date.now() - t0 };
		attempts.push(a);
		log(siteId, slot.id, a);
	};
	const conn = async (d: IRouteDecision): Promise<IConnection | null> => (d.connectionId ? getConnectionForSite(d.connectionId, siteId) : null);

	// Sourced candidates accumulate across consecutive web sources until there are enough.
	let sourced: IAgentCandidate[] = [];
	let sourceDecision: IRouteDecision | null = null;
	const finishSourced = (): IVisualAgentResult => ({
		route: "source",
		reason: sourceDecision!.reason,
		candidates: sourced.slice(0, 4),
		provider: [...new Set(sourced.map((c) => c.source.provider))].join(" + "),
		costEstimateUsd: 0,
		meta: { provider: "web-source", model: `${[...new Set(sourced.map((c) => c.source.provider))].join("+")}` },
		attempts,
	});

	for (const d of plan) {
		if (d.route !== "source" && sourced.length) return finishSourced();

		if (d.route === "hold") {
			const tried = attempts.filter((a) => !a.ok).map((a) => a.note);
			return { route: "hold", reason: d.reason, candidates: [], costEstimateUsd: 0, held: { reason: tried.length ? `${tried[tried.length - 1]} ${d.reason}`.trim() : d.reason }, attempts };
		}

		const t0 = Date.now();
		if (d.route === "chart-svg") {
			try {
				const svg = drawChart(slot, post, brandPack);
				record(d, true, "Inline SVG chart from the post's numbers", t0);
				return {
					route: "chart-svg",
					reason: d.reason,
					candidates: [{ id: "", label: "rendered from post data", hue: 174, selected: false, url: svgDataUri(svg), source: { kind: "diagram", provider: "inline-svg", model: "inline-svg", note: "Numbers taken verbatim from the post" } }],
					provider: "inline-svg",
					costEstimateUsd: 0,
					meta: { provider: "inline-svg", model: "inline-svg" },
					attempts,
				};
			} catch (e) {
				record(d, false, errMsg(e), t0);
				continue;
			}
		}

		if (d.route === "diagram") {
			try {
				const llm = await conn(d);
				const out = await drawDiagram(slot, post, brandPack, llm && llm.enabled ? llm : null);
				record(d, true, out.fallbackNote ? `Template diagram (${out.fallbackNote})` : `${out.svgs.length} diagram${out.svgs.length > 1 ? "s" : ""} via ${out.provider}`, t0);
				return {
					route: "diagram",
					reason: out.fallbackNote ? `${d.reason}. ${out.fallbackNote} Drew the template diagram instead.` : d.reason,
					candidates: out.svgs.map((s, i) => ({
						id: "",
						label: i === 0 ? "diagram" : "variant",
						hue: 174 + i * 20,
						selected: false,
						url: svgDataUri(s.svg),
						source: { kind: "diagram", provider: out.provider === "qwen-svg" && i === 0 ? "qwen" : "inline-svg", model: out.provider === "qwen-svg" && i === 0 ? out.model : "svg-template", note: s.note },
					})),
					provider: out.provider,
					model: out.model,
					costEstimateUsd: out.provider === "qwen-svg" ? d.estimateUsd : (out.labelCostUsd ?? 0),
					meta: { provider: "inline-svg", model: out.model },
					attempts,
				};
			} catch (e) {
				record(d, false, errMsg(e), t0);
				continue;
			}
		}

		if (d.route === "source") {
			const c = await conn(d);
			if (!c) {
				record(d, false, "That connection no longer exists for this site.", t0);
				continue;
			}
			sourceDecision ??= d;
			try {
				const out = await sourceImages(c, { slot, keyword: post.keyword, brand: brandPack, count: 4 - sourced.length, exclude: sourced.map((s) => s.url) });
				sourced = [...sourced, ...out.candidates];
				record(d, out.candidates.length > 0, out.candidates.length ? `${out.candidates.length} licensed image${out.candidates.length > 1 ? "s" : ""} for "${out.query}" (${out.rejected} refused by license or content checks)` : `${c.label} found nothing licensable for this slot (${out.rejected} refused).`, t0);
			} catch (e) {
				record(d, false, errMsg(e), t0);
			}
			if (sourced.length >= MIN_CANDIDATES) return finishSourced();
			continue;
		}

		// generate-mcp / generate-api
		if (input.estimateCapUsd !== undefined && d.estimateUsd > input.estimateCapUsd) {
			const reason = `Over the image cap: this run is estimated at $${d.estimateUsd.toFixed(2)} and $${Math.max(0, input.estimateCapUsd).toFixed(2)} is left this month. Ask an admin to raise the cap, or upload your own.`;
			record(d, false, reason, t0);
			return { route: "hold", reason, candidates: [], costEstimateUsd: d.estimateUsd, held: { reason }, attempts };
		}
		const c = await conn(d);
		if (!c) {
			record(d, false, "That connection no longer exists for this site.", t0);
			continue;
		}
		const built = buildPrompt(slot, brandPack, { textInImage: needOf(slot) === "text_in_image" });
		const g = { prompt: built.prompt, negative: built.negative, width: slot.width, height: slot.height, n: d.count };
		let lastErr: unknown;
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				const out = await generate(c, g);
				record(d, true, `${out.urls.length} image${out.urls.length > 1 ? "s" : ""} from ${c.label}`, t0);
				return {
					route: d.route,
					reason: d.reason,
					candidates: out.urls.slice(0, 4).map((url, i) => ({ id: "", label: `candidate ${i + 1}`, hue: 20 + i * 50, selected: false, url, source: { kind: "generated", provider: c.provider, model: out.model } })),
					provider: c.provider,
					model: out.model,
					costEstimateUsd: d.estimateUsd,
					meta: { provider: storeProvider(c.provider), model: out.model },
					attempts,
					prompt: built.prompt,
				};
			} catch (e) {
				lastErr = e;
				if (NO_RETRY.test(errMsg(e))) break;
			}
		}
		record(d, false, errMsg(lastErr), t0);
	}
	if (sourced.length) return finishSourced();
	return { route: "hold", reason: "No route could fill this slot.", candidates: [], costEstimateUsd: 0, held: { reason: attempts.map((a) => a.note).join(" ") || "No route could fill this slot." }, attempts };
}
