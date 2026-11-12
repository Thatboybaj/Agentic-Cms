"use client";
// Settings · Connections (C12/C13) — image-generation MCP servers, image APIs, web image sources and the optional
// diagram model the visual-asset agent routes to. Keys are held server-side (src/server/connections.ts), sent once,
// shown afterwards only as a hint (••••a1b2), and never placed in prompts. Admin + developer edit; others read.
import { useEffect, useMemo, useState } from "react";
import {
	Button,
	Callout,
	Card,
	CardHeader,
	Checkbox,
	Chip,
	DataGap,
	Dialog,
	Icon,
	IconButton,
	RoleGate,
	SegmentedControl,
	Select,
	Sheet,
	Skeleton,
	SourceNote,
	TextField,
	Toggle,
	formatRelative,
	useToast,
	type ISelectOption,
	type TIconName,
} from "@/ds";
import { ROLE_LABEL } from "@/lib/logic";
import { useSiteCms } from "@/features/shared/site-source";
import type { TRole } from "@/lib/types";
import { useSiteConnections as useConnections, type IUseConnections } from "../connections/api";
import {
	KIND_GROUPS,
	PROVIDERS,
	ROUTING_REMINDER,
	USED_FOR_LABEL,
	USED_FOR_ORDER,
	type IConnection,
	type TConnectionKind,
	type TConnectionProvider,
	type TMcpTransport,
	type TUsedFor,
} from "../connections/catalog";
import { sitePath } from "@/lib/routes";

/** Who may add, edit, test and remove connections. Enforced server-side before deployment (see app/api/connections). */
export const CONNECTION_EDIT_ROLES: TRole[] = ["admin", "developer"];

const PROVIDER_ICON: Record<TConnectionProvider, TIconName> = {
	"higgsfield-mcp": "Sparkle",
	"custom-mcp": "Plugs",
	"openai-images": "Image",
	"gateway-images": "Image",
	replicate: "Stack",
	fal: "Lightning",
	openverse: "Globe",
	wikimedia: "Images",
	unsplash: "ImagesSquare",
	pexels: "Image",
	qwen: "TreeStructure",
};

const MODEL_PLACEHOLDER = "e.g. the model id from your provider's docs";

const EMPTY_GAP: Record<TConnectionKind, { label: string; reason: string }> = {
	mcp: { label: "No image MCP server connected", reason: "Brand-imagery slots wait on a person until Higgsfield or another MCP server is connected." },
	"image-api": { label: "No image API connected", reason: "Text-in-image and volume slots wait on a person until an image API is connected." },
	"web-source": { label: "No web image source connected", reason: "Real-world and stock slots can't be sourced with a recorded license until a source is connected." },
	llm: { label: "No diagram model", reason: "Without it diagrams are rendered from templates." },
};

const useEditGate = () => {
	const { role } = useSiteCms();
	const canEdit = CONNECTION_EDIT_ROLES.includes(role);
	const reason = `Your role (${ROLE_LABEL[role]}) can't change connections. Admins and developers can.`;
	return { role, canEdit, reason };
};

// ---- Panel -----------------------------------------------------------------------

