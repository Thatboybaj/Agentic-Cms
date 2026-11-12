"use client";
// Settings · Rubrics & authors (prd-rubrics-and-authors §9): Authors (profiles, photo, per-site overrides, the
// default author) and Rubrics (pillar/cluster coverage, designations, sign-off setting, Suggest rubrics).
import { useRef, useState } from "react";
import { Button, Callout, Card, CardHeader, Checkbox, Chip, DataGap, EmptyState, Select, SourceNote, TextArea, TextField } from "@/ds";
import { type IAuthorInput, type TAuthor, type TAuthorsOverview, useAuthors } from "@/features/authors/data";
import { AuthorFace } from "@/features/authors/parts";
import { PageLoading } from "@/features/shared/page-loading";
import { useSiteCms } from "@/features/shared/site-source";
import { useToast } from "@/lib/store";
import { LockLine } from "./shared";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function AuthorForm({ author, onDone }: { author?: TAuthor; onDone: () => void }) {
	const a = useAuthors();
	const toast = useToast();
	const [f, setF] = useState({ name: author?.name ?? "", jobTitle: author?.baseTitle ?? "", bioShort: author?.baseBio ?? "", credentials: (author?.credentials ?? []).join("\n"), sameAs: (author?.sameAs ?? []).join("\n"), authorPageUrl: author?.authorPageUrl ?? "", titleOverride: author?.titleOverride ?? "", bioOverride: author?.bioOverride ?? "" });
	const [saving, setSaving] = useState(false);
	const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
	const save = async () => {
		setSaving(true);
		const input: IAuthorInput = { ...(author ? { authorId: author.id } : {}), name: f.name, jobTitle: f.jobTitle, bioShort: f.bioShort, credentials: lines(f.credentials), sameAs: lines(f.sameAs), authorPageUrl: f.authorPageUrl, titleOverride: f.titleOverride, bioOverride: f.bioOverride };
		const r = await a.saveAuthor(input);
		setSaving(false);
		toast(r.ok ? { text: author ? "Author saved" : "Author added", tone: "pass" } : { text: r.reason, tone: "block" });
		if (r.ok) onDone();
	};
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-sunken p-4">
			<div className="grid gap-3 md:grid-cols-2">
				<TextField label="Display name" value={f.name} onChange={set("name")} />
				<TextField label="Job title" value={f.jobTitle} onChange={set("jobTitle")} hint="Leave empty until the person confirms it" />
			</div>
			<TextArea label="Short bio (up to 300 characters)" value={f.bioShort} onChange={set("bioShort")} rows={2} hint={`${f.bioShort.length} / 300 · never written for them`} error={f.bioShort.length > 300 ? "Too long" : undefined} />
			<div className="grid gap-3 md:grid-cols-2">
				<TextArea label="Credentials (one per line)" value={f.credentials} onChange={set("credentials")} rows={2} />
				<TextArea label="Profile links (one https:// URL per line)" value={f.sameAs} onChange={set("sameAs")} rows={2} hint="LinkedIn, X, a professional register" />
			</div>
			<TextField label="Author page on this site" value={f.authorPageUrl} onChange={set("authorPageUrl")} hint="An existing about or team page; empty renders no link" />
			<details className="text-sm text-ink-3">
				<summary className="cursor-pointer">Different title or bio on this site</summary>
				<div className="mt-2 grid gap-3 md:grid-cols-2">
					<TextField label="Title on this site" value={f.titleOverride} onChange={set("titleOverride")} />
					<TextField label="Bio on this site" value={f.bioOverride} onChange={set("bioOverride")} />
				</div>
			</details>
			<span className="flex gap-2">
				<Button variant="primary" size="sm" icon="Check" loading={saving} disabled={!f.name.trim() || f.bioShort.length > 300} onClick={save}>
					Save
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</span>
		</div>
	);
}

