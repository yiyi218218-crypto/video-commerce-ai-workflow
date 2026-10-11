#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Command } from "commander";

import { HistoricalHyperFramesComposerAgent } from "../agents/historical-hyperframes-composer/historical-hyperframes-composer-agent.js";
import { HistoricalVideoProjectAgent } from "../agents/historical-video-project/historical-video-project-agent.js";
import { WeChatChannelPublisherAgent } from "../agents/publishing/wechat-channel-publisher-agent.js";
import { VcaError, serializeError } from "../errors.js";
import { createRuntime } from "../runtime.js";
import { historicalHyperFramesAssetManifestSchema } from "../schemas/historical-hyperframes-composer-agent.schema.js";
import { historicalShortVideoOutputSchema } from "../schemas/historical-short-video-agent.schema.js";
import { DatasetService } from "../services/evaluation/dataset-service.js";
import { evaluatePhaseOneArtifacts } from "../services/evaluation/phase-one-evaluator.js";
import { evaluatePhaseTwoArtifacts } from "../services/evaluation/phase-two-evaluator.js";
import { liveContextSchema } from "../schemas/live-agent.schema.js";
import { evaluateCommentArtifact } from "../services/evaluation/comment-evaluator.js";
import { evaluateDataAnalysisArtifact } from "../services/evaluation/data-analysis-evaluator.js";

interface GlobalOptions {
  workflowsDir: string;
  runsDir: string;
}

interface InputOptions {
  input?: string;
  inputFile?: string;
}

interface ChannelPreparePublishJobOptions {
  videoPath: string;
  shortTitle: string;
  description?: string;
  descriptionFile?: string;
  expectedChannelName?: string;
  jobFile?: string;
  aiGenerated?: boolean;
  confirmPublish?: boolean;
  action?: "prepare_job" | "prepare_and_publish";
  recentPublishedTextsFile?: string;
  duplicatePolicy?: "warn" | "block";
}

interface HistoryScaffoldProjectOptions {
  blueprintFile: string;
  projectSlug: string;
  projectRoot?: string;
  overwriteExistingScaffold?: boolean;
}

interface HistoryComposeHyperFramesOptions {
  blueprintFile: string;
  assetManifestFile: string;
  projectSlug: string;
  projectRoot?: string;
  outputFileName?: string;
  overwriteExistingComposition?: boolean;
}

const defaultWorkflowsDirectory = fileURLToPath(
  new URL("../workflows/definitions", import.meta.url),
);

