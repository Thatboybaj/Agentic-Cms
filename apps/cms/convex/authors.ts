// Rubrics and authors (prd-rubrics-and-authors): author profiles per workspace, enabled per site with one default;
// rubrics that group a site's pillars and clusters, with designated authors and reviewers; and resolution of a post's
// author when its idea is approved. Access through the site wrappers (author.manage, rubric.manage, post.author.override).
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit } from "./lib/audit";
import { clusterKey, type IAuthorProfile, resolveAuthor, slugify } from "./lib/authorsCore";
import { siteMutation, siteQuery } from "./lib/functions";

type TResult = { ok: true; [k: string]: unknown } | { ok: false; reason: string };
const fail = (reason: string) => ({ ok: false as const, reason });
const clean = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max) || undefined;
const cleanList = (xs: string[], max: number, each = 200) => [...new Set(xs.map((x) => x.trim().slice(0, each)).filter(Boolean))].slice(0, max);

async function siteAuthorRows(ctx: QueryCtx, siteId: Id<"sites">) {
	return ctx.db.query("siteAuthors").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(200);
}

async function photoUrls(ctx: QueryCtx, a: Doc<"authors">) {
	const p = a.photo;
	if (!p) return null;
	const url = async (id?: Id<"_storage">) => (id ? await ctx.storage.getUrl(id) : null);
	return { alt: p.alt, original: await url(p.original), s96: await url(p.s96), s192: await url(p.s192), s400: await url(p.s400) };
}

/** Everything the Rubrics & authors screen and the author chips read for one site. */
export const overview = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const site = ctx.access.site;
		const links = await siteAuthorRows(ctx, siteId);
		const enabled = [];
		for (const l of links) {
			const a = await ctx.db.get(l.authorId);
			if (!a || a.workspaceId !== site.workspaceId) continue;
			enabled.push({ id: a._id, siteAuthorId: l._id, name: a.name, slug: a.slug, jobTitle: l.titleOverride ?? a.jobTitle ?? null, bioShort: l.bioOverride ?? a.bioShort ?? null, credentials: a.credentials, sameAs: a.sameAs, authorPageUrl: l.authorPageUrl ?? null, isDefault: l.isDefault, status: a.status, photo: await photoUrls(ctx, a), titleOverride: l.titleOverride ?? null, bioOverride: l.bioOverride ?? null, baseTitle: a.jobTitle ?? null, baseBio: a.bioShort ?? null });
		}
		const workspaceAuthors = (await ctx.db.query("authors").withIndex("by_workspace_slug", (q) => q.eq("workspaceId", site.workspaceId)).take(300)).filter((a) => !links.some((l) => l.authorId === a._id) && a.status === "active").map((a) => ({ id: a._id, name: a.name }));
		const rubrics = await ctx.db.query("rubrics").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const designations = await ctx.db.query("rubricDesignations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(500);
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const keywords = await ctx.db.query("keywords").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(3000);
		const posts = await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(3000);
		const covered = new Set(rubrics.flatMap((r) => r.clusters.map((c) => c.toLowerCase())));
		const pillarCovered = new Set(rubrics.flatMap((r) => r.pillarIds));
		const map = pillars.map((p) => {
			const kws = keywords.filter((k) => k.pillarId === p._id && k.status !== "retired");
			const clusters = [...new Set(kws.map((k) => k.cluster).filter((c): c is string => !!c))].map((c) => {
				const key = clusterKey(p._id, c);
				return { name: c, key, keywords: kws.filter((k) => k.cluster === c).length, rubricId: rubrics.find((r) => r.clusters.map((x) => x.toLowerCase()).includes(key))?._id ?? null, covered: covered.has(key) || pillarCovered.has(p._id) };
			});
			return { id: p._id, name: p.name, keywords: kws.length, livePosts: posts.filter((x) => x.pillarId === p._id && x.state === "live").length, rubricId: rubrics.find((r) => r.pillarIds.includes(p._id))?._id ?? null, clusters };
		});
		return {
			authors: enabled,
			workspaceAuthors,
			defaultAuthorId: links.find((l) => l.isDefault)?.authorId ?? null,
			rubrics: rubrics.map((r) => ({ id: r._id, name: r.name, slug: r.slug, pillarIds: r.pillarIds, clusters: r.clusters, rotation: r.rotation, signoff: r.signoff, firstPerson: r.firstPerson, designations: designations.filter((d) => d.rubricId === r._id).map((d) => ({ authorId: d.authorId, role: d.role, primary: d.primary })), posts: posts.filter((x) => x.rubricId === r._id).length })),
			pillars: map,
			uncovered: map.flatMap((p) => (p.rubricId ? [] : p.clusters.filter((c) => !c.covered).map((c) => ({ pillar: p.name, cluster: c.name })))),
		};
	},
});

