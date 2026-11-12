/**
 * @studio/seo-harness — typed, pure-data view of the Grandeur SEO Agent Harness v0.3.0.
 *
 * Source of truth for humans: ../HARNESS.md. Source of truth for schedulers: ../harness-config.yaml.
 * This module mirrors both for UI use (no fs reads, safe in the browser). src/index.test.ts
 * checks the agent ids, count, and models against the YAML.
 *
 * Models are Qwen on Alibaba Cloud Model Studio (fast · workhorse · strongest), verified 2026-11-12.
 */

export type TModelTier = "fast" | "workhorse" | "strongest";

export type THumanGate =
  | "approve_idea"
  | "send_outreach"
  | "delete_pages"
  | "spend_over_cap"
  | "approve_plan";

export type TAgentId =
  | "orchestrator"
  | "seo-action-plan"
  | "keyword-research-swarm"
  | "blog-writing-agent"
  | "on-page-seo-optimizer"
  | "technical-seo-monitor"
  | "content-refresh-agent"
  | "link-building-prospector"
  | "seo-qa-agent"
  | "visualization-report-agent"
  | "visual-asset-agent"
  | "site-discovery-agent";

export type TSchedule =
  | "continuous"
  | "on_demand"
  | "weekly_monday"
  | "per_publish_slot"
  | "per_post_after_draft"
  | "weekly_friday"
  | "monthly_day1"
  | "weekly_friday_light_biweekly_friday_full"
  | "biweekly_friday_after_qa"
  | "on_site_add";

export interface IEscalation {
  modelId: string;
  modelTier: TModelTier;
  when: readonly string[];
}

export interface IHarnessAgent {
  id: TAgentId;
  /** Roster number in HARNESS.md (0 to 11). */
  number: number;
  name: string;
  role: string;
  modelTier: TModelTier;
  modelId: string;
  escalateTo?: IEscalation;
  schedule: TSchedule;
  inputs: readonly string[];
  outputs: readonly string[];
  /** Package-relative path, resolvable as `@studio/seo-harness/skills/<name>/SKILL.md`. Null for the orchestrator. */
  skillPath: string | null;
  handsOffTo?: TAgentId;
}

export interface IPublishingDefaults {
  autopostDefault: boolean;
  autoMergeOnGreenCi: boolean;
  whenAutopostOff: "human_review";
}

export interface IHarness {
  name: string;
  version: string;
  sharedStateDir: string;
  humanGates: readonly THumanGate[];
  publishing: IPublishingDefaults;
  escalation: {
    staleHumanItemDaysWarn: number;
    staleHumanItemDaysBlock: number;
    pivotReviewAfterConsecutiveBelowThresholdReports: number;
  };
}

export const MODELS = {
  fast: "qwen3.8-flash",
  workhorse: "qwen3.7-plus",
  strongest: "qwen3.8-max",
} as const satisfies Record<TModelTier, string>;

export type TModelProvider = "qwen" | "gateway" | "anthropic";

/**
 * Model ids per provider. Qwen is the target; Anthropic stays available as a fallback while the Model Studio account
 * is being verified. The backend picks one with CMS_MODEL_PROVIDER (default qwen); MODELS above is the Qwen set.
 */
export const PROVIDER_MODELS = {
  qwen: MODELS,
  /** The same Qwen models through Vercel AI Gateway (one key, provider list price). */
  gateway: MODELS,
  anthropic: { fast: "claude-haiku-4-5", workhorse: "claude-sonnet-5", strongest: "claude-opus-5-5" },
} as const satisfies Record<TModelProvider, Record<TModelTier, string>>;

export const HARNESS: IHarness = {
  name: "grandeur-seo-harness",
  version: "0.3.0",
  sharedStateDir: "./reports",
  humanGates: ["approve_idea", "send_outreach", "delete_pages", "spend_over_cap", "approve_plan"],
  publishing: {
    autopostDefault: true,
    autoMergeOnGreenCi: true,
    whenAutopostOff: "human_review",
  },
  escalation: {
    staleHumanItemDaysWarn: 7,
    staleHumanItemDaysBlock: 14,
    pivotReviewAfterConsecutiveBelowThresholdReports: 2,
  },
};

