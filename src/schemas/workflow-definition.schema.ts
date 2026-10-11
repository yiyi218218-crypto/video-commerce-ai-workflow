import { z } from "zod";

const identifierSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    "Identifiers must start with a letter and contain only letters, numbers, underscores, or hyphens.",
  );

export const retryPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(5).default(1),
    backoffMs: z.number().int().min(0).max(30_000).default(250),
  })
  .strict();

export const workflowStepSchema = z
  .object({
    id: identifierSchema,
    agent: identifierSchema,
    input: z.unknown().optional(),
    checkpoint: z.boolean().default(false),
    retry: retryPolicySchema.optional(),
  })
  .strict();

export const workflowDefinitionSchema = z
  .object({
    workflow: identifierSchema,
    version: z.string().min(1).default("1.0.0"),
    description: z.string().min(1).optional(),
    steps: z
      .array(z.union([identifierSchema, workflowStepSchema]))
      .min(1),
  })
  .strict();

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowStepDefinition = z.infer<typeof workflowStepSchema>;

export interface NormalizedWorkflowStep {
  id: string;
  agent: string;
  input?: unknown;
  checkpoint: boolean;
  retry: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export function normalizeWorkflowSteps(
  definition: WorkflowDefinition,
): NormalizedWorkflowStep[] {
  const seenIds = new Set<string>();
  const agentCounts = new Map<string, number>();

  const normalized = definition.steps.map((step) => {
    if (typeof step !== "string") {
      if (seenIds.has(step.id)) {
        throw new Error(`Duplicate workflow step id "${step.id}".`);
      }
      seenIds.add(step.id);
      return {
        id: step.id,
        agent: step.agent,
        ...(step.input !== undefined ? { input: step.input } : {}),
        checkpoint: step.checkpoint,
        retry: step.retry ?? {
          maxAttempts: 1,
          backoffMs: 250,
        },
      };
    }

    const occurrence = (agentCounts.get(step) ?? 0) + 1;
    agentCounts.set(step, occurrence);
    const id = occurrence === 1 ? step : `${step}_${occurrence}`;
    seenIds.add(id);

    return {
      id,
      agent: step,
      checkpoint: false,
      retry: {
        maxAttempts: 1,
        backoffMs: 250,
      },
    };
  });

  return normalized;
}
