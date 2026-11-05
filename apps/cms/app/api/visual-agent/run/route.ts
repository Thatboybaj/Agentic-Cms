// POST /api/visual-agent/run → IVisualAgentResult. Runs the visual-asset agent (harness agent #10) for one image
// slot: generate (connected MCP / image API), diagram (SVG from the post), or source (licensed web image), with
// provenance. The response never contains secrets. Body validated with zod.
// LOCALHOST PROTOTYPE: auth, site membership and role checks (specialist/admin may manage assets) must be enforced
// here, server-side, before deployment — the client role switcher is a demo.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, json, siteIdSchema } from "@/server/http";
import { runVisualAgent } from "@/server/visual-agent/run";
import { localOnly } from "@/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const str = (max: number) => z.string().max(max);

const bodySchema = z
	.object({
		siteId: siteIdSchema,
		slot: z.object({
			id: str(120).min(1),
			name: str(200),
			type: z.enum(["hero", "lifestyle", "diagram", "screenshot", "chart", "photo"]),
			placement: str(300),
			width: z.number().int().min(16).max(8000),
			height: z.number().int().min(16).max(8000),
			alt: str(500),
			prompt: str(2000),
			styleKeywords: z.array(str(120)).max(20),
			provider: z.enum(["higgsfield", "openai", "open-source", "inline-svg", "human"]),
			model: str(200),
			humanPinned: z.boolean().optional(),
		}),
		post: z.object({
			title: str(300),
			keyword: str(200),
			headings: z.array(str(300)).max(60),
			listItems: z.array(str(500)).max(120),
			paragraphs: z.array(str(4000)).max(120),
			blocks: z
				.array(z.object({ kind: z.enum(["h2", "h3", "p", "ul"]), text: str(6000) }))
				.max(200)
				.optional(),
		}),
		brandPack: z.object({
			palette: z.array(str(16)).max(12),
			styleKeywords: z.array(str(120)).max(20),
			avoid: z.array(str(120)).max(20).optional(),
			commercial: z.boolean().optional(),
			allowNonCommercial: z.boolean().optional(),
			allowNoDerivatives: z.boolean().optional(),
		}),
		estimateCapUsd: z.number().min(0).max(100000).optional(),
		override: z.enum(["generate", "diagram", "source"]).optional(),
	})
	.strict();

export async function POST(req: NextRequest) {
	const blocked = localOnly();
	if (blocked) return blocked;
	try {
		const raw = await req.json().catch(() => {
			throw new SyntaxError("bad json");
		});
		const input = bodySchema.parse(raw);
		const result = await runVisualAgent(input);
		return json(result);
	} catch (e) {
		if (e instanceof SyntaxError) return json({ error: "Send a JSON body." }, 400);
		return errorResponse(e);
	}
}
