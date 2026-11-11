"use client";
// "Add site" sheet: name, domain, industry → addSite → the new site's onboarding.

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Callout, Select, Sheet, TextField } from "@/ds";
import { WORKSPACE_ROUTES, sitePath } from "@/lib/routes";
import { PAGES_ON_CONVEX, usePageWorkspaceActions } from "./data";

const INDUSTRIES = ["Healthcare", "Legal", "Veterinary", "Fintech", "Physiotherapy", "Food & beverage", "Real estate", "Beauty & skincare", "SaaS", "Education", "Other"];

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export function AddSiteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const router = useRouter();
	const { addSite } = usePageWorkspaceActions();
	const [name, setName] = useState("");
	const [domain, setDomain] = useState("");
	const [industry, setIndustry] = useState<string | null>(null);
	const [tried, setTried] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!open) return;
		setName("");
		setDomain("");
		setIndustry(null);
		setTried(false);
		setError(null);
		setBusy(false);
	}, [open]);

	const cleanDomain = domain
		.trim()
		.replace(/^https?:\/\//, "")
		.replace(/\/.*$/, "")
		.toLowerCase();
	const nameErr = tried && name.trim().length < 2 ? "Give the site a name" : undefined;
	const domainErr = tried && !DOMAIN_RE.test(cleanDomain) ? "Use a domain like client.com (no https://)" : undefined;
	const industryErr = tried && !industry ? "Pick an industry — it seeds the keyword swarm" : undefined;

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setTried(true);
		if (name.trim().length < 2 || !DOMAIN_RE.test(cleanDomain) || !industry) return;
		setBusy(true);
		const r = await addSite({ name: name.trim(), domain: cleanDomain, industry });
		if (!r.ok) {
			setBusy(false);
			setError(r.reason);
			return;
		}
		onClose();
		// On Convex the site pages (onboarding included) aren't ported yet, so the new site shows up on /sites instead.
		router.push(PAGES_ON_CONVEX ? WORKSPACE_ROUTES.sites : sitePath(r.slug, "/onboarding"));
	};

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title="Add a client site"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" type="submit" form="add-site-form" loading={busy}>
						Add site and start onboarding
					</Button>
				</>
			}
		>
			<form id="add-site-form" onSubmit={submit} noValidate className="flex flex-col gap-4 pt-1">
				<p className="text-md text-ink-3">The site starts in Onboarding: connect its repo, template and Search Console next. Nothing is published until then.</p>
				<TextField label="Site name" value={name} onChange={setName} placeholder="Harbor Vets" error={nameErr} autoFocus />
				<TextField
					label="Domain"
					value={domain}
					onChange={setDomain}
					placeholder="harborvets.com"
					icon="Globe"
					error={domainErr}
					hint={!domainErr ? "The live site the merge requests will target" : undefined}
				/>
				<div className="flex flex-col gap-1.5">
					<Select label="Industry" value={industry} options={INDUSTRIES.map((i) => ({ value: i, label: i }))} onChange={setIndustry} placeholder="Choose an industry" />
					{industryErr && (
						<span role="alert" className="text-sm text-block-ink">
							{industryErr}
						</span>
					)}
				</div>
				{error && (
					<Callout tone="block" title="Couldn't add the site">
						{error}
					</Callout>
				)}
			</form>
		</Sheet>
	);
}
