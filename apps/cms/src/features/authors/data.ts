"use client";
// Rubrics and authors data (prd-rubrics-and-authors §9). Live: the Convex overview + actions. Demo (backend off):
// an empty state that explains the feature needs the backend (author profiles are real people; nothing is seeded).
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useMemo } from "react";
import { SITE_ON_CONVEX } from "@/features/shared/site-source";
import { useSite } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { IAuthorProfile } from "@/render/author";

export type TAuthorsOverview = FunctionReturnType<typeof api.authors.overview>;
export type TAuthor = TAuthorsOverview["authors"][number];
export type TResult = { ok: true; [k: string]: unknown } | { ok: false; reason: string };

export interface IAuthorInput {
	authorId?: string;
	name: string;
	jobTitle?: string;
	bioShort?: string;
	credentials: string[];
	sameAs: string[];
	authorPageUrl?: string;
	titleOverride?: string;
	bioOverride?: string;
	makeDefault?: boolean;
}

export interface IRubricInput {
	rubricId?: string;
	name: string;
	pillarIds: string[];
	clusters: string[];
	rotation: "rotate" | "primary-only";
	signoff: "none" | "author" | "reviewer";
	firstPerson: boolean;
}

export interface IAuthorsData {
	loading: boolean;
	demo: boolean;
	data: TAuthorsOverview | null;
	saveAuthor(a: IAuthorInput): Promise<TResult>;
	setDefault(authorId: string): Promise<TResult>;
	enable(authorId: string): Promise<TResult>;
	retire(authorId: string): Promise<TResult>;
	uploadPhoto(authorId: string, file: File): Promise<TResult>;
	saveRubric(r: IRubricInput): Promise<TResult>;
	deleteRubric(rubricId: string): Promise<TResult>;
	suggestRubrics(): Promise<TResult>;
	setDesignations(rubricId: string, d: { authorId: string; role: "author" | "reviewer"; primary: boolean }[]): Promise<TResult>;
	setPostAuthor(postId: string, authorId: string | null): Promise<TResult>;
}

const DEMO: TResult = { ok: false, reason: "Demo data · connect the backend to manage authors" };

