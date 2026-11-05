// DELETE /api/connections/[id]?siteId= → 204. Tenant-checked: the id must belong to siteId.
// LOCALHOST PROTOTYPE: enforce auth + admin/developer role server-side before deployment.
import type { NextRequest } from "next/server";
import { ConnectionNotFoundError, deleteConnection, getConnectionForSite } from "@/server/connections";
import { errorResponse, siteIdSchema } from "@/server/http";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const { id } = await params;
		const siteId = siteIdSchema.parse(req.nextUrl.searchParams.get("siteId") ?? "");
		if (!(await getConnectionForSite(id, siteId))) throw new ConnectionNotFoundError();
		await deleteConnection(id);
		return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
	} catch (e) {
		return errorResponse(e);
	}
}
