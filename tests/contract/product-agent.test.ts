import { describe, expect, it } from "vitest";

import { ProductAgent } from "../../src/agents/product/product-agent.js";
import { AgentInputValidationError } from "../../src/errors.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleProductInput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("ProductAgent contract", () => {
  it("loads its prompt and returns structured commercial analysis", async () => {
    const provider = new ScriptedLlmProvider([sampleProductOutput]);
    const agent = new ProductAgent(provider, new PromptLoader());

    await expect(agent.run(sampleProductInput)).resolves.toEqual(
      sampleProductOutput,
    );
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "product_agent_output",
    );

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "product_agent",
      version: "1.0.0",
    });
  });

  it("rejects incomplete product facts before calling the provider", async () => {
    const provider = new ScriptedLlmProvider([sampleProductOutput]);
    const agent = new ProductAgent(provider, new PromptLoader());

    await expect(
      agent.run({
        ...sampleProductInput,
        target_users: [],
      }),
    ).rejects.toBeInstanceOf(AgentInputValidationError);
    expect(provider.requests).toHaveLength(0);
  });
});