const vProfile = {
	name: v.string(),
	jobTitle: v.optional(v.string()),
	bioShort: v.optional(v.string()),
	bioLong: v.optional(v.string()),
	credentials: v.array(v.string()),
	sameAs: v.array(v.string()),
	authorPageUrl: v.optional(v.string()),
	titleOverride: v.optional(v.string()),
	bioOverride: v.optional(v.string()),
};

const urlOk = (u: string) => /^https:\/\/[^\s]+$/i.test(u);

/** Create or edit an author and enable them on this site (A1, A2). The first author on a site becomes its default. */
export const saveAuthor = siteMutation({
	permission: "author.manage",
	args: { authorId: v.optional(v.id("authors")), ...vProfile, makeDefault: v.optional(v.boolean()) },
	handler: async (ctx, { siteId, authorId, makeDefault, ...p }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const name = clean(p.name, 120);
		if (!name) return fail("Add the author's name");
		const sameAs = cleanList(p.sameAs, 8);
		if (sameAs.some((u) => !urlOk(u))) return fail("Profile links must be full https:// URLs");
		const pageUrl = clean(p.authorPageUrl, 500);
		if (pageUrl && !urlOk(pageUrl)) return fail("The author page must be a full https:// URL");
		const bio = clean(p.bioShort, 300);
		const now = Date.now();
		const fields = { name, ...(clean(p.jobTitle, 120) ? { jobTitle: clean(p.jobTitle, 120) } : { jobTitle: undefined }), bioShort: bio, bioLong: clean(p.bioLong, 3000), credentials: cleanList(p.credentials, 10, 120), sameAs, updatedAt: now };
		let id = authorId;
		if (id) {
			const a = await ctx.db.get(id);
			if (!a || a.workspaceId !== site.workspaceId) return fail("Author not found");
			await ctx.db.patch(id, fields);
		} else {
			let slug = slugify(name) || "author";
			for (let i = 2; await ctx.db.query("authors").withIndex("by_workspace_slug", (q) => q.eq("workspaceId", site.workspaceId).eq("slug", slug)).first(); i++) slug = `${slugify(name)}-${i}`;
			id = await ctx.db.insert("authors", { workspaceId: site.workspaceId, slug, ...fields, status: "active", createdAt: now });
		}
		const links = await siteAuthorRows(ctx, siteId);
		const link = links.find((l) => l.authorId === id);
		const isDefault = makeDefault || !links.some((l) => l.isDefault) || !!link?.isDefault;
		if (isDefault) for (const l of links) if (l.isDefault && l.authorId !== id) await ctx.db.patch(l._id, { isDefault: false });
		const siteFields = { titleOverride: clean(p.titleOverride, 120), bioOverride: clean(p.bioOverride, 300), authorPageUrl: pageUrl, isDefault };
		if (link) await ctx.db.patch(link._id, siteFields);
		else await ctx.db.insert("siteAuthors", { siteId, authorId: id, ...siteFields });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: authorId ? "edited author" : "added author", target: name, ...(isDefault ? { detail: "Site default author" } : {}) });
		return { ok: true, authorId: id };
	},
});

export const enableAuthor = siteMutation({
	permission: "author.manage",
	args: { authorId: v.id("authors") },
	handler: async (ctx, { siteId, authorId }): Promise<TResult> => {
		const a = await ctx.db.get(authorId);
		if (!a || a.workspaceId !== ctx.access.site.workspaceId) return fail("Author not found");
		const links = await siteAuthorRows(ctx, siteId);
		if (!links.some((l) => l.authorId === authorId)) await ctx.db.insert("siteAuthors", { siteId, authorId, isDefault: !links.some((l) => l.isDefault) });
		return { ok: true };
	},
});

export const setDefaultAuthor = siteMutation({
	permission: "author.manage",
	args: { authorId: v.id("authors") },
	handler: async (ctx, { siteId, authorId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const links = await siteAuthorRows(ctx, siteId);
		const link = links.find((l) => l.authorId === authorId);
		if (!link) return fail("Enable the author on this site first");
		for (const l of links) if (l.isDefault !== (l._id === link._id)) await ctx.db.patch(l._id, { isDefault: l._id === link._id });
		const a = await ctx.db.get(authorId);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "set default author", target: a?.name ?? "" });
		return { ok: true };
	},
});

