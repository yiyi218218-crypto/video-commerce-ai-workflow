import { z } from "zod";

const httpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "URL must use HTTPS.",
  });

const wechatStoreUrlSchema = httpsUrlSchema.refine(
  (value) => new URL(value).hostname === "store.weixin.qq.com",
  {
    message: "Source page must be on store.weixin.qq.com.",
  },
);

export const selectionCandidateSchema = z
  .object({
    candidate_id: z.string().uuid(),
    product_name: z.string().trim().min(1).max(160),
    raw_text: z.string().trim().min(1).max(6_000),
    source_url: wechatStoreUrlSchema.optional(),
    image_url: httpsUrlSchema.optional(),
    // Detail-page images are captured only after the operator explicitly opens
    // the product detail page and requests a local capture. They are evidence
    // assets, not a substitute for real usage footage.
    gallery_image_urls: z.array(httpsUrlSchema).min(2).max(12).optional(),
    price_amount: z.number().positive().max(1_000_000).optional(),
    commission_rate: z.number().min(0).max(100).optional(),
    sold_count: z.number().int().nonnegative().optional(),
    rating: z.number().min(0).max(5).optional(),
    shop_name: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

export const captureSelectionCandidateGalleryRequestSchema = z
  .object({
    captured_at: z.string().datetime(),
    image_urls: z.array(httpsUrlSchema).min(2).max(12),
  })
  .strict();

export const importSelectionCandidatesRequestSchema = z
  .object({
    source_page_url: wechatStoreUrlSchema,
    captured_at: z.string().datetime(),
    candidates: z.array(selectionCandidateSchema).min(1).max(30),
  })
  .strict();

export const selectionAnalysisProfileSchema = z
  .object({
    channel_name: z.string().trim().min(1).max(80),
    target_audiences: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(8),
    preferred_categories: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([]),
    excluded_keywords: z
      .array(z.string().trim().min(1).max(80))
      .max(30)
      .default([]),
    content_strengths: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(8),
    minimum_commission_rate: z.number().min(0).max(100).optional(),
    price_range: z
      .object({
        minimum: z.number().nonnegative(),
        maximum: z.number().positive(),
      })
      .strict()
      .refine((value) => value.maximum >= value.minimum, {
        message: "Maximum price must be greater than or equal to minimum.",
      })
      .optional(),
  })
  .strict();

export const productSelectionAgentInputSchema = z
  .object({
    profile: selectionAnalysisProfileSchema,
    candidates: z.array(selectionCandidateSchema).min(1).max(30),
  })
  .strict();

const scoreDimensionsSchema = z
  .object({
    account_fit: z.number().int().min(0).max(20),
    demand_evidence: z.number().int().min(0).max(20),
    commission_value: z.number().int().min(0).max(20),
    content_potential: z.number().int().min(0).max(20),
    trust_and_safety: z.number().int().min(0).max(20),
  })
  .strict();

const videoCardSchema = z
  .object({
    start_second: z.number().nonnegative().max(15),
    end_second: z.number().positive().max(15),
    headline: z.string().min(1).max(36),
    subline: z.string().min(1).max(80),
    visual_treatment: z.enum([
      "product_reveal",
      "pain_point",
      "proof_focus",
      "call_to_action",
    ]),
  })
  .strict();

export const selectionRecommendationSchema = z
  .object({
    candidate_id: z.string().uuid(),
    product_name: z.string().min(1),
    overall_score: z.number().int().min(0).max(100),
    dimensions: scoreDimensionsSchema,
    recommendation_level: z.enum([
      "priority_test",
      "small_test",
      "watch",
      "reject",
    ]),
    reasons: z.array(z.string().min(1)).min(3).max(6),
    risk_flags: z.array(z.string().min(1)).max(8),
    facts_to_verify: z.array(z.string().min(1)).max(10),
    video_plan: z
      .object({
        duration_seconds: z.literal(15),
        hook: z.string().min(1).max(60),
        voiceover: z.string().min(1).max(90),
        cards: z.array(videoCardSchema).length(4),
        call_to_action: z.string().min(1).max(80),
      })
      .strict(),
  })
  .strict();

export const productSelectionAgentOutputSchema = z
  .object({
    top_pick_id: z.string().uuid(),
    ranking: z.array(selectionRecommendationSchema).min(1).max(10),
    portfolio_advice: z.string().min(1).max(800),
    data_limitations: z.array(z.string().min(1)).max(12),
  })
  .strict();

const selectionErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const selectionBatchStatusSchema = z.enum([
  "imported",
  "queued",
  "analyzing",
  "analyzed",
  "failed",
]);

export const selectionBatchSchema = z
  .object({
    id: z.string().uuid(),
    status: selectionBatchStatusSchema,
    source_page_url: wechatStoreUrlSchema,
    captured_at: z.string().datetime(),
    candidates: z.array(selectionCandidateSchema).min(1).max(30),
    analysis_profile: selectionAnalysisProfileSchema.optional(),
    analysis: productSelectionAgentOutputSchema.optional(),
    error: selectionErrorSchema.optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    completed_at: z.string().datetime().optional(),
  })
  .strict();

export type SelectionCandidate = z.infer<typeof selectionCandidateSchema>;
export type ImportSelectionCandidatesRequest = z.infer<
  typeof importSelectionCandidatesRequestSchema
>;
export type CaptureSelectionCandidateGalleryRequest = z.infer<
  typeof captureSelectionCandidateGalleryRequestSchema
>;
export type SelectionAnalysisProfile = z.infer<
  typeof selectionAnalysisProfileSchema
>;
export type ProductSelectionAgentInput = z.infer<
  typeof productSelectionAgentInputSchema
>;
export type SelectionRecommendation = z.infer<
  typeof selectionRecommendationSchema
>;
export type ProductSelectionAgentOutput = z.infer<
  typeof productSelectionAgentOutputSchema
>;
export type SelectionBatch = z.infer<typeof selectionBatchSchema>;
