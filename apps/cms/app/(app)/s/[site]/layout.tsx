import type { ReactNode } from "react";
import { SiteGate } from "./site-states";

// Every site-scoped route renders inside SiteScope: the URL's [site] is the source of truth for the site (docs/multi-site-contract.md §1).
export default async function SiteLayout({ children, params }: { children: ReactNode; params: Promise<{ site: string }> }) {
	const { site } = await params;
	return <SiteGate slug={decodeURIComponent(site)}>{children}</SiteGate>;
}
