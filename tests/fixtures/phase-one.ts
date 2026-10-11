import type {
  ContentAgentOutput,
  ContentDirection,
} from "../../src/schemas/content-agent.schema.js";
import type {
  ProductAgentInput,
  ProductAgentOutput,
} from "../../src/schemas/product-agent.schema.js";

export const sampleProductInput: ProductAgentInput = {
  product_name: "低糖燕麦坚果脆",
  category: "food",
  price: {
    amount: 39.9,
    currency: "CNY",
  },
  target_users: ["控制零食糖分的上班族", "需要方便早餐的年轻家庭"],
  description: "即食燕麦、巴旦木和南瓜籽混合烘焙，每袋400克。",
  specifications: {
    净含量: "400克",
  },
  product_facts: ["配料表未添加蔗糖", "开袋即食或搭配牛奶"],
  competitors: [],
  sales_constraints: ["未添加蔗糖不等于无糖", "不得宣称减肥效果"],
};

export const sampleProductOutput: ProductAgentOutput = {
  market_positioning: {
    statement: "面向忙碌上班族的便携早餐与日常零食选择",
    price_band: "mass",
    category_opportunity: "用真实早餐场景解释方便性和配料信息",
    recommended_sales_angle: "三分钟完成有口感层次的办公室早餐",
  },
  audience_profiles: [
    {
      segment: "工作日早晨时间紧张的上班族",
      characteristics: ["早餐时间短", "会阅读配料表"],
      usage_scenarios: ["到办公室后搭配牛奶", "下午会议前少量加餐"],
      pain_points: ["来不及准备早餐", "普通零食口味过甜"],
      purchase_motivations: ["方便", "口感丰富", "配料信息明确"],
    },
  ],
  core_purchase_motivations: ["节省早餐准备时间", "减少甜腻感", "方便携带"],
  selling_points: [
    {
      statement: "开袋即可搭配牛奶作为快捷早餐",
      customer_value: "减少早晨准备步骤",
      basis: "输入明确提供开袋即食或搭配牛奶",
      evidence_status: "provided_fact",
    },
    {
      statement: "燕麦、巴旦木和南瓜籽带来多种口感",
      customer_value: "比单一燕麦更有咀嚼层次",
      basis: "商品描述提供三种主要原料",
      evidence_status: "provided_fact",
    },
    {
      statement: "配料表未添加蔗糖",
      customer_value: "便于关注添加糖信息的用户做选择",
      basis: "输入明确提供该配料事实，但不等于无糖",
      evidence_status: "provided_fact",
    },
  ],
  differentiators: [
    {
      compared_with: "普通甜味燕麦零食",
      advantage: "更适合强调配料透明和早餐搭配",
      valid_when: "商品配料表和包装信息与输入一致",
    },
  ],
  sales_risks: [
    {
      reason: "消费者可能把未添加蔗糖理解为无糖",
      impact: "造成错误健康预期和信任损失",
      mitigation: "内容中明确说明未添加蔗糖不等于无糖",
    },
  ],
  unsuitable_reasons: [],
  missing_information: ["每份营养成分数据", "坚果过敏原提示", "独立小包装数量"],
  confidence: {
    level: "medium",
    rationale: "商品场景和配料事实明确，但营养与包装细节仍不完整",
  },
};

const directionSeeds = [
  {
    direction_id: "direction_1",
    theme: "迟到前的三分钟早餐",
    narrative_mode: "story",
    emotion: "忙乱后的松一口气",
  },
  {
    direction_id: "direction_2",
    theme: "未添加蔗糖到底是什么意思",
    narrative_mode: "conflict",
    emotion: "澄清误区后的安心",
  },
  {
    direction_id: "direction_3",
    theme: "下午四点最容易乱吃什么",
    narrative_mode: "pain_point",
    emotion: "被理解后的轻松",
  },
  {
    direction_id: "direction_4",
    theme: "办公室抽屉里的早餐安全感",
    narrative_mode: "identity",
    emotion: "上班族身份认同",
  },
  {
    direction_id: "direction_5",
    theme: "给忙碌家人的一袋早餐",
    narrative_mode: "emotional_value",
    emotion: "日常照顾带来的温暖",
  },
] as const;

function makeDirection(
  seed: (typeof directionSeeds)[number],
  index: number,
): ContentDirection {
  const ordinal = index + 1;
  return {
    direction_id: seed.direction_id,
    theme: seed.theme,
    narrative_mode: seed.narrative_mode,
    titles: [
      `${seed.theme}，我只做了这一步`,
      `第${ordinal}种早餐场景，很多上班族都经历过`,
      `别急着讲自律，先解决${seed.theme}`,
    ],
    hooks: [
      `还有五分钟打卡，你早餐呢？`,
      `我以前也总在这个时候乱吃。`,
      `先别把“未添加”看成“无糖”。`,
    ].map((hook, hookIndex) => `${hook}${ordinal}-${hookIndex + 1}`),
    emotion_direction: seed.emotion,
    identity_resonance: "让忙碌但仍想认真吃早餐的人感到被理解",
    core_conflict: "准备时间不足与想吃得更有选择之间的冲突",
    content_structure: [
      {
        stage: "hook",
        purpose: "用具体时间压力留住观众",
        content: `展示第${ordinal}个真实早餐困境`,
      },
      {
        stage: "context",
        purpose: "建立上班族日常场景",
        content: "镜头切到工位、牛奶和空着的早餐袋",
      },
      {
        stage: "conflict",
        purpose: "说出临时买甜食的困扰",
        content: "对比赶时间和不想吃得太甜的矛盾",
      },
      {
        stage: "product",
        purpose: "自然展示解决动作",
        content: "把燕麦坚果脆倒进牛奶，展示实际用法",
      },
      {
        stage: "conversion",
        purpose: "提供低压力下一步",
        content: "邀请观众先查看配料和份量是否符合自己需求",
      },
    ],
    product_integration: {
      timing: index % 2 === 0 ? "middle" : "late",
      method: "在解决早餐准备问题的动作中倒入牛奶并展示颗粒",
    },
    conversion_cta: "想省早餐准备时间，可以先看看配料和份量再决定",
    why_it_can_work: "具体时间压力容易引发共鸣，商品以解决动作出现",
    risk_notes: ["必须说明未添加蔗糖不等于无糖"],
  };
}

export const sampleContentOutput: ContentAgentOutput = {
  directions: directionSeeds.map(makeDirection),
  selection_guide: {
    recommended_direction_ids: ["direction_1", "direction_2"],
    decision_rule: "优先测试真实早餐故事，再用误区澄清建立商品信任",
  },
};
