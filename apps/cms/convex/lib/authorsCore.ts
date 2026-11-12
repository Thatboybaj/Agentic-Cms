// Rubrics and authors, pure parts (prd-rubrics-and-authors §4, §6.4): which author a post gets, and the schema.org
// Person the renderer writes. No database access, so both are unit-tested directly.

export interface IRubricLite {
	id: string;
	pillarIds: string[];
	/** "<pillar id>|<cluster>" */
	clusters: string[];
	rotation: "rotate" | "primary-only";
}

export interface IDesignationLite {
	rubricId: string;
	authorId: string;
	role: "author" | "reviewer";
	primary: boolean;
}

export interface IResolved {
	authorId: string | null;
	reviewerId?: string;
	rubricId?: string;
	source: "override" | "rubric" | "default";
}

export const clusterKey = (pillarId: string, cluster: string) => `${pillarId}|${cluster.trim().toLowerCase()}`;

/** The most specific rubric covering a keyword: a cluster-level rubric beats a pillar-level one. */
export function rubricFor(kw: { pillarId: string; cluster?: string }, rubrics: IRubricLite[]): IRubricLite | undefined {
	if (kw.cluster) {
		const key = clusterKey(kw.pillarId, kw.cluster);
		const byCluster = rubrics.find((r) => r.clusters.map((c) => c.toLowerCase()).includes(key));
		if (byCluster) return byCluster;
	}
	return rubrics.find((r) => r.pillarIds.includes(kw.pillarId));
}

/**
 * Resolution order (§4): 1 manual override · 2 the keyword's most specific rubric · 3 that rubric's authors
 * (round-robin by posts already credited in the rubric, unless primary-only) · 4 the site default.
 */
export function resolveAuthor(a: { overrideAuthorId?: string; keyword: { pillarId: string; cluster?: string } | null; rubrics: IRubricLite[]; designations: IDesignationLite[]; defaultAuthorId: string | null; postsByAuthorInRubric: (rubricId: string) => Record<string, number> }): IResolved {
	const rubric = a.keyword ? rubricFor(a.keyword, a.rubrics) : undefined;
	const des = rubric ? a.designations.filter((d) => d.rubricId === rubric.id) : [];
	const reviewer = des.find((d) => d.role === "reviewer" && d.primary) ?? des.find((d) => d.role === "reviewer");
	const withReviewer = (r: IResolved): IResolved => (reviewer && reviewer.authorId !== r.authorId ? { ...r, reviewerId: reviewer.authorId } : r);
	if (a.overrideAuthorId) return withReviewer({ authorId: a.overrideAuthorId, ...(rubric ? { rubricId: rubric.id } : {}), source: "override" });
	const authors = des.filter((d) => d.role === "author");
	if (rubric && authors.length) {
		const primary = authors.find((d) => d.primary) ?? authors[0]!;
		if (rubric.rotation === "primary-only" || authors.length === 1) return withReviewer({ authorId: primary.authorId, rubricId: rubric.id, source: "rubric" });
		const counts = a.postsByAuthorInRubric(rubric.id);
		// Fewest posts first; the primary wins ties, then the designation order.
		const pick = [...authors].sort((x, y) => (counts[x.authorId] ?? 0) - (counts[y.authorId] ?? 0) || Number(y.primary) - Number(x.primary))[0]!;
		return withReviewer({ authorId: pick.authorId, rubricId: rubric.id, source: "rubric" });
	}
	return withReviewer({ authorId: a.defaultAuthorId, ...(rubric ? { rubricId: rubric.id } : {}), source: "default" });
}

export { personJsonLd, type IAuthorProfile } from "../../src/render/author";

export const slugify = (s: string) =>
	s
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/(^-|-$)/g, "")
		.slice(0, 60);
