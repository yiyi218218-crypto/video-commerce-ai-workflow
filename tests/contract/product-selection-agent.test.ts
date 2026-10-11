import { describe, expect, it } from "vitest";

import { ProductSelectionAgent } from "../../src/agents/product-selection/product-selection-agent.js";
import { AgentContractConsistencyError } from "../../src/errors.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  selectionInput,
  selectionOutput,
} from "../fixtures/product-selection.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("ProductSelectionAgent contract", () => {
  it("ranks visible candidates and returns a renderable video plan", async () => {
    const provider = new ScriptedLlmProvider([selectionOutput]);
    const agent = new ProductSelectionAgent(
      provider,
      new PromptLoader(),
    );

    await expect(agent.run(selectionInput)).resolves.toEqual(
      selectionOutput,
    );
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "product_selection_agent_output",
    );
    await expect(agent.describe()).resolves.toMatchObject({
      prompt: {
        id: "product_selection_agent",
        version: "1.1.0",
      },
    });
  });

  it("rejects score totals that do not match dimension scores", async () => {
    const invalidOutput = structuredClone(selectionOutput);
    invalidOutput.ranking[0]!.overall_score -= 1;
    const agent = new ProductSelectionAgent(
      new ScriptedLlmProvider([invalidOutput]),
      new PromptLoader(),
    );

    await expect(agent.run(selectionInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });

  it("rejects video timelines with gaps", async () => {
    const invalidOutput = structuredClone(selectionOutput);
    invalidOutput.ranking[0]!.video_plan.cards[1]!.start_second = 4;
    const agent = new ProductSelectionAgent(
      new ScriptedLlmProvider([invalidOutput]),
      new PromptLoader(),
    );

    await expect(agent.run(selectionInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });
});
