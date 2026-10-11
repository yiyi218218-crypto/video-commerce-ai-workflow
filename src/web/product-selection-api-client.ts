import {
  selectionBatchSchema,
  type ImportSelectionCandidatesRequest,
  type SelectionAnalysisProfile,
  type SelectionBatch,
} from "../schemas/product-selection.schema.js";

export class ProductSelectionApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "ProductSelectionApiError";
  }
}

export async function importSelectionCandidates(
  request: ImportSelectionCandidatesRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<SelectionBatch> {
  const response = await fetchImplementation("/api/selection-batches", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseBatchResponse(response);
}

export async function listSelectionBatches(
  fetchImplementation: typeof fetch = fetch,
): Promise<SelectionBatch[]> {
  const response = await fetchImplementation("/api/selection-batches", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !Array.isArray(body.batches)
  ) {
    throw apiError(body, response.status);
  }
  return body.batches.map((batch) => selectionBatchSchema.parse(batch));
}

export async function getSelectionBatch(
  batchId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<SelectionBatch> {
  const response = await fetchImplementation(
    `/api/selection-batches/${encodeURIComponent(batchId)}`,
    {
      headers: { accept: "application/json" },
      cache: "no-store",
    },
  );
  return parseBatchResponse(response);
}

export async function analyzeSelectionBatch(
  batchId: string,
  profile: SelectionAnalysisProfile,
  fetchImplementation: typeof fetch = fetch,
): Promise<SelectionBatch> {
  const response = await fetchImplementation(
    `/api/selection-batches/${encodeURIComponent(batchId)}/analyze`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(profile),
    },
  );
  return parseBatchResponse(response);
}

export async function waitForSelectionAnalysis(
  batchId: string,
  options: {
    fetchImplementation?: typeof fetch;
    onProgress?: (batch: SelectionBatch) => void;
    signal?: AbortSignal;
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<SelectionBatch> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const pollInterval = options.pollIntervalMs ?? 1_500;
  const timeout = options.timeoutMs ?? 20 * 60_000;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (options.signal?.aborted) {
      throw new ProductSelectionApiError(
        "SELECTION_POLLING_ABORTED",
        "已停止等待选品分析。",
      );
    }
    const batch = await getSelectionBatch(batchId, fetchImplementation);
    options.onProgress?.(batch);
    if (batch.status === "analyzed") {
      return batch;
    }
    if (batch.status === "failed") {
      throw new ProductSelectionApiError(
        batch.error?.code ?? "SELECTION_ANALYSIS_FAILED",
        batch.error?.message ?? "Codex 选品分析失败。",
      );
    }
    await delay(pollInterval, options.signal);
  }
  throw new ProductSelectionApiError(
    "SELECTION_POLLING_TIMEOUT",
    "等待 Codex 选品分析超时，任务可能仍在后台运行。",
  );
}

export async function openSelectionBridgeDirectory(
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(
    "/api/selection-bridge/open-extension-directory",
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

async function parseBatchResponse(
  response: Response,
): Promise<SelectionBatch> {
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !("batch" in body)
  ) {
    throw apiError(body, response.status);
  }
  return selectionBatchSchema.parse(body.batch);
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
      : "SELECTION_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : `选品请求失败（HTTP ${status}）。`,
    Array.isArray(error.issues) ? error.issues.filter(isIssue) : [],
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

function delay(
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(
        new ProductSelectionApiError(
          "SELECTION_POLLING_ABORTED",
          "已停止等待选品分析。",
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
