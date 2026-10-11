import { VcaError } from "../../errors.js";
import type {
  SelectionBatch,
  SelectionRecommendation,
} from "../../schemas/product-selection.schema.js";
import type { AutoCreateProductVideosRequest } from "../../schemas/product-video-project.schema.js";

export interface AutoVideoPlanOptions {
  maximumProjects: number;
  minimumScore: number;
  recommendationLevels: AutoCreateProductVideosRequest["recommendation_levels"];
}

const minimumContentPotential = 14;
const minimumTrustAndSafety = 14;

export function selectAutoVideoRecommendations(
  batch: SelectionBatch,
  options: AutoVideoPlanOptions,
): SelectionRecommendation[] {
  if (batch.status !== "analyzed" || !batch.analysis) {
    throw new VcaError(
      "VIDEO_SELECTION_NOT_ANALYZED",
      "Product selection analysis must finish before automatic video creation.",
    );
  }

  const candidates = new Map(
    batch.candidates.map((candidate) => [candidate.candidate_id, candidate]),
  );

  return batch.analysis.ranking
    .filter(
      (recommendation) =>
        recommendation.overall_score >= options.minimumScore &&
        options.recommendationLevels.includes(
          recommendation.recommendation_level,
        ) &&
        recommendation.dimensions.content_potential >=
          minimumContentPotential &&
        recommendation.dimensions.trust_and_safety >=
          minimumTrustAndSafety &&
        Boolean(candidates.get(recommendation.candidate_id)?.image_url),
    )
    .slice(0, options.maximumProjects);
}