export function ConnectionsSettings() {
	const { site } = useSiteCms();
	const { role, canEdit, reason } = useEditGate();
	const conns = useConnections(site.id);
	const [sheet, setSheet] = useState<{ open: boolean; n: number; provider?: TConnectionProvider; editing?: IConnection }>({ open: false, n: 0 });
	const openSheet = (provider?: TConnectionProvider, editing?: IConnection) => setSheet((s) => ({ open: true, n: s.n + 1, provider, editing }));

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
				<p className="min-w-0 flex-1 text-sm text-ink-3">
					Where the visual-asset agent generates, draws or sources images for {site.name}. Keys stay on the server and are never shown again or put in prompts.
				</p>
				<RoleGate role={role} allow={CONNECTION_EDIT_ROLES} action="add connections">
					<Button variant="primary" icon="Plus" onClick={() => openSheet()}>
						Add connection
					</Button>
				</RoleGate>
			</div>

			{!canEdit && (
				<Callout tone="neutral" icon="LockSimple" title="Connections are read-only for your role.">
					{reason} You can read everything here.
				</Callout>
			)}
			{conns.storage && !conns.storage.encrypted && (
				<Callout tone="neutral" icon="Warning" title="Local dev storage — set CMS_SECRET_KEY to encrypt at rest">
					Keys are saved unencrypted in apps/cms/.data/secrets.json on this machine. Set CMS_SECRET_KEY on the server before entering production keys.
					{conns.storage.lockedSecrets > 0 && ` ${conns.storage.lockedSecrets} saved key(s) were encrypted with a key this server doesn't have.`}
				</Callout>
			)}
			<Callout tone="info" icon="TreeStructure" title="How images are routed">
				{ROUTING_REMINDER}
			</Callout>

			{conns.error && !conns.loading && (
				<Callout
					tone="block"
					title="Couldn't load connections"
					action={
						<Button variant="secondary" size="sm" icon="ArrowClockwise" onClick={() => void conns.refresh()}>
							Retry
						</Button>
					}
				>
					{conns.error}
				</Callout>
			)}

			<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
				{KIND_GROUPS.map((g) => (
					<GroupCard
						key={g.kind}
						group={g}
						conns={conns}
						canEdit={canEdit}
						role={role}
						onAdd={() => openSheet(g.providers[0])}
						onEdit={(c) => openSheet(c.provider, c)}
					/>
				))}
			</div>

			<ConnectionSheet
				key={sheet.n}
				open={sheet.open}
				initialProvider={sheet.provider}
				editing={sheet.editing}
				conns={conns}
				onClose={() => setSheet((s) => ({ ...s, open: false }))}
			/>
		</div>
	);
}

// ---- Group card ------------------------------------------------------------------

function GroupCard({ group, conns, canEdit, role, onAdd, onEdit }: { group: (typeof KIND_GROUPS)[number]; conns: IUseConnections; canEdit: boolean; role: TRole; onAdd: () => void; onEdit: (c: IConnection) => void }) {
	const rows = conns.connections.filter((c) => c.kind === group.kind);
	const ok = rows.filter((c) => c.enabled && c.status === "ok").length;
	return (
		<Card className={group.kind === "llm" ? "flex flex-col gap-3 lg:col-span-2" : "flex flex-col gap-3"}>
			<CardHeader
				icon={group.icon}
				title={group.title}
				meta={conns.loading ? group.meta : rows.length ? `${ok} of ${rows.length} ready` : group.meta}
				action={
					<RoleGate role={role} allow={CONNECTION_EDIT_ROLES} action="add connections">
						<Button variant="secondary" size="sm" icon="Plus" onClick={onAdd} aria-label={`Add to ${group.title}`}>
							Add
						</Button>
					</RoleGate>
				}
			/>
			{conns.loading ? (
				<div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading connections">
					<Skeleton className="h-16 w-full" />
				</div>
			) : rows.length === 0 ? (
				<DataGap label={EMPTY_GAP[group.kind].label} reason={group.kind === "llm" ? `Optional. ${EMPTY_GAP.llm.reason}` : EMPTY_GAP[group.kind].reason} />
			) : (
				<ul className="flex flex-col">
					{rows.map((c) => (
						<ConnectionRow key={c.id} c={c} conns={conns} canEdit={canEdit} role={role} onEdit={() => onEdit(c)} />
					))}
				</ul>
			)}
			{group.kind === "llm" && rows.length > 0 && <p className="text-xs text-ink-3">Optional. Without it diagrams are rendered from templates.</p>}
		</Card>
	);
}

// ---- Row ---------------------------------------------------------------------------

function StatusChip({ c }: { c: IConnection }) {
	if (c.status === "ok")
		return (
			<Chip tone="pass" size="sm" icon="CheckCircle">
				Connected
			</Chip>
		);
	if (c.status === "failed")
		return (
			<Chip tone="block" size="sm" icon="WarningCircle">
				Failed
			</Chip>
		);
	return (
		<Chip tone="neutral" size="sm">
			Not tested
		</Chip>
	);
}

function endpointOf(c: IConnection): string | null {
	if (c.kind !== "mcp") return null;
	if (c.transport === "stdio") return [c.command, ...(c.args ?? [])].filter(Boolean).join(" ");
	return c.url ?? null;
}

