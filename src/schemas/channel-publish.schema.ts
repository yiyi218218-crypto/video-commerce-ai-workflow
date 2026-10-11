import { z } from "zod";

import { workflowRunSchema } from "./workflow-run.schema.js";

export const channelVideoDurationSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

export const channelCommerceModeSchema = z.enum([
  "wechat_store_product",
  "manual_product_selection",
  "none",
]);

export const channelCommerceSelectionSchema = z
  .object({
    mode: channelCommerceModeSchema,
    product_name: z.string().trim().min(1).max(120).optional(),
    product_id_or_sku: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(1_000).optional(),
    linkage_confirmed: z.boolean(),
  })
  .strict();

export const createChannelPublishPackageRequestSchema = z
  .object({
    run: workflowRunSchema,
    channel: z
      .object({
        display_name: z.string().trim().min(1).max(80),
        content_positioning: z.string().trim().max(300).optional(),
      })
      .strict(),
    duration_seconds: channelVideoDurationSchema,
    commerce: channelCommerceSelectionSchema,
  })
  .strict();

const attachedVideoSchema = z
  .object({
    name: z.string().min(1),
    relative_path: z.string().min(1),
    media_type: z.enum(["video/mp4", "video/quicktime", "video/webm"]),
    size_bytes: z.number().int().positive(),
  })
  .strict();

export const channelPublishPackageSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["prepared", "video_attached"]),
    run_id: z.string().min(1),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    directory_path: z.string().min(1),
    channel: z
      .object({
        display_name: z.string().min(1),
        content_positioning: z.string().optional(),
      })
      .strict(),
    product: z
      .object({
        name: z.string().min(1),
        category: z.string().min(1),
        price_display: z.string().min(1),
      })
      .strict(),
    duration_seconds: channelVideoDurationSchema,
    publication: z
      .object({
        title: z.string().min(1),
        caption: z.string().min(1),
        hashtags: z.array(z.string().min(2)).min(1),
      })
      .strict(),
    commerce: channelCommerceSelectionSchema,
    readiness: z
      .object({
        ready_for_manual_publish: z.boolean(),
        blocking_items: z.array(z.string().min(1)),
        manual_actions: z.array(z.string().min(1)).min(1),
      })
      .strict(),
    files: z.array(z.string().min(1)).min(4),
    video: attachedVideoSchema.optional(),
  })
  .strict();

export type ChannelVideoDuration = z.infer<
  typeof channelVideoDurationSchema
>;
export type ChannelCommerceMode = z.infer<
  typeof channelCommerceModeSchema
>;
export type CreateChannelPublishPackageRequest = z.infer<
  typeof createChannelPublishPackageRequestSchema
>;
export type ChannelPublishPackage = z.infer<
  typeof channelPublishPackageSchema
>;
