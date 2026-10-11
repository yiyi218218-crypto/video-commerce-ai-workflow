import { z } from "zod";

import { creativeRouteSchema } from "./creative-production.schema.js";
import { productVideoProjectSchema } from "./product-video-project.schema.js";

export const productVideoProductionRequestSchema = z
  .object({
    batch_id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    creative_route: creativeRouteSchema.optional(),
  })
  .strict();

export const productVideoProductionJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
]);

const productVideoProductionErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const productVideoProductionJobSchema = z
  .object({
    id: z.string().uuid(),
    status: productVideoProductionJobStatusSchema,
    request: productVideoProductionRequestSchema,
    project: productVideoProjectSchema.optional(),
    error: productVideoProductionErrorSchema.optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    started_at: z.string().datetime().optional(),
    completed_at: z.string().datetime().optional(),
  })
  .strict();

export type ProductVideoProductionRequest = z.infer<
  typeof productVideoProductionRequestSchema
>;
export type ProductVideoProductionJob = z.infer<
  typeof productVideoProductionJobSchema
>;
