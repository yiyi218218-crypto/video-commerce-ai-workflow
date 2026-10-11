import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { VcaError } from "../../errors.js";

export type HyperFramesRenderQuality = "draft" | "standard" | "high";

export interface HyperFramesCommandInvocation {
  label: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export type HyperFramesCommandRunner = (
  invocation: HyperFramesCommandInvocation,
) => Promise<void>;

export interface StableHyperFramesRenderAttempt {
  label: string;
  quality: HyperFramesRenderQuality;
  reason: string;
  args: string[];
}

export interface StableHyperFramesAttemptResult {
  label: string;
  quality: HyperFramesRenderQuality;
  ok: boolean;
  message?: string;
}

export interface StableHyperFramesRenderOptions {
  projectDirectory: string;
  outputPath: string;
  requestedQuality?: HyperFramesRenderQuality;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  command?: string;
  commandRunner?: HyperFramesCommandRunner;
  runCheck?: boolean;
  checkTimeoutMs?: number;
  renderTimeoutMs?: number;
  freeMemoryBytes?: number;
}

export interface StableHyperFramesRenderResult {
  outputPath: string;
  requestedQuality: HyperFramesRenderQuality;
  actualQuality: HyperFramesRenderQuality;
  lowMemoryMode: boolean;
  freeMemoryBytes: number;
  attempts: StableHyperFramesAttemptResult[];
}

const lowMemoryThresholdBytes = 2 * 1024 * 1024 * 1024;
const defaultCheckTimeoutMs = 5 * 60_000;
const defaultRenderTimeoutMs = 20 * 60_000;

export function isHyperFramesRenderQuality(
  value: string,
): value is HyperFramesRenderQuality {
  return value === "draft" || value === "standard" || value === "high";
}

export function planStableHyperFramesRenderAttempts(
  requestedQuality: HyperFramesRenderQuality,
  freeMemoryBytes = os.freemem(),
): StableHyperFramesRenderAttempt[] {
  const lowMemoryMode = freeMemoryBytes < lowMemoryThresholdBytes;
  const qualities = qualityFallbackSequence(requestedQuality, lowMemoryMode);

  return qualities.map((quality, index) => ({
    label: `${lowMemoryMode ? "low-memory" : "stable"}-${quality}`,
    quality,
    reason: attemptReason(requestedQuality, index, lowMemoryMode),
    args: [
      "--quality",
      quality,
      "--workers",
      "1",
      "--browser-timeout",
      "180",
      "--no-browser-gpu",
    ],
  }));
}

export async function renderStableHyperFrames(
  options: StableHyperFramesRenderOptions,
): Promise<StableHyperFramesRenderResult> {
  const requestedQuality = options.requestedQuality ?? "standard";
  const projectDirectory = path.resolve(options.projectDirectory);
  const outputPath = path.resolve(options.outputPath);
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? hyperFramesEnvironment();
  const command = options.command ?? npxCommand();
  const commandRunner = options.commandRunner ?? runHyperFramesCommand;
  const freeMemoryBytes = options.freeMemoryBytes ?? os.freemem();
  const attempts = planStableHyperFramesRenderAttempts(
    requestedQuality,
    freeMemoryBytes,
  );
  const results: StableHyperFramesAttemptResult[] = [];

  await mkdir(path.dirname(outputPath), { recursive: true });

  if (options.runCheck !== false) {
    await commandRunner({
      label: "HyperFrames check",
      command,
      args: ["hyperframes", "check", projectDirectory],
      cwd,
      env,
      timeoutMs: options.checkTimeoutMs ?? defaultCheckTimeoutMs,
    });
  }

  for (const attempt of attempts) {
    await unlinkIfExists(outputPath);
    try {
      await commandRunner({
        label: `HyperFrames render (${attempt.label})`,
        command,
        args: [
          "hyperframes",
          "render",
          projectDirectory,
          "--output",
          outputPath,
          ...attempt.args,
        ],
        cwd,
        env,
        timeoutMs: options.renderTimeoutMs ?? defaultRenderTimeoutMs,
      });
      await assertRenderedFile(outputPath);
      results.push({
        label: attempt.label,
        quality: attempt.quality,
        ok: true,
      });
      return {
        outputPath,
        requestedQuality,
        actualQuality: attempt.quality,
        lowMemoryMode: freeMemoryBytes < lowMemoryThresholdBytes,
        freeMemoryBytes,
        attempts: results,
      };
    } catch (error) {
      results.push({
        label: attempt.label,
        quality: attempt.quality,
        ok: false,
        message: errorMessage(error),
      });
    }
  }

  throw new VcaError(
    "VIDEO_HYPERFRAMES_STABLE_RENDER_FAILED",
    `HyperFrames stable render failed after ${attempts.length} attempt(s).`,
    {
      projectDirectory,
      outputPath,
      requestedQuality,
      freeMemoryBytes,
      attempts: results,
    },
  );
}

export function hyperFramesEnvironment(): NodeJS.ProcessEnv {
  const ffmpegBin = "D:\\Tools\\FFmpeg\\ffmpeg-8.1.2-full_build\\bin";
  const ffmpeg = path.join(ffmpegBin, "ffmpeg.exe");
  const ffprobe = path.join(ffmpegBin, "ffprobe.exe");
  const currentPath = process.env.Path ?? process.env.PATH ?? "";
  return {
    ...process.env,
    ...(process.env.HYPERFRAMES_FFMPEG_PATH
      ? {}
      : existsSync(ffmpeg)
        ? { HYPERFRAMES_FFMPEG_PATH: ffmpeg }
        : {}),
    ...(process.env.HYPERFRAMES_FFPROBE_PATH
      ? {}
      : existsSync(ffprobe)
        ? { HYPERFRAMES_FFPROBE_PATH: ffprobe }
        : {}),
    Path: existsSync(ffmpegBin)
      ? `${ffmpegBin};${currentPath}`
      : currentPath,
  };
}

export function npxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

async function runHyperFramesCommand(
  invocation: HyperFramesCommandInvocation,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = requiresCmdShim(invocation.command)
      ? "cmd.exe"
      : invocation.command;
    const args = requiresCmdShim(invocation.command)
      ? ["/d", "/s", "/c", invocation.command, ...invocation.args]
      : invocation.args;
    const spawnOptions = {
      cwd: invocation.cwd,
      env: invocation.env,
      windowsHide: true,
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, spawnOptions);
    } catch (error) {
      reject(
        new VcaError(
          "VIDEO_HYPERFRAMES_COMMAND_FAILED",
          `${invocation.label} could not start: ${errorMessage(error)}`,
          error,
        ),
      );
      return;
    }
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-12_000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timeout = setTimeout(() => {
      child.kill();
      reject(
        new VcaError(
          "VIDEO_HYPERFRAMES_COMMAND_TIMEOUT",
          `${invocation.label} timed out.`,
          { output },
        ),
      );
    }, invocation.timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new VcaError(
          "VIDEO_HYPERFRAMES_COMMAND_FAILED",
          `${invocation.label} could not start: ${error.message}`,
          error,
        ),
      );
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new VcaError(
          "VIDEO_HYPERFRAMES_COMMAND_FAILED",
          `${invocation.label} failed with exit code ${code}. ${output}`.trim(),
        ),
      );
    });
  });
}

