import { z } from "zod";

import {
  contentAgentOutputSchema,
  directionIdSchema,
} from "./content-agent.schema.js";
import {
  productAgentInputSchema,
  productAgentOutputSchema,
} from "./product-agent.schema.js";
import { accountOperationProfileSchema } from "./account-operation.schema.js";

export const productionContextSchema = z
  .object({
    on_camera_people: z.array(z.string().min(1)).min(1).max(5),
    available_locations: z.array(z.string().min(1)).min(1).max(8),
    shooting_style: z.enum([
      "phone_natural",
      "dialogue",
      "voice_over",
      "product_demo",
      "mixed",
    ]),
    prohibited_claims: z.array(z.string().min(1)),
  })
  .strict();

export const scriptAgentInputSchema = z
  .object({
    product: productAgentInputSchema,
    product_insight: productAgentOutputSchema,
    content_plan: contentAgentOutputSchema,
    selected_direction_id: directionIdSchema,
    production_context: productionContextSchema,
    account_operation_profile: accountOperationProfileSchema.optional(),
  })
  .strict();

const scriptShotSchema = z
  .object({
    start_second: z.number().nonnegative(),
    end_second: z.number().positive(),
    visual: z.string().min(1),
    character: z.string().min(1),
    action: z.string().min(1),
    dialogue: z.string().min(1),
    product_display: z.string().min(1),
    audio_cue: z.string().min(1),
  })
  .strict();

const factCheckSchema = z
  .object({
    claims_used: z.array(
      z
        .object({
          claim: z.string().min(1),
          basis: z.string().min(1),
          evidence_status: z.enum([
            "provided_fact",
            "reasonable_inference",
            "needs_confirmation",
          ]),
        })
        .strict(),
    ),
    risk_notes: z.array(z.string().min(1)),
  })
  .strict();

function createScriptVersionSchema(durationSeconds: 15 | 30 | 60) {
  return z
    .object({
      duration_seconds: z.literal(durationSeconds),
      hook: z.string().min(1),
      scene: z.string().min(1),
      character_setup: z.string().min(1),
      shots: z.array(scriptShotSchema).min(2).max(16),
      product_showcase: z.string().min(1),
      closing_cta: z.string().min(1),
      performance_notes: z.array(z.string().min(1)).min(1).max(8),
      fact_check: factCheckSchema,
    })
    .strict();
}

export const scriptAgentOutputSchema = z
  .object({
    selected_direction_id: directionIdSchema,
    creative_rationale: z.string().min(1),
    scripts: z
      .object({
        fifteen_seconds: createScriptVersionSchema(15),
        thirty_seconds: createScriptVersionSchema(30),
        sixty_seconds: createScriptVersionSchema(60),
      })
      .strict(),
  })
  .strict();

export type ScriptAgentInput = z.infer<typeof scriptAgentInputSchema>;
export type ScriptAgentOutput = z.infer<typeof scriptAgentOutputSchema>;
export type ScriptVersion =
  ScriptAgentOutput["scripts"][keyof ScriptAgentOutput["scripts"]];
