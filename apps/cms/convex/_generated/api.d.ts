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
import type * as lib_defaults from "../lib/defaults.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_notify from "../lib/notify.js";
import type * as members from "../members.js";
import type * as sites from "../sites.js";
import type * as users from "../users.js";
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
  "lib/defaults": typeof lib_defaults;
  "lib/functions": typeof lib_functions;
  "lib/notify": typeof lib_notify;
  members: typeof members;
  sites: typeof sites;
  users: typeof users;
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
};
