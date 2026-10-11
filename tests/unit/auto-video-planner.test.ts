import { describe, expect, it } from "vitest";

import { selectAutoVideoRecommendations } from "../../src/services/video/auto-video-planner.js";
import { analyzedSelectionBatch } from "../fixtures/product-selection.js";

describe("selectAutoVideoRecommendations", () => {
  it("keeps only high-scoring priority or small-test products", () => {
    const recommendations = selectAutoVideoRecommendations(
      analyzedSelectionBatch,
      {
        maximumProjects: 3,
        minimumScore: 70,
        recommendationLevels: ["priority_test", "small_test"],
      },
    );

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.candidate_id).toBe(
      analyzedSelectionBatch.analysis?.top_pick_id,
    );
  });

  it("limits the number of automatic video projects", () => {
    const recommendations = selectAutoVideoRecommendations(
      analyzedSelectionBatch,
      {
        maximumProjects: 1,
        minimumScore: 0,
        recommendationLevels: [
          "priority_test",
          "small_test",
          "watch",
          "reject",
        ],
      },
    );

    expect(recommendations).toHaveLength(1);
  });

  it("excludes products that cannot support a credible creative test", () => {
    const batch = structuredClone(analyzedSelectionBatch);
    const recommendation = batch.analysis?.ranking[0];
    if (!recommendation) {
      throw new Error("fixture must provide a top recommendation");
    }
    recommendation.dimensions.content_potential = 13;
    recommendation.overall_score = Object.values(
      recommendation.dimensions,
    ).reduce((total, value) => total + value, 0);

    const recommendations = selectAutoVideoRecommendations(batch, {
      maximumProjects: 3,
      minimumScore: 70,
      recommendationLevels: ["priority_test", "small_test"],
    });

    expect(recommendations).toHaveLength(0);
  });
});
