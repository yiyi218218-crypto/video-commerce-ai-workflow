import { describe, expect, it } from "vitest";

import { DataAnalysisAgent } from "../../src/agents/data-analysis/data-analysis-agent.js";
import { AgentContractConsistencyError } from "../../src/errors.js";
import { MetricsService } from "../../src/services/metrics/metrics-service.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import {
  sampleDataAnalysisInput,
  sampleDataAnalysisModelOutput,
} from "../fixtures/data-analysis.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

describe("DataAnalysisAgent contract", () => {
  it("combines a deterministic metric snapshot with model diagnosis", async () => {
    const provider = new ScriptedLlmProvider([
      sampleDataAnalysisModelOutput,
    ]);
    const metricsService = new MetricsService();
    const agent = new DataAnalysisAgent(
      provider,
      new PromptLoader(),
      metricsService,
    );

    const output = await agent.run(sampleDataAnalysisInput);

    expect(output.metrics_snapshot).toEqual(
      metricsService.calculate(sampleDataAnalysisInput),
    );
    expect(output.analysis).toEqual(sampleDataAnalysisModelOutput);
    expect(provider.requests[0]?.outputSchemaName).toBe(
      "data_analysis_model_output",
    );
    expect(provider.requests[0]?.input).toMatchObject({
      video: sampleDataAnalysisInput,
      derived_metrics: output.metrics_snapshot,
    });

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "data_analysis_agent",
      version: "1.0.0",
    });
  });

  it("rejects high-confidence conclusions from a low sample", async () => {
    const provider = new ScriptedLlmProvider([
      sampleDataAnalysisModelOutput,
    ]);
    const agent = new DataAnalysisAgent(
      provider,
      new PromptLoader(),
      new MetricsService(),
    );
    const lowSampleInput = structuredClone(sampleDataAnalysisInput);
    lowSampleInput.metrics = {
      views: 50,
      completion_rate: 0.42,
      likes: 3,
      comments: 1,
      saves: 1,
      shares: 0,
      product_clicks: 2,
      add_to_carts: 1,
      orders: 0,
      revenue: 0,
    };

    await expect(agent.run(lowSampleInput)).rejects.toBeInstanceOf(
      AgentContractConsistencyError,
    );
  });
});
