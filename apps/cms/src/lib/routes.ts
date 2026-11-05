// URL scheme for a multi-site, multi-user workspace (docs/multi-site-contract.md).
// The site lives in the URL, not in shared state, so two people — or two tabs — can work on different sites at once.
//
//   Workspace-level   /sites  /inbox  /team  /account  /sign-in
//   Site-scoped       /s/<siteSlug>/plan  /s/<siteSlug>/posts/<id>  …  (every existing app route moves under here)
//   Outside the shell /preview/<siteSlug>/<postId>  /styleguide

export const WORKSPACE_ROUTES = { sites: "/sites", inbox: "/inbox", team: "/team", account: "/account", signIn: "/sign-in" } as const;

/** Site-scoped path: sitePath("lumen", "/posts/p-1") → "/s/lumen/posts/p-1". `path` must start with "/". */
export function sitePath(siteSlug: string, path: string = "/plan"): string {
	return `/s/${encodeURIComponent(siteSlug)}${path === "/" ? "" : path}`;
}

/** Full-page preview, outside the app shell. */
export function previewPath(siteSlug: string, postId: string, device?: string): string {
	return `/preview/${encodeURIComponent(siteSlug)}/${encodeURIComponent(postId)}${device ? `?device=${device}` : ""}`;
}

/** Reads the site slug from a pathname ("/s/lumen/plan" → "lumen"); null on workspace routes. */
export function siteSlugFromPath(pathname: string): string | null {
	const m = /^\/s\/([^/]+)/.exec(pathname);
	return m ? decodeURIComponent(m[1]) : null;
}

/** Strips the site prefix ("/s/lumen/posts/p-1" → "/posts/p-1") — for rail active-state matching. */
export function stripSite(pathname: string): string {
	return pathname.replace(/^\/s\/[^/]+/, "") || "/";
}
