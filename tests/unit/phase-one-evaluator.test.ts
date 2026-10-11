import { describe, expect, it } from "vitest";

import { evaluatePhaseOneArtifacts } from "../../src/services/evaluation/phase-one-evaluator.js";
import {
  sampleContentOutput,
  sampleProductOutput,
} from "../fixtures/phase-one.js";

describe("evaluatePhaseOneArtifacts", () => {
  it("scores valid, varied Phase 1 output across four dimensions", () => {
    const result = evaluatePhaseOneArtifacts(
      sampleProductOutput,
      sampleContentOutput,
    );

    expect(result.hardGates).toEqual({
      productSchemaValid: true,
      contentSchemaValid: true,
      directionCountValid: true,
      directionIdsUnique: true,
      noHardSellLanguage: true,
    });
    expect(result.commercialValue.score).toBeGreaterThanOrEqual(4);
    expect(result.contentQuality.score).toBeGreaterThanOrEqual(4);
    expect(result.videoChannelsFit.score).toBeGreaterThanOrEqual(4);
    expect(result.conversionAbility.score).toBeGreaterThanOrEqual(4);
    expect(result.passed).toBe(true);
  });

  it("fails hard gates when an output is not schema-valid", () => {
    const result = evaluatePhaseOneArtifacts(
      sampleProductOutput,
      { directions: [] },
    );

    expect(result.hardGates.contentSchemaValid).toBe(false);
    expect(result.passed).toBe(false);
  });
});
