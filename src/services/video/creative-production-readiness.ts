import { VcaError } from "../../errors.js";
import type { ProductVideoProject } from "../../schemas/product-video-project.schema.js";

export function isCreativeProductionRenderReady(
  project: ProductVideoProject,
): boolean {
  return (
    project.creative_production?.production_readiness !== "needs_assets" &&
    uniqueVisualAssetCount(project) >= 4
  );
}

export function assertCreativeProductionRenderReady(
  project: ProductVideoProject,
): void {
  if (isCreativeProductionRenderReady(project)) {
    return;
  }
  const requiredAssets = project.creative_production?.asset_requirements
    .filter((asset) => asset.required && asset.kind !== "bgm")
    .map((asset) => asset.purpose) ?? [];
  const uniqueVisualAssets = uniqueVisualAssetCount(project);
  throw new VcaError(
    "VIDEO_PRODUCTION_ASSETS_REQUIRED",
    "Creative production cannot be rendered as a publishable video until required real assets and at least four distinct visual assets are supplied.",
    {
      required_assets: requiredAssets,
      unique_visual_assets: uniqueVisualAssets,
      minimum_unique_visual_assets: 4,
    },
  );
}

function uniqueVisualAssetCount(project: ProductVideoProject): number {
  return new Set(
    (project.assets.gallery ?? [project.assets.image]).map(
      (asset) => asset.relative_path,
    ),
  ).size;
}
