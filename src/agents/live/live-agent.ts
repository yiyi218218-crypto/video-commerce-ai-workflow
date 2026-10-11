import {
  liveAgentInputSchema,
  liveAgentOutputSchema,
  type LiveAgentInput,
  type LiveAgentOutput,
} from "../../schemas/live-agent.schema.js";
import { AgentContractConsistencyError } from "../../errors.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class LiveAgent extends PromptAgent<LiveAgentInput, LiveAgentOutput> {
  readonly name = "live_agent";
  readonly inputSchema = liveAgentInputSchema;
  readonly outputSchema = liveAgentOutputSchema;
  readonly prompt = {
    id: "live_agent",
    version: "1.0.0",
    file: new URL("../../prompts/live-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }

  override async run(input: LiveAgentInput): Promise<LiveAgentOutput> {
    if (
      input.script_bundle.selected_direction_id !==
      input.selected_direction_id
    ) {
      throw new AgentContractConsistencyError(
        this.name,
        "script bundle direction does not match the live selection.",
      );
    }

    const output = await super.run(input);
    if (output.selected_direction_id !== input.selected_direction_id) {
      throw new AgentContractConsistencyError(
        this.name,
        "output selected_direction_id does not match the input selection.",
      );
    }

    const confirmedInputOffers = new Set(
      input.live_context.confirmed_offers.map(serializeOffer),
    );
    const inventedOffer = output.offer_plan.confirmed_offers.find(
      (offer) => !confirmedInputOffers.has(serializeOffer(offer)),
    );
    if (inventedOffer) {
      throw new AgentContractConsistencyError(
        this.name,
        "output contains an offer that was not confirmed in the input.",
        inventedOffer,
      );
    }

    const usesInventoryUrgency = output.urgency_scripts.some(
      (item) => item.basis === "confirmed_inventory",
    );
    if (
      usesInventoryUrgency &&
      input.live_context.inventory_quantity === undefined
    ) {
      throw new AgentContractConsistencyError(
        this.name,
        "inventory urgency was generated without confirmed inventory.",
      );
    }

    const usesDeadlineUrgency = output.urgency_scripts.some(
      (item) => item.basis === "confirmed_offer_deadline",
    );
    if (
      usesDeadlineUrgency &&
      !input.live_context.confirmed_offers.some(
        (offer) => offer.deadline !== undefined,
      )
    ) {
      throw new AgentContractConsistencyError(
        this.name,
        "deadline urgency was generated without a confirmed offer deadline.",
      );
    }

    return output;
  }
}

function serializeOffer(offer: {
  name: string;
  details: string;
  deadline?: string | undefined;
}): string {
  return JSON.stringify([
    offer.name,
    offer.details,
    offer.deadline ?? null,
  ]);
}
