import { randomUUID } from "node:crypto";

import { serializeError } from "../../errors.js";
import type { WorkflowRun } from "../../schemas/workflow-run.schema.js";
import {
  codexJobSchema,
  type CodexJob,
  type CodexJobRecord,
} from "../../web/codex-job.schema.js";
import type { CodexWorkflowRequest } from "../../web/codex-workflow-request.schema.js";
import { FileCodexJobStore } from "./file-codex-job-store.js";

export type WorkflowJobExecutor = (
  request: CodexWorkflowRequest,
  onRun: (run: WorkflowRun) => Promise<void>,
) => Promise<WorkflowRun>;

export class CodexJobQueue {
  private readonly pending: string[] = [];
  private draining = false;

  constructor(
    private readonly store: FileCodexJobStore,
    private readonly executor: WorkflowJobExecutor,
  ) {}

  async initialize(): Promise<number> {
    return this.store.markInterrupted();
  }

  async submit(request: CodexWorkflowRequest): Promise<CodexJob> {
    const now = new Date().toISOString();
    const record: CodexJobRecord = {
      id: randomUUID(),
      action: request.action,
      status: "queued",
      request,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(record);
    this.pending.push(record.id);
    void this.drain();
    return toPublicJob(record);
  }

  async get(jobId: string): Promise<CodexJob> {
    return toPublicJob(await this.store.get(jobId));
  }

  async list(): Promise<CodexJob[]> {
    return (await this.store.list()).map(toPublicJob);
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      let jobId = this.pending.shift();
      while (jobId) {
        await this.execute(jobId);
        jobId = this.pending.shift();
      }
    } finally {
      this.draining = false;
    }
  }

  private async execute(jobId: string): Promise<void> {
    const record = await this.store.get(jobId);
    const startedAt = new Date().toISOString();
    record.status = "running";
    record.startedAt = startedAt;
    record.updatedAt = startedAt;
    await this.store.save(record);

    try {
      const run = await this.executor(record.request, async (snapshot) => {
        const current = await this.store.get(jobId);
        current.run = snapshot;
        current.updatedAt = new Date().toISOString();
        await this.store.save(current);
      });
      const completedAt = new Date().toISOString();
      const current = await this.store.get(jobId);
      current.status = "completed";
      current.run = run;
      current.updatedAt = completedAt;
      current.completedAt = completedAt;
      delete current.error;
      await this.store.save(current);
    } catch (error) {
      const completedAt = new Date().toISOString();
      const current = await this.store.get(jobId);
      current.status = "failed";
      current.error = serializeError(error);
      current.updatedAt = completedAt;
      current.completedAt = completedAt;
      await this.store.save(current);
    }
  }
}

function toPublicJob(record: CodexJobRecord): CodexJob {
  return codexJobSchema.parse({
    id: record.id,
    action: record.action,
    status: record.status,
    ...(record.run ? { run: record.run } : {}),
    ...(record.error ? { error: record.error } : {}),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.startedAt ? { startedAt: record.startedAt } : {}),
    ...(record.completedAt ? { completedAt: record.completedAt } : {}),
  });
}
