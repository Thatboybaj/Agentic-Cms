// @vitest-environment edge-runtime
// Editor actions on Convex (api-map §4): detail, SEO title, overrides, fact sources, agent suggestions, comments, locks.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");
const ISSUER = "https://clerk.test";

async function world() {
	const t = convexTest(schema, modules);
	const ids = await t.run(async (ctx) => {
		const ws = await ctx.db.insert("workspaces", { clerkOrgId: "org_1", name: "W", slug: "w", plan: "pilot", seats: 5, createdAt: 0 });
		const user = (sub: string, name: string) => ctx.db.insert("users", { clerkUserId: sub, tokenIdentifier: `${ISSUER}|${sub}`, name, initials: name.slice(0, 2).toUpperCase(), email: `${sub}@x.co`, avatarHue: 1, status: "active" });
		const owner = await user("owner", "Amaka E.");
		const tolu = await user("tolu", "Tolu B.");
		const kemi = await user("kemi", "Kemi A.");
		await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: owner, role: "owner", status: "active", addedAt: 0 });
		for (const u of [tolu, kemi]) await ctx.db.insert("workspaceMembers", { workspaceId: ws, userId: u, role: "member", status: "active", addedAt: 0 });
		const site = await ctx.db.insert("sites", {
			workspaceId: ws, slug: "lumen", name: "Lumen Dental", domain: "lumen.co", industry: "Dental", icon: "tooth", status: "active", createdAt: 0, cadenceTarget: 3, searchConsole: "missing", rankSource: null,
			budgetCaps: { textCapUsd: 100, imageCapUsd: 50 }, spend: { month: "2026-11", textMicroUsd: 0, imageMicroUsd: 0 }, publishing: { autopost: false, autoMergeOnGreenCi: false },
			routing: { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" },
			modelRouting: { mechanical: "fast", writing: "workhorse", strategy: "strongest", pillarPages: "strongest" }, brandPack: { voice: "", palette: [], styleKeywords: [], disclaimers: {} }, liveBaseline: 0, timezone: "Africa/Lagos",
		});
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: tolu, role: "specialist", addedAt: 0, addedBy: owner });
		await ctx.db.insert("memberships", { workspaceId: ws, siteId: site, userId: kemi, role: "stakeholder", addedAt: 0, addedBy: owner });
		const pillarId = await ctx.db.insert("pillars", { workspaceId: ws, siteId: site, name: "Implants", plannedPosts: 1, livePosts: 0, kasShare: 0, claimedButUnearned: false });
		const keywordId = await ctx.db.insert("keywords", { workspaceId: ws, siteId: site, pillarId, term: "implant cost", termNormalized: "implant cost", intent: "commercial", difficulty: 1, difficultyEvidence: "", impressions: 0, position: null, positionTrend: [], kasShare: 0, kasDelta: 0, rankingUrl: null, rankingPages: 0, decaying: false });
		const blocks = [
			{ id: "b1", kind: "p" as const, text: "Implants replace a missing tooth. It is important to note that 95% of implants last ten years. Ask us anything." },
			{ id: "b2", kind: "p" as const, text: "Book a consult." },
		];
		const postId = await ctx.db.insert("posts", {
			workspaceId: ws, siteId: site, slug: "implant-cost", title: "implant cost", seoTitle: "Implant cost in Lagos", keywordId, pillarId, intent: "commercial", contentType: "guide", source: "manual",
			state: "in-review", stateChangedAt: 0, owner: "human", week: 40, strongModel: false, words: 22, wordTarget: 800, blocks, currentVersion: 1, ideaStatus: "approved", createdAt: 0, updatedAt: 0,
		});
		const versionId = await ctx.db.insert("postVersions", { siteId: site, postId, n: 1, origin: "agent-generation", actor: "Blog writer agent", at: 0, words: 22, blocks, seoTitle: "Implant cost in Lagos" });
		const factId = await ctx.db.insert("factMarkers", { siteId: site, postId, blockId: "b1", claim: "95% of implants last ten years", status: "open", note: "No source" });
		await ctx.db.insert("gateChecks", { siteId: site, postId, checkId: "kw-first-100", label: "Keyword in first 100 words", section: 2, status: "fail", value: "Missing", severity: "hard", evaluatedAt: 0, evaluatedForVersion: 1 });
		await ctx.db.insert("gateChecks", { siteId: site, postId, checkId: "title-length", label: "Title length", section: 1, status: "pass", value: "21 / 60", severity: "hard", evaluatedAt: 0, evaluatedForVersion: 1 });
		await ctx.db.insert("gateChecks", { siteId: site, postId, checkId: "internal-links", label: "Internal links", section: 6, status: "warn", value: "1 · soft", severity: "soft", evaluatedAt: 0, evaluatedForVersion: 1 });
		await ctx.db.insert("gateChecks", { siteId: site, postId, checkId: "schema", label: "Article schema", section: 3, status: "fail", value: "Missing", severity: "hard", evaluatedAt: 0, evaluatedForVersion: 1 });
		return { site, postId, versionId, factId };
	});
	const as = (sub: string) => t.withIdentity({ subject: sub, issuer: ISSUER, tokenIdentifier: `${ISSUER}|${sub}`, org_id: "org_1" });
	const audit = () => t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).map((a) => `${a.actor} · ${a.action}`));
	return { t, as, audit, ...ids };
}

