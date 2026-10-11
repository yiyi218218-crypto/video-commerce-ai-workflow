import { z } from "zod";

import {
  directionIdSchema,
} from "./content-agent.schema.js";

const rateSchema = z.number().min(0).max(1);

export const videoPerformanceMetricsSchema = z
  .object({
    views: z.number().int().nonnegative(),
    completion_rate: rateSchema,
    likes: z.number().int().nonnegative(),
    comments: z.number().int().nonnegative(),
    saves: z.number().int().nonnegative(),
    shares: z.number().int().nonnegative().default(0),
    product_clicks: z.number().int().nonnegative().optional(),
    add_to_carts: z.number().int().nonnegative().optional(),
    orders: z.number().int().nonnegative(),
    revenue: z.number().nonnegative().optional(),
  })
  .strict();

const accountBaselineSchema = z
  .object({
    average_views: z.number().nonnegative().optional(),
    completion_rate: rateSchema.optional(),
    like_rate: rateSchema.optional(),
    comment_rate: rateSchema.optional(),
    save_rate: rateSchema.optional(),
    share_rate: rateSchema.optional(),
    click_rate: rateSchema.optional(),
    order_rate: rateSchema.optional(),
  })
  .strict();

export const dataAnalysisInputSchema = z
  .object({
    video_id: z.string().min(1),
    title: z.string().min(1),
    published_at: z.string().datetime().optional(),
    duration_seconds: z.number().positive(),
    selected_direction_id: directionIdSchema.optional(),
    content_context: z
      .object({
        hook: z.string().min(1).optional(),
        theme: z.string().min(1).optional(),
        narrative_mode: z
          .enum([
            "story",
            "conflict",
            "pain_point",
            "identity",
            "emotional_value",
          ])
          .optional(),
        product_appearance_second: z.number().nonnegative().optional(),
        call_to_action: z.string().min(1).optional(),
      })
      .strict()
      .default({}),
    metrics: videoPerformanceMetricsSchema,
    baseline: accountBaselineSchema.optional(),
    operator_notes: z.array(z.string().min(1)).default([]),
  })
  .strict();

const nullableMetricSchema = z.number().nullable();

export const derivedMetricsSchema = z
  .object({
    views: z.number().int().nonnegative(),
    estimated_completions: z.number().int().nonnegative(),
    rates: z
      .object({
        completion_rate: rateSchema,
        like_rate: z.number().nonnegative(),
        comment_rate: z.number().nonnegative(),
        save_rate: z.number().nonnegative(),
        share_rate: z.number().nonnegative(),
        click_rate: nullableMetricSchema,
        add_to_cart_rate: nullableMetricSchema,
        order_rate_per_view: z.number().nonnegative(),
        order_rate_per_click: nullableMetricSchema,
      })
      .strict(),
    revenue: z
      .object({
        total: nullableMetricSchema,
        per_thousand_views: nullableMetricSchema,
        average_order_value: nullableMetricSchema,
      })
      .strict(),
    baseline_comparison: z
      .object({
        view_index: nullableMetricSchema,
        completion_rate_delta: nullableMetricSchema,
        like_rate_delta: nullableMetricSchema,
        comment_rate_delta: nullableMetricSchema,
        save_rate_delta: nullableMetricSchema,
        share_rate_delta: nullableMetricSchema,
        click_rate_delta: nullableMetricSchema,
        order_rate_delta: nullableMetricSchema,
      })
      .strict(),
    sample_quality: z.enum(["insufficient", "low", "medium", "high"]),
    data_quality: z
      .object({
        usable: z.boolean(),
        warnings: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

const stageDiagnosisSchema = z
  .object({
    status: z.enum(["strong", "neutral", "weak", "unknown"]),
    evidence: z.array(z.string().min(1)),
    interpretation: z.string().min(1),
  })
  .strict();

export const dataAnalysisModelOutputSchema = z
  .object({
    performance_summary: z
      .object({
        verdict: z.enum([
          "breakout",
          "strong",
          "average",
          "weak",
          "insufficient_data",
        ]),
        summary: z.string().min(1),
        confidence: z.enum(["low", "medium", "high"]),
      })
      .strict(),
    funnel_diagnosis: z
      .object({
        hook: stageDiagnosisSchema,
        retention: stageDiagnosisSchema,
        engagement: stageDiagnosisSchema,
        trust: stageDiagnosisSchema,
        conversion: stageDiagnosisSchema,
      })
      .strict(),
    success_factors: z.array(z.string().min(1)).max(8),
    failure_factors: z.array(z.string().min(1)).max(8),
    hypotheses: z
      .array(
        z
          .object({
            hypothesis: z.string().min(1),
            evidence: z.array(z.string().min(1)).min(1),
            confidence: z.enum(["low", "medium", "high"]),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    next_video_plan: z
      .object({
        primary_goal: z.string().min(1),
        keep: z.array(z.string().min(1)),
        change: z.array(z.string().min(1)).min(1),
        hook_direction: z.string().min(1),
        structure_direction: z.string().min(1),
        conversion_direction: z.string().min(1),
      })
      .strict(),
    experiments: z
      .array(
        z
          .object({
            priority: z.number().int().min(1).max(5),
            hypothesis: z.string().min(1),
            change_one_variable: z.string().min(1),
            control_metric: z.string().min(1),
            success_criterion: z.string().min(1),
            minimum_sample: z.string().min(1),
          })
          .strict(),
      )
      .min(2)
      .max(5),
    do_not_conclude: z.array(z.string().min(1)).min(1).max(8),
    optimization_brief: z.string().min(1),
  })
  .strict();

export const dataAnalysisOutputSchema = z
  .object({
    metrics_snapshot: derivedMetricsSchema,
    analysis: dataAnalysisModelOutputSchema,
  })
  .strict();

export type DataAnalysisInput = z.infer<typeof dataAnalysisInputSchema>;
export type DerivedMetrics = z.infer<typeof derivedMetricsSchema>;
export type DataAnalysisModelOutput = z.infer<
  typeof dataAnalysisModelOutputSchema
>;
export type DataAnalysisOutput = z.infer<typeof dataAnalysisOutputSchema>;
