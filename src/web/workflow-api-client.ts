import {
  workflowRunSchema,
  type WorkflowRun,
} from "../schemas/workflow-run.schema.js";
import {
  codexJobSchema,
  type CodexJob,
} from "./codex-job.schema.js";
import {
  providerStatusSchema,
  type ProviderStatus,
  type WorkflowApiRequest,
} from "./workflow-api.schema.js";
import type { AccountIncubationApiRequest } from "./account-incubation-api.schema.js";

export class WorkflowApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "WorkflowApiError";
  }
}

export interface WorkflowExecutionOptions {
  fetchImplementation?: typeof fetch;
  onProgress?: (job: CodexJob) => void;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export async function getProviderStatus(
  fetchImplementation: typeof fetch = fetch,
): Promise<ProviderStatus> {
  const response = await fetchImplementation("/api/provider", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new WorkflowApiError(
      "PROVIDER_STATUS_UNAVAILABLE",
      "无法读取服务端 Provider 状态。",
    );
  }
  return providerStatusSchema.parse(await response.json());
}

export async function executeVideoSalesWorkflow(
  request: WorkflowApiRequest,
  options: WorkflowExecutionOptions = {},
): Promise<WorkflowRun> {
  return executeWorkflowRequest("/api/workflows/video-sales", request, options);
}

export async function executeAccountIncubationWorkflow(
  request: AccountIncubationApiRequest,
  options: WorkflowExecutionOptions = {},
): Promise<WorkflowRun> {
  return executeWorkflowRequest(
    "/api/workflows/account-incubation",
    request,
    options,
  );
}

async function executeWorkflowRequest(
  endpoint: string,
  request: WorkflowApiRequest | AccountIncubationApiRequest,
  options: WorkflowExecutionOptions,
): Promise<WorkflowRun> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const response = await fetchImplementation(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
  });
  const body: unknown = await response.json();
  if (!isObject(body)) {
    throw new WorkflowApiError(
      "WORKFLOW_RESPONSE_INVALID",
      "工作流服务返回了无法识别的响应。",
    );
  }

  if (body.ok === true && "run" in body) {
    return workflowRunSchema.parse(body.run);
  }
  if (body.ok === true && "job" in body) {
    const job = codexJobSchema.parse(body.job);
    options.onProgress?.(job);
    return waitForCodexJob(job.id, options);
  }

  throw apiError(body, response.status);
}

export async function listCodexJobs(
  fetchImplementation: typeof fetch = fetch,
): Promise<CodexJob[]> {
  const response = await fetchImplementation("/api/jobs", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (!response.ok || !isObject(body) || body.ok !== true) {
    throw apiError(body, response.status);
  }
  if (!Array.isArray(body.jobs)) {
    throw new WorkflowApiError(
      "CODEX_JOB_RESPONSE_INVALID",
      "任务列表响应格式无效。",
    );
  }
  return body.jobs.map((job) => codexJobSchema.parse(job));
}

export async function waitForCodexJob(
  jobId: string,
  options: WorkflowExecutionOptions = {},
): Promise<WorkflowRun> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 20 * 60_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) {
      throw new WorkflowApiError(
        "CODEX_JOB_POLLING_ABORTED",
        "已停止等待 Codex 任务。",
      );
    }
    const response = await fetchImplementation(`/api/jobs/${jobId}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const body: unknown = await response.json();
    if (!response.ok || !isObject(body) || body.ok !== true) {
      throw apiError(body, response.status);
    }
    const job = codexJobSchema.parse(body.job);
    options.onProgress?.(job);

    if (job.status === "completed") {
      if (!job.run) {
        throw new WorkflowApiError(
          "CODEX_JOB_RESULT_MISSING",
          "Codex 任务已完成但没有 Run 结果。",
        );
      }
      return job.run;
    }
    if (job.status === "failed" || job.status === "interrupted") {
      throw new WorkflowApiError(
        job.error?.code ?? "CODEX_JOB_FAILED",
        job.error?.message ?? "Codex 任务未能完成。",
      );
    }
    await delay(pollIntervalMs, options.signal);
  }

  throw new WorkflowApiError(
    "CODEX_JOB_POLLING_TIMEOUT",
    "等待 Codex 任务超时。任务仍可能在后台继续运行。",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIssue(
  value: unknown,
): value is { path: string; message: string } {
  return (
    isObject(value) &&
    typeof value.path === "string" &&
    typeof value.message === "string"
  );
}

function apiError(body: unknown, status: number): WorkflowApiError {
  const envelope = isObject(body) ? body : {};
  const error = isObject(envelope.error) ? envelope.error : {};
  return new WorkflowApiError(
    typeof error.code === "string" ? error.code : "WORKFLOW_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : `工作流请求失败（HTTP ${status}）。`,
    Array.isArray(error.issues) ? error.issues.filter(isIssue) : [],
  );
}

function delay(
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(
        new WorkflowApiError(
          "CODEX_JOB_POLLING_ABORTED",
          "已停止等待 Codex 任务。",
        ),
      );
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
