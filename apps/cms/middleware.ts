// Keeps pre-multi-site deep links working (docs/multi-site-contract.md §1) and remembers the last-used site.
//
//   /plan, /posts/p-1/assets?slot=s, /settings?tab=audit …  →  /s/<last-used site>/…   (query + hash preserved)
//   /preview/<postId>                                        →  /preview/<last-used site>/<postId>
//
// "Last-used" is the `cms.lastSite` cookie, written client-side by SiteGate (app/(app)/s/[site]/site-states.tsx) only once a
// slug resolves to a site this person can open — so a typo or a no-access site never becomes the redirect target.
// No cookie yet → the seeded default site. Workspace routes, /styleguide, /api, /_next and static files are not matched.
import { NextResponse, type NextRequest } from "next/server";
import { sitePath } from "@/lib/routes";

const DEFAULT_SITE_SLUG = "lumen";
const LAST_SITE_COOKIE = "cms.lastSite"; // keep in sync with site-states.tsx

/** First path segments of the routes that moved under /s/[site]. */
const SITE_ROUTES = new Set(["plan", "posts", "assets", "templates", "onboarding", "approvals", "merge-requests", "seo", "runs", "settings"]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function lastSite(req: NextRequest): string {
	const v = req.cookies.get(LAST_SITE_COOKIE)?.value;
	return v && SLUG_RE.test(v) ? v : DEFAULT_SITE_SLUG;
}

export function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	const [first = "", ...rest] = pathname.split("/").filter(Boolean);

	if (SITE_ROUTES.has(first)) {
		const url = req.nextUrl.clone();
		url.pathname = sitePath(lastSite(req), pathname);
		return NextResponse.redirect(url, 307);
	}

	if (first === "preview" && rest.length === 1) {
		const url = req.nextUrl.clone();
		url.pathname = `/preview/${encodeURIComponent(lastSite(req))}/${rest[0]}`;
		return NextResponse.redirect(url, 307);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/preview/:postId", "/(plan|posts|assets|templates|onboarding|approvals|merge-requests|seo|runs|settings)", "/(plan|posts|assets|templates|onboarding|approvals|merge-requests|seo|runs|settings)/:path*"],
};
