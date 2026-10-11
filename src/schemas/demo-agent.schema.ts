import { z } from "zod";

export const phaseZeroAgentInputSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict();

export const phaseZeroAgentOutputSchema = z
  .object({
    message: z.string(),
  })
  .strict();

export type PhaseZeroAgentInput = z.infer<typeof phaseZeroAgentInputSchema>;
export type PhaseZeroAgentOutput = z.infer<typeof phaseZeroAgentOutputSchema>;
