import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  RunNotFoundError,
  serializeError,
  VcaError,
} from "../src/errors.js";
import { ProductSelectionAgent } from "../src/agents/product-selection/product-selection-agent.js";
import { CreativeDirectorAgent } from "../src/agents/creative-director/creative-director-agent.js";
import { CodexJobQueue } from "../src/services/jobs/codex-job-queue.js";
import { FileCodexJobStore } from "../src/services/jobs/file-codex-job-store.js";
import { CodexSdkProvider } from "../src/services/llm/codex-sdk-provider.js";
import { SerialLlmProvider } from "../src/services/llm/serial-llm-provider.js";
import { PromptLoader } from "../src/services/prompts/prompt-loader.js";
import { ChannelPublishPackageStore } from "../src/services/publishing/channel-publish-package-store.js";
import { FileSelectionBatchStore } from "../src/services/selection/file-selection-batch-store.js";
import { ProductSelectionQueue } from "../src/services/selection/product-selection-queue.js";
import { MemoryRunStore } from "../src/services/storage/memory-run-store.js";
import { ObservableRunStore } from "../src/services/storage/observable-run-store.js";
import { ProductVideoProjectStore } from "../src/services/video/product-video-project-store.js";
import {
  assertCreativeProductionRenderReady,
  isCreativeProductionRenderReady,
} from "../src/services/video/creative-production-readiness.js";
import { FileProductVideoProductionJobStore } from "../src/services/video/file-product-video-production-job-store.js";
import { ProductVideoProductionQueue } from "../src/services/video/product-video-production-queue.js";
import { selectAutoVideoRecommendations } from "../src/services/video/auto-video-planner.js";
import {
  hyperFramesEnvironment,
  npxCommand,
  renderStableHyperFrames,
} from "../src/services/video/stable-hyperframes-renderer.js";
import { WindowsSpeechSynthesizer } from "../src/services/video/windows-speech-synthesizer.js";
import { createChannelPublishPackageRequestSchema } from "../src/schemas/channel-publish.schema.js";
import {
  autoCreateProductVideosRequestSchema,
  createProductVideoProjectRequestSchema,
  renderProductVideoProjectRequestSchema,
  type AutoCreateProductVideosRequest,
  type CreateProductVideoProjectRequest,
  type ProductVideoProject,
} from "../src/schemas/product-video-project.schema.js";
import {
  captureSelectionCandidateGalleryRequestSchema,
  importSelectionCandidatesRequestSchema,
  selectionAnalysisProfileSchema,
} from "../src/schemas/product-selection.schema.js";
import type { WorkflowRun } from "../src/schemas/workflow-run.schema.js";
import {
  workflowApiRequestSchema,
  type ProviderStatus,
} from "../src/web/workflow-api.schema.js";
import { accountIncubationApiRequestSchema } from "../src/web/account-incubation-api.schema.js";
import {
  isAccountIncubationRequest,
  type CodexWorkflowRequest,
} from "../src/web/codex-workflow-request.schema.js";
import {
  createAccountIncubationRuntime,
  getAccountIncubationWorkflow,
} from "../src/workflows/account-incubation-runtime.js";
import {
  createVideoSalesRuntime,
  getVideoSalesWorkflow,
} from "../src/workflows/video-sales-runtime.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const staticRoot = path.join(projectRoot, "out");
const jobDirectory = path.join(projectRoot, "data", "codex-jobs");
const publishPackageDirectory = path.join(
  projectRoot,
  "data",
  "publish-packages",
);
const selectionBatchDirectory = path.join(
  projectRoot,
  "data",
  "selection-batches",
);
const videoProjectDirectory = path.join(
  projectRoot,
  "data",
  "video-projects",
);
const videoProductionJobDirectory = path.join(
  projectRoot,
  "data",
  "video-production-jobs",
);
const selectionBridgeDirectory = path.join(
  projectRoot,
  "browser-extension",
  "wechat-store-bridge",
);
const port = parsePort(process.env.VCA_LOCAL_PORT);
const provider = new SerialLlmProvider(
  new CodexSdkProvider({
    workingDirectory: projectRoot,
    ...(process.env.VCA_CODEX_MODEL
      ? { model: process.env.VCA_CODEX_MODEL }
      : {}),
  }),
);
const promptSource = new PromptLoader();
const jobStore = new FileCodexJobStore(jobDirectory);
const jobQueue = new CodexJobQueue(jobStore, executeWorkflowJob);
const publishPackageStore = new ChannelPublishPackageStore(
  publishPackageDirectory,
);
const selectionBatchStore = new FileSelectionBatchStore(
  selectionBatchDirectory,
);
const productSelectionAgent = new ProductSelectionAgent(
  provider,
  promptSource,
);
const creativeDirectorAgent = new CreativeDirectorAgent(provider, promptSource);
const productSelectionQueue = new ProductSelectionQueue(
  selectionBatchStore,
  (input) => productSelectionAgent.run(input),
);
const productVideoProjectStore = new ProductVideoProjectStore({
  directory: videoProjectDirectory,
  speechSynthesizer: new WindowsSpeechSynthesizer(
    path.join(projectRoot, "scripts", "synthesize-speech.ps1"),
  ),
});
const productVideoProductionJobStore = new FileProductVideoProductionJobStore(
  videoProductionJobDirectory,
);
const productVideoProductionQueue = new ProductVideoProductionQueue(
  productVideoProductionJobStore,
  executeProductVideoProductionJob,
);
const [interruptedJobCount, interruptedSelectionCount] =
  await Promise.all([
    jobQueue.initialize(),
    productSelectionQueue.initialize(),
    productVideoProductionQueue.initialize(),
  ]);

