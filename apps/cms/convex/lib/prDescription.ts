// MR description (handoff 06 step 3): keyword, intent, gate result, internal links, schema, unresolved overrides, the
// autopost note and the write scope. Same fields and wording as the prototype's MR (store.tsx).
import { AUTOPOST_ACTOR } from "../../src/lib/logic";

const cap1 = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export interface IPrDescription {
	keyword: string;
	intent: string;
	checks: { checkId: string; status: string; value: string }[];
	overrides: string[];
	autopost: boolean;
	contentDir: string;
	assetDir: string;
	baseBranch: string;
	manifestVersion?: number;
	metaDescription?: string;
}

export function prDescription(d: IPrDescription): string {
	const passed = d.checks.filter((c) => c.status === "pass").length;
	const schema = d.checks.find((c) => c.checkId === "schema")?.value ?? "Article";
	const links = d.checks.find((c) => c.checkId === "internal-links")?.value.replace(" · soft", "") ?? "—";
	return [
		`**Keyword** ${d.keyword}  `,
		`**Intent** ${cap1(d.intent)}  `,
		`**On-page** ${passed} / ${d.checks.length}${d.overrides.length ? ` · ${d.overrides.length} override${d.overrides.length > 1 ? "s" : ""}` : ""}  `,
		`**Internal links** ${links}  `,
		`**Schema** ${schema}`,
		d.metaDescription ? `**Meta description** ${d.metaDescription}` : "",
		d.manifestVersion ? `**Template** manifest v${d.manifestVersion}` : "",
		d.autopost ? `**Shipped by** ${AUTOPOST_ACTOR} · no human review (site autopost is on)` : "",
		d.overrides.length ? `\n**Unresolved (soft gate overridden)**\n${d.overrides.map((o) => `- ${o}`).join("\n")}` : "",
		`\nWrites only to \`${d.contentDir}\` and \`${d.assetDir}\`. Never pushes to ${d.baseBranch}. CI runs the repo's own checks.`,
		"\n<sub>Opened by the Agentic CMS. Edits to this branch from outside the CMS are overwritten on the next ship.</sub>",
	]
		.filter(Boolean)
		.join("\n");
}
