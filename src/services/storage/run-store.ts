import type { WorkflowRun } from "../../schemas/workflow-run.schema.js";

export interface RunStore {
  create(run: WorkflowRun): Promise<void>;
  save(run: WorkflowRun): Promise<void>;
  get(runId: string): Promise<WorkflowRun>;
  list(): Promise<WorkflowRun[]>;
}