function ConnectionRow({ c, conns, canEdit, role, onEdit }: { c: IConnection; conns: IUseConnections; canEdit: boolean; role: TRole; onEdit: () => void }) {
	const { toast } = useToast();
	const spec = PROVIDERS[c.provider];
	const testing = conns.testing.has(c.id);
	const [model, setModel] = useState(c.model ?? "");
	const [confirm, setConfirm] = useState(false);
	const [busy, setBusy] = useState(false);
	useEffect(() => setModel(c.model ?? ""), [c.model]);
	const endpoint = endpointOf(c);
	const needsKey = spec.secret === "required" && !c.hasSecret;

	const patch = async (input: Partial<Pick<IConnection, "enabled" | "toolName" | "model">>, what: string) => {
		try {
			await conns.save({ id: c.id, siteId: c.siteId, provider: c.provider, ...input });
		} catch (e) {
			toast({ title: `Couldn't ${what}`, body: (e as Error).message, tone: "block" });
		}
	};

	const runTest = async () => {
		try {
			const r = await conns.test(c.id);
			toast(r.status === "ok" ? { title: `${r.label} is connected`, body: r.statusNote, tone: "pass" } : { title: `${r.label} failed its test`, body: r.lastError, tone: "block" });
		} catch (e) {
			toast({ title: "Test didn't run", body: (e as Error).message, tone: "block" });
		}
	};

	const remove = async () => {
		setBusy(true);
		try {
			await conns.remove(c.id);
			setConfirm(false);
			toast({ title: `${c.label} removed`, body: c.hasSecret ? "Its saved key was deleted from the server." : undefined });
		} catch (e) {
			toast({ title: "Couldn't remove it", body: (e as Error).message, tone: "block" });
		} finally {
			setBusy(false);
		}
	};

	const toolOptions: ISelectOption<string>[] = (c.tools ?? []).map((t) => ({ value: t.name, label: t.name, hint: t.description?.slice(0, 60) }));
	const modelDirty = model.trim() !== (c.model ?? "");

	return (
		<li className="flex flex-col gap-2.5 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
			<div className="flex items-start gap-3">
				<span className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-ink">
					<Icon name={PROVIDER_ICON[c.provider]} size={17} />
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span className="truncate font-display text-md">{c.label}</span>
						<StatusChip c={c} />
						{!c.enabled && (
							<Chip tone="neutral" size="sm">
								Off
							</Chip>
						)}
					</span>
					<span className="truncate text-xs text-ink-3">{spec.blurb}</span>
				</span>
				<Toggle
					hideLabel
					label={`Use ${c.label}`}
					checked={c.enabled}
					disabled={!canEdit}
					onChange={(on) => void patch({ enabled: on }, on ? "turn it on" : "turn it off")}
				/>
			</div>

			{c.status === "failed" && c.lastError && (
				<p role="status" className="flex items-start gap-1.5 text-sm text-block-ink">
					<Icon name="WarningCircle" size={14} className="mt-0.5 shrink-0" />
					<span className="min-w-0">{c.lastError}</span>
				</p>
			)}
			{needsKey && c.status !== "failed" && (
				<p className="flex items-center gap-1.5 text-sm text-ink-3">
					<Icon name="Key" size={14} />
					Add a key to use it — edit the connection.
				</p>
			)}

			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-xs text-ink-3">Used for</span>
				{c.usedFor.length ? (
					c.usedFor.map((u) => (
						<Chip key={u} size="sm">
							{USED_FOR_LABEL[u]}
						</Chip>
					))
				) : (
					<span className="text-xs text-ink-3">nothing yet</span>
				)}
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
				{endpoint && <span className="max-w-full truncate font-mono">{endpoint}</span>}
				{spec.secret !== "none" && (
					<span className="inline-flex items-center gap-1">
						<Icon name="Key" size={12} />
						{c.hasSecret ? <span className="font-mono">{c.secretHint ?? "••••"}</span> : spec.secret === "required" ? "No key" : "No key (optional)"}
					</span>
				)}
				{c.lastTestedAt ? (
					<span>
						Tested {formatRelative(c.lastTestedAt, Date.now())}
						{c.status === "ok" && c.statusNote ? ` · ${c.statusNote}` : ""}
					</span>
				) : (
					<span>Never tested</span>
				)}
			</div>

			{c.kind === "mcp" && (
				<Select<string>
					label="Image tool"
					icon="Sparkle"
					value={c.toolName ?? null}
					options={toolOptions}
					placeholder={toolOptions.length ? "Choose the image-generation tool" : "Test the connection to load its tools"}
					disabled={!canEdit || !toolOptions.length}
					onChange={(v) => void patch({ toolName: v }, "set the tool")}
				/>
			)}
			{spec.model && (
				<form
					className="flex items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						if (modelDirty) void patch({ model: model.trim() }, "save the model");
					}}
				>
					<TextField className="min-w-0 flex-1" label="Model" icon="Robot" value={model} onChange={setModel} placeholder={MODEL_PLACEHOLDER} disabled={!canEdit} autoComplete="off" spellCheck={false} />
					{modelDirty && canEdit && (
						<Button type="submit" variant="secondary" icon="Check">
							Save
						</Button>
					)}
				</form>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<RoleGate role={role} allow={CONNECTION_EDIT_ROLES} action="test connections">
					<Button variant="secondary" size="sm" icon="PlugsConnected" loading={testing} onClick={() => void runTest()}>
						{testing ? "Testing…" : "Test"}
					</Button>
				</RoleGate>
				<RoleGate role={role} allow={CONNECTION_EDIT_ROLES} action="edit connections">
					<Button variant="ghost" size="sm" icon="PencilSimple" onClick={onEdit}>
						Edit
					</Button>
				</RoleGate>
				<RoleGate role={role} allow={CONNECTION_EDIT_ROLES} action="remove connections">
					<IconButton icon="Trash" label={`Remove ${c.label}`} variant="ghost" size="sm" className="ms-auto" onClick={() => setConfirm(true)} />
				</RoleGate>
			</div>

			<Dialog
				open={confirm}
				onClose={() => setConfirm(false)}
				title={`Remove ${c.label}?`}
				footer={
					<>
						<Button variant="ghost" onClick={() => setConfirm(false)}>
							Cancel
						</Button>
						<Button variant="danger" icon="Trash" loading={busy} onClick={() => void remove()}>
							Remove connection
						</Button>
					</>
				}
			>
				The visual-asset agent stops using it for this site right away.{c.hasSecret ? " Its saved key is deleted from the server." : ""} Slots routed to it fall back to the next connection for that slot type, or wait on a person.
			</Dialog>
		</li>
	);
}

