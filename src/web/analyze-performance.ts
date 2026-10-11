import {
  dataAnalysisInputSchema,
  type DerivedMetrics,
} from "../schemas/data-analysis.schema.js";
import { MetricsService } from "../services/metrics/metrics-service.js";

export interface AnalyzePerformanceSuccess {
  ok: true;
  data: {
    video_id: string;
    title: string;
    metrics_snapshot: DerivedMetrics;
  };
}

export interface AnalyzePerformanceFailure {
  ok: false;
  error: string;
  issues: Array<{
    path: string;
    message: string;
  }>;
}

export type AnalyzePerformanceResult =
  | AnalyzePerformanceSuccess
  | AnalyzePerformanceFailure;

export function analyzePerformance(
  rawInput: unknown,
): AnalyzePerformanceResult {
  const input = dataAnalysisInputSchema.safeParse(rawInput);
  if (!input.success) {
    return {
      ok: false,
      error: "视频数据未通过校验，请检查必填项和数值范围。",
      issues: input.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  return {
    ok: true,
    data: {
      video_id: input.data.video_id,
      title: input.data.title,
      metrics_snapshot: new MetricsService().calculate(input.data),
    },
  };
}
