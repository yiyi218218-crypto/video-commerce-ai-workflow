import { randomUUID } from "node:crypto";

import type { WorkflowRun } from "../../src/schemas/workflow-run.schema.js";
import type { WorkflowApiRequest } from "../../src/web/workflow-api.schema.js";

type StartWorkflowRequest = Extract<
  WorkflowApiRequest,
  { action: "start" }
>;

export function makeWorkflowRequest(
  productName = "低糖燕麦坚果脆",
): StartWorkflowRequest {
  return {
    action: "start",
    input: {
      product: {
        product_name: productName,
        category: "food",
        price: { amount: 39.9, currency: "CNY" },
        target_users: ["上班族"],
        description: "独立包装的燕麦坚果零食。",
        specifications: {},
        product_facts: ["每盒 10 袋"],
        competitors: [],
        sales_constraints: ["不得虚构功效"],
      },
      production_context: {
        on_camera_people: ["店主"],
        available_locations: ["餐桌"],
        shooting_style: "phone_natural",
        prohibited_claims: ["不得虚构功效"],
      },
      live_context: {
        live_duration_minutes: 60,
        host_style: "真实",
        team_size: 1,
        confirmed_offers: [],
        confirmed_proof_points: ["每盒 10 袋"],
        prohibited_claims: ["不得虚构功效"],
      },
    },
  };
}

export function makeWorkflowRun(
  status: WorkflowRun["status"] = "running",
  id: string = randomUUID(),
): WorkflowRun {
  const now = new Date().toISOString();
  return {
    id,
    workflow: "video_sales_phase2",
    workflowVersion: "1.0.0",
    workflowHash: "test-hash",
    status,
    initialInput: makeWorkflowRequest().input,
    artifacts: {},
    checkpoints: {},
    steps: [],
    createdAt: now,
    updatedAt: now,
    ...(status === "completed" ? { completedAt: now } : {}),
  };
}
