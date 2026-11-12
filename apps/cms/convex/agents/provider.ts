// Which model provider the agents call. CMS_MODEL_PROVIDER on the Convex deployment: "qwen" (default: Alibaba direct),
// "gateway" (the same Qwen models through Vercel AI Gateway) or "anthropic" (Claude). Switching needs no redeploy: set the env var and
// the next call uses the other provider's models, prices and transport. Pure (no Node APIs), so queries can use it.
import { PROVIDER_MODELS, type TModelProvider, type TModelTier } from "@studio/seo-harness";

export function activeProvider(env: Record<string, string | undefined> = process.env): TModelProvider {
	const p = env.CMS_MODEL_PROVIDER?.trim().toLowerCase();
	return p === "anthropic" ? "anthropic" : p === "gateway" ? "gateway" : "qwen";
}

/** The model id for a tier on the active provider. */
export const modelOf = (tier: TModelTier): string => PROVIDER_MODELS[activeProvider()][tier];

/** The active provider's full tier → id table. */
export const activeModels = (): Record<TModelTier, string> => PROVIDER_MODELS[activeProvider()];

export const isQwenModel = (model: string) => model.startsWith("qwen");
