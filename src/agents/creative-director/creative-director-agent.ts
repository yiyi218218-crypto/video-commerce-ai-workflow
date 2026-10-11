import { AgentContractConsistencyError } from "../../errors.js";
import {
  creativeDirectorInputSchema,
  creativeDirectorOutputSchema,
  type CreativeDirectorInput,
  type CreativeDirectorOutput,
} from "../../schemas/creative-production.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class CreativeDirectorAgent extends PromptAgent<
  CreativeDirectorInput,
  CreativeDirectorOutput
> {
  readonly name = "creative_director_agent";
  readonly inputSchema = creativeDirectorInputSchema;
  readonly outputSchema = creativeDirectorOutputSchema;
  readonly prompt = {
    id: "creative_director_agent",
    version: "1.1.0",
    file: new URL("../../prompts/creative-director-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(input: CreativeDirectorInput): Promise<CreativeDirectorOutput> {
    const output = await super.run(input);
    assertTimeline(this.name, output.beats);
    assertTimeline(this.name, output.captions);
    if (output.beats[0]?.product_visibility !== "none") {
      throw new AgentContractConsistencyError(this.name, "The opening beat must not expose the product.");
    }
    if (input.route_hint && output.creative_route !== input.route_hint) {
      throw new AgentContractConsistencyError(
        this.name,
        "The creative route must match the requested route hint.",
      );
    }
    if (!output.asset_requirements.some((asset) => asset.kind === "bgm" && asset.required)) {
      throw new AgentContractConsistencyError(this.name, "A production brief must require a BGM asset.");
    }
    return output;
  }
}

function assertTimeline(
  agentName: string,
  items: ReadonlyArray<{ start_second: number; end_second: number }>,
): void {
  let previousEnd = 0;
  for (const item of items) {
    if (item.start_second < previousEnd || item.end_second <= item.start_second) {
      throw new AgentContractConsistencyError(agentName, "The production timeline contains an overlap.");
    }
    previousEnd = item.end_second;
  }
  if (previousEnd !== 15) {
    throw new AgentContractConsistencyError(agentName, "The production timeline must end at 15 seconds.");
  }
}
