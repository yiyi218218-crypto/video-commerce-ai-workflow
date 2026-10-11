import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntime } from "../../src/runtime.js";
import {
  sampleAccountIncubationInput,
  sampleAccountIncubationOutput,
} from "../fixtures/account-incubation.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  const root = path.resolve(os.tmpdir());
  for (const directory of temporaryDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(`${root}${path.sep}`) || !path.basename(resolved).startsWith("vca-incubation-")) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("account_incubation workflow", () => {
  it("creates a complete non-commercial first-week content plan", async () => {
    const runsDirectory = await mkdtemp(path.join(os.tmpdir(), "vca-incubation-"));
    temporaryDirectories.push(runsDirectory);
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: new ScriptedLlmProvider([sampleAccountIncubationOutput]),
    });
    const workflow = await runtime.workflowRepository.load("account_incubation");

    const run = await runtime.workflowRunner.start(workflow, sampleAccountIncubationInput);

    expect(run.status).toBe("completed");
    expect(run.artifacts.incubation_plan).toEqual(sampleAccountIncubationOutput);
  });
});
