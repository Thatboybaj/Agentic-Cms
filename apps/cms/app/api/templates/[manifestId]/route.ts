// GET /api/templates/<id> → { bundle } (sample path, file count) · PUT { manifestId } links an uploaded bundle
// (stored under its client bundle id) to the manifest id the store assigned.
import { NextResponse, type NextRequest } from "next/server";
import { TemplateBundleError, getBundle, linkBundle } from "@/server/templates";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => {
	if (e instanceof TemplateBundleError) return NextResponse.json({ error: e.message }, { status: e.status });
	console.error("[templates]", e);
	return NextResponse.json({ error: "Request failed" }, { status: 500 });
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ manifestId: string }> }) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const { manifestId } = await params;
		return NextResponse.json({ bundle: await getBundle(manifestId) });
	} catch (e) {
		return fail(e);
	}
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ manifestId: string }> }) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const { manifestId: bundleId } = await params;
		const body = (await req.json().catch(() => ({}))) as { manifestId?: unknown };
		if (typeof body.manifestId !== "string") throw new TemplateBundleError("manifestId is required");
		return NextResponse.json({ bundle: await linkBundle(bundleId, body.manifestId) });
	} catch (e) {
		return fail(e);
	}
}
