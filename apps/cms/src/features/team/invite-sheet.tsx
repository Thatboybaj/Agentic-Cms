"use client";
// "Invite people": emails, workspace role, per-site roles → inviteUser for each address.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Callout, ROLE_LABEL, ROLE_SHORT, SegmentedControl, Select, Sheet, SiteAvatar, TextArea, WORKSPACE_ROLE_LABEL } from "@/ds";
import { useWorkspaceActions, useWorkspaceView } from "@/features/workspace/data";
import { plural } from "@/features/workspace/labels";
import type { TRole, TWorkspaceRole } from "@/lib/types";

type TCell = TRole | "none";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { workspace, sites, users } = useWorkspaceView();
	const { inviteUsers } = useWorkspaceActions();
	const [raw, setRaw] = useState("");
	const [wr, setWr] = useState<TWorkspaceRole>("member");
	const [roles, setRoles] = useState<Record<string, TCell>>({});
	const [tried, setTried] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setRaw("");
		setWr("member");
		setRoles({});
		setTried(false);
		setError(null);
	}, [open]);

	const emails = useMemo(
		() => [
			...new Set(
				raw
					.split(/[\s,;]+/)
					.map((e) => e.trim().toLowerCase())
					.filter(Boolean),
			),
		],
		[raw],
	);
	const bad = emails.filter((e) => !EMAIL_RE.test(e));
	const existing = emails.filter((e) => users.some((u) => u.email.toLowerCase() === e));
	const siteRoles = Object.fromEntries(Object.entries(roles).filter(([, r]) => r !== "none")) as Record<string, TRole>;
	const seatsLeft = workspace.seats - workspace.seatsUsed;

	const emailErr = !tried
		? undefined
		: emails.length === 0
			? "Add at least one email"
			: bad.length
				? `Not an email: ${bad.join(", ")}`
				: existing.length
					? `Already in ${workspace.name}: ${existing.join(", ")} — change their access in the matrix`
					: undefined;
	const rolesErr = tried && wr === "member" && Object.keys(siteRoles).length === 0 ? "Give them a role on at least one site, or make them an admin" : undefined;
	const seatErr = emails.length > seatsLeft ? `${plural(seatsLeft, "seat")} left on the ${workspace.plan} plan — invite fewer people or add seats` : undefined;

	const submit = (e: FormEvent) => {
		e.preventDefault();
		setTried(true);
		if (!emails.length || bad.length || existing.length || seatErr || (wr === "member" && !Object.keys(siteRoles).length)) return;
		const r = inviteUsers(emails, wr, siteRoles, sites[0]?.id);
		if (!r.ok) return setError(r.reason);
		onClose();
	};

	return (
		<Sheet
			open={open}
			onClose={onClose}
			width={520}
			title="Invite people"
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" type="submit" form="invite-form" icon="PaperPlaneTilt">
						{emails.length > 1 ? `Send ${emails.length} invites` : "Send invite"}
					</Button>
				</>
			}
		>
			<form id="invite-form" onSubmit={submit} noValidate className="flex flex-col gap-5 pt-1">
				<TextArea
					label="Emails"
					value={raw}
					onChange={setRaw}
					rows={3}
					placeholder="ada@agency.com, client@lumendental.co"
					hint={`Separate with commas or new lines · ${plural(Math.max(0, seatsLeft), "seat")} left`}
					error={emailErr ?? seatErr}
					autoFocus
				/>

				<div className="flex flex-col gap-2">
					<span className="text-sm text-ink-3">Workspace role</span>
					<SegmentedControl<TWorkspaceRole>
						label="Workspace role"
						value={wr}
						onChange={setWr}
						options={[
							{ value: "member", label: WORKSPACE_ROLE_LABEL.member },
							{ value: "admin", label: WORKSPACE_ROLE_LABEL.admin },
						]}
					/>
					<span className="text-xs text-ink-3">
						{wr === "admin" ? `Admins are admin on all ${plural(sites.length, "site")}, can invite people and add sites.` : "Members only see the sites you give them a role on."}
					</span>
				</div>

				{wr === "member" && (
					<fieldset className="flex flex-col gap-1">
						<legend className="pb-1.5 text-sm text-ink-3">Role per site</legend>
						{sites.map((s) => (
							<div key={s.id} className="flex min-h-12 items-center gap-2.5 border-b border-line-2 py-1 last:border-b-0">
								<SiteAvatar name={s.name} hue={s.accent} />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate font-display text-md font-medium text-ink">{s.name}</span>
									<span className="truncate text-xs text-ink-3">{s.domain}</span>
								</span>
								<Select<TCell>
									label={`Role on ${s.name}`}
									value={roles[s.id] ?? "none"}
									onChange={(v) => setRoles((m) => ({ ...m, [s.id]: v }))}
									options={[
										{ value: "none", label: "No access" },
										...(["specialist", "developer", "stakeholder", "admin"] as TRole[]).map((r) => ({
											value: r as TCell,
											label: ROLE_SHORT[r],
											hint: ROLE_LABEL[r],
										})),
									]}
									align="end"
									className="w-40 [&>span:first-child]:sr-only"
								/>
							</div>
						))}
						{rolesErr && (
							<span role="alert" className="pt-1 text-sm text-block-ink">
								{rolesErr}
							</span>
						)}
					</fieldset>
				)}

				{error && (
					<Callout tone="block" title="Invite not sent">
						{error}
					</Callout>
				)}
				<p className="text-xs text-ink-3">Prototype: no email is sent. Invited people appear as “Invited” and hold a seat until they accept.</p>
			</form>
		</Sheet>
	);
}
