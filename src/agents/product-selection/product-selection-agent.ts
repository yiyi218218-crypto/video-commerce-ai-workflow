import { AgentContractConsistencyError } from "../../errors.js";
import {
  productSelectionAgentInputSchema,
  productSelectionAgentOutputSchema,
  type ProductSelectionAgentInput,
  type ProductSelectionAgentOutput,
} from "../../schemas/product-selection.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class ProductSelectionAgent extends PromptAgent<
  ProductSelectionAgentInput,
  ProductSelectionAgentOutput
> {
  readonly name = "product_selection_agent";
  readonly inputSchema = productSelectionAgentInputSchema;
  readonly outputSchema = productSelectionAgentOutputSchema;
  readonly prompt = {
    id: "product_selection_agent",
    version: "1.1.0",
    file: new URL(
      "../../prompts/product-selection-agent.md",
      import.meta.url,
    ),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(
    input: ProductSelectionAgentInput,
  ): Promise<ProductSelectionAgentOutput> {
    const output = await super.run(input);
    const candidates = new Map(
      input.candidates.map((candidate) => [
        candidate.candidate_id,
        candidate,
      ]),
    );
    const seen = new Set<string>();
    let previousScore = Number.POSITIVE_INFINITY;

    for (const recommendation of output.ranking) {
      const candidate = candidates.get(recommendation.candidate_id);
      if (!candidate) {
        throw new AgentContractConsistencyError(
          this.name,
          `ranked candidate "${recommendation.candidate_id}" is not in the input.`,
        );
      }
      if (seen.has(recommendation.candidate_id)) {
        throw new AgentContractConsistencyError(
          this.name,
          `candidate "${recommendation.candidate_id}" is ranked more than once.`,
        );
      }
      seen.add(recommendation.candidate_id);
      if (recommendation.product_name !== candidate.product_name) {
        throw new AgentContractConsistencyError(
          this.name,
          `product name for "${recommendation.candidate_id}" was changed.`,
        );
      }

      const dimensionTotal = Object.values(
        recommendation.dimensions,
      ).reduce((sum, score) => sum + score, 0);
      if (dimensionTotal !== recommendation.overall_score) {
        throw new AgentContractConsistencyError(
          this.name,
          `overall score for "${recommendation.candidate_id}" does not equal its dimension total.`,
        );
      }
      if (recommendation.overall_score > previousScore) {
        throw new AgentContractConsistencyError(
          this.name,
          "ranking is not sorted from highest to lowest score.",
        );
      }
      previousScore = recommendation.overall_score;
      assertVideoTimeline(
        this.name,
        recommendation.candidate_id,
        recommendation.video_plan.cards,
      );
    }

    if (output.ranking[0]?.candidate_id !== output.top_pick_id) {
      throw new AgentContractConsistencyError(
        this.name,
        "top_pick_id must match the first ranked candidate.",
      );
    }
    return output;
  }
}

function assertVideoTimeline(
  agentName: string,
  candidateId: string,
  cards: ProductSelectionAgentOutput["ranking"][number]["video_plan"]["cards"],
): void {
  let expectedStart = 0;
  for (const card of cards) {
    if (
      card.start_second !== expectedStart ||
      card.end_second <= card.start_second
    ) {
      throw new AgentContractConsistencyError(
        agentName,
        `video timeline for "${candidateId}" contains a gap or overlap.`,
      );
    }
    expectedStart = card.end_second;
  }
  if (expectedStart !== 15) {
    throw new AgentContractConsistencyError(
      agentName,
      `video timeline for "${candidateId}" must end at 15 seconds.`,
    );
  }
}
