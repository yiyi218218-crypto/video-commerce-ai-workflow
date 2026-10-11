import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRuntime } from "../../src/runtime.js";
import {
  sampleCommentInput,
  sampleCommentOutput,
} from "../fixtures/comment.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  const temporaryRoot = path.resolve(os.tmpdir());
  for (const directory of tempDirectories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${temporaryRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("vca-comment-")
    ) {
      throw new Error(`Refusing to remove unexpected path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
});

describe("comment_ops workflow", () => {
  it("generates a reply plan and pauses for human review", async () => {
    const runsDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vca-comment-"),
    );
    tempDirectories.push(runsDirectory);
    const provider = new ScriptedLlmProvider([sampleCommentOutput]);
    const runtime = createRuntime({
      workflowsDirectory: path.resolve("src/workflows/definitions"),
      runsDirectory,
      businessProvider: provider,
    });
    const workflow = await runtime.workflowRepository.load("comment_ops");

    const waiting = await runtime.workflowRunner.start(
      workflow,
      sampleCommentInput,
    );
    expect(waiting.status).toBe("waiting_for_input");
    expect(waiting.artifacts.comment_reply).toEqual(sampleCommentOutput);
    expect(provider.requests).toHaveLength(1);

    const completed = await runtime.workflowRunner.resume(
      waiting.id,
      workflow,
      { approved_reply_index: 1 },
    );
    expect(completed.status).toBe("completed");
    expect(completed.checkpoints.comment_reply).toEqual({
      approved_reply_index: 1,
    });
    expect(provider.requests).toHaveLength(1);
  });
});
