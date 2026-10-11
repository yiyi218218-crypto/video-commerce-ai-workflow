import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CodexJobQueue } from "../../src/services/jobs/codex-job-queue.js";
import { FileCodexJobStore } from "../../src/services/jobs/file-codex-job-store.js";
import type { CodexJobRecord } from "../../src/web/codex-job.schema.js";
import {
  makeWorkflowRequest,
  makeWorkflowRun,
} from "../fixtures/workflow-job.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("CodexJobQueue", () => {
  it("persists jobs, publishes run snapshots, and executes serially", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileCodexJobStore(directory);
    const executionOrder: string[] = [];
    let releaseFirst = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new CodexJobQueue(
      store,
      async (request, onRun) => {
        const name =
          request.action === "start" && "product" in request.input
            ? request.input.product.product_name
            : "resume";
        executionOrder.push(name);
        const snapshot = makeWorkflowRun("running");
        await onRun(snapshot);
        if (name === "first") {
          await firstGate;
        }
        return {
          ...snapshot,
          status: "waiting_for_input",
          updatedAt: new Date().toISOString(),
        };
      },
    );
    await queue.initialize();

    const first = await queue.submit(makeWorkflowRequest("first"));
    const second = await queue.submit(makeWorkflowRequest("second"));
    await waitUntil(async () => (await queue.get(first.id)).run !== undefined);

    expect((await queue.get(first.id)).status).toBe("running");
    expect((await queue.get(second.id)).status).toBe("queued");
    expect(executionOrder).toEqual(["first"]);

    releaseFirst();
    await waitUntil(
      async () => (await queue.get(second.id)).status === "completed",
    );

    expect(executionOrder).toEqual(["first", "second"]);
    expect((await store.get(first.id)).request).toEqual(
      makeWorkflowRequest("first"),
    );
    expect((await queue.get(second.id)).run?.status).toBe(
      "waiting_for_input",
    );
  });

  it("marks unfinished jobs as interrupted on startup", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileCodexJobStore(directory);
    const now = new Date().toISOString();
    const queued: CodexJobRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      action: "start",
      status: "queued",
      request: makeWorkflowRequest(),
      createdAt: now,
      updatedAt: now,
    };
    await store.create(queued);
    const queue = new CodexJobQueue(store, async () =>
      makeWorkflowRun("completed"),
    );

    expect(await queue.initialize()).toBe(1);
    expect((await queue.get(queued.id)).status).toBe("interrupted");
    expect((await queue.get(queued.id)).error?.code).toBe(
      "CODEX_JOB_INTERRUPTED",
    );
  });

  it("recovers a backup left during an interrupted Windows replacement", async () => {
    const directory = await createTemporaryDirectory();
    const store = new FileCodexJobStore(directory);
    const now = new Date().toISOString();
    const queued: CodexJobRecord = {
      id: "33333333-3333-4333-8333-333333333333",
      action: "start",
      status: "queued",
      request: makeWorkflowRequest("backup recovery"),
      createdAt: now,
      updatedAt: now,
    };
    await store.create(queued);
    await rename(
      path.join(directory, `${queued.id}.json`),
      path.join(directory, `${queued.id}.json.bak`),
    );

    const queue = new CodexJobQueue(store, async () =>
      makeWorkflowRun("completed"),
    );
    expect(await queue.initialize()).toBe(1);
    expect((await queue.get(queued.id)).status).toBe("interrupted");
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "vca-codex-job-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for job state.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
