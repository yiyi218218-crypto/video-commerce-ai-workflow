import { describe, expect, it } from "vitest";

import { CreativeDirectorAgent } from "../../src/agents/creative-director/creative-director-agent.js";
import { PromptLoader } from "../../src/services/prompts/prompt-loader.js";
import { ScriptedLlmProvider } from "../helpers/scripted-llm-provider.js";
import { selectionInput, selectionOutput } from "../fixtures/product-selection.js";

const input = {
  profile: selectionInput.profile,
  candidate: selectionInput.candidates[0]!,
  recommendation: selectionOutput.ranking[0]!,
};

const output = {
  creative_route: "life_problem",
  one_sentence_promise: "把桌面乱象变成一个顺手可维持的小习惯。",
  emotional_arc: "烦乱 → 发现 → 松一口气 → 想照做",
  display_name: "折叠桌面收纳架",
  production_readiness: "needs_assets",
  asset_requirements: [
    { kind: "product_detail", purpose: "展示折叠结构", required: true },
    { kind: "product_in_use", purpose: "真实收纳动作", required: true },
    { kind: "voiceover", purpose: "口语旁白", required: true },
    { kind: "bgm", purpose: "轻快节奏床", required: true },
    { kind: "sfx", purpose: "收纳落位声", required: true },
  ],
  beats: [
    { start_second: 0, end_second: 3, story_role: "hook", viewer_emotion: "共鸣", shot_type: "overhead", action: "俯拍散乱桌面，手停在找东西的动作上", product_visibility: "none", voiceover: "桌面越收越乱，问题可能不在东西多。", on_screen_text: "越收越乱？", transition: "cut" },
    { start_second: 3, end_second: 6, story_role: "tension", viewer_emotion: "好奇", shot_type: "pov", action: "把零散小物按使用顺序排开", product_visibility: "brief", voiceover: "我先把每天拿的东西，按顺手程度排了一遍。", on_screen_text: "先看顺手", transition: "match_cut" },
    { start_second: 6, end_second: 9, story_role: "demonstration", viewer_emotion: "舒展", shot_type: "close_up", action: "展开收纳架并放入三件小物", product_visibility: "hero", voiceover: "能分层放，桌面一下就有了位置。", on_screen_text: "分层放好", transition: "cut" },
    { start_second: 9, end_second: 12, story_role: "proof", viewer_emotion: "信任", shot_type: "detail", action: "给出折叠结构和尺寸细节特写", product_visibility: "hero", voiceover: "具体尺寸和承重，还是下单前再核对。", on_screen_text: "参数先核对", transition: "hold" },
    { start_second: 12, end_second: 15, story_role: "invitation", viewer_emotion: "行动", shot_type: "wide", action: "拉远展示恢复整洁后的桌面", product_visibility: "brief", voiceover: "你的桌面如果也这样乱，先看看它合不合适。", on_screen_text: "适合再选", transition: "flash" },
  ],
  captions: [
    { start_second: 0, end_second: 3, text: "越收越乱？", emphasis: "punchline" },
    { start_second: 3, end_second: 6, text: "先看顺手", emphasis: "key_word" },
    { start_second: 6, end_second: 9, text: "分层放好", emphasis: "key_word" },
    { start_second: 9, end_second: 12, text: "参数先核对", emphasis: "none" },
    { start_second: 12, end_second: 15, text: "适合再选", emphasis: "punchline" },
  ],
  bgm_direction: "95 BPM 轻快木吉他与轻打击，旁白出现时降低音量。",
  sfx_cues: ["3 秒轻提示音", "6 秒物品落位声"],
  facts_to_verify: ["实时库存", "尺寸与承重"],
};

describe("CreativeDirectorAgent", () => {
  it("requires a five-beat, non-product-first production brief", async () => {
    const provider = new ScriptedLlmProvider([output]);
    const agent = new CreativeDirectorAgent(provider, new PromptLoader());

    await expect(agent.run(input)).resolves.toMatchObject({
      creative_route: "life_problem",
      production_readiness: "needs_assets",
    });
  });

  it("keeps a requested creative route instead of silently changing it", async () => {
    const provider = new ScriptedLlmProvider([output]);
    const agent = new CreativeDirectorAgent(provider, new PromptLoader());

    await expect(
      agent.run({ ...input, route_hint: "real_test" }),
    ).rejects.toThrow("creative route must match");
  });
});
