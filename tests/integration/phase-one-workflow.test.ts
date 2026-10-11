import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntime } from "../../src/runtime.js";
import {
  sampleContentOutput,
  sampleProductInput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const directory of tempDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("vca-phase1-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("video_sales_phase1 workflow", () => {
  it("runs product analysis, content planning, and selection checkpoint", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-phase1-"),
    );
    tempDirectories.push(runsDirectory);
    const provider = new ScriptedLlmProvider([
      sampleProductOutput,
      sampleContentOutput,
    ]);
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: provider,
    });
    const workflow = await runtime.workflowRepository.load(
      "video_sales_phase1",
    );

    const waiting = await runtime.workflowRunner.start(workflow, {
      product: sampleProductInput,
    });
    expect(waiting.status).toBe("waiting_for_input");
    expect(waiting.artifacts.product_analysis).toEqual(sampleProductOutput);
    expect(waiting.artifacts.content_plan).toEqual(sampleContentOutput);
    expect(provider.requests).toHaveLength(2);

    const completed = await runtime.workflowRunner.resume(
      waiting.id,
      workflow,
      { selected_direction_id: "direction_1" },
    );
    expect(completed.status).toBe("completed");
    expect(completed.checkpoints.content_plan).toEqual({
      selected_direction_id: "direction_1",
    });
    expect(provider.requests).toHaveLength(2);
  });

  it("fails explicitly instead of using demo content when no provider is configured", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-phase1-"),
    );
    tempDirectories.push(runsDirectory);
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
    });
    const workflow = await runtime.workflowRepository.load(
      "video_sales_phase1",
    );

    const failed = await runtime.workflowRunner.start(workflow, {
      product: sampleProductInput,
    });

    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({
      code: "LLM_PROVIDER_NOT_CONFIGURED",
    });
    expect(failed.artifacts).toEqual({});
  });
});
