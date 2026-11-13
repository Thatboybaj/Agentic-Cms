"use client";
// Settings · Publishing · Language versions (every site, off by default). Turn the Arabic version on or off, pick the
// agent (Fanar or Qwen through AI Gateway), and say where the language template and its pages live in the repo.
// With it on, every post that ships (new, "Update live post", refresh) carries its Arabic page in the same merge request.
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Button, Callout, Card, CardHeader, Select, SourceNote, TextArea, TextField, Toggle } from "@/ds";
import { SITE_ON_CONVEX, useSiteCms } from "@/features/shared/site-source";
import { useSite, useToast } from "@/lib/store";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { LockLine } from "./shared";

type TAgent = "fanar" | "gateway";
interface ILang {
	lang: string;
	enabled: boolean;
	agent: TAgent;
	templatePath: string;
	contentDir: string;
	linkPrefix: string;
	styleGuide?: string;
}

const AGENTS = [
	{ value: "fanar" as const, label: "Fanar (QCRI, Arabic-first)", hint: "Falls back to Qwen when Fanar can't be reached" },
	{ value: "gateway" as const, label: "Qwen via AI Gateway", hint: "The same models as the other agents" },
];

const arDefaults = (contentDir: string | null): ILang => {
	const main = (contentDir ?? "content/blog").replace(/^\/+|\/+$/g, "");
	const parts = main.split("/");
	const blog = parts.pop() ?? "blog";
	return { lang: "ar", enabled: false, agent: "fanar", templatePath: "templates/blog/article-ar.html", contentDir: [...parts, "ar", blog].join("/"), linkPrefix: "/ar" };
};

function Live() {
	const { slug } = useSite();
	const { can } = useSiteCms();
	const toast = useToast();
	const { isAuthenticated } = useConvexAuth();
	const resolved = useQuery(api.sites.bySlug, isAuthenticated ? { slug } : "skip");
	const siteId = resolved?.status === "ok" ? (resolved.site._id as Id<"sites">) : undefined;
	const data = useQuery(api.translations.settings, siteId ? { siteId } : "skip");
	const save = useMutation(api.translations.setLanguage);
	const [form, setForm] = useState<ILang | null>(null);
	const [busy, setBusy] = useState(false);
	const allowed = can("publishing.set");

	useEffect(() => {
		if (!data || form) return;
		const ar = data.languages.find((l) => l.lang === "ar");
		setForm(ar ? { ...ar } : arDefaults(data.contentDir));
	}, [data, form]);

	if (!data || !form) return null;
	const saved = data.languages.find((l) => l.lang === "ar");
	const dirty = JSON.stringify({ ...form, styleGuide: form.styleGuide?.trim() || undefined }) !== JSON.stringify(saved ? { ...saved, styleGuide: saved.styleGuide || undefined } : arDefaults(data.contentDir));
	const keyMissing = form.agent === "fanar" ? !data.keys.fanar : !data.keys.gateway;

	const submit = async (next: ILang) => {
		if (!siteId) return;
		setBusy(true);
		const r = (await save({ siteId, language: { ...next, ...(next.styleGuide?.trim() ? { styleGuide: next.styleGuide } : {}) } })) as { ok: boolean; reason?: string };
		setBusy(false);
		if (r.ok) {
			setForm(next);
			toast({ text: next.enabled ? "Arabic version on · it ships with each post" : "Arabic version off", tone: "agent" });
		} else toast({ text: r.reason ?? "Couldn't save", tone: "block" });
	};

	return (
		<Card className="flex flex-col gap-4">
			<CardHeader icon="Globe" title="Language versions" meta={saved?.enabled ? `Arabic on · ${saved.agent === "fanar" ? "Fanar" : "Qwen"}` : "Main language only"} />
			<div className="flex flex-col gap-2">
				<Toggle
					checked={form.enabled}
					onChange={(on) => void submit({ ...form, enabled: on })}
					disabled={!allowed || busy}
					label="Arabic version"
					caption={
						form.enabled
							? "On: each post that ships gets an Arabic page in the same merge request, written in the site's own Arabic wording and checked (links, numbers, lists) before it goes out. An Arabic page that fails the checks waits; the main post still ships."
							: "Off: posts ship in the main language only. Turn it on for sites with an Arabic side."
					}
				/>
				<LockLine perm="publishing.set" />
			</div>

			<div className="grid gap-3 sm:grid-cols-2">
				<Select label="Agent" value={form.agent} options={AGENTS} onChange={(agent) => setForm({ ...form, agent })} disabled={!allowed} />
				<TextField label="URL prefix of the Arabic pages" value={form.linkPrefix} onChange={(linkPrefix) => setForm({ ...form, linkPrefix })} hint="Links move to the Arabic page when it exists" disabled={!allowed} />
				<TextField label="Arabic article template (repo path)" value={form.templatePath} onChange={(templatePath) => setForm({ ...form, templatePath })} disabled={!allowed} />
				<TextField label="Folder for Arabic posts" value={form.contentDir} onChange={(contentDir) => setForm({ ...form, contentDir })} disabled={!allowed} />
			</div>
			<TextArea
				label="Arabic wording rules"
				rows={6}
				value={form.styleGuide ?? ""}
				onChange={(styleGuide) => setForm({ ...form, styleGuide })}
				placeholder={"E.g. Modern Standard Arabic, no dialect. Brand name in Arabic text: …\nFixed translations: Book a consultation → احجز استشارة"}
				hint="The site's brand terms and fixed translations. The agent reuses them word for word."
				disabled={!allowed}
			/>
			{keyMissing && (
				<Callout tone="human" icon="Key" title={form.agent === "fanar" ? "Fanar isn't connected" : "AI Gateway isn't connected"}>
					Add {form.agent === "fanar" ? "FANAR_API_KEY" : "AI_GATEWAY_API_KEY"} in the Convex dashboard (Settings → Environment Variables) before turning this on.
				</Callout>
			)}
			<div className="flex items-center justify-between gap-3">
				<SourceNote icon="Info">Existing live posts get their Arabic page the next time they ship, e.g. with “Update live post”.</SourceNote>
				<Button variant="primary" size="sm" loading={busy} disabled={!allowed || !dirty} onClick={() => void submit(form)}>
					Save
				</Button>
			</div>
		</Card>
	);
}

export function LanguageSettings() {
	if (!SITE_ON_CONVEX) return null;
	return <Live />;
}
