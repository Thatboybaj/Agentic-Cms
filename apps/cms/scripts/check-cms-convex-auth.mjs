#!/usr/bin/env node
// Handoff 01 step 3: every public Convex function must be built from a wrapper in convex/lib/functions.ts.
// Fails if a file in apps/cms/convex imports the raw public builders (query / mutation / action / httpAction is fine
// only in the allowlist) from _generated/server. Internal builders (internalQuery, internalMutation, internalAction)
// are allowed everywhere. Run: node scripts/check-cms-convex-auth.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../convex", import.meta.url));
const ALLOW = new Set(["lib/functions.ts", "http.ts", "crons.ts"]);
const RAW = new Set(["query", "mutation", "action"]);

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		if (name === "_generated" || name === "node_modules") return [];
		if (statSync(p).isDirectory()) return walk(p);
		return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [p] : [];
	});
}

export function findViolations(files = walk(root)) {
	const out = [];
	for (const file of files) {
		const rel = relative(root, file).split(sep).join("/");
		if (ALLOW.has(rel)) continue;
		const src = readFileSync(file, "utf8");
		for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'][./]*_generated\/server["']/g)) {
			const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "")).filter(Boolean);
			const bad = names.filter((n) => RAW.has(n));
			if (bad.length) out.push(`${rel}: imports ${bad.join(", ")} from _generated/server; use siteQuery/siteMutation/siteAction/workspaceQuery/workspaceMutation from ./lib/functions`);
		}
		if (/from\s*["']convex\/server["']/.test(src) && /\b(queryGeneric|mutationGeneric|actionGeneric)\b/.test(src)) {
			out.push(`${rel}: uses a raw *Generic builder from convex/server`);
		}
	}
	return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const v = findViolations();
	if (v.length) {
		console.error("Unwrapped public Convex functions:\n" + v.map((s) => "  " + s).join("\n"));
		process.exit(1);
	}
	console.log("check-cms-convex-auth: ok");
}
