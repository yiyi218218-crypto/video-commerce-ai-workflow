import type { LlmProvider, LlmRequest, LlmResponse } from "./llm-provider.js";

function isMessageInput(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

export class EchoLlmProvider implements LlmProvider {
  readonly name = "phase0-echo-provider";

  async generateStructured(request: LlmRequest): Promise<LlmResponse> {
    const message = isMessageInput(request.input)
      ? request.input.message
      : JSON.stringify(request.input);

    return {
      output: { message },
      model: "phase0-echo-model",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }
}
