"use client";
// Settings · Publishing · SEO rules (every site). The site's own SEO title limit: the on-page check, the auto-fix,
// the editor agent and the writer all follow it. A post over the limit can still be approved with a logged override.
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader, SourceNote, TextField } from "@/ds";
import { SITE_ON_CONVEX, useSiteCms } from "@/features/shared/site-source";
import { useSite, useToast } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LockLine } from "./shared";

function Live() {
	const { slug } = useSite();
	const { can } = useSiteCms();
	const toast = useToast();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const rules = useQuery(api.billing.seoRules, siteId ? { siteId } : "skip");
	const save = useMutation(api.billing.setSeoRules);
	const [value, setValue] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const allowed = can("publishing.set");

	useEffect(() => {
		if (rules && value === null) setValue(String(rules.titleMax));
	}, [rules, value]);
	if (!rules || value === null) return null;

	const n = Number(value);
	const error = !/^\d+$/.test(value.trim()) || n < 40 || n > 90 ? "Between 40 and 90 characters" : undefined;
	const dirty = !error && n !== rules.titleMax;

	return (
		<Card className="flex flex-col gap-4">
			<CardHeader icon="TextAa" title="SEO rules" meta={`Title up to ${rules.titleMax} characters${rules.isDefault ? " · default" : ""}`} />
			<div className="flex items-end gap-3">
				<TextField label="SEO title limit (characters)" value={value} onChange={setValue} error={error} hint="Google shows about 60; up to 70 is common" disabled={!allowed || busy} className="max-w-56" inputMode="numeric" />
				<Button
					variant="primary"
					size="sm"
					loading={busy}
					disabled={!allowed || !dirty}
					onClick={async () => {
						if (!siteId) return;
						setBusy(true);
						const r = (await save({ siteId, titleMax: n })) as { ok: boolean; reason?: string };
						setBusy(false);
						toast(r.ok ? { text: `SEO title limit set to ${n} characters`, tone: "agent" } : { text: r.reason ?? "Couldn't save", tone: "block" });
					}}
				>
					Save
				</Button>
			</div>
			<LockLine perm="publishing.set" />
			<SourceNote icon="Info">The title check, the agent's fixes and the writer follow this limit. A post over it can still be approved: override the check on the post with a reason (it's logged and listed in the merge request).</SourceNote>
		</Card>
	);
}

/** The site's SEO title limit for counters on screen (60 until loaded, and on the local demo store). */
export function useTitleMax(): number {
	const { slug } = useSite();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, SITE_ON_CONVEX && isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const rules = useQuery(api.billing.seoRules, siteId ? { siteId } : "skip");
	return rules?.titleMax ?? 60;
}

export function SeoRulesSettings() {
	if (!SITE_ON_CONVEX) return null;
	return <Live />;
}
