"use client";
// Settings · Providers & budgets — monthly caps (admin), image routing per slot type, pin / human-only, provider list.
import { useState } from "react";
import { BudgetCard, Card, CardHeader, KeyValue, PROVIDER_LABEL, PROVIDER_ROUTE, Select, SourceNote, TextField, Toggle, type ISelectOption } from "@/ds";
import { fmtUsd } from "@/lib/logic";
import { SITE_ON_CONVEX, useSiteCms, useSiteStats } from "@/features/shared/site-source";
import { LiveSpendCard } from "./spend-live";
import type { ISiteData, TProvider, TSlotType } from "@/lib/types";
import { resetDay } from "../runs/run-plan";
import { LockLine, LockNote, SaveBar, sameRecord } from "./shared";

type TRouting = ISiteData["routing"];
type TPin = "none" | "higgsfield" | "openai" | "open-source";

const SLOT_ROWS: { type: TSlotType; label: string; hint: string }[] = [
	{ type: "hero", label: "Hero", hint: "Styled lead image" },
	{ type: "lifestyle", label: "Lifestyle", hint: "Inline scenes" },
	{ type: "diagram", label: "Diagram", hint: "Text-in-image, labelled" },
	{ type: "screenshot", label: "Screenshot", hint: "UI and product shots" },
	{ type: "photo", label: "Photo", hint: "Real clinic, team or place" },
	{ type: "chart", label: "Chart", hint: "Always inline SVG from data" },
];
const PINNABLE: TSlotType[] = ["hero", "lifestyle", "diagram", "screenshot"];
const HUMANABLE: TSlotType[] = [...PINNABLE, "photo"];
const DEFAULTS: TRouting = { hero: "higgsfield", lifestyle: "higgsfield", diagram: "openai", screenshot: "openai", chart: "inline-svg", photo: "human" };

const PROVIDER_OPTIONS: ISelectOption<TProvider>[] = (["higgsfield", "openai", "open-source", "human"] as TProvider[]).map((p) => ({ value: p, label: PROVIDER_LABEL[p], hint: PROVIDER_ROUTE[p] }));
const PIN_OPTIONS: ISelectOption<TPin>[] = [
	{ value: "none", label: "No pin · route per slot type" },
	{ value: "higgsfield", label: "Higgsfield", hint: "MCP" },
	{ value: "openai", label: "OpenAI", hint: "API" },
	{ value: "open-source", label: "Open-source", hint: "Flux via MCP" },
];

const isHumanOnly = (r: TRouting) => HUMANABLE.every((t) => r[t] === "human");
function pinOf(r: TRouting): TPin {
	if (isHumanOnly(r)) return "none";
	const first = r[PINNABLE[0]];
	return first !== "human" && first !== "inline-svg" && PINNABLE.every((t) => r[t] === first) ? (first as TPin) : "none";
}

const capError = (v: string) => (/^\d+(\.\d{1,2})?$/.test(v.trim()) ? undefined : "Enter a monthly cap in dollars, like 150");

