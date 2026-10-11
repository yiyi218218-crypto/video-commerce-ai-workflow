import { describe, expect, it } from "vitest";

import { evaluateCommentArtifact } from "../../src/services/evaluation/comment-evaluator.js";
import {
  sampleCommentInput,
  sampleCommentOutput,
} from "../fixtures/comment.js";

describe("evaluateCommentArtifact", () => {
  it("scores interaction, trust, conversion fit, and safety", () => {
    const result = evaluateCommentArtifact(
      sampleCommentInput,
      sampleCommentOutput,
    );

    expect(result.hardGates).toEqual({
      inputSchemaValid: true,
      outputSchemaValid: true,
      escalationConsistent: true,
      privacyHandledSafely: true,
      prohibitedTermsAbsent: true,
      noHardSellLanguage: true,
      replyLengthValid: true,
    });
    expect(result.interactionQuality.score).toBe(5);
    expect(result.trustQuality.score).toBe(5);
    expect(result.operationalSafety.score).toBe(5);
    expect(result.passed).toBe(true);
  });

  it("fails privacy handling when public replies are not blocked", () => {
    const unsafeOutput = structuredClone(sampleCommentOutput);
    unsafeOutput.safety_flags = ["privacy_data"];
    unsafeOutput.escalation.do_not_reply_publicly = false;

    const result = evaluateCommentArtifact(
      sampleCommentInput,
      unsafeOutput,
    );

    expect(result.hardGates.privacyHandledSafely).toBe(false);
    expect(result.passed).toBe(false);
  });
});
