import { AgentRegistry } from "./agents/agent-registry.js";
import { AccountIncubationAgent } from "./agents/account-incubation/account-incubation-agent.js";
import { CommentAgent } from "./agents/comment/comment-agent.js";
import { ContentAgent } from "./agents/content/content-agent.js";
import { DataAnalysisAgent } from "./agents/data-analysis/data-analysis-agent.js";
import { PhaseZeroAgent } from "./agents/demo/phase-zero-agent.js";
import { HistoricalHyperFramesComposerAgent } from "./agents/historical-hyperframes-composer/historical-hyperframes-composer-agent.js";
import { HistoricalShortVideoAgent } from "./agents/historical-short-video/historical-short-video-agent.js";
import { HistoricalVideoProjectAgent } from "./agents/historical-video-project/historical-video-project-agent.js";
import { LiveAgent } from "./agents/live/live-agent.js";
import { WeChatChannelPublisherAgent } from "./agents/publishing/wechat-channel-publisher-agent.js";
import { ProductAgent } from "./agents/product/product-agent.js";
import { ScriptAgent } from "./agents/script/script-agent.js";
import { EchoLlmProvider } from "./services/llm/echo-llm-provider.js";
import type { LlmProvider } from "./services/llm/llm-provider.js";
import { UnavailableLlmProvider } from "./services/llm/unavailable-llm-provider.js";
import { MetricsService } from "./services/metrics/metrics-service.js";
import { PromptLoader } from "./services/prompts/prompt-loader.js";
import { FileRunStore } from "./services/storage/file-run-store.js";
import { WorkflowRepository } from "./workflows/workflow-repository.js";
import { WorkflowRunner } from "./workflows/workflow-runner.js";

export interface RuntimeOptions {
  workflowsDirectory: string;
  runsDirectory: string;
  businessProvider?: LlmProvider;
}

export function createRuntime(options: RuntimeOptions) {
  const promptLoader = new PromptLoader();
  const registry = new AgentRegistry();
  registry.register(new PhaseZeroAgent(new EchoLlmProvider(), promptLoader));
  const businessProvider =
    options.businessProvider ?? new UnavailableLlmProvider();
  registry.register(new AccountIncubationAgent(businessProvider, promptLoader));
  registry.register(new HistoricalShortVideoAgent(businessProvider, promptLoader));
  registry.register(new HistoricalVideoProjectAgent({}, promptLoader));
  registry.register(new HistoricalHyperFramesComposerAgent({}, promptLoader));
  registry.register(new ProductAgent(businessProvider, promptLoader));
  registry.register(new ContentAgent(businessProvider, promptLoader));
  registry.register(new ScriptAgent(businessProvider, promptLoader));
  registry.register(new LiveAgent(businessProvider, promptLoader));
  registry.register(new CommentAgent(businessProvider, promptLoader));
  registry.register(new WeChatChannelPublisherAgent({}, promptLoader));
  registry.register(
    new DataAnalysisAgent(
      businessProvider,
      promptLoader,
      new MetricsService(),
    ),
  );

  const runStore = new FileRunStore(options.runsDirectory);
  const workflowRepository = new WorkflowRepository(
    options.workflowsDirectory,
  );
  const workflowRunner = new WorkflowRunner(registry, runStore);

  return {
    registry,
    runStore,
    workflowRepository,
    workflowRunner,
  };
}

export const createPhaseZeroRuntime = createRuntime;
