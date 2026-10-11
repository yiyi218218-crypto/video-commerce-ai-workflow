import {
  dataAnalysisInputSchema,
  dataAnalysisModelOutputSchema,
  dataAnalysisOutputSchema,
  type DataAnalysisInput,
  type DataAnalysisModelOutput,
  type DataAnalysisOutput,
  type DerivedMetrics,
} from "../../schemas/data-analysis.schema.js";
import {
  AgentContractConsistencyError,
  AgentInputValidationError,
} from "../../errors.js";
import type { LlmProvider } from "../../services/llm/llm-provider.js";
import { StructuredGenerationService } from "../../services/llm/structured-generation-service.js";
import type { MetricsService } from "../../services/metrics/metrics-service.js";
import {
  type PromptReference,
  type PromptSource,
} from "../../services/prompts/prompt-loader.js";
import type {
  AgentDescriptor,
  ContractAgent,
} from "../agent.js";

export class DataAnalysisAgent
  implements ContractAgent<DataAnalysisInput, DataAnalysisOutput>
{
  readonly name = "data_analysis_agent";
  readonly inputSchema = dataAnalysisInputSchema;
  readonly outputSchema = dataAnalysisOutputSchema;
  readonly prompt: PromptReference = {
    id: "data_analysis_agent",
    version: "1.0.0",
    file: new URL(
      "../../prompts/data-analysis-agent.md",
      import.meta.url,
    ),
  };

  private readonly generationService: StructuredGenerationService;

  constructor(
    provider: LlmProvider,
    private readonly promptLoader: PromptSource,
    private readonly metricsService: MetricsService,
  ) {
    this.generationService = new StructuredGenerationService(provider);
  }

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

  async run(rawInput: DataAnalysisInput): Promise<DataAnalysisOutput> {
    const parsedInput = this.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new AgentInputValidationError(
        this.name,
        parsedInput.error.issues,
      );
    }

    const metricsSnapshot = this.metricsService.calculate(
      parsedInput.data,
    );
    const prompt = await this.promptLoader.load(this.prompt);
    const analysis = await this.generationService.generate({
      agentName: this.name,
      systemPrompt: prompt.content,
      input: {
        video: parsedInput.data,
        derived_metrics: metricsSnapshot,
      },
      outputSchemaName: "data_analysis_model_output",
      outputSchema: dataAnalysisModelOutputSchema,
    });

    assertAnalysisConsistency(this.name, metricsSnapshot, analysis);

    return this.outputSchema.parse({
      metrics_snapshot: metricsSnapshot,
      analysis,
    });
  }
}

function assertAnalysisConsistency(
  agentName: string,
  metrics: DerivedMetrics,
  analysis: DataAnalysisModelOutput,
): void {
  if (
    !metrics.data_quality.usable &&
    analysis.performance_summary.verdict !== "insufficient_data"
  ) {
    throw new AgentContractConsistencyError(
      agentName,
      "unusable metric data must produce an insufficient_data verdict.",
    );
  }

  if (
    (metrics.sample_quality === "insufficient" ||
      metrics.sample_quality === "low") &&
    analysis.performance_summary.confidence === "high"
  ) {
    throw new AgentContractConsistencyError(
      agentName,
      "a low-quality sample cannot produce high confidence.",
    );
  }

  const priorities = analysis.experiments.map(
    (experiment) => experiment.priority,
  );
  if (new Set(priorities).size !== priorities.length) {
    throw new AgentContractConsistencyError(
      agentName,
      "experiment priorities must be unique.",
    );
  }
}
