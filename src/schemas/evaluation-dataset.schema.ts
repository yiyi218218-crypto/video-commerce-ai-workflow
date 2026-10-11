import { z } from "zod";

import { productAgentInputSchema } from "./product-agent.schema.js";

const preferredNarrativeModeSchema = z.enum([
  "story",
  "conflict",
  "pain_point",
  "identity",
  "emotional_value",
]);

export const evaluationCaseSchema = z
  .object({
    id: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/, "Case ids must use snake_case."),
    product: productAgentInputSchema,
    expected_focus: z.array(z.string().min(1)).min(1),
    risk_focus: z.array(z.string().min(1)),
    preferred_modes: z.array(preferredNarrativeModeSchema).min(1),
  })
  .strict();

const requiredCategoryCounts = {
  food: 9,
  clothing: 9,
  jewelry: 8,
  beauty: 8,
  home: 8,
  maternal_baby: 8,
} as const;

export const evaluationDatasetSchema = z
  .array(evaluationCaseSchema)
  .length(50)
  .superRefine((dataset, context) => {
    const ids = new Set<string>();
    const categoryCounts: Record<string, number> = {};

    dataset.forEach((testCase, index) => {
      if (ids.has(testCase.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate evaluation case id "${testCase.id}".`,
          path: [index, "id"],
        });
      }
      ids.add(testCase.id);
      categoryCounts[testCase.product.category] =
        (categoryCounts[testCase.product.category] ?? 0) + 1;
    });

    for (const [category, expected] of Object.entries(
      requiredCategoryCounts,
    )) {
      const actual = categoryCounts[category] ?? 0;
      if (actual !== expected) {
        context.addIssue({
          code: "custom",
          message: `Category "${category}" requires ${expected} cases, received ${actual}.`,
          path: [],
        });
      }
    }
  });

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationDataset = z.infer<typeof evaluationDatasetSchema>;
