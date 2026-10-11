import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { RunNotFoundError, WorkflowStateError } from "../../errors.js";
import {
  codexJobRecordSchema,
  type CodexJobRecord,
} from "../../web/codex-job.schema.js";

const jobIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class FileCodexJobStore {
  constructor(private readonly directory: string) {}

  async create(job: CodexJobRecord): Promise<void> {
    await this.write(job);
  }

  async save(job: CodexJobRecord): Promise<void> {
    await this.write(job);
  }

  async get(jobId: string): Promise<CodexJobRecord> {
    const file = this.resolveJobFile(jobId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        try {
          raw = await readFile(this.resolveBackupFile(jobId), "utf8");
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
      return codexJobRecordSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new WorkflowStateError(
        `Stored Codex job "${jobId}" is invalid.`,
        error,
      );
    }
  }

  async list(): Promise<CodexJobRecord[]> {
    await mkdir(this.directory, { recursive: true });
    const files = await readdir(this.directory);
    const jobIds = [
      ...new Set(
        files.flatMap((file) => {
          const match = /^([0-9a-f-]+)\.json(?:\.bak)?$/i.exec(file);
          return match?.[1] ? [match[1]] : [];
        }),
      ),
    ];
    const jobs = await Promise.all(
      jobIds.map((jobId) => this.get(jobId)),
    );
    return jobs.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async markInterrupted(): Promise<number> {
    const jobs = await this.list();
    let count = 0;
    for (const job of jobs) {
      if (job.status !== "queued" && job.status !== "running") {
        continue;
      }
      const now = new Date().toISOString();
      job.status = "interrupted";
      job.error = {
        code: "CODEX_JOB_INTERRUPTED",
        message:
          "本机服务在任务完成前停止。请从最新 Run 快照重新发起或恢复。",
      };
      job.updatedAt = now;
      job.completedAt = now;
      await this.save(job);
      count += 1;
    }
    return count;
  }

  private async write(job: CodexJobRecord): Promise<void> {
    const parsed = codexJobRecordSchema.parse(job);
    await mkdir(this.directory, { recursive: true });
    const file = this.resolveJobFile(parsed.id);
    const temporary = path.join(
      this.directory,
      `${parsed.id}.${randomUUID()}.tmp`,
    );
    await writeFile(
      temporary,
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
    await this.replaceFile(temporary, file, this.resolveBackupFile(parsed.id));
  }

  private resolveJobFile(jobId: string): string {
    if (!jobIdPattern.test(jobId)) {
      throw new WorkflowStateError(`Codex job id "${jobId}" is not valid.`);
    }
    return path.join(this.directory, `${jobId}.json`);
  }

  private resolveBackupFile(jobId: string): string {
    return `${this.resolveJobFile(jobId)}.bak`;
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
        // Preserve the original replacement error. A remaining backup is
        // still readable by get() and recoverable on the next save.
      }
      throw error;
    }
    await unlinkIfExists(backup);
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
