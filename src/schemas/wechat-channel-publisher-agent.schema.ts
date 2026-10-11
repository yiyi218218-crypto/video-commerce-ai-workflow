import { z } from "zod";

export const weChatChannelPublisherActionSchema = z.enum([
  "prepare_job",
  "prepare_and_publish",
]);

export const weChatChannelPublisherInputSchema = z
  .object({
    project_root: z.string().trim().min(1).optional(),
    video_path: z.string().trim().min(1),
    short_title: z.string().trim().min(6).max(30),
    description: z.string().trim().min(1).max(5_000),
    expected_channel_name: z.string().trim().min(1).max(80).optional(),
    ai_generated: z.boolean().optional(),
    confirm_publish: z.boolean().optional(),
    action: weChatChannelPublisherActionSchema.optional(),
    job_file_path: z.string().trim().min(1).optional(),
    recent_published_texts: z
      .array(z.string().trim().min(1))
      .max(100)
      .default([]),
    duplicate_policy: z.enum(["warn", "block"]).default("warn"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.action === "prepare_and_publish" &&
      value.confirm_publish !== true
    ) {
      context.addIssue({
        code: "custom",
        path: ["confirm_publish"],
        message:
          "confirm_publish must be true before preparing a live publish command.",
      });
    }
  });

export const weChatChannelPublisherJobSchema = z
  .object({
    videoPath: z.string().min(1),
    shortTitle: z.string().min(6).max(30),
    description: z.string().min(1).max(5_000),
    expectedChannelName: z.string().min(1).max(80),
    aiGenerated: z.boolean(),
    confirmPublish: z.boolean(),
  })
  .strict();

export const weChatChannelPublisherOutputSchema = z
  .object({
    status: z.enum(["ready", "blocked"]),
    job_file_path: z.string().min(1),
    job: weChatChannelPublisherJobSchema,
    commands: z
      .object({
        prepare: z.string().min(1),
        publish: z.string().min(1),
      })
      .strict(),
    safety_checks: z
      .object({
        expected_channel_name: z.string().min(1),
        location_policy: z.literal("不显示位置"),
        ai_disclosure_required: z.boolean(),
        product_link_policy: z.literal("none_unless_explicitly_requested"),
        auth_policy: z.literal("browser_login_or_visible_qr_only"),
      })
      .strict(),
    duplicate_check: z
      .object({
        policy: z.enum(["warn", "block"]),
        checked: z.boolean(),
        matches: z.array(
          z
            .object({
              text: z.string().min(1),
              score: z.number().min(0).max(1),
              shared_terms: z.array(z.string().min(1)),
            })
            .strict(),
        ),
      })
      .strict(),
    blocking_items: z.array(z.string().min(1)),
    warnings: z.array(z.string().min(1)),
  })
  .strict();

export type WeChatChannelPublisherInput = z.input<
  typeof weChatChannelPublisherInputSchema
>;
export type WeChatChannelPublisherJob = z.infer<
  typeof weChatChannelPublisherJobSchema
>;
export type WeChatChannelPublisherOutput = z.infer<
  typeof weChatChannelPublisherOutputSchema
>;
