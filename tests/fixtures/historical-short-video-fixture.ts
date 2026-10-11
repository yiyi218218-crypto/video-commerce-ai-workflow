import type {
  HistoricalShortVideoInput,
  HistoricalShortVideoOutput,
} from "../../src/schemas/historical-short-video-agent.schema.js";

export const sampleHistoricalShortVideoInput: HistoricalShortVideoInput = {
  topic: "杯酒释兵权",
  lane: "historical_anecdote",
  duration_seconds: 60,
  target_audience: ["历史兴趣用户", "谋略内容受众"],
  account: {
    display_name: "星轨潮汐.",
    positioning: "历史典故、谋略和人文解说内容号",
  },
  style: {
    narrator_voice: "male_mandarin_documentary",
    subtitle_mode: "sentence_chunks",
    visual_style: "电影感历史短剧，低饱和，克制镜头运动",
  },
  must_avoid: ["硬广", "逐字字幕", "重复图片", "地图动效杂乱"],
};

export const sampleHistoricalShortVideoOutput: HistoricalShortVideoOutput = {
  topic: "杯酒释兵权",
  lane: "historical_anecdote",
  duration_seconds: 60,
  short_title: "杯酒释兵权真相",
  cold_open: "一杯酒，真能让开国将领交出兵权吗？",
  one_sentence_promise:
    "用一场饭局看懂宋太祖如何把开国功臣的兵权收回中央。",
  core_conflict:
    "陈桥黄袍之后，赵匡胤真正担心的是将领手里仍握着足以复制政变的军权。",
  strategic_takeaway:
    "高明的权力调整不是当场翻脸，而是把风险、体面和退路同时摆到桌上。",
  uncertainty_notes: [
    "杯酒释兵权是后世总结性说法，饭局细节应作为常见叙事而非现场实录呈现。",
  ],
  sources_to_check: [
    {
      source_name: "续资治通鉴长编",
      claim_to_check: "赵匡胤与石守信等宿将解除兵权的相关记载。",
      use_in_video: "direct_basis",
    },
    {
      source_name: "宋史纪事本末",
      claim_to_check: "宋初削弱藩镇和禁军将领权力的叙事背景。",
      use_in_video: "context",
    },
    {
      source_name: "宋史",
      claim_to_check: "石守信、王审琦等人的官职和后续安排。",
      use_in_video: "interpretation_guard",
    },
  ],
  narration: {
    voice_profile: "male_mandarin_documentary",
    tone: "冷静、低压、纪录片式男声，不催促，不销售。",
    full_script:
      "一杯酒，真能让开国将领交出兵权吗？陈桥黄袍之后，赵匡胤最怕的不是外敌，而是兵权太重。如果陈桥那一幕可以发生一次，就可能发生第二次。常见说法里，赵普把问题压成四个字：兵权太重。饭局上，皇帝没有拔刀，只是把风险摆出来。酒到半酣，他说自己睡不安稳。将领听懂了这句话背后的意思。第二天，兵权交出，富贵留下。它更像一场不流血的交易。用体面换权力，用退路换稳定。",
  },
  storyboard: [
    {
      scene_id: "s01-palace-pressure",
      start_second: 0,
      end_second: 10,
      story_role: "hook",
      scene_title: "一杯酒的问题",
      narration: "一杯酒，真能让开国将领交出兵权吗？",
      caption: "一杯酒，真能交出兵权吗？",
      visual_prompt:
        "北宋宫殿夜色，烛光压低，赵匡胤坐在案前，远处武将剪影，电影感历史短剧画面",
      camera_motion: "slow_push_in",
      on_screen_detail: "宋太祖｜建隆年间",
      sfx: "低沉鼓点进入",
    },
    {
      scene_id: "s02-chenqiao-shadow",
      start_second: 10,
      end_second: 20,
      story_role: "setup",
      scene_title: "陈桥之后",
      narration: "陈桥黄袍之后，他最怕的不是外敌，而是兵权太重。",
      caption: "他怕的不是外敌，是兵权太重。",
      visual_prompt:
        "黄袍与军旗的暗影叠化，城楼远景，士兵火把排列，表现陈桥兵变后的政治阴影",
      camera_motion: "parallax_drift",
      on_screen_detail: "陈桥之后",
      sfx: "远处军鼓一声",
    },
    {
      scene_id: "s03-banquet-table",
      start_second: 20,
      end_second: 30,
      story_role: "conflict",
      scene_title: "饭局开场",
      narration: "如果那一幕可以发生一次，就可能发生第二次。",
      caption: "能发生一次，就可能发生第二次。",
      visual_prompt:
        "宋代宴席长桌，皇帝与宿将分坐两侧，酒杯、烛火、甲胄细节，气氛压抑克制",
      camera_motion: "locked_off",
      on_screen_detail: "饭局不是闲聊",
      sfx: "酒杯轻碰",
    },
    {
      scene_id: "s04-cup-reflection",
      start_second: 30,
      end_second: 40,
      story_role: "turning_point",
      scene_title: "话说半句",
      narration: "酒到半酣，皇帝说自己睡不安稳。将领听懂了。",
      caption: "一句睡不安稳，所有人都听懂了。",
      visual_prompt:
        "酒杯近景倒映宫灯与人影，桌面安静，武将手指停在杯沿，压迫感强的细节镜头",
      camera_motion: "detail_reveal",
      on_screen_detail: "常见说法：睡不安稳",
      sfx: "环境声突然收窄",
    },
    {
      scene_id: "s05-seals-returned",
      start_second: 40,
      end_second: 50,
      story_role: "interpretation",
      scene_title: "兵权交出",
      narration: "第二天，兵权交出，富贵留下。",
      caption: "兵权交出，富贵留下。",
      visual_prompt:
        "清晨殿前，兵符和印信放在托盘上，几位老将背影离开，金色晨光但气氛冷静",
      camera_motion: "slow_pan",
      on_screen_detail: "兵权与体面交换",
      sfx: "印信落盘",
    },
    {
      scene_id: "s06-empty-throne",
      start_second: 50,
      end_second: 60,
      story_role: "takeaway",
      scene_title: "真正的交易",
      narration: "它更像一场不流血的交易，用退路换稳定。",
      caption: "用退路换稳定。",
      visual_prompt:
        "空置的宋代大殿，王座、帘幕和远处天光，象征中央集权完成，克制电影感结尾",
      camera_motion: "slow_push_in",
      on_screen_detail: "权力最怕没有退路",
      sfx: "低音渐弱",
    },
  ],
  subtitle_plan: [
    { start_second: 0, end_second: 10, text: "一杯酒，真能交出兵权吗？" },
    { start_second: 10, end_second: 20, text: "他怕的不是外敌，是兵权太重。" },
    { start_second: 20, end_second: 30, text: "能发生一次，就可能发生第二次。" },
    { start_second: 30, end_second: 40, text: "一句睡不安稳，所有人都听懂了。" },
    { start_second: 40, end_second: 50, text: "兵权交出，富贵留下。" },
    { start_second: 50, end_second: 60, text: "用退路换稳定。" },
  ],
  audio_plan: {
    bgm_direction: "低频历史悬疑氛围，音量压在男声下方，不使用急促鼓点。",
    voice_mix: "男声居中，语速中等，保留呼吸感，BGM 自动压低。",
    sfx_cues: ["低沉鼓点进入", "远处军鼓一声", "酒杯轻碰", "印信落盘"],
  },
  render_plan: {
    format: "vertical_9_16",
    target_resolution: "1080x1920",
    engine: "hyperframes",
    quality_gates: [
      "输出必须是 9:16 1080x1920。",
      "六个画面素材不得重复。",
      "字幕必须是整句分段，不做逐字动画。",
      "配音、BGM 和音效需要混音检查。",
      "画面为 AI 辅助创作时，发布文案必须说明 AI。",
    ],
  },
  publish_copy: {
    description:
      "一杯酒，真能让开国将领交出兵权吗？陈桥黄袍之后，赵匡胤最怕的不是外敌，而是兵权太重。石守信等宿将交出军权的故事，后世称为“杯酒释兵权”。画面为 AI 辅助创作，争议细节以解释性口径呈现。",
    hashtags: ["#历史", "#宋朝", "#赵匡胤", "#杯酒释兵权"],
  },
};
