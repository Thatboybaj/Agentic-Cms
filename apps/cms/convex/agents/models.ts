// Tier routing (handoff 03 step 6). Base tier from the harness roster, overridden by the site's task-group routing,
// then static escalation. Model ids only ever come from MODELS in @studio/seo-harness.
import { getAgent, MODELS, type TAgentId, type TModelTier } from "@studio/seo-harness";

export type TTaskGroup = "mechanical" | "writing" | "strategy" | "pillarPages";
export type TSiteRouting = Record<TTaskGroup, TModelTier>;

const GROUP: Partial<Record<TAgentId, TTaskGroup>> = {
	"blog-writing-agent": "writing",
	"content-refresh-agent": "writing",
	"on-page-seo-optimizer": "mechanical",
	"technical-seo-monitor": "mechanical",
	"seo-qa-agent": "mechanical",
	"keyword-research-swarm": "strategy",
	"seo-action-plan": "strategy",
	"visualization-report-agent": "strategy",
	"link-building-prospector": "strategy",
	"site-discovery-agent": "writing", // keywords and ideas; extraction runs on the mechanical tier and the profile on strategy (agents/discovery)
};

const ORDER: TModelTier[] = ["fast", "workhorse", "strongest"];

/** One tier up, or null at the top (D7: escalate once, then fail). */
export const escalate = (t: TModelTier): TModelTier | null => ORDER[ORDER.indexOf(t) + 1] ?? null;

export interface IModelChoice {
	tier: TModelTier;
	model: string;
	escalated: boolean;
}

/**
 * The model for one agent run. `pillar` (pillar/money page or post.strongModel) routes the writer to the site's
 * pillar-pages tier and escalates to the roster's escalateTo; `pivot` does the same for the report agent.
 */
export function modelFor(agentId: TAgentId, routing: TSiteRouting | undefined, opts: { pillar?: boolean; pivot?: boolean; ambiguous?: boolean } = {}): IModelChoice {
	const agent = getAgent(agentId);
	if (!agent) throw new Error(`Unknown agent ${agentId}`);
	const group = GROUP[agentId];
	let tier: TModelTier = (group && routing?.[group]) || agent.modelTier;
	let escalated = false;
	const when = agent.escalateTo?.when ?? [];
	const fire = (opts.pillar && (when.includes("pillar_page") || when.includes("money_page"))) || (opts.pivot && when.includes("pivot_trigger_fired")) || (opts.ambiguous && when.includes("ambiguous_diagnosis"));
	if (opts.pillar && agentId === "blog-writing-agent" && routing?.pillarPages) tier = maxTier(tier, routing.pillarPages);
	if (fire && agent.escalateTo) {
		const next = maxTier(tier, agent.escalateTo.modelTier);
		escalated = next !== tier;
		tier = next;
	}
	return { tier, model: MODELS[tier], escalated };
}

const maxTier = (a: TModelTier, b: TModelTier): TModelTier => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);