// ---- Add / edit sheet ------------------------------------------------------------------

const PROVIDER_OPTIONS: ISelectOption<TConnectionProvider>[] = KIND_GROUPS.flatMap((g) => g.providers.map((p) => ({ value: p, label: PROVIDERS[p].label, hint: PROVIDERS[p].blurb })));

const TRANSPORT_OPTIONS: { value: TMcpTransport; label: string }[] = [
	{ value: "streamable-http", label: "Streamable HTTP" },
	{ value: "sse", label: "SSE" },
	{ value: "stdio", label: "Local (stdio)" },
];

interface IDraft {
	provider: TConnectionProvider;
	label: string;
	transport: TMcpTransport;
	url: string;
	command: string;
	args: string;
	model: string;
	usedFor: TUsedFor[];
	secret: string;
	clearSecret: boolean;
}

const draftFor = (provider: TConnectionProvider, c?: IConnection): IDraft => ({
	provider,
	label: c?.label ?? PROVIDERS[provider].label,
	transport: c?.transport ?? "streamable-http",
	url: c?.url ?? "",
	command: c?.command ?? "",
	args: (c?.args ?? []).join(" "),
	model: c?.model ?? "",
	usedFor: c?.usedFor ?? PROVIDERS[provider].defaultUsedFor,
	secret: "",
	clearSecret: false,
});

