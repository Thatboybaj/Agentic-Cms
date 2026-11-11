// Templates (handoff 05; api-map §6): upload once (.html or .zip) → server parse (templatesNode.parse, authoritative)
// → a developer maps what the parser couldn't classify → confirm (supersedes the previous confirmed version and
// re-opens the gate for posts held on "no confirmed manifest"). Bytes live in Convex storage; the site's CSS/images
// are served to the preview by the /tpl/<manifestId>/<path> HTTP route. Wording is the prototype's (store.tsx).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { audit } from "./lib/audit";
import { siteMutation, siteQuery } from "./lib/functions";
import { notify, siteAudienceWith } from "./lib/notify";
import { vTemplateMapping } from "./schema";
import { workflow } from "./workflows/manager";

type TResult = { ok: true; id?: string } | { ok: false; reason: string };
const fail = (reason: string): TResult => ({ ok: false, reason });
const MAX_UPLOAD = 50 * 1024 * 1024;

export const uploadUrl = siteMutation({
	permission: "template.ingest",
	args: {},
	handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const ingest = siteMutation({
	permission: "template.ingest",
	args: { storageId: v.id("_storage"), fileName: v.string() },
	handler: async (ctx, { siteId, storageId, fileName }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const name = fileName.trim();
		const kind = /\.zip$/i.test(name) ? "zip" : /\.html?$/i.test(name) ? "html" : null;
		if (!kind) {
			await ctx.storage.delete(storageId);
			return fail("Upload one rendered blog post as .html, or a .zip with the template, partials, CSS and a sample post.");
		}
		const meta = await ctx.db.system.get(storageId);
		if (!meta) return fail("The upload didn't arrive · try again");
		if (meta.size > MAX_UPLOAD) {
			await ctx.storage.delete(storageId);
			return fail("Keep the upload under 50 MB; drop node_modules and source images.");
		}
		const all = await ctx.db.query("templateManifests").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).take(200);
		const version = all.reduce((m, x) => Math.max(m, x.version), 0) + 1;
		const active = all.find((m) => m.status === "confirmed");
		const manifestId = await ctx.db.insert("templateManifests", { siteId, version, source: `${name} · parsing`, kind, output: active?.output ?? "html", status: "parsing", mappings: [], bundleFiles: 0, bundleBytes: meta.size, uploadedBy: user._id, uploadedAt: Date.now(), uploadStorageId: storageId });
		await ctx.scheduler.runAfter(0, internal.templatesNode.parse, { siteId, manifestId });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "uploaded template", target: name, detail: `v${version} · parsing` });
		return { ok: true, id: manifestId };
	},
});

/** Every manifest version for the Templates page (newest first). */
export const list = siteQuery({
	permission: "plan.view",
	args: {},
	handler: async (ctx, { siteId }) => {
		const rows = await ctx.db.query("templateManifests").withIndex("by_site_version", (q) => q.eq("siteId", siteId)).order("desc").take(50);
		const out = [];
		for (const m of rows) {
			const sample = m.samplePath ? await ctx.db.query("templateFiles").withIndex("by_manifest_path", (q) => q.eq("manifestId", m._id).eq("path", m.samplePath!)).unique() : null;
			out.push({ ...m, sampleUrl: sample?.storageId ? await ctx.storage.getUrl(sample.storageId) : null });
		}
		return out;
	},
});

export const mapItem = siteMutation({
	permission: "template.confirm",
	args: { manifestId: v.id("templateManifests"), mappingId: v.string(), role: vTemplateMapping.fields.role, label: v.optional(v.string()) },
	handler: async (ctx, { siteId, manifestId, mappingId, role, label }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const m = await ctx.db.get(manifestId);
		if (!m || m.siteId !== siteId) return fail("Mapping not found");
		if (m.status === "confirmed" || m.status === "superseded") return fail("Confirmed manifests are versioned. Re-ingest to change them");
		const map = m.mappings.find((x) => x.id === mappingId);
		if (!map) return fail("Mapping not found");
		await ctx.db.patch(manifestId, { mappings: m.mappings.map((x) => (x.id === mappingId ? { ...x, role, status: "mapped" as const, ...(label ? { label } : {}) } : x)) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "mapped template item", target: map.selector, detail: label ?? role });
		return { ok: true };
	},
});

export const setOutput = siteMutation({
	permission: "template.confirm",
	args: { manifestId: v.id("templateManifests"), output: v.union(v.literal("mdx"), v.literal("html"), v.literal("json"), v.literal("component")) },
	handler: async (ctx, { siteId, manifestId, output }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const m = await ctx.db.get(manifestId);
		if (!m || m.siteId !== siteId) return fail("Manifest not found");
		if (output === "component") return fail("Component output isn't supported yet · pick HTML, MDX or JSON");
		await ctx.db.patch(manifestId, { output });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "set output format", target: `Template manifest v${m.version}`, detail: output.toUpperCase() });
		return { ok: true };
	},
});

