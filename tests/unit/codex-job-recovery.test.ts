import { describe, expect, it } from "vitest";

import { getRecoverableRuns } from "../../src/web/codex-job-recovery.js";
import type { CodexJob } from "../../src/web/codex-job.schema.js";
import { makeWorkflowRun } from "../fixtures/workflow-job.js";

describe("getRecoverableRuns", () => {
  it("restores terminal jobs completed while the browser was closed", () => {
    const older = makeWorkflowRun(
      "waiting_for_input",
      "older-run",
    );
    const latest = {
      ...makeWorkflowRun("waiting_for_input", "latest-run"),
      updatedAt: new Date(Date.now() + 1_000).toISOString(),
    };
    const jobs = [
      makeJob("completed", latest),
      makeJob("completed", older),
      makeJob("running", makeWorkflowRun("running", "active-run")),
    ];

    expect(getRecoverableRuns(jobs, [])).toEqual([older, latest]);
  });

  it("skips a persisted run unless the disk snapshot is newer", () => {
    const stored = makeWorkflowRun(
      "waiting_for_input",
      "persisted-run",
    );
    const sameJob = makeJob("completed", stored);
    const newerRun = {
      ...stored,
      updatedAt: new Date(Date.parse(stored.updatedAt) + 1_000).toISOString(),
    };

    expect(getRecoverableRuns([sameJob], [stored])).toEqual([]);
    expect(
      getRecoverableRuns([makeJob("completed", newerRun)], [stored]),
    ).toEqual([newerRun]);
  });
});

function makeJob(
  status: CodexJob["status"],
  run: NonNullable<CodexJob["run"]>,
): CodexJob {
  return {
    id: crypto.randomUUID(),
    action: "start",
    status,
    run,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(status === "completed" ? { completedAt: run.updatedAt } : {}),
  };
}