function AuthorRow({ author, isDefault }: { author: TAuthor; isDefault: boolean }) {
	const a = useAuthors();
	const { can } = useSiteCms();
	const toast = useToast();
	const [editing, setEditing] = useState(false);
	const [uploading, setUploading] = useState(false);
	const file = useRef<HTMLInputElement>(null);
	const manage = can("author.manage");
	const missing = [!author.photo && "photo", !author.jobTitle && "job title", !author.bioShort && "bio"].filter(Boolean) as string[];
	if (editing) return <AuthorForm author={author} onDone={() => setEditing(false)} />;
	return (
		<div className="flex flex-wrap items-center gap-3 px-4 py-3">
			<AuthorFace author={author} size={44} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex flex-wrap items-center gap-1.5">
					<span className="font-display text-md text-ink">{author.name}</span>
					{isDefault && <Chip tone="pass" size="sm">Site default</Chip>}
					{author.status === "retired" && <Chip size="sm">Retired</Chip>}
				</span>
				<span className="text-sm text-ink-3">{author.jobTitle ?? <span className="text-ink-4">No title yet</span>}</span>
				{missing.length > 0 && <span className="text-xs text-human-ink">Author card incomplete: {missing.join(", ")} (soft block, posts still ship)</span>}
			</span>
			{manage && (
				<span className="flex flex-wrap gap-1.5">
					<input
						ref={file}
						type="file"
						accept="image/jpeg,image/png,image/webp"
						className="hidden"
						onChange={async (e) => {
							const f = e.target.files?.[0];
							e.target.value = "";
							if (!f) return;
							setUploading(true);
							const r = await a.uploadPhoto(author.id, f);
							setUploading(false);
							toast(r.ok ? { text: "Photo saved · 96, 192 and 400 px", tone: "pass" } : { text: r.reason, tone: "block" });
						}}
					/>
					<Button variant="secondary" size="sm" icon="ImagesSquare" loading={uploading} onClick={() => file.current?.click()}>
						{author.photo ? "Replace photo" : "Add photo"}
					</Button>
					<Button variant="secondary" size="sm" icon="PencilSimple" onClick={() => setEditing(true)}>
						Edit
					</Button>
					{!isDefault && author.status === "active" && (
						<Button
							variant="ghost"
							size="sm"
							onClick={async () => {
								const r = await a.setDefault(author.id);
								toast(r.ok ? { text: `${author.name} is now the default author`, tone: "pass" } : { text: r.reason, tone: "block" });
							}}
						>
							Make default
						</Button>
					)}
				</span>
			)}
		</div>
	);
}

function AuthorsPane({ d }: { d: TAuthorsOverview }) {
	const a = useAuthors();
	const { can } = useSiteCms();
	const toast = useToast();
	const [adding, setAdding] = useState(false);
	const [enableId, setEnableId] = useState("");
	return (
		<Card className="flex flex-col gap-4">
			<CardHeader icon="UserFocus" title="Authors" meta={`${d.authors.length} on this site`} />
			{!d.defaultAuthorId && (
				<Callout tone="human" icon="Warning" title="No default author yet">
					Every post needs a byline. Add an author; the first one becomes the site default.
				</Callout>
			)}
			{d.authors.length ? (
				<Card padding="none" className="divide-y divide-line-2">
					{d.authors.map((x) => (
						<AuthorRow key={x.id} author={x} isDefault={x.id === d.defaultAuthorId} />
					))}
				</Card>
			) : (
				<EmptyState icon="UserFocus" title="No authors on this site" body="Authors are the people credited on posts: name, photo, title, bio and profile links." />
			)}
			{adding ? (
				<AuthorForm onDone={() => setAdding(false)} />
			) : (
				<span className="flex flex-wrap items-center gap-2">
					<Button variant="secondary" size="sm" icon="Plus" disabled={!can("author.manage")} onClick={() => setAdding(true)}>
						Add author
					</Button>
					{d.workspaceAuthors.length > 0 && can("author.manage") && (
						<>
							<Select<string> label="From another site" value={enableId} options={d.workspaceAuthors.map((w) => ({ value: w.id, label: w.name }))} onChange={setEnableId} />
							<Button
								variant="ghost"
								size="sm"
								disabled={!enableId}
								onClick={async () => {
									const r = await a.enable(enableId);
									toast(r.ok ? { text: "Author enabled on this site", tone: "pass" } : { text: r.reason, tone: "block" });
								}}
							>
								Enable
							</Button>
						</>
					)}
				</span>
			)}
			<LockLine perm="author.manage" />
			<SourceNote icon="ShieldCheck">Photos come only from an upload: the CMS never generates or alters a person's face. Changing a profile updates future renders and open merge requests; live posts change only when you run a byline update.</SourceNote>
		</Card>
	);
}

