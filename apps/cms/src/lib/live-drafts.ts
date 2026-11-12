// Client-side bridge between the simulated store and the real writing agent (POST /api/agents/draft).
// The store's draft job asks for a live draft when it starts and waits for it before completing. No key on the server,
// a failed call, a page reload mid-draft or a timeout → the store uses its simulated draft, so the demo never breaks.
// In-memory only: results are consumed once by the draft-complete job.

export interface ILiveDraftRequest {
	siteName: string;
	industry: string;
	voice: string;
	keyword: string;
	title: string;
	contentType: string;
	intent: string;
	wordTarget: number;
	regulated?: "health" | "finance" | "legal";
	disclaimer?: string;
}

export interface ILiveDraftBlock {
	kind: "h2" | "h3" | "p" | "ul" | "quote" | "faq";
	text: string;
}

export interface ILiveDraft {
	seo_title: string;
	direct_answer: string;
	blocks: ILiveDraftBlock[];
	unverified_claims: string[];
	information_gain: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
}

type TEntry = { status: "pending"; startedAt: number } | { status: "done"; draft: ILiveDraft } | { status: "failed"; reason: string; silent?: boolean };

const entries = new Map<string, TEntry>();
/** Longest the store waits for the model before falling back to the simulated draft. */
export const LIVE_DRAFT_TIMEOUT_MS = 150_000;

const canFetch = () => typeof window !== "undefined" && typeof fetch === "function";

/** Fire-and-forget. Safe to call from the store's job reducer (only the leader tab runs jobs). */
export function requestLiveDraft(postId: string, body: ILiveDraftRequest) {
	if (!canFetch() || entries.has(postId)) return;
	entries.set(postId, { status: "pending", startedAt: Date.now() });
	fetch("/api/agents/draft", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
		.then(async (r) => {
			const data = await r.json().catch(() => ({}));
			if (r.status === 503 && /isn't configured/.test(String(data?.error))) {
				entries.set(postId, { status: "failed", reason: "not configured", silent: true }); // no key: plain simulation, no warning
				return;
			}
			if (!r.ok) throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${r.status}`);
			entries.set(postId, { status: "done", draft: data as ILiveDraft });
		})
		.catch((e: unknown) => entries.set(postId, { status: "failed", reason: e instanceof Error ? e.message : "Request failed" }));
}

/** "waiting" while the model is still writing (and within the timeout); otherwise the result, consumed once. */
export function takeLiveDraft(postId: string): { status: "waiting"; seconds: number } | { status: "done"; draft: ILiveDraft } | { status: "failed"; reason: string; silent?: boolean } | { status: "none" } {
	const e = entries.get(postId);
	if (!e) return { status: "none" };
	if (e.status === "pending") {
		const ms = Date.now() - e.startedAt;
		if (ms < LIVE_DRAFT_TIMEOUT_MS) return { status: "waiting", seconds: Math.round(ms / 1000) };
		entries.delete(postId);
		return { status: "failed", reason: "The model took too long" };
	}
	entries.delete(postId);
	return e;
}

/** Like takeLiveDraft but never consumes a finished result. */
export function peekLiveDraft(postId: string): "none" | "waiting" | "ready" {
	const e = entries.get(postId);
	if (!e) return "none";
	if (e.status === "pending") return Date.now() - e.startedAt < LIVE_DRAFT_TIMEOUT_MS ? "waiting" : "ready";
	return "ready";
}

/** Whether a live draft is outstanding for this post (used to keep the progress job ticking). */
export function hasLiveDraft(postId: string) {
	return entries.has(postId);
}
