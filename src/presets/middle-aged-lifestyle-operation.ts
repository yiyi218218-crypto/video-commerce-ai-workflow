import type { AccountOperationProfile } from "../schemas/account-operation.schema.js";

export const middleAgedLifestyleOperationProfile = {
  account_name: "暖心居家日常",
  account_stage: "new_account",
  primary_vertical: "50+家庭生活与实用好物",
  target_audiences: [
    "注重居家便利、家庭采购与日常品质的50+女性",
    "为父母和家庭挑选实用生活用品的子女",
  ],
  profile_style: "real_person_life",
  profile_bio_theme: "真实居家场景里的实用选择与生活小经验",
  avoided_profile_words: ["创业", "带货", "暴富", "躺赚", "全网最低"],
  launch_cadence: {
    daily_video_target: 3,
    minimum_gap_hours: 2,
    publish_windows: [
      {
        id: "early_morning",
        time_range: "04:00–07:00",
        audience_context: "早起与家庭晨间准备时段，作为待验证窗口",
        status: "test_window",
      },
      {
        id: "midday",
        time_range: "11:00–13:00",
        audience_context: "午间休息与饭后浏览时段，作为待验证窗口",
        status: "test_window",
      },
      {
        id: "evening",
        time_range: "19:00–20:30",
        audience_context: "晚饭后轻内容浏览时段，作为待验证窗口",
        status: "test_window",
      },
    ],
  },
  visual_system: {
    product_demo_ratio: "9:16",
    story_or_knowledge_ratio: "16:9",
    cover_ratio: "3:4",
    color_direction: "暖红、米黄与居家暖色；信息清晰，不做廉价促销堆叠",
    cover_rules: [
      "真实生活场景或明确商品使用动作，不用素材拼贴封面",
      "一句大字标题，只保留一个具体生活问题",
      "封面文字、画面和正文承诺必须可核对且一致",
    ],
    audio_direction: "轻音乐或舒缓节奏；口播优先自然生活化表达，避免播音腔与硬催单",
  },
  product_research: {
    live_room_signal_policy:
      "只使用已采集且可复核的直播时长、场观、转化和售后数据；缺失任一项只标记为待验证，不推断爆品。",
    trend_reference_policy:
      "允许分析公开内容的选题、镜头节奏和评论痛点；禁止下载、剪接、搬运或近似复刻他人视频、文案与配音。",
    seasonality_policy:
      "以已验证的节气、节日、换季和家庭采购需求建立选题日历；每个季节性判断都应标注数据或来源。",
  },
  matrix_roles: [
    {
      account_role: "主号：暖心居家日常",
      content_boundary: "真实家庭生活、实用好物选择和日常习惯，不把所有品类混成商品橱窗。",
      differentiation_rule: "主号只做完整故事与信任沉淀，每条内容使用独立场景和独立表达。",
    },
    {
      account_role: "副号：居家收纳与清洁",
      content_boundary: "收纳、清洁、纸品和厨房工具的具体使用场景。",
      differentiation_rule: "与主号不复用同一脚本、镜头、封面或同日素材，只共享经核验的商品事实。",
    },
    {
      account_role: "副号：家庭餐桌与节日准备",
      content_boundary: "食品、餐桌便利与节日家庭准备。",
      differentiation_rule: "以菜谱、准备清单和家庭关系场景区分，不将主号内容简单改标题重发。",
    },
  ],
  originality_rules: [
    "每条视频必须有独立脚本、独立镜头组合和可追溯素材来源。",
    "外部爆款仅用于拆解问题、结构和受众情绪，成片必须使用原创表达与合法素材。",
    "不购买粉丝、不刷量、不伪造成交、评论、库存或转化数据。",
    "医疗、保健、食品和美妆类目只表达可核验事实，不把体验上升为功效或治疗承诺。",
  ],
} satisfies AccountOperationProfile;
