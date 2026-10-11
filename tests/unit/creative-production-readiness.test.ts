import { describe, expect, it } from "vitest";

import { VcaError } from "../../src/errors.js";
import {
  assertCreativeProductionRenderReady,
  isCreativeProductionRenderReady,
} from "../../src/services/video/creative-production-readiness.js";
import type { ProductVideoProject } from "../../src/schemas/product-video-project.schema.js";

describe("creative production readiness", () => {
  it("blocks rendering a publishable video when the director requests real assets", () => {
    const project = projectFixture("needs_assets");
    expect(isCreativeProductionRenderReady(project)).toBe(false);
    expect(() => assertCreativeProductionRenderReady(project)).toThrow(VcaError);
  });

  it("allows the render pipeline after required assets are confirmed", () => {
    const project = projectFixture("ready");
    expect(isCreativeProductionRenderReady(project)).toBe(true);
    expect(() => assertCreativeProductionRenderReady(project)).not.toThrow();
  });

  it("blocks a ready brief when it still has only one distinct visual asset", () => {
    const project = projectFixture("ready");
    project.assets.gallery = [project.assets.image];
    expect(isCreativeProductionRenderReady(project)).toBe(false);
  });
});

function projectFixture(
  productionReadiness: "ready" | "needs_assets",
): ProductVideoProject {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "prepared",
    batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    candidate: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "Product",
      raw_text: "Product",
      image_url: "https://example.com/product.jpg",
    },
    recommendation: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "Product",
      overall_score: 80,
      dimensions: { account_fit: 16, demand_evidence: 16, commission_value: 16, content_potential: 16, trust_and_safety: 16 },
      recommendation_level: "priority_test",
      reasons: ["fit", "demand", "content"],
      risk_flags: ["verify"],
      facts_to_verify: ["price"],
      video_plan: {
        duration_seconds: 15,
        hook: "Hook",
        voiceover: "Voiceover",
        cards: [
          { start_second: 0, end_second: 4, headline: "A", subline: "B", visual_treatment: "pain_point" },
          { start_second: 4, end_second: 8, headline: "A", subline: "B", visual_treatment: "product_reveal" },
          { start_second: 8, end_second: 12, headline: "A", subline: "B", visual_treatment: "proof_focus" },
          { start_second: 12, end_second: 15, headline: "A", subline: "B", visual_treatment: "call_to_action" },
        ],
        call_to_action: "Check",
      },
    },
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: "2026-07-25T00:00:00.000Z",
    directory_path: "C:/temp/project",
    assets: {
      image: { relative_path: "product.jpg", media_type: "image/jpeg" },
      ...(productionReadiness === "ready"
        ? {
            gallery: [
              { relative_path: "product.jpg", media_type: "image/jpeg" },
              { relative_path: "detail-01.jpg", media_type: "image/jpeg" },
              { relative_path: "detail-02.jpg", media_type: "image/jpeg" },
              { relative_path: "use-01.jpg", media_type: "image/jpeg" },
            ],
          }
        : {}),
    },
    creative_production: {
      creative_route: "life_problem",
      one_sentence_promise: "A usable product story.",
      emotional_arc: "problem to relief",
      display_name: "Product",
      production_readiness: productionReadiness,
      asset_requirements: [
        { kind: "product_in_use", required: true, purpose: "A real usage clip." },
        { kind: "bgm", required: true, purpose: "Licensed BGM." },
      ],
      beats: [
        { start_second: 0, end_second: 3, story_role: "hook", viewer_emotion: "recognition", shot_type: "close_up", action: "Search", product_visibility: "none", voiceover: "Where is it?", on_screen_text: "找不到", transition: "cut" },
        { start_second: 3, end_second: 6, story_role: "tension", viewer_emotion: "frustration", shot_type: "wide", action: "Look", product_visibility: "brief", voiceover: "Again.", on_screen_text: "又找", transition: "cut" },
        { start_second: 6, end_second: 10, story_role: "demonstration", viewer_emotion: "relief", shot_type: "detail", action: "Use", product_visibility: "hero", voiceover: "Here.", on_screen_text: "顺手", transition: "cut" },
        { start_second: 10, end_second: 13, story_role: "proof", viewer_emotion: "trust", shot_type: "detail", action: "Show", product_visibility: "hero", voiceover: "Simple.", on_screen_text: "日常", transition: "cut" },
        { start_second: 13, end_second: 15, story_role: "invitation", viewer_emotion: "calm", shot_type: "wide", action: "Leave", product_visibility: "brief", voiceover: "Choose.", on_screen_text: "看看", transition: "hold" },
      ],
      captions: [
        { start_second: 0, end_second: 3, text: "找不到", emphasis: "key_word" },
        { start_second: 3, end_second: 6, text: "又找", emphasis: "none" },
        { start_second: 6, end_second: 10, text: "顺手", emphasis: "punchline" },
        { start_second: 10, end_second: 13, text: "日常", emphasis: "none" },
        { start_second: 13, end_second: 15, text: "看看", emphasis: "none" },
      ],
      bgm_direction: "warm, understated",
      sfx_cues: ["3s: soft click"],
      facts_to_verify: ["SKU"],
    },
    warnings: [],
    files: ["a", "b", "c", "d"],
  };
}
