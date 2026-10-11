import { isDeepStrictEqual } from "node:util";

import {
  dataAnalysisInputSchema,
  dataAnalysisOutputSchema,
  type DataAnalysisModelOutput,
  type DataAnalysisOutput,
} from "../../schemas/data-analysis.schema.js";
import { MetricsService } from "../metrics/metrics-service.js";
import type { DimensionScore } from "./phase-one-evaluator.js";

export interface DataAnalysisEvaluation {
  hardGates: {
    inputSchemaValid: boolean;
    outputSchemaValid: boolean;
    deterministicMetricsMatch: boolean;
    sampleCautionRespected: boolean;
    insufficientDataRespected: boolean;
    evidencePresent: boolean;
    noCausalOverclaim: boolean;
    experimentPrioritiesUnique: boolean;
  };
  dataIntegrity: DimensionScore;
  diagnosticQuality: DimensionScore;
  actionability: DimensionScore;
  experimentalRigor: DimensionScore;
  overallScore: number;
  passed: boolean;
}

const causalOverclaimPhrases = [
  "一定是",
  "证明了",
  "必然",
  "就是因为",
  "唯一原因",
  "百分之百",
];

export function evaluateDataAnalysisArtifact(
  rawInput: unknown,
  rawOutput: unknown,
): DataAnalysisEvaluation {
  const input = dataAnalysisInputSchema.safeParse(rawInput);
  const output = dataAnalysisOutputSchema.safeParse(rawOutput);
  const expectedMetrics = input.success
    ? new MetricsService().calculate(input.data)
    : undefined;
  const deterministicMetricsMatch =
    output.success &&
    expectedMetrics !== undefined &&
    isDeepStrictEqual(output.data.metrics_snapshot, expectedMetrics);
  const sampleCautionRespected =
    input.success &&
    output.success &&
    respectsSampleCaution(output.data);
  const insufficientDataRespected =
    input.success &&
    output.success &&
    respectsInsufficientData(output.data);
  const evidencePresent =
    output.success && hasDiagnosisEvidence(output.data.analysis);
  const noCausalOverclaim =
    output.success && !containsCausalOverclaim(output.data.analysis);
  const experimentPrioritiesUnique =
    output.success && hasUniqueExperimentPriorities(output.data.analysis);

  const dataIntegrity =
    input.success && output.success
      ? scoreDataIntegrity(
          output.data,
          deterministicMetricsMatch,
          sampleCautionRespected,
          insufficientDataRespected,
        )
      : invalidDimension("Input or output schema is invalid.");
  const diagnosticQuality = output.success
    ? scoreDiagnosticQuality(
        output.data.analysis,
        evidencePresent,
        noCausalOverclaim,
      )
    : invalidDimension("Data Analysis output schema is invalid.");
  const actionability = output.success
    ? scoreActionability(output.data.analysis)
    : invalidDimension("Data Analysis output schema is invalid.");
  const experimentalRigor = output.success
    ? scoreExperimentalRigor(
        output.data.analysis,
        experimentPrioritiesUnique,
      )
    : invalidDimension("Data Analysis output schema is invalid.");
  const scores = [
    dataIntegrity.score,
    diagnosticQuality.score,
    actionability.score,
    experimentalRigor.score,
  ];
  const overallScore = round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  const allHardGates = [
    input.success,
    output.success,
    deterministicMetricsMatch,
    sampleCautionRespected,
    insufficientDataRespected,
    evidencePresent,
    noCausalOverclaim,
    experimentPrioritiesUnique,
  ].every(Boolean);

  return {
    hardGates: {
      inputSchemaValid: input.success,
      outputSchemaValid: output.success,
      deterministicMetricsMatch,
      sampleCautionRespected,
      insufficientDataRespected,
      evidencePresent,
      noCausalOverclaim,
      experimentPrioritiesUnique,
    },
    dataIntegrity,
    diagnosticQuality,
    actionability,
    experimentalRigor,
    overallScore,
    passed: allHardGates && overallScore >= 3.5,
  };
}

function respectsSampleCaution(output: DataAnalysisOutput): boolean {
  const sample = output.metrics_snapshot.sample_quality;
  if (sample !== "insufficient" && sample !== "low") {
    return true;
  }
  return output.analysis.performance_summary.confidence !== "high";
}

function respectsInsufficientData(output: DataAnalysisOutput): boolean {
  if (output.metrics_snapshot.data_quality.usable) {
    return true;
  }
  return (
    output.analysis.performance_summary.verdict === "insufficient_data"
  );
}

