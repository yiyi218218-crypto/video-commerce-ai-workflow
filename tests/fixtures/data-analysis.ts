import type {
  DataAnalysisInput,
  DataAnalysisModelOutput,
} from "../../src/schemas/data-analysis.schema.js";

export const sampleDataAnalysisInput: DataAnalysisInput = {
  video_id: "wx-video-20260723-001",
  title: "下午四点最容易乱吃，我把抽屉里的零食换成了这个",
  published_at: "2026-07-20T10:00:00.000Z",
  duration_seconds: 30,
  selected_direction_id: "direction_2",
  content_context: {
    hook: "下午四点，你是不是也会控制不住翻零食抽屉？",
    theme: "办公室下午茶替换实验",
    narrative_mode: "pain_point",
    product_appearance_second: 11,
    call_to_action: "想看配料表细节可以点商品页自己对比",
  },
  metrics: {
    views: 12_000,
    completion_rate: 0.42,
    likes: 720,
    comments: 96,
    saves: 240,
    shares: 60,
    product_clicks: 480,
    add_to_carts: 120,
    orders: 36,
    revenue: 3_564,
  },
  baseline: {
    average_views: 6_000,
    completion_rate: 0.3,
    like_rate: 0.04,
    comment_rate: 0.005,
    save_rate: 0.01,
    share_rate: 0.003,
    click_rate: 0.025,
    order_rate: 0.0015,
  },
  operator_notes: [
    "评论里多人追问配料表和甜度",
    "流量来源口径尚未接入，不能判断推荐流量占比",
  ],
};

export const sampleDataAnalysisModelOutput: DataAnalysisModelOutput = {
  performance_summary: {
    verdict: "strong",
    summary:
      "播放、完播、互动与成交率均高于账号基线，当前内容值得保留核心痛点场景并继续做单变量测试。",
    confidence: "high",
  },
  funnel_diagnosis: {
    hook: {
      status: "strong",
      evidence: [
        "播放量12000，是账号平均播放量6000的2倍",
        "完播率42%，比账号基线高12个百分点",
      ],
      interpretation:
        "办公室下午四点的具体痛点可能带来了较好的首屏相关性，但仍需通过Hook对照实验验证。",
    },
    retention: {
      status: "strong",
      evidence: ["完播率42%，账号基线为30%"],
      interpretation:
        "当前30秒结构的持续观看表现较好，可保留痛点到解决动作的主线。",
    },
    engagement: {
      status: "strong",
      evidence: [
        "点赞率6%，高于4%的账号基线",
        "收藏率2%，高于1%的账号基线",
      ],
      interpretation:
        "场景共鸣和可参考价值可能同时存在，收藏表现尤其值得保留。",
    },
    trust: {
      status: "neutral",
      evidence: ["运营备注显示多位用户追问配料表和甜度"],
      interpretation:
        "用户已有主动核实意愿，但现有数据不足以确认信任是否已经建立。",
    },
    conversion: {
      status: "strong",
      evidence: [
        "商品点击率4%，高于2.5%的账号基线",
        "每播放成交率0.3%，高于0.15%的账号基线",
      ],
      interpretation:
        "低压力查看配料的引导与成交表现相关，但不能据此单独确认因果。",
    },
  },
  success_factors: [
    "具体时间和办公室场景与目标用户痛点匹配",
    "商品在第11秒出现，没有打断开场问题",
    "查看配料表的低压力行动与内容主题一致",
  ],
  failure_factors: [
    "缺少评论语义明细，尚不能区分购买疑问与一般互动",
  ],
  hypotheses: [
    {
      hypothesis: "具体时间点Hook可能比泛化零食痛点更能提升前段留存",
      evidence: ["完播率比账号基线高12个百分点"],
      confidence: "medium",
    },
    {
      hypothesis: "配料透明方向可能同时支持收藏和商品点击",
      evidence: [
        "收藏率比基线高1个百分点",
        "商品点击率比基线高1.5个百分点",
      ],
      confidence: "medium",
    },
  ],
  next_video_plan: {
    primary_goal: "验证具体时间点Hook对完播和商品点击的贡献",
    keep: [
      "办公室下午茶的真实场景",
      "第10秒后再自然展示商品",
      "查看配料表的低压力引导",
    ],
    change: [
      "只替换前三秒Hook表达",
      "补充一帧清晰配料表近景",
    ],
    hook_direction: "保留下午四点时间锚点，用动作冲突替代直接提问",
    structure_direction:
      "维持痛点、错误选择、替换动作、配料核实、低压引导的五段结构",
    conversion_direction:
      "继续引导用户自主对比配料，并观察点击到成交的后段漏斗",
  },
  experiments: [
    {
      priority: 1,
      hypothesis: "动作冲突型Hook会比提问型Hook带来更高完播率",
      change_one_variable: "仅把前三秒从口播提问改为翻零食抽屉的动作冲突",
      control_metric: "完播率",
      success_criterion: "完播率比原视频提高至少3个百分点",
      minimum_sample: "每个版本至少1000次播放",
    },
    {
      priority: 2,
      hypothesis: "增加配料表近景可能提高商品点击率",
      change_one_variable: "仅增加一帧2秒的配料表近景",
      control_metric: "商品点击率",
      success_criterion: "商品点击率不低于4.5%，且完播率下降不超过2个百分点",
      minimum_sample: "至少2000次播放后再判断",
    },
  ],
  do_not_conclude: [
    "不能根据现有数据判断推荐流量占比",
    "不能把所有成交增长归因于单一Hook",
    "不能从追问配料表直接推断用户已经建立信任",
  ],
  optimization_brief:
    "下一轮以验证具体时间点Hook为首要目标。保留办公室下午茶场景、第10秒后商品自然出现和查看配料表的低压引导；先只把提问型Hook改成翻抽屉的动作冲突，其他结构保持一致，以完播率为主指标，每版至少1000播放。第二优先级再单独测试2秒配料表近景，观察商品点击率，同时约束完播率下降不超过2个百分点。",
};
