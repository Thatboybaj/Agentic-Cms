// GET /api/connections?siteId= → { connections, storage } · POST /api/connections → { connection } (create/update).
// Responses never include secrets (only hasSecret + secretHint). Bodies validated with zod.
// LOCALHOST PROTOTYPE: auth, site membership and role checks (admin/developer edit) must be enforced here,
// server-side, before deployment — the client role switcher is a demo.
import type { NextRequest } from "next/server";
import { listConnections, storageInfo, upsertConnection } from "@/server/connections";
import { errorResponse, json, siteIdSchema, upsertBodySchema } from "@/server/http";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const siteId = siteIdSchema.parse(req.nextUrl.searchParams.get("siteId") ?? "");
		const [connections, storage] = await Promise.all([listConnections(siteId), storageInfo()]);
		return json({ connections, storage });
	} catch (e) {
		return errorResponse(e);
	}
}

export async function POST(req: NextRequest) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const raw = await req.json().catch(() => {
			throw new SyntaxError("bad json");
		});
		const { secret, ...input } = upsertBodySchema.parse(raw);
		const connection = await upsertConnection(input, secret);
		return json({ connection }, input.id ? 200 : 201);
	} catch (e) {
		if (e instanceof SyntaxError) return json({ error: "Send a JSON body." }, 400);
		return errorResponse(e);
	}
}
