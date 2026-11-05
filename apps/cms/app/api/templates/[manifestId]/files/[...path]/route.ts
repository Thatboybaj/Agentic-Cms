// GET /api/templates/<manifestId>/files/<path> — serves one stored template file (css, images, fonts, html) for
// the sandboxed live preview. Never serves outside the manifest folder; CSP sandbox + nosniff on every response.
import { NextResponse, type NextRequest } from "next/server";
import { TemplateBundleError, readBundleFile } from "@/server/templates";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_HEADERS = {
	"Content-Security-Policy": "sandbox; default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:",
	"X-Content-Type-Options": "nosniff",
	"Cross-Origin-Resource-Policy": "same-origin",
	"Cache-Control": "private, max-age=300",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ manifestId: string; path: string[] }> }) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const { manifestId, path } = await params;
		const { data, contentType } = await readBundleFile(manifestId, path.map(safeDecode).join("/"));
		return new NextResponse(new Uint8Array(data), { headers: { ...SAFE_HEADERS, "Content-Type": contentType } });
	} catch (e) {
		const status = e instanceof TemplateBundleError ? e.status : 500;
		if (status === 500) console.error("[templates] file", e);
		return new NextResponse("Not found", { status: status === 403 ? 404 : status, headers: SAFE_HEADERS });
	}
}

function safeDecode(seg: string): string {
	try {
		return decodeURIComponent(seg);
	} catch {
		return seg;
	}
}
