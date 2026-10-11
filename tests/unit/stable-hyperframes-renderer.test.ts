import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { VcaError } from "../../src/errors.js";
import {
  planStableHyperFramesRenderAttempts,
  renderStableHyperFrames,
  type HyperFramesCommandInvocation,
} from "../../src/services/video/stable-hyperframes-renderer.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("planStableHyperFramesRenderAttempts", () => {
  it("starts at standard quality when high is requested under low memory", () => {
    const attempts = planStableHyperFramesRenderAttempts(
      "high",
      512 * 1024 * 1024,
    );

    expect(attempts.map((attempt) => attempt.quality)).toEqual([
      "standard",
      "draft",
    ]);
    expect(attempts[0]?.args).toEqual(
      expect.arrayContaining(["--workers", "1", "--no-browser-gpu"]),
    );
  });
});

describe("renderStableHyperFrames", () => {
  it("uses the stable render command and returns the actual rendered quality", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-hf-stable-"));
    directories.push(directory);
    const outputPath = path.join(directory, "render.mp4");
    const invocations: HyperFramesCommandInvocation[] = [];

    const result = await renderStableHyperFrames({
      projectDirectory: directory,
      outputPath,
      requestedQuality: "high",
      freeMemoryBytes: 512 * 1024 * 1024,
      commandRunner: async (invocation) => {
        invocations.push(invocation);
        if (invocation.args.includes("render")) {
          await writeFile(outputPath, "fake mp4");
        }
      },
    });

    expect(result.requestedQuality).toBe("high");
    expect(result.actualQuality).toBe("standard");
    expect(result.lowMemoryMode).toBe(true);
    expect(invocations[0]?.args).toEqual(["hyperframes", "check", directory]);
    expect(invocations[1]?.args).toEqual(
      expect.arrayContaining([
        "hyperframes",
        "render",
        directory,
        "--output",
        outputPath,
        "--quality",
        "standard",
      ]),
    );
    expect(await readFile(outputPath, "utf8")).toBe("fake mp4");
  });

  it("falls back to draft when standard render fails", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-hf-stable-"));
    directories.push(directory);
    const outputPath = path.join(directory, "render.mp4");

    const result = await renderStableHyperFrames({
      projectDirectory: directory,
      outputPath,
      requestedQuality: "standard",
      runCheck: false,
      commandRunner: async (invocation) => {
        const quality = readArg(invocation.args, "--quality");
        if (quality === "standard") {
          throw new Error("renderer stalled");
        }
        await writeFile(outputPath, "fallback mp4");
      },
    });

    expect(result.actualQuality).toBe("draft");
    expect(result.attempts).toMatchObject([
      { quality: "standard", ok: false },
      { quality: "draft", ok: true },
    ]);
  });

  it("throws a structured VcaError after all render attempts fail", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-hf-stable-"));
    directories.push(directory);

    await expect(
      renderStableHyperFrames({
        projectDirectory: directory,
        outputPath: path.join(directory, "render.mp4"),
        requestedQuality: "draft",
        runCheck: false,
        commandRunner: async () => {
          throw new Error("all failed");
        },
      }),
    ).rejects.toMatchObject({
      code: "VIDEO_HYPERFRAMES_STABLE_RENDER_FAILED",
    } satisfies Partial<VcaError>);
  });
});

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