const server = createServer(async (request, response) => {
  try {
    if (!isLoopbackHost(request.headers.host)) {
      sendJson(response, 403, {
        ok: false,
        error: {
          code: "HOST_NOT_ALLOWED",
          message: "Local server only accepts loopback requests.",
        },
      });
      return;
    }

    applyLocalCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(
        204,
        securityHeaders({
          "cache-control": "no-store",
        }),
      );
      response.end();
      return;
    }

    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `127.0.0.1:${port}`}`,
    );
    if (url.pathname === "/api/health" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        service: "video-commerce-ai",
        mode: "local",
        bridge: "wechat-store",
      });
      return;
    }

    if (url.pathname === "/api/provider" && request.method === "GET") {
      const status: ProviderStatus = {
        configured: true,
        provider: "codex_local",
        model: process.env.VCA_CODEX_MODEL ?? "Codex 当前配置",
        persistence: "local_file",
      };
      sendJson(response, 200, status);
      return;
    }

    if (url.pathname === "/api/jobs" && request.method === "GET") {
      sendJson(response, 200, {
        ok: true,
        jobs: await jobQueue.list(),
      });
      return;
    }

    if (
      url.pathname === "/api/product-video-production-jobs" &&
      request.method === "GET"
    ) {
      sendJson(response, 200, {
        ok: true,
        jobs: await productVideoProductionQueue.list(),
      });
      return;
    }

    const productVideoProductionJobMatch =
      /^\/api\/product-video-production-jobs\/([0-9a-f-]+)$/i.exec(
        url.pathname,
      );
    if (productVideoProductionJobMatch && request.method === "GET") {
      const jobId = productVideoProductionJobMatch[1];
      if (jobId) {
        try {
          sendJson(response, 200, {
            ok: true,
            job: await productVideoProductionQueue.get(jobId),
          });
        } catch (error) {
          sendVideoProjectError(response, error);
        }
        return;
      }
    }

    const jobMatch = /^\/api\/jobs\/([0-9a-f-]+)$/i.exec(url.pathname);
    if (jobMatch && request.method === "GET") {
      const jobId = jobMatch[1];
      if (!jobId) {
        sendJson(response, 404, {
          ok: false,
          error: {
            code: "CODEX_JOB_NOT_FOUND",
            message: "Codex job was not found.",
          },
        });
        return;
      }
      try {
        sendJson(response, 200, {
          ok: true,
          job: await jobQueue.get(jobId),
        });
      } catch (error) {
        if (error instanceof RunNotFoundError) {
          sendJson(response, 404, {
            ok: false,
            error: serializeError(error),
          });
          return;
        }
        throw error;
      }
      return;
    }

    if (
      url.pathname === "/api/workflows/video-sales" &&
      request.method === "POST"
    ) {
      await handleWorkflow(request, response, workflowApiRequestSchema);
      return;
    }

    if (
      url.pathname === "/api/workflows/account-incubation" &&
      request.method === "POST"
    ) {
      await handleWorkflow(request, response, accountIncubationApiRequestSchema);
      return;
    }

    if (
      url.pathname === "/api/channel-publish-packages" &&
      request.method === "GET"
    ) {
      sendJson(response, 200, {
        ok: true,
        packages: await publishPackageStore.list(),
      });
      return;
    }

    if (
      url.pathname === "/api/channel-publish-packages" &&
      request.method === "POST"
    ) {
      await handleCreatePublishPackage(request, response);
      return;
    }

    const publishVideoMatch =
      /^\/api\/channel-publish-packages\/([0-9a-f-]+)\/video$/i.exec(
        url.pathname,
      );
    if (publishVideoMatch && request.method === "PUT") {
      const packageId = publishVideoMatch[1];
      if (packageId) {
        await handlePublishVideoUpload(
          packageId,
          url,
          request,
          response,
        );
        return;
      }
    }

    const publishOpenMatch =
      /^\/api\/channel-publish-packages\/([0-9a-f-]+)\/open$/i.exec(
        url.pathname,
      );
    if (publishOpenMatch && request.method === "POST") {
      const packageId = publishOpenMatch[1];
      if (packageId) {
        await handleOpenPublishPackage(packageId, response);
        return;
      }
    }

    const publishPackageMatch =
      /^\/api\/channel-publish-packages\/([0-9a-f-]+)$/i.exec(
        url.pathname,
      );
    if (publishPackageMatch && request.method === "GET") {
      const packageId = publishPackageMatch[1];
      if (packageId) {
        try {
          sendJson(response, 200, {
            ok: true,
            package: await publishPackageStore.get(packageId),
          });
        } catch (error) {
          sendPublishError(response, error);
        }
        return;
      }
    }

    if (
      url.pathname === "/api/selection-batches" &&
      request.method === "GET"
    ) {
      sendJson(response, 200, {
        ok: true,
        batches: await productSelectionQueue.list(),
      });
      return;
    }

    if (
      url.pathname === "/api/selection-batches" &&
      request.method === "POST"
    ) {
      await handleImportSelectionCandidates(request, response);
      return;
    }

    const selectionAnalyzeMatch =
      /^\/api\/selection-batches\/([0-9a-f-]+)\/analyze$/i.exec(
        url.pathname,
      );
    if (selectionAnalyzeMatch && request.method === "POST") {
      const batchId = selectionAnalyzeMatch[1];
      if (batchId) {
        await handleAnalyzeSelectionBatch(
          batchId,
          request,
          response,
        );
        return;
      }
    }

    const selectionAutoVideosMatch =
      /^\/api\/selection-batches\/([0-9a-f-]+)\/auto-videos$/i.exec(
        url.pathname,
      );
    if (selectionAutoVideosMatch && request.method === "POST") {
      const batchId = selectionAutoVideosMatch[1];
      if (batchId) {
        await handleAutoCreateProductVideos(
          batchId,
          request,
          response,
        );
        return;
      }
    }

    const selectionGalleryMatch =
      /^\/api\/selection-batches\/([0-9a-f-]+)\/candidates\/([0-9a-f-]+)\/gallery$/i.exec(
        url.pathname,
      );
    if (selectionGalleryMatch && request.method === "POST") {
      const batchId = selectionGalleryMatch[1];
      const candidateId = selectionGalleryMatch[2];
      if (batchId && candidateId) {
        await handleCaptureSelectionCandidateGallery(
          batchId,
          candidateId,
          request,
          response,
        );
        return;
      }
    }

    const selectionBatchMatch =
      /^\/api\/selection-batches\/([0-9a-f-]+)$/i.exec(
        url.pathname,
      );
    if (selectionBatchMatch && request.method === "GET") {
      const batchId = selectionBatchMatch[1];
      if (batchId) {
        try {
          sendJson(response, 200, {
            ok: true,
            batch: await productSelectionQueue.get(batchId),
          });
        } catch (error) {
          sendSelectionError(response, error);
        }
        return;
      }
    }

    if (
      url.pathname === "/api/selection-bridge/open-extension-directory" &&
      request.method === "POST"
    ) {
      await handleOpenDirectory(selectionBridgeDirectory, response);
      return;
    }

    if (
      url.pathname === "/api/product-video-projects" &&
      request.method === "GET"
    ) {
      sendJson(response, 200, {
        ok: true,
        projects: await productVideoProjectStore.list(),
      });
      return;
    }

    if (
      url.pathname === "/api/product-video-projects" &&
      request.method === "POST"
    ) {
      await handleCreateProductVideoProject(request, response);
      return;
    }

    const videoAssetMatch =
      /^\/api\/product-video-projects\/([0-9a-f-]+)\/assets\/(image|narration)$/i.exec(
        url.pathname,
      );
    if (videoAssetMatch && request.method === "GET") {
      const projectId = videoAssetMatch[1];
      const kind = videoAssetMatch[2];
      if (
        projectId &&
        (kind === "image" || kind === "narration")
      ) {
        await handleProductVideoAsset(
          projectId,
          kind,
          response,
        );
        return;
      }
    }

    const renderedVideoMatch =
      /^\/api\/product-video-projects\/([0-9a-f-]+)\/rendered$/i.exec(
        url.pathname,
      );

    const videoRenderMatch =
      /^\/api\/product-video-projects\/([0-9a-f-]+)\/render$/i.exec(
        url.pathname,
      );
    if (videoRenderMatch && request.method === "POST") {
      const projectId = videoRenderMatch[1];
      if (projectId) {
        await handleRenderProductVideoProject(projectId, request, response);
        return;
      }
    }
    if (renderedVideoMatch && request.method === "PUT") {
      const projectId = renderedVideoMatch[1];
      if (projectId) {
        await handleRenderedVideoUpload(
          projectId,
          request,
          response,
        );
        return;
      }
    }

    if (renderedVideoMatch && request.method === "GET") {
      const projectId = renderedVideoMatch[1];
      if (projectId) {
        await handleRenderedProductVideo(projectId, response);
        return;
      }
    }

    const videoProjectOpenMatch =
      /^\/api\/product-video-projects\/([0-9a-f-]+)\/open$/i.exec(
        url.pathname,
      );
    if (videoProjectOpenMatch && request.method === "POST") {
      const projectId = videoProjectOpenMatch[1];
      if (projectId) {
        try {
          await handleOpenDirectory(
            await productVideoProjectStore.directoryPath(projectId),
            response,
          );
        } catch (error) {
          sendVideoProjectError(response, error);
        }
        return;
      }
    }

    const videoProjectMatch =
      /^\/api\/product-video-projects\/([0-9a-f-]+)$/i.exec(
        url.pathname,
      );
    if (videoProjectMatch && request.method === "GET") {
      const projectId = videoProjectMatch[1];
      if (projectId) {
        try {
          sendJson(response, 200, {
            ok: true,
            project: await productVideoProjectStore.get(projectId),
          });
        } catch (error) {
          sendVideoProjectError(response, error);
        }
        return;
      }
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, {
        ok: false,
        error: {
          code: "API_ROUTE_NOT_FOUND",
          message: "API route not found.",
        },
      });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    const serialized = serializeError(error);
    sendJson(response, 500, {
      ok: false,
      error: serialized,
    });
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    [
      "",
      "Video Commerce AI 本机模式已启动",
      `工作流中心：http://127.0.0.1:${port}/workflow`,
      `数据复盘：http://127.0.0.1:${port}/`,
      "AI Provider：本机 Codex 登录（只读沙箱）",
      `持久化队列：data/codex-jobs（中断恢复 ${interruptedJobCount} 项）`,
      `选品队列：data/selection-batches（中断恢复 ${interruptedSelectionCount} 项）`,
      "自动成片：本机中文语音 + 浏览器 9:16 渲染",
      "发布包目录：data/publish-packages（人工最终发布）",
      "按 Ctrl+C 停止服务。",
      "",
    ].join("\n"),
  );
});

