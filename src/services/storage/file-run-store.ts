import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { RunNotFoundError, WorkflowStateError } from "../../errors.js";
import {
  workflowRunSchema,
  type WorkflowRun,
} from "../../schemas/workflow-run.schema.js";
import type { RunStore } from "./run-store.js";

const runIdPattern = /^[a-zA-Z0-9_-]+$/;

export class FileRunStore implements RunStore {
  constructor(private readonly directory: string) {}

  async create(run: WorkflowRun): Promise<void> {
    await this.write(run);
  }

  async save(run: WorkflowRun): Promise<void> {
    await this.write(run);
  }

  async get(runId: string): Promise<WorkflowRun> {
    const file = this.resolveRunFile(runId);
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new RunNotFoundError(runId);
      }
      throw error;
    }

    try {
      return workflowRunSchema.parse(JSON.parse(raw));
    } catch (error) {
      throw new WorkflowStateError(
        `Stored workflow run "${runId}" is invalid.`,
        error,
      );
    }
  }

  async list(): Promise<WorkflowRun[]> {
    await mkdir(this.directory, { recursive: true });
    const files = await readdir(this.directory);
    const runs = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => this.get(file.slice(0, -5))),
    );

    return runs.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  private async write(run: WorkflowRun): Promise<void> {
    const validated = workflowRunSchema.parse(run);
    await mkdir(this.directory, { recursive: true });
    const file = this.resolveRunFile(validated.id);
    await writeFile(file, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  }

  private resolveRunFile(runId: string): string {
    if (!runIdPattern.test(runId)) {
      throw new WorkflowStateError(`Run id "${runId}" is not valid.`);
    }
    return path.join(this.directory, `${runId}.json`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
