// GET  /api/agents/draft → { enabled } (is live drafting configured on this server?)
// POST /api/agents/draft → the blog writing agent's draft for one post. Needs DASHSCOPE_API_KEY (Qwen) on the server.
// The key never reaches the browser. Public demo: rate-limited per IP; set a spend limit in the Model Studio console too.
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { DraftError, DraftInputSchema, rateLimited, writeDraft } from "@/server/draft-agent";
import { fail, json } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function GET() {
	return json({ enabled: Boolean(process.env.DASHSCOPE_API_KEY) });
}

export async function POST(req: NextRequest) {
	if (!process.env.DASHSCOPE_API_KEY) return fail(503, "Live drafting isn't configured on this server.");
	const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
	if (rateLimited(ip)) return fail(429, "Draft limit reached for this hour. The demo falls back to simulated drafts.");
	let input;
	try {
		input = DraftInputSchema.parse(await req.json());
	} catch (e) {
		return fail(400, e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : "Invalid JSON body");
	}
	try {
		return json(await writeDraft(input));
	} catch (e) {
		if (e instanceof DraftError) return fail(e.status, e.message);
		return fail(500, "Something went wrong on the server.");
	}
}
