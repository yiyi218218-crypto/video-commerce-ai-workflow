import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "./llm-provider.js";

export class SerialLlmProvider implements LlmProvider {
  readonly name: string;
  private tail = Promise.resolve();

  constructor(private readonly provider: LlmProvider) {
    this.name = provider.name;
  }

  async generateStructured(request: LlmRequest): Promise<LlmResponse> {
    const previous = this.tail;
    let release = () => {};
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.provider.generateStructured(request);
    } finally {
      release();
    }
  }
}
