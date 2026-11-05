import type { IReadinessItem } from "@/ds";
import type { IGateView } from "@/lib/store";
import type { IImageSlot, IMergeRequest, IPost, IRepoConnection } from "@/lib/types";
import { sitePath } from "@/lib/routes";

export const MIN_REASON = 8;

export interface IHardBlock {
	id: string;
	text: string;
	href: string;
	cta: string;
}

/** The four hard-gate tiles (ref 05), driven entirely by useGate. */
export function readinessItems(gate: IGateView, slots: IImageSlot[]): IReadinessItem[] {
	const postSlots = slots.filter((s) => s.postId === gate.post.id);
	const filled = postSlots.length - gate.unfilledSlots.length;
	const facts = gate.openFacts.length;
	const onPage = gate.failingHard.length;
	const templateBlocked = !gate.manifest || gate.missingStructures.length > 0;
	return [
		{ id: "facts", icon: "SealCheck", label: "Fact markers", value: `${facts} unresolved`, tone: facts ? "block" : "pass" },
		{
			id: "slots",
			icon: "ImagesSquare",
			label: "Image slots",
			value: postSlots.length ? `${filled} of ${postSlots.length} filled` : "No image slots",
			tone: gate.unfilledSlots.length ? "block" : "pass",
		},
		{ id: "on-page", icon: "ListChecks", label: "On-page 1–5", value: onPage ? `${onPage} failing` : "All passing", tone: onPage ? "block" : "pass" },
		{
			id: "template",
			icon: "BracketsAngle",
			label: "Template",
			value: !gate.manifest ? "No confirmed manifest" : gate.missingStructures.length ? `No ${gate.missingStructures.join(", ")} in template` : "Renders cleanly",
			tone: templateBlocked ? "block" : "pass",
		},
	];
}

/** Hard blocks with the place to fix each one. There is no override path for these. */
export function hardBlocks(gate: IGateView, siteSlug: string): IHardBlock[] {
	const id = gate.post.id;
	const at = (path: string) => sitePath(siteSlug, path);
	const out: IHardBlock[] = [];
	for (const f of gate.openFacts) out.push({ id: `fact-${f.id}`, text: `Unresolved fact marker · "${f.claim}"`, href: at(`/posts/${id}?fact=${f.id}`), cta: "Resolve in editor" });
	for (const s of gate.unfilledSlots) out.push({ id: `slot-${s.id}`, text: `Image slot unfilled · ${s.name}`, href: at(`/posts/${id}/assets?slot=${s.id}`), cta: "Fill slot" });
	for (const c of gate.failingHard) out.push({ id: `check-${c.id}`, text: `${c.label} · section ${c.section} · ${c.value}`, href: at(`/posts/${id}?check=${c.id}`), cta: "Fix in editor" });
	if (!gate.manifest) out.push({ id: "manifest", text: "No confirmed template manifest", href: at("/templates"), cta: "Open templates" });
	for (const s of gate.missingStructures) out.push({ id: `structure-${s}`, text: `Template has no ${s} · developer must extend it`, href: at("/templates"), cta: "Open templates" });
	return out;
}

/** Soft checks that still need a reason typed here (already-overridden ones are listed read-only). */
export function pendingSoft(gate: IGateView) {
	return gate.soft.filter((c) => !c.override?.reason?.trim());
}

/**
 * The MR the approval *would* open — derived for the preview only (mirrors the store's approve()),
 * never persisted. Overrides typed on screen are reflected so the description reads as it will ship.
 */
export function draftMr(post: IPost, slots: IImageSlot[], repo: IRepoConnection, output: string, overrides: Record<string, string>, gate: IGateView): IMergeRequest {
	const ext = ({ mdx: "mdx", html: "html", json: "json", component: "tsx" } as Record<string, string>)[output] ?? "mdx";
	const filled = slots.filter((s) => s.postId === post.id && s.status === "selected");
	const raster = filled.filter((s) => s.format !== "svg").length;
	const files: IMergeRequest["files"] = [{ path: `${repo.contentDir}/${post.slug}.${ext}`, change: `+${Math.max(40, Math.round(post.words / 7.6))}`, kind: "post" }];
	if (filled.length) files.push({ path: `${repo.assetDir}/ · ${raster} WebP${filled.length > raster ? ` · ${filled.length - raster} SVG` : ""}`, change: `${raster * 78} KB`, kind: "assets" });
	files.push({ path: "public/sitemap.xml", change: "+1", kind: "index" });
	const lines = gate.soft
		.map((c) => ({ c, reason: (c.override?.reason ?? overrides[c.id] ?? "").trim() }))
		.filter((x) => x.reason.length >= MIN_REASON)
		.map((x) => `${x.c.label} ${x.c.value.replace(/ · soft$/, "")}: ${x.reason}`);
	return {
		id: `draft-${post.id}`,
		number: 0,
		host: repo.host,
		branch: repo.branchPattern.replace("{slug}", post.slug),
		base: repo.baseBranch,
		status: "open",
		ci: "none",
		files,
		openedAt: "",
		overrides: lines,
		postId: post.id,
	};
}

/** Post copy with typed override reasons applied, so MRPreview's "On-page 11 / 12 · 1 override" is live. */
export function withTypedOverrides(post: IPost, overrides: Record<string, string>): IPost {
	return {
		...post,
		gate: post.gate.map((c) => {
			const r = overrides[c.id]?.trim();
			return !c.override && r && r.length >= MIN_REASON ? { ...c, override: { reason: r, by: "", at: "" } } : c;
		}),
	};
}
