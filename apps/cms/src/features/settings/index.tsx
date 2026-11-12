"use client";
// S16 /settings — Site & repo · Publishing · Connections · Site discovery · Providers & budgets · Model routing · Members & roles · Brand pack · Audit log.
// Guardrails and configuration. Admin-only controls stay visible, disabled with the reason (RoleGate + why()).
import { useSearchParams } from "next/navigation";
import { Callout, PageHeader, Select, Tabs } from "@/ds";
import { ROLE_LABEL } from "@/lib/logic";
import { useSiteCms } from "@/features/shared/site-source";
import { AuditTab } from "./audit";
import { BrandTab } from "./brand";
import { ConnectionsSettings } from "./connections";
import { AuthorsSettings } from "./authors";
import { DiscoverySettings } from "./discovery";
import { MembersTab } from "./members";
import { ModelRoutingTab } from "./model-routing";
import { ProvidersTab } from "./providers";
import { PublishingSettings } from "./publishing";
import { SiteRepoTab } from "./site-repo";

const TABS = [
	{ id: "site", label: "Site & repo" },
	{ id: "publishing", label: "Publishing" },
	{ id: "connections", label: "Connections" },
	{ id: "discovery", label: "Site discovery" },
	{ id: "providers", label: "Providers & budgets" },
	{ id: "routing", label: "Model routing" },
	{ id: "members", label: "Members & roles" },
	{ id: "brand", label: "Brand pack" },
	{ id: "authors", label: "Rubrics & authors" },
	{ id: "audit", label: "Audit log" },
] as const;

type TTab = (typeof TABS)[number]["id"];

const isTab = (v: string | null): v is TTab => TABS.some((t) => t.id === v);

export function SettingsScreen() {
	const { site, role, why } = useSiteCms();
	const params = useSearchParams();
	const raw = params.get("tab");
	const stakeholder = role === "stakeholder";
	const tab: TTab = isTab(raw) ? raw : stakeholder ? "audit" : "site";
	// Native history keeps ?tab= shareable without a server round trip (Next syncs useSearchParams with it).
	const go = (id: string) => window.history.replaceState(null, "", `?tab=${id}`);

	// Stakeholders read the audit log only [ASSUMED in 04-screen-specs]; other tabs explain why instead of disappearing.
	const blocked = stakeholder && tab !== "audit";
	// Remount tab drafts per site so a tenant switch never carries unsaved values across (tenant isolation).
	const key = `${site.id}-${tab}`;

	return (
		<>
			<PageHeader title="Settings" subtitle={`${site.name} · ${site.domain} · guardrails and configuration · viewing as ${ROLE_LABEL[role]}`} />
			<Tabs className="max-md:hidden" label="Settings sections" value={tab} onChange={go} tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} />
			<Select<TTab> className="md:hidden" label="Section" value={tab} options={TABS.map((t) => ({ value: t.id, label: t.label }))} onChange={go} />
			<div role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label} className="flex min-w-0 flex-col gap-4">
				{blocked ? (
					<Callout tone="neutral" icon="LockSimple" title="Your role can view the audit log only.">
						{why("routing.set")}. Settings belong to the {site.name} team at the agency. The audit log shows who did what, and when.
					</Callout>
				) : tab === "site" ? (
					<SiteRepoTab key={key} />
				) : tab === "publishing" ? (
					<PublishingSettings key={key} />
				) : tab === "connections" ? (
					<ConnectionsSettings key={key} />
				) : tab === "discovery" ? (
					<DiscoverySettings key={key} />
				) : tab === "providers" ? (
					<ProvidersTab key={key} />
				) : tab === "routing" ? (
					<ModelRoutingTab key={key} />
				) : tab === "members" ? (
					<MembersTab key={key} />
				) : tab === "authors" ? (
					<AuthorsSettings key={key} />
				) : tab === "brand" ? (
					<BrandTab key={key} />
				) : (
					<AuditTab key={key} />
				)}
			</div>
		</>
	);
}
