import { AgentContractConsistencyError } from "../../errors.js";
import {
  commentAgentInputSchema,
  commentAgentOutputSchema,
  type CommentAgentInput,
  type CommentAgentOutput,
} from "../../schemas/comment-agent.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class CommentAgent extends PromptAgent<
  CommentAgentInput,
  CommentAgentOutput
> {
  readonly name = "comment_agent";
  readonly inputSchema = commentAgentInputSchema;
  readonly outputSchema = commentAgentOutputSchema;
  readonly prompt = {
    id: "comment_agent",
    version: "1.0.0",
    file: new URL("../../prompts/comment-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(
    input: CommentAgentInput,
  ): Promise<CommentAgentOutput> {
    const output = await super.run(input);
    const { escalation, classification } = output;

    if (escalation.required && escalation.owner === "none") {
      throw new AgentContractConsistencyError(
        this.name,
        "an escalated comment must have a responsible owner.",
      );
    }
    if (!escalation.required && escalation.owner !== "none") {
      throw new AgentContractConsistencyError(
        this.name,
        "a non-escalated comment cannot assign an escalation owner.",
      );
    }
    if (classification.risk_level === "high" && !escalation.required) {
      throw new AgentContractConsistencyError(
        this.name,
        "high-risk comments must be escalated.",
      );
    }
    if (output.safety_flags.length > 0 && !escalation.required) {
      throw new AgentContractConsistencyError(
        this.name,
        "comments with safety flags must be escalated.",
      );
    }
    if (
      output.private_follow_up.recommended &&
      output.private_follow_up.message.trim().length === 0
    ) {
      throw new AgentContractConsistencyError(
        this.name,
        "recommended private follow-up requires a message.",
      );
    }
    if (
      output.safety_flags.includes("privacy_data") &&
      !escalation.do_not_reply_publicly
    ) {
      throw new AgentContractConsistencyError(
        this.name,
        "privacy-related comments must not be answered publicly.",
      );
    }

    const generatedText = JSON.stringify([
      output.public_replies,
      output.private_follow_up.message,
    ]);
    const prohibitedTerm = input.prohibited_terms.find((term) =>
      generatedText.includes(term),
    );
    if (prohibitedTerm) {
      throw new AgentContractConsistencyError(
        this.name,
        `generated reply contains prohibited term "${prohibitedTerm}".`,
      );
    }

    return output;
  }
}
