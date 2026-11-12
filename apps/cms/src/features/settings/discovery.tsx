"use client";
// Settings · Site discovery (prd-site-discovery F1, F6, F17, SD5): run on add, page limit, depth, excluded paths,
// subdomains, the competitor check and the first batch size. Admin only; everyone else sees the values and the reason.
import { useState } from "react";
import { Button, Callout, Card, CardHeader, SourceNote, TextArea, TextField, Toggle } from "@/ds";
import { useDiscovery } from "@/features/discovery/data";
import { crawlEstimate } from "@/features/discovery/parts";
import { useSiteCms } from "@/features/shared/site-source";
import { DISCOVERY_DEFAULTS, DISCOVERY_MAX_PAGES_CAP, discoveryBatchSize } from "@/lib/logic";
import { useToast } from "@/lib/store";
import { LockLine } from "./shared";

export function DiscoverySettings() {
	const d = useDiscovery();
	const { site, can } = useSiteCms();
	const toast = useToast();
	const current = d.data?.settings ?? DISCOVERY_DEFAULTS;
	const [s, setS] = useState(current);
	const [exclude, setExclude] = useState(current.exclude.join("\n"));
	const [maxPages, setMaxPages] = useState(String(current.maxPages));
	const [depth, setDepth] = useState(String(current.depth));
	const [batch, setBatch] = useState(String(current.batchSize));
	const [saving, setSaving] = useState(false);
	const allowed = can("discovery.configure");
	const pages = Number(maxPages);
	const pagesError = !Number.isInteger(pages) || pages < 5 || pages > DISCOVERY_MAX_PAGES_CAP ? `5 to ${DISCOVERY_MAX_PAGES_CAP} pages` : undefined;
	const depthError = !/^[1-6]$/.test(depth) ? "1 to 6 folders" : undefined;
	const batchError = !/^\d+$/.test(batch) || Number(batch) > 40 ? "0 to 40" : undefined;
	const save = async () => {
		setSaving(true);
		const r = await d.setSettings({ ...s, maxPages: pages, depth: Number(depth), batchSize: Number(batch), exclude: exclude.split("\n").map((x) => x.trim()).filter(Boolean) });
		setSaving(false);
		toast(r.ok ? { text: "Discovery settings saved", tone: "pass" } : { text: r.reason, tone: "block" });
	};
	return (
		<Card className="flex flex-col gap-4">
			<CardHeader icon="TreeStructure" title="Site discovery" meta={`${site.domain} · reads up to ${current.maxPages} pages`} />
			{d.demo && <Callout tone="info" icon="Info" title="Demo data · changes aren't saved without the backend" />}
			<Toggle checked={s.onAdd} onChange={(on) => setS({ ...s, onAdd: on })} disabled={!allowed} label="Run when a site is added" caption="Reads the site straight after it's added and proposes pillars, keywords and a first batch of ideas." />
			<div className="grid gap-3 md:grid-cols-3">
				<TextField label="Page limit" value={maxPages} onChange={setMaxPages} disabled={!allowed} error={pagesError} hint={pagesError ? undefined : `About ${crawlEstimate(pages || 0)} to read`} inputMode="numeric" />
				<TextField label="Folder depth" value={depth} onChange={setDepth} disabled={!allowed} error={depthError} hint="How deep below the home page" inputMode="numeric" />
				<TextField label="First batch of ideas" value={batch} onChange={setBatch} disabled={!allowed} error={batchError} hint={`0 = four weeks at your cadence (${discoveryBatchSize(site, { batchSize: 0 })} now)`} inputMode="numeric" />
			</div>
			<TextArea label="Skip paths (one per line)" value={exclude} onChange={setExclude} disabled={!allowed} rows={4} hint="A path prefix, or ? to skip URLs with query strings." />
			<Toggle checked={s.subdomains} onChange={(on) => setS({ ...s, subdomains: on })} disabled={!allowed} label="Include subdomains" caption="Off: only pages on the site's own host." />
			<Toggle checked={s.competitorCheck} onChange={(on) => setS({ ...s, competitorCheck: on })} disabled={!allowed} label="Check who ranks" caption="Searches the top keywords to judge difficulty from the sites that rank. About $0.01 per 10 keywords." />
			<div className="flex flex-wrap items-center gap-2">
				<LockLine perm="discovery.configure" />
				<div className="flex-1" />
				<Button variant="primary" icon="Check" loading={saving} disabled={!allowed || !!pagesError || !!depthError || !!batchError} onClick={save}>
					Save
				</Button>
			</div>
			<SourceNote icon="ShieldCheck">Discovery follows robots.txt, skips cart, checkout and account pages, and strips emails and phone numbers before anything reaches a model.</SourceNote>
		</Card>
	);
}
