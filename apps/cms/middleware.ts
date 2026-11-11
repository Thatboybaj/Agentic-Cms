// Keeps pre-multi-site deep links working (docs/multi-site-contract.md §1) and remembers the last-used site.
//
//   /plan, /posts/p-1/assets?slot=s, /settings?tab=audit …  →  /s/<last-used site>/…   (query + hash preserved)
//   /preview/<postId>                                        →  /preview/<last-used site>/<postId>
//
// "Last-used" is the `cms.lastSite` cookie, written client-side by SiteGate (app/(app)/s/[site]/site-states.tsx) only once a
// slug resolves to a site this person can open — so a typo or a no-access site never becomes the redirect target.
// No cookie yet → the seeded default site. Workspace routes, /styleguide and /api pass through unchanged.
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
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

function legacyRedirects(req: NextRequest) {
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

// With the real backend on, Clerk runs first (session handshake), then the same redirects. Routes are not protected
// here yet: Convex functions enforce access (requireSiteRole), and pages still run on demo data.
const BACKEND_ENABLED = process.env.NEXT_PUBLIC_CMS_BACKEND === "convex" && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;
const withClerk = clerkMiddleware((_auth, req) => legacyRedirects(req));

export function middleware(req: NextRequest, event: NextFetchEvent) {
	return BACKEND_ENABLED ? withClerk(req, event) : legacyRedirects(req);
}

export const config = {
	// Every page and API route except Next internals and static files (Clerk needs to see them). legacyRedirects only
	// acts on the pre-multi-site paths in SITE_ROUTES and /preview/<postId>, so the broad matcher changes nothing else.
	matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
