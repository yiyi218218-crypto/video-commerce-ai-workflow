import {
  channelPublishPackageSchema,
  type ChannelPublishPackage,
  type CreateChannelPublishPackageRequest,
} from "../schemas/channel-publish.schema.js";

export class ChannelPublishApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly issues: Array<{ path: string; message: string }> = [],
  ) {
    super(message);
    this.name = "ChannelPublishApiError";
  }
}

export async function createChannelPublishPackage(
  request: CreateChannelPublishPackageRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<ChannelPublishPackage> {
  const response = await fetchImplementation(
    "/api/channel-publish-packages",
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parsePackageResponse(response);
}

export async function attachChannelPublishVideo(
  packageId: string,
  file: File,
  fetchImplementation: typeof fetch = fetch,
): Promise<ChannelPublishPackage> {
  const mediaType = resolveVideoMediaType(file);
  const response = await fetchImplementation(
    `/api/channel-publish-packages/${encodeURIComponent(packageId)}/video?filename=${encodeURIComponent(file.name)}`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": mediaType,
      },
      body: file,
    },
  );
  return parsePackageResponse(response);
}

export async function openChannelPublishPackageDirectory(
  packageId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImplementation(
    `/api/channel-publish-packages/${encodeURIComponent(packageId)}/open`,
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

async function parsePackageResponse(
  response: Response,
): Promise<ChannelPublishPackage> {
  const body: unknown = await response.json();
  if (
    !response.ok ||
    !isObject(body) ||
    body.ok !== true ||
    !("package" in body)
  ) {
    throw apiError(body, response.status);
  }
  return channelPublishPackageSchema.parse(body.package);
}

function resolveVideoMediaType(file: File): string {
  const extension = file.name.toLowerCase().split(".").at(-1);
  const expectedTypes: Record<string, string> = {
    mov: "video/quicktime",
    mp4: "video/mp4",
    webm: "video/webm",
  };
  const mediaType = extension ? expectedTypes[extension] : undefined;
  if (!mediaType || (file.type && file.type !== mediaType)) {
    throw new ChannelPublishApiError(
      "PUBLISH_VIDEO_TYPE_INVALID",
      "仅支持扩展名与格式一致的 MP4、MOV 或 WebM 成片。",
    );
  }
  return mediaType;
}

function apiError(body: unknown, status: number): ChannelPublishApiError {
  const envelope = isObject(body) ? body : {};
  const error = isObject(envelope.error) ? envelope.error : {};
  return new ChannelPublishApiError(
    typeof error.code === "string"
      ? error.code
      : "PUBLISH_PACKAGE_REQUEST_FAILED",
    typeof error.message === "string"
      ? error.message
      : `发布助手请求失败（HTTP ${status}）。`,
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