describe("direct edits", () => {
	test("SEO title updates its checks; overrides refuse hard blocks and short reasons; a source resolves a marker", async () => {
		const { t, as, audit, site, postId, factId } = await world();
		expect(await as("tolu").mutation(api.postEdits.editSeoTitle, { siteId: site, postId, seoTitle: " " })).toEqual({ ok: false, reason: "The SEO title can't be empty" });
		await as("tolu").mutation(api.postEdits.editSeoTitle, { siteId: site, postId, seoTitle: "A".repeat(70) });
		const title = await t.run(async (ctx) => (await ctx.db.query("gateChecks").collect()).find((c) => c.checkId === "title-length")!);
		expect(title).toMatchObject({ status: "fail", value: "70 / 60" });
		expect(await as("tolu").mutation(api.postEdits.overrideCheck, { siteId: site, postId, checkId: "schema", reason: "long enough reason" })).toEqual({ ok: false, reason: "Hard blocks can't be overridden. Fix them to approve" });
		expect(await as("tolu").mutation(api.postEdits.overrideCheck, { siteId: site, postId, checkId: "internal-links", reason: "short" })).toEqual({ ok: false, reason: "Add a reason. It's logged to the audit trail and listed in the MR" });
		expect(await as("tolu").mutation(api.postEdits.overrideCheck, { siteId: site, postId, checkId: "internal-links", reason: "Links come in the refresh" })).toEqual({ ok: true });
		expect(await as("tolu").mutation(api.postEdits.addFactSource, { siteId: site, postId, markerId: factId, url: "not a url" })).toEqual({ ok: false, reason: "Paste a full source URL (https://…)" });
		expect(await as("tolu").mutation(api.postEdits.addFactSource, { siteId: site, postId, markerId: factId, url: "https://example.org/study" })).toEqual({ ok: true });
		expect((await t.run((ctx) => ctx.db.get(factId)))!).toMatchObject({ status: "resolved", resolution: "sourced", source: "https://example.org/study" });
		expect(await audit()).toEqual(["Tolu B. · edited SEO title", "Tolu B. · overrode soft block", "Tolu B. · added source"]);
	});

	test("a stakeholder can comment (notifying the specialist) but not edit", async () => {
		const { t, as, site, postId } = await world();
		await expect(as("kemi").mutation(api.postEdits.editSeoTitle, { siteId: site, postId, seoTitle: "x" })).rejects.toMatchObject({ data: { code: "FORBIDDEN", reason: "Stakeholders can view and comment only" } });
		expect(await as("kemi").mutation(api.postEdits.addComment, { siteId: site, postId, text: "Love it" })).toEqual({ ok: true });
		const out = await t.run(async (ctx) => ({ comments: (await ctx.db.query("comments").collect()).map((c) => [c.by, c.role, c.text]), notes: (await ctx.db.query("notifications").collect()).length }));
		expect(out.comments).toEqual([["Kemi A.", "stakeholder", "Love it"]]);
		expect(out.notes).toBeGreaterThan(0);
	});

	test("restoring a version makes a new human-edit version", async () => {
		const { t, as, site, postId, versionId } = await world();
		await as("tolu").mutation(api.editor.editBlock, { siteId: site, postId, blockId: "b2", text: "Call us today.", baseVersion: 1 });
		expect(await as("tolu").mutation(api.postEdits.restoreVersion, { siteId: site, postId, versionId })).toEqual({ ok: true });
		const post = (await t.run((ctx) => ctx.db.get(postId)))!;
		expect(post.blocks[1]!.text).toBe("Book a consult.");
		const versions = await t.run((ctx) => ctx.db.query("postVersions").collect());
		expect(versions.at(-1)).toMatchObject({ origin: "human-edit", note: "Restored v1" });
	});
});

