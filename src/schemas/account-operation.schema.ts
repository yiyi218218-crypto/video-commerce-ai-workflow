import { z } from "zod";

const publishWindowSchema = z
  .object({
    id: z.enum(["early_morning", "midday", "evening"]),
    time_range: z.string().trim().min(1).max(40),
    audience_context: z.string().trim().min(1).max(100),
    status: z.enum(["test_window", "validated_window"]),
  })
  .strict();

const matrixRoleSchema = z
  .object({
    account_role: z.string().trim().min(1).max(48),
    content_boundary: z.string().trim().min(1).max(140),
    differentiation_rule: z.string().trim().min(1).max(140),
  })
  .strict();

export const accountOperationProfileSchema = z
  .object({
    account_name: z.string().trim().min(1).max(80),
    account_stage: z.enum(["new_account", "growing_account", "mature_account"]),
    primary_vertical: z.string().trim().min(1).max(80),
    target_audiences: z.array(z.string().trim().min(1).max(120)).min(1).max(6),
    profile_style: z.enum(["real_person_life", "real_scene", "illustrated_persona"]),
    profile_bio_theme: z.string().trim().min(1).max(120),
    avoided_profile_words: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
    launch_cadence: z
      .object({
        daily_video_target: z.number().int().min(1).max(5),
        minimum_gap_hours: z.number().min(1).max(12),
        publish_windows: z.array(publishWindowSchema).min(1).max(3),
      })
      .strict(),
    visual_system: z
      .object({
        product_demo_ratio: z.literal("9:16"),
        story_or_knowledge_ratio: z.literal("16:9"),
        cover_ratio: z.literal("3:4"),
        color_direction: z.string().trim().min(1).max(100),
        cover_rules: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
        audio_direction: z.string().trim().min(1).max(120),
      })
      .strict(),
    product_research: z
      .object({
        live_room_signal_policy: z.string().trim().min(1).max(180),
        trend_reference_policy: z.string().trim().min(1).max(180),
        seasonality_policy: z.string().trim().min(1).max(180),
      })
      .strict(),
    matrix_roles: z.array(matrixRoleSchema).min(1).max(6),
    originality_rules: z.array(z.string().trim().min(1).max(180)).min(3).max(8),
  })
  .strict();

export const accountOperationPlaybookSchema = z
  .object({
    account_setup: z
      .object({
        positioning_statement: z.string().trim().min(1).max(180),
        profile_recommendation: z.string().trim().min(1).max(180),
        bio_examples: z.array(z.string().trim().min(1).max(80)).length(3),
        avoid_terms: z.array(z.string().trim().min(1).max(32)).min(1).max(12),
      })
      .strict(),
    launch_plan: z
      .object({
        cadence: z.string().trim().min(1).max(180),
        publish_windows: z.array(publishWindowSchema).min(1).max(3),
        experiment_note: z.string().trim().min(1).max(220),
        no_fake_growth_rule: z.string().trim().min(1).max(180),
      })
      .strict(),
    creative_system: z
      .object({
        format_rules: z.array(z.string().trim().min(1).max(140)).min(3).max(6),
        cover_rules: z.array(z.string().trim().min(1).max(140)).min(2).max(6),
        script_formula: z.string().trim().min(1).max(220),
        language_rule: z.string().trim().min(1).max(180),
      })
      .strict(),
    product_research_system: z
      .array(
        z
          .object({
            signal: z.string().trim().min(1).max(80),
            method: z.string().trim().min(1).max(180),
            evidence_required: z.string().trim().min(1).max(180),
          })
          .strict(),
      )
      .length(3),
    matrix_plan: z
      .object({
        main_account_role: z.string().trim().min(1).max(120),
        auxiliary_account_roles: z.array(matrixRoleSchema).max(5),
        anti_duplication_rule: z.string().trim().min(1).max(220),
      })
      .strict(),
    compliance_guardrails: z.array(z.string().trim().min(1).max(180)).min(4).max(10),
  })
  .strict();

export type AccountOperationProfile = z.infer<typeof accountOperationProfileSchema>;
export type AccountOperationPlaybook = z.infer<typeof accountOperationPlaybookSchema>;