function ConnectionSheet({ open, onClose, initialProvider, editing, conns }: { open: boolean; onClose: () => void; initialProvider?: TConnectionProvider; editing?: IConnection; conns: IUseConnections }) {
	const { toast } = useToast();
	const { canEdit } = useEditGate();
	const [draft, setDraft] = useState<IDraft>(() => draftFor(initialProvider ?? "custom-mcp", editing));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const spec = PROVIDERS[draft.provider];
	const mcp = spec.kind === "mcp";
	const set = <K extends keyof IDraft>(k: K) => (v: IDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

	const pickProvider = (p: TConnectionProvider) => setDraft((d) => ({ ...draftFor(p), secret: d.secret }));

	const errors = useMemo(() => {
		const e: Partial<Record<"url" | "command" | "secret", string>> = {};
		if (mcp && draft.transport !== "stdio") {
			try {
				const u = new URL(draft.url.trim());
				if (u.protocol !== "https:" && u.protocol !== "http:") e.url = "Use an https:// URL";
			} catch {
				e.url = draft.url.trim() ? "Enter the full URL, starting with https://" : "Required";
			}
		}
		if (mcp && draft.transport === "stdio" && !draft.command.trim()) e.command = "Required";
		if (spec.secret === "required" && !editing?.hasSecret && !draft.secret.trim()) e.secret = "Required to test this provider";
		return e;
	}, [draft, mcp, spec.secret, editing?.hasSecret]);
	const valid = Object.keys(errors).length === 0;

	const submit = async () => {
		if (!valid || saving) return;
		setSaving(true);
		setError(null);
		const secret = draft.secret.trim() ? draft.secret.trim() : draft.clearSecret ? null : undefined;
		try {
			const saved = await conns.save(
				{
					id: editing?.id,
					siteId: editing?.siteId ?? "",
					provider: draft.provider,
					label: draft.label.trim() || spec.label,
					usedFor: draft.usedFor,
					...(mcp ? (draft.transport === "stdio" ? { transport: draft.transport, command: draft.command.trim(), args: draft.args.split(/\s+/).filter(Boolean) } : { transport: draft.transport, url: draft.url.trim() }) : {}),
					...(spec.model ? { model: draft.model.trim() } : {}),
				},
				secret,
			);
			setDraft((d) => ({ ...d, secret: "" })); // drop the secret from memory as soon as the server has it
			onClose();
			const tested = await conns.test(saved.id);
			toast(tested.status === "ok" ? { title: `${tested.label} is connected`, body: tested.statusNote, tone: "pass" } : { title: `${tested.label} saved, but its test failed`, body: tested.lastError, tone: "block" });
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const toggleUse = (u: TUsedFor) => (on: boolean) => set("usedFor")(on ? USED_FOR_ORDER.filter((x) => x === u || draft.usedFor.includes(x)) : draft.usedFor.filter((x) => x !== u));

	return (
		<Sheet
			open={open}
			onClose={onClose}
			title={editing ? `Edit ${editing.label}` : "Add connection"}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" icon="PlugsConnected" loading={saving} disabled={!valid || !canEdit} onClick={() => void submit()} title={valid ? undefined : "Fill the required fields first"}>
						Save & test
					</Button>
				</>
			}
		>
			<form
				className="flex flex-col gap-4"
				autoComplete="off"
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				{editing ? (
					<SourceNote icon={PROVIDER_ICON[draft.provider]}>
						{spec.label} · {spec.blurb}
					</SourceNote>
				) : (
					<Select<TConnectionProvider> label="Provider" value={draft.provider} options={PROVIDER_OPTIONS} onChange={pickProvider} icon={PROVIDER_ICON[draft.provider]} />
				)}
				<TextField label="Name" value={draft.label} onChange={set("label")} placeholder={spec.label} hint="How it appears in routing and provenance" />

				{mcp && (
					<div className="flex flex-col gap-1.5">
						<span className="text-sm text-ink-3">Transport</span>
						<SegmentedControl<TMcpTransport> label="Transport" size="sm" value={draft.transport} options={TRANSPORT_OPTIONS} onChange={set("transport")} />
					</div>
				)}
				{mcp && draft.transport !== "stdio" && (
					<TextField label="Server URL" icon="Link" inputMode="url" value={draft.url} onChange={set("url")} placeholder={spec.urlHint} error={draft.url ? errors.url : undefined} hint={draft.transport === "streamable-http" ? "Falls back to SSE automatically for older servers" : undefined} spellCheck={false} />
				)}
				{mcp && draft.transport === "stdio" && (
					<>
						<Callout tone="neutral" icon="Warning" title="Starts a process on the CMS server">
							Local servers only run when the server sets CMS_ALLOW_STDIO_MCP=1. Otherwise the test fails with that reason.
						</Callout>
						<TextField label="Command" icon="Code" value={draft.command} onChange={set("command")} placeholder="npx" error={draft.command ? undefined : errors.command} spellCheck={false} />
						<TextField label="Arguments" value={draft.args} onChange={set("args")} placeholder="-y your-mcp-server" hint="Space-separated" spellCheck={false} />
					</>
				)}

				{spec.secret !== "none" && (
					<div className="flex flex-col gap-2">
						<TextField
							label={`${spec.secretLabel ?? "Key"}${spec.secret === "optional" ? " (optional)" : ""}`}
							type="password"
							icon="Key"
							autoComplete="new-password"
							spellCheck={false}
							value={draft.secret}
							onChange={set("secret")}
							placeholder={editing?.hasSecret ? `Saved as ${editing.secretHint ?? "••••"} · leave blank to keep` : "Paste it here"}
							hint={mcp && draft.transport === "stdio" ? "Passed to the process as ENV_NAME=value" : spec.secretHint}
							error={draft.secret || editing?.hasSecret ? undefined : errors.secret}
						/>
						{editing?.hasSecret && spec.secret === "optional" && (
							<Checkbox checked={draft.clearSecret} onChange={set("clearSecret")} label="Remove the saved key" disabled={!!draft.secret.trim()} />
						)}
					</div>
				)}

				{spec.model && <TextField label="Model" icon="Robot" value={draft.model} onChange={set("model")} placeholder={MODEL_PLACEHOLDER} hint="Check the id against your provider's current docs" spellCheck={false} />}

				<fieldset className="flex flex-col gap-1">
					<legend className="mb-1 text-sm text-ink-3">Used for</legend>
					{USED_FOR_ORDER.map((u) => (
						<Checkbox key={u} checked={draft.usedFor.includes(u)} onChange={toggleUse(u)} label={USED_FOR_LABEL[u]} />
					))}
				</fieldset>

				{error && (
					<Callout tone="block" title="Not saved">
						{error}
					</Callout>
				)}
				<p className="text-xs leading-body text-ink-3">After saving, the key is only ever shown as its last four characters. It is never passed into model prompts.</p>
				<button type="submit" hidden aria-hidden tabIndex={-1} />
			</form>
		</Sheet>
	);
}

// ---- Compact summary (image pipeline) ------------------------------------------------------------

/** Compact "3 connected · 1 failed" with a link to Settings → Connections. Fetches on its own. */
export function ConnectionsSummary({ href: hrefProp, className }: { href?: string; className?: string }) {
	const { site } = useSiteCms();
	const href = hrefProp ?? sitePath(site.slug, "/settings?tab=connections");
	const { connections, loading, error } = useConnections(site.id);
	const enabled = connections.filter((c) => c.enabled);
	const ok = enabled.filter((c) => c.status === "ok").length;
	const failed = enabled.filter((c) => c.status === "failed").length;
	const untested = enabled.length - ok - failed;
	return (
		<div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
			<Icon name="Plugs" size={15} className="text-ink-3" />
			{loading ? (
				<Skeleton className="h-[22px] w-28" />
			) : error ? (
				<span className="text-xs text-ink-3">Connections unavailable</span>
			) : enabled.length === 0 ? (
				<span className="text-xs text-ink-3">No image connections</span>
			) : (
				<>
					<Chip tone="pass" size="sm">
						{ok} connected
					</Chip>
					{failed > 0 && (
						<Chip tone="block" size="sm">
							{failed} failed
						</Chip>
					)}
					{untested > 0 && <Chip size="sm">{untested} not tested</Chip>}
				</>
			)}
			<Button variant="ghost" size="sm" href={href} trailing={<Icon name="ArrowUpRight" size={13} />}>
				Connections
			</Button>
		</div>
	);
}
