import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentRegistry } from "../../src/agents/agent-registry.js";
import { PhaseZeroAgent } from "../../src/agents/demo/phase-zero-agent.js";
import type { ContractAgent } from "../../src/agents/agent.js";
import { workflowDefinitionSchema } from "../../src/schemas/workflow-definition.schema.js";
import { EchoLlmProvider } from "../../src/services/llm/echo-llm-provider.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import { FileRunStore } from "../../src/services/storage/file-run-store.js";
import type { LoadedWorkflow } from "../../src/workflows/workflow-repository.js";
import { WorkflowRunner } from "../../src/workflows/workflow-runner.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const directory of tempDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("vca-test-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

function createRunner(directory: string): WorkflowRunner {
  const registry = new AgentRegistry();
  registry.register(
    new PhaseZeroAgent(new EchoLlmProvider(), new PromptLoader()),
  );
  return new WorkflowRunner(registry, new FileRunStore(directory));
}

class FailOnceAgent implements ContractAgent<
  { message: string },
  { message: string }
> {
  readonly name = "fail_once";
  readonly inputSchema = z.object({ message: z.string() }).strict();
  readonly outputSchema = z.object({ message: z.string() }).strict();
  private hasFailed = false;

  async run(input: { message: string }): Promise<{ message: string }> {
    if (!this.hasFailed) {
      this.hasFailed = true;
      throw new Error("planned failure");
    }
    return input;
  }
}

describe("WorkflowRunner", () => {
  it("persists a checkpoint and resumes without repeating completed work", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-test-"));
    tempDirectories.push(directory);
    const runner = createRunner(directory);
    const loaded: LoadedWorkflow = {
      definition: workflowDefinitionSchema.parse({
        workflow: "checkpoint_test",
        version: "1.0.0",
        steps: [
          {
            id: "capture",
            agent: "phase0_echo",
            input: { message: "$.input.message" },
            checkpoint: true,
          },
          {
            id: "finish",
            agent: "phase0_echo",
            input: { message: "$.steps.capture.message" },
          },
        ],
      }),
      hash: "checkpoint-test-hash",
      source: "inline",
    };

    const waiting = await runner.start(loaded, { message: "hello" });
    expect(waiting.status).toBe("waiting_for_input");
    expect(waiting.steps[0]).toMatchObject({
      status: "completed",
      attempts: 1,
    });
    expect(waiting.steps[1]?.status).toBe("pending");

    const completed = await runner.resume(waiting.id, loaded, {
      approved: true,
    });
    expect(completed.status).toBe("completed");
    expect(completed.steps[0]?.attempts).toBe(1);
    expect(completed.steps[1]).toMatchObject({
      status: "completed",
      attempts: 1,
      output: { message: "hello" },
    });
  });

  it("passes each compact step output to the next agent", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-test-"));
    tempDirectories.push(directory);
    const runner = createRunner(directory);
    const loaded: LoadedWorkflow = {
      definition: workflowDefinitionSchema.parse({
        workflow: "compact_test",
        steps: ["phase0_echo", "phase0_echo"],
      }),
      hash: "compact-test-hash",
      source: "inline",
    };

    const completed = await runner.start(loaded, { message: "hello" });
    expect(completed.status).toBe("completed");
    expect(completed.artifacts.phase0_echo_2).toEqual({
      message: "hello",
    });
  });

  it("starts a fresh attempt budget when a failed run is resumed", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-test-"));
    tempDirectories.push(directory);
    const registry = new AgentRegistry();
    registry.register(new FailOnceAgent());
    const runner = new WorkflowRunner(
      registry,
      new FileRunStore(directory),
    );
    const loaded: LoadedWorkflow = {
      definition: workflowDefinitionSchema.parse({
        workflow: "failure_test",
        steps: ["fail_once"],
      }),
      hash: "failure-test-hash",
      source: "inline",
    };

    const failed = await runner.start(loaded, { message: "retry me" });
    expect(failed.status).toBe("failed");
    expect(failed.steps[0]?.attempts).toBe(1);

    const completed = await runner.resume(failed.id, loaded);
    expect(completed.status).toBe("completed");
    expect(completed.steps[0]).toMatchObject({
      attempts: 1,
      output: { message: "retry me" },
    });
  });
});
