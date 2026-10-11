import { z } from "zod";

import { accountOperationProfileSchema } from "./account-operation.schema.js";

export const incubationWindowIdSchema = z.enum([
  "early_morning",
  "midday",
  "evening",
]);

const launchContextSchema = z
  .object({
    presenter: z.string().trim().min(1).max(60),
    accessible_scenes: z.array(z.string().trim().min(1).max(80)).min(3).max(8),
    available_capture_methods: z
      .array(z.enum(["phone", "tripod", "voice_over", "family_member"]))
      .min(1)
      .max(4),
    first_week_goal: z.enum([
      "account_tag",
      "comment_signal",
      "completion_signal",
    ]),
  })
  .strict();

export const accountIncubationInputSchema = z
  .object({
    profile: accountOperationProfileSchema,
    launch_context: launchContextSchema,
  })
  .strict();

const contentPillarSchema = z
  .object({
    name: z.string().trim().min(1).max(32),
    audience_need: z.string().trim().min(1).max(100),
    content_boundary: z.string().trim().min(1).max(160),
    proof_style: z.string().trim().min(1).max(120),
  })
  .strict();

const scheduleSlotSchema = z
  .object({
    publish_window_id: incubationWindowIdSchema,
    pillar_name: z.string().trim().min(1).max(32),
    topic: z.string().trim().min(1).max(80),
    audience_question: z.string().trim().min(1).max(80),
    learning_hypothesis: z.string().trim().min(1).max(120),
  })
  .strict();

const weeklyDaySchema = z
  .object({
    day: z.number().int().min(1).max(7),
    daily_theme: z.string().trim().min(1).max(80),
    slots: z.array(scheduleSlotSchema).length(3),
  })
  .strict();

const launchBeatSchema = z
  .object({
    start_second: z.number().nonnegative().max(15),
    end_second: z.number().positive().max(15),
    visual: z.string().trim().min(1).max(120),
    narration: z.string().trim().min(1).max(60),
    on_screen_text: z.string().trim().min(1).max(14),
    transition: z.enum(["cut", "hold", "match_cut", "sound_bridge"]),
  })
  .strict();

const launchVideoSchema = z
  .object({
    video_id: z.string().regex(/^launch-[1-3]$/),
    publish_window_id: incubationWindowIdSchema,
    content_pillar: z.string().trim().min(1).max(32),
    title: z.string().trim().min(1).max(30),
    cover_text: z.string().trim().min(1).max(14),
    hook: z.string().trim().min(1).max(40),
    viewer_problem: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .default("需要重新生成：先明确观众要解决的具体问题。"),
    core_insight: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .default("需要重新生成：先给出一个可验证的具体判断。"),
    actionable_takeaway: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .default("需要重新生成：先给观众一个能照做或记住的收获。"),
    story_promise: z.string().trim().min(1).max(100),
    beats: z.array(launchBeatSchema).length(5),
    caption: z.string().trim().min(1).max(140),
    comment_prompt: z.string().trim().min(1).max(60),
    bgm_direction: z.string().trim().min(1).max(120),
    asset_checklist: z.array(z.string().trim().min(1).max(100)).min(3).max(7),
    status: z.enum(["needs_real_assets", "ready_for_review"]),
    commercial_state: z.literal("non_commercial"),
  })
  .strict();

export const accountIncubationOutputSchema = z
  .object({
    account_promise: z.string().trim().min(1).max(180),
    profile_setup: z
      .object({
        display_name: z.string().trim().min(1).max(40),
        bio: z.string().trim().min(1).max(100),
        visual_direction: z.string().trim().min(1).max(140),
      })
      .strict(),
    content_pillars: z.array(contentPillarSchema).length(3),
    first_week_schedule: z.array(weeklyDaySchema).length(7),
    launch_videos: z.array(launchVideoSchema).length(3),
    review_checklist: z.array(z.string().trim().min(1).max(140)).min(5).max(8),
    commercial_boundary: z
      .object({
        sales_enabled: z.literal(false),
        prohibited_actions: z.array(z.string().trim().min(1).max(100)).min(3).max(6),
        next_review_trigger: z.string().trim().min(1).max(140),
      })
      .strict(),
  })
  .strict();

export type AccountIncubationInput = z.infer<typeof accountIncubationInputSchema>;
export type AccountIncubationOutput = z.infer<typeof accountIncubationOutputSchema>;
