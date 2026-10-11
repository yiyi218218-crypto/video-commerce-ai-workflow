import type { ZodType } from "zod";

import { AgentOutputValidationError } from "../../errors.js";
import type { LlmProvider } from "./llm-provider.js";

export interface StructuredGenerationRequest<Output> {
  agentName: string;
  systemPrompt: string;
  input: unknown;
  outputSchemaName: string;
  outputSchema: ZodType<Output>;
}

export class StructuredGenerationService {
  constructor(private readonly provider: LlmProvider) {}

  async generate<Output>(
    request: StructuredGenerationRequest<Output>,
  ): Promise<Output> {
    const firstResponse = await this.provider.generateStructured({
      systemPrompt: request.systemPrompt,
      input: request.input,
      outputSchemaName: request.outputSchemaName,
      outputSchema: request.outputSchema,
    });
    const firstParse = request.outputSchema.safeParse(firstResponse.output);
    if (firstParse.success) {
      return firstParse.data;
    }

    const repairedResponse = await this.provider.generateStructured({
      systemPrompt: request.systemPrompt,
      input: request.input,
      outputSchemaName: request.outputSchemaName,
      outputSchema: request.outputSchema,
      repair: {
        previousOutput: firstResponse.output,
        validationIssues: firstParse.error.issues,
      },
    });
    const repairedParse = request.outputSchema.safeParse(
      repairedResponse.output,
    );
    if (!repairedParse.success) {
      throw new AgentOutputValidationError(
        request.agentName,
        repairedParse.error.issues,
      );
    }
    return repairedParse.data;
  }
}