export function createProgram(): Command {
  const program = new Command();
  program
    .name("vca")
    .description("Video Commerce AI workflow CLI")
    .version("0.6.0")
    .option(
      "--workflows-dir <path>",
      "workflow definition directory",
      defaultWorkflowsDirectory,
    )
    .option(
      "--runs-dir <path>",
      "workflow run storage directory",
      process.env.VCA_RUNS_DIR ?? path.resolve(process.cwd(), "data/runs"),
    );

  const workflow = program
    .command("workflow")
    .description("validate and execute workflows");

  workflow
    .command("list")
    .description("list available workflows")
    .action(async () => {
      const runtime = createCliRuntime(program);
      printJson({ workflows: await runtime.workflowRepository.list() });
    });

  workflow
    .command("validate <workflow>")
    .description("load and validate a workflow definition")
    .action(async (workflowName: string) => {
      const runtime = createCliRuntime(program);
      const loaded = await runtime.workflowRepository.load(workflowName);
      printJson({
        workflow: loaded.definition.workflow,
        version: loaded.definition.version,
        hash: loaded.hash,
        valid: true,
      });
    });

  const runWorkflow = workflow
    .command("run <workflow>")
    .description("start a workflow run")
    .option("--input <json>", "inline JSON input")
    .option("--input-file <path>", "path to a JSON input file");

  runWorkflow.action(async (workflowName: string) => {
    const runtime = createCliRuntime(program);
    const input = await readJsonInput(runWorkflow.opts<InputOptions>());
    const loaded = await runtime.workflowRepository.load(workflowName);
    const run = await runtime.workflowRunner.start(loaded, input);
    printJson(run);
    if (run.status === "failed") {
      process.exitCode = 1;
    }
  });

  const resumeWorkflow = workflow
    .command("resume <runId>")
    .description("resume a failed or waiting workflow run")
    .option("--input <json>", "inline JSON checkpoint input")
    .option("--input-file <path>", "path to a JSON checkpoint input file");

  resumeWorkflow.action(async (runId: string) => {
    const runtime = createCliRuntime(program);
    const record = await runtime.runStore.get(runId);
    const loaded = await runtime.workflowRepository.load(record.workflow);
    const input = await readOptionalJsonInput(
      resumeWorkflow.opts<InputOptions>(),
    );
    const run = await runtime.workflowRunner.resume(runId, loaded, input);
    printJson(run);
    if (run.status === "failed") {
      process.exitCode = 1;
    }
  });

  const run = program
    .command("run")
    .description("inspect persisted workflow runs");

  run
    .command("show <runId>")
    .description("show one workflow run")
    .action(async (runId: string) => {
      const runtime = createCliRuntime(program);
      printJson(await runtime.runStore.get(runId));
    });

  run
    .command("list")
    .description("list workflow runs")
    .action(async () => {
      const runtime = createCliRuntime(program);
      const runs = await runtime.runStore.list();
      printJson({
        runs: runs.map((record) => ({
          id: record.id,
          workflow: record.workflow,
          version: record.workflowVersion,
          status: record.status,
          updatedAt: record.updatedAt,
        })),
      });
    });

  const channel = program
    .command("channel")
    .description("prepare WeChat Channels publishing tasks");

  const preparePublishJob = channel
    .command("prepare-publish-job")
    .description("write the guarded current-job.json used by the browser publisher")
    .requiredOption("--video-path <path>", "final local video path")
    .requiredOption("--short-title <title>", "WeChat Channels short title; at least 6 characters")
    .option("--description <text>", "inline publish description")
    .option("--description-file <path>", "path to a UTF-8 publish description file")
    .option("--expected-channel-name <name>", "expected 视频号 display name", "星轨潮汐.")
    .option("--job-file <path>", "job file to write", path.resolve(process.cwd(), "data/channel-publisher/current-job.json"))
    .option("--no-ai-generated", "mark the publish package as not AI-generated")
    .option("--confirm-publish", "allow the follow-up publish command to submit")
    .option("--action <action>", "prepare_job or prepare_and_publish", "prepare_job")
    .option("--recent-published-texts-file <path>", "JSON array or line-separated file of recent visible post texts for duplicate checking")
    .option("--duplicate-policy <policy>", "duplicate handling policy: warn or block", "warn");

  preparePublishJob.action(async () => {
    const options =
      preparePublishJob.opts<ChannelPreparePublishJobOptions>();
    const description = await readTextOption(
      options.description,
      options.descriptionFile,
      "description",
    );
    const agent = new WeChatChannelPublisherAgent();
    printJson(
      await agent.run({
        video_path: options.videoPath,
        short_title: options.shortTitle,
        description,
        expected_channel_name: options.expectedChannelName,
        ai_generated: options.aiGenerated,
        confirm_publish: options.confirmPublish,
        action: options.action,
        job_file_path: options.jobFile,
        recent_published_texts: await readOptionalTextList(
          options.recentPublishedTextsFile,
        ),
        duplicate_policy: options.duplicatePolicy,
      }),
    );
  });

  const history = program
    .command("history")
    .description("package historical short-video production assets");

  const scaffoldProject = history
    .command("scaffold-project")
    .description("turn a historical video blueprint JSON into a local HyperFrames project package")
    .requiredOption("--blueprint-file <path>", "validated HistoricalShortVideoAgent output JSON")
    .requiredOption("--project-slug <slug>", "folder name under videos/, lowercase letters/numbers/hyphens")
    .option("--project-root <path>", "workspace project root", process.cwd())
    .option("--overwrite-existing-scaffold", "overwrite known scaffold files if the folder already exists");

  scaffoldProject.action(async () => {
    const options = scaffoldProject.opts<HistoryScaffoldProjectOptions>();
    const agent = new HistoricalVideoProjectAgent();
    const blueprint = historicalShortVideoOutputSchema.parse(
      await readJsonFile(options.blueprintFile),
    );
    printJson(
      await agent.run({
        blueprint,
        project_slug: options.projectSlug,
        project_root: options.projectRoot,
        overwrite_existing_scaffold:
          options.overwriteExistingScaffold ?? false,
      }),
    );
  });

  const composeHyperFrames = history
    .command("compose-hyperframes")
    .description("turn a historical video blueprint and asset manifest into a renderable HyperFrames project")
    .requiredOption("--blueprint-file <path>", "validated HistoricalShortVideoAgent output JSON")
    .requiredOption("--asset-manifest-file <path>", "scene/audio asset manifest JSON")
    .requiredOption("--project-slug <slug>", "folder name under videos/, lowercase letters/numbers/hyphens")
    .option("--project-root <path>", "workspace project root", process.cwd())
    .option("--output-file-name <name>", "expected rendered file name under renders/")
    .option("--overwrite-existing-composition", "overwrite index.html and generated composition files");

  composeHyperFrames.action(async () => {
    const options =
      composeHyperFrames.opts<HistoryComposeHyperFramesOptions>();
    const blueprint = historicalShortVideoOutputSchema.parse(
      await readJsonFile(options.blueprintFile),
    );
    const manifest = historicalHyperFramesAssetManifestSchema.parse(
      await readJsonFile(options.assetManifestFile),
    );
    const agent = new HistoricalHyperFramesComposerAgent();
    printJson(
      await agent.run({
        blueprint,
        project_slug: options.projectSlug,
        project_root: options.projectRoot,
        scene_assets: manifest.scene_assets,
        voice_clips: manifest.voice_clips ?? [],
        bgm_path: manifest.bgm_path,
        sfx_clips: manifest.sfx_clips ?? [],
        output_file_name: options.outputFileName,
        overwrite_existing_composition:
          options.overwriteExistingComposition ?? false,
      }),
    );
  });

  const evaluate = program
    .command("eval")
    .description("validate datasets and score Phase 1 artifacts");

  const validateDataset = evaluate
    .command("dataset")
    .description("validate the 50-product evaluation dataset")
    .option(
      "--file <path>",
      "evaluation dataset JSON file",
      path.resolve(process.cwd(), "tests/datasets/products.json"),
    );

  validateDataset.action(async () => {
    const options = validateDataset.opts<{ file: string }>();
    const service = new DatasetService();
    const dataset = await service.load(path.resolve(options.file));
    printJson({
      valid: true,
      ...service.summarize(dataset),
    });
  });

  const scoreArtifacts = evaluate
    .command("score")
    .description("score saved Product and Content Agent outputs")
    .requiredOption(
      "--product-output-file <path>",
      "Product Agent output JSON file",
    )
    .requiredOption(
      "--content-output-file <path>",
      "Content Agent output JSON file",
    );

  scoreArtifacts.action(async () => {
    const options = scoreArtifacts.opts<{
      productOutputFile: string;
      contentOutputFile: string;
    }>();
    const [productOutput, contentOutput] = await Promise.all([
      readJsonFile(options.productOutputFile),
      readJsonFile(options.contentOutputFile),
    ]);
    printJson(evaluatePhaseOneArtifacts(productOutput, contentOutput));
  });

  evaluate
    .command("run <runId>")
    .description("score Product and Content artifacts from a workflow run")
    .action(async (runId: string) => {
      const runtime = createCliRuntime(program);
      const runRecord = await runtime.runStore.get(runId);
      printJson(
        evaluatePhaseOneArtifacts(
          runRecord.artifacts.product_analysis,
          runRecord.artifacts.content_plan,
        ),
      );
    });

  evaluate
    .command("phase2-run <runId>")
    .description("score Script and Live artifacts from a Phase 2 workflow run")
    .action(async (runId: string) => {
      const runtime = createCliRuntime(program);
      const runRecord = await runtime.runStore.get(runId);
      const liveContext = readLiveContext(runRecord.initialInput);
      printJson(
        evaluatePhaseTwoArtifacts(
          runRecord.artifacts.script_bundle,
          runRecord.artifacts.live_playbook,
          liveContext,
        ),
      );
    });

  evaluate
    .command("comment-run <runId>")
    .description("score a Comment Agent workflow run")
    .action(async (runId: string) => {
      const runtime = createCliRuntime(program);
      const runRecord = await runtime.runStore.get(runId);
      printJson(
        evaluateCommentArtifact(
          runRecord.initialInput,
          runRecord.artifacts.comment_reply,
        ),
      );
    });

  evaluate
    .command("data-run <runId>")
    .description("score a Data Analysis artifact from an optimization workflow run")
    .action(async (runId: string) => {
      const runtime = createCliRuntime(program);
      const runRecord = await runtime.runStore.get(runId);
      printJson(
        evaluateDataAnalysisArtifact(
          readPerformanceInput(runRecord.initialInput),
          runRecord.artifacts.data_analysis,
        ),
      );
    });

  return program;
}