const skill = (id: TAgentId): string => `skills/${id}/SKILL.md`;

export const AGENTS: readonly IHarnessAgent[] = [
  {
    id: "orchestrator",
    number: 0,
    name: "Orchestrator",
    role: "Dispatcher: reads the schedule, checks preconditions, routes runs, passes report files between agents",
    modelTier: "fast",
    modelId: MODELS.fast,
    schedule: "continuous",
    inputs: ["schedule", "all_agent_artifacts"],
    outputs: ["run_dispatches", "qa_ledger_gaps"],
    skillPath: null,
  },
  {
    id: "seo-action-plan",
    number: 1,
    name: "SEO action plan",
    role: "Strategy: the plan every other agent works from",
    modelTier: "strongest",
    modelId: MODELS.strongest,
    schedule: "on_demand",
    inputs: ["brand_interview", "research"],
    outputs: ["plan_html", "pillar_keywords_csv"],
    skillPath: skill("seo-action-plan"),
  },
  {
    id: "keyword-research-swarm",
    number: 2,
    name: "Keyword research swarm",
    role: "Weekly pipeline refill",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "weekly_monday",
    inputs: ["pillar_keywords_csv", "keyword_ltm", "gsc_export_optional"],
    outputs: ["keyword_ltm_upsert", "pipeline_csv", "top10_md", "community_language_md"],
    skillPath: skill("keyword-research-swarm"),
  },
  {
    id: "blog-writing-agent",
    number: 3,
    name: "Blog writing agent",
    role: "Per-post drafting + image production sheet",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    escalateTo: { modelId: MODELS.strongest, modelTier: "strongest", when: ["pillar_page", "money_page"] },
    schedule: "per_publish_slot",
    inputs: ["brief_or_keyword", "brand_pack"],
    outputs: ["draft_md", "image_production_sheet", "verify_list"],
    skillPath: skill("blog-writing-agent"),
    handsOffTo: "visual-asset-agent",
  },
  {
    id: "on-page-seo-optimizer",
    number: 4,
    name: "On-page SEO optimizer",
    role: "Pre-publish audit gate",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "per_post_after_draft",
    inputs: ["draft_md", "target_keyword", "intent"],
    outputs: ["scorecard_md", "optimized_post"],
    skillPath: skill("on-page-seo-optimizer"),
  },
  {
    id: "technical-seo-monitor",
    number: 5,
    name: "Technical SEO monitor",
    role: "Weekly site health digest",
    modelTier: "fast",
    modelId: MODELS.fast,
    escalateTo: { modelId: MODELS.workhorse, modelTier: "workhorse", when: ["ambiguous_diagnosis"] },
    schedule: "weekly_friday",
    inputs: ["site_url", "previous_digest"],
    outputs: ["digest_md"],
    skillPath: skill("technical-seo-monitor"),
  },
  {
    id: "content-refresh-agent",
    number: 6,
    name: "Content refresh agent",
    role: "Monthly decay and page-2 cycle",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "monthly_day1",
    inputs: ["gsc_export", "site_url", "previous_cycle_report"],
    outputs: ["refresh_drafts", "prune_signoff_list", "cycle_report_md"],
    skillPath: skill("content-refresh-agent"),
  },
  {
    id: "link-building-prospector",
    number: 7,
    name: "Link building prospector",
    role: "Monthly prospecting + outreach drafts",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "monthly_day1",
    inputs: ["competitors", "backlink_export_optional", "sender_profile"],
    outputs: ["prospect_csv", "outreach_drafts", "human_action_list"],
    skillPath: skill("link-building-prospector"),
  },
  {
    id: "seo-qa-agent",
    number: 8,
    name: "SEO QA agent",
    role: "Verifies agent output against reality, tracks progress, demands human updates",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "weekly_friday_light_biweekly_friday_full",
    inputs: ["all_agent_artifacts", "site_url", "action_plan_milestones", "human_ledger_previous"],
    outputs: ["qa_scorecard", "human_ledger_json", "blockers_md"],
    skillPath: skill("seo-qa-agent"),
  },
  {
    id: "visualization-report-agent",
    number: 9,
    name: "Visualization report agent",
    role: "Bi-weekly visual progress report + pivot calls",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    escalateTo: { modelId: MODELS.strongest, modelTier: "strongest", when: ["pivot_trigger_fired"] },
    schedule: "biweekly_friday_after_qa",
    inputs: ["qa_scorecard", "gsc_export", "all_agent_artifacts", "bound_template"],
    outputs: ["biweekly_report_html", "pivot_flags"],
    skillPath: skill("visualization-report-agent"),
  },
  {
    id: "visual-asset-agent",
    number: 10,
    name: "Visual asset agent",
    role: "Per-post image slots: generate, diagram, or source licensed images; post-process; provenance",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    schedule: "per_post_after_draft",
    inputs: ["image_production_sheet", "brand_pack", "post_content", "connections"],
    outputs: ["asset_candidates", "svg_diagrams", "provenance_log"],
    skillPath: skill("visual-asset-agent"),
  },
  {
    id: "site-discovery-agent",
    number: 11,
    name: "Site discovery agent",
    role: "On a new site: crawl it, understand the business, propose pillars, keywords and the first batch of ideas with evidence",
    modelTier: "workhorse",
    modelId: MODELS.workhorse,
    escalateTo: { modelId: MODELS.strongest, modelTier: "strongest", when: ["site_profile"] },
    schedule: "on_site_add",
    inputs: ["site_domain", "gsc_export", "keyword_csv_import"],
    outputs: ["site_profile", "pillar_keywords_csv", "brand_pack_draft", "content_map"],
    skillPath: skill("site-discovery-agent"),
  },
];

