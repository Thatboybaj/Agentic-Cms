// Language versions (every site, off unless turned on in Settings → Publishing): the site setting, and the data side
// of the translation agent (agents/translate.ts) — its inputs, its run row and the saved version on the post. The ship
// flow (workflows/shipPost.ts) asks for the versions before it renders, so a new post, an "Update live post" and a
// refresh all carry their language pages; an unchanged post is never translated twice (sourceHash).
import { v } from "convex/values";
import { checkCap, estimateRun } from "../src/lib/logic";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { capSite } from "./lib/budget";
import { siteMutation, siteQuery } from "./lib/functions";

type TResult = { ok: true } | { ok: false; reason: string };
import { notify, siteAudience } from "./lib/notify";
import { scopeError, normDir } from "./lib/pathScope";
import { createRun, finishRun } from "./lib/runs";
import { vLanguageVersion, vPostTranslation } from "./schema";
import { activeRepo } from "./lib/gateInputs";

const fail = (reason: string): TResult => ({ ok: false, reason });

export const settings = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const site = ctx.access.site;
		const repo = await activeRepo(ctx, siteId);
		return { languages: site.languages ?? [], contentDir: repo?.contentDir ?? null, keys: { fanar: !!process.env.FANAR_API_KEY?.trim(), gateway: !!process.env.AI_GATEWAY_API_KEY?.trim() } };
	},
});

/** Turn a language version on or off and set where it lives. One row per language. */
export const setLanguage = siteMutation({
	permission: "publishing.set",
	args: { language: vLanguageVersion },
	handler: async (ctx, { siteId, language }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const lang = language.lang.trim().toLowerCase();
		if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang)) return fail("Use a language code like ar");
		const templatePath = normDir(language.templatePath);
		const contentDir = normDir(language.contentDir);
		const linkPrefix = `/${normDir(language.linkPrefix)}`;
		if (language.enabled) {
			if (!/\.html?$/i.test(templatePath)) return fail("Point at the language's article template, an .html file in the repo");
			const bad = scopeError(contentDir);
			if (bad) return fail(bad);
			const repo = await activeRepo(ctx, siteId);
			if (repo && normDir(repo.contentDir) === contentDir) return fail("Use a folder of its own for this language, not the main blog folder");
			if (linkPrefix === "/") return fail("Give the language's URL prefix, like /ar");
		}
		const next = { lang, enabled: language.enabled, agent: language.agent, templatePath, contentDir, linkPrefix, ...(language.styleGuide?.trim() ? { styleGuide: language.styleGuide.trim().slice(0, 8000) } : {}) };
		const rest = (site.languages ?? []).filter((l) => l.lang !== lang);
		await ctx.db.patch(siteId, { languages: [...rest, next] });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: language.enabled ? `turned the ${lang} version on` : `turned the ${lang} version off`, target: site.name, detail: language.enabled ? `${language.agent === "fanar" ? "Fanar" : "Qwen via AI Gateway"} · ${contentDir}/ · template ${templatePath}` : "Posts ship in the main language only" });
		return { ok: true };
	},
});

/** What the translation agent needs for one post. */
export const input = internalQuery({
	args: { siteId: v.id("sites"), postId: v.id("posts") },
	handler: async (ctx, { siteId, postId }) => {
		const site = await ctx.db.get(siteId);
		const post = await ctx.db.get(postId);
		if (!site || !post || post.siteId !== siteId) return null;
		const languages = (site.languages ?? []).filter((l) => l.enabled);
		if (!languages.length) return null;
		const pillar = await ctx.db.get(post.pillarId);
		const slots = (await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", postId)).take(50)).filter((s) => s.status === "selected");
		return {
			site: { name: site.name, domain: site.domain },
			languages,
			post: { title: post.title, seoTitle: post.seoTitle, ...(post.metaDescription ? { metaDescription: post.metaDescription } : {}), ...(pillar && pillar.siteId === siteId ? { pillarName: pillar.name } : {}), blocks: post.blocks.map((b) => ({ id: b.id, kind: b.kind, text: b.text })), alts: slots.map((s) => ({ slotId: s._id as string, alt: s.alt })) },
			have: (post.translations ?? []).map((t) => ({ lang: t.lang, sourceHash: t.sourceHash })),
		};
	},
});

/** Opens the run row (one per post, language and content). Refused over the text cap like any other run. */
export const startRun = internalMutation({
	args: { siteId: v.id("sites"), postId: v.id("posts"), lang: v.string(), hash: v.string(), agent: v.string() },
	handler: async (ctx, { siteId, postId, lang, hash, agent }) => {
		const site = await ctx.db.get(siteId);
		if (!site) return { ok: false as const, reason: "Site not found" };
		const estimate = estimateRun("translation", capSite(site));
		const cap = checkCap(capSite(site), "translation", estimate);
		if (cap.status === "refused") return { ok: false as const, reason: cap.message };
		const runId = await createRun(ctx, { site, kind: "translation", trigger: "workflow", estimate, postId, idempotencyKey: `run:${postId}:translation:${lang}:${hash}`, output: `Writing the ${lang} version · ${agent === "fanar" ? "Fanar" : "Qwen via AI Gateway"}` });
		const run = await ctx.db.get(runId);
		return { ok: true as const, runId, done: run?.status === "succeeded" };
	},
});

export const save = internalMutation({
	args: { postId: v.id("posts"), translation: vPostTranslation },
	handler: async (ctx, { postId, translation }) => {
		const post = await ctx.db.get(postId);
		if (!post) return;
		const rest = (post.translations ?? []).filter((t) => t.lang !== translation.lang);
		await ctx.db.patch(postId, { translations: [...rest, translation] });
	},
});

export const finish = internalMutation({
	args: { runId: v.id("runs"), ok: v.boolean(), output: v.string(), error: v.optional(v.string()) },
	handler: async (ctx, { runId, ok, output, error }) => {
		await finishRun(ctx, runId, { status: ok ? "succeeded" : "failed", output, ...(error ? { error } : {}) });
		if (ok) return;
		const run = await ctx.db.get(runId);
		const site = run ? await ctx.db.get(run.siteId) : null;
		const post = run?.postId ? await ctx.db.get(run.postId) : null;
		if (!site || !post) return;
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, postId: post._id, actor: { system: "Translation agent" }, action: "language version not shipped", target: post.title, detail: (error ?? output).slice(0, 300) });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: await siteAudience(ctx, site), tone: "block", title: "A language version didn't ship", body: `${post.title}: ${(error ?? output).slice(0, 160)}. The main post ships as usual; the next update tries again.`, href: "/runs", dedupeKey: `translation:${post._id}` });
	},
});