/** A5: retire instead of delete; past credit stays, no new assignments. The default can't be retired. */
export const retireAuthor = siteMutation({
	permission: "author.manage",
	args: { authorId: v.id("authors") },
	handler: async (ctx, { siteId, authorId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const a = await ctx.db.get(authorId);
		if (!a || a.workspaceId !== site.workspaceId) return fail("Author not found");
		const link = (await siteAuthorRows(ctx, siteId)).find((l) => l.authorId === authorId);
		if (link?.isDefault) return fail("Choose another default author first");
		await ctx.db.patch(authorId, { status: "retired", updatedAt: Date.now() });
		for (const d of await ctx.db.query("rubricDesignations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(500)) if (d.authorId === authorId) await ctx.db.delete(d._id);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "retired author", target: a.name });
		return { ok: true };
	},
});

export const photoUploadUrl = siteMutation({
	permission: "author.manage",
	args: {},
	handler: async (ctx) => ({ ok: true as const, url: await ctx.storage.generateUploadUrl() }),
});

/** A1, A3: the uploaded square photo and its 96/192/400 WebP sizes (resized in the browser, never generated). */
export const setPhoto = siteMutation({
	permission: "author.manage",
	args: { authorId: v.id("authors"), original: v.id("_storage"), s96: v.id("_storage"), s192: v.id("_storage"), s400: v.id("_storage") },
	handler: async (ctx, { siteId, authorId, ...ids }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const a = await ctx.db.get(authorId);
		if (!a || a.workspaceId !== site.workspaceId) return fail("Author not found");
		for (const id of Object.values(ids)) {
			const meta = await ctx.db.system.get(id);
			if (!meta) return fail("Upload didn't finish · try again");
			if (meta.size > 5 * 1024 * 1024) return fail("Photos can be up to 5 MB");
			if (!/^image\/(jpeg|png|webp)$/.test(meta.contentType ?? "")) return fail("Use a JPG, PNG or WebP photo");
		}
		const old = a.photo;
		await ctx.db.patch(authorId, { photo: { ...ids, alt: `Photo of ${a.name}` }, updatedAt: Date.now() });
		for (const k of ["original", "s96", "s192", "s400"] as const) if (old?.[k] && old[k] !== ids[k]) await ctx.storage.delete(old[k]!);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "updated author photo", target: a.name });
		return { ok: true };
	},
});

// ─── Rubrics ─────────────────────────────────────────────────────────────────

const vRubric = { name: v.string(), pillarIds: v.array(v.id("pillars")), clusters: v.array(v.string()), rotation: v.union(v.literal("rotate"), v.literal("primary-only")), signoff: v.union(v.literal("none"), v.literal("author"), v.literal("reviewer")), firstPerson: v.boolean() };

export const saveRubric = siteMutation({
	permission: "rubric.manage",
	args: { rubricId: v.optional(v.id("rubrics")), ...vRubric },
	handler: async (ctx, { siteId, rubricId, ...r }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const name = clean(r.name, 80);
		if (!name) return fail("Name the rubric");
		if (!r.pillarIds.length && !r.clusters.length) return fail("Pick at least one pillar or cluster");
		const others = (await ctx.db.query("rubrics").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100)).filter((x) => x._id !== rubricId);
		const clusters = cleanList(r.clusters.map((c) => c.toLowerCase()), 100);
		const clash = clusters.find((c) => others.some((o) => o.clusters.map((x) => x.toLowerCase()).includes(c)));
		if (clash) return fail(`The cluster "${clash.split("|")[1]}" already belongs to another rubric`);
		const pillarClash = r.pillarIds.find((p) => others.some((o) => o.pillarIds.includes(p)));
		if (pillarClash) return fail("That pillar already belongs to another rubric");
		for (const p of r.pillarIds) if ((await ctx.db.get(p))?.siteId !== siteId) return fail("Pillar not found");
		const fields = { name, slug: slugify(name), pillarIds: r.pillarIds, clusters, rotation: r.rotation, signoff: r.signoff, firstPerson: r.firstPerson };
		let id = rubricId;
		if (id) {
			const x = await ctx.db.get(id);
			if (!x || x.siteId !== siteId) return fail("Rubric not found");
			await ctx.db.patch(id, fields);
		} else id = await ctx.db.insert("rubrics", { siteId, ...fields, createdAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: rubricId ? "edited rubric" : "created rubric", target: name });
		return { ok: true, rubricId: id };
	},
});

