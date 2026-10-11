import { randomUUID } from "node:crypto";

import { serializeError } from "../../errors.js";
import type {
  ProductVideoProductionJob,
  ProductVideoProductionRequest,
} from "../../schemas/product-video-production-job.schema.js";
import type { ProductVideoProject } from "../../schemas/product-video-project.schema.js";
import { FileProductVideoProductionJobStore } from "./file-product-video-production-job-store.js";

export type ProductVideoProductionExecutor = (
  request: ProductVideoProductionRequest,
) => Promise<ProductVideoProject>;

export class ProductVideoProductionQueue {
  private readonly pending: string[] = [];
  private draining = false;

  constructor(
    private readonly store: FileProductVideoProductionJobStore,
    private readonly executor: ProductVideoProductionExecutor,
  ) {}

  async initialize(): Promise<number> {
    return this.store.markInterrupted();
  }

  async submit(request: ProductVideoProductionRequest): Promise<ProductVideoProductionJob> {
    const now = new Date().toISOString();
    const job: ProductVideoProductionJob = {
      id: randomUUID(),
      status: "queued",
      request,
      created_at: now,
      updated_at: now,
    };
    await this.store.create(job);
    this.pending.push(job.id);
    void this.drain();
    return job;
  }

  async get(jobId: string): Promise<ProductVideoProductionJob> {
    return this.store.get(jobId);
  }

  async list(): Promise<ProductVideoProductionJob[]> {
    return this.store.list();
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
    const job = await this.store.get(jobId);
    const startedAt = new Date().toISOString();
    await this.store.save({
      ...job,
      status: "running",
      started_at: startedAt,
      updated_at: startedAt,
    });
    try {
      const project = await this.executor(job.request);
      const completedAt = new Date().toISOString();
      await this.store.save({
        ...job,
        status: "completed",
        project,
        updated_at: completedAt,
        started_at: startedAt,
        completed_at: completedAt,
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      await this.store.save({
        ...job,
        status: "failed",
        error: serializeError(error),
        updated_at: completedAt,
        started_at: startedAt,
        completed_at: completedAt,
      });
    }
  }
}
