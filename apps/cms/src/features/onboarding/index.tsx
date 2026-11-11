"use client";
// S01 /onboarding — Connect a site (F7a): Site › Repo › Paths › Search Console › Template.
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
	Button,
	Callout,
	Card,
	CardHeader,
	Chip,
	DataGap,
	EmptyState,
	Icon,
	KeyValue,
	PageHeader,
	ScopeNote,
	SegmentedControl,
	Select,
	Skeleton,
	SourceNote,
	Stepper,
	TextField,
} from "@/ds";
import { useCms, useSite } from "@/lib/store";
import { SITE_ON_CONVEX, useSiteCms } from "@/features/shared/site-source";
import { LiveSearchConsoleCard } from "@/features/settings/gsc-live";
import { useLiveRepoConnect, type IRepoChoice } from "./live-repo";
import type { IRepoConnection, ISite } from "@/lib/types";
import { sitePath } from "@/lib/routes";

const STEPS = [
	{ id: "site", label: "Site" },
	{ id: "repo", label: "Repo" },
	{ id: "paths", label: "Paths" },
	{ id: "search-console", label: "Search Console" },
	{ id: "template", label: "Template" },
];
const HOST_LABEL = { github: "GitHub", gitlab: "GitLab" } as const;
const INSTALL_MS = 1200;
const SCAN_MS = 1100;
const OAUTH_MS = 1000;

/** A site added from this screen resumes at the Repo step after the site switch remounts the wizard. */
let resumeAt: { siteId: string; step: number } | null = null;

const repoSlug = (site: Pick<ISite, "id" | "domain">) => `${site.id.split("-")[0]}/${site.domain}`;
const installName = (host: IRepoConnection["host"]) => `Grandeur CMS (${HOST_LABEL[host]} App)`;

export function OnboardingView() {
	const { site } = useSiteCms();
	return <Wizard key={site.id} />;
}

function Wizard() {
	const { slug } = useSite();
	const { site, can, why, state } = useSiteCms();
	const canConnect = can("repo.connect");
	const resume = resumeAt?.siteId === site.id ? resumeAt.step : null;
	const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
	const returning = !!params && (params.has("installation") || params.has("app"));
	// Back from Google (gsc.beginOAuth with returnTo "onboarding"): reopen the Search Console step.
	const fromGoogle = !!params && params.has("gsc");
	const [started, setStarted] = useState(!site.repo || resume !== null || returning || fromGoogle);
	const [adding, setAdding] = useState(false);
	const developer = state.members.find((m) => m.role === "developer")?.name ?? "a developer";

	const header = <PageHeader title="Connect a site" subtitle="Once per site. The CMS writes only where you point it." />;

	if (!canConnect)
		return (
			<>
				{header}
				<Card className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
					<Callout
						tone="info"
						icon="LockSimple"
						title="Only a developer or admin can connect repos."
						action={
							<Button variant="secondary" icon="ArrowLeft" href={sitePath(slug, "/plan")}>
								Back to the plan
							</Button>
						}
					>
						{why("repo.connect")}. {site.repo ? "" : `Ask ${developer} to connect ${site.name}.`}
					</Callout>
					<SiteStatus site={site} />
				</Card>
			</>
		);

	if (!started)
		return (
			<>
				{header}
				<ConnectedSummary
					site={site}
					onAdd={
						can("site.add")
							? () => {
									setAdding(true);
									setStarted(true);
								}
							: undefined
					}
				/>
			</>
		);

	return (
		<>
			{header}
			<Steps initial={adding ? 0 : (resume ?? (fromGoogle ? 3 : returning ? 1 : 0))} adding={adding} />
		</>
	);
}

// ---- Steps -----------------------------------------------------------------

