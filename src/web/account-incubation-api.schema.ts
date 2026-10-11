import { z } from "zod";

import { accountIncubationInputSchema } from "../schemas/account-incubation.schema.js";

export const accountIncubationApiRequestSchema = z
  .object({
    action: z.literal("start"),
    input: accountIncubationInputSchema,
  })
  .strict();

export type AccountIncubationApiRequest = z.infer<
  typeof accountIncubationApiRequestSchema
>;
