"use node";
// Run the site discovery eval on a finished report (prd-site-discovery §13): the graded checks against the site's
// golden entry, plus an optional LLM judge for angle quality (a separate call with a written rubric, capped like every
// other model call). Results are stored with the behaviour hash so a change to the skill, models or effort can be
// compared before and after. Run it from the CLI:
//   npx convex run discovery/evalRun:run '{"siteId":"…","judge":true}'
import { activeModels } from "../agents/provider";
import { v } from "convex/values";
import { z } from "zod/v4";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { runAgentCall } from "../agents/run";
import { agentsLive, modelTransport, formatFor, ledgerFor } from "../agents/sdk";
import { DISCOVERY_SKILL, EVIDENCE, EXTRACT_CONTRACT, IDEAS_CONTRACT, KEYWORD_CONTRACT, PROFILE_CONTRACT } from "./agentCore";
import { behaviourHash, type ICheck, evalPassed, gradeDiscovery, JUDGE_PASS, JUDGE_RUBRIC } from "./evalCore";
import { goldenFor } from "./golden";

const JudgeOutput = z.object({ ideas: z.array(z.object({ title: z.string(), score: z.number().describe("1 to 5"), reason: z.string() })) });

/** Effort per step as the agent sets it (agent.ts); part of the behaviour hash. */
const EFFORT = "extract:low profile:high keywords:medium ideas:medium";

export const currentHash = () => behaviourHash([DISCOVERY_SKILL.text, EXTRACT_CONTRACT, PROFILE_CONTRACT, KEYWORD_CONTRACT, IDEAS_CONTRACT, EVIDENCE, JSON.stringify(activeModels()), EFFORT]);

type TJudge = { model: string; mean: number; passed: boolean; ideas: { title: string; score: number; reason: string }[]; costUsd: number };
type TEvalRun = { ok: false; reason: string } | { ok: true; passed: boolean; confirmed: boolean; hash: string; checks: ICheck[]; judge: TJudge | null };

export const run = internalAction({
	args: { siteId: v.id("sites"), reportId: v.optional(v.id("discoveryReports")), judge: v.optional(v.boolean()) },
	handler: async (ctx, { siteId, reportId, judge }): Promise<TEvalRun> => {
		const input = await ctx.runQuery(internal.discovery.evals.evalInput, { siteId, ...(reportId ? { reportId } : {}) });
		if (!input) return { ok: false as const, reason: "No finished discovery report for this site" };
		const golden = goldenFor(input.domain);
		if (!golden) return { ok: false as const, reason: `${input.domain} isn't in the golden set (convex/discovery/golden.ts)` };
		const checks = gradeDiscovery(golden, input);
		let judged: TJudge | undefined;
		if (judge && input.ideas.length && agentsLive()) {
			const user = [
				`Business: ${input.siteName} (${input.domain})`,
				`What it sells: ${input.sells || "unknown"}`,
				`Audience: ${input.audience || "unknown"}`,
				input.offerings.length ? `Offerings: ${input.offerings.join("; ")}` : "",
				`<pages>\n${input.pages.join("\n")}\n</pages>`,
				`<ideas>\n${input.ideas.map((i) => `- ${i.title} · keyword: ${i.keyword} · angle: ${i.angle}`).join("\n")}\n</ideas>`,
			]
				.filter(Boolean)
				.join("\n\n");
			const r = await runAgentCall(ledgerFor(ctx, siteId, "text"), modelTransport(), `discovery-eval:${input.reportId}:judge:${Date.now()}`, { tier: input.routing.strategy, escalated: false }, { system: [JUDGE_RUBRIC], user, schema: JudgeOutput, maxTokens: 4_000, effort: "medium" }, formatFor);
			const ideas = r.output.ideas.map((x) => ({ title: x.title, score: Math.max(1, Math.min(5, Math.round(x.score))), reason: x.reason.slice(0, 300) }));
			const mean = ideas.length ? ideas.reduce((n, x) => n + x.score, 0) / ideas.length : 0;
			judged = { model: r.model, mean: Math.round(mean * 100) / 100, passed: mean >= JUDGE_PASS, ideas, costUsd: r.totalMicroUsd / 1e6 };
		}
		const passed = evalPassed(checks) && (judged ? judged.passed : true);
		const hash = currentHash();
		await ctx.runMutation(internal.discovery.evals.saveEval, { siteId, reportId: input.reportId, goldenId: golden.id, goldenConfirmed: golden.confirmed, behaviourHash: hash, models: Object.values(activeModels()).join(", "), checks, ...(judged ? { judge: judged } : {}), passed });
		return { ok: true as const, passed, confirmed: golden.confirmed, hash, checks, judge: judged ?? null };
	},
});
