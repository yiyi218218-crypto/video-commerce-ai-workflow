import {
  phaseZeroAgentInputSchema,
  phaseZeroAgentOutputSchema,
  type PhaseZeroAgentInput,
  type PhaseZeroAgentOutput,
} from "../../schemas/demo-agent.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class PhaseZeroAgent extends PromptAgent<
  PhaseZeroAgentInput,
  PhaseZeroAgentOutput
> {
  readonly name = "phase0_echo";
  readonly inputSchema = phaseZeroAgentInputSchema;
  readonly outputSchema = phaseZeroAgentOutputSchema;
  readonly prompt = {
    id: "phase0_echo",
    version: "1.0.0",
    file: new URL("../../prompts/phase0-echo.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }
}
