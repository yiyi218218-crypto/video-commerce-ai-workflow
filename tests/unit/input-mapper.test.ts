import { describe, expect, it } from "vitest";

import { WorkflowInputMappingError } from "../../src/errors.js";
import { resolveInputTemplate } from "../../src/workflows/input-mapper.js";

describe("resolveInputTemplate", () => {
  const context = {
    input: { message: "hello" },
    steps: {
      first: { items: [{ id: "one" }] },
    },
  };

  it("resolves nested object and array references", () => {
    expect(
      resolveInputTemplate(
        {
          message: "$.input.message",
          item: "$.steps.first.items.0.id",
          literal: "plain text",
        },
        context,
      ),
    ).toEqual({
      message: "hello",
      item: "one",
      literal: "plain text",
    });
  });

  it("rejects missing references", () => {
    expect(() =>
      resolveInputTemplate("$.input.missing", context),
    ).toThrow(WorkflowInputMappingError);
  });

  it("allows an explicitly optional missing reference", () => {
    expect(
      resolveInputTemplate(
        {
          required: "$.input.message",
          optional: "$.input.account_operation_profile?",
        },
        context,
      ),
    ).toEqual({
      required: "hello",
      optional: undefined,
    });
  });
});
