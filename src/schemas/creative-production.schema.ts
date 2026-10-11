import { z } from "zod";

import {
  selectionAnalysisProfileSchema,
  selectionCandidateSchema,
  selectionRecommendationSchema,
} from "./product-selection.schema.js";

export const creativeRouteSchema = z.enum([
  "life_problem",
  "real_test",
  "identity",
  "tutorial",
  "contrast",
]);

const beatSchema = z
  .object({
    start_second: z.number().nonnegative().max(60),
    end_second: z.number().positive().max(60),
    story_role: z.enum(["hook", "tension", "demonstration", "proof", "invitation"]),
    viewer_emotion: z.string().trim().min(1).max(40),
    shot_type: z.enum(["detail", "wide", "pov", "overhead", "close_up", "graphic"]),
    action: z.string().trim().min(1).max(100),
    product_visibility: z.enum(["none", "brief", "hero"]),
    voiceover: z.string().trim().min(1).max(48),
    on_screen_text: z.string().trim().min(1).max(12),
    transition: z.enum(["cut", "match_cut", "whip", "flash", "hold"]),
  })
  .strict();

const captionSchema = z
  .object({
    start_second: z.number().nonnegative().max(60),
    end_second: z.number().positive().max(60),
    text: z.string().trim().min(1).max(12),
    emphasis: z.enum(["none", "key_word", "punchline"]),
  })
  .strict();

const assetRequirementSchema = z
  .object({
    kind: z.enum(["product_detail", "product_in_use", "scene", "voiceover", "bgm", "sfx"]),
    purpose: z.string().trim().min(1).max(100),
    required: z.boolean(),
  })
  .strict();

export const creativeDirectorInputSchema = z
  .object({
    profile: selectionAnalysisProfileSchema,
    candidate: selectionCandidateSchema,
    recommendation: selectionRecommendationSchema,
    route_hint: creativeRouteSchema.optional(),
  })
  .strict();

export const creativeDirectorOutputSchema = z
  .object({
    creative_route: creativeRouteSchema,
    one_sentence_promise: z.string().trim().min(1).max(80),
    emotional_arc: z.string().trim().min(1).max(100),
    display_name: z.string().trim().min(1).max(24),
    production_readiness: z.enum(["ready", "needs_assets"]),
    asset_requirements: z.array(assetRequirementSchema).min(3).max(8),
    beats: z.array(beatSchema).length(5),
    captions: z.array(captionSchema).min(5).max(10),
    bgm_direction: z.string().trim().min(1).max(120),
    sfx_cues: z.array(z.string().trim().min(1).max(80)).min(1).max(5),
    facts_to_verify: z.array(z.string().trim().min(1).max(120)).max(10),
  })
  .strict();

export type CreativeDirectorInput = z.infer<typeof creativeDirectorInputSchema>;
export type CreativeDirectorOutput = z.infer<typeof creativeDirectorOutputSchema>;
