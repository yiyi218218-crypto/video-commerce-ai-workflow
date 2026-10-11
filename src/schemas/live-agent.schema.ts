import { z } from "zod";

import {
  contentAgentOutputSchema,
  directionIdSchema,
} from "./content-agent.schema.js";
import {
  productAgentInputSchema,
  productAgentOutputSchema,
} from "./product-agent.schema.js";
import { scriptAgentOutputSchema } from "./script-agent.schema.js";

const confirmedOfferSchema = z
  .object({
    name: z.string().min(1),
    details: z.string().min(1),
    deadline: z.string().min(1).optional(),
  })
  .strict();

export const liveContextSchema = z
  .object({
    live_duration_minutes: z.number().int().min(30).max(480),
    host_style: z.string().min(1),
    team_size: z.number().int().min(1).max(20),
    inventory_quantity: z.number().int().nonnegative().optional(),
    confirmed_offers: z.array(confirmedOfferSchema),
    confirmed_proof_points: z.array(z.string().min(1)),
    prohibited_claims: z.array(z.string().min(1)),
  })
  .strict();

export const liveAgentInputSchema = z
  .object({
    product: productAgentInputSchema,
    product_insight: productAgentOutputSchema,
    content_plan: contentAgentOutputSchema,
    selected_direction_id: directionIdSchema,
    script_bundle: scriptAgentOutputSchema,
    live_context: liveContextSchema,
  })
  .strict();

const openingMinuteSchema = z
  .object({
    minute: z.number().int().min(1).max(5),
    objective: z.string().min(1),
    host_script: z.string().min(1),
    interaction: z.string().min(1),
    product_action: z.string().min(1),
  })
  .strict();

const flowSegmentSchema = z
  .object({
    phase: z.enum([
      "welcome",
      "warmup",
      "product_story",
      "demonstration",
      "interaction",
      "offer",
      "order_guidance",
      "recap",
    ]),
    duration_minutes: z.number().int().positive(),
    objective: z.string().min(1),
    host_actions: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const liveAgentOutputSchema = z
  .object({
    selected_direction_id: directionIdSchema,
    facts_boundary: z
      .object({
        confirmed_facts_used: z.array(z.string().min(1)),
        missing_facts_that_limit_sales: z.array(z.string().min(1)),
      })
      .strict(),
    opening_five_minutes: z.array(openingMinuteSchema).length(5),
    run_of_show: z.array(flowSegmentSchema).min(6).max(16),
    retention_scripts: z
      .array(
        z
          .object({
            trigger: z.string().min(1),
            script: z.string().min(1),
            next_action: z.string().min(1),
          })
          .strict(),
      )
      .min(4)
      .max(12),
    product_presentation: z
      .object({
        problem_entry: z.string().min(1),
        scenario_story: z.string().min(1),
        demonstration_steps: z.array(z.string().min(1)).min(3).max(10),
        proof_points: z.array(z.string().min(1)),
        limitation_disclosure: z.string().min(1),
      })
      .strict(),
    interaction_questions: z
      .array(
        z
          .object({
            question: z.string().min(1),
            purpose: z.string().min(1),
            follow_up: z.string().min(1),
          })
          .strict(),
      )
      .min(6)
      .max(16),
    objection_handling: z
      .array(
        z
          .object({
            objection: z.string().min(1),
            response: z.string().min(1),
            boundary: z.string().min(1),
          })
          .strict(),
      )
      .min(4)
      .max(12),
    urgency_scripts: z
      .array(
        z
          .object({
            basis: z.enum([
              "confirmed_inventory",
              "confirmed_offer_deadline",
              "decision_support",
            ]),
            script: z.string().min(1),
            use_condition: z.string().min(1),
          })
          .strict(),
      )
      .min(3)
      .max(8),
    offer_plan: z
      .object({
        confirmed_offers: z.array(confirmedOfferSchema),
        recommendations: z.array(
          z
            .object({
              idea: z.string().min(1),
              rationale: z.string().min(1),
              requires_confirmation: z.literal(true),
            })
            .strict(),
        ),
        urgency_boundary: z.string().min(1),
      })
      .strict(),
    order_guidance: z
      .array(
        z
          .object({
            step: z.number().int().positive(),
            script: z.string().min(1),
          })
          .strict(),
      )
      .min(3)
      .max(8),
    closing_and_review: z
      .object({
        closing_script: z.string().min(1),
        metrics_to_record: z.array(z.string().min(1)).min(6).max(16),
        host_review_questions: z.array(z.string().min(1)).min(4).max(12),
      })
      .strict(),
  })
  .strict();

export type LiveContext = z.infer<typeof liveContextSchema>;
export type LiveAgentInput = z.infer<typeof liveAgentInputSchema>;
export type LiveAgentOutput = z.infer<typeof liveAgentOutputSchema>;
