import {
  productAgentInputSchema,
  productAgentOutputSchema,
  type ProductAgentInput,
  type ProductAgentOutput,
} from "../../schemas/product-agent.schema.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import type { PromptSource } from "../../services/prompts/prompt-loader.js";
import { PromptAgent } from "../prompt-agent.js";

export class ProductAgent extends PromptAgent<
  ProductAgentInput,
  ProductAgentOutput
> {
  readonly name = "product_agent";
  readonly inputSchema = productAgentInputSchema;
  readonly outputSchema = productAgentOutputSchema;
  readonly prompt = {
    id: "product_agent",
    version: "1.0.0",
    file: new URL("../../prompts/product-agent.md", import.meta.url),
  };

  constructor(provider: LlmProvider, promptLoader: PromptSource) {
    super(provider, promptLoader);
  }
}