function RubricEditor({ d, rubric, onDone }: { d: TAuthorsOverview; rubric?: TAuthorsOverview["rubrics"][number]; onDone: () => void }) {
	const a = useAuthors();
	const toast = useToast();
	const [name, setName] = useState(rubric?.name ?? "");
	const [pillarIds, setPillarIds] = useState<string[]>(rubric?.pillarIds ?? []);
	const [clusters, setClusters] = useState<string[]>(rubric?.clusters ?? []);
	const [rotation, setRotation] = useState<"rotate" | "primary-only">(rubric?.rotation ?? "rotate");
	const [signoff, setSignoff] = useState<"none" | "author" | "reviewer">(rubric?.signoff ?? "none");
	const [des, setDes] = useState(rubric?.designations ?? []);
	const toggle = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
	const save = async () => {
		const r = await a.saveRubric({ ...(rubric ? { rubricId: rubric.id } : {}), name, pillarIds, clusters, rotation, signoff, firstPerson: false });
		if (!r.ok) return toast({ text: r.reason, tone: "block" });
		const id = (r as { rubricId?: string }).rubricId ?? rubric?.id;
		if (id) {
			const r2 = await a.setDesignations(id, des.map((x) => ({ authorId: x.authorId as string, role: x.role, primary: x.primary })));
			if (!r2.ok) return toast({ text: r2.reason, tone: "block" });
		}
		toast({ text: "Rubric saved", tone: "pass" });
		onDone();
	};
	return (
		<div className="flex flex-col gap-3 rounded-lg bg-sunken p-4">
			<TextField label="Rubric name" value={name} onChange={setName} />
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium text-ink-2">Covers</span>
				{d.pillars.map((p) => (
					<div key={p.id} className="flex flex-col gap-1">
						<Checkbox checked={pillarIds.includes(p.id)} onChange={() => setPillarIds((x) => toggle(x, p.id))} label={`${p.name} (whole pillar)`} description={`${p.keywords} keywords · ${p.livePosts} live posts`} />
						{!pillarIds.includes(p.id) && p.clusters.length > 0 && (
							<div className="ms-7 flex flex-wrap gap-x-4 gap-y-1">
								{p.clusters.map((c) => (
									<Checkbox key={c.key} checked={clusters.includes(c.key)} onChange={() => setClusters((x) => toggle(x, c.key))} label={`${c.name} · ${c.keywords}`} />
								))}
							</div>
						)}
					</div>
				))}
			</div>
			<div className="flex flex-col gap-2">
				<span className="text-sm font-medium text-ink-2">Authors and reviewers</span>
				{des.map((x, i) => (
					<span key={`${x.authorId}-${x.role}`} className="flex flex-wrap items-center gap-2 text-sm">
						<span className="text-ink">{d.authors.find((y) => y.id === x.authorId)?.name ?? "Unknown"}</span>
						<Chip size="sm">{x.role === "reviewer" ? "Reviewer" : x.primary ? "Primary author" : "Author"}</Chip>
						<Button variant="ghost" size="sm" onClick={() => setDes((xs) => xs.filter((_, j) => j !== i))}>
							Remove
						</Button>
					</span>
				))}
				<span className="flex flex-wrap gap-2">
					{(["author", "reviewer"] as const).map((role) => (
						<Select<string> key={role} label={role === "author" ? "Add author" : "Add reviewer"} value="" options={d.authors.filter((y) => y.status === "active").map((y) => ({ value: y.id, label: y.name }))} onChange={(v) => setDes((xs) => [...xs, { authorId: v as never, role, primary: role === "author" && !xs.some((z) => z.role === "author") }])} />
					))}
				</span>
				{!des.some((x) => x.role === "author") && <span className="text-xs text-ink-3">No authors: posts in this rubric go to the site default.</span>}
			</div>
			<div className="grid gap-3 md:grid-cols-2">
				<Select label="Several authors" value={rotation} options={[{ value: "rotate", label: "Rotate by post count" }, { value: "primary-only", label: "Primary author only" }]} onChange={(v) => setRotation(v as typeof rotation)} />
				<Select label="Sign-off before shipping" value={signoff} options={[{ value: "none", label: "None" }, { value: "author", label: "The author" }, { value: "reviewer", label: "The reviewer" }]} onChange={(v) => setSignoff(v as typeof signoff)} />
			</div>
			{signoff !== "none" && <SourceNote icon="Info">Sign-off is recorded with the rubric; holding posts for it and the sign-off links are the next step of this feature.</SourceNote>}
			<span className="flex gap-2">
				<Button variant="primary" size="sm" icon="Check" disabled={!name.trim() || (!pillarIds.length && !clusters.length)} onClick={save}>
					Save rubric
				</Button>
				<Button variant="ghost" size="sm" onClick={onDone}>
					Cancel
				</Button>
			</span>
		</div>
	);
}

