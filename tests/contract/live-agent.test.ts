import { describe, expect, it } from "vitest";

import { LiveAgent } from "../../src/agents/live/live-agent.js";
import { AgentContractConsistencyError } from "../../src/errors.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleContentOutput,
  sampleProductInput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";
import {
  sampleLiveContext,
  sampleLiveOutput,
  sampleScriptOutput,
} from "../fixtures/phase-two.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("LiveAgent contract", () => {
  const input = {
    product: sampleProductInput,
    product_insight: sampleProductOutput,
    content_plan: sampleContentOutput,
    selected_direction_id: "direction_1" as const,
    script_bundle: sampleScriptOutput,
    live_context: sampleLiveContext,
  };

  it("returns a complete, grounded live playbook", async () => {
    const provider = new ScriptedLlmProvider([sampleLiveOutput]);
    const agent = new LiveAgent(provider, new PromptLoader());

    const output = await agent.run(input);

    expect(output.opening_five_minutes).toHaveLength(5);
    expect(output.interaction_questions.length).toBeGreaterThanOrEqual(6);
    expect(output.offer_plan.confirmed_offers).toEqual(
      sampleLiveContext.confirmed_offers,
    );
    expect(provider.requests[0]?.outputSchemaName).toBe("live_agent_output");

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "live_agent",
      version: "1.0.0",
    });
  });

  it("rejects an invented confirmed offer", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleLiveOutput,
        offer_plan: {
          ...sampleLiveOutput.offer_plan,
          confirmed_offers: [
            ...sampleLiveOutput.offer_plan.confirmed_offers,
            {
              name: "虚构赠品",
              details: "下单赠送未确认礼品",
            },
          ],
        },
      },
    ]);
    const agent = new LiveAgent(provider, new PromptLoader());

    await expect(agent.run(input)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });

  it("rejects inventory urgency when no inventory was confirmed", async () => {
    const provider = new ScriptedLlmProvider([sampleLiveOutput]);
    const agent = new LiveAgent(provider, new PromptLoader());

    await expect(
      agent.run({
        ...input,
        live_context: {
          ...sampleLiveContext,
          inventory_quantity: undefined,
        },
      }),
    ).rejects.toBeInstanceOf(AgentContractConsistencyError);
  });
});
