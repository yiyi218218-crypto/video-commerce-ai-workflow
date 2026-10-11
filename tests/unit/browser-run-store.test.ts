import type { WorkflowRun } from "../../src/schemas/workflow-run.schema.js";
import { BrowserRunStore } from "../../src/web/browser-run-store.js";
import { describe, expect, it } from "vitest";

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function makeRun(id: string, updatedAt: string): WorkflowRun {
  return {
    id,
    workflow: "video_sales_phase2",
    workflowVersion: "1.0.0",
    workflowHash: "hash",
    status: "waiting_for_input",
    initialInput: {},
    artifacts: {},
    checkpoints: {},
    steps: [],
    pendingCheckpoint: {
      stepId: "content_plan",
      requestedAt: updatedAt,
    },
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("BrowserRunStore", () => {
  it("upserts, sorts, and removes validated workflow runs", () => {
    const store = new BrowserRunStore(new FakeStorage());
    store.save(makeRun("older", "2026-01-01T00:00:00.000Z"));
    store.save(makeRun("newer", "2026-01-02T00:00:00.000Z"));
    store.save({
      ...makeRun("older", "2026-01-03T00:00:00.000Z"),
      status: "completed",
      pendingCheckpoint: undefined,
    } as WorkflowRun);

    expect(store.list().map((run) => run.id)).toEqual(["older", "newer"]);
    expect(store.remove("older").map((run) => run.id)).toEqual(["newer"]);
  });

  it("ignores malformed persisted data", () => {
    const storage = new FakeStorage();
    storage.setItem(
      "video-commerce-ai.workflow-runs.v1",
      JSON.stringify([{ id: "invalid" }]),
    );

    expect(new BrowserRunStore(storage).list()).toEqual([]);
  });
});
