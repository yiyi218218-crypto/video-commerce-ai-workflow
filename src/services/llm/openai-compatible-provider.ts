import {
  LlmProviderRequestError,
  RetryableAgentError,
} from "../../errors.js";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "./llm-provider.js";

export interface OpenAiCompatibleProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImplementation?: typeof fetch;
}

interface ChatCompletionEnvelope {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  model?: string;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = "openai_compatible";

  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleProviderOptions) {
    if (!options.apiKey.trim() || !options.model.trim()) {
      throw new LlmProviderRequestError(
        "Provider apiKey and model are required.",
      );
    }
    const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1")
      .replace(/\/+$/, "");
    this.endpoint = `${baseUrl}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? 90_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async generateStructured(request: LlmRequest): Promise<LlmResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                request.systemPrompt,
                `只返回符合 ${request.outputSchemaName} 的 JSON 对象。`,
                "不要使用 Markdown 代码块，不要添加 Schema 之外的字段。",
              ].join("\n\n"),
            },
            {
              role: "user",
              content: JSON.stringify({
                input: request.input,
                ...(request.repair
                  ? {
                      repair: {
                        previous_output: request.repair.previousOutput,
                        validation_issues:
                          request.repair.validationIssues,
                      },
                    }
                  : {}),
              }),
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const details = {
          status: response.status,
          requestId:
            response.headers.get("x-request-id") ??
            response.headers.get("request-id") ??
            undefined,
        };
        if (isRetryableStatus(response.status)) {
          throw new RetryableAgentError(
            `Provider request returned HTTP ${response.status}.`,
            details,
          );
        }
        throw new LlmProviderRequestError(
          `Provider request returned HTTP ${response.status}.`,
          details,
        );
      }

      const envelope = (await response.json()) as ChatCompletionEnvelope;
      const content = envelope.choices?.[0]?.message?.content;
      const output = parseJsonContent(content);
      const usage = {
        ...(typeof envelope.usage?.prompt_tokens === "number"
          ? { inputTokens: envelope.usage.prompt_tokens }
          : {}),
        ...(typeof envelope.usage?.completion_tokens === "number"
          ? { outputTokens: envelope.usage.completion_tokens }
          : {}),
      };

      return {
        output,
        model: envelope.model ?? this.options.model,
        ...(Object.keys(usage).length > 0 ? { usage } : {}),
      };
    } catch (error) {
      if (
        error instanceof RetryableAgentError ||
        error instanceof LlmProviderRequestError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new RetryableAgentError(
          `Provider request timed out after ${this.timeoutMs}ms.`,
          undefined,
          { cause: error },
        );
      }
      throw new RetryableAgentError(
        "Provider request could not be completed.",
        undefined,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseJsonContent(content: unknown): unknown {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new LlmProviderRequestError(
      "Provider response did not contain JSON text.",
    );
  }

  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new LlmProviderRequestError(
      "Provider response contained invalid JSON.",
      undefined,
      { cause: error },
    );
  }
}

function isRetryableStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}