function hasDiagnosisEvidence(
  analysis: DataAnalysisModelOutput,
): boolean {
  const stages = Object.values(analysis.funnel_diagnosis);
  const supportedStages = stages.filter(
    (stage) => stage.status === "unknown" || stage.evidence.length > 0,
  );
  return (
    supportedStages.length === stages.length &&
    analysis.hypotheses.every(
      (hypothesis) => hypothesis.evidence.length > 0,
    )
  );
}

function containsCausalOverclaim(
  analysis: DataAnalysisModelOutput,
): boolean {
  const text = JSON.stringify(analysis);
  return causalOverclaimPhrases.some((phrase) => text.includes(phrase));
}

function hasUniqueExperimentPriorities(
  analysis: DataAnalysisModelOutput,
): boolean {
  const priorities = analysis.experiments.map(
    (experiment) => experiment.priority,
  );
  return new Set(priorities).size === priorities.length;
}

function scoreDataIntegrity(
  output: DataAnalysisOutput,
  metricsMatch: boolean,
  sampleCaution: boolean,
  insufficientData: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (metricsMatch) {
    score += 2;
    reasons.push("The metrics snapshot exactly matches deterministic calculations.");
  }
  if (sampleCaution) {
    score += 1;
    reasons.push("Confidence is calibrated to sample quality.");
  }
  if (insufficientData) {
    score += 0.5;
    reasons.push("Unusable data is handled as insufficient evidence.");
  }
  if (
    output.metrics_snapshot.data_quality.usable ||
    output.analysis.do_not_conclude.length > 0
  ) {
    score += 0.5;
    reasons.push("Data limitations are represented in the artifact.");
  }

  return { score: clampScore(score), reasons };
}

function scoreDiagnosticQuality(
  analysis: DataAnalysisModelOutput,
  evidencePresent: boolean,
  noCausalOverclaim: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];
  const knownStages = Object.values(analysis.funnel_diagnosis).filter(
    (stage) => stage.status !== "unknown",
  );

  if (evidencePresent) {
    score += 1.5;
    reasons.push("Every asserted funnel diagnosis includes evidence.");
  }
  if (knownStages.length >= 3) {
    score += 1;
    reasons.push("The diagnosis covers at least three observable funnel stages.");
  }
  if (analysis.hypotheses.length >= 2) {
    score += 0.75;
    reasons.push("Multiple testable explanations are separated from facts.");
  }
  if (noCausalOverclaim) {
    score += 0.75;
    reasons.push("No configured causal overclaim was detected.");
  }

  return { score: clampScore(score), reasons };
}

function scoreActionability(
  analysis: DataAnalysisModelOutput,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];
  const plan = analysis.next_video_plan;

  if (plan.change.length >= 2) {
    score += 1;
    reasons.push("The next-video plan contains concrete changes.");
  }
  if (plan.keep.length > 0) {
    score += 0.75;
    reasons.push("Successful elements are explicitly preserved.");
  }
  if (
    plan.hook_direction.length >= 8 &&
    plan.structure_direction.length >= 8 &&
    plan.conversion_direction.length >= 8
  ) {
    score += 1.25;
    reasons.push("Hook, structure, and conversion directions are actionable.");
  }
  if (analysis.optimization_brief.length >= 40) {
    score += 1;
    reasons.push("The optimization brief is detailed enough for Content Agent handoff.");
  }

  return { score: clampScore(score), reasons };
}

function scoreExperimentalRigor(
  analysis: DataAnalysisModelOutput,
  prioritiesUnique: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (prioritiesUnique) {
    score += 1;
    reasons.push("Experiment priorities are unique.");
  }
  if (analysis.experiments.length >= 2) {
    score += 1;
    reasons.push("At least two experiments are available for iteration.");
  }
  if (
    analysis.experiments.every(
      (experiment) =>
        experiment.change_one_variable.length >= 4 &&
        experiment.control_metric.length >= 2,
    )
  ) {
    score += 1;
    reasons.push("Each experiment names one changed variable and a control metric.");
  }
  if (
    analysis.experiments.every(
      (experiment) =>
        experiment.success_criterion.length >= 4 &&
        experiment.minimum_sample.length >= 3,
    )
  ) {
    score += 1;
    reasons.push("Every experiment defines success and a minimum sample.");
  }

  return { score: clampScore(score), reasons };
}

function invalidDimension(reason: string): DimensionScore {
  return { score: 1, reasons: [reason] };
}

function clampScore(score: number): number {
  return round(Math.min(5, Math.max(1, score)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
