import {
  scriptAgentInputSchema,
  scriptAgentOutputSchema,
  type ScriptAgentInput,
  type ScriptAgentOutput,
} from "../../schemas/script-agent.schema.js";
import { AgentContractConsistencyError } from "../../errors.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class ScriptAgent extends PromptAgent<
  ScriptAgentInput,
  ScriptAgentOutput
> {
  readonly name = "script_agent";
  readonly inputSchema = scriptAgentInputSchema;
  readonly outputSchema = scriptAgentOutputSchema;
  readonly prompt = {
    id: "script_agent",
    version: "1.1.0",
    file: new URL("../../prompts/script-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(input: ScriptAgentInput): Promise<ScriptAgentOutput> {
    const selectedDirectionExists = input.content_plan.directions.some(
      (direction) =>
        direction.direction_id === input.selected_direction_id,
    );
    if (!selectedDirectionExists) {
      throw new AgentContractConsistencyError(
        this.name,
        `selected direction "${input.selected_direction_id}" is missing from the content plan.`,
      );
    }

    const output = await super.run(input);
    if (output.selected_direction_id !== input.selected_direction_id) {
      throw new AgentContractConsistencyError(
        this.name,
        "output selected_direction_id does not match the input selection.",
      );
    }
    return output;
  }
}