function RubricsPane({ d }: { d: TAuthorsOverview }) {
	const a = useAuthors();
	const { can } = useSiteCms();
	const toast = useToast();
	const [editing, setEditing] = useState<string | "new" | null>(null);
	const manage = can("rubric.manage");
	const nameOf = (id: string) => d.authors.find((x) => x.id === id)?.name ?? "Unknown";
	const defaultName = d.authors.find((x) => x.id === d.defaultAuthorId)?.name;
	return (
		<Card className="flex flex-col gap-4">
			<CardHeader icon="TreeStructure" title="Rubrics" meta={`${d.rubrics.length} · ${d.uncovered.length} uncovered cluster${d.uncovered.length === 1 ? "" : "s"}`} />
			{!d.pillars.length ? (
				<DataGap label="Rubrics" reason="Rubrics group the keyword memory's pillars and clusters. Run site discovery or the keyword swarm first." />
			) : (
				<>
					{d.rubrics.length ? (
						<Card padding="none" className="divide-y divide-line-2">
							{d.rubrics.map((r) =>
								editing === r.id ? (
									<RubricEditor key={r.id} d={d} rubric={r} onDone={() => setEditing(null)} />
								) : (
									<div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
										<span className="min-w-0 flex-1">
											<span className="font-display text-md text-ink">{r.name}</span>
											<span className="block text-xs text-ink-3">
												{[...r.pillarIds.map((p) => d.pillars.find((x) => x.id === p)?.name ?? ""), ...r.clusters.map((c) => c.split("|")[1])].filter(Boolean).join(" · ")} · {r.posts} post{r.posts === 1 ? "" : "s"}
											</span>
										</span>
										<span className="text-ink-2">{r.designations.filter((x) => x.role === "author").map((x) => nameOf(x.authorId)).join(", ") || <span className="text-ink-4">Default: {defaultName ?? "none set"}</span>}</span>
										{r.signoff !== "none" && <Chip size="sm" tone="human">Sign-off: {r.signoff}</Chip>}
										{manage && (
											<span className="flex gap-1">
												<Button variant="ghost" size="sm" onClick={() => setEditing(r.id)}>
													Edit
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={async () => {
														const x = await a.deleteRubric(r.id);
														toast(x.ok ? { text: "Rubric deleted · posts keep their author", tone: "pass" } : { text: x.reason, tone: "block" });
													}}
												>
													Delete
												</Button>
											</span>
										)}
									</div>
								),
							)}
						</Card>
					) : (
						<p className="text-sm text-ink-3">No rubrics yet. Posts go to the default author{defaultName ? ` (${defaultName})` : ""}.</p>
					)}
					{editing === "new" && <RubricEditor d={d} onDone={() => setEditing(null)} />}
					{d.uncovered.length > 0 && (
						<SourceNote icon="Info">
							Uncovered clusters (default author): {d.uncovered.slice(0, 12).map((u) => `${u.pillar} / ${u.cluster}`).join(" · ")}
							{d.uncovered.length > 12 ? ` · +${d.uncovered.length - 12}` : ""}
						</SourceNote>
					)}
					{manage && editing !== "new" && (
						<span className="flex gap-2">
							<Button
								variant="secondary"
								size="sm"
								icon="Sparkle"
								onClick={async () => {
									const r = await a.suggestRubrics();
									toast(r.ok ? { text: `${(r as { created?: number }).created ?? 0} rubric(s) suggested, one per pillar`, tone: "pass" } : { text: r.reason, tone: "block" });
								}}
							>
								Suggest rubrics
							</Button>
							<Button variant="ghost" size="sm" icon="Plus" onClick={() => setEditing("new")}>
								New rubric
							</Button>
						</span>
					)}
				</>
			)}
			<LockLine perm="rubric.manage" />
		</Card>
	);
}

export function AuthorsSettings() {
	const a = useAuthors();
	if (a.demo) return <Callout tone="info" icon="Info" title="Demo data · rubrics and authors need the backend">Author profiles are real people, so nothing is seeded here. Connect the backend to add authors and rubrics.</Callout>;
	if (a.loading || !a.data) return <PageLoading rows={3} />;
	return (
		<div className="flex flex-col gap-4">
			<AuthorsPane d={a.data} />
			<RubricsPane d={a.data} />
		</div>
	);
}
