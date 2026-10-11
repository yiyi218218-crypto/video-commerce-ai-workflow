import accountIncubationDefinition from "./definitions/account_incubation.json" with {
  type: "json",
};

import { AccountIncubationAgent } from "../agents/account-incubation/account-incubation-agent.js";
import { AgentRegistry } from "../agents/agent-registry.js";
import { workflowDefinitionSchema } from "../schemas/workflow-definition.schema.js";
import type { LlmProvider } from "../services/llm/llm-provider.js";
import type { PromptSource } from "../services/prompts/prompt-loader.js";
import { MemoryRunStore } from "../services/storage/memory-run-store.js";
import type { RunStore } from "../services/storage/run-store.js";
import type { LoadedWorkflow } from "./workflow-repository.js";
import { WorkflowRunner } from "./workflow-runner.js";

export interface AccountIncubationRuntimeOptions {
  provider: LlmProvider;
  promptSource: PromptSource;
  runStore?: RunStore;
}

const definition = workflowDefinitionSchema.parse(accountIncubationDefinition);
const workflowHashPromise = sha256(JSON.stringify(accountIncubationDefinition));

export function createAccountIncubationRuntime(
  options: AccountIncubationRuntimeOptions,
): { runStore: RunStore; workflowRunner: WorkflowRunner } {
  const registry = new AgentRegistry();
  registry.register(new AccountIncubationAgent(options.provider, options.promptSource));
  const runStore = options.runStore ?? new MemoryRunStore();
  return { runStore, workflowRunner: new WorkflowRunner(registry, runStore) };
}

export async function getAccountIncubationWorkflow(): Promise<LoadedWorkflow> {
  return {
    definition,
    hash: await workflowHashPromise,
    source: "embedded:account_incubation.json",
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
