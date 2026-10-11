import { describe, expect, it } from "vitest";

import { renderHyperframesIndex } from "../../src/services/video/hyperframes-product-story.js";
import type { ProductVideoProject } from "../../src/schemas/product-video-project.schema.js";

describe("renderHyperframesIndex", () => {
  it("assigns distinct real product assets to successive product beats", () => {
    const html = renderHyperframesIndex(projectWithGallery());

    expect(html).toContain("assets/product-hero.jpg");
    expect(html).toContain("assets/product-angle.jpg");
    expect(html).toContain("assets/product-detail.jpg");
    expect(html).toContain("assets/product-in-use.jpg");
    expect(html).toContain('class="scene-ghost"');
    expect(html).toContain('class="scene-slice slice-');
  });
});

function projectWithGallery(): ProductVideoProject {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "prepared",
    batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    candidate: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "收纳架",
      raw_text: "收纳架",
      image_url: "https://example.com/product.jpg",
    },
    recommendation: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "收纳架",
      overall_score: 84,
      dimensions: {
        account_fit: 17,
        demand_evidence: 17,
        commission_value: 16,
        content_potential: 18,
        trust_and_safety: 16,
      },
      recommendation_level: "priority_test",
      reasons: ["适合内容测试", "有明确场景", "可核验"],
      risk_flags: [],
      facts_to_verify: [],
      video_plan: {
        duration_seconds: 15,
        hook: "桌面又乱了",
        voiceover: "给常用的小东西一个位置。",
        cards: [
          { start_second: 0, end_second: 3, headline: "乱", subline: "找不到", visual_treatment: "pain_point" },
          { start_second: 3, end_second: 7, headline: "放", subline: "分层", visual_treatment: "product_reveal" },
          { start_second: 7, end_second: 12, headline: "看", subline: "细节", visual_treatment: "proof_focus" },
          { start_second: 12, end_second: 15, headline: "留", subline: "顺手", visual_treatment: "call_to_action" },
        ],
        call_to_action: "先看是否适合自己的桌面。",
      },
    },
    created_at: "2026-07-26T00:00:00.000Z",
    updated_at: "2026-07-26T00:00:00.000Z",
    directory_path: "C:/temp/project",
    assets: {
      image: { relative_path: "product-hero.jpg", media_type: "image/jpeg" },
      gallery: [
        { relative_path: "product-hero.jpg", media_type: "image/jpeg" },
        { relative_path: "product-angle.jpg", media_type: "image/jpeg" },
        { relative_path: "product-detail.jpg", media_type: "image/jpeg" },
        { relative_path: "product-in-use.jpg", media_type: "image/jpeg" },
      ],
    },
    creative_production: {
      creative_route: "life_problem",
      one_sentence_promise: "桌面上常用小物终于有位置。",
      emotional_arc: "忙乱到轻松",
      display_name: "收纳架",
      production_readiness: "ready",
      asset_requirements: [
        { kind: "product_detail", purpose: "细节", required: true },
        { kind: "product_in_use", purpose: "使用", required: true },
        { kind: "bgm", purpose: "配乐", required: true },
      ],
      beats: [
        { start_second: 0, end_second: 3, story_role: "hook", viewer_emotion: "着急", shot_type: "close_up", action: "找东西", product_visibility: "none", voiceover: "又找不到", on_screen_text: "又乱了", transition: "cut" },
        { start_second: 3, end_second: 6, story_role: "tension", viewer_emotion: "期待", shot_type: "wide", action: "腾位置", product_visibility: "brief", voiceover: "先腾出空间", on_screen_text: "腾个位置", transition: "match_cut" },
        { start_second: 6, end_second: 9, story_role: "demonstration", viewer_emotion: "轻松", shot_type: "pov", action: "分层放入", product_visibility: "hero", voiceover: "分层放", on_screen_text: "分层放", transition: "cut" },
        { start_second: 9, end_second: 12, story_role: "proof", viewer_emotion: "踏实", shot_type: "detail", action: "查看细节", product_visibility: "hero", voiceover: "看细节", on_screen_text: "细节", transition: "match_cut" },
        { start_second: 12, end_second: 15, story_role: "invitation", viewer_emotion: "舒展", shot_type: "wide", action: "桌面恢复", product_visibility: "hero", voiceover: "顺手就好", on_screen_text: "顺手", transition: "hold" },
      ],
      captions: [
        { start_second: 0, end_second: 3, text: "又乱了", emphasis: "punchline" },
        { start_second: 3, end_second: 6, text: "腾个位置", emphasis: "none" },
        { start_second: 6, end_second: 9, text: "分层放", emphasis: "key_word" },
        { start_second: 9, end_second: 12, text: "看细节", emphasis: "none" },
        { start_second: 12, end_second: 15, text: "顺手", emphasis: "punchline" },
      ],
      bgm_direction: "轻快、克制",
      sfx_cues: ["放入声"],
      facts_to_verify: [],
    },
    warnings: [],
    files: [],
  };
}
