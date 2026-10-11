import { z } from "zod";

import { historicalShortVideoOutputSchema } from "./historical-short-video-agent.schema.js";
import { historicalVideoProjectSlugSchema } from "./historical-video-project-agent.schema.js";

const assetRefSchema = z
  .object({
    scene_id: z.string().trim().min(1).max(80),
    path: z.string().trim().min(1),
  })
  .strict();

const voiceClipRefSchema = z
  .object({
    scene_id: z.string().trim().min(1).max(80),
    path: z.string().trim().min(1),
    start_offset_seconds: z.number().min(0).max(5).default(0.3),
  })
  .strict();

const sfxClipRefSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    path: z.string().trim().min(1),
    start_second: z.number().min(0).max(120),
    duration_seconds: z.number().positive().max(20),
    volume: z.number().min(0).max(1).default(0.08),
  })
  .strict();

export const historicalHyperFramesComposerInputSchema = z
  .object({
    blueprint: historicalShortVideoOutputSchema,
    project_slug: historicalVideoProjectSlugSchema,
    project_root: z.string().trim().min(1).optional(),
    scene_assets: z.array(assetRefSchema).min(1).max(12),
    voice_clips: z.array(voiceClipRefSchema).max(12).default([]),
    bgm_path: z.string().trim().min(1).optional(),
    sfx_clips: z.array(sfxClipRefSchema).max(12).default([]),
    output_file_name: z.string().trim().min(1).max(120).optional(),
    overwrite_existing_composition: z.boolean().default(false),
  })
  .strict();

const generatedFileSchema = z
  .object({
    path: z.string().trim().min(1),
    purpose: z.enum([
      "hyperframes_config",
      "package_manifest",
      "index",
      "caption_composition",
      "scene_composition",
      "copied_asset",
      "publish_copy",
      "quality_gate",
    ]),
  })
  .strict();

export const historicalHyperFramesComposerOutputSchema = z
  .object({
    status: z.enum(["ready_for_render", "blocked"]),
    project_slug: historicalVideoProjectSlugSchema,
    project_path: z.string().trim().min(1),
    expected_rendered_video_path: z.string().trim().min(1),
    files: z.array(generatedFileSchema),
    render_commands: z
      .object({
        check: z.string().trim().min(1),
        snapshot: z.string().trim().min(1),
        render: z.string().trim().min(1),
      })
      .strict(),
    qa_expectations: z
      .object({
        scene_count: z.number().int().min(1),
        has_voice: z.boolean(),
        has_bgm: z.boolean(),
        subtitle_mode: z.literal("sentence_chunks"),
        aspect: z.literal("1080x1920"),
      })
      .strict(),
    blocking_items: z.array(z.string().trim().min(1)).max(20),
    warnings: z.array(z.string().trim().min(1)).max(20),
  })
  .strict();

export const historicalHyperFramesAssetManifestSchema = z
  .object({
    scene_assets: z.array(assetRefSchema).min(1).max(12),
    voice_clips: z.array(voiceClipRefSchema).max(12).optional(),
    bgm_path: z.string().trim().min(1).optional(),
    sfx_clips: z.array(sfxClipRefSchema).max(12).optional(),
  })
  .strict();

export type HistoricalHyperFramesComposerInput = z.input<
  typeof historicalHyperFramesComposerInputSchema
>;
export type HistoricalHyperFramesComposerParsedInput = z.output<
  typeof historicalHyperFramesComposerInputSchema
>;
export type HistoricalHyperFramesComposerOutput = z.output<
  typeof historicalHyperFramesComposerOutputSchema
>;
export type HistoricalHyperFramesAssetManifest = z.output<
  typeof historicalHyperFramesAssetManifestSchema
>;