/** The Agentic CMS's native agent. Not a harness agent and not counted in AGENTS. */
export const CMS_AGENT = {
  id: "cms-agent",
  name: "CMS agent (product surface)",
  role: "Owns post state, resolves template slots, runs the auto-gate under autopost, sole repo writer (opens and merges MRs)",
  modelTier: "workhorse" as TModelTier,
  modelId: MODELS.workhorse,
  consumes: ["draft_md", "image_production_sheet", "asset_candidates", "svg_diagrams", "provenance_log", "scorecard_md", "refresh_drafts"],
  produces: ["merge_request", "merge_result", "agent_edit_log", "autopost_reasons"],
} as const;

export interface IScheduleEntry {
  cadence: string;
  agents: readonly TAgentId[];
  note?: string;
}

export const SCHEDULE: readonly IScheduleEntry[] = [
  { cadence: "When a site is added, or on demand", agents: ["site-discovery-agent"], note: "First ideas for a new site; re-runs add ideas, never edit or delete" },
  { cadence: "Monday", agents: ["keyword-research-swarm"] },
  {
    cadence: "Per publish day",
    agents: ["blog-writing-agent", "visual-asset-agent", "on-page-seo-optimizer"],
    note: "In order, then the CMS agent's auto-gate and MR (autopost on) or In review (autopost off)",
  },
  { cadence: "Friday", agents: ["technical-seo-monitor", "seo-qa-agent"], note: "seo-qa-agent light run" },
  { cadence: "1st of month", agents: ["content-refresh-agent", "link-building-prospector"] },
  {
    cadence: "Every second Friday",
    agents: ["seo-qa-agent", "visualization-report-agent"],
    note: "seo-qa-agent full run, then the report",
  },
  { cadence: "Quarterly or on triggered pivot flag", agents: ["seo-action-plan"], note: "Review run" },
];

export type TImageRoute =
  | "brand_imagery"
  | "diagram"
  | "text_in_image"
  | "volume"
  | "chart"
  | "stock_or_real_world";

export type TImageProviderKind =
  | "connected_mcp_or_api"
  | "svg_from_content"
  | "image_api"
  | "open_source"
  | "inline_svg_never_generated"
  | "web_source_licensed";

export interface IImageRouting {
  route: TImageRoute;
  provider: TImageProviderKind;
  preferred: string;
  fallback: string;
  generated: boolean;
}