/** Square crop and the three WebP sizes, in the browser (A1, A3: the photo is resized, never altered or generated). */
async function photoSizes(file: File): Promise<{ original: Blob; sizes: [number, Blob][] }> {
	if (file.size > 5 * 1024 * 1024) throw new Error("Photos can be up to 5 MB");
	if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo");
	const bmp = await createImageBitmap(file);
	const side = Math.min(bmp.width, bmp.height);
	const sx = (bmp.width - side) / 2;
	const sy = (bmp.height - side) / 2;
	const sizes: [number, Blob][] = [];
	for (const w of [96, 192, 400]) {
		const c = document.createElement("canvas");
		c.width = c.height = w;
		const g = c.getContext("2d")!;
		g.imageSmoothingQuality = "high";
		g.drawImage(bmp, sx, sy, side, side, 0, 0, w, w);
		sizes.push([w, await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't resize the photo"))), "image/webp", 0.86))]);
	}
	return { original: file, sizes };
}

function useLive(): IAuthorsData {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const data = useQuery(api.authors.overview, siteId ? { siteId } : "skip");
	const saveM = useMutation(api.authors.saveAuthor);
	const defM = useMutation(api.authors.setDefaultAuthor);
	const enableM = useMutation(api.authors.enableAuthor);
	const retireM = useMutation(api.authors.retireAuthor);
	const urlM = useMutation(api.authors.photoUploadUrl);
	const photoM = useMutation(api.authors.setPhoto);
	const rubricM = useMutation(api.authors.saveRubric);
	const delM = useMutation(api.authors.deleteRubric);
	const suggestM = useMutation(api.authors.suggestRubrics);
	const desM = useMutation(api.authors.setDesignations);
	const postM = useMutation(api.authors.setPostAuthor);
	const call = useCallback(async (f: (siteId: Id<"sites">) => Promise<unknown>): Promise<TResult> => {
		if (!siteId) return { ok: false, reason: "Still loading the site" };
		try {
			return (await f(siteId)) as TResult;
		} catch (e) {
			return { ok: false, reason: e instanceof Error ? e.message.replace(/^.*Uncaught \w+: /, "").split("\n")[0]! : "Something went wrong" };
		}
	}, [siteId]);
	return useMemo(
		() => ({
			loading: data === undefined,
			demo: false,
			data: data ?? null,
			saveAuthor: (a) => call((siteId) => saveM({ siteId, ...a, authorId: a.authorId as Id<"authors"> | undefined })),
			setDefault: (authorId) => call((siteId) => defM({ siteId, authorId: authorId as Id<"authors"> })),
			enable: (authorId) => call((siteId) => enableM({ siteId, authorId: authorId as Id<"authors"> })),
			retire: (authorId) => call((siteId) => retireM({ siteId, authorId: authorId as Id<"authors"> })),
			uploadPhoto: (authorId, file) =>
				call(async (siteId) => {
					const { original, sizes } = await photoSizes(file);
					const put = async (b: Blob) => {
						const u = (await urlM({ siteId })) as { url: string };
						const r = await fetch(u.url, { method: "POST", headers: { "Content-Type": b.type }, body: b });
						if (!r.ok) throw new Error("Upload failed");
						return ((await r.json()) as { storageId: Id<"_storage"> }).storageId;
					};
					const [o, s96, s192, s400] = [await put(original), await put(sizes[0]![1]), await put(sizes[1]![1]), await put(sizes[2]![1])];
					return photoM({ siteId, authorId: authorId as Id<"authors">, original: o, s96, s192, s400 });
				}),
			saveRubric: (r) => call((siteId) => rubricM({ siteId, ...r, rubricId: r.rubricId as Id<"rubrics"> | undefined, pillarIds: r.pillarIds as Id<"pillars">[] })),
			deleteRubric: (rubricId) => call((siteId) => delM({ siteId, rubricId: rubricId as Id<"rubrics"> })),
			suggestRubrics: () => call((siteId) => suggestM({ siteId })),
			setDesignations: (rubricId, d) => call((siteId) => desM({ siteId, rubricId: rubricId as Id<"rubrics">, designations: d.map((x) => ({ ...x, authorId: x.authorId as Id<"authors"> })) })),
			setPostAuthor: (postId, authorId) => call((siteId) => postM({ siteId, postId: postId as Id<"posts">, authorId: authorId as Id<"authors"> | null })),
		}),
		[data, call, saveM, defM, enableM, retireM, urlM, photoM, rubricM, delM, suggestM, desM, postM],
	);
}

function useDemo(): IAuthorsData {
	return useMemo(() => {
		const say = async () => DEMO;
		return { loading: false, demo: true, data: null, saveAuthor: say, setDefault: say, enable: say, retire: say, uploadPhoto: say, saveRubric: say, deleteRubric: say, suggestRubrics: say, setDesignations: say, setPostAuthor: say };
	}, []);
}

/** SITE_ON_CONVEX is a build-time constant, so the hook order is stable. */
export const useAuthors: () => IAuthorsData = SITE_ON_CONVEX ? useLive : useDemo;

/** The preview renderer's profile for an author (D5: the byline and card exactly as they will render). */
export function previewProfile(a: TAuthor | undefined): IAuthorProfile | undefined {
	if (!a) return undefined;
	const img = a.photo?.s400 ?? a.photo?.s192 ?? a.photo?.original;
	return {
		name: a.name,
		...(a.authorPageUrl ? { url: a.authorPageUrl } : {}),
		...(a.jobTitle ? { jobTitle: a.jobTitle } : {}),
		...(a.bioShort ? { bio: a.bioShort } : {}),
		...(a.sameAs.length ? { sameAs: a.sameAs } : {}),
		...(a.credentials.length ? { credentials: a.credentials } : {}),
		...(img ? { image: { src: img, width: 400, height: 400, alt: a.photo!.alt } } : {}),
	};
}