async function handleCreatePublishPackage(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!request.headers["content-type"]?.includes("application/json")) {
    sendJson(response, 415, {
      ok: false,
      error: {
        code: "CONTENT_TYPE_INVALID",
        message: "Publish package requests must use application/json.",
      },
    });
    return;
  }
  try {
    const raw = await readBody(request, 8_000_000);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "JSON_INVALID",
          message: "Request body is not valid JSON.",
        },
      });
      return;
    }
    const parsed = createChannelPublishPackageRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "PUBLISH_PACKAGE_INPUT_INVALID",
          message: "Publish package input failed schema validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    sendJson(response, 201, {
      ok: true,
      package: await publishPackageStore.create(parsed.data),
    });
  } catch (error) {
    sendPublishError(response, error);
  }
}

async function handlePublishVideoUpload(
  packageId: string,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const filename = url.searchParams.get("filename")?.trim();
  const mediaType = request.headers["content-type"]?.split(";")[0]?.trim();
  const rawLength = request.headers["content-length"];
  const declaredBytes =
    typeof rawLength === "string" ? Number(rawLength) : undefined;
  if (!filename || !mediaType) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "PUBLISH_VIDEO_METADATA_MISSING",
        message: "Video filename and Content-Type are required.",
      },
    });
    return;
  }
  try {
    sendJson(response, 200, {
      ok: true,
      package: await publishPackageStore.attachVideo(packageId, {
        filename,
        mediaType,
        source: request,
        ...(declaredBytes !== undefined ? { declaredBytes } : {}),
      }),
    });
  } catch (error) {
    request.resume();
    sendPublishError(response, error);
  }
}