export const IMAGE_ROUTING: readonly IImageRouting[] = [
  {
    route: "brand_imagery",
    provider: "connected_mcp_or_api",
    preferred: "Higgsfield via MCP",
    fallback: "Next connected image API",
    generated: true,
  },
  {
    route: "diagram",
    provider: "svg_from_content",
    preferred: "SVG built from the post's own facts and steps",
    fallback: "None needed",
    generated: false,
  },
  {
    route: "text_in_image",
    provider: "image_api",
    preferred: "OpenAI image models",
    fallback: "Diagram route if the text fits an SVG",
    generated: true,
  },
  {
    route: "volume",
    provider: "open_source",
    preferred: "Flux or SDXL endpoints via API or MCP",
    fallback: "Brand imagery provider",
    generated: true,
  },
  {
    route: "chart",
    provider: "inline_svg_never_generated",
    preferred: "Inline SVG rendered from the post's data",
    fallback: "None",
    generated: false,
  },
  {
    route: "stock_or_real_world",
    provider: "web_source_licensed",
    preferred: "Openverse, Wikimedia Commons, or the site's connected stock API",
    fallback: "Hold the slot with a ledger item",
    generated: false,
  },
];

export const getAgent = (id: TAgentId): IHarnessAgent | undefined => AGENTS.find((a) => a.id === id);

export { SKILLS, type ISkillText } from "./skills.generated";

// ─── Keyword research swarm v0.3: nine specialists and the keyword LTM ─────────

export type TSwarmSpecialist =
  | "seed-brainstormer"
  | "term-expander"
  | "long-tail-hunter"
  | "competitor-gap-analyst"
  | "metrics-analyst"
  | "intent-classifier"
  | "cluster-architect"
  | "funnel-prioritizer"
  | "audience-researcher";

/** One per step of the method (harness-config.yaml keyword-research-swarm.swarm). Tiers resolve per provider. */
export const SWARM_SPECIALISTS: readonly { id: TSwarmSpecialist; step: number; tier: TModelTier; focus: string }[] = [
  { id: "seed-brainstormer", step: 1, tier: "workhorse", focus: "seed_keywords_from_offerings_problems_audience" },
  { id: "term-expander", step: 2, tier: "fast", focus: "related_terms_autocomplete_paa_modifiers" },
  { id: "long-tail-hunter", step: 3, tier: "fast", focus: "long_tail_question_low_competition" },
  { id: "competitor-gap-analyst", step: 4, tier: "workhorse", focus: "competitor_keyword_gaps_with_evidence" },
  { id: "metrics-analyst", step: 5, tier: "workhorse", focus: "volume_difficulty_cpc_serp_features_honest_tiers" },
  { id: "intent-classifier", step: 6, tier: "fast", focus: "four_intents_plus_funnel_stage" },
  { id: "cluster-architect", step: 7, tier: "workhorse", focus: "pillar_cluster_tree_primary_secondary_roles" },
  { id: "funnel-prioritizer", step: 8, tier: "workhorse", focus: "tofu_mofu_bofu_balance_priority_ltm_upsert" },
  { id: "audience-researcher", step: 9, tier: "workhorse", focus: "community_pain_language_verbatim_phrases" },
];

export type TLtmStatus = "candidate" | "qualified" | "in-plan" | "live" | "retired";

/** The keyword long-term memory contract (harness-config.yaml keyword_ltm). */
export const KEYWORD_LTM = {
  store: "keywords",
  portableFile: "reports/keywords-ltm.csv",
  statuses: ["candidate", "qualified", "in-plan", "live", "retired"] as readonly TLtmStatus[],
  writtenBy: ["keyword-research-swarm", "site-discovery-agent"] as readonly TAgentId[],
  readBy: ["blog-writing-agent", "on-page-seo-optimizer", "content-refresh-agent"] as readonly TAgentId[],
  monitoredBy: ["seo-action-plan", "seo-qa-agent", "visualization-report-agent", "technical-seo-monitor"] as readonly TAgentId[],
  columns: ["keyword", "normalized", "pillar", "cluster", "length_class", "role", "intent", "funnel_stage", "volume_tier", "volume", "volume_source", "difficulty_tier", "difficulty_evidence", "serp_features", "aeo_potential", "priority_score", "status", "why_we_win", "source_agent", "evidence_urls", "target_page", "added_at", "last_verified_at", "retired_reason"] as const,
} as const;
