// Connections contract (isomorphic): types + provider catalog shared by the server module (src/server/connections.ts)
// and the Settings → Connections UI. No secrets, no Node imports — safe for client bundles.

export type TConnectionKind = "mcp" | "image-api" | "web-source" | "llm";
export type TConnectionProvider = "higgsfield-mcp" | "custom-mcp" | "openai-images" | "gateway-images" | "replicate" | "fal" | "openverse" | "wikimedia" | "unsplash" | "pexels" | "qwen";
export type TMcpTransport = "streamable-http" | "sse" | "stdio";
export type TUsedFor = "brand_imagery" | "text_in_image" | "volume" | "diagram" | "stock";
export type TConnectionStatus = "untested" | "ok" | "failed";

export interface IConnectionTool {
	name: string;
	description?: string;
}

/** A stored connection. Never carries the secret — only `hasSecret` + `secretHint` ("••••a1b2"). */
export interface IConnection {
	id: string;
	siteId: string;
	kind: TConnectionKind;
	provider: TConnectionProvider;
	label: string;
	transport?: TMcpTransport;
	url?: string;
	command?: string;
	args?: string[];
	/** User-entered model id (never hardcoded — placeholder hints only). */
	model?: string;
	/** MCP tool used for image generation, chosen from the tested tool list. */
	toolName?: string;
	/** Cached from the last successful test. */
	tools?: IConnectionTool[];
	usedFor: TUsedFor[];
	enabled: boolean;
	status: TConnectionStatus;
	/** Extra context for the status, e.g. "Key accepted by fal's queue API" (additive to the brief's contract). */
	statusNote?: string;
	lastTestedAt?: string;
	lastError?: string;
	hasSecret: boolean;
	secretHint?: string;
	createdAt: string;
}

/** Create/update payload. `id` absent = create. `kind` is derived from `provider`. */
export interface IConnectionInput {
	id?: string;
	siteId: string;
	provider: TConnectionProvider;
	label?: string;
	transport?: TMcpTransport;
	url?: string;
	command?: string;
	args?: string[];
	model?: string;
	toolName?: string;
	usedFor?: TUsedFor[];
	enabled?: boolean;
}

export interface IProviderSpec {
	provider: TConnectionProvider;
	kind: TConnectionKind;
	label: string;
	blurb: string;
	/** "required" = can't test without it; "optional" = works keyless; "none" = no secret field. */
	secret: "required" | "optional" | "none";
	secretLabel?: string;
	/** Model id field shown (APIs). */
	model: boolean;
	defaultUsedFor: TUsedFor[];
	/** Where the key comes from, shown as a hint under the secret field. */
	secretHint?: string;
	/** Preset MCP URL hint (never auto-filled with a guessed endpoint). */
	urlHint?: string;
}

