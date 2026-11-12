// Visual-asset agent (harness agent #10) — shared, isomorphic types. No Node imports, no secrets.
// Skill: packages/seo-harness/skills/visual-asset-agent/SKILL.md · decisions C12/C13 (docs/uxer/00-decisions.md).
import type { ICandidate, IImageSlot, TProvider } from "../../lib/types";
import type { TConnectionProvider } from "../../features/connections/catalog";

export type TVisualRoute = "generate-mcp" | "generate-api" | "diagram" | "source" | "chart-svg" | "hold";
/** What the person can force from the route override Select. */
export type TRouteOverride = "generate" | "diagram" | "source";
/** The harness routing-table key (packages/seo-harness IMAGE_ROUTING) that drove the decision. */
export type TRoutingNeed = "brand_imagery" | "text_in_image" | "volume" | "diagram" | "chart" | "stock_or_real_world" | "human_only";

/** The slot fields the agent reads. A full IImageSlot satisfies it. */
export type TAgentSlot = Pick<IImageSlot, "id" | "name" | "type" | "placement" | "width" | "height" | "alt" | "prompt" | "styleKeywords" | "provider" | "model"> & {
	humanPinned?: boolean;
};

export interface IAgentBrandPack {
	palette: string[];
	styleKeywords: string[];
	/** Visual don'ts from the brand pack, sent as negatives. */
	avoid?: string[];
	/** Commercial site (default true): NC licenses are refused unless `allowNonCommercial`. */
	commercial?: boolean;
	allowNonCommercial?: boolean;
	/** ND licenses are refused by default because assets are cropped and resized. */
	allowNoDerivatives?: boolean;
}

/** Only what the agent needs from a connection — never a secret. IConnection satisfies it. */
export interface IAgentConnection {
	id: string;
	provider: TConnectionProvider;
	label: string;
	enabled: boolean;
	status: "untested" | "ok" | "failed";
	hasSecret: boolean;
	model?: string;
	toolName?: string;
	usedFor: string[];
}

export interface IPostBlockExcerpt {
	kind: "h2" | "h3" | "p" | "ul";
	text: string;
}

/** The post's own content — the only facts a diagram or chart may use. */
export interface IPostExcerpt {
	title: string;
	keyword: string;
	headings: string[];
	listItems: string[];
	paragraphs: string[];
	/** Ordered blocks (optional) so the agent can read the section a slot sits in. */
	blocks?: IPostBlockExcerpt[];
}

export interface IRouteDecision {
	route: TVisualRoute;
	need: TRoutingNeed;
	connectionId?: string;
	provider?: TConnectionProvider | "svg-template" | "qwen-svg" | "inline-svg";
	/** Short sentence for the UI: "Will source from Openverse · licensed for commercial use". */
	label: string;
	reason: string;
	/** Candidates this route asks for. */
	count: number;
	estimateUsd: number;
}

export type TSourceKind = NonNullable<ICandidate["source"]>["kind"];

export interface IAgentCandidate extends ICandidate {
	url: string;
	source: NonNullable<ICandidate["source"]> & { licenseUrl?: string; note?: string };
}

export interface IAttempt {
	route: TVisualRoute;
	provider?: string;
	ok: boolean;
	note: string;
	ms: number;
}

export interface IVisualAgentResult {
	route: TVisualRoute;
	reason: string;
	candidates: IAgentCandidate[];
	provider?: string;
	model?: string;
	costEstimateUsd: number;
	/** Meta for actions.setSlotCandidates (the store's provider vocabulary). */
	meta?: { provider: TProvider; model?: string };
	held?: { reason: string };
	attempts: IAttempt[];
	/** Final assembled generation prompt (generate routes only; never contains secrets). */
	prompt?: string;
}
