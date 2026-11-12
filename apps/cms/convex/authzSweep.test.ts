// @vitest-environment edge-runtime
// Handoff 09 step 1, runtime half (the static half is access.test.ts "(f)"): every public site-scoped function,
// called with arguments synthesised from its own validator, is refused for (1) a signed-in user of ANOTHER agency
// passing this agency's siteId and (2) a caller with no identity. Nothing may succeed, whatever the args.
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, test } from "vitest";
import { ACCESS_KIND } from "./lib/functions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

type TJson = { type: string; value?: unknown; tableName?: string; fieldType?: TJson; optional?: boolean };

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_victim", name: "Victim", slug: "victim", plan: "pilot", seats: 5, createdAt: 0 });
		const ws2 = await ctx.db.insert("workspaces", { clerkOrgId: "org_outsider", name: "Outsider", slug: "outsider", plan: "pilot", seats: 5, createdAt: 0 });
		const owner = await ctx.db.insert("users", { clerkUserId: "owner", tokenIdentifier: `${ISSUER}|owner`, name: "Owner", initials: "OW", email: "o@x.co", avatarHue: 1, status: "active" });
		const outsider = await ctx.db.insert("users", { clerkUserId: "outsider", tokenIdentifier: `${ISSUER}|outsider`, name: "Outsider", initials: "OU", email: "x@y.co", avatarHue: 1, status: "active" });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		await ctx.db.insert("workspaceMembers", { workspaceId: ws2, userId: outsider, role: "owner", status: "active", addedAt: 0 }); // an admin, just of the other agency
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		const pillar = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "P", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keyword = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId: pillar, term: "k", termNormalized: "k", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const post = await ctx.db.insert("posts", { workspaceId: ws, siteId: site, slug: "p", title: "P", seoTitle: "P", keywordId: keyword, pillarId: pillar, intent: "commercial", contentType: "guide", source: "manual", state: "in-review", stateChangedAt: 0, owner: "human", week: 40, strongModel: false, words: 1, wordTarget: 800, blocks: [{ id: "b1", kind: "p", text: "x" }], currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0 });
		const slot = await ctx.db.insert("imageSlots", { siteId: site, postId: post, name: "Hero", type: "hero", placement: "top", width: 10, height: 10, format: "webp", breakpoints: [], filename: "p.webp", alt: "a", prompt: "p", styleKeywords: [], provider: "higgsfield", model: "m", status: "candidates", estimateUsd: 0, order: 0 });
		const repo = await ctx.db.insert("repoConnections", { workspaceId: ws, siteId: site, host: "github", repo: "v/site", baseBranch: "main", contentDir: "content/blog", assetDir: "public/images", branchPattern: "content/{slug}", installedAs: "x", installationId: "1", status: "active", connectedBy: owner, connectedAt: 0 });
		const storage = await ctx.storage.store(new Blob(["x"]));
		const table: Record<string, string> = {
			sites: site, workspaces: ws, users: owner, posts: post, pillars: pillar, keywords: keyword, imageSlots: slot, repoConnections: repo, _storage: storage,
			candidates: await ctx.db.insert("candidates", { siteId: site, postId: post, slotId: slot, label: "c", hue: 1, selected: false, createdAt: 0 }),
			mergeRequests: await ctx.db.insert("mergeRequests", { workspaceId: ws, siteId: site, postId: post, repoConnectionId: repo, host: "github", repo: "v/site", number: 1, branch: "content/p", base: "main", status: "open", ci: "passing", files: [], openedAt: 0, overrides: [] }),
			factMarkers: await ctx.db.insert("factMarkers", { siteId: site, postId: post, blockId: "b1", claim: "c", status: "open", note: "n" }),
			suggestions: await ctx.db.insert("suggestions", { siteId: site, postId: post, instruction: "i", before: "", after: "a", blockId: "b1", status: "pending", createdAt: 0 }),
			postVersions: await ctx.db.insert("postVersions", { siteId: site, postId: post, n: 1, origin: "agent-generation", actor: "a", at: 0, words: 1, blocks: [], seoTitle: "P" }),
			ledgerItems: await ctx.db.insert("ledgerItems", { siteId: site, title: "t", owner: "o", createdAt: 0, downstream: "d", origin: "human", done: false }),
			notifications: await ctx.db.insert("notifications", { workspaceId: ws, siteId: site, userId: owner, at: 0, tone: "human", title: "t", body: "b", read: false }),
			connections: await ctx.db.insert("connections", { workspaceId: ws, siteId: site, kind: "web-source", provider: "wikimedia", label: "W", usedFor: ["stock"], enabled: true, status: "ok", createdAt: 0 }),
			templateManifests: await ctx.db.insert("templateManifests", { siteId: site, version: 1, source: "s", kind: "html", output: "html", status: "needs-confirmation", mappings: [], bundleFiles: 0, bundleBytes: 0, uploadedBy: owner, uploadedAt: 0 }),
			authors: await ctx.db.insert("authors", { workspaceId: ws, name: "A", slug: "a", credentials: [], sameAs: [], status: "active", createdAt: 0, updatedAt: 0 }),
			rubrics: await ctx.db.insert("rubrics", { siteId: site, name: "R", slug: "r", pillarIds: [pillar], clusters: [], rotation: "rotate", signoff: "none", firstPerson: false, createdAt: 0 }),
		};
		return { site, table };
	});
	return { t, ...ids };
}

