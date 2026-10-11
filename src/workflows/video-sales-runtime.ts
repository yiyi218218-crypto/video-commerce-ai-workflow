import phaseTwoDefinition from "./definitions/video_sales_phase2.json" with {
  type: "json",
};

import { AgentRegistry } from "../agents/agent-registry.js";
import { ContentAgent } from "../agents/content/content-agent.js";
import { LiveAgent } from "../agents/live/live-agent.js";
import { ProductAgent } from "../agents/product/product-agent.js";
import { ScriptAgent } from "../agents/script/script-agent.js";
import { workflowDefinitionSchema } from "../schemas/workflow-definition.schema.js";
import type { WorkflowRun } from "../schemas/workflow-run.schema.js";
import type { LlmProvider } from "../services/llm/llm-provider.js";
import type { PromptSource } from "../services/prompts/prompt-loader.js";
import { MemoryRunStore } from "../services/storage/memory-run-store.js";
import type { RunStore } from "../services/storage/run-store.js";
import type { LoadedWorkflow } from "./workflow-repository.js";
import { WorkflowRunner } from "./workflow-runner.js";

export interface VideoSalesRuntimeOptions {
  provider: LlmProvider;
  promptSource: PromptSource;
  initialRuns?: WorkflowRun[];
  runStore?: RunStore;
}

const definition = workflowDefinitionSchema.parse(phaseTwoDefinition);
const workflowHashPromise = sha256(JSON.stringify(phaseTwoDefinition));

export function createVideoSalesRuntime(
  options: VideoSalesRuntimeOptions,
): {
  runStore: RunStore;
  workflowRunner: WorkflowRunner;
} {
  const registry = new AgentRegistry();
  registry.register(new ProductAgent(options.provider, options.promptSource));
  registry.register(new ContentAgent(options.provider, options.promptSource));
  registry.register(new ScriptAgent(options.provider, options.promptSource));
  registry.register(new LiveAgent(options.provider, options.promptSource));

  const runStore =
    options.runStore ?? new MemoryRunStore(options.initialRuns ?? []);
  return {
    runStore,
    workflowRunner: new WorkflowRunner(registry, runStore),
  };
}

export async function getVideoSalesWorkflow(): Promise<LoadedWorkflow> {
  return {
    definition,
    hash: await workflowHashPromise,
    source: "embedded:video_sales_phase2.json",
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
