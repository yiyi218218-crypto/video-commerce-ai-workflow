import {
  contentAgentInputSchema,
  contentAgentOutputSchema,
  type ContentAgentInput,
  type ContentAgentOutput,
} from "../../schemas/content-agent.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class ContentAgent extends PromptAgent<
  ContentAgentInput,
  ContentAgentOutput
> {
  readonly name = "content_agent";
  readonly inputSchema = contentAgentInputSchema;
  readonly outputSchema = contentAgentOutputSchema;
  readonly prompt = {
    id: "content_agent",
    version: "1.1.0",
    file: new URL("../../prompts/content-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }
}