export function ProvidersTab() {
	const { site, data, actions, can } = useSiteCms();
	const stats = useSiteStats();
	const admin = can("budget.set");
	const routeAdmin = can("routing.set");
	const savedCaps = { text: String(site.budgets.textCapUsd), image: String(site.budgets.imageCapUsd) };
	const [caps, setCaps] = useState(savedCaps);
	const [routing, setRouting] = useState<TRouting>(data.routing);
	const humanOnly = isHumanOnly(routing);
	const pin = pinOf(routing);
	const errors = { text: capError(caps.text), image: capError(caps.image) };
	const capsDirty = !sameRecord(caps, savedCaps);
	const routingDirty = !sameRecord(routing, data.routing);
	const valid = !errors.text && !errors.image;
	const reset = resetDay();

	const save = () => {
		if (Number(caps.text) !== site.budgets.textCapUsd) actions.setBudget("text", Number(caps.text));
		if (Number(caps.image) !== site.budgets.imageCapUsd) actions.setBudget("image", Number(caps.image));
		for (const t of Object.keys(routing) as TSlotType[]) if (routing[t] !== data.routing[t]) actions.setRouting(t, routing[t]);
	};

	const setHumanOnly = (on: boolean) => {
		if (on) setRouting((r) => ({ ...r, ...Object.fromEntries(HUMANABLE.map((t) => [t, "human"])) }));
		else setRouting((r) => ({ ...r, ...Object.fromEntries(HUMANABLE.map((t) => [t, isHumanOnly(data.routing) ? DEFAULTS[t] : data.routing[t]])) }));
	};
	const setPin = (p: TPin) => setRouting((r) => ({ ...r, ...Object.fromEntries(PINNABLE.map((t) => [t, p === "none" ? (data.routing[t] === "human" ? DEFAULTS[t] : data.routing[t]) : p])) }));

	const below = (k: "text" | "image") => {
		const n = Number(caps[k]);
		const spent = k === "text" ? site.budgets.textUsd : site.budgets.imageUsd;
		return !errors[k] && n < spent ? `Below this month's ${fmtUsd(spent)} spend · new ${k} runs are refused until ${reset}` : `Resets ${reset}`;
	};

	return (
		<div className="flex flex-col gap-4">
			<SaveBar perm="budget.set" dirty={(capsDirty || routingDirty) && valid} onSave={save} onDiscard={() => (setCaps(savedCaps), setRouting(data.routing))}>
				Runs above the cap are refused, not billed. Admins get an alert at 80%.
			</SaveBar>
			<LockNote perm="budget.set" title="Only an agency admin can change budgets and routing." />
			{SITE_ON_CONVEX && can("budget.set") && <LiveSpendCard />}
			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
				<div className="flex flex-col gap-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<BudgetCard label="Text generation" spent={stats.budgets.text.spent} cap={stats.budgets.text.cap} onEdit={admin ? () => document.getElementById("cap-text")?.focus() : undefined} />
						<BudgetCard label="Image generation" spent={stats.budgets.image.spent} cap={stats.budgets.image.cap} onEdit={admin ? () => document.getElementById("cap-image")?.focus() : undefined} />
					</div>
					<Card className="flex flex-col gap-4">
						<CardHeader icon="CurrencyDollar" title="Monthly caps" meta={`${site.name} · text and image separately`} />
						{admin ? (
							<div className="grid gap-3 sm:grid-cols-2">
								<TextField id="cap-text" label="Text cap" inputMode="decimal" value={caps.text} onChange={(v) => setCaps((c) => ({ ...c, text: v }))} icon="CurrencyDollar" suffix="/ month" error={errors.text} hint={below("text")} />
								<TextField id="cap-image" label="Image cap" inputMode="decimal" value={caps.image} onChange={(v) => setCaps((c) => ({ ...c, image: v }))} icon="CurrencyDollar" suffix="/ month" error={errors.image} hint={below("image")} />
							</div>
						) : (
							<>
								<KeyValue rows={[{ k: "Text cap", v: `${fmtUsd(site.budgets.textCapUsd)} / month` }, { k: "Image cap", v: `${fmtUsd(site.budgets.imageCapUsd)} / month` }]} />
								<LockLine perm="budget.set" />
							</>
						)}
						<SourceNote icon="Receipt">Spend from the run table · this month · resets {reset}</SourceNote>
					</Card>
				</div>
				<Card className="flex flex-col gap-3">
					<CardHeader icon="ImagesSquare" title="Image routing" meta="Per slot type · this client only" />
					<Toggle
						checked={humanOnly}
						onChange={setHumanOnly}
						disabled={!routeAdmin}
						label="Human-only images for this client"
						caption="Every generated slot becomes Human-only · waiting on you. Charts stay inline SVG."
					/>
					<Select<TPin> label="Pin one provider" value={pin} options={PIN_OPTIONS} onChange={setPin} disabled={!routeAdmin || humanOnly} icon="LockSimpleOpen" />
					<ul className="flex flex-col">
						{SLOT_ROWS.map((row) => {
							const chart = row.type === "chart";
							return (
								<li key={row.type} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2.5 last:border-b-0">
									<span className="flex min-w-[140px] flex-1 flex-col">
										<span className="font-display text-md">{row.label}</span>
										<span className="text-xs text-ink-3">{chart ? "Charts are never generated. They render as inline SVG." : row.hint}</span>
									</span>
									{chart ? (
										<span className="text-sm text-ink-3">{PROVIDER_LABEL["inline-svg"]} · {PROVIDER_ROUTE["inline-svg"]}</span>
									) : (
										<Select<TProvider>
											value={routing[row.type]}
											options={PROVIDER_OPTIONS}
											onChange={(p) => setRouting((r) => ({ ...r, [row.type]: p }))}
											disabled={!routeAdmin || humanOnly || (pin !== "none" && PINNABLE.includes(row.type))}
											align="end"
										/>
									)}
								</li>
							);
						})}
					</ul>
					<LockLine perm="routing.set" />
				</Card>
				<Card className="flex flex-col gap-3 lg:col-span-2">
					<CardHeader icon="Plugs" title="Providers" meta="Keys are per client" />
					<KeyValue
						rows={[
							{ k: "Higgsfield", v: "MCP · styled imagery, reference elements, video" },
							{ k: "OpenAI", v: <span>API · diagram and text-in-image generation · key <span className="font-mono text-xs">••••</span></span> },
							{ k: "Open-source", v: "Flux via MCP · volume and cost-sensitive generation" },
							{ k: "Slack or email", v: "Webhook · approval requests, blockers, report delivery" },
						]}
					/>
					<p className="text-xs leading-body text-ink-3">Provider keys and Git credentials are stored per client, encrypted at rest, never shown after entry and never passed into model prompts.</p>
				</Card>
			</div>
		</div>
	);
}
