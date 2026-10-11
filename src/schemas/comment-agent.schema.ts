import { z } from "zod";

import { directionIdSchema } from "./content-agent.schema.js";
import { productAgentInputSchema } from "./product-agent.schema.js";

const commentIntentSchema = z.enum([
  "price_question",
  "product_information",
  "suitability_question",
  "usage_question",
  "purchase_intent",
  "objection",
  "negative_feedback",
  "logistics",
  "after_sales",
  "spam",
  "other",
]);

const safetyFlagSchema = z.enum([
  "medical_claim",
  "counterfeit_dispute",
  "refund_dispute",
  "privacy_data",
  "harassment",
  "minor_safety",
  "platform_violation",
]);

export const commentAgentInputSchema = z
  .object({
    comment_id: z.string().min(1).optional(),
    comment_text: z.string().min(1).max(2_000),
    product: productAgentInputSchema,
    video_context: z
      .object({
        title: z.string().min(1),
        summary: z.string().min(1),
        selected_direction_id: directionIdSchema.optional(),
      })
      .strict(),
    conversation_history: z
      .array(
        z
          .object({
            role: z.enum(["user", "merchant"]),
            text: z.string().min(1),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    brand_tone: z.string().min(1).default("真实、耐心、不过度推销"),
    known_facts: z.array(z.string().min(1)).default([]),
    prohibited_terms: z.array(z.string().min(1)).default([]),
    reply_constraints: z.array(z.string().min(1)).default([]),
  })
  .strict();

const publicReplySchema = z
  .object({
    reply: z.string().min(1),
    style: z.enum(["concise", "warm", "professional", "light_humor"]),
    purpose: z.string().min(1),
    follow_up_question: z.string(),
    conversion_action: z.enum([
      "none",
      "ask_question",
      "check_product_details",
      "guide_to_order",
      "contact_support",
    ]),
    fact_claims: z.array(z.string().min(1)),
  })
  .strict();

export const commentAgentOutputSchema = z
  .object({
    classification: z
      .object({
        intent: commentIntentSchema,
        sentiment: z.enum([
          "positive",
          "neutral",
          "uncertain",
          "negative",
        ]),
        risk_level: z.enum(["low", "medium", "high"]),
        rationale: z.string().min(1),
      })
      .strict(),
    response_strategy: z
      .object({
        goal: z.string().min(1),
        tone: z.string().min(1),
        trust_action: z.string().min(1),
        conversion_action: z.string().min(1),
      })
      .strict(),
    public_replies: z.array(publicReplySchema).min(2).max(3),
    private_follow_up: z
      .object({
        recommended: z.boolean(),
        reason: z.string().min(1),
        message: z.string(),
      })
      .strict(),
    factual_basis: z.array(
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
    safety_flags: z.array(safetyFlagSchema),
    escalation: z
      .object({
        required: z.boolean(),
        owner: z.enum([
          "none",
          "merchant",
          "customer_service",
          "compliance",
        ]),
        reason: z.string().min(1),
        do_not_reply_publicly: z.boolean(),
      })
      .strict(),
    operator_note: z.string().min(1),
  })
  .strict();

export type CommentIntent = z.infer<typeof commentIntentSchema>;
export type CommentAgentInput = z.infer<typeof commentAgentInputSchema>;
export type CommentAgentOutput = z.infer<typeof commentAgentOutputSchema>;
