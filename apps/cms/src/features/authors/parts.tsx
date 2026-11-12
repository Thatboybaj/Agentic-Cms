"use client";
// Author chips (prd-rubrics-and-authors §9): avatar + name + where the credit came from, on idea cards and in the
// editor header, with the override menu for the content specialist.
import { useState } from "react";
import { Avatar, Button, Select } from "@/ds";
import { useSiteCms } from "@/features/shared/site-source";
import { sitePath } from "@/lib/routes";
import { useSite, useToast } from "@/lib/store";
import type { IPost } from "@/lib/types";
import { type TAuthor, useAuthors } from "./data";

export function AuthorFace({ author, size = 24 }: { author: Pick<TAuthor, "name" | "photo">; size?: 24 | 32 | 44 }) {
	const src = size > 32 ? (author.photo?.s192 ?? author.photo?.s400) : (author.photo?.s96 ?? author.photo?.s192);
	if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
	return <Avatar name={author.name} size={size} />;
}

const SOURCE: Record<string, string> = { override: "set by hand", rubric: "from rubric", default: "default author" };

/** "Olayinka Adeyefa · default author", or the site default as a hint on ideas not approved yet. */
export function AuthorChip({ post, editable = false }: { post: IPost; editable?: boolean }) {
	const a = useAuthors();
	const { can } = useSiteCms();
	const { slug } = useSite();
	const toast = useToast();
	const [open, setOpen] = useState(false);
	if (a.demo || !a.data) return null;
	const d = a.data;
	const author = d.authors.find((x) => x.id === post.author?.id) ?? (post.state === "idea" ? d.authors.find((x) => x.id === d.defaultAuthorId) : undefined);
	if (!author) {
		return can("author.manage") ? (
			<Button variant="ghost" size="sm" icon="UserFocus" href={sitePath(slug, "/settings?tab=authors")}>
				Set a default author
			</Button>
		) : null;
	}
	const rubric = post.author?.rubricId ? d.rubrics.find((r) => r.id === post.author!.rubricId) : undefined;
	const note = post.author ? (post.author.source === "rubric" && rubric ? `from ${rubric.name}` : SOURCE[post.author.source]) : "on approval";
	const reviewer = post.author?.reviewerId ? d.authors.find((x) => x.id === post.author!.reviewerId) : undefined;
	const canOverride = editable && can("post.author.override") && post.author;
	return (
		<span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
			<AuthorFace author={author} />
			<span className="truncate text-ink">{author.name}</span>
			<span className="text-xs text-ink-4">{note}</span>
			{reviewer && <span className="text-xs text-ink-3">· reviewed by {reviewer.name}</span>}
			{canOverride &&
				(open ? (
					<Select
						label="Author"
						value={post.author?.source === "override" ? post.author.id : "__rubric"}
						options={[{ value: "__rubric", label: "From rubric or default" }, ...d.authors.filter((x) => x.status === "active").map((x) => ({ value: x.id, label: x.name }))]}
						onChange={async (v) => {
							setOpen(false);
							const r = await a.setPostAuthor(post.id, v === "__rubric" ? null : v);
							toast(r.ok ? { text: "Author updated", tone: "pass" } : { text: r.reason, tone: "block" });
						}}
					/>
				) : (
					<Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
						Change
					</Button>
				))}
		</span>
	);
}
