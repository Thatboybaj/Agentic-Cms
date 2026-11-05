import "server-only";
import { NextResponse } from "next/server";

// The connections, template-upload and visual-agent routes are localhost prototypes: no auth, and they write API keys
// and uploads to the local disk. On a deployed site (Vercel sets VERCEL=1) they are switched off unless
// ENABLE_LOCAL_APIS=1 — otherwise any visitor could store keys or spend them. Backend phase B4 replaces them.
export function localOnly(): NextResponse | null {
	const deployed = process.env.VERCEL === "1" || process.env.DEMO_PUBLIC === "1";
	if (!deployed || process.env.ENABLE_LOCAL_APIS === "1") return null;
	return NextResponse.json({ error: "This feature runs on localhost only in the public demo." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
