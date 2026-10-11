import type { Codex } from "@openai/codex-sdk";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  CodexUsageLimitError,
  LlmProviderRequestError,
} from "../../src/errors.js";
import { CodexSdkProvider } from "../../src/services/llm/codex-sdk-provider.js";

const request = {
  systemPrompt: "分析商品事实。",
  input: { product_name: "燕麦脆" },
  outputSchemaName: "product_output",
  outputSchema: z.object({ answer: z.string() }).strict(),
};

describe("CodexSdkProvider", () => {
  it("runs Codex in a read-only local thread with structured output", async () => {
    const run = vi.fn(async () => ({
      items: [],
      finalResponse: '{"answer":"结构化结果"}',
      usage: {
        input_tokens: 30,
        cached_input_tokens: 0,
        cache_write_input_tokens: 0,
        output_tokens: 12,
        reasoning_output_tokens: 2,
      },
    }));
    const startThread = vi.fn(() => ({ run }));
    const provider = new CodexSdkProvider({
      workingDirectory: "C:\\workspace",
      codex: { startThread } as unknown as Codex,
    });

    const result = await provider.generateStructured(request);

    expect(startThread).toHaveBeenCalledWith({
      workingDirectory: "C:\\workspace",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("燕麦脆"),
      expect.objectContaining({
        outputSchema: expect.objectContaining({ type: "object" }),
      }),
    );
    expect(result).toEqual({
      output: { answer: "结构化结果" },
      model: "codex-default",
      usage: {
        inputTokens: 30,
        outputTokens: 12,
      },
    });
  });

  it("rejects non-JSON final responses", async () => {
    const provider = new CodexSdkProvider({
      workingDirectory: "C:\\workspace",
      codex: {
        startThread: () => ({
          run: async () => ({
            items: [],
            finalResponse: "not-json",
            usage: null,
          }),
        }),
      } as unknown as Codex,
    });

    await expect(provider.generateStructured(request)).rejects.toBeInstanceOf(
      LlmProviderRequestError,
    );
  });

  it("surfaces Codex usage limits without misreporting a login failure", async () => {
    const provider = new CodexSdkProvider({
      workingDirectory: "C:\\workspace",
      codex: {
        startThread: () => ({
          run: async () => {
            throw new Error(
              "You've hit your usage limit. Try again at Jul 29th, 2026 2:12 AM.",
            );
          },
        }),
      } as unknown as Codex,
    });

    await expect(provider.generateStructured(request)).rejects.toMatchObject({
      code: "CODEX_USAGE_LIMIT_REACHED",
      message:
        "本机 Codex 使用额度已用完，可在 Jul 29th, 2026 2:12 AM 后重试。",
    });
    await expect(
      Promise.reject(
        new CodexUsageLimitError("You've hit your usage limit."),
      ),
    ).rejects.toBeInstanceOf(CodexUsageLimitError);
  });
});
