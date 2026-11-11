"use client";
// Shared pieces for /settings tabs: the one-primary Save bar (disabled until dirty) and inline lock notes.
import type { ReactNode } from "react";
import { Button, Callout, Icon, RoleGate } from "@/ds";
import { PERMISSIONS, type TPermission } from "@/lib/logic";
import { useSiteCms } from "@/features/shared/site-source";

/** One primary per tab: "Save changes", disabled until something changed. Locked roles see it disabled with the reason. */
export function SaveBar({ perm, dirty, onSave, onDiscard, children }: { perm: TPermission; dirty: boolean; onSave: () => void; onDiscard: () => void; children: ReactNode }) {
	const { role } = useSiteCms();
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
			<p className="min-w-0 flex-1 text-sm text-ink-3">{children}</p>
			{dirty && (
				<Button variant="ghost" onClick={onDiscard}>
					Discard
				</Button>
			)}
			<RoleGate role={role} allow={PERMISSIONS[perm]} action="change these settings">
				<Button variant="primary" icon="Check" disabled={!dirty} onClick={onSave} title={dirty ? undefined : "Nothing changed yet"}>
					Save changes
				</Button>
			</RoleGate>
		</div>
	);
}

/** Inline "why is this read-only" callout (never hide a gated control silently). */
export function LockNote({ perm, title }: { perm: TPermission; title: string }) {
	const { can, why } = useSiteCms();
	if (can(perm)) return null;
	return (
		<Callout tone="neutral" icon="LockSimple" title={title}>
			{why(perm)}. You can read everything here.
		</Callout>
	);
}

export function LockLine({ perm }: { perm: TPermission }) {
	const { can, why } = useSiteCms();
	if (can(perm)) return null;
	return (
		<span className="flex items-center gap-1 text-xs text-ink-3">
			<Icon name="LockSimple" size={12} />
			{why(perm)}
		</span>
	);
}

export const sameRecord = <T extends Record<string, unknown>>(a: T, b: T) => Object.keys(a).every((k) => a[k] === b[k]);