describe("agent suggestions", () => {
	test("instruct → pending diff → accept: new agent-edit version; tighten removes filler", async () => {
		const { t, as, audit, site, postId } = await world();
		expect(await as("tolu").mutation(api.postEdits.instructAgent, { siteId: site, postId, instruction: "tighten this", blockId: "b1" })).toEqual({ ok: true });
		const detail = await as("tolu").query(api.postEdits.detail, { siteId: site, postId });
		const s = detail.suggestions[0]!;
		expect(s).toMatchObject({ status: "pending", blockId: "b1" });
		expect(s.after).not.toContain("It is important to note that");
		expect(await as("tolu").mutation(api.postEdits.instructAgent, { siteId: site, postId, instruction: "tighten this", blockId: "b1" })).toEqual({ ok: false, reason: "The agent already has a pending edit for that" });
		expect(await as("tolu").mutation(api.postEdits.acceptSuggestion, { siteId: site, postId, suggestionId: s._id })).toEqual({ ok: true });
		expect(await as("tolu").mutation(api.postEdits.acceptSuggestion, { siteId: site, postId, suggestionId: s._id })).toEqual({ ok: false, reason: "This suggestion is no longer pending" });
		const post = (await t.run((ctx) => ctx.db.get(postId)))!;
		expect(post.currentVersion).toBe(2);
		expect(post.blocks[0]!.text).not.toContain("It is important to note that");
		const versions = await t.run((ctx) => ctx.db.query("postVersions").collect());
		expect(versions.at(-1)).toMatchObject({ origin: "agent-edit", actor: "Blog writer agent", note: '"tighten this" · accepted by Tolu B.' });
		expect(await audit()).toEqual(["Tolu B. · instructed agent", "Tolu B. · accepted agent edit"]);
		const runs = await t.run((ctx) => ctx.db.query("runs").collect());
		expect(runs.map((r) => [r.status, r.costUsd])).toEqual([["succeeded", 0]]);
	});

	test("fix a check: keyword-in-intro fixes the check on accept; schema fixes directly; a rewrite resolves the claim; reject leaves content", async () => {
		const { t, as, site, postId, factId } = await world();
		await as("tolu").mutation(api.postEdits.fixCheck, { siteId: site, postId, checkId: "kw-first-100" });
		await as("tolu").mutation(api.postEdits.fixCheck, { siteId: site, postId, checkId: "schema" });
		await as("tolu").mutation(api.postEdits.rewriteFactWithout, { siteId: site, postId, markerId: factId });
		const { suggestions } = await as("tolu").query(api.postEdits.detail, { siteId: site, postId });
		const kw = suggestions.find((s) => s.fixesCheckId === "kw-first-100")!;
		const fact = suggestions.find((s) => s.resolvesFactId === factId)!;
		await as("tolu").mutation(api.postEdits.acceptSuggestion, { siteId: site, postId, suggestionId: kw._id });
		await as("tolu").mutation(api.postEdits.rejectSuggestion, { siteId: site, postId, suggestionId: fact._id });
		const out = await t.run(async (ctx) => ({
			checks: Object.fromEntries((await ctx.db.query("gateChecks").collect()).map((c) => [c.checkId, c.status])),
			fact: (await ctx.db.get(factId))!.status,
			intro: (await ctx.db.get(postId))!.blocks[0]!.text,
		}));
		expect(out.checks).toMatchObject({ "kw-first-100": "pass", schema: "pass" });
		expect(out.fact).toBe("open"); // rejected rewrite: claim stays, marker stays open
		expect(out.intro.startsWith("If you're searching for implant cost")).toBe(true);
	});
});

describe("edit locks", () => {
	test("one editor at a time; take-over is audited and tells the previous holder; stop releases", async () => {
		const { t, as, audit, site, postId } = await world();
		expect(await as("tolu").mutation(api.postEdits.startEditing, { siteId: site, postId, sessionId: "s1" })).toEqual({ ok: true });
		expect(await as("owner").mutation(api.postEdits.startEditing, { siteId: site, postId, sessionId: "s2" })).toEqual({ ok: false, reason: "Tolu B. is editing", heldBy: "Tolu B." });
		expect(await as("owner").mutation(api.editor.editBlock, { siteId: site, postId, blockId: "b2", text: "x", baseVersion: 1 })).toEqual({ ok: false, reason: "Tolu B. is editing" });
		expect(await as("owner").mutation(api.postEdits.startEditing, { siteId: site, postId, sessionId: "s2", takeOver: true })).toEqual({ ok: true });
		expect(await audit()).toEqual(["Amaka E. · took over editing"]);
		const detail = await as("tolu").query(api.postEdits.detail, { siteId: site, postId });
		expect(detail.lock).toMatchObject({ name: "Amaka E.", fresh: true });
		await as("owner").mutation(api.postEdits.stopEditing, { siteId: site, postId });
		expect(await t.run((ctx) => ctx.db.query("editLocks").collect())).toEqual([]);
	});
});

export type { Id };
