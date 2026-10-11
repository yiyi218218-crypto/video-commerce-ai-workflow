import type { ZodType } from "zod";

import {
  AgentInputValidationError,
} from "../errors.js";
import type { LlmProvider } from "../services/llm/llm-provider.js";
import { StructuredGenerationService } from "../services/llm/structured-generation-service.js";
import type {
  PromptReference,
  PromptSource,
} from "../services/prompts/prompt-loader.js";
import type {
  AgentDescriptor,
  ContractAgent,
} from "./agent.js";

export abstract class PromptAgent<Input, Output>
  implements ContractAgent<Input, Output>
{
  abstract readonly name: string;
  abstract readonly inputSchema: ZodType<Input>;
  abstract readonly outputSchema: ZodType<Output>;
  abstract readonly prompt: PromptReference;

  protected constructor(
    protected readonly provider: LlmProvider,
    protected readonly promptLoader: PromptSource,
  ) {
    this.generationService = new StructuredGenerationService(provider);
  }

  private readonly generationService: StructuredGenerationService;

  async describe(): Promise<AgentDescriptor> {
    const prompt = await this.promptLoader.load(this.prompt);
    return {
      name: this.name,
      prompt: {
        id: prompt.id,
        version: prompt.version,
        sha256: prompt.sha256,
      },
    };
  }

  async run(rawInput: Input): Promise<Output> {
    const input = this.inputSchema.safeParse(rawInput);
    if (!input.success) {
      throw new AgentInputValidationError(this.name, input.error.issues);
    }

    const prompt = await this.promptLoader.load(this.prompt);
    return this.generationService.generate({
      agentName: this.name,
      systemPrompt: prompt.content,
      input: input.data,
      outputSchemaName: this.outputSchemaName,
      outputSchema: this.outputSchema,
    });
  }

  protected get outputSchemaName(): string {
    return `${this.name}_output`;
  }
}