async function readTextOption(
  inlineValue: string | undefined,
  filePath: string | undefined,
  label: string,
): Promise<string> {
  if (inlineValue !== undefined && filePath !== undefined) {
    throw new VcaError(
      "CLI_INPUT_CONFLICT",
      `Use either --${label} or --${label}-file, not both.`,
    );
  }
  if (inlineValue !== undefined) {
    return inlineValue;
  }
  if (filePath !== undefined) {
    return readFile(path.resolve(filePath), "utf8");
  }
  throw new VcaError(
    "CLI_INPUT_INVALID",
    `Provide --${label} or --${label}-file.`,
  );
}

async function readOptionalTextList(
  filePath: string | undefined,
): Promise<string[]> {
  if (filePath === undefined) {
    return [];
  }
  const raw = await readFile(path.resolve(filePath), "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.map((item) => item.trim()).filter(Boolean);
    }
  } catch {
    // Fall back to one post per line.
  }
  return raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

function createCliRuntime(program: Command) {
  const options = program.opts<GlobalOptions>();
  return createRuntime({
    workflowsDirectory: path.resolve(options.workflowsDir),
    runsDirectory: path.resolve(options.runsDir),
  });
}

async function readJsonInput(options: InputOptions): Promise<unknown> {
  return (await readOptionalJsonInput(options)) ?? {};
}