/** A value that satisfies the validator (ids from the victim's own rows, so only the access check can refuse). */
function synth(j: TJson, table: Record<string, string>): unknown {
	switch (j.type) {
		case "id":
			if (!(j.tableName! in table)) throw new Error(`no fixture id for table ${j.tableName}`);
			return table[j.tableName!];
		case "string":
			return "x";
		case "number":
			return 1;
		case "bigint":
			return 1n;
		case "boolean":
			return true;
		case "null":
			return null;
		case "any":
			return {};
		case "literal":
			return j.value;
		case "array":
			return [synth(j.value as TJson, table)];
		case "record":
			return {};
		case "union":
			return synth((j.value as TJson[])[0]!, table);
		case "object": {
			const out: Record<string, unknown> = {};
			for (const [k, f] of Object.entries(j.value as Record<string, { fieldType: TJson; optional: boolean }>)) if (!f.optional) out[k] = synth(f.fieldType, table);
			return out;
		}
		default:
			throw new Error(`unknown validator ${j.type}`);
	}
}

const refFor = (path: string, name: string) => {
	const parts = path.replace(/^\.\//, "").replace(/\.(ts|js)$/, "").split("/");
	let r: Record<string, unknown> = anyApi as never;
	for (const p of parts) r = r[p] as Record<string, unknown>;
	return r[name] as never;
};

describe("authz sweep", () => {
	test("no public site-scoped function works for another agency or without sign-in", async () => {
		const { t, site, table } = await world();
		const outsider = t.withIdentity({ subject: "outsider", issuer: ISSUER, tokenIdentifier: `${ISSUER}|outsider`, org_id: "org_outsider" });
		const loaded = await Promise.all(Object.entries(modules).filter(([p]) => !/\.test\.|_generated|convex\.config|\.d\.ts$/.test(p)).map(async ([p, load]) => [p, (await load()) as Record<string, unknown>] as const));
		const leaks: string[] = [];
		const skipped: string[] = [];
		let swept = 0;
		for (const [path, mod] of loaded) {
			for (const [name, fn] of Object.entries(mod)) {
				const f = fn as { isPublic?: boolean; isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isHttp?: boolean; exportArgs?: () => string; [ACCESS_KIND]?: string };
				if (!f?.isPublic || f.isHttp || (f as Record<string, unknown>)[ACCESS_KIND] !== "site") continue;
				let args: Record<string, unknown>;
				try {
					args = { ...(synth(JSON.parse(f.exportArgs!()), table) as Record<string, unknown>), siteId: site };
				} catch (e) {
					skipped.push(`${path}:${name} (${(e as Error).message})`);
					continue;
				}
				const ref = refFor(path, name);
				for (const [who, caller] of [["outsider", outsider], ["anonymous", t]] as const) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const c = caller as any;
					const call: Promise<unknown> = f.isQuery ? c.query(ref, args) : f.isMutation ? c.mutation(ref, args) : c.action(ref, args);
					const r = await call.then(
						() => "ok",
						(e: { data?: { code?: string } }) => e?.data?.code ?? "error",
					);
					if (r === "ok") leaks.push(`${path}:${name} as ${who}`);
					else if (!["NOT_FOUND", "UNAUTHENTICATED", "FORBIDDEN"].includes(r)) leaks.push(`${path}:${name} as ${who} → ${r} (expected an access refusal)`);
				}
				swept++;
			}
		}
		expect(leaks).toEqual([]);
		expect(skipped).toEqual([]);
		expect(swept).toBeGreaterThan(60);
	});
});