export const PROVIDERS: Record<TConnectionProvider, IProviderSpec> = {
	"higgsfield-mcp": {
		provider: "higgsfield-mcp",
		kind: "mcp",
		label: "Higgsfield",
		blurb: "MCP · styled brand imagery, reference elements, characters",
		secret: "optional",
		secretLabel: "Bearer token",
		model: false,
		defaultUsedFor: ["brand_imagery"],
		secretHint: "Only if your Higgsfield MCP endpoint needs a token",
		urlHint: "The MCP URL from your Higgsfield account",
	},
	"custom-mcp": {
		provider: "custom-mcp",
		kind: "mcp",
		label: "Custom MCP server",
		blurb: "MCP · any image-generation server (Flux, SDXL, your own)",
		secret: "optional",
		secretLabel: "Bearer token",
		model: false,
		defaultUsedFor: ["volume"],
		secretHint: "Sent as Authorization: Bearer …",
		urlHint: "https://your-server.example.com/mcp",
	},
	"openai-images": { provider: "openai-images", kind: "image-api", label: "OpenAI images", blurb: "API · text-in-image and labelled visuals", secret: "required", secretLabel: "API key", model: true, defaultUsedFor: ["text_in_image"], secretHint: "From platform.openai.com → API keys" },
	"gateway-images": { provider: "gateway-images", kind: "image-api", label: "OpenAI images · Vercel AI Gateway", blurb: "OpenAI image models through your Vercel AI Gateway key · text-in-image and labelled visuals", secret: "optional", secretLabel: "AI Gateway key", model: true, defaultUsedFor: ["text_in_image"], secretHint: "Optional · without one the CMS uses AI_GATEWAY_API_KEY from the server. Model e.g. openai/gpt-image-2" },
	replicate: { provider: "replicate", kind: "image-api", label: "Replicate", blurb: "API · open-source models at volume", secret: "required", secretLabel: "API token", model: true, defaultUsedFor: ["volume"], secretHint: "From replicate.com → Account → API tokens" },
	fal: { provider: "fal", kind: "image-api", label: "fal", blurb: "API · fast open-source image models", secret: "required", secretLabel: "API key", model: true, defaultUsedFor: ["volume"], secretHint: "From fal.ai → Keys" },
	openverse: { provider: "openverse", kind: "web-source", label: "Openverse", blurb: "Openly licensed images · no key needed", secret: "optional", secretLabel: "OAuth token", model: false, defaultUsedFor: ["stock"], secretHint: "Optional · raises Openverse rate limits" },
	wikimedia: { provider: "wikimedia", kind: "web-source", label: "Wikimedia Commons", blurb: "Free-licensed media with attribution · no key needed", secret: "none", model: false, defaultUsedFor: ["stock"] },
	unsplash: { provider: "unsplash", kind: "web-source", label: "Unsplash", blurb: "Licensed stock photography", secret: "required", secretLabel: "Access key", model: false, defaultUsedFor: ["stock"], secretHint: "From unsplash.com/developers → your app" },
	pexels: { provider: "pexels", kind: "web-source", label: "Pexels", blurb: "Licensed stock photography", secret: "required", secretLabel: "API key", model: false, defaultUsedFor: ["stock"], secretHint: "From pexels.com/api" },
	qwen: { provider: "qwen", kind: "llm", label: "Qwen", blurb: "Diagram model · renders SVG diagrams from the post", secret: "required", secretLabel: "API key", model: true, defaultUsedFor: ["diagram"], secretHint: "From Alibaba Cloud Model Studio (international) → API keys" },
};

export const KIND_GROUPS: { kind: TConnectionKind; title: string; meta: string; icon: "Plugs" | "ImagesSquare" | "Globe" | "TreeStructure"; providers: TConnectionProvider[] }[] = [
	{ kind: "mcp", title: "Image generation — MCP servers", meta: "Brand imagery and styled scenes", icon: "Plugs", providers: ["higgsfield-mcp", "custom-mcp"] },
	{ kind: "image-api", title: "Image APIs", meta: "Text-in-image and volume", icon: "ImagesSquare", providers: ["gateway-images", "openai-images", "replicate", "fal"] },
	{ kind: "web-source", title: "Web image sources", meta: "Real-world and stock · license recorded", icon: "Globe", providers: ["openverse", "wikimedia", "unsplash", "pexels"] },
	{ kind: "llm", title: "Diagram model", meta: "Optional", icon: "TreeStructure", providers: ["qwen"] },
];

export const USED_FOR_LABEL: Record<TUsedFor, string> = {
	brand_imagery: "Brand imagery",
	text_in_image: "Text-in-image",
	volume: "Volume",
	diagram: "Diagrams",
	stock: "Real-world / stock",
};

export const USED_FOR_ORDER: TUsedFor[] = ["brand_imagery", "text_in_image", "volume", "diagram", "stock"];

export const ROUTING_REMINDER =
	"Routing is by slot type — brand imagery → MCP/Higgsfield, diagrams → SVG from the post, text-in-image → image API, volume → open-source, real-world/stock → licensed web source, charts never generated.";

export const kindOf = (p: TConnectionProvider): TConnectionKind => PROVIDERS[p].kind;
