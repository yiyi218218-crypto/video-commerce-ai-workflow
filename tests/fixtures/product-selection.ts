import type {
  ProductSelectionAgentInput,
  ProductSelectionAgentOutput,
  SelectionBatch,
  SelectionCandidate,
  SelectionRecommendation,
} from "../../src/schemas/product-selection.schema.js";

export const selectionCandidates: SelectionCandidate[] = [
  {
    candidate_id: "3ce9cc80-175f-4428-9618-5693d30a27cb",
    product_name: "便携折叠桌面收纳架",
    raw_text:
      "便携折叠桌面收纳架\n到手价 ¥39.9\n佣金率 20%\n已售 1.2万\n简居生活店",
    source_url:
      "https://store.weixin.qq.com/talent/product/desk-organizer",
    image_url: "https://img.mmecimage.cn/product/desk-organizer.png",
    price_amount: 39.9,
    commission_rate: 20,
    sold_count: 12_000,
    rating: 4.8,
    shop_name: "简居生活店",
  },
  {
    candidate_id: "b44cb933-a359-4e39-b6a8-4f2da23f8847",
    product_name: "草本快速瘦身贴",
    raw_text:
      "草本快速瘦身贴\n七天快速见效\n到手价 ¥69\n佣金率 45%",
    source_url:
      "https://store.weixin.qq.com/talent/product/slimming-patch",
    image_url: "https://img.mmecimage.cn/product/slimming-patch.png",
    price_amount: 69,
    commission_rate: 45,
  },
];

export const selectionInput: ProductSelectionAgentInput = {
  profile: {
    channel_name: "测试视频号",
    target_audiences: ["关注实用好物的上班族"],
    preferred_categories: ["家居"],
    excluded_keywords: ["医疗功效", "快速瘦身"],
    content_strengths: ["真实使用场景", "手机自然拍摄"],
    minimum_commission_rate: 10,
    price_range: {
      minimum: 20,
      maximum: 100,
    },
  },
  candidates: selectionCandidates,
};

function recommendation(
  candidate: SelectionCandidate,
  scores: [number, number, number, number, number],
  level: SelectionRecommendation["recommendation_level"],
  riskFlags: string[],
): SelectionRecommendation {
  const dimensions = {
    account_fit: scores[0],
    demand_evidence: scores[1],
    commission_value: scores[2],
    content_potential: scores[3],
    trust_and_safety: scores[4],
  };
  return {
    candidate_id: candidate.candidate_id,
    product_name: candidate.product_name,
    overall_score: scores.reduce((sum, score) => sum + score, 0),
    dimensions,
    recommendation_level: level,
    reasons: [
      "商品与实用家居内容定位一致",
      "收纳前后对比具备直接演示空间",
      "页面提供价格、佣金和销量，可先小规模测试",
    ],
    risk_flags: riskFlags,
    facts_to_verify: ["实时库存", "退货率", "折叠承重参数"],
    video_plan: {
      duration_seconds: 15,
      hook: "桌面总是越收越乱，可能少了这一步",
      voiceover:
        "桌面总是越收越乱，我试着把零散小物分层放。这个折叠收纳架页面信息看起来适合先做一次真实场景测试，参数下单前再核对。",
      cards: [
        {
          start_second: 0,
          end_second: 3,
          headline: "桌面越收越乱？",
          subline: "先看真正占位置的是什么",
          visual_treatment: "pain_point",
        },
        {
          start_second: 3,
          end_second: 7,
          headline: "把小物分层放",
          subline: "商品在真实收纳动作中出现",
          visual_treatment: "product_reveal",
        },
        {
          start_second: 7,
          end_second: 12,
          headline: "只说页面可核对信息",
          subline: "价格、佣金、参数发布前再确认",
          visual_treatment: "proof_focus",
        },
        {
          start_second: 12,
          end_second: 15,
          headline: "先看是否适合你的桌面",
          subline: "需要的话再打开商品详情",
          visual_treatment: "call_to_action",
        },
      ],
      call_to_action: "先核对尺寸和承重，再决定是否加入橱窗。",
    },
  };
}

export const selectionOutput: ProductSelectionAgentOutput = {
  top_pick_id: selectionCandidates[0]!.candidate_id,
  ranking: [
    recommendation(
      selectionCandidates[0]!,
      [18, 17, 15, 19, 16],
      "priority_test",
      [],
    ),
    recommendation(
      selectionCandidates[1]!,
      [2, 3, 18, 5, 0],
      "reject",
      ["页面含快速瘦身功效表达", "命中账号排除关键词"],
    ),
  ],
  portfolio_advice:
    "先测试收纳架的真实桌面对比，不要因为高佣金选择功效风险商品。",
  data_limitations: ["页面未提供退货率与实时库存"],
};

export const analyzedSelectionBatch: SelectionBatch = {
  id: "e578b4aa-89af-45a7-95db-96e9f17eb8fd",
  status: "analyzed",
  source_page_url: "https://store.weixin.qq.com/talent/selection",
  captured_at: "2026-07-23T09:00:00.000Z",
  candidates: selectionCandidates,
  analysis_profile: selectionInput.profile,
  analysis: selectionOutput,
  created_at: "2026-07-23T09:00:00.000Z",
  updated_at: "2026-07-23T09:01:00.000Z",
  completed_at: "2026-07-23T09:01:00.000Z",
};
