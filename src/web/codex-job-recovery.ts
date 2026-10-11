import type { WorkflowRun } from "../schemas/workflow-run.schema.js";
import type { CodexJob } from "./codex-job.schema.js";

export function getRecoverableRuns(
  jobs: CodexJob[],
  storedRuns: WorkflowRun[],
): WorkflowRun[] {
  const storedById = new Map(
    storedRuns.map((run) => [run.id, run.updatedAt]),
  );

  return jobs
    .flatMap((job) => {
      const run = job.run;
      if (
        !run ||
        job.status === "queued" ||
        job.status === "running" ||
        run.status === "pending" ||
        run.status === "running"
      ) {
        return [];
      }
      const storedUpdatedAt = storedById.get(run.id);
      return !storedUpdatedAt || run.updatedAt > storedUpdatedAt
        ? [run]
        : [];
    })
    .reverse();
}
