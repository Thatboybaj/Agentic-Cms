// POST /api/templates (multipart) → { bundle } — stores an uploaded template bundle (html/css/images/fonts only,
// sanitised paths, 50 MB cap) under .data/templates/<siteId>/<bundleId>/ so the live preview loads real site CSS.
// Fields: siteId, bundleId, samplePath, then repeated pairs `paths` (bundle path) + `files` (blob), same order.
// LOCALHOST PROTOTYPE: enforce developer/admin role + site membership here before deployment.
import { NextResponse, type NextRequest } from "next/server";
import { MAX_BUNDLE_BYTES } from "@/render/bundle";
import { TemplateBundleError, saveBundle } from "@/server/templates";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const declared = Number(req.headers.get("content-length") ?? 0);
		if (declared > MAX_BUNDLE_BYTES + 1024 * 1024) throw new TemplateBundleError("Keep the upload under 50 MB", 413);
		const form = await req.formData().catch(() => {
			throw new TemplateBundleError("Send the bundle as multipart form data");
		});
		const str = (k: string) => {
			const v = form.get(k);
			return typeof v === "string" ? v : "";
		};
		const paths = form.getAll("paths").map(String);
		const blobs = form.getAll("files");
		if (paths.length !== blobs.length) throw new TemplateBundleError("Each file needs a path");
		const files = await Promise.all(
			blobs.map(async (b, i) => {
				if (typeof b === "string") throw new TemplateBundleError("Files must be binary parts");
				return { path: paths[i]!, data: new Uint8Array(await b.arrayBuffer()) };
			}),
		);
		const bundle = await saveBundle(str("siteId"), str("bundleId"), str("samplePath"), files);
		return NextResponse.json({ bundle }, { status: 201 });
	} catch (e) {
		if (e instanceof TemplateBundleError) return NextResponse.json({ error: e.message }, { status: e.status });
		console.error("[templates] upload failed", e);
		return NextResponse.json({ error: "Upload failed" }, { status: 500 });
	}
}
