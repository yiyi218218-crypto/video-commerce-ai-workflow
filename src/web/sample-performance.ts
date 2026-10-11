import type { DataAnalysisInput } from "../schemas/data-analysis.schema.js";

export const samplePerformanceInput: DataAnalysisInput = {
  video_id: "wx-video-demo-001",
  title: "下午四点最容易乱吃，我把抽屉里的零食换成了这个",
  duration_seconds: 30,
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
