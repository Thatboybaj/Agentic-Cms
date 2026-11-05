import "server-only";
// Tiny JSON-file storage for the localhost prototype: apps/cms/.data/ (gitignored). Override with CMS_DATA_DIR
// (tests use a tmp dir). Writes are serialized through one in-process queue and land atomically (tmp + rename).
// Replace with Postgres/Convex before deployment — this is single-process only.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const dataDir = () => process.env.CMS_DATA_DIR || join(process.cwd(), ".data");

// On globalThis so every route bundle in `next dev` shares one queue.
const g = globalThis as typeof globalThis & { __cmsJsonQueue?: Promise<unknown> };

/** Run `fn` exclusively (read-modify-write safety within this process). */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
	const run = (g.__cmsJsonQueue ?? Promise.resolve()).then(fn, fn);
	g.__cmsJsonQueue = run.catch(() => undefined);
	return run;
}

export async function readJson<T>(name: string): Promise<T | null> {
	try {
		return JSON.parse(await readFile(join(dataDir(), name), "utf8")) as T;
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}

export async function writeJson(name: string, value: unknown): Promise<void> {
	const dir = dataDir();
	await mkdir(dir, { recursive: true });
	const file = join(dir, name);
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmp, JSON.stringify(value, null, "\t") + "\n", { encoding: "utf8", mode: 0o600 });
	try {
		await rename(tmp, file);
	} catch {
		// Windows can refuse a rename over a file another process holds open; fall back to a direct write.
		await writeFile(file, JSON.stringify(value, null, "\t") + "\n", { encoding: "utf8", mode: 0o600 });
		await unlink(tmp).catch(() => undefined);
	}
}