export const deleteRubric = siteMutation({
	permission: "rubric.manage",
	args: { rubricId: v.id("rubrics") },
	handler: async (ctx, { siteId, rubricId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const r = await ctx.db.get(rubricId);
		if (!r || r.siteId !== siteId) return fail("Rubric not found");
		for (const d of await ctx.db.query("rubricDesignations").withIndex("by_rubric", (q) => q.eq("rubricId", rubricId)).take(100)) await ctx.db.delete(d._id);
		await ctx.db.delete(rubricId);
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "deleted rubric", target: r.name, detail: "Posts keep the author they were credited with" });
		return { ok: true };
	},
});

/** R2: one rubric per pillar not yet covered (designations empty, so they resolve to the default author). */
export const suggestRubrics = siteMutation({
	permission: "rubric.manage",
	args: {},
	handler: async (ctx, { siteId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const rubrics = await ctx.db.query("rubrics").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		const pillars = await ctx.db.query("pillars").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
		let n = 0;
		for (const p of pillars) {
			if (rubrics.some((r) => r.pillarIds.includes(p._id))) continue;
			await ctx.db.insert("rubrics", { siteId, name: p.name, slug: slugify(p.name), pillarIds: [p._id], clusters: [], rotation: "rotate", signoff: "none", firstPerson: false, createdAt: Date.now() });
			n++;
		}
		if (n) await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "suggested rubrics", target: `${n} rubric${n === 1 ? "" : "s"}`, detail: "One per pillar" });
		return { ok: true, created: n };
	},
});

export const setDesignations = siteMutation({
	permission: "rubric.manage",
	args: { rubricId: v.id("rubrics"), designations: v.array(v.object({ authorId: v.id("authors"), role: v.union(v.literal("author"), v.literal("reviewer")), primary: v.boolean() })) },
	handler: async (ctx, { siteId, rubricId, designations }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const r = await ctx.db.get(rubricId);
		if (!r || r.siteId !== siteId) return fail("Rubric not found");
		const enabled = new Set((await siteAuthorRows(ctx, siteId)).map((l) => l.authorId));
		if (designations.some((d) => !enabled.has(d.authorId))) return fail("Enable the author on this site first");
		const authors = designations.filter((d) => d.role === "author");
		if (authors.filter((d) => d.primary).length > 1) return fail("Only one primary author per rubric");
		for (const d of await ctx.db.query("rubricDesignations").withIndex("by_rubric", (q) => q.eq("rubricId", rubricId)).take(100)) await ctx.db.delete(d._id);
		const seen = new Set<string>();
		for (const d of designations) {
			const k = `${d.authorId}|${d.role}`;
			if (seen.has(k)) continue;
			seen.add(k);
			await ctx.db.insert("rubricDesignations", { siteId, rubricId, authorId: d.authorId, role: d.role, primary: d.primary || (d.role === "author" && authors.length === 1) });
		}
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "set rubric authors", target: r.name, detail: designations.length ? `${authors.length} author(s), ${designations.length - authors.length} reviewer(s)` : "Falls back to the default author" });
		return { ok: true };
	},
});

// ─── Resolution (P1) ─────────────────────────────────────────────────────────

