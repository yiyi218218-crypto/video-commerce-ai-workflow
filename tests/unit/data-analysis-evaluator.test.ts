import { describe, expect, it } from "vitest";

import { evaluateDataAnalysisArtifact } from "../../src/services/evaluation/data-analysis-evaluator.js";
import { MetricsService } from "../../src/services/metrics/metrics-service.js";
import {
  sampleDataAnalysisInput,
  sampleDataAnalysisModelOutput,
} from "../fixtures/data-analysis.js";

function validOutput() {
  return {
    metrics_snapshot: new MetricsService().calculate(
      sampleDataAnalysisInput,
    ),
    analysis: structuredClone(sampleDataAnalysisModelOutput),
  };
}

describe("evaluateDataAnalysisArtifact", () => {
  it("passes a grounded and actionable analysis", () => {
    const result = evaluateDataAnalysisArtifact(
      sampleDataAnalysisInput,
      validOutput(),
    );

    expect(result.hardGates).toEqual({
      inputSchemaValid: true,
      outputSchemaValid: true,
      deterministicMetricsMatch: true,
      sampleCautionRespected: true,
      insufficientDataRespected: true,
      evidencePresent: true,
      noCausalOverclaim: true,
      experimentPrioritiesUnique: true,
    });
    expect(result.dataIntegrity.score).toBe(5);
    expect(result.overallScore).toBeGreaterThanOrEqual(4);
    expect(result.passed).toBe(true);
  });

  it("fails when model-facing output alters a deterministic metric", () => {
    const output = validOutput();
    output.metrics_snapshot.rates.like_rate = 0.99;

    const result = evaluateDataAnalysisArtifact(
      sampleDataAnalysisInput,
      output,
    );

    expect(result.hardGates.deterministicMetricsMatch).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails causal certainty language even when the schema is valid", () => {
    const output = validOutput();
    output.analysis.performance_summary.summary =
      "数据证明了成交增长就是因为这个Hook。";

    const result = evaluateDataAnalysisArtifact(
      sampleDataAnalysisInput,
      output,
    );

    expect(result.hardGates.noCausalOverclaim).toBe(false);
    expect(result.passed).toBe(false);
  });
});