async function readOptionalJsonInput(
  options: InputOptions,
): Promise<unknown | undefined> {
  if (options.input !== undefined && options.inputFile !== undefined) {
    throw new VcaError(
      "CLI_INPUT_CONFLICT",
      "Use either --input or --input-file, not both.",
    );
  }

  if (options.input !== undefined) {
    return parseJson(options.input, "--input");
  }

  if (options.inputFile !== undefined) {
    return readJsonFile(options.inputFile);
  }

  return undefined;
}

async function readJsonFile(file: string): Promise<unknown> {
  const inputFile = path.resolve(file);
  const raw = await readFile(inputFile, "utf8");
  return parseJson(raw, inputFile);
}

function parseJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new VcaError(
      "CLI_INPUT_INVALID",
      `Input from ${source} is not valid JSON.`,
      undefined,
      { cause: error },
    );
  }
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readLiveContext(initialInput: unknown) {
  if (
    typeof initialInput !== "object" ||
    initialInput === null ||
    !("live_context" in initialInput)
  ) {
    return undefined;
  }
  const parsed = liveContextSchema.safeParse(initialInput.live_context);
  return parsed.success ? parsed.data : undefined;
}

function readPerformanceInput(initialInput: unknown): unknown {
  if (
    typeof initialInput === "object" &&
    initialInput !== null &&
    "performance" in initialInput
  ) {
    return initialInput.performance;
  }
  return initialInput;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : undefined;

if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({ error: serializeError(error) }, null, 2)}\n`,
    );
    process.exitCode = 1;
  });
}
