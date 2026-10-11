import { describe, expect, it } from "vitest";
import { z } from "zod";

import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "../../src/services/llm/llm-provider.js";
import { SerialLlmProvider } from "../../src/services/llm/serial-llm-provider.js";

describe("SerialLlmProvider", () => {
  it("never executes two Codex generations at the same time", async () => {
    let active = 0;
    let maximumActive = 0;
    const provider: LlmProvider = {
      name: "test",
      async generateStructured(): Promise<LlmResponse> {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { output: {}, model: "test" };
      },
    };
    const serial = new SerialLlmProvider(provider);
    const request: LlmRequest = {
      systemPrompt: "test",
      input: {},
      outputSchemaName: "test",
      outputSchema: z.object({}),
    };

    await Promise.all([
      serial.generateStructured(request),
      serial.generateStructured(request),
      serial.generateStructured(request),
    ]);

    expect(maximumActive).toBe(1);
  });
});
