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
import {
  sampleLiveContext,
  sampleLiveOutput,
  sampleProductionContext,
  sampleScriptOutput,
} from "../fixtures/phase-two.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const directory of tempDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("vca-phase2-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

function workflowInput() {
  return {
    product: sampleProductInput,
    production_context: sampleProductionContext,
    live_context: sampleLiveContext,
  };
}

function createPhaseTwoProvider() {
  return new ScriptedLlmProvider([
    sampleProductOutput,
    sampleContentOutput,
    sampleScriptOutput,
    sampleLiveOutput,
  ]);
}

describe("video_sales_phase2 workflow", () => {
  it("resumes from direction selection into scripts and live playbook", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-phase2-"),
    );
    tempDirectories.push(runsDirectory);
    const provider = createPhaseTwoProvider();
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: provider,
    });
    const workflow = await runtime.workflowRepository.load(
      "video_sales_phase2",
    );

    const waiting = await runtime.workflowRunner.start(
      workflow,
      workflowInput(),
    );
    expect(waiting.status).toBe("waiting_for_input");
    expect(provider.requests).toHaveLength(2);

    const completed = await runtime.workflowRunner.resume(
      waiting.id,
      workflow,
      { selected_direction_id: "direction_1" },
    );

    expect(completed.status).toBe("completed");
    expect(completed.artifacts.script_bundle).toEqual(sampleScriptOutput);
    expect(completed.artifacts.live_playbook).toEqual(sampleLiveOutput);
    expect(
      provider.requests.map((request) => request.outputSchemaName),
    ).toEqual([
      "product_agent_output",
      "content_agent_output",
      "script_agent_output",
      "live_agent_output",
    ]);
  });

  it("allows a failed direction selection to be corrected without rerunning earlier agents", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-phase2-"),
    );
    tempDirectories.push(runsDirectory);
    const provider = createPhaseTwoProvider();
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: provider,
    });
    const workflow = await runtime.workflowRepository.load(
      "video_sales_phase2",
    );
    const waiting = await runtime.workflowRunner.start(
      workflow,
      workflowInput(),
    );

    const failed = await runtime.workflowRunner.resume(
      waiting.id,
      workflow,
      { selected_direction_id: "direction_99" },
    );
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("AGENT_INPUT_INVALID");
    expect(provider.requests).toHaveLength(2);

    const corrected = await runtime.workflowRunner.resume(
      failed.id,
      workflow,
      { selected_direction_id: "direction_1" },
    );
    expect(corrected.status).toBe("completed");
    expect(corrected.steps[0]?.attempts).toBe(1);
    expect(corrected.steps[1]?.attempts).toBe(1);
    expect(provider.requests).toHaveLength(4);
  });
});
