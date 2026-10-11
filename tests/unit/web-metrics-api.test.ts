import { describe, expect, it } from "vitest";

import { analyzePerformance } from "../../src/web/analyze-performance.js";
import { samplePerformanceInput } from "../../src/web/sample-performance.js";

describe("Web metrics adapter", () => {
  it("reuses the deterministic Metrics Service contract", () => {
    const result = analyzePerformance(samplePerformanceInput);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected a valid metrics response.");
    }
    expect(result.data.metrics_snapshot).toMatchObject({
      views: 12_000,
      estimated_completions: 5_040,
      rates: {
        completion_rate: 0.42,
        click_rate: 0.04,
        order_rate_per_view: 0.003,
      },
      data_quality: {
        usable: true,
        warnings: [],
      },
    });
  });

  it("returns field-level issues for invalid input", () => {
    const result = analyzePerformance({
      ...samplePerformanceInput,
      metrics: {
        ...samplePerformanceInput.metrics,
        completion_rate: 1.2,
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected an invalid metrics response.");
    }
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "metrics.completion_rate",
        }),
      ]),
    );
  });

});