export const confirm = siteMutation({
	permission: "template.confirm",
	args: { manifestId: v.id("templateManifests") },
	handler: async (ctx, { siteId, manifestId }): Promise<TResult> => {
		const { site, user } = ctx.access;
		const m = await ctx.db.get(manifestId);
		if (!m || m.siteId !== siteId) return fail("Manifest not found");
		if (m.status !== "needs-confirmation") return fail(m.status === "parsing" ? "Still parsing" : `Manifest v${m.version} is ${m.status}`);
		const left = m.mappings.filter((x) => x.status === "needs-you").length;
		if (left) return fail(`Map ${left} item${left > 1 ? "s" : ""} first`);
		for (const x of await ctx.db.query("templateManifests").withIndex("by_site_status", (q) => q.eq("siteId", siteId).eq("status", "confirmed")).take(20)) await ctx.db.patch(x._id, { status: "superseded" });
		await ctx.db.patch(manifestId, { status: "confirmed", confirmedBy: user.name, confirmedByUserId: user._id, confirmedAt: Date.now() });
		await audit(ctx, { workspaceId: site.workspaceId, siteId, actor: user, action: "confirmed manifest", target: `Template manifest v${m.version}`, detail: `${m.source} · output ${m.output.toUpperCase()}` });
		// Posts held only because there was no confirmed manifest go back through the gate (autopost sites).
		if (site.publishing.autopost) {
			const held = await ctx.db.query("ledgerItems").withIndex("by_site_done", (q) => q.eq("siteId", siteId).eq("done", false)).take(300);
			for (const l of held.filter((x) => x.kind === "autopost-hold" && x.postId && /manifest|Template can't render/i.test(x.title))) {
				await ctx.db.patch(l._id, { done: true, doneAt: Date.now(), doneBy: user._id });
				await workflow.start(ctx, internal.workflows.autopostGate.autopostGate, { siteId, postId: l.postId! }, { startAsync: true });
			}
		}
		return { ok: true };
	},
});

// ─── Server parse (templatesNode.parse) ──────────────────────────────────────

export const parseInput = internalQuery({
	args: { manifestId: v.id("templateManifests") },
	handler: async (ctx, { manifestId }) => {
		const m = await ctx.db.get(manifestId);
		return m && m.status === "parsing" && m.uploadStorageId ? { siteId: m.siteId, kind: m.kind, storageId: m.uploadStorageId, version: m.version, source: m.source.replace(/ · parsing$/, "") } : null;
	},
});

const vFile = v.object({ path: v.string(), storageId: v.id("_storage"), contentType: v.string(), bytes: v.number(), kind: v.union(v.literal("html"), v.literal("css"), v.literal("image"), v.literal("font")) });

export const parsed = internalMutation({
	args: { manifestId: v.id("templateManifests"), files: v.array(vFile), samplePath: v.string(), mappings: v.array(vTemplateMapping), skipped: v.number(), missing: v.array(v.string()) },
	handler: async (ctx, { manifestId, files, samplePath, mappings, skipped, missing }) => {
		const m = await ctx.db.get(manifestId);
		if (!m || m.status !== "parsing") return;
		const site = (await ctx.db.get(m.siteId))!;
		for (const f of files) await ctx.db.insert("templateFiles", { siteId: m.siteId, manifestId, ...f });
		const bytes = files.reduce((n, f) => n + f.bytes, 0);
		const name = m.source.replace(/ · parsing$/, "");
		await ctx.db.patch(manifestId, { status: "needs-confirmation", samplePath, mappings, bundleFiles: files.length, bundleBytes: bytes, source: `${name} · ${files.length} file${files.length === 1 ? "" : "s"}`, parseError: undefined });
		if (m.uploadStorageId) await ctx.storage.delete(m.uploadStorageId); // the files are stored individually now
		const mapped = mappings.filter((x) => x.status === "mapped").length;
		const needs = mappings.filter((x) => x.status === "needs-you").length;
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: { system: "CMS agent" }, action: "parsed template", target: `Template manifest v${m.version}`, detail: `${mapped} mapped · ${needs} need you${skipped ? ` · ${skipped} unsafe path${skipped === 1 ? "" : "s"} skipped` : ""}${missing.length ? ` · ${missing.length} linked file${missing.length === 1 ? "" : "s"} missing` : ""}` });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: [m.uploadedBy], tone: needs ? "human" : "pass", title: `Template v${m.version} parsed`, body: `${mapped} mapped · ${needs} need you`, href: "/templates/ingest" });
	},
});

export const parseFailed = internalMutation({
	args: { manifestId: v.id("templateManifests"), error: v.string() },
	handler: async (ctx, { manifestId, error }) => {
		const m = await ctx.db.get(manifestId);
		if (!m || m.status !== "parsing") return;
		const site = (await ctx.db.get(m.siteId))!;
		await ctx.db.patch(manifestId, { parseError: error.slice(0, 300) });
		await audit(ctx, { workspaceId: site.workspaceId, siteId: site._id, actor: { system: "CMS agent" }, action: "template parse failed", target: `Template manifest v${m.version}`, detail: error.slice(0, 200) });
		await notify(ctx, { workspaceId: site.workspaceId, siteId: site._id, userIds: [m.uploadedBy], tone: "block", title: `Template v${m.version} couldn't be parsed`, body: error.slice(0, 160), href: "/templates" });
	},
});

/** The /tpl HTTP route: one bundle file by manifest + path. Template files are the site's public CSS/images. */
export const fileFor = internalQuery({
	args: { manifestId: v.string(), path: v.string() },
	handler: async (ctx, { manifestId, path }) => {
		const id = ctx.db.normalizeId("templateManifests", manifestId);
		if (!id) return null;
		const f = await ctx.db.query("templateFiles").withIndex("by_manifest_path", (q) => q.eq("manifestId", id as Id<"templateManifests">).eq("path", path)).unique();
		return f?.storageId ? { storageId: f.storageId, contentType: f.contentType } : null;
	},
});

