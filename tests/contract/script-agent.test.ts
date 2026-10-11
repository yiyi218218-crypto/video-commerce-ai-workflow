import { describe, expect, it } from "vitest";

import { ScriptAgent } from "../../src/agents/script/script-agent.js";
import { AgentContractConsistencyError } from "../../src/errors.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleContentOutput,
  sampleProductInput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";
import {
  sampleProductionContext,
  sampleScriptOutput,
} from "../fixtures/phase-two.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("ScriptAgent contract", () => {
  const input = {
    product: sampleProductInput,
    product_insight: sampleProductOutput,
    content_plan: sampleContentOutput,
    selected_direction_id: "direction_1" as const,
    production_context: sampleProductionContext,
  };

  it("returns distinct 15, 30, and 60 second scripts", async () => {
    const provider = new ScriptedLlmProvider([sampleScriptOutput]);
    const agent = new ScriptAgent(provider, new PromptLoader());

    const output = await agent.run(input);

    expect(output.scripts.fifteen_seconds.duration_seconds).toBe(15);
    expect(output.scripts.thirty_seconds.duration_seconds).toBe(30);
    expect(output.scripts.sixty_seconds.duration_seconds).toBe(60);
    expect(
      new Set([
        output.scripts.fifteen_seconds.shots.length,
        output.scripts.thirty_seconds.shots.length,
        output.scripts.sixty_seconds.shots.length,
      ]).size,
    ).toBe(3);
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "script_agent_output",
    );

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "script_agent",
      version: "1.1.0",
    });
  });

  it("rejects output for a direction other than the user selection", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleScriptOutput,
        selected_direction_id: "direction_2",
      },
    ]);
    const agent = new ScriptAgent(provider, new PromptLoader());

    await expect(agent.run(input)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });
});
