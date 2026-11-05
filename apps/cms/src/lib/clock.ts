// Demo clock: pinned to Friday 25 Sep 2026, 10:42 Lagos time (ISO week 39) so seeded ages,
// "4 min ago" labels and ledger thresholds are deterministic. Set NEXT_PUBLIC_CMS_LIVE_CLOCK=1 for real time.
export const TIME_ZONE = "Africa/Lagos"; // UTC+1, no DST
export const DEMO_NOW_ISO = "2026-09-25T10:42:00+01:00";
export const DEMO_NOW = new Date(DEMO_NOW_ISO);

let offset = DEMO_NOW.getTime() - Date.now();

/**
 * Pins DEMO_NOW to a real instant (epoch ms). Tabs that share an anchor (localStorage `cms.clock.v1`) share one demo
 * clock, so a job scheduled in one tab fires on time in the tab that runs the job runner.
 */
export function anchorClock(realStartMs: number): void {
	offset = DEMO_NOW.getTime() - realStartMs;
}

export const LIVE = process.env.NEXT_PUBLIC_CMS_LIVE_CLOCK === "1";

/** Current app time. Pinned mode still ticks forward from the pinned instant. */
export function now(): Date {
	return LIVE ? new Date() : new Date(Date.now() + offset);
}

export const nowIso = (): string => now().toISOString();

const HOUR = 3600000;
export const DAY = 24 * HOUR;
const LAGOS_OFFSET = HOUR;

/** "2026-09-23 10:12" (Lagos wall time) → UTC ISO string. */
export function lagos(wall: string): string {
	return new Date(`${wall.replace(" ", "T")}:00+01:00`).toISOString();
}

export const addMs = (iso: string | Date, ms: number): string => new Date(new Date(iso).getTime() + ms).toISOString();
export const addHours = (iso: string | Date, h: number) => addMs(iso, h * HOUR);
export const addDays = (iso: string | Date, d: number) => addMs(iso, d * DAY);

/** Whole days elapsed between two instants (floor). */
export function daysBetween(from: string | Date, to: string | Date = now()): number {
	return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY);
}

/** ISO-8601 week number in Lagos time. 2026-09-25 → 39. */
export function isoWeek(d: string | Date = now()): number {
	const l = new Date(new Date(d).getTime() + LAGOS_OFFSET);
	const t = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
	const dow = t.getUTCDay() || 7;
	t.setUTCDate(t.getUTCDate() + 4 - dow);
	const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
	return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

export const weekLabel = (n: number) => `W${n}`;
