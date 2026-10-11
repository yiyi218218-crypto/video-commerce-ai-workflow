import { z } from "zod";

import { historicalShortVideoOutputSchema } from "./historical-short-video-agent.schema.js";

export const historicalVideoProjectSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Project slug must use lowercase letters, numbers, and hyphens.",
  );

export const historicalVideoProjectAgentInputSchema = z
  .object({
    blueprint: historicalShortVideoOutputSchema,
    project_slug: historicalVideoProjectSlugSchema,
    project_root: z.string().trim().min(1).optional(),
    overwrite_existing_scaffold: z.boolean().default(false),
  })
  .strict();

const scaffoldFilePurposeSchema = z.enum([
  "brief",
  "script",
  "storyboard",
  "frame",
  "publish_copy",
  "production_plan",
]);

const scaffoldFileSchema = z
  .object({
    path: z.string().trim().min(1),
    purpose: scaffoldFilePurposeSchema,
    description: z.string().trim().min(1),
  })
  .strict();

export const historicalVideoProjectAgentOutputSchema = z
  .object({
    status: z.enum(["created", "blocked"]),
    project_slug: historicalVideoProjectSlugSchema,
    project_path: z.string().trim().min(1),
    files: z.array(scaffoldFileSchema),
    render_commands: z
      .object({
        initialize_hyperframes: z.string().trim().min(1),
        check: z.string().trim().min(1),
        render: z.string().trim().min(1),
      })
      .strict(),
    publish_bridge: z
      .object({
        compatible_agent: z.literal("wechat_channel_publisher_agent"),
        publish_copy_file: z.string().trim().min(1),
        expected_rendered_video_path: z.string().trim().min(1),
        prepare_publish_job_command: z.string().trim().min(1),
      })
      .strict(),
    next_steps: z.array(z.string().trim().min(1)).min(1).max(8),
    blocking_items: z.array(z.string().trim().min(1)).max(8),
  })
  .strict();

export type HistoricalVideoProjectAgentInput = z.input<
  typeof historicalVideoProjectAgentInputSchema
>;
export type HistoricalVideoProjectAgentOutput = z.output<
  typeof historicalVideoProjectAgentOutputSchema
>;
