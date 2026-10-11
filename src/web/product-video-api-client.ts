import {
  autoCreateProductVideosRequestSchema,
  productVideoProjectSchema,
  type AutoCreateProductVideosRequest,
  type CreateProductVideoProjectRequest,
  type ProductVideoProject,
  type RenderProductVideoProjectRequest,
} from "../schemas/product-video-project.schema.js";
import {
  productVideoProductionJobSchema,
  type ProductVideoProductionJob,
} from "../schemas/product-video-production-job.schema.js";
import { ProductSelectionApiError } from "./product-selection-api-client.js";

export async function submitProductVideoProduction(
  request: CreateProductVideoProjectRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductVideoProductionJob> {
  const response = await fetchImplementation(
    "/api/product-video-projects",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parseProductionJobResponse(response);
}

export async function getProductVideoProductionJob(
  jobId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductVideoProductionJob> {
  const response = await fetchImplementation(
    `/api/product-video-production-jobs/${encodeURIComponent(jobId)}`,
    { headers: { accept: "application/json" } },
  );
  return parseProductionJobResponse(response);
}

export async function waitForProductVideoProduction(
  jobId: string,
  options: {
    fetchImplementation?: typeof fetch;
    pollIntervalMs?: number;
    timeoutMs?: number;
    onStatus?: (job: ProductVideoProductionJob) => void;
  } = {},
): Promise<ProductVideoProject> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const job = await getProductVideoProductionJob(jobId, fetchImplementation);
    options.onStatus?.(job);
    if (job.status === "completed" && job.project) {
      return job.project;
    }
    if (job.status === "failed" || job.status === "interrupted") {
      throw new ProductSelectionApiError(
        job.error?.code ?? "VIDEO_PRODUCTION_FAILED",
        job.error?.message ?? "Creative production could not be completed.",
      );
    }
    await wait(pollIntervalMs);
  }
  throw new ProductSelectionApiError(
    "VIDEO_PRODUCTION_TIMEOUT",
    "Creative production is still running. Keep the job id and poll it later.",
  );
}

export async function autoCreateProductVideos(
  batchId: string,
  request: Partial<AutoCreateProductVideosRequest> = {},
  fetchImplementation: typeof fetch = fetch,
): Promise<{
  projects: ProductVideoProject[];
  skipped: string[];
}> {
  const parsedRequest =
    autoCreateProductVideosRequestSchema.partial().parse(request);
  const response = await fetchImplementation(
    `/api/selection-batches/${encodeURIComponent(batchId)}/auto-videos`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(parsedRequest),
    },
  );
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !Array.isArray(body.projects) ||
    !Array.isArray(body.skipped)
  ) {
    throw apiError(body, response.status);
  }
  return {
    projects: body.projects.map((project) =>
      productVideoProjectSchema.parse(project),
    ),
    skipped: body.skipped.filter((item): item is string => typeof item === "string"),
  };
}

export async function renderProductVideoProject(
  projectId: string,
  request: Partial<RenderProductVideoProjectRequest> = {},
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductVideoProject> {
  const response = await fetchImplementation(
    `/api/product-video-projects/${encodeURIComponent(projectId)}/render`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parseProjectResponse(response);
}

export async function uploadRenderedProductVideo(
  projectId: string,
  video: Blob,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProductVideoProject> {
  const mediaType = video.type.split(";")[0];
  if (mediaType !== "video/webm" && mediaType !== "video/mp4") {
    throw new ProductSelectionApiError(
      "VIDEO_RENDER_TYPE_INVALID",
      "浏览器生成的成片格式不是 WebM 或 MP4。",
    );
  }
  const response = await fetchImplementation(
    `/api/product-video-projects/${encodeURIComponent(projectId)}/rendered`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": mediaType,
      },
      body: video,
    },
  );
  return parseProjectResponse(response);
}

export async function openProductVideoProjectDirectory(
  projectId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(
    `/api/product-video-projects/${encodeURIComponent(projectId)}/open`,
    {
      method: "POST",
      headers: { accept: "application/json" },
    },
  );
  const body: unknown = await response.json();
  if (!response.ok || !isObject(body) || body.ok !== true) {
    throw apiError(body, response.status);
  }
}

export function productVideoAssetUrl(
  projectId: string,
  kind: "image" | "narration",
): string {
  return `/api/product-video-projects/${encodeURIComponent(projectId)}/assets/${kind}`;
}

export function productVideoRenderedUrl(projectId: string): string {
  return `/api/product-video-projects/${encodeURIComponent(projectId)}/rendered`;
}

async function parseProjectResponse(
  response: Response,
): Promise<ProductVideoProject> {
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !("project" in body)
  ) {
    throw apiError(body, response.status);
  }
  return productVideoProjectSchema.parse(body.project);
}

async function parseProductionJobResponse(
  response: Response,
): Promise<ProductVideoProductionJob> {
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !("job" in body)
  ) {
    throw apiError(body, response.status);
  }
  return productVideoProductionJobSchema.parse(body.job);
}

function apiError(
  body: unknown,
  status: number,
): ProductSelectionApiError {
  const envelope = isObject(body) ? body : {};
  const error = isObject(envelope.error) ? envelope.error : {};
  return new ProductSelectionApiError(
    typeof error.code === "string"
      ? error.code
      : "VIDEO_PROJECT_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : `自动成片请求失败（HTTP ${status}）。`,
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
