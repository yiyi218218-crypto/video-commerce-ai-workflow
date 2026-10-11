import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "../../src/services/llm/llm-provider.js";

export class ScriptedLlmProvider implements LlmProvider {
  readonly name = "scripted-test-provider";
  readonly requests: LlmRequest[] = [];
  private nextOutput = 0;

  constructor(private readonly outputs: unknown[]) {}

  async generateStructured(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    const output = this.outputs[this.nextOutput];
    if (output === undefined) {
      throw new Error("Scripted provider has no remaining output.");
    }
    this.nextOutput += 1;
    return {
      output,
      model: "scripted-test-model",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    };
  }
}
