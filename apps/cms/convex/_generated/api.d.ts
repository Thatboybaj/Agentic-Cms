/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agentEdits from "../agentEdits.js";
import type * as agents_capped from "../agents/capped.js";
import type * as agents_editor from "../agents/editor.js";
import type * as agents_editorCore from "../agents/editorCore.js";
import type * as agents_gateway from "../agents/gateway.js";
import type * as agents_models from "../agents/models.js";
import type * as agents_pricing from "../agents/pricing.js";
import type * as agents_provider from "../agents/provider.js";
import type * as agents_run from "../agents/run.js";
import type * as agents_scheduled from "../agents/scheduled.js";
import type * as agents_scheduledCore from "../agents/scheduledCore.js";
import type * as agents_sdk from "../agents/sdk.js";
import type * as agents_swarm from "../agents/swarm.js";
import type * as agents_swarmCore from "../agents/swarmCore.js";
import type * as agents_visual from "../agents/visual.js";
import type * as agents_writer from "../agents/writer.js";
import type * as agents_writerCore from "../agents/writerCore.js";
import type * as appConfig from "../appConfig.js";
import type * as assetsNode from "../assetsNode.js";
import type * as billing from "../billing.js";
import type * as clerkApi from "../clerkApi.js";
import type * as clerkSync from "../clerkSync.js";
import type * as connections from "../connections.js";
import type * as connectionsNode from "../connectionsNode.js";
import type * as crons from "../crons.js";
import type * as devSeed from "../devSeed.js";
import type * as discovery_agent from "../discovery/agent.js";
import type * as discovery_agentCore from "../discovery/agentCore.js";
import type * as discovery_agentData from "../discovery/agentData.js";
import type * as discovery_batch from "../discovery/batch.js";
import type * as discovery_crawl from "../discovery/crawl.js";
import type * as discovery_crawlCore from "../discovery/crawlCore.js";
import type * as discovery_data from "../discovery/data.js";
import type * as discovery_evalCore from "../discovery/evalCore.js";
import type * as discovery_evalRun from "../discovery/evalRun.js";
import type * as discovery_evals from "../discovery/evals.js";
import type * as discovery_firecrawl from "../discovery/firecrawl.js";
import type * as discovery_golden from "../discovery/golden.js";
import type * as discovery_queries from "../discovery/queries.js";
import type * as discovery_run from "../discovery/run.js";
import type * as editor from "../editor.js";
import type * as git from "../git.js";
import type * as gitConnect from "../gitConnect.js";
import type * as gitHooks from "../gitHooks.js";
import type * as gitNode from "../gitNode.js";
import type * as gsc from "../gsc.js";
import type * as gscAgents from "../gscAgents.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as invites from "../invites.js";
import type * as kas from "../kas.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_approval from "../lib/approval.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_budget from "../lib/budget.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_gateInputs from "../lib/gateInputs.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_onpage from "../lib/onpage.js";
import type * as lib_pathScope from "../lib/pathScope.js";
import type * as lib_prDescription from "../lib/prDescription.js";
import type * as lib_readiness from "../lib/readiness.js";
import type * as lib_runs from "../lib/runs.js";
import type * as lib_transition from "../lib/transition.js";
import type * as members from "../members.js";
import type * as ops from "../ops.js";
import type * as pipeline_fixes from "../pipeline/fixes.js";
import type * as pipeline_gate from "../pipeline/gate.js";
import type * as pipeline_persist from "../pipeline/persist.js";
import type * as pipeline_proposals from "../pipeline/proposals.js";
import type * as pipeline_ship from "../pipeline/ship.js";
import type * as pipeline_steps from "../pipeline/steps.js";
import type * as plan from "../plan.js";
import type * as portfolio from "../portfolio.js";
import type * as postEdits from "../postEdits.js";
import type * as posts from "../posts.js";
import type * as render from "../render.js";
import type * as renderData from "../renderData.js";
import type * as review from "../review.js";
import type * as scheduledAgents from "../scheduledAgents.js";
import type * as schedules from "../schedules.js";
import type * as sites from "../sites.js";
import type * as slots from "../slots.js";
import type * as spend from "../spend.js";
import type * as templates from "../templates.js";
import type * as templatesNode from "../templatesNode.js";
import type * as users from "../users.js";
import type * as visualData from "../visualData.js";
import type * as workflows_autopostGate from "../workflows/autopostGate.js";
import type * as workflows_discovery from "../workflows/discovery.js";
import type * as workflows_manager from "../workflows/manager.js";
import type * as workflows_postPipeline from "../workflows/postPipeline.js";
import type * as workflows_revise from "../workflows/revise.js";
import type * as workflows_scheduledRun from "../workflows/scheduledRun.js";
import type * as workflows_shipPost from "../workflows/shipPost.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agentEdits: typeof agentEdits;
  "agents/capped": typeof agents_capped;
  "agents/editor": typeof agents_editor;
  "agents/editorCore": typeof agents_editorCore;
  "agents/gateway": typeof agents_gateway;
  "agents/models": typeof agents_models;
  "agents/pricing": typeof agents_pricing;
  "agents/provider": typeof agents_provider;
  "agents/run": typeof agents_run;
  "agents/scheduled": typeof agents_scheduled;
  "agents/scheduledCore": typeof agents_scheduledCore;
  "agents/sdk": typeof agents_sdk;
  "agents/swarm": typeof agents_swarm;
  "agents/swarmCore": typeof agents_swarmCore;
  "agents/visual": typeof agents_visual;
  "agents/writer": typeof agents_writer;
  "agents/writerCore": typeof agents_writerCore;
  appConfig: typeof appConfig;
  assetsNode: typeof assetsNode;
  billing: typeof billing;
  clerkApi: typeof clerkApi;
  clerkSync: typeof clerkSync;
  connections: typeof connections;
  connectionsNode: typeof connectionsNode;
  crons: typeof crons;
  devSeed: typeof devSeed;
  "discovery/agent": typeof discovery_agent;
  "discovery/agentCore": typeof discovery_agentCore;
  "discovery/agentData": typeof discovery_agentData;
  "discovery/batch": typeof discovery_batch;
  "discovery/crawl": typeof discovery_crawl;
  "discovery/crawlCore": typeof discovery_crawlCore;
  "discovery/data": typeof discovery_data;
  "discovery/evalCore": typeof discovery_evalCore;
  "discovery/evalRun": typeof discovery_evalRun;
  "discovery/evals": typeof discovery_evals;
  "discovery/firecrawl": typeof discovery_firecrawl;
  "discovery/golden": typeof discovery_golden;
  "discovery/queries": typeof discovery_queries;
  "discovery/run": typeof discovery_run;
  editor: typeof editor;
  git: typeof git;
  gitConnect: typeof gitConnect;
  gitHooks: typeof gitHooks;
  gitNode: typeof gitNode;
  gsc: typeof gsc;
  gscAgents: typeof gscAgents;
  http: typeof http;
  inbox: typeof inbox;
  invites: typeof invites;
  kas: typeof kas;
  "lib/access": typeof lib_access;
  "lib/approval": typeof lib_approval;
  "lib/audit": typeof lib_audit;
  "lib/budget": typeof lib_budget;
  "lib/crypto": typeof lib_crypto;
  "lib/defaults": typeof lib_defaults;
  "lib/functions": typeof lib_functions;
  "lib/gateInputs": typeof lib_gateInputs;
  "lib/github": typeof lib_github;
  "lib/notify": typeof lib_notify;
  "lib/onpage": typeof lib_onpage;
  "lib/pathScope": typeof lib_pathScope;
  "lib/prDescription": typeof lib_prDescription;
  "lib/readiness": typeof lib_readiness;
  "lib/runs": typeof lib_runs;
  "lib/transition": typeof lib_transition;
  members: typeof members;
  ops: typeof ops;
  "pipeline/fixes": typeof pipeline_fixes;
  "pipeline/gate": typeof pipeline_gate;
  "pipeline/persist": typeof pipeline_persist;
  "pipeline/proposals": typeof pipeline_proposals;
  "pipeline/ship": typeof pipeline_ship;
  "pipeline/steps": typeof pipeline_steps;
  plan: typeof plan;
  portfolio: typeof portfolio;
  postEdits: typeof postEdits;
  posts: typeof posts;
  render: typeof render;
  renderData: typeof renderData;
  review: typeof review;
  scheduledAgents: typeof scheduledAgents;
  schedules: typeof schedules;
  sites: typeof sites;
  slots: typeof slots;
  spend: typeof spend;
  templates: typeof templates;
  templatesNode: typeof templatesNode;
  users: typeof users;
  visualData: typeof visualData;
  "workflows/autopostGate": typeof workflows_autopostGate;
  "workflows/discovery": typeof workflows_discovery;
  "workflows/manager": typeof workflows_manager;
  "workflows/postPipeline": typeof workflows_postPipeline;
  "workflows/revise": typeof workflows_revise;
  "workflows/scheduledRun": typeof workflows_scheduledRun;
  "workflows/shipPost": typeof workflows_shipPost;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
