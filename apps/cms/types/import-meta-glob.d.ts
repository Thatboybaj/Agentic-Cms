// Vite's import.meta.glob (used by convex-test suites to load convex/ modules). vite/client isn't a direct dependency.
interface ImportMeta {
	glob(pattern: string): Record<string, () => Promise<unknown>>;
}
