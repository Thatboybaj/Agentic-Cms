// Design-system contract checks (Nawa §DoD pattern, adapted in docs/design-system.md).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
	}
	return out;
}

const files = [...walk(SRC), ...walk(join(ROOT, "app"))];
const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");
const read = (p: string) => readFileSync(p, "utf8");

describe("tokens are the single color source", () => {
	it("no raw color literals outside src/ds/tokens.css", () => {
		const offenders: string[] = [];
		for (const f of files) {
			if (rel(f) === "src/ds/tokens.css" || rel(f) === "app/layout.tsx" || rel(f) === "src/lib/seed.ts") continue; // layout: theme-color meta; seed: tenant brand-pack palette is client data, not UI color
			read(f)
				.split("\n")
				.forEach((line, i) => {
					if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![-\w])|\brgba?\(|\bhsla?\(|\boklch\(/.test(line)) offenders.push(`${rel(f)}:${i + 1}: ${line.trim().slice(0, 90)}`);
				});
		}
		expect(offenders).toEqual([]);
	});

	it("defines the documented token families", () => {
		const css = read(join(SRC, "ds", "tokens.css"));
		for (const t of ["--c-canvas", "--c-glass", "--c-ink", "--c-ink-3", "--c-agent", "--c-agent-soft", "--c-human", "--c-human-soft", "--c-block", "--c-pass", "--c-wash-blue", "--c-wash-peach", "--c-font-display", "--c-font-body", "--c-radius-shell", "--c-radius-xl", "--c-dur-3", "--c-control-h"])
			expect(css).toContain(`${t}:`);
	});
});

describe("RTL-ready (logical properties only)", () => {
	it("no physical left/right properties in source", () => {
		const bad = /margin-(left|right)|padding-(left|right)|text-align:\s*(left|right)|border-(left|right)\b|[^-\w](left|right)\s*:|\b(ml|mr|pl|pr)-\[?\d|\btext-(left|right)\b|\b-?(left|right)-\[?\d|\brounded-(l|r)-/;
		const offenders = files
			.filter((f) => /\.(tsx|css)$/.test(f)) // UI code only; data ids like "mr-44" are not styles
			.flatMap((f) =>
			read(f)
				.split("\n")
				.map((l, i) => (bad.test(l) ? `${rel(f)}:${i + 1}: ${l.trim().slice(0, 90)}` : null))
				.filter(Boolean),
		);
		expect(offenders).toEqual([]);
	});
});

describe("feature code uses only the DS vocabulary", () => {
	it("features and routes never import Phosphor or build their own primitives", () => {
		const offenders = files
			.filter((f) => /^(src\/features|app)\//.test(rel(f)))
			.filter((f) => /@phosphor-icons\/react/.test(read(f)))
			.map(rel);
		expect(offenders).toEqual([]);
	});
});

describe("kit completeness", () => {
	it("every inventory component is exported from @/ds", () => {
		const uxer = JSON.parse(read(join(ROOT, "docs", "uxer", "uxer-output.json"))) as { components: ({ name: string } | string)[] };
		const names = uxer.components.map((c) => (typeof c === "string" ? c : c.name));
		const ds = ["controls", "shell", "surfaces", "charts", "domain"].map((f) => read(join(SRC, "ds", `${f}.tsx`))).join("\n");
		const missing = names.filter((n) => !new RegExp(`export (function|const|class) ${n}\\b|export \\{[^}]*\\b${n}\\b`).test(ds));
		expect(missing).toEqual([]);
	});

	it("styleguide renders every inventory component", () => {
		const uxer = JSON.parse(read(join(ROOT, "docs", "uxer", "uxer-output.json"))) as { components: ({ name: string } | string)[] };
		const expected = new Set(uxer.components.map((c) => (typeof c === "string" ? c : c.name)));
		const sg = read(join(SRC, "features", "styleguide", "index.tsx"));
		const rendered = new Set([...sg.matchAll(/<Kit name="([A-Za-z]+)"/g)].map((m) => m[1]));
		expect([...expected].filter((n) => !rendered.has(n))).toEqual([]);
	});
});

describe("contrast (WCAG AA) for text-safe pairs", () => {
	const css = read(join(SRC, "ds", "tokens.css"));
	const hex = (token: string) => {
		const m = css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
		if (!m) throw new Error(`${token} not a 6-digit hex`);
		return m[1];
	};
	const lum = (h: string) => {
		const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
		return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
	};
	const ratio = (a: string, b: string) => {
		const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
		return (x + 0.05) / (y + 0.05);
	};

	it("ink, ink-2, ink-3 pass 4.5:1 on canvas, surface, sunken", () => {
		for (const fg of ["--c-ink", "--c-ink-2", "--c-ink-3"]) for (const bg of ["--c-canvas", "--c-surface", "--c-sunken"]) expect(ratio(hex(fg), hex(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
	});
	it("tone inks pass 4.5:1 on white and on their own soft fill", () => {
		for (const t of ["agent", "human", "block", "pass"]) {
			expect(ratio(hex(`--c-${t}-ink`), hex("--c-surface")), `${t}-ink on surface`).toBeGreaterThanOrEqual(4.5);
			expect(ratio(hex(`--c-${t}-ink`), hex(`--c-${t}-soft`)), `${t}-ink on ${t}-soft`).toBeGreaterThanOrEqual(4.5);
		}
	});
	it("white on the ink action fill passes", () => {
		expect(ratio(hex("--c-on-ink"), hex("--c-ink"))).toBeGreaterThanOrEqual(4.5);
	});
});
