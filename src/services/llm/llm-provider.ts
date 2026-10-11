export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface LlmRepairContext {
  previousOutput: unknown;
  validationIssues: unknown;
}

export interface LlmRequest {
  systemPrompt: string;
  input: unknown;
  outputSchemaName: string;
  outputSchema: ZodType;
  repair?: LlmRepairContext;
}

export interface LlmResponse {
  output: unknown;
  model: string;
  usage?: LlmUsage;
}

export interface LlmProvider {
  readonly name: string;
  generateStructured(request: LlmRequest): Promise<LlmResponse>;
}
import type { ZodType } from "zod";