function Steps({ initial, adding }: { initial: number; adding: boolean }) {
	const { slug } = useSite();
	const { actions } = useCms(); // store-only actions (add site, Search Console demo)
	const { site, role } = useSiteCms();
	const live = useLiveRepoConnect();
	const [repos, setRepos] = useState<IRepoChoice[] | null>(null);
	const [liveError, setLiveError] = useState<string | null>(null);
	const [scanNote, setScanNote] = useState<string | null>(null);
	const router = useRouter();
	const [step, setStep] = useState(initial);
	const [name, setName] = useState(adding ? "" : site.name);
	const [domain, setDomain] = useState(adding ? "" : site.domain);
	const [siteError, setSiteError] = useState<string | null>(null);
	const [host, setHost] = useState<IRepoConnection["host"]>(site.repo?.host ?? "github");
	const [installed, setInstalled] = useState(!!site.repo);
	const [installing, setInstalling] = useState(false);
	const [repo, setRepo] = useState(site.repo?.repo ?? repoSlug(site));
	const [scanning, setScanning] = useState(false);
	const [paths, setPaths] = useState({
		contentDir: site.repo?.contentDir ?? "content/blog",
		assetDir: site.repo?.assetDir ?? "public/images/blog",
		branchPattern: site.repo?.branchPattern ?? "content/{slug}",
		baseBranch: site.repo?.baseBranch ?? "main",
	});
	const [pathError, setPathError] = useState<string | null>(null);
	const [oauth, setOauth] = useState(false);
	const [property, setProperty] = useState(`sc-domain:${site.domain}`);

	useEffect(() => {
		resumeAt = null;
	}, []);

	// Repo scan when the Paths step opens (fields are prefilled from what the scan infers).
	// Live: list the repos the installation can see.
	useEffect(() => {
		if (!live?.installationId || repos) return;
		let on = true;
		void live.listRepos(live.installationId).then((res) => {
			if (!on) return;
			if (!res.ok) return setLiveError(res.reason);
			setRepos(res.repos);
			setInstalled(true);
			if (res.repos[0]) setRepo((cur) => (res.repos.some((x) => x.repo === cur) ? cur : res.repos[0]!.repo));
		});
		return () => {
			on = false;
		};
	}, [live, repos]);

	// Live: read the repo layout when the Paths step opens and prefill what it finds.
	useEffect(() => {
		if (step !== 2 || site.repo || !live?.installationId) return;
		let on = true;
		setScanning(true);
		void live.scan(live.installationId, repo).then((res) => {
			if (!on) return;
			setScanning(false);
			if (!res.ok) return setScanNote(res.reason);
			setPaths((p) => ({ ...p, contentDir: res.contentDir, assetDir: res.assetDir, baseBranch: res.defaultBranch }));
			setScanNote(res.contentFiles ? `${res.contentFiles} post file${res.contentFiles === 1 ? "" : "s"} found in ${res.contentDir}` : "No posts found yet · the content directory is a suggestion");
		});
		return () => {
			on = false;
		};
	}, [step, site.repo, live, repo]);

	useEffect(() => {
		if (step !== 2 || site.repo || live) return;
		setScanning(true);
		const t = setTimeout(() => setScanning(false), SCAN_MS);
		return () => clearTimeout(t);
	}, [step, site.repo]);

	useEffect(() => {
		if (!installing || live) return;
		const t = setTimeout(() => {
			setInstalling(false);
			setInstalled(true);
		}, INSTALL_MS);
		return () => clearTimeout(t);
	}, [installing]);

	useEffect(() => {
		if (!oauth) return;
		const t = setTimeout(() => {
			setOauth(false);
			actions.connectSearchConsole(site.id);
		}, OAUTH_MS);
		return () => clearTimeout(t);
	}, [oauth, actions, site.id]);

	const conn: IRepoConnection = { host, repo, ...paths, installedAs: installName(host) };
	const branchError = paths.branchPattern.includes("{slug}") ? undefined : "Include {slug} so each post gets its own branch.";

	const submitSite = () => {
		setSiteError(null);
		if (!adding) return setStep(1);
		const r = actions.addSite({ name, domain });
		if (!r.ok) return setSiteError(r.reason);
		if (r.id) {
			resumeAt = { siteId: r.id, step: 1 };
			actions.setSite(r.id);
		}
	};
	const confirmPaths = async () => {
		setPathError(null);
		if (branchError) return;
		if (live) {
			if (site.repo) return setStep(3);
			if (!live.installationId) return setPathError("Install the GitHub app first");
			const res = await live.connect({ installationId: live.installationId, repo, ...paths });
			if (!res.ok) return setPathError(res.reason);
			return setStep(3);
		}
		const r = site.repo ? ({ ok: true } as const) : actions.connectRepo(site.id, conn);
		if (!r.ok) return setPathError(r.reason);
		setStep(3);
	};

	let body: ReactNode;
	let cta: ReactNode;
	let later: ReactNode = null;
	if (step === 0) {
		body = (
			<div className="flex flex-col gap-4">
				<TextField label="Site name" value={name} onChange={setName} placeholder="Northwind Legal" disabled={!adding} hint={adding ? undefined : "Set when the agency added the site."} />
				<TextField
					label="Domain"
					value={domain}
					onChange={setDomain}
					placeholder="northwindlegal.co.uk"
					icon="Globe"
					suffix={<span className="font-mono text-xs text-ink-4">https://</span>}
					disabled={!adding}
					error={siteError ?? undefined}
				/>
			</div>
		);
		cta = (
			<Button variant="primary" icon="ArrowRight" onClick={submitSite} disabled={adding && (!name.trim() || !domain.trim())}>
				Continue
			</Button>
		);
	} else if (step === 1) {
		body = (
			<div className="flex flex-col gap-4">
				<Callout tone="info" icon="Info" title={`Install the Grandeur CMS app on GitHub or GitLab. Choose only the site repo.`}>
					The app can open branches and merge requests. It never gets org-wide access.
				</Callout>
				<SegmentedControl<IRepoConnection["host"]>
					label="Repo host"
					options={[
						{ value: "github", label: "GitHub", icon: "GithubLogo" },
						{ value: "gitlab", label: "GitLab", icon: "GitlabLogo" },
					]}
					value={host}
					onChange={(h) => {
						setHost(h);
						setInstalled(false);
					}}
				/>
				{live && live.ready && !live.configured ? (
					<Callout
						tone="info"
						icon="GithubLogo"
						title="First, create the CMS app on GitHub (once per deployment)."
						action={
							<Button
								variant="secondary"
								size="sm"
								icon="GithubLogo"
								onClick={async () => {
									setLiveError(null);
									const res = await live.createApp();
									if (!res.ok) return setLiveError(res.reason);
									if (res.url) window.location.assign(res.url);
								}}
							>
								Create the GitHub App
							</Button>
						}
					>
						GitHub shows the app with its permissions already set (contents and pull requests: write; checks and statuses: read). You click Create; GitHub hands the keys straight to the CMS.
					</Callout>
				) : null}
				{liveError && (
					<Callout tone="block" title="GitHub didn't answer as expected.">
						{liveError}
					</Callout>
				)}
				{installed ? (
					<div className="flex flex-col gap-3">
						<Chip tone="pass" icon="PlugsConnected" className="w-fit">
							Connected as {live?.account ?? installName(host)}
						</Chip>
						<Select
							label="Repository"
							value={repo}
							options={repos ? repos.map((x) => ({ value: x.repo, label: x.repo, hint: `${x.private ? "Private" : "Public"} · ${x.defaultBranch}` })) : [{ value: repo, label: repo, hint: "Only installed repo" }]}
							onChange={setRepo}
							icon={host === "github" ? "GithubLogo" : "GitlabLogo"}
							className="w-full"
						/>
					</div>
				) : (
					<EmptyState icon="GitBranch" title="No repo connected" body="Install the app, then pick the site repo." />
				)}
			</div>
		);
		cta = installed ? (
			<Button variant="primary" icon="ArrowRight" onClick={() => setStep(2)}>
				Continue
			</Button>
		) : (
			<Button
				variant="primary"
				icon={host === "github" ? "GithubLogo" : "GitlabLogo"}
				loading={installing}
				disabled={!!live && (!live.configured || host === "gitlab")}
				onClick={async () => {
					if (!live) return setInstalling(true);
					setLiveError(null);
					const res = await live.begin();
					if (!res.ok) return setLiveError(res.reason);
					if (res.url) window.location.assign(res.url);
				}}
			>
				Install {HOST_LABEL[host]} app
			</Button>
		);
	} else if (step === 2) {
		const field = (key: keyof typeof paths, label: string, hint: string, error?: string) =>
			scanning ? (
				<div key={key} className="flex flex-col gap-1.5">
					<span className="text-sm text-ink-3">{label}</span>
					<Skeleton className="h-11 w-full" radius="var(--c-radius-pill)" />
				</div>
			) : (
				<TextField key={key} label={label} value={paths[key]} onChange={(v) => setPaths((p) => ({ ...p, [key]: v }))} hint={hint} error={error} />
			);
		body = (
			<div className="flex flex-col gap-4">
				<p className="text-sm text-ink-3" aria-live="polite">
					{scanning ? `Reading ${repo}…` : (scanNote ?? "Everything else is inferred from the repo.")}
				</p>
				<div className="grid gap-4 sm:grid-cols-2">
					{field("contentDir", "Content directory", live ? "Where posts are written" : site.id === "lumen" ? "41 .mdx files found" : "12 .mdx files found")}
					{field("assetDir", "Asset directory", "Images are written here as WebP")}
					{field("branchPattern", "Branch naming", "One branch per post", branchError)}
					{field("baseBranch", "Base branch", "Protected · CMS never pushes here")}
				</div>
				{pathError && (
					<Callout tone="block" title="Paths weren't saved.">
						{pathError}
					</Callout>
				)}
				{!scanning && <ScopeNote repo={conn} />}
			</div>
		);
		cta = (
			<Button variant="primary" icon="ShieldCheck" loading={scanning} disabled={!!branchError} onClick={confirmPaths}>
				Confirm paths
			</Button>
		);
	} else if (step === 3 && SITE_ON_CONVEX) {
		// Live: the real Google flow (read-only OAuth, property pick, nightly import), the same card as Settings.
		body = (
			<div className="flex flex-col gap-4">
				<p className="text-md text-ink-2">Positions, impressions and indexing come from Google Search Console. Without it, rankings show as data gaps.</p>
				<LiveSearchConsoleCard role={role} returnTo="onboarding" />
			</div>
		);
		cta = (
			<Button variant="primary" icon="ArrowRight" onClick={() => setStep(4)}>
				Continue
			</Button>
		);
	} else if (step === 3) {
		const connected = site.searchConsole === "connected";
		body = (
			<div className="flex flex-col gap-4">
				<p className="text-md text-ink-2">Positions, impressions and indexing come from Google Search Console. Without it, rankings show as data gaps.</p>
				{connected ? (
					<div className="flex flex-col gap-3">
						<Chip tone="pass" icon="GoogleLogo" className="w-fit">
							Connected as {site.domain} property owner
						</Chip>
						<Select
							label="Property"
							value={property}
							options={[
								{ value: `sc-domain:${site.domain}`, label: `sc-domain:${site.domain}`, hint: "Matched" },
								{ value: `https://${site.domain}/`, label: `https://${site.domain}/` },
							]}
							onChange={setProperty}
							className="w-full"
						/>
					</div>
				) : (
					<DataGap label="Search Console" reason="Not connected yet · positions and impressions will show as gaps" />
				)}
				<SourceNote>Positions and impressions · lags 2–3 days</SourceNote>
			</div>
		);
		cta = connected ? (
			<Button variant="primary" icon="ArrowRight" onClick={() => setStep(4)}>
				Continue
			</Button>
		) : (
			<Button variant="primary" icon="GoogleLogo" loading={oauth} onClick={() => setOauth(true)}>
				Connect Search Console
			</Button>
		);
		if (!connected)
			later = (
				<Button variant="ghost" onClick={() => setStep(4)}>
					Connect later
				</Button>
			);
	} else {
		body = (
			<div className="flex flex-col gap-4">
				<SiteStatus site={site} />
				<p className="text-md text-ink-2">Last step: upload one rendered blog post so posts render into the site&apos;s own markup.</p>
			</div>
		);
		cta = (
			<Button variant="primary" icon="BracketsAngle" onClick={() => router.push(sitePath(slug, "/templates/ingest"))}>
				Ingest template
			</Button>
		);
	}

	return (
		<Card className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
			<div className="max-md:hidden">
				<Stepper steps={STEPS} current={step} />
			</div>
			<div className="flex flex-col gap-2 md:hidden">
				<span className="text-xs text-ink-4">
					Step {step + 1} of {STEPS.length} · {STEPS[step]!.label}
				</span>
				<ol aria-hidden className="flex gap-[5px]">
					{STEPS.map((s, i) => (
						<li key={s.id} className={clsx("h-1 flex-1 rounded-pill", i < step ? "bg-pass" : i === step ? "bg-ink" : "bg-line-3")} />
					))}
				</ol>
			</div>
			<h2 tabIndex={-1} aria-live="polite" className="font-display text-xl font-medium text-ink">
				<span className="sr-only">
					Step {step + 1} of {STEPS.length},{" "}
				</span>
				{STEPS[step]!.label}
			</h2>
			{body}
			<div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:-mb-4 max-md:rounded-b-xl max-md:bg-surface max-md:px-4 max-md:pb-4">
				{step > 0 && (
					<Button variant="ghost" icon="ArrowLeft" onClick={() => setStep((s) => s - 1)}>
						Back
					</Button>
				)}
				{later}
				<div className="flex-1" />
				{cta}
			</div>
		</Card>
	);
}

// ---- Summaries ---------------------------------------------------------------

function SiteStatus({ site }: { site: ISite }) {
	const r = site.repo;
	return (
		<KeyValue
			rows={[
				{ k: "Site", v: `${site.name} · ${site.domain}` },
				{
					k: "Repo",
					v: r ? (
						<span className="flex flex-col">
							<span className="font-mono text-xs text-ink">{r.repo}</span>
							<span className="text-xs text-ink-3">Connected as {r.installedAs}</span>
						</span>
					) : (
						<span className="text-ink-4">Not connected</span>
					),
				},
				{ k: "Paths", v: r ? <span className="font-mono text-xs">{`${r.contentDir} · ${r.assetDir}`}</span> : <span className="text-ink-4">Not declared</span> },
				{ k: "Branches", v: r ? <span className="font-mono text-xs">{`${r.branchPattern} → ${r.baseBranch} (never pushed to)`}</span> : <span className="text-ink-4">—</span> },
				{
					k: "Search Console",
					v: site.searchConsole === "connected" ? <span className="flex items-center gap-1.5"><Icon name="CheckCircle" size={14} className="text-pass" />Connected</span> : <span className="text-ink-4">Not connected · rankings show as data gaps</span>,
				},
			]}
		/>
	);
}

function ConnectedSummary({ site, onAdd }: { site: ISite; onAdd?: () => void }) {
	const { slug } = useSite();
	const { data } = useCms();
	const hasManifest = data.manifests.some((m) => m.status === "confirmed");
	return (
		<Card className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
			<CardHeader
				icon="PlugsConnected"
				title={`${site.name} is connected`}
				action={
					<Chip tone="pass" size="sm" icon="CheckCircle">
						Connected
					</Chip>
				}
			/>
			<SiteStatus site={site} />
			{site.repo && <ScopeNote repo={site.repo} />}
			<SourceNote icon="LockSimple">Secrets are stored once and never shown again. Reconnect from Settings to rotate them.</SourceNote>
			<div className="flex flex-wrap items-center gap-2">
				{onAdd && (
					<Button variant="ghost" icon="Plus" onClick={onAdd}>
						Add another site
					</Button>
				)}
				<div className="flex-1" />
				<Button variant="secondary" href={sitePath(slug, "/plan")}>
					Open the plan
				</Button>
				<Button variant="primary" icon="BracketsAngle" href={sitePath(slug, hasManifest ? "/templates" : "/templates/ingest")}>
					{hasManifest ? "Go to templates" : "Ingest template"}
				</Button>
			</div>
		</Card>
	);
}
