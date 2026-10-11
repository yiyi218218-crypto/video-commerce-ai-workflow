import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { RunNotFoundError, WorkflowStateError } from "../../errors.js";
import {
  productVideoProductionJobSchema,
  type ProductVideoProductionJob,
} from "../../schemas/product-video-production-job.schema.js";

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FileProductVideoProductionJobStore {
  constructor(private readonly directory: string) {}

  async create(job: ProductVideoProductionJob): Promise<void> {
    await this.write(job);
  }

  async save(job: ProductVideoProductionJob): Promise<void> {
    await this.write(job);
  }

  async get(jobId: string): Promise<ProductVideoProductionJob> {
    const file = this.resolveFile(jobId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        try {
          raw = await readFile(`${file}.bak`, "utf8");
        } catch (backupError) {
          if (isNodeError(backupError) && backupError.code === "ENOENT") {
            throw new RunNotFoundError(jobId);
          }
          throw backupError;
        }
      } else {
        throw error;
      }
    }
    try {
      return productVideoProductionJobSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new WorkflowStateError(
        `Stored video production job "${jobId}" is invalid.`,
        error,
      );
    }
  }

  async list(): Promise<ProductVideoProductionJob[]> {
    await mkdir(this.directory, { recursive: true });
    const ids = (await readdir(this.directory))
      .map((file) => /^([0-9a-f-]+)\.json(?:\.bak)?$/i.exec(file)?.[1])
      .filter((id): id is string => Boolean(id));
    const jobs = await Promise.all([...new Set(ids)].map((id) => this.get(id)));
    return jobs.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  async markInterrupted(): Promise<number> {
    const jobs = await this.list();
    let count = 0;
    for (const job of jobs) {
      if (job.status !== "queued" && job.status !== "running") {
        continue;
      }
      const now = new Date().toISOString();
      await this.save({
        ...job,
        status: "interrupted",
        error: {
          code: "VIDEO_PRODUCTION_INTERRUPTED",
          message: "The local service stopped before creative production completed.",
        },
        updated_at: now,
        completed_at: now,
      });
      count += 1;
    }
    return count;
  }

  private async write(job: ProductVideoProductionJob): Promise<void> {
    const parsed = productVideoProductionJobSchema.parse(job);
    await mkdir(this.directory, { recursive: true });
    const file = this.resolveFile(parsed.id);
    const temporary = path.join(this.directory, `.${parsed.id}.${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    await this.replaceFile(temporary, file, `${file}.bak`);
  }

  private async replaceFile(
    temporary: string,
    file: string,
    backup: string,
  ): Promise<void> {
    await unlinkIfExists(backup);
    try {
      await rename(file, backup);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    try {
      await rename(temporary, file);
    } catch (error) {
      try {
        await rename(backup, file);
      } catch {
        // Keep the original replacement failure; the backup remains recoverable.
      }
      throw error;
    }
    await unlinkIfExists(backup);
  }

  private resolveFile(jobId: string): string {
    if (!jobIdPattern.test(jobId)) {
      throw new WorkflowStateError(`Video production job "${jobId}" is not valid.`);
    }
    return path.join(this.directory, `${jobId}.json`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function unlinkIfExists(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}