async function handleOpenPublishPackage(
  packageId: string,
  response: ServerResponse,
): Promise<void> {
  try {
    const directory = await publishPackageStore.directoryPath(packageId);
    const explorer = spawn("explorer.exe", [directory], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    explorer.unref();
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendPublishError(response, error);
  }
}

async function handleImportSelectionCandidates(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 1_500_000);
    const parsed =
      importSelectionCandidatesRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "SELECTION_IMPORT_INVALID",
          message: "Selection candidates failed schema validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    sendJson(response, 201, {
      ok: true,
      batch: await selectionBatchStore.importCandidates(parsed.data),
    });
  } catch (error) {
    sendSelectionError(response, error);
  }
}

async function handleAnalyzeSelectionBatch(
  batchId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 120_000);
    const parsed = selectionAnalysisProfileSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "SELECTION_PROFILE_INVALID",
          message: "Selection analysis profile failed validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    sendJson(response, 202, {
      ok: true,
      batch: await productSelectionQueue.submit(batchId, parsed.data),
    });
  } catch (error) {
    sendSelectionError(response, error);
  }
}

async function handleCaptureSelectionCandidateGallery(
  batchId: string,
  candidateId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 120_000);
    const parsed = captureSelectionCandidateGalleryRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "SELECTION_GALLERY_CAPTURE_INVALID",
          message: "Visible detail-page images failed schema validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    sendJson(response, 200, {
      ok: true,
      batch: await selectionBatchStore.attachCandidateGallery(
        batchId,
        candidateId,
        parsed.data,
      ),
    });
  } catch (error) {
    sendSelectionError(response, error);
  }
}