/** Resolve and store a post's author, reviewer and rubric (§4). Called on idea approval and by the override. */
export async function resolvePostAuthor(ctx: MutationCtx, post: Doc<"posts">, overrideAuthorId?: Id<"authors">): Promise<{ authorId: Id<"authors"> | null; source: string }> {
	const siteId = post.siteId;
	const links = await ctx.db.query("siteAuthors").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(200);
	const active = new Set<string>();
	for (const l of links) if ((await ctx.db.get(l.authorId))?.status === "active") active.add(l.authorId);
	const rubrics = await ctx.db.query("rubrics").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(100);
	const designations = (await ctx.db.query("rubricDesignations").withIndex("by_site", (q) => q.eq("siteId", siteId)).take(500)).filter((d) => active.has(d.authorId));
	const kw = await ctx.db.get(post.keywordId);
	const credited = rubrics.length ? (await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(3000)).filter((p) => p.rubricId && p.authorId && p._id !== post._id) : [];
	const r = resolveAuthor({
		...(overrideAuthorId ? { overrideAuthorId } : {}),
		keyword: kw ? { pillarId: kw.pillarId, ...(kw.cluster ? { cluster: kw.cluster } : {}) } : { pillarId: post.pillarId },
		rubrics: rubrics.map((x) => ({ id: x._id, pillarIds: x.pillarIds, clusters: x.clusters, rotation: x.rotation })),
		designations: designations.map((d) => ({ rubricId: d.rubricId, authorId: d.authorId, role: d.role, primary: d.primary })),
		defaultAuthorId: links.find((l) => l.isDefault && active.has(l.authorId))?.authorId ?? null,
		postsByAuthorInRubric: (rid) => credited.filter((p) => p.rubricId === rid).reduce<Record<string, number>>((m, p) => ({ ...m, [p.authorId!]: (m[p.authorId!] ?? 0) + 1 }), {}),
	});
	await ctx.db.patch(post._id, { authorId: (r.authorId as Id<"authors">) ?? undefined, reviewerId: (r.reviewerId as Id<"authors">) ?? undefined, rubricId: (r.rubricId as Id<"rubrics">) ?? undefined, authorSource: r.authorId ? r.source : undefined });
	return { authorId: r.authorId as Id<"authors"> | null, source: r.source };
}

/** Manual override (or back to the rubric's choice with authorId null). */
export const setPostAuthor = siteMutation({
	permission: "post.author.override",
	args: { postId: v.id("posts"), authorId: v.union(v.id("authors"), v.null()) },
	handler: async (ctx, { siteId, postId, authorId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const post = await ctx.db.get(postId);
		if (!post || post.siteId !== siteId) return fail("Post not found");
		if (authorId && !(await siteAuthorRows(ctx, siteId)).some((l) => l.authorId === authorId)) return fail("Enable the author on this site first");
		const r = await resolvePostAuthor(ctx, post, authorId ?? undefined);
		const a = r.authorId ? await ctx.db.get(r.authorId) : null;
		await audit(ctx, { workspaceId: site.workspaceId, siteId, postId, actor: user, action: authorId ? "set post author" : "reset post author", target: post.title, detail: a ? `${a.name} (${r.source})` : "No default author on this site" });
		return { ok: true };
	},
});

/** The renderer's view of a post's author (D1–D4): profile with this site's overrides. */
export async function authorProfileFor(ctx: QueryCtx, post: Doc<"posts">): Promise<(IAuthorProfile & { photo?: { s96?: Id<"_storage">; s192?: Id<"_storage">; s400?: Id<"_storage">; alt: string }; slug: string; source: string }) | null> {
	if (!post.authorId) return null;
	const a = await ctx.db.get(post.authorId);
	if (!a) return null;
	const link = (await ctx.db.query("siteAuthors").withIndex("by_site_author", (q) => q.eq("siteId", post.siteId).eq("authorId", a._id)).first()) ?? null;
	const jobTitle = link?.titleOverride ?? a.jobTitle;
	const bio = link?.bioOverride ?? a.bioShort;
	return {
		name: a.name,
		slug: a.slug,
		source: post.authorSource ?? "default",
		...(link?.authorPageUrl ? { url: link.authorPageUrl } : {}),
		...(jobTitle ? { jobTitle } : {}),
		...(bio ? { bio } : {}),
		...(a.sameAs.length ? { sameAs: a.sameAs } : {}),
		...(a.credentials.length ? { credentials: a.credentials } : {}),
		...(a.photo ? { photo: { ...(a.photo.s96 ? { s96: a.photo.s96 } : {}), ...(a.photo.s192 ? { s192: a.photo.s192 } : {}), ...(a.photo.s400 ? { s400: a.photo.s400 } : {}), alt: a.photo.alt } } : {}),
	};
}

/** Ops: give every approved post on a site without an author its resolved author (after setup; RA3 stays manual). */
export const backfillPostAuthors = internalMutation({
	args: { siteId: v.id("sites") },
	handler: async (ctx, { siteId }) => {
		let n = 0;
		for (const p of await ctx.db.query("posts").withIndex("by_site_week", (q) => q.eq("siteId", siteId)).take(3000)) {
			if (p.authorId || p.state === "idea") continue;
			await resolvePostAuthor(ctx, p);
			n++;
		}
		return n;
	},
});
