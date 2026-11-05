import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { AGENTS, HARNESS, IMAGE_ROUTING, SCHEDULE } from "./index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface IYamlAgent {
  model: string;
  escalate_to?: { model: string; when: string[] };
  schedule?: unknown;
  inputs?: string[];
  outputs?: string[];
  hands_off_to?: string;
  routing?: Record<string, string>;
}

interface IYaml {
  harness: {
    name: string;
    version: string;
    human_gates: string[];
    publishing: { autopost_default: boolean; auto_merge_on_green_ci: boolean; when_autopost_off: string };
  };
  agents: Record<string, IYamlAgent>;
  escalation: Record<string, number>;
}

const config = parse(readFileSync(resolve(root, "harness-config.yaml"), "utf8")) as IYaml;

describe("harness-config.yaml and src/index.ts stay in sync", () => {
  it("has the same agent ids, in roster order, and 11 agents", () => {
    expect(AGENTS).toHaveLength(11);
    expect(Object.keys(config.agents)).toEqual(AGENTS.map((a) => a.id));
    expect(AGENTS.map((a) => a.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("matches models and escalation models", () => {
    for (const agent of AGENTS) {
      const y = config.agents[agent.id]!;
      expect(y.model, agent.id).toBe(agent.modelId);
      expect(y.escalate_to?.model, agent.id).toBe(agent.escalateTo?.modelId);
      expect(y.escalate_to?.when, agent.id).toEqual(agent.escalateTo?.when);
      if (y.inputs) expect(y.inputs, agent.id).toEqual(agent.inputs);
      if (y.outputs) expect(y.outputs, agent.id).toEqual(agent.outputs);
      expect(y.hands_off_to, agent.id).toBe(agent.handsOffTo);
    }
  });

  it("matches harness metadata, gates, and publishing defaults", () => {
    expect(config.harness.name).toBe(HARNESS.name);
    expect(config.harness.version).toBe(HARNESS.version);
    expect(config.harness.human_gates).toEqual(HARNESS.humanGates);
    expect(config.harness.publishing).toEqual({
      autopost_default: HARNESS.publishing.autopostDefault,
      auto_merge_on_green_ci: HARNESS.publishing.autoMergeOnGreenCi,
      when_autopost_off: HARNESS.publishing.whenAutopostOff,
    });
    expect(config.escalation.stale_human_item_days_warn).toBe(HARNESS.escalation.staleHumanItemDaysWarn);
    expect(config.escalation.stale_human_item_days_block).toBe(HARNESS.escalation.staleHumanItemDaysBlock);
  });

  it("matches the visual-asset-agent image routing table", () => {
    const routing = config.agents["visual-asset-agent"]!.routing!;
    expect(Object.fromEntries(IMAGE_ROUTING.map((r) => [r.route, r.provider]))).toEqual(routing);
  });

  it("points every skillPath at a real SKILL.md and schedules only known agents", () => {
    for (const agent of AGENTS) {
      if (agent.skillPath) expect(existsSync(resolve(root, agent.skillPath)), agent.skillPath).toBe(true);
    }
    const ids = new Set(AGENTS.map((a) => a.id));
    for (const entry of SCHEDULE) for (const id of entry.agents) expect(ids.has(id)).toBe(true);
  });
});
