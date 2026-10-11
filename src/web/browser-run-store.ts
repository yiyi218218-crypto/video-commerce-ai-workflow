import {
  workflowRunSchema,
  type WorkflowRun,
} from "../schemas/workflow-run.schema.js";

const storageKey = "video-commerce-ai.workflow-runs.v1";
const maximumRuns = 20;

export class BrowserRunStore {
  constructor(private readonly storage: Storage) {}

  list(): WorkflowRun[] {
    const raw = this.storage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    try {
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) {
        return [];
      }
      return value
        .map((item) => workflowRunSchema.safeParse(item))
        .filter((result) => result.success)
        .map((result) => result.data)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, maximumRuns);
    } catch {
      return [];
    }
  }

  save(run: WorkflowRun): WorkflowRun[] {
    const validated = workflowRunSchema.parse(run);
    const runs = [
      validated,
      ...this.list().filter((item) => item.id !== validated.id),
    ].slice(0, maximumRuns);
    this.storage.setItem(storageKey, JSON.stringify(runs));
    return runs;
  }

  remove(runId: string): WorkflowRun[] {
    const runs = this.list().filter((run) => run.id !== runId);
    this.storage.setItem(storageKey, JSON.stringify(runs));
    return runs;
  }
}
