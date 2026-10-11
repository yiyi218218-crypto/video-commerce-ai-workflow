import type { WorkflowRun } from "../../src/schemas/workflow-run.schema.js";
import {
  sampleContentOutput,
  sampleProductInput,
  sampleProductOutput,
} from "./phase-one.js";
import {
  sampleLiveContext,
  sampleLiveOutput,
  sampleProductionContext,
  sampleScriptOutput,
} from "./phase-two.js";

const now = "2026-07-23T08:00:00.000Z";

export const completedPhaseTwoRun: WorkflowRun = {
  id: "publish-source-run",
  workflow: "video_sales_phase2",
  workflowVersion: "2.0.0",
  workflowHash: "fixture-hash",
  status: "completed",
  initialInput: {
    product: sampleProductInput,
    production_context: sampleProductionContext,
    live_context: sampleLiveContext,
  },
  artifacts: {
    product_analysis: sampleProductOutput,
    content_plan: sampleContentOutput,
    script_bundle: sampleScriptOutput,
    live_playbook: sampleLiveOutput,
  },
  checkpoints: {
    content_plan: {
      selected_direction_id: "direction_1",
    },
  },
  steps: [],
  createdAt: now,
  updatedAt: now,
  completedAt: now,
};
