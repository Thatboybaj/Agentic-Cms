// On-page SEO optimizer, audit mode (harness #4 on-page-seo-optimizer; handoff 03 "optimizer → gateChecks with the 12
// check ids"). Deterministic on purpose: the skill's checklist is numbers-based ("count it, don't guess"), so the
// counts come from code, not a model; the model's work is the fixing (agents/editor.ts). Re-run after every content
// change so a fix is verified by the gate instead of asserted. Ids, labels and sections match the prototype (seed gate12).
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** Live agents on this deployment (CMS_AGENTS=live). The real audit runs only then; stub drafts keep stub rows. */
export const agentsLive = () => process.env.CMS_AGENTS === "live";

type TStatus = "pass" | "warn" | "fail";
export interface IOnPageCheck {
	checkId: string;
	label: string;
	section: number;
	status: TStatus;
	value: string;
	severity: "hard" | "soft";
}

export const ONPAGE_CHECK_IDS = ["title-front", "title-length", "kw-first-100", "density", "headings", "meta-description", "alt-text", "external-links", "internal-links", "faq", "schema", "readability"] as const;

const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[^a-z0-9À-ɏ\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);
const STOP = new Set(["a", "an", "the", "of", "for", "in", "on", "to", "and", "or", "do", "does", "is", "are", "how", "what", "my", "your", "vs"]);

function occurrences(hay: string[], needle: string[]): number[] {
	const at: number[] = [];
	if (!needle.length) return at;
	for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((w, j) => hay[i + j] === w)) at.push(i);
	return at;
}

function syllables(w: string) {
	const m = w.replace(/e$/, "").match(/[aeiouy]+/g);
	return Math.max(1, m ? m.length : 1);
}

