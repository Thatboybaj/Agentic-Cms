"use client";
// Settings · Site & repo — path-scoped repo connection, Search Console and rank-data status. Secrets are never displayed.
import { useState } from "react";
import { Button, Card, CardHeader, Chip, DataGap, KeyValue, RoleGate, ScopeNote, SourceNote, TextField } from "@/ds";
import { PERMISSIONS } from "@/lib/logic";
import { useCms, useSite } from "@/lib/store";
import { SITE_ON_CONVEX, useSiteCms } from "@/features/shared/site-source";
import { LiveSearchConsoleCard } from "./gsc-live";
import type { IRepoConnection } from "@/lib/types";
import { LockLine, LockNote, SaveBar, sameRecord } from "./shared";
import { sitePath } from "@/lib/routes";

type TDraft = Pick<IRepoConnection, "baseBranch" | "contentDir" | "assetDir" | "branchPattern">;

const pick = (r: IRepoConnection): TDraft => ({ baseBranch: r.baseBranch, contentDir: r.contentDir, assetDir: r.assetDir, branchPattern: r.branchPattern });

function pathError(v: string): string | undefined {
	const t = v.trim();
	if (!t) return "Required";
	if (t === "/" || t === "." || t.startsWith("/") || t.includes("..")) return "Use a directory inside the repo, like content/blog";
	return undefined;
}

export function SiteRepoTab() {
	const { slug } = useSite();
	const { actions } = useCms(); // demo-store edits (backend off)
	const { site, role, can } = useSiteCms();
	const repo = site.repo;
	const [draft, setDraft] = useState<TDraft | null>(repo ? pick(repo) : null);
	// Convex: paths are set when the repo is connected through the GitHub App (Connect a site); not edited here.
	const edit = can("repo.connect") && !SITE_ON_CONVEX;
	const dirty = !!repo && !!draft && !sameRecord(draft, pick(repo));
	const errors = draft ? { contentDir: pathError(draft.contentDir), assetDir: pathError(draft.assetDir), baseBranch: draft.baseBranch.trim() ? undefined : "Required", branchPattern: draft.branchPattern.includes("{slug}") ? undefined : "Include {slug} so each post gets its own branch" } : {};
	const valid = !Object.values(errors).some(Boolean);
	const hostLabel = repo?.host === "gitlab" ? "GitLab" : "GitHub";

	const set = (k: keyof TDraft) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

	return (
		<div className="flex flex-col gap-4">
			<SaveBar perm="repo.connect" dirty={dirty && valid} onSave={() => repo && draft && actions.connectRepo(site.id, { ...repo, ...draft })} onDiscard={() => repo && setDraft(pick(repo))}>
				Where the CMS writes, and what it may touch. Secrets are encrypted and never shown again after entry.
			</SaveBar>
			<LockNote perm="repo.connect" title="Repo settings are read-only for your role." />
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
				<Card className="flex flex-col gap-4">
					<CardHeader icon={repo?.host === "gitlab" ? "GitlabLogo" : "GithubLogo"} title="Repository" meta={repo ? `${hostLabel} · ${repo.repo}` : "Not connected"} />
					{!repo || !draft ? (
						<DataGap
							label="No repo connected"
							reason={`Posts for ${site.name} can't open merge requests until a developer connects GitHub or GitLab.`}
							action={
								<RoleGate role={role} allow={PERMISSIONS["repo.connect"]} action="connect a repo">
									<Button variant="secondary" size="sm" icon="Plugs" href={sitePath(slug, "/onboarding")}>
										Connect a repo
									</Button>
								</RoleGate>
							}
						/>
					) : (
						<>
							<KeyValue
								rows={[
									{ k: "Host", v: hostLabel },
									{ k: "Repo", v: <span className="font-mono text-xs">{repo.repo}</span> },
									{ k: "Connected as", v: repo.installedAs },
									{ k: "Git credentials", v: <span className="font-mono text-xs">•••• · encrypted at rest, never shown after entry</span> },
								]}
							/>
							{edit ? (
								<div className="grid gap-3 sm:grid-cols-2">
									<TextField label="Base branch" value={draft.baseBranch} onChange={set("baseBranch")} icon="GitBranch" error={errors.baseBranch} hint="Never pushed to. Merge requests target it." />
									<TextField label="Branch pattern" value={draft.branchPattern} onChange={set("branchPattern")} icon="GitFork" error={errors.branchPattern} hint="One branch per post" />
									<TextField label="Content directory" value={draft.contentDir} onChange={set("contentDir")} icon="FileText" error={errors.contentDir} />
									<TextField label="Asset directory" value={draft.assetDir} onChange={set("assetDir")} icon="Image" error={errors.assetDir} />
								</div>
							) : (
								<KeyValue
									rows={[
										{ k: "Base branch", v: <span className="font-mono text-xs">{repo.baseBranch}</span> },
										{ k: "Branch pattern", v: <span className="font-mono text-xs">{repo.branchPattern}</span> },
										{ k: "Content directory", v: <span className="font-mono text-xs">{repo.contentDir}</span> },
										{ k: "Asset directory", v: <span className="font-mono text-xs">{repo.assetDir}</span> },
									]}
								/>
							)}
							<p className="text-xs leading-body text-ink-3">The integration can&apos;t write application code, workflows or configuration. It opens merge requests; a compromised CMS still can&apos;t deploy anything a human didn&apos;t merge.</p>
						</>
					)}
				</Card>
				<div className="flex flex-col gap-4">
					{repo && <ScopeNote repo={draft && valid ? { ...repo, ...draft } : repo} />}
					{SITE_ON_CONVEX ? (
						<LiveSearchConsoleCard role={role} />
					) : (
					<Card className="flex flex-col gap-3">
						<CardHeader icon="GoogleLogo" title="Search Console" />
						{site.searchConsole === "connected" ? (
							<>
								<Chip tone="pass" icon="CheckCircle" className="self-start">
									Connected · sc-domain:{site.domain}
								</Chip>
								<SourceNote icon="Timer">OAuth · positions, impressions, clicks · lags 2–3 days</SourceNote>
							</>
						) : (
							<>
								<DataGap
									label={site.searchConsole === "expired" ? "Search Console access expired" : "Search Console not connected"}
									reason="No positions or impressions — nothing here is estimated."
									action={
										<RoleGate role={role} allow={PERMISSIONS["searchConsole.connect"]} action="connect Search Console">
											<Button variant="secondary" size="sm" icon="Plugs" onClick={() => actions.connectSearchConsole(site.id)}>
												Connect
											</Button>
										</RoleGate>
									}
								/>
								<LockLine perm="searchConsole.connect" />
							</>
						)}
					</Card>
					)}
					<Card className="flex flex-col gap-3">
						<CardHeader icon="ChartBar" title="Rank data" />
						{site.rankSource ? (
							<Chip tone="neutral" icon="FileText" className="self-start">
								{site.rankSource === "ahrefs" ? "Ahrefs" : "Semrush"} · CSV import
							</Chip>
						) : (
							<DataGap label="No Ahrefs or Semrush source" reason="Difficulty falls back to SERP evidence. Optional." />
						)}
					</Card>
				</div>
			</div>
		</div>
	);
}
