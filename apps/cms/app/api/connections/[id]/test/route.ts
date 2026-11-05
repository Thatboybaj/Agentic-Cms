// POST /api/connections/[id]/test?siteId= → { connection } with fresh status / lastError / tools.
// Makes a real network call (MCP listTools or the provider's auth check). Never returns the secret.
// LOCALHOST PROTOTYPE: enforce auth + admin/developer role server-side before deployment.
import type { NextRequest } from "next/server";
import { ConnectionNotFoundError, getConnectionForSite, testConnection } from "@/server/connections";
import { errorResponse, json, siteIdSchema } from "@/server/http";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const { id } = await params;
		const siteId = siteIdSchema.parse(req.nextUrl.searchParams.get("siteId") ?? "");
		if (!(await getConnectionForSite(id, siteId))) throw new ConnectionNotFoundError();
		return json({ connection: await testConnection(id) });
	} catch (e) {
		return errorResponse(e);
	}
}
