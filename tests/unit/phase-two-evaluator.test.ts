import { describe, expect, it } from "vitest";

import { evaluatePhaseTwoArtifacts } from "../../src/services/evaluation/phase-two-evaluator.js";
import {
  sampleLiveContext,
  sampleLiveOutput,
  sampleScriptOutput,
} from "../fixtures/phase-two.js";

describe("evaluatePhaseTwoArtifacts", () => {
  it("scores script pacing, shootability, live completeness, and trust", () => {
    const result = evaluatePhaseTwoArtifacts(
      sampleScriptOutput,
      sampleLiveOutput,
      sampleLiveContext,
    );

    expect(result.hardGates).toEqual({
      scriptSchemaValid: true,
      liveSchemaValid: true,
      directionConsistent: true,
      scriptTimelinesValid: true,
      openingMinutesValid: true,
      noHardSellLanguage: true,
      confirmedOffersGrounded: true,
      urgencyGrounded: true,
    });
    expect(result.scriptQuality.score).toBeGreaterThanOrEqual(4);
    expect(result.shootability.score).toBeGreaterThanOrEqual(4);
    expect(result.liveCompleteness.score).toBe(5);
    expect(result.commercialTrust.score).toBe(5);
    expect(result.passed).toBe(true);
  });

  it("fails when a shot exceeds its declared duration", () => {
    const invalidScript = structuredClone(sampleScriptOutput);
    const lastShot = invalidScript.scripts.fifteen_seconds.shots.at(-1);
    if (!lastShot) {
      throw new Error("Fixture is missing the final 15-second shot.");
    }
    lastShot.end_second = 16;

    const result = evaluatePhaseTwoArtifacts(
      invalidScript,
      sampleLiveOutput,
      sampleLiveContext,
    );

    expect(result.hardGates.scriptTimelinesValid).toBe(false);
    expect(result.passed).toBe(false);
  });
});
