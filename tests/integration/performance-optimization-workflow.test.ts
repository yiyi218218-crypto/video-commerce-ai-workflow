import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntime } from "../../src/runtime.js";
import {
  sampleDataAnalysisInput,
  sampleDataAnalysisModelOutput,
} from "../fixtures/data-analysis.js";
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
      !path.basename(resolved).startsWith("vca-phase3-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("performance_optimization workflow", () => {
  it("feeds an evidence-based optimization brief into the next content plan", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-phase3-"),
    );
    tempDirectories.push(runsDirectory);
    const provider = new ScriptedLlmProvider([
      sampleProductOutput,
      sampleDataAnalysisModelOutput,
      sampleContentOutput,
    ]);
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: provider,
    });
    const workflow = await runtime.workflowRepository.load(
      "performance_optimization",
    );

    const waiting = await runtime.workflowRunner.start(workflow, {
      product: sampleProductInput,
      performance: sampleDataAnalysisInput,
    });

    expect(waiting.status).toBe("waiting_for_input");
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[2]?.input).toMatchObject({
      optimization_brief:
        sampleDataAnalysisModelOutput.optimization_brief,
    });
    expect(waiting.artifacts.data_analysis).toMatchObject({
      analysis: sampleDataAnalysisModelOutput,
    });

    const completed = await runtime.workflowRunner.resume(
      waiting.id,
      workflow,
      { approved: true },
    );

    expect(completed.status).toBe("completed");
    expect(provider.requests).toHaveLength(3);
  });
});
