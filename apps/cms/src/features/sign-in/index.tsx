"use client";
// /sign-in — prototype stand-in for Clerk. No passwords, no real credentials: an email resolves to a seeded user,
// or you pick a person from the demo list. The current user is per tab (sessionStorage), so two tabs can be two people.

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { AppFrame, Avatar, Button, Callout, Card, Chip, Icon, Skeleton, TextField, WORKSPACE_ROLE_LABEL } from "@/ds";
import { useWorkspaceActions, useWorkspaceView } from "@/features/workspace/data";
import { CmsProvider } from "@/lib/store";
import { WORKSPACE_ROUTES } from "@/lib/routes";

function SignInCard() {
	const router = useRouter();
	const { workspace, users, workspaceRoles } = useWorkspaceView();
	const { signInAs } = useWorkspaceActions();
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const people = useMemo(() => users.filter((u) => u.status !== "suspended"), [users]);

	const enter = (userId: string) => {
		setBusy(userId);
		signInAs(userId);
		router.push(WORKSPACE_ROUTES.sites);
	};

	const submit = (e: FormEvent) => {
		e.preventDefault();
		const q = email.trim().toLowerCase();
		if (!q) return setError("Enter your work email");
		const hit = people.find((u) => u.email.toLowerCase() === q);
		if (!hit) return setError(`No one in ${workspace.name} uses ${email.trim()}. Pick a demo person below.`);
		setError(null);
		enter(hit.id);
	};

	return (
		<Card padding="lg" className="flex w-full max-w-[440px] flex-col gap-5">
			<div className="flex flex-col items-center gap-3 pt-2 text-center">
				<span className="grid size-12 place-items-center rounded-full bg-ink text-on-ink">
					<Icon name="AsteriskSimple" size={20} />
				</span>
				<h1 className="font-display text-2xl font-medium tracking-display text-ink">Sign in to {workspace.name}</h1>
				<p className="max-w-[34ch] text-md text-ink-3">One workspace for every client site your agency runs.</p>
			</div>

			<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
				<TextField
					label="Work email"
					type="email"
					autoComplete="email"
					icon="EnvelopeSimple"
					value={email}
					onChange={(v) => {
						setEmail(v);
						setError(null);
					}}
					placeholder="you@agency.com"
					error={error ?? undefined}
				/>
				<Button type="submit" variant="primary" fullWidth trailing={<Icon name="ArrowRight" size={16} className="rtl:-scale-x-100" />}>
					Continue
				</Button>
			</form>

			<div className="flex items-center gap-3 text-xs text-ink-3">
				<span className="h-px flex-1 bg-line-2" />
				Demo: choose a person
				<span className="h-px flex-1 bg-line-2" />
			</div>

			<ul className="flex flex-col gap-1" aria-label="Demo people">
				{people.map((u) => {
					const invited = u.status === "invited";
					const wr = workspaceRoles[u.id];
					return (
						<li key={u.id}>
							<button
								type="button"
								disabled={!!busy}
								onClick={() => enter(u.id)}
								className="press flex min-h-14 w-full items-center gap-3 rounded-md px-2.5 py-2 text-start hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
							>
								<Avatar name={u.name} initials={u.initials} size={32} />
								<span className="flex min-w-0 flex-1 flex-col">
									<span className="truncate font-display text-md font-medium text-ink">{u.name}</span>
									<span className="truncate text-xs text-ink-3">{u.title ? `${u.title} · ${u.email}` : u.email}</span>
								</span>
								{invited ? (
									<Chip size="sm" tone="human">
										Invited · accepts on sign-in
									</Chip>
								) : (
									wr && wr !== "member" && <Chip size="sm">{WORKSPACE_ROLE_LABEL[wr]}</Chip>
								)}
								{busy === u.id ? <Icon name="CircleNotch" size={16} className="animate-spin text-ink-3" /> : <Icon name="ArrowRight" size={15} className="text-ink-3 rtl:-scale-x-100" />}
							</button>
						</li>
					);
				})}
			</ul>

			<Callout tone="info" icon="Info" title="Prototype sign-in">
				Stands in for Clerk. No password is asked for or stored; your choice lives in this tab only, so another tab can be someone else.
			</Callout>
		</Card>
	);
}

function Loading() {
	return (
		<Card padding="lg" className="flex w-full max-w-[440px] flex-col gap-4" aria-busy="true" aria-label="Loading">
			<Skeleton className="mx-auto size-12" radius="999px" />
			<Skeleton className="mx-auto h-7 w-56" />
			<Skeleton className="h-11 w-full" />
			<Skeleton className="h-11 w-full" />
			{[0, 1, 2, 3].map((i) => (
				<Skeleton key={i} className="h-12 w-full" />
			))}
		</Card>
	);
}

export function SignIn() {
	return (
		<AppFrame wash="blue-peach">
			<div className="grid min-h-full place-items-center py-6">
				<CmsProvider fallback={<Loading />}>
					<SignInCard />
				</CmsProvider>
			</div>
		</AppFrame>
	);
}
