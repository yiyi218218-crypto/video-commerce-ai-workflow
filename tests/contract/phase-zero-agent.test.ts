import { describe, expect, it } from "vitest";

import { PhaseZeroAgent } from "../../src/agents/demo/phase-zero-agent.js";
import { AgentOutputValidationError } from "../../src/errors.js";
import { EchoLlmProvider } from "../../src/services/llm/echo-llm-provider.js";
import type {
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from "../../src/services/llm/llm-provider.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";

class RepairingProvider implements LlmProvider {
  readonly name = "repairing";
  calls = 0;

  async generateStructured(request: LlmRequest): Promise<LlmResponse> {
    this.calls += 1;
    return {
      output: request.repair ? { message: "fixed" } : { wrong: true },
      model: "test",
    };
  }
}

class InvalidProvider implements LlmProvider {
  readonly name = "invalid";

  async generateStructured(): Promise<LlmResponse> {
    return {
      output: { wrong: true },
      model: "test",
    };
  }
}

describe("PhaseZeroAgent contract", () => {
  it("uses an independent prompt and returns schema-valid output", async () => {
    const agent = new PhaseZeroAgent(
      new EchoLlmProvider(),
      new PromptLoader(),
    );

    await expect(agent.run({ message: "framework ready" })).resolves.toEqual({
      message: "framework ready",
    });

    const descriptor = await agent.describe();
    expect(descriptor.prompt).toMatchObject({
      id: "phase0_echo",
      version: "1.0.0",
    });
    expect(descriptor.prompt?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("repairs one schema-invalid model response", async () => {
    const provider = new RepairingProvider();
    const agent = new PhaseZeroAgent(provider, new PromptLoader());

    await expect(agent.run({ message: "input" })).resolves.toEqual({
      message: "fixed",
    });
    expect(provider.calls).toBe(2);
  });

  it("rejects output that remains invalid after one repair", async () => {
    const agent = new PhaseZeroAgent(
      new InvalidProvider(),
      new PromptLoader(),
    );

    await expect(agent.run({ message: "input" })).rejects.toBeInstanceOf(
      AgentOutputValidationError,
    );
  });
});