function qualityFallbackSequence(
  requestedQuality: HyperFramesRenderQuality,
  lowMemoryMode: boolean,
): HyperFramesRenderQuality[] {
  if (requestedQuality === "draft") {
    return ["draft"];
  }
  if (requestedQuality === "standard") {
    return ["standard", "draft"];
  }
  if (lowMemoryMode) {
    return ["standard", "draft"];
  }
  return ["high", "standard", "draft"];
}

function attemptReason(
  requestedQuality: HyperFramesRenderQuality,
  index: number,
  lowMemoryMode: boolean,
): string {
  if (index === 0 && lowMemoryMode && requestedQuality === "high") {
    return "Available memory is below 2GB, so the stable renderer starts at standard quality instead of high.";
  }
  if (index > 0) {
    return "Fallback attempt after the previous HyperFrames render attempt failed.";
  }
  return "Primary stable render attempt.";
}

async function assertRenderedFile(outputPath: string): Promise<void> {
  const rendered = await stat(outputPath);
  if (rendered.size <= 0) {
    throw new VcaError(
      "VIDEO_HYPERFRAMES_OUTPUT_EMPTY",
      "HyperFrames render completed but output file is empty.",
      { outputPath },
    );
  }
}

async function unlinkIfExists(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function requiresCmdShim(command: string): boolean {
  return process.platform === "win32" && /\.cmd$/iu.test(command);
}
