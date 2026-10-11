import { z } from "zod";

import {
  selectionCandidateSchema,
  selectionRecommendationSchema,
} from "./product-selection.schema.js";
import {
  creativeDirectorOutputSchema,
  creativeRouteSchema,
} from "./creative-production.schema.js";

const videoAssetSchema = z
  .object({
    relative_path: z.string().min(1),
    media_type: z.string().min(1),
  })
  .strict();

const productVideoCreativeSceneSchema = z
  .object({
    start_second: z.number().nonnegative().max(60),
    end_second: z.number().positive().max(60),
    beat: z.enum(["contradiction", "test", "proof", "invitation"]),
    kicker: z.string().min(1),
    headline: z.string().min(1),
    subline: z.string().min(1),
    motion: z.enum(["overexpose", "push", "blocks", "dip"]),
  })
  .strict();

const productVideoCreativeBriefSchema = z
  .object({
    format: z.literal("hyperframes_product_story"),
    composition_id: z.string().min(1),
    duration_seconds: z.number().int().min(15).max(60),
    visual_identity: z
      .object({
        background: z.string().min(1),
        foreground: z.string().min(1),
        accent: z.string().min(1),
        secondary: z.string().min(1),
        muted: z.string().min(1),
      })
      .strict(),
    anti_ad_rules: z.array(z.string().min(1)).min(1),
    scenes: z.array(productVideoCreativeSceneSchema).length(4),
  })
  .strict();

const hyperframesProjectSchema = z
  .object({
    composition_id: z.string().min(1),
    entry_relative_path: z.string().min(1),
    design_relative_path: z.string().min(1),
    config_relative_path: z.string().min(1),
    render_note: z.string().min(1),
  })
  .strict();

export const createProductVideoProjectRequestSchema = z
  .object({
    batch_id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    creative_route: creativeRouteSchema.optional(),
  })
  .strict();

export const autoCreateProductVideosRequestSchema = z
  .object({
    maximum_projects: z.number().int().min(1).max(5).default(3),
    minimum_score: z.number().int().min(0).max(100).default(70),
    recommendation_levels: z
      .array(
        z.enum(["priority_test", "small_test", "watch", "reject"]),
      )
      .min(1)
      .max(4)
      .default(["priority_test", "small_test"]),
    creative_routes: z
      .array(creativeRouteSchema)
      .min(1)
      .max(3)
      .default(["life_problem"]),
    render: z.boolean().default(true),
    render_quality: z.enum(["draft", "standard", "high"]).default("draft"),
  })
  .strict();

export const renderProductVideoProjectRequestSchema = z
  .object({
    render_quality: z.enum(["draft", "standard", "high"]).default("standard"),
  })
  .strict();

export const productVideoProjectSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["prepared", "video_ready"]),
    batch_id: z.string().uuid(),
    candidate: selectionCandidateSchema,
    recommendation: selectionRecommendationSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    directory_path: z.string().min(1),
    assets: z
      .object({
        image: videoAssetSchema,
        gallery: z.array(videoAssetSchema).min(1).max(12).optional(),
        narration: videoAssetSchema.optional(),
        bgm: videoAssetSchema.optional(),
      })
      .strict(),
    creative_brief: productVideoCreativeBriefSchema.optional(),
    creative_production: creativeDirectorOutputSchema.optional(),
    hyperframes: hyperframesProjectSchema.optional(),
    rendered_video: z
      .object({
        relative_path: z.string().min(1),
        media_type: z.enum(["video/webm", "video/mp4"]),
        size_bytes: z.number().int().positive(),
      })
      .strict()
      .optional(),
    warnings: z.array(z.string().min(1)),
    files: z.array(z.string().min(1)).min(4),
  })
  .strict();

export type CreateProductVideoProjectRequest = z.infer<
  typeof createProductVideoProjectRequestSchema
>;
export type AutoCreateProductVideosRequest = z.infer<
  typeof autoCreateProductVideosRequestSchema
>;
export type RenderProductVideoProjectRequest = z.infer<
  typeof renderProductVideoProjectRequestSchema
>;
export type ProductVideoProject = z.infer<
  typeof productVideoProjectSchema
>;
