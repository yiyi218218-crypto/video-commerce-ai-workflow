import { z } from "zod";

import {
  accountIncubationApiRequestSchema,
  type AccountIncubationApiRequest,
} from "./account-incubation-api.schema.js";
import {
  workflowApiRequestSchema,
  type WorkflowApiRequest,
} from "./workflow-api.schema.js";

export const codexWorkflowRequestSchema = z.union([
  workflowApiRequestSchema,
  accountIncubationApiRequestSchema,
]);

export type CodexWorkflowRequest =
  | WorkflowApiRequest
  | AccountIncubationApiRequest;

export function isAccountIncubationRequest(
  request: CodexWorkflowRequest,
): request is AccountIncubationApiRequest {
  return request.action === "start" && "profile" in request.input;
}
