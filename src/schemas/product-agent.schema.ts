import { z } from "zod";

export const productCategorySchema = z.enum([
  "food",
  "clothing",
  "jewelry",
  "beauty",
  "home",
  "maternal_baby",
]);

const competitorSchema = z
  .object({
    name: z.string().min(1),
    price: z.number().nonnegative().optional(),
    strengths: z.array(z.string().min(1)).default([]),
    weaknesses: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const productAgentInputSchema = z
  .object({
    product_name: z.string().min(1),
    category: productCategorySchema,
    price: z
      .object({
        amount: z.number().positive(),
        currency: z.string().length(3).default("CNY"),
      })
      .strict(),
    target_users: z.array(z.string().min(1)).min(1),
    description: z.string().min(1).optional(),
    brand: z.string().min(1).optional(),
    specifications: z
      .record(z.string(), z.string().min(1))
      .default({}),
    product_facts: z.array(z.string().min(1)).default([]),
    competitors: z.array(competitorSchema).default([]),
    sales_constraints: z.array(z.string().min(1)).default([]),
  })
  .strict();

const audienceProfileSchema = z
  .object({
    segment: z.string().min(1),
    characteristics: z.array(z.string().min(1)).min(1).max(6),
    usage_scenarios: z.array(z.string().min(1)).min(1).max(6),
    pain_points: z.array(z.string().min(1)).min(1).max(6),
    purchase_motivations: z.array(z.string().min(1)).min(1).max(6),
  })
  .strict();

const sellingPointSchema = z
  .object({
    statement: z.string().min(1),
    customer_value: z.string().min(1),
    basis: z.string().min(1),
    evidence_status: z.enum([
      "provided_fact",
      "reasonable_inference",
      "needs_confirmation",
    ]),
  })
  .strict();

const differentiationSchema = z
  .object({
    compared_with: z.string().min(1),
    advantage: z.string().min(1),
    valid_when: z.string().min(1),
  })
  .strict();

const salesRiskSchema = z
  .object({
    reason: z.string().min(1),
    impact: z.string().min(1),
    mitigation: z.string().min(1),
  })
  .strict();

export const productAgentOutputSchema = z
  .object({
    market_positioning: z
      .object({
        statement: z.string().min(1),
        price_band: z.enum(["budget", "mass", "mid_range", "premium", "luxury"]),
        category_opportunity: z.string().min(1),
        recommended_sales_angle: z.string().min(1),
      })
      .strict(),
    audience_profiles: z.array(audienceProfileSchema).min(1).max(3),
    core_purchase_motivations: z.array(z.string().min(1)).min(2).max(8),
    selling_points: z.array(sellingPointSchema).min(2).max(8),
    differentiators: z.array(differentiationSchema).max(6),
    sales_risks: z.array(salesRiskSchema).max(6),
    unsuitable_reasons: z.array(z.string().min(1)).max(6),
    missing_information: z.array(z.string().min(1)).max(10),
    confidence: z
      .object({
        level: z.enum(["low", "medium", "high"]),
        rationale: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ProductCategory = z.infer<typeof productCategorySchema>;
export type ProductAgentInput = z.infer<typeof productAgentInputSchema>;
export type ProductAgentOutput = z.infer<typeof productAgentOutputSchema>;
