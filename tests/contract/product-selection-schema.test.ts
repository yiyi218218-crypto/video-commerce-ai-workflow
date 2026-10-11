import { describe, expect, it } from "vitest";

import {
  importSelectionCandidatesRequestSchema,
  productSelectionAgentInputSchema,
  productSelectionAgentOutputSchema,
} from "../../src/schemas/product-selection.schema.js";
import {
  selectionCandidates,
  selectionInput,
  selectionOutput,
} from "../fixtures/product-selection.js";

describe("product selection schemas", () => {
  it("accepts candidates from the official selection-center origin", () => {
    const result = importSelectionCandidatesRequestSchema.parse({
      source_page_url:
        "https://store.weixin.qq.com/talent/selection?page=1",
      captured_at: "2026-07-23T09:00:00.000Z",
      candidates: selectionCandidates,
    });

    expect(result.candidates).toHaveLength(2);
  });

  it("rejects candidates imported from an unrelated origin", () => {
    const result =
      importSelectionCandidatesRequestSchema.safeParse({
        source_page_url: "https://example.com/fake-selection",
        captured_at: "2026-07-23T09:00:00.000Z",
        candidates: selectionCandidates,
      });

    expect(result.success).toBe(false);
  });

  it("validates the AI input and output contracts", () => {
    expect(productSelectionAgentInputSchema.parse(selectionInput)).toEqual(
      selectionInput,
    );
    expect(
      productSelectionAgentOutputSchema.parse(selectionOutput),
    ).toEqual(selectionOutput);
  });
});
