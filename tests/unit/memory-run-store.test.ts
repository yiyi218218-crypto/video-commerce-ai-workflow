import { RunNotFoundError } from "../../src/errors.js";
import type { WorkflowRun } from "../../src/schemas/workflow-run.schema.js";
import { MemoryRunStore } from "../../src/services/storage/memory-run-store.js";
import { describe, expect, it } from "vitest";

function makeRun(id: string, updatedAt: string): WorkflowRun {
  return {
    id,
    workflow: "video_sales_phase2",
    workflowVersion: "1.0.0",
    workflowHash: "hash",
    status: "pending",
    initialInput: {},
    artifacts: {},
    checkpoints: {},
    steps: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("MemoryRunStore", () => {
  it("clones values and lists newest runs first", async () => {
    const older = makeRun("older", "2026-01-01T00:00:00.000Z");
    const newer = makeRun("newer", "2026-01-02T00:00:00.000Z");
    const store = new MemoryRunStore([older, newer]);

    const loaded = await store.get("newer");
    loaded.status = "cancelled";

    expect((await store.get("newer")).status).toBe("pending");
    expect((await store.list()).map((run) => run.id)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("rejects unknown ids", async () => {
    const store = new MemoryRunStore();
    await expect(store.get("missing")).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
