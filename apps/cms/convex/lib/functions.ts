// Function wrappers (handoff 01 step 3). Every public function in apps/cms/convex is built from one of these, so a
// function cannot be registered without its access check. scripts/check-cms-convex-auth.mjs enforces it in CI.
//
//   export const get = siteQuery({ permission: "plan.view", args: {}, handler: async (ctx, { siteId }) => ctx.access.site });
//
// Site-scoped: `siteId` is injected as the first arg and checked with requireSiteRole before the handler runs; the
// handler gets `ctx.access` = { user, site, role, workspaceId }. Never trust role/userId from args (Forbidden moves).
import { customAction, customCtx, customCtxAndArgs, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { v } from "convex/values";
import type { TPermission } from "../../src/lib/logic";
import { internal } from "../_generated/api";
import { action, mutation, query } from "../_generated/server";
import { requireIdentity, requireSiteRole, requireWorkspaceRole, type ISiteAccess } from "./access";

type TSiteExtra = { permission: TPermission };
type TWorkspaceExtra = { permission?: TPermission | null };

/** Marks a registered function with its access kind so the isolation sweep can prove every export is wrapped. */
export type TAccessKind = "site" | "workspace" | "identity";
export const ACCESS_KIND = "__cmsAccess" as const;

function tag<B extends (...a: any[]) => any>(builder: B, kind: TAccessKind): B {
	return ((def: unknown) => {
		const fn = builder(def);
		Object.defineProperty(fn, ACCESS_KIND, { value: kind, enumerable: false });
		return fn;
	}) as B;
}

const siteArgs = { siteId: v.id("sites") };

export const siteQuery = tag(
	customQuery(
		query,
		customCtxAndArgs({
			args: siteArgs,
			input: async (ctx, { siteId }, { permission }: TSiteExtra) => ({
				ctx: { access: await requireSiteRole(ctx, siteId, permission) },
				args: { siteId },
			}),
		}),
	),
	"site",
);

export const siteMutation = tag(
	customMutation(
		mutation,
		customCtxAndArgs({
			args: siteArgs,
			input: async (ctx, { siteId }, { permission }: TSiteExtra) => ({
				ctx: { access: await requireSiteRole(ctx, siteId, permission) },
				args: { siteId },
			}),
		}),
	),
	"site",
);

/** Actions have no ctx.db: the check runs as an internal query first (README §4), auth identity carries over. */
export const siteAction = tag(
	customAction(
		action,
		customCtxAndArgs({
			args: siteArgs,
			input: async (ctx, { siteId }, { permission }: TSiteExtra) => {
				const access: Pick<ISiteAccess, "role" | "workspaceId"> & { siteId: typeof siteId; userId: ISiteAccess["user"]["_id"] } = await ctx.runQuery(
					internal.access.assertSiteRole,
					{ siteId, permission },
				);
				return { ctx: { access }, args: { siteId } };
			},
		}),
	),
	"site",
);

export const workspaceQuery = tag(
	customQuery(
		query,
		customCtx(async (ctx, { permission }: TWorkspaceExtra) => ({ access: await requireWorkspaceRole(ctx, permission ?? null) })),
	),
	"workspace",
);

export const workspaceMutation = tag(
	customMutation(
		mutation,
		customCtx(async (ctx, { permission }: TWorkspaceExtra) => ({ access: await requireWorkspaceRole(ctx, permission ?? null) })),
	),
	"workspace",
);

/** Signed in, nothing else: only for bootstrap (users.ensure) where no user row may exist yet. */
export const identityMutation = tag(
	customMutation(
		mutation,
		customCtx(async (ctx) => ({ identity: await requireIdentity(ctx) })),
	),
	"identity",
);

export const identityQuery = tag(
	customQuery(
		query,
		customCtx(async (ctx) => ({ identity: await requireIdentity(ctx) })),
	),
	"identity",
);
