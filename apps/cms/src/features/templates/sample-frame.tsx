"use client";
// Confirm step, real upload: the uploaded sample post rendered in a sandboxed iframe (site CSS via <base>),
// with the parse result drawn over the site's own elements — region dashed agent-blue, detected structures
// ink, unclassified items amber until the developer maps them.
import { useEffect, useMemo, useState } from "react";
import type { ISourceHighlight } from "@/ds";
import type { ITemplateManifest, ITemplateMapping } from "@/lib/types";
import { SiteFrame } from "@/features/preview/SiteFrame";
import { browserParse } from "@/features/preview/source";
import { stripUnsafe } from "@/render";

const HIGHLIGHT_ROLES: ITemplateMapping["role"][] = ["content-region", "heading", "list", "quote", "image", "table", "unclassified"];

/** Highlight label + tone per mapping (first match only), outer region first. */
function highlightsOf(m: ITemplateManifest): { selector: string; label: string; tone: "agent" | "ink" | "human" }[] {
	const rows = m.mappings.filter((x) => x.status !== "absent" && HIGHLIGHT_ROLES.includes(x.role) && x.detail !== "Paragraphs" && x.detail !== "Body wrapper");
	return rows.map((x) => {
		const hand = !!(x.options?.length || x.label || x.role === "unclassified");
		const selector = x.selector.replace(/\s*>\s*img(\[[^\]]*\])?$/, "").replace(/\s*>\s*code$/, "");
		if (x.detail === "Content region") return { selector, label: `content region · ${x.selector}`, tone: "agent" as const };
		if (hand) return { selector, label: x.status === "needs-you" ? `${x.selector} · unclassified` : `${x.selector} · ${x.label ?? "mapped"}`, tone: x.status === "needs-you" ? ("human" as const) : ("ink" as const) };
		return { selector, label: x.selector, tone: "ink" as const };
	});
}

/** Source-view highlights for SourceCodeFrame (line needles), derived from the real mappings. */
export function realSourceHighlights(m: ITemplateManifest): ISourceHighlight[] {
	return highlightsOf(m).map((h) => ({ selector: h.selector, label: h.tone === "agent" ? "content region" : h.label.split(" · ")[1] ?? h.label, tone: h.tone }));
}

function tokenColors() {
	const cs = getComputedStyle(document.documentElement);
	const v = (n: string) => cs.getPropertyValue(n).trim() || "currentColor";
	return { agent: v("--c-agent"), human: v("--c-human"), humanSoft: v("--c-human-soft"), ink: v("--c-ink"), onInk: v("--c-on-ink") };
}

export function highlightedSampleHtml(m: ITemplateManifest, html: string, baseHref: string | null): string {
	const doc = browserParse(html);
	stripUnsafe(doc);
	const seen = new Set<Element>();
	for (const h of highlightsOf(m)) {
		let el: Element | null = null;
		try {
			el = doc.querySelector(h.selector);
		} catch {
			continue;
		}
		if (!el || seen.has(el)) continue;
		seen.add(el);
		el.setAttribute("data-cms-hl", h.label);
		el.setAttribute("data-cms-tone", h.tone);
	}
	const c = tokenColors();
	const style = doc.createElement("style");
	style.textContent = `
:root{--cms-agent:${c.agent};--cms-human:${c.human};--cms-human-soft:${c.humanSoft};--cms-ink:${c.ink};--cms-on-ink:${c.onInk}}
[data-cms-hl]{position:relative;outline:2px solid var(--cms-ink);outline-offset:4px;border-radius:2px}
[data-cms-tone=agent]{outline:2px dashed var(--cms-agent);outline-offset:10px}
[data-cms-tone=human]{outline-color:var(--cms-human);background-color:var(--cms-human-soft)}
[data-cms-hl]::before{content:attr(data-cms-hl);position:absolute;z-index:50;inset-block-start:-18px;inset-inline-end:6px;padding:2px 8px;border-radius:6px;font:500 15px/1.4 ui-monospace,Menlo,monospace;letter-spacing:0;text-transform:none;background:var(--cms-ink);color:var(--cms-on-ink);white-space:nowrap;pointer-events:none}
[data-cms-tone=agent]::before{background:var(--cms-agent);inset-block-start:-28px;inset-inline-end:auto;inset-inline-start:0}
[data-cms-tone=human]::before{background:var(--cms-human)}
img[data-cms-hl]::before{display:none}`;
	doc.head?.appendChild(style);
	if (baseHref && doc.head) {
		const base = doc.createElement("base");
		base.setAttribute("href", baseHref);
		doc.head.insertBefore(base, doc.head.firstChild);
	}
	return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export function SampleFrame({ manifest, html, baseHref, className }: { manifest: ITemplateManifest; html: string; baseHref: string | null; className?: string }) {
	const [ready, setReady] = useState(false);
	useEffect(() => setReady(true), []);
	const doc = useMemo(() => (ready ? highlightedSampleHtml(manifest, html, baseHref) : ""), [ready, manifest, html, baseHref]);
	if (!doc) return null;
	return <SiteFrame html={doc} width={1024} title={`Uploaded sample post with manifest v${manifest.version} highlights`} className={className} />;
}
