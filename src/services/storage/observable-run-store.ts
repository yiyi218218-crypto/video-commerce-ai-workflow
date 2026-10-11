import type { WorkflowRun } from "../../schemas/workflow-run.schema.js";
import type { RunStore } from "./run-store.js";

export type RunObserver = (run: WorkflowRun) => Promise<void>;

export class ObservableRunStore implements RunStore {
  constructor(
    private readonly delegate: RunStore,
    private readonly observer: RunObserver,
  ) {}

  async create(run: WorkflowRun): Promise<void> {
    await this.delegate.create(run);
    await this.observer(structuredClone(run));
  }

  async save(run: WorkflowRun): Promise<void> {
    await this.delegate.save(run);
    await this.observer(structuredClone(run));
  }

  async get(runId: string): Promise<WorkflowRun> {
    return this.delegate.get(runId);
  }

  async list(): Promise<WorkflowRun[]> {
    return this.delegate.list();
  }
}
