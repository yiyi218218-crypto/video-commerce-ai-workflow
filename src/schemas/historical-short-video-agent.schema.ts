import { z } from "zod";

export const historicalShortVideoLaneSchema = z.enum([
  "historical_anecdote",
  "strategy_case",
  "literature_explainer",
  "landscape_culture",
]);

export const historicalShortVideoDurationSchema = z.union([
  z.literal(45),
  z.literal(60),
]);

export const historicalShortVideoInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(80).optional(),
    lane: historicalShortVideoLaneSchema.default("historical_anecdote"),
    duration_seconds: historicalShortVideoDurationSchema.default(60),
    target_audience: z
      .array(z.string().trim().min(1).max(40))
      .min(1)
      .max(5)
      .default(["历史兴趣用户", "谋略内容受众"]),
    account: z
      .object({
        display_name: z.string().trim().min(1).max(80).default("星轨潮汐."),
        positioning: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .default("历史典故、谋略和人文解说内容号"),
      })
      .strict()
      .default({
        display_name: "星轨潮汐.",
        positioning: "历史典故、谋略和人文解说内容号",
      }),
    style: z
      .object({
        narrator_voice: z
          .enum(["male_mandarin_documentary", "male_mandarin_calm"])
          .default("male_mandarin_documentary"),
        subtitle_mode: z.literal("sentence_chunks").default("sentence_chunks"),
        visual_style: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .default("电影感历史短剧，低饱和，克制镜头运动"),
      })
      .strict()
      .default({
        narrator_voice: "male_mandarin_documentary",
        subtitle_mode: "sentence_chunks",
        visual_style: "电影感历史短剧，低饱和，克制镜头运动",
      }),
    must_avoid: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([
        "硬广",
        "逐字字幕",
        "重复图片",
        "无内容日常",
        "地图动效杂乱",
        "紧迫感推销配音",
      ]),
  })
  .strict();

const timedTextSchema = z
  .object({
    start_second: z.number().nonnegative().max(60),
    end_second: z.number().positive().max(60),
    text: z.string().trim().min(1).max(38),
  })
  .strict();

const sourceCheckSchema = z
  .object({
    source_name: z.string().trim().min(1).max(80),
    claim_to_check: z.string().trim().min(1).max(160),
    use_in_video: z.enum(["direct_basis", "context", "interpretation_guard"]),
  })
  .strict();

const sceneSchema = z
  .object({
    scene_id: z.string().trim().min(1).max(40),
    start_second: z.number().nonnegative().max(60),
    end_second: z.number().positive().max(60),
    story_role: z.enum([
      "hook",
      "setup",
      "conflict",
      "turning_point",
      "interpretation",
      "takeaway",
    ]),
    scene_title: z.string().trim().min(1).max(30),
    narration: z.string().trim().min(1).max(120),
    caption: z.string().trim().min(1).max(38),
    visual_prompt: z.string().trim().min(30).max(400),
    camera_motion: z.enum([
      "slow_push_in",
      "locked_off",
      "parallax_drift",
      "slow_pan",
      "detail_reveal",
    ]),
    on_screen_detail: z.string().trim().min(1).max(40),
    sfx: z.string().trim().min(1).max(60),
  })
  .strict();

export const historicalShortVideoOutputSchema = z
  .object({
    topic: z.string().trim().min(1).max(80),
    lane: historicalShortVideoLaneSchema,
    duration_seconds: historicalShortVideoDurationSchema,
    short_title: z.string().trim().min(6).max(30),
    cold_open: z.string().trim().min(1).max(80),
    one_sentence_promise: z.string().trim().min(1).max(120),
    core_conflict: z.string().trim().min(1).max(160),
    strategic_takeaway: z.string().trim().min(1).max(160),
    uncertainty_notes: z.array(z.string().trim().min(1).max(160)).min(1).max(5),
    sources_to_check: z.array(sourceCheckSchema).min(2).max(6),
    narration: z
      .object({
        voice_profile: z.enum([
          "male_mandarin_documentary",
          "male_mandarin_calm",
        ]),
        tone: z.string().trim().min(1).max(80),
        full_script: z.string().trim().min(80).max(1_200),
      })
      .strict(),
    storyboard: z.array(sceneSchema).min(5).max(8),
    subtitle_plan: z.array(timedTextSchema).min(5).max(14),
    audio_plan: z
      .object({
        bgm_direction: z.string().trim().min(1).max(160),
        voice_mix: z.string().trim().min(1).max(160),
        sfx_cues: z.array(z.string().trim().min(1).max(80)).min(3).max(8),
      })
      .strict(),
    render_plan: z
      .object({
        format: z.literal("vertical_9_16"),
        target_resolution: z.literal("1080x1920"),
        engine: z.literal("hyperframes"),
        quality_gates: z.array(z.string().trim().min(1).max(120)).min(5).max(12),
      })
      .strict(),
    publish_copy: z
      .object({
        description: z.string().trim().min(80).max(1_500),
        hashtags: z.array(z.string().trim().min(2).max(20)).min(3).max(8),
      })
      .strict(),
  })
  .strict();

export type HistoricalShortVideoLane = z.infer<
  typeof historicalShortVideoLaneSchema
>;
export type HistoricalShortVideoInput = z.infer<
  typeof historicalShortVideoInputSchema
>;
export type HistoricalShortVideoOutput = z.infer<
  typeof historicalShortVideoOutputSchema
>;
