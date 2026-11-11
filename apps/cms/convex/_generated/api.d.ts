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
import type * as clerkApi from "../clerkApi.js";
import type * as clerkSync from "../clerkSync.js";
import type * as devSeed from "../devSeed.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_budget from "../lib/budget.js";
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_runs from "../lib/runs.js";
import type * as lib_transition from "../lib/transition.js";
import type * as members from "../members.js";
import type * as pipeline_persist from "../pipeline/persist.js";
import type * as pipeline_steps from "../pipeline/steps.js";
import type * as portfolio from "../portfolio.js";
import type * as posts from "../posts.js";
import type * as sites from "../sites.js";
import type * as users from "../users.js";
import type * as workflows_manager from "../workflows/manager.js";
import type * as workflows_postPipeline from "../workflows/postPipeline.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  clerkApi: typeof clerkApi;
  clerkSync: typeof clerkSync;
  devSeed: typeof devSeed;
  http: typeof http;
  invites: typeof invites;
  "lib/access": typeof lib_access;
  "lib/audit": typeof lib_audit;
  "lib/budget": typeof lib_budget;
  "lib/defaults": typeof lib_defaults;
  "lib/functions": typeof lib_functions;
  "lib/notify": typeof lib_notify;
  "lib/runs": typeof lib_runs;
  "lib/transition": typeof lib_transition;
  members: typeof members;
  "pipeline/persist": typeof pipeline_persist;
  "pipeline/steps": typeof pipeline_steps;
  portfolio: typeof portfolio;
  posts: typeof posts;
  sites: typeof sites;
  users: typeof users;
  "workflows/manager": typeof workflows_manager;
  "workflows/postPipeline": typeof workflows_postPipeline;
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
