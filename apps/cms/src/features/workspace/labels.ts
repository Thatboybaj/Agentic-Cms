// Shared copy for the workspace level (portfolio, inbox, team, account, shell).
import type { TIconName } from "@/ds";
import type { TSiteStatus, TTone } from "@/lib/types";

export type { TSiteStatus };

export const STATUS_LABEL: Record<TSiteStatus, string> = {
	active: "Active",
	onboarding: "Onboarding",
	paused: "Paused",
};
export const STATUS_TONE: Record<TSiteStatus, TTone> = {
	active: "neutral",
	onboarding: "info",
	paused: "neutral",
};
export const STATUS_ICON: Record<TSiteStatus, TIconName> = {
	active: "Globe",
	onboarding: "Compass",
	paused: "Pause",
};

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}
