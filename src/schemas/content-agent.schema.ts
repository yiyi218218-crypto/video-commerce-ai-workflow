import { z } from "zod";

import {
  productAgentInputSchema,
  productAgentOutputSchema,
} from "./product-agent.schema.js";
import {
  accountOperationPlaybookSchema,
  accountOperationProfileSchema,
} from "./account-operation.schema.js";

export const directionIdSchema = z.enum([
  "direction_1",
  "direction_2",
  "direction_3",
  "direction_4",
  "direction_5",
]);

export const contentAgentInputSchema = z
  .object({
    product: productAgentInputSchema,
    product_insight: productAgentOutputSchema,
    brand_tone: z.string().min(1).default("真实、克制、可信"),
    content_constraints: z.array(z.string().min(1)).default([]),
    optimization_brief: z.string().min(1).optional(),
    account_operation_profile: accountOperationProfileSchema.optional(),
  })
  .strict();

const contentStructureItemSchema = z
  .object({
    stage: z.enum([
      "hook",
      "context",
      "conflict",
      "turn",
      "proof",
      "product",
      "conversion",
    ]),
    purpose: z.string().min(1),
    content: z.string().min(1),
  })
  .strict();

export const contentDirectionSchema = z
  .object({
    direction_id: directionIdSchema,
    theme: z.string().min(1),
    narrative_mode: z.enum([
      "story",
      "conflict",
      "pain_point",
      "identity",
      "emotional_value",
    ]),
    titles: z.array(z.string().min(1)).length(3),
    hooks: z.array(z.string().min(1)).length(3),
    emotion_direction: z.string().min(1),
    identity_resonance: z.string().min(1),
    core_conflict: z.string().min(1),
    content_structure: z
      .array(contentStructureItemSchema)
      .min(4)
      .max(7),
    product_integration: z
      .object({
        timing: z.enum(["middle", "late", "through_story"]),
        method: z.string().min(1),
      })
      .strict(),
    conversion_cta: z.string().min(1),
    why_it_can_work: z.string().min(1),
    risk_notes: z.array(z.string().min(1)).max(5),
  })
  .strict();

export const contentAgentOutputSchema = z
  .object({
    operation_playbook: accountOperationPlaybookSchema.optional(),
    directions: z.array(contentDirectionSchema).length(5),
    selection_guide: z
      .object({
        recommended_direction_ids: z.array(directionIdSchema).length(2),
        decision_rule: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ContentAgentInput = z.infer<typeof contentAgentInputSchema>;
export type DirectionId = z.infer<typeof directionIdSchema>;
export type ContentDirection = z.infer<typeof contentDirectionSchema>;
export type ContentAgentOutput = z.infer<typeof contentAgentOutputSchema>;
