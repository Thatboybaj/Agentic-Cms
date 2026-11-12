// Which model provider the agents call. CMS_MODEL_PROVIDER on the Convex deployment: "qwen" (default, the target) or
// "anthropic" (fallback while the Model Studio account is verified). Switching needs no redeploy: set the env var and
// the next call uses the other provider's models, prices and transport. Pure (no Node APIs), so queries can use it.
import { PROVIDER_MODELS, type TModelProvider, type TModelTier } from "@studio/seo-harness";

export function activeProvider(env: Record<string, string | undefined> = process.env): TModelProvider {
	return env.CMS_MODEL_PROVIDER?.trim().toLowerCase() === "anthropic" ? "anthropic" : "qwen";
}

/** The model id for a tier on the active provider. */
export const modelOf = (tier: TModelTier): string => PROVIDER_MODELS[activeProvider()][tier];

/** The active provider's full tier → id table. */
export const activeModels = (): Record<TModelTier, string> => PROVIDER_MODELS[activeProvider()];

export const isQwenModel = (model: string) => model.startsWith("qwen");
