import { z } from "zod";

import { directionIdSchema } from "../schemas/content-agent.schema.js";
import { liveContextSchema } from "../schemas/live-agent.schema.js";
import { productAgentInputSchema } from "../schemas/product-agent.schema.js";
import { productionContextSchema } from "../schemas/script-agent.schema.js";
import { accountOperationProfileSchema } from "../schemas/account-operation.schema.js";
import { workflowRunSchema } from "../schemas/workflow-run.schema.js";

export const webWorkflowInputSchema = z
  .object({
    product: productAgentInputSchema,
    production_context: productionContextSchema,
    live_context: liveContextSchema,
    account_operation_profile: accountOperationProfileSchema.optional(),
  })
  .strict();

export const workflowApiRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      input: webWorkflowInputSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("resume"),
      run: workflowRunSchema,
      checkpoint: z
        .object({
          selected_direction_id: directionIdSchema,
        })
        .strict(),
    })
    .strict(),
]);

export type WebWorkflowInput = z.infer<typeof webWorkflowInputSchema>;
export type WorkflowApiRequest = z.infer<typeof workflowApiRequestSchema>;

export const providerStatusSchema = z
  .object({
    configured: z.boolean(),
    provider: z.enum(["openai_compatible", "codex_local"]),
    model: z.string().min(1).nullable(),
    persistence: z.enum(["browser_local", "local_file"]),
  })
  .strict();

export type ProviderStatus = z.infer<typeof providerStatusSchema>;
