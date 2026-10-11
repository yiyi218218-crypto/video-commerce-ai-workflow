import { z } from "zod";

import { workflowRunSchema } from "../schemas/workflow-run.schema.js";
import { codexWorkflowRequestSchema } from "./codex-workflow-request.schema.js";

export const codexJobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "interrupted",
]);

const jobErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const codexJobSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["start", "resume"]),
    status: codexJobStatusSchema,
    run: workflowRunSchema.optional(),
    error: jobErrorSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const codexJobRecordSchema = codexJobSchema
  .extend({
    request: codexWorkflowRequestSchema,
  })
  .strict();

export type CodexJob = z.infer<typeof codexJobSchema>;
export type CodexJobRecord = z.infer<typeof codexJobRecordSchema>;
export type CodexJobStatus = z.infer<typeof codexJobStatusSchema>;
