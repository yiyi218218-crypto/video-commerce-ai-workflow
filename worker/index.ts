import contentPrompt from "../src/prompts/content-agent.md";
import livePrompt from "../src/prompts/live-agent.md";
import productPrompt from "../src/prompts/product-agent.md";
import scriptPrompt from "../src/prompts/script-agent.md";
import { serializeError, VcaError } from "../src/errors.js";
import {
  OpenAiCompatibleProvider,
} from "../src/services/llm/openai-compatible-provider.js";
import { InlinePromptSource } from "../src/services/prompts/inline-prompt-source.js";
import {
  workflowApiRequestSchema,
  type ProviderStatus,
} from "../src/web/workflow-api.schema.js";
import {
  createVideoSalesRuntime,
  getVideoSalesWorkflow,
} from "../src/workflows/video-sales-runtime.js";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface WorkerEnvironment {
  ASSETS: AssetBinding;
  VCA_LLM_API_KEY?: string;
  VCA_LLM_MODEL?: string;
  VCA_LLM_BASE_URL?: string;
}

const maximumRequestBytes = 120_000;
export default {
  async fetch(
    request: Request,
    env: WorkerEnvironment,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/provider" && request.method === "GET") {
      return json(providerStatus(env));
    }

    if (
      url.pathname === "/api/workflows/video-sales" &&
      request.method === "POST"
    ) {
      return executeWorkflow(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return json(
        {
          ok: false,
          error: {
            code: "API_ROUTE_NOT_FOUND",
            message: "API route not found.",
          },
        },
        404,
      );
    }

    return serveAsset(request, env);
  },
};

async function executeWorkflow(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumRequestBytes) {
    return apiError(
      "REQUEST_TOO_LARGE",
      "Workflow request exceeds the 120 KB limit.",
      413,
    );
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return apiError(
      "CONTENT_TYPE_INVALID",
      "Workflow requests must use application/json.",
      415,
    );
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maximumRequestBytes) {
      return apiError(
        "REQUEST_TOO_LARGE",
        "Workflow request exceeds the 120 KB limit.",
        413,
      );
    }
    body = JSON.parse(raw);
  } catch {
    return apiError("JSON_INVALID", "Request body is not valid JSON.", 400);
  }

  const parsed = workflowApiRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: {
          code: "WORKFLOW_INPUT_INVALID",
          message: "Workflow input failed schema validation.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      },
      400,
    );
  }

  const status = providerStatus(env);
  if (!status.configured) {
    return apiError(
      "LLM_PROVIDER_NOT_CONFIGURED",
      "Server-side LLM Provider is not configured.",
      503,
    );
  }

  try {
    const initialRuns =
      parsed.data.action === "resume" ? [parsed.data.run] : [];
    const runtime = createRuntime(env, initialRuns);
    const loadedWorkflow = await getVideoSalesWorkflow();
    const run =
      parsed.data.action === "start"
        ? await runtime.workflowRunner.start(
            loadedWorkflow,
            parsed.data.input,
          )
        : await runtime.workflowRunner.resume(
            parsed.data.run.id,
            loadedWorkflow,
            parsed.data.checkpoint,
          );
    return json({ ok: true, run });
  } catch (error) {
    const serialized = serializeError(error);
    return json(
      {
        ok: false,
        error: serialized,
      },
      error instanceof VcaError ? 422 : 500,
    );
  }
}

function createRuntime(
  env: WorkerEnvironment,
  initialRuns: Parameters<typeof createVideoSalesRuntime>[0]["initialRuns"],
) {
  const provider = new OpenAiCompatibleProvider({
    apiKey: env.VCA_LLM_API_KEY ?? "",
    model: env.VCA_LLM_MODEL ?? "",
    ...(env.VCA_LLM_BASE_URL
      ? { baseUrl: env.VCA_LLM_BASE_URL }
      : {}),
  });
  const prompts = new InlinePromptSource([
    {
      id: "product_agent",
      version: "1.0.0",
      content: productPrompt,
    },
    {
      id: "content_agent",
      version: "1.0.0",
      content: contentPrompt,
    },
    {
      id: "script_agent",
      version: "1.0.0",
      content: scriptPrompt,
    },
    {
      id: "live_agent",
      version: "1.0.0",
      content: livePrompt,
    },
  ]);
  return createVideoSalesRuntime({
    provider,
    promptSource: prompts,
    ...(initialRuns ? { initialRuns } : {}),
  });
}

function providerStatus(env: WorkerEnvironment): ProviderStatus {
  const model = env.VCA_LLM_MODEL?.trim() || null;
  return {
    configured: Boolean(env.VCA_LLM_API_KEY?.trim() && model),
    provider: "openai_compatible",
    model,
    persistence: "browser_local",
  };
}

async function serveAsset(
  request: Request,
  env: WorkerEnvironment,
): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  const acceptsHtml = request.headers.get("accept")?.includes("text/html");

  if (
    response.status !== 404 ||
    !acceptsHtml ||
    !["GET", "HEAD"].includes(request.method)
  ) {
    return withSecurityHeaders(response);
  }

  const url = new URL(request.url);
  const nestedIndex = new URL(url);
  nestedIndex.pathname = `${url.pathname.replace(/\/$/, "")}/index.html`;
  nestedIndex.search = "";
  const nestedResponse = await env.ASSETS.fetch(
    new Request(nestedIndex, request),
  );
  if (nestedResponse.status !== 404) {
    return withSecurityHeaders(nestedResponse);
  }

  const rootIndex = new URL(url);
  rootIndex.pathname = "/index.html";
  rootIndex.search = "";
  return withSecurityHeaders(
    await env.ASSETS.fetch(new Request(rootIndex, request)),
  );
}

function json(value: unknown, status = 200): Response {
  return withSecurityHeaders(
    Response.json(value, {
      status,
      headers: {
        "cache-control": "no-store",
      },
    }),
  );
}

function apiError(code: string, message: string, status: number): Response {
  return json(
    {
      ok: false,
      error: { code, message },
    },
    status,
  );
}

function withSecurityHeaders(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("referrer-policy", "same-origin");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return secured;
}
