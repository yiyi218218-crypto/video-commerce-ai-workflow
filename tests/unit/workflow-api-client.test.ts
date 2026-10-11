import { describe, expect, it, vi } from "vitest";

import type { CodexJob } from "../../src/web/codex-job.schema.js";
import {
  executeAccountIncubationWorkflow,
  executeVideoSalesWorkflow,
} from "../../src/web/workflow-api-client.js";
import { sampleAccountIncubationInput } from "../fixtures/account-incubation.js";
import {
  makeWorkflowRequest,
  makeWorkflowRun,
} from "../fixtures/workflow-job.js";

describe("executeVideoSalesWorkflow", () => {
  it("polls an asynchronous local Codex job to completion", async () => {
    const run = makeWorkflowRun("waiting_for_input");
    const now = new Date().toISOString();
    const queued: CodexJob = {
      id: "22222222-2222-4222-8222-222222222222",
      action: "start",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    const running: CodexJob = {
      ...queued,
      status: "running",
      run: makeWorkflowRun("running", run.id),
      startedAt: now,
    };
    const completed: CodexJob = {
      ...running,
      status: "completed",
      run,
      completedAt: now,
    };
    const responses = [
      Response.json({ ok: true, job: queued }, { status: 202 }),
      Response.json({ ok: true, job: running }),
      Response.json({ ok: true, job: completed }),
    ];
    const fetchImplementation = vi.fn(async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error("Unexpected fetch.");
      }
      return response;
    });
    const progress: string[] = [];

    const result = await executeVideoSalesWorkflow(
      makeWorkflowRequest(),
      {
        fetchImplementation,
        pollIntervalMs: 0,
        onProgress: (job) => progress.push(job.status),
      },
    );

    expect(result).toEqual(run);
    expect(progress).toEqual(["queued", "running", "completed"]);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it("keeps synchronous Sites Worker responses compatible", async () => {
    const run = makeWorkflowRun("waiting_for_input");

    const result = await executeVideoSalesWorkflow(
      makeWorkflowRequest(),
      {
        fetchImplementation: async () =>
          Response.json({ ok: true, run }),
      },
    );

    expect(result).toEqual(run);
  });

  it("posts account incubation runs to their separate content-first endpoint", async () => {
    const run = makeWorkflowRun("completed");
    const fetchImplementation = vi.fn(async () => Response.json({ ok: true, run }));

    await expect(
      executeAccountIncubationWorkflow(
        { action: "start", input: sampleAccountIncubationInput },
        { fetchImplementation },
      ),
    ).resolves.toEqual(run);

    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/workflows/account-incubation",
      expect.anything(),
    );
  });
});