async function handleCreateProductVideoProject(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 120_000);
    const parsed =
      createProductVideoProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "VIDEO_PROJECT_INPUT_INVALID",
          message: "Product video project input failed validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    const job = await productVideoProductionQueue.submit(parsed.data);
    sendJson(response, 202, { ok: true, job });
  } catch (error) {
    sendVideoProjectError(response, error);
  }
}

async function executeProductVideoProductionJob(
  request: Pick<
    CreateProductVideoProjectRequest,
    "batch_id" | "candidate_id" | "creative_route"
  >,
): Promise<ProductVideoProject> {
  const batch = await productSelectionQueue.get(request.batch_id);
  const creativeProduction = await createCreativeProduction(
    batch,
    request.candidate_id,
    request.creative_route,
  );
  return productVideoProjectStore.create(
    batch,
    request.candidate_id,
    creativeProduction,
  );
}

async function handleAutoCreateProductVideos(
  batchId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 20_000);
    const parsed = autoCreateProductVideosRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "VIDEO_AUTO_INPUT_INVALID",
          message: "Automatic video input failed validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    const batch = await productSelectionQueue.get(batchId);
    const recommendations = selectAutoVideoRecommendations(batch, {
      maximumProjects: parsed.data.maximum_projects,
      minimumScore: parsed.data.minimum_score,
      recommendationLevels: parsed.data.recommendation_levels,
    });
    if (recommendations.length === 0) {
      throw new VcaError(
        "VIDEO_AUTO_NO_ELIGIBLE_PRODUCTS",
        "No products met the automatic video threshold.",
      );
    }

    const projects: ProductVideoProject[] = [];
    const skipped: string[] = [];
    for (const recommendation of recommendations) {
      for (const creativeRoute of parsed.data.creative_routes) {
        try {
          const prepared = await productVideoProjectStore.create(
            batch,
            recommendation.candidate_id,
            await createCreativeProduction(
              batch,
              recommendation.candidate_id,
              creativeRoute,
            ),
          );
          const project =
            parsed.data.render && isCreativeProductionRenderReady(prepared)
              ? await renderProductVideoProject(prepared, parsed.data)
              : prepared;
          projects.push(project);
        } catch (error) {
          skipped.push(
            `${recommendation.product_name} (${creativeRoute}): ${serializeError(error).message}`,
          );
        }
      }
    }

    if (projects.length === 0) {
      throw new VcaError(
        "VIDEO_AUTO_ALL_PROJECTS_FAILED",
        "Automatic video creation failed for every selected product.",
        { skipped },
      );
    }

    sendJson(response, 201, {
      ok: true,
      projects,
      skipped,
    });
  } catch (error) {
    sendVideoProjectError(response, error);
  }
}

