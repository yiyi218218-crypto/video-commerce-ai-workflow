import type { ZodType } from "zod";

import type { PromptReference } from "../services/prompts/prompt-loader.js";

export interface Agent<Input = unknown, Output = unknown> {
  readonly name: string;
  run(input: Input): Promise<Output>;
}

export interface AgentDescriptor {
  name: string;
  prompt?: {
    id: string;
    version: string;
    sha256: string;
  };
}

export interface ContractAgent<Input = unknown, Output = unknown>
  extends Agent<Input, Output> {
  readonly inputSchema: ZodType<Input>;
  readonly outputSchema: ZodType<Output>;
  readonly prompt?: PromptReference;
  describe?(): Promise<AgentDescriptor>;
}

export interface AgentExecutionMetadata {
  agent: string;
  prompt?: {
    id: string;
    version: string;
    sha256: string;
  };
}

export interface AgentExecution<Output = unknown> {
  output: Output;
  metadata: AgentExecutionMetadata;
}
