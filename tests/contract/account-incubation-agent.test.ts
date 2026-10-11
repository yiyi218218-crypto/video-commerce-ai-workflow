import { describe, expect, it } from "vitest";

import { AccountIncubationAgent } from "../../src/agents/account-incubation/account-incubation-agent.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleAccountIncubationInput,
  sampleAccountIncubationOutput,
} from "../fixtures/account-incubation.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("AccountIncubationAgent", () => {
  it("creates a non-commercial first-week plan and three review-ready launch briefs", async () => {
    const provider = new ScriptedLlmProvider([sampleAccountIncubationOutput]);
    const agent = new AccountIncubationAgent(provider, new PromptLoader());

    await expect(agent.run(sampleAccountIncubationInput)).resolves.toMatchObject({
      commercial_boundary: { sales_enabled: false },
      launch_videos: [
        { video_id: "launch-1", actionable_takeaway: expect.any(String) },
        { video_id: "launch-2" },
        { video_id: "launch-3" },
      ],
    });
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "account_incubation_agent_output",
    );
  });

  it("rejects commercial language during the trust-building phase", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleAccountIncubationOutput,
        launch_videos: sampleAccountIncubationOutput.launch_videos.map((video, index) =>
          index === 0 ? { ...video, title: "立即下单" } : video,
        ),
      },
    ]);
    const agent = new AccountIncubationAgent(provider, new PromptLoader());

    await expect(agent.run(sampleAccountIncubationInput)).rejects.toThrow(
      "must not contain sales language",
    );
  });
});
