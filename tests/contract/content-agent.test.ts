import { describe, expect, it } from "vitest";

import { ContentAgent } from "../../src/agents/content/content-agent.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleContentOutput,
  sampleProductInput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("ContentAgent contract", () => {
  it("generates exactly five schema-valid directions", async () => {
    const provider = new ScriptedLlmProvider([sampleContentOutput]);
    const agent = new ContentAgent(provider, new PromptLoader());

    const output = await agent.run({
      product: sampleProductInput,
      product_insight: sampleProductOutput,
      brand_tone: "真实、克制、可信",
      content_constraints: [],
    });

    expect(output.directions).toHaveLength(5);
    expect(
      new Set(output.directions.map((direction) => direction.direction_id)),
    ).toHaveLength(5);
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "content_agent_output",
    );

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "content_agent",
      version: "1.1.0",
    });
  });
});
