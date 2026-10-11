import { VcaError } from "../../errors.js";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "./llm-provider.js";

export class UnavailableLlmProvider implements LlmProvider {
  readonly name = "unavailable";

  async generateStructured(_request: LlmRequest): Promise<LlmResponse> {
    throw new VcaError(
      "LLM_PROVIDER_NOT_CONFIGURED",
      "No business LLM provider is configured. Inject an LlmProvider before running Phase 1 agents.",
    );
  }
}
