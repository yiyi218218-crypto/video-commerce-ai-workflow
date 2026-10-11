import { z } from "zod";

const serializedErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .strict();

const promptMetadataSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    sha256: z.string(),
  })
  .strict();

const agentExecutionMetadataSchema = z
  .object({
    agent: z.string(),
    prompt: promptMetadataSchema.optional(),
  })
  .strict();

export const runStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const workflowRunStatusSchema = z.enum([
  "pending",
  "running",
  "waiting_for_input",
  "completed",
  "failed",
  "cancelled",
]);

export const workflowRunStepSchema = z
  .object({
    id: z.string(),
    agent: z.string(),
    status: runStepStatusSchema,
    attempts: z.number().int().min(0),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    metadata: agentExecutionMetadataSchema.optional(),
    error: serializedErrorSchema.optional(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export const workflowRunSchema = z
  .object({
    id: z.string().min(1),
    workflow: z.string().min(1),
    workflowVersion: z.string().min(1),
    workflowHash: z.string().min(1),
    status: workflowRunStatusSchema,
    initialInput: z.unknown(),
    artifacts: z.record(z.string(), z.unknown()),
    checkpoints: z.record(z.string(), z.unknown()),
    steps: z.array(workflowRunStepSchema),
    pendingCheckpoint: z
      .object({
        stepId: z.string(),
        requestedAt: z.string().datetime(),
      })
      .strict()
      .optional(),
    error: serializedErrorSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();

export type WorkflowRun = z.infer<typeof workflowRunSchema>;
export type WorkflowRunStep = z.infer<typeof workflowRunStepSchema>;
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>;
