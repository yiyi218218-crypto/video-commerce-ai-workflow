import { describe, expect, it } from "vitest";

import { CommentAgent } from "../../src/agents/comment/comment-agent.js";
import { AgentContractConsistencyError } from "../../src/errors.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleCommentInput,
  sampleCommentOutput,
} from "../fixtures/comment.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("CommentAgent contract", () => {
  it("returns classified, evidence-backed reply candidates", async () => {
    const provider = new ScriptedLlmProvider([sampleCommentOutput]);
    const agent = new CommentAgent(provider, new PromptLoader());

    const output = await agent.run(sampleCommentInput);

    expect(output.public_replies).toHaveLength(3);
    expect(output.classification.intent).toBe("suitability_question");
    expect(output.escalation).toMatchObject({
      required: true,
      owner: "compliance",
    });
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "comment_agent_output",
    );

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "comment_agent",
      version: "1.0.0",
    });
  });

  it("rejects a prohibited term in a generated reply", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleCommentOutput,
        public_replies: sampleCommentOutput.public_replies.map(
          (reply, index) =>
            index === 0
              ? {
                  ...reply,
                  reply: "这是减肥食品，可以放心。",
                }
              : reply,
        ),
      },
    ]);
    const agent = new CommentAgent(provider, new PromptLoader());

    await expect(agent.run(sampleCommentInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });

  it("requires high-risk comments to have an escalation owner", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleCommentOutput,
        classification: {
          ...sampleCommentOutput.classification,
          risk_level: "high",
        },
        escalation: {
          required: false,
          owner: "none",
          reason: "错误地未升级",
          do_not_reply_publicly: false,
        },
      },
    ]);
    const agent = new CommentAgent(provider, new PromptLoader());

    await expect(agent.run(sampleCommentInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });

  it("requires a flagged medium-risk comment to be escalated", async () => {
    const provider = new ScriptedLlmProvider([
      {
        ...sampleCommentOutput,
        escalation: {
          required: false,
          owner: "none",
          reason: "错误地未升级",
          do_not_reply_publicly: false,
        },
      },
    ]);
    const agent = new CommentAgent(provider, new PromptLoader());

    await expect(agent.run(sampleCommentInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });
});
