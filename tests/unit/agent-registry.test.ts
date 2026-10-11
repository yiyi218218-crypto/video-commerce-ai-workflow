import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AgentRegistry } from "../../src/agents/agent-registry.js";
import type { ContractAgent } from "../../src/agents/agent.js";
import {
  AgentInputValidationError,
  AgentOutputValidationError,
  DuplicateAgentError,
} from "../../src/errors.js";

const inputSchema = z.object({ value: z.string() }).strict();
const outputSchema = z.object({ value: z.string() }).strict();

class InlineAgent implements ContractAgent<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> {
  readonly name = "inline";
  readonly inputSchema = inputSchema;
  readonly outputSchema = outputSchema;

  constructor(private readonly invalidOutput = false) {}

  async run(input: z.infer<typeof inputSchema>) {
    return this.invalidOutput
      ? ({ value: 123 } as unknown as z.infer<typeof outputSchema>)
      : input;
  }
}

describe("AgentRegistry", () => {
  it("validates input and output around agent execution", async () => {
    const registry = new AgentRegistry();
    registry.register(new InlineAgent());

    await expect(
      registry.execute("inline", { value: "ok" }),
    ).resolves.toMatchObject({
      output: { value: "ok" },
      metadata: { agent: "inline" },
    });

    await expect(
      registry.execute("inline", { value: 42 }),
    ).rejects.toBeInstanceOf(AgentInputValidationError);
  });

  it("rejects invalid agent output", async () => {
    const registry = new AgentRegistry();
    registry.register(new InlineAgent(true));

    await expect(
      registry.execute("inline", { value: "ok" }),
    ).rejects.toBeInstanceOf(AgentOutputValidationError);
  });

  it("rejects duplicate names", () => {
    const registry = new AgentRegistry();
    registry.register(new InlineAgent());

    expect(() => registry.register(new InlineAgent())).toThrow(
      DuplicateAgentError,
    );
  });
});
