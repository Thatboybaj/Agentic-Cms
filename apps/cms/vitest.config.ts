import { defineConfig } from "vitest/config";

// The access sweeps (convex/authzSweep.test.ts, convex/access.test.ts) load every Convex module and call each public
// function; with the suite running in parallel they take a few seconds, past Vitest's 5 s default.
export default defineConfig({
	test: {
		testTimeout: 20_000,
	},
});