/** Flesch–Kincaid grade over the body's prose. */
export function fkGrade(text: string): number {
	const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
	const ws = words(text);
	if (!ws.length) return 0;
	const syl = ws.reduce((n, w) => n + syllables(w), 0);
	return Math.round((0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10;
}

const c = (checkId: string, label: string, section: number, status: TStatus, value: string): IOnPageCheck => ({ checkId, label, section, status, value, severity: section <= 5 ? "hard" : "soft" });

export interface IOnPageInput {
	title: string;
	seoTitle: string;
	metaDescription?: string;
	keyword: string;
	domain: string;
	blocks: { kind: string; text: string }[];
	slots: { alt: string; status: string }[];
}

export function auditOnPage(p: IOnPageInput): IOnPageCheck[] {
	const kw = words(p.keyword);
	const sig = kw.filter((w) => !STOP.has(w));
	const body = p.blocks.filter((b) => b.kind !== "disclaimer" && b.kind !== "image");
	const bodyWords = words(body.map((b) => b.text).join(" "));
	const t = p.seoTitle.trim();
	const titleWords = words(t);

	// 1 · title
	const firstSig = sig[0];
	const frontIdx = firstSig ? titleWords.indexOf(firstSig) : -1;
	const front = frontIdx >= 0 && frontIdx <= Math.max(2, Math.floor(titleWords.length / 3));
	// 2 · keyword placement + density (exact phrase; long-tail phrases land low naturally, so low is a warning)
	const hits = occurrences(bodyWords, kw);
	const first = hits[0];
	const density = bodyWords.length ? (hits.length * kw.length * 100) / bodyWords.length : 0;
	const dStatus: TStatus = density > 2.5 ? "fail" : density < 0.5 ? "warn" : "pass";
	// 3 · headings + meta description
	const h2 = body.filter((b) => b.kind === "h2");
	const firstH2 = body.findIndex((b) => b.kind === "h2");
	const firstH3 = body.findIndex((b) => b.kind === "h3");
	const skips = firstH3 >= 0 && (firstH2 < 0 || firstH3 < firstH2);
	const question = h2.some((h) => h.text.trim().endsWith("?"));
	const variant = h2.some((h) => sig.length > 0 && sig.filter((w) => words(h.text).includes(w)).length >= Math.ceil(sig.length / 2));
	const hStatus: TStatus = !h2.length || skips ? "fail" : question && variant ? "pass" : "warn";
	const meta = p.metaDescription?.trim() ?? "";
	const metaOk = meta.length >= 120 && meta.length <= 160 && (!sig.length || sig.some((w) => words(meta).includes(w)));
	// 4 · alt text
	const withAlt = p.slots.filter((s) => s.alt.trim().length >= 8).length;
	// 5–6 · links (markdown links in the body)
	const links = [...body.map((b) => b.text).join("\n").matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]!);
	const host = p.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
	const internal = links.filter((u) => u.startsWith("/") || u.toLowerCase().includes(host)).length;
	const external = links.filter((u) => /^https?:\/\//i.test(u) && !u.toLowerCase().includes(host)).length;
	// 6 · FAQ (skill: minimum 4 questions)
	const faq = body.filter((b) => b.kind === "faq").length;
	// 7 · readability over prose
	const grade = fkGrade(body.filter((b) => b.kind === "p" || b.kind === "faq").map((b) => b.text).join(" "));

	return [
		c("title-front", "Title front-loaded", 1, front || !sig.length ? "pass" : "fail", front ? `Keyword at word ${frontIdx + 1}` : "Keyword not near the front"),
		c("title-length", "Title length", 1, t.length && t.length <= 60 ? "pass" : "fail", `${t.length} / 60`),
		c("kw-first-100", "Keyword in first 100 words", 2, first !== undefined && first < 100 ? "pass" : "fail", first !== undefined && first < 100 ? `Word ${first + 1}` : "Missing"),
		c("density", "Density", 2, dStatus, `${density.toFixed(1)}%${dStatus === "warn" ? " · low" : dStatus === "fail" ? " · stuffing" : ""}`),
		c("headings", "Heading hierarchy", 3, hStatus, !h2.length ? "No H2" : skips ? "H3 before any H2" : `${h2.length} H2${question ? "" : " · no question H2"}${variant ? "" : " · keyword in no H2"}`),
		c("meta-description", "Meta description", 3, metaOk ? "pass" : "fail", meta ? `${meta.length} ch${metaOk ? "" : meta.length < 120 || meta.length > 160 ? " · aim 150–160" : " · no keyword"}` : "Missing"),
		c("alt-text", "Image alt text", 4, withAlt === p.slots.length ? "pass" : "fail", `${withAlt} of ${p.slots.length}`),
		// No sources is a logged soft block, not a hard one: the writer has no web access yet, and every unsourced claim is
		// already a hard-blocking fact marker. A person (or 04+ research) adds citations.
		c("external-links", "External links", 5, external > 0 ? "pass" : "warn", external > 0 ? `${external} source${external === 1 ? "" : "s"}` : "No sources yet · soft"),
		c("internal-links", "Internal links", 6, internal >= 2 ? "pass" : "warn", internal >= 2 ? `${internal} of 2` : `${internal} of 2 · soft`),
		c("faq", "FAQ", 6, faq >= 4 ? "pass" : "warn", `${faq} question${faq === 1 ? "" : "s"}${faq >= 4 ? "" : " · aim 4"}`),
		// Article (+FAQPage) JSON-LD is emitted by the renderer (handoff 05) for every post.
		c("schema", "Schema ready", 7, "pass", faq ? "Article · FAQPage" : "Article"),
		c("readability", "Readability", 7, grade <= 10 ? "pass" : "warn", `Grade ${Math.max(1, Math.round(grade))}`),
	];
}

/** Recomputes the 12 rows for the post's current version. Keeps a logged override while the check is still not passing. */
export async function refreshOnPage(ctx: MutationCtx, post: Doc<"posts">) {
	const site = await ctx.db.get(post.siteId);
	if (!site) return;
	const kw = await ctx.db.get(post.keywordId);
	const slots = await ctx.db.query("imageSlots").withIndex("by_post", (q) => q.eq("postId", post._id)).take(50);
	const checks = auditOnPage({ title: post.title, seoTitle: post.seoTitle, ...(post.metaDescription ? { metaDescription: post.metaDescription } : {}), keyword: kw && kw.siteId === post.siteId ? kw.term : post.title, domain: site.domain, blocks: post.blocks, slots });
	const rows = await ctx.db.query("gateChecks").withIndex("by_post", (q) => q.eq("postId", post._id)).take(60);
	const now = Date.now();
	for (const ch of checks) {
		const row = rows.find((r) => r.checkId === ch.checkId);
		if (!row) {
			await ctx.db.insert("gateChecks", { siteId: post.siteId, postId: post._id, checkId: ch.checkId, label: ch.label, section: ch.section, status: ch.status, value: ch.value, severity: ch.severity, evaluatedAt: now, evaluatedForVersion: post.currentVersion });
			continue;
		}
		const keepOverride = row.override && ch.status !== "pass";
		if (row.status === ch.status && row.value === ch.value && row.evaluatedForVersion === post.currentVersion) continue;
		await ctx.db.patch(row._id, { label: ch.label, section: ch.section, status: ch.status, value: ch.value, severity: ch.severity, evaluatedAt: now, evaluatedForVersion: post.currentVersion, ...(keepOverride ? {} : { override: undefined }) });
	}
	return checks;
}
