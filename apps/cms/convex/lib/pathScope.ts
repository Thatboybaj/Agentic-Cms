// Path scope (handoff 06 step 2): the only paths the CMS agent may write in a site repo. Allowlist = contentDir/**,
// assetDir/**, and the declared index files. Everything else is refused: traversal, absolute paths, the CI/config
// surface (.github/**, workflows, package manifests, lockfiles, build config), and prefix tricks (content/blog-evil/…
// when contentDir is content/blog). Every write path calls assertWritable before a byte leaves the CMS.

export interface IScope {
	contentDir: string;
	assetDir: string;
	indexFiles?: string[];
	/** The site's language-version folders (dist/ar/blog), each its own content dir. */
	extraDirs?: string[];
}

export class PathScopeError extends Error {
	constructor(readonly path: string, reason: string) {
		super(`${path}: ${reason}`);
		this.name = "PathScopeError";
	}
}

const DENY = [/^\.github(\/|$)/i, /^\.gitlab(-ci\.yml|\/)/i, /(^|\/)\.git(\/|$)/, /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|vercel\.(json|ts)|netlify\.toml|Dockerfile|Makefile)$/i, /(^|\/)(next|vite|astro|nuxt|svelte|remix|gatsby|webpack|rollup|babel|eslint|prettier)\.config\.[a-z]+$/i, /(^|\/)\.env(\.|$)/i, /(^|\/)\.(husky|circleci|buildkite)(\/|$)/i];

/** Normalises a repo-relative dir: no leading/trailing slashes, no "." segments. */
export function normDir(d: string): string {
	return d
		.trim()
		.replace(/\\/g, "/")
		.split("/")
		.filter((s) => s && s !== ".")
		.join("/");
}

/** Throws PathScopeError unless `path` may be written under this scope. Returns the normalised path. */
export function assertWritable(path: string, scope: IScope): string {
	const raw = path.replace(/\\/g, "/");
	if (!raw || raw.startsWith("/") || /^[a-z]:/i.test(raw)) throw new PathScopeError(path, "absolute paths are refused");
	const segs = raw.split("/");
	if (segs.some((s) => s === ".." || s === "")) throw new PathScopeError(path, "traversal and empty segments are refused");
	const p = segs.filter((s) => s !== ".").join("/");
	if (DENY.some((re) => re.test(p))) throw new PathScopeError(p, "CI, config and package files are never written");
	const index = new Set((scope.indexFiles ?? []).map(normDir));
	if (index.has(p)) return p;
	for (const dir of [normDir(scope.contentDir), normDir(scope.assetDir), ...(scope.extraDirs ?? []).map(normDir)]) {
		if (dir && p.startsWith(`${dir}/`) && p.length > dir.length + 1) return p;
	}
	throw new PathScopeError(p, `outside ${normDir(scope.contentDir)}/, ${normDir(scope.assetDir)}/ and the declared index files`);
}

/** A declared directory is itself safe to use as a scope (not root, not the deny list, no traversal). */
export function scopeError(dir: string): string | null {
	const d = normDir(dir);
	if (!d) return "Use a directory inside the repo, like content/blog";
	if (dir.includes("..")) return "Traversal isn't allowed";
	if (DENY.some((re) => re.test(d) || re.test(`${d}/x`))) return "That directory holds CI or config; pick a content directory";
	return null;
}