async function createCreativeProduction(
  batch: Awaited<ReturnType<ProductSelectionQueue["get"]>>,
  candidateId: string,
  routeHint?: CreateProductVideoProjectRequest["creative_route"],
) {
  if (!batch.analysis || !batch.analysis_profile) {
    throw new VcaError(
      "VIDEO_CREATIVE_INPUT_MISSING",
      "A completed selection analysis is required before creative production.",
    );
  }
  const candidate = batch.candidates.find((item) => item.candidate_id === candidateId);
  const recommendation = batch.analysis.ranking.find(
    (item) => item.candidate_id === candidateId,
  );
  if (!candidate || !recommendation) {
    throw new VcaError(
      "VIDEO_CREATIVE_CANDIDATE_MISSING",
      "The selected candidate is not available for creative production.",
    );
  }
  return creativeDirectorAgent.run({
    profile: batch.analysis_profile,
    candidate,
    recommendation,
    ...(routeHint ? { route_hint: routeHint } : {}),
  });
}

async function handleRenderProductVideoProject(
  projectId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody(request, 20_000);
    const parsed = renderProductVideoProjectRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(response, 400, {
        ok: false,
        error: {
          code: "VIDEO_RENDER_INPUT_INVALID",
          message: "Video render input failed validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }
    const project = await productVideoProjectStore.get(projectId);
    assertCreativeProductionRenderReady(project);
    if (project.rendered_video) {
      sendJson(response, 200, { ok: true, project });
      return;
    }
    sendJson(response, 200, {
      ok: true,
      project: await renderProductVideoProject(project, parsed.data),
    });
  } catch (error) {
    sendVideoProjectError(response, error);
  }
}

async function handleProductVideoAsset(
  projectId: string,
  kind: "image" | "narration",
  response: ServerResponse,
): Promise<void> {
  try {
    const asset = await productVideoProjectStore.asset(projectId, kind);
    sendBinary(response, 200, await readFile(asset.file), asset.mediaType);
  } catch (error) {
    sendVideoProjectError(response, error);
  }
}

async function handleRenderedVideoUpload(
  projectId: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const mediaType = request.headers["content-type"]?.split(";")[0]?.trim();
  const rawLength = request.headers["content-length"];
  const declaredBytes =
    typeof rawLength === "string" ? Number(rawLength) : undefined;
  if (!mediaType) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "VIDEO_RENDER_TYPE_MISSING",
        message: "Rendered video Content-Type is required.",
      },
    });
    return;
  }
  try {
    sendJson(response, 200, {
      ok: true,
      project: await productVideoProjectStore.attachRenderedVideo(
        projectId,
        {
          mediaType,
          source: request,
          ...(declaredBytes !== undefined ? { declaredBytes } : {}),
        },
      ),
    });
  } catch (error) {
    request.resume();
    sendVideoProjectError(response, error);
  }
}

async function handleRenderedProductVideo(
  projectId: string,
  response: ServerResponse,
): Promise<void> {
  try {
    const project = await productVideoProjectStore.get(projectId);
    const rendered = project.rendered_video;
    if (!rendered) {
      throw new VcaError(
        "VIDEO_RENDER_NOT_READY",
        "Rendered video is not ready.",
      );
    }
    const file = path.join(project.directory_path, rendered.relative_path);
    sendBinary(
      response,
      200,
      await readFile(file),
      rendered.media_type,
    );
  } catch (error) {
    sendVideoProjectError(response, error);
  }
}

async function renderProductVideoProject(
  project: ProductVideoProject,
  options: Pick<AutoCreateProductVideosRequest, "render_quality">,
): Promise<ProductVideoProject> {
  const hyperframesDirectory = path.join(project.directory_path, "hyperframes");
  const renderDirectory = path.join(project.directory_path, "renders");
  const output = path.join(renderDirectory, "auto-render.mp4");
  await mkdir(renderDirectory, { recursive: true });
  await unlinkIfExists(output);
  await renderStableHyperFrames({
    projectDirectory: hyperframesDirectory,
    outputPath: output,
    requestedQuality: options.render_quality,
    cwd: projectRoot,
    env: hyperFramesEnvironment(),
    command: npxCommand(),
    checkTimeoutMs: 5 * 60_000,
    renderTimeoutMs: 20 * 60_000,
  });
  const outputStat = await stat(output);
  try {
    return await productVideoProjectStore.attachRenderedVideo(project.id, {
      mediaType: "video/mp4",
      source: createReadStream(output),
      declaredBytes: outputStat.size,
    });
  } finally {
    await unlinkIfExists(output);
  }
}

