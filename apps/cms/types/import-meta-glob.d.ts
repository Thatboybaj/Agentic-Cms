// Vite's import.meta.glob (used by convex-test suites to load convex/ modules). vite/client isn't a direct dependency.
interface ImportMeta {
	glob(pattern: string | string[]): Record<string, () => Promise<unknown>>;
	glob(pattern: string | string[], options: { eager: true }): Record<string, unknown>;
}
