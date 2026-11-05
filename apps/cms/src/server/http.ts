import "server-only";
// Route-handler helpers for /api/connections: zod body schema + safe JSON errors.
// LOCALHOST PROTOTYPE: there is no session here. Before deployment, enforce auth + role (admin/developer may
// edit connections) and site membership SERVER-SIDE in these handlers — the client role switcher is a demo only.
import { NextResponse } from "next/server";
import { z } from "zod";
import { PROVIDERS, type TConnectionProvider } from "../features/connections/catalog";
import { ConnectionError, ConnectionInputError, ConnectionNotFoundError } from "./connections";
import { SecretUnavailableError } from "./secret-box";

const providerIds = Object.keys(PROVIDERS) as [TConnectionProvider, ...TConnectionProvider[]];

export const siteIdSchema = z.string().trim().min(1, "siteId is required").max(80).regex(/^[A-Za-z0-9_-]+$/, "siteId has invalid characters");

export const upsertBodySchema = z
	.object({
		id: z.string().trim().min(1).max(80).optional(),
		siteId: siteIdSchema,
		provider: z.enum(providerIds),
		label: z.string().max(80).optional(),
		transport: z.enum(["streamable-http", "sse", "stdio"]).optional(),
		url: z.string().max(2000).optional(),
		command: z.string().max(500).optional(),
		args: z.array(z.string().max(500)).max(40).optional(),
		model: z.string().max(200).optional(),
		toolName: z.string().max(200).optional(),
		usedFor: z.array(z.enum(["brand_imagery", "text_in_image", "volume", "diagram", "stock"])).max(5).optional(),
		enabled: z.boolean().optional(),
		/** Write-only. string = set/replace, null = remove, absent = keep. Never echoed back. */
		secret: z.string().max(4000).nullable().optional(),
	})
	.strict();

export type TUpsertBody = z.infer<typeof upsertBodySchema>;

export const json = <T>(body: T, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, error: string) => json({ error }, status);

/** Map thrown errors to short, secret-free responses. Unknown errors are logged by name only. */
export function errorResponse(e: unknown) {
	if (e instanceof z.ZodError) return fail(400, e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
	if (e instanceof ConnectionNotFoundError) return fail(404, e.message);
	if (e instanceof ConnectionInputError || e instanceof ConnectionError || e instanceof SecretUnavailableError) return fail(400, e.message);
	console.error("[connections] unexpected error:", (e as Error)?.name ?? "unknown"); // never log messages that could echo input
	return fail(500, "Something went wrong on the server. Try again.");
}