async function handleOpenDirectory(
  directory: string,
  response: ServerResponse,
): Promise<void> {
  if (!(await stat(directory)).isDirectory()) {
    throw new VcaError(
      "LOCAL_DIRECTORY_NOT_FOUND",
      "Local directory was not found.",
    );
  }
  const explorer = spawn("explorer.exe", [directory], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  explorer.unref();
  sendJson(response, 200, { ok: true });
}

async function handleWorkflow(
  request: IncomingMessage,
  response: ServerResponse,
  requestSchema: typeof workflowApiRequestSchema | typeof accountIncubationApiRequestSchema,
): Promise<void> {
  if (!request.headers["content-type"]?.includes("application/json")) {
    sendJson(response, 415, {
      ok: false,
      error: {
        code: "CONTENT_TYPE_INVALID",
        message: "Workflow requests must use application/json.",
      },
    });
    return;
  }
  const raw = await readBody(request, 120_000);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "JSON_INVALID",
        message: "Request body is not valid JSON.",
      },
    });
    return;
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(response, 400, {
      ok: false,
      error: {
        code: "WORKFLOW_INPUT_INVALID",
        message: "Workflow input failed schema validation.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  const job = await jobQueue.submit(parsed.data);
  sendJson(response, 202, { ok: true, job });
}

function sendPublishError(
  response: ServerResponse,
  error: unknown,
): void {
  const serialized = serializeError(error);
  const badRequestCodes = new Set([
    "PUBLISH_DIRECTION_NOT_FOUND",
    "PUBLISH_PACKAGE_ID_INVALID",
    "PUBLISH_RUN_INPUT_INVALID",
    "PUBLISH_VIDEO_EMPTY",
    "PUBLISH_VIDEO_METADATA_MISSING",
    "PUBLISH_VIDEO_SIGNATURE_INVALID",
    "PUBLISH_VIDEO_SIZE_INVALID",
    "PUBLISH_VIDEO_SIZE_MISMATCH",
    "PUBLISH_VIDEO_TOO_LARGE",
    "PUBLISH_VIDEO_TYPE_INVALID",
  ]);
  const conflictCodes = new Set(["PUBLISH_VIDEO_ALREADY_ATTACHED"]);
  const status =
    serialized.code === "PUBLISH_PACKAGE_NOT_FOUND"
      ? 404
      : conflictCodes.has(serialized.code)
        ? 409
        : badRequestCodes.has(serialized.code)
          ? 400
          : 500;
  sendJson(response, status, {
    ok: false,
    error: serialized,
  });
}

function sendSelectionError(
  response: ServerResponse,
  error: unknown,
): void {
  const serialized = serializeError(error);
  const status =
    serialized.code === "SELECTION_BATCH_NOT_FOUND"
      ? 404
      : serialized.code === "SELECTION_ANALYSIS_ALREADY_RUNNING"
        ? 409
        : serialized.code.startsWith("SELECTION_") ||
            serialized.code === "REQUEST_TOO_LARGE"
          ? 400
          : 500;
  sendJson(response, status, { ok: false, error: serialized });
}

function sendVideoProjectError(
  response: ServerResponse,
  error: unknown,
): void {
  const serialized = serializeError(error);
  const notFoundCodes = new Set([
    "SELECTION_BATCH_NOT_FOUND",
    "VIDEO_PROJECT_ASSET_NOT_FOUND",
    "VIDEO_PROJECT_NOT_FOUND",
  ]);
  const conflictCodes = new Set([
    "VIDEO_PROJECT_ALREADY_RENDERED",
  ]);
  const status = notFoundCodes.has(serialized.code)
    ? 404
    : conflictCodes.has(serialized.code)
      ? 409
      : serialized.code.startsWith("VIDEO_") ||
          serialized.code === "REQUEST_TOO_LARGE"
        ? 400
        : 500;
  sendJson(response, status, { ok: false, error: serialized });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
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

async function executeWorkflowJob(
  request: CodexWorkflowRequest,
  onRun: (run: WorkflowRun) => Promise<void>,
) {
  if (isAccountIncubationRequest(request)) {
    const observedStore = new ObservableRunStore(new MemoryRunStore(), onRun);
    const runtime = createAccountIncubationRuntime({
      provider,
      promptSource,
      runStore: observedStore,
    });
    const workflow = await getAccountIncubationWorkflow();
    return runtime.workflowRunner.start(workflow, request.input);
  }

  const memoryStore = new MemoryRunStore(
    request.action === "resume" ? [request.run] : [],
  );
  const observedStore = new ObservableRunStore(memoryStore, onRun);
  const runtime = createVideoSalesRuntime({
    provider,
    promptSource,
    runStore: observedStore,
  });
  const loadedWorkflow = await getVideoSalesWorkflow();
  return request.action === "start"
    ? runtime.workflowRunner.start(loadedWorkflow, request.input)
    : runtime.workflowRunner.resume(
        request.run.id,
        loadedWorkflow,
        request.checkpoint,
      );
}

async function serveStatic(
  pathname: string,
  response: ServerResponse,
): Promise<void> {
  const decoded = decodeURIComponent(pathname);
  const candidates =
    decoded === "/"
      ? ["index.html"]
      : decoded.endsWith("/")
        ? [
            `${decoded.slice(1, -1)}.html`,
            `${decoded.slice(1)}index.html`,
          ]
        : path.extname(decoded)
          ? [decoded.slice(1)]
          : [`${decoded.slice(1)}.html`, `${decoded.slice(1)}/index.html`];

  for (const candidate of candidates) {
    const file = path.resolve(staticRoot, candidate);
    if (!isInsideStaticRoot(file)) {
      continue;
    }
    try {
      if (!(await stat(file)).isFile()) {
        continue;
      }
      const body = await readFile(file);
      response.writeHead(200, securityHeaders({
        "content-type": contentType(file),
        "cache-control": file.includes(`${path.sep}_next${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      }));
      response.end(body);
      return;
    } catch {
      // Try the next safe static candidate.
    }
  }

  const fallback = path.join(staticRoot, "404.html");
  response.writeHead(404, securityHeaders({
    "content-type": "text/html; charset=utf-8",
  }));
  response.end(await readFile(fallback));
}

async function readBody(
  request: IncomingMessage,
  maximumBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maximumBytes) {
      throw new VcaError(
        "REQUEST_TOO_LARGE",
        `Request exceeds the ${maximumBytes} byte limit.`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number,
): Promise<unknown> {
  if (!request.headers["content-type"]?.includes("application/json")) {
    throw new VcaError(
      "CONTENT_TYPE_INVALID",
      "Request must use application/json.",
    );
  }
  const raw = await readBody(request, maximumBytes);
  try {
    return JSON.parse(raw);
  } catch {
    throw new VcaError(
      "JSON_INVALID",
      "Request body is not valid JSON.",
    );
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(
    status,
    securityHeaders({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }),
  );
  response.end(JSON.stringify(value));
}

function sendBinary(
  response: ServerResponse,
  status: number,
  value: Buffer,
  mediaType: string,
): void {
  response.writeHead(
    status,
    securityHeaders({
      "content-type": mediaType,
      "content-length": String(value.length),
      "cache-control": "private, no-store",
    }),
  );
  response.end(value);
}

function securityHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return {
    ...headers,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
  };
}

function applyLocalCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const origin = request.headers.origin;
  if (!origin || !isAllowedLocalCorsOrigin(origin)) {
    return;
  }
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  response.setHeader("access-control-allow-headers", "accept, content-type");
  response.setHeader("access-control-max-age", "600");
  response.setHeader("vary", "Origin");
}

function isAllowedLocalCorsOrigin(origin: string): boolean {
  return (
    origin === `http://127.0.0.1:${port}` ||
    origin === `http://localhost:${port}` ||
    /^chrome-extension:\/\/[a-p]{32}$/u.test(origin)
  );
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) {
    return false;
  }
  const name = host.split(":")[0]?.toLowerCase();
  return name === "127.0.0.1" || name === "localhost" || name === "[::1]";
}

function isInsideStaticRoot(file: string): boolean {
  const relative = path.relative(staticRoot, file);
  return (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function contentType(file: string): string {
  const types: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
  };
  return types[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? 3000);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    throw new Error("VCA_LOCAL_PORT must be an integer from 1024 to 65535.");
  }
  return parsed;
}
