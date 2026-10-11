import { RunNotFoundError } from "../../errors.js";
import {
  workflowRunSchema,
  type WorkflowRun,
} from "../../schemas/workflow-run.schema.js";
import type { RunStore } from "./run-store.js";

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, WorkflowRun>();

  constructor(initialRuns: WorkflowRun[] = []) {
    for (const run of initialRuns) {
      const parsed = workflowRunSchema.parse(run);
      this.runs.set(parsed.id, structuredClone(parsed));
    }
  }

  async create(run: WorkflowRun): Promise<void> {
    await this.save(run);
  }

  async save(run: WorkflowRun): Promise<void> {
    const parsed = workflowRunSchema.parse(run);
    this.runs.set(parsed.id, structuredClone(parsed));
  }

  async get(runId: string): Promise<WorkflowRun> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new RunNotFoundError(runId);
    }
    return structuredClone(run);
  }

  async list(): Promise<WorkflowRun[]> {
    return [...this.runs.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((run) => structuredClone(run));
  }
}
