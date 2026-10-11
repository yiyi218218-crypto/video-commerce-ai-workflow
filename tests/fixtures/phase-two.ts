import type {
  LiveAgentOutput,
  LiveContext,
} from "../../src/schemas/live-agent.schema.js";
import type {
  ScriptAgentInput,
  ScriptAgentOutput,
  ScriptVersion,
} from "../../src/schemas/script-agent.schema.js";

export const sampleProductionContext: ScriptAgentInput["production_context"] = {
  on_camera_people: ["单人女主播"],
  available_locations: ["办公室工位", "家庭餐桌"],
  shooting_style: "phone_natural",
  prohibited_claims: ["无糖", "减肥", "治疗"],
};

export const sampleLiveContext: LiveContext = {
  live_duration_minutes: 90,
  host_style: "真实、有耐心、不过度催单",
  team_size: 2,
  inventory_quantity: 300,
  confirmed_offers: [
    {
      name: "直播组合价",
      details: "两袋69元",
      deadline: "仅本场直播有效",
    },
  ],
  confirmed_proof_points: [
    "配料表未添加蔗糖",
    "每袋净含量400克",
  ],
  prohibited_claims: ["无糖", "减肥", "养生治疗"],
};

function makeShot(
  start: number,
  end: number,
  label: string,
): ScriptVersion["shots"][number] {
  return {
    start_second: start,
    end_second: end,
    visual: `${label}的真实工位画面`,
    character: "单人女主播",
    action: `${label}时拿起早餐杯完成一个自然动作`,
    dialogue: `${label}，早上来不及的时候，我先解决能不能方便吃。`,
    product_display: "在早餐动作中短暂展示燕麦颗粒和包装信息",
    audio_cue: "保留环境声，台词出现时轻微降低背景音乐",
  };
}

function makeScriptVersion(
  duration: 15 | 30 | 60,
  ranges: Array<[number, number, string]>,
): ScriptVersion {
  return {
    duration_seconds: duration,
    hook: "还有五分钟打卡，你早餐呢？",
    scene: "早高峰后的办公室工位",
    character_setup: "一个经常来不及准备早餐的普通上班族",
    shots: ranges.map(([start, end, label]) =>
      makeShot(start, end, label),
    ),
    product_showcase: "倒入牛奶时展示颗粒，随后给配料表一个可读近景",
    closing_cta: "想省准备时间，可以先看看配料和份量再决定",
    performance_notes: [
      "语速像在和同事分享，不要播音腔",
      "商品包装只在使用动作和配料说明时出现",
    ],
    fact_check: {
      claims_used: [
        {
          claim: "可以开袋即食或搭配牛奶",
          basis: "商品输入明确提供食用方式",
          evidence_status: "provided_fact",
        },
        {
          claim: "配料表未添加蔗糖，但不等于无糖",
          basis: "商品事实和销售限制均明确提供",
          evidence_status: "provided_fact",
        },
      ],
      risk_notes: ["不得把未添加蔗糖改写为无糖", "不得暗示减肥效果"],
    },
  };
}

export const sampleScriptOutput: ScriptAgentOutput = {
  selected_direction_id: "direction_1",
  creative_rationale: "用打卡前的时间压力建立共鸣，再通过早餐动作自然展示商品",
  scripts: {
    fifteen_seconds: makeScriptVersion(15, [
      [0, 3, "看时间"],
      [3, 8, "打开抽屉"],
      [8, 12, "倒入牛奶"],
      [12, 15, "查看配料"],
    ]) as ScriptAgentOutput["scripts"]["fifteen_seconds"],
    thirty_seconds: makeScriptVersion(30, [
      [0, 3, "打卡倒计时"],
      [3, 8, "回忆空腹开会"],
      [8, 15, "拿出早餐杯"],
      [15, 22, "倒入并展示颗粒"],
      [22, 27, "澄清添加糖信息"],
      [27, 30, "给出选择建议"],
    ]) as ScriptAgentOutput["scripts"]["thirty_seconds"],
    sixty_seconds: makeScriptVersion(60, [
      [0, 3, "打卡倒计时"],
      [3, 10, "讲述早高峰"],
      [10, 18, "说明以前乱买甜食"],
      [18, 28, "展示准备过程"],
      [28, 38, "展示颗粒和口感"],
      [38, 48, "说明配料边界"],
      [48, 55, "回应是否无糖"],
      [55, 60, "给出选择建议"],
    ]) as ScriptAgentOutput["scripts"]["sixty_seconds"],
  },
};

export const sampleLiveOutput: LiveAgentOutput = {
  selected_direction_id: "direction_1",
  facts_boundary: {
    confirmed_facts_used: [
      "配料表未添加蔗糖",
      "每袋净含量400克",
      "两袋69元且仅本场直播有效",
    ],
    missing_facts_that_limit_sales: [
      "尚未提供每份营养成分数据",
      "尚未提供坚果过敏原展示位置",
    ],
  },
  opening_five_minutes: [
    {
      minute: 1,
      objective: "让忙碌上班族知道本场解决什么问题",
      host_script: "如果你早上总是来不及吃东西，今天先把三分钟早餐讲明白。",
      interaction: "评论区打一个你通常几点吃早餐。",
      product_action: "商品先放在桌面侧边，不立即报价格。",
    },
    {
      minute: 2,
      objective: "收集用户真实早餐场景",
      host_script: "有人在家吃，有人到工位才想起来，做法其实不一样。",
      interaction: "问大家更常在家吃还是到公司吃。",
      product_action: "展示可搭配的杯子和牛奶。",
    },
    {
      minute: 3,
      objective: "建立时间冲突",
      host_script: "最难的不是不知道早餐重要，是早上真的没有十分钟。",
      interaction: "邀请观众说出最赶的一次早餐经历。",
      product_action: "演示从抽屉取出商品的动作。",
    },
    {
      minute: 4,
      objective: "自然进入商品演示",
      host_script: "我现场做一遍，不剪镜头，看需要几步。",
      interaction: "让观众一起数操作步骤。",
      product_action: "倒出燕麦坚果脆并加入牛奶。",
    },
    {
      minute: 5,
      objective: "说明事实边界并预告后续",
      host_script: "这里写的是未添加蔗糖，不是无糖，后面我把配料和份量都放近看。",
      interaction: "询问观众最关心配料、口感还是份量。",
      product_action: "把配料表和净含量对准镜头。",
    },
  ],
  run_of_show: [
    {
      phase: "welcome",
      duration_minutes: 5,
      objective: "建立直播主题和真实场景",
      host_actions: ["完成五分钟开场", "收集早餐时间"],
    },
    {
      phase: "warmup",
      duration_minutes: 10,
      objective: "识别不同早餐需求",
      host_actions: ["讨论家庭和办公室场景", "记录高频问题"],
    },
    {
      phase: "product_story",
      duration_minutes: 15,
      objective: "从时间痛点进入商品",
      host_actions: ["讲述工位早餐故事", "说明适合与不适合人群"],
    },
    {
      phase: "demonstration",
      duration_minutes: 15,
      objective: "完成真实使用演示",
      host_actions: ["搭配牛奶", "展示颗粒和包装信息"],
    },
    {
      phase: "interaction",
      duration_minutes: 10,
      objective: "集中回答配料和口感问题",
      host_actions: ["回答评论", "重复事实边界"],
    },
    {
      phase: "offer",
      duration_minutes: 10,
      objective: "清楚说明已确认优惠",
      host_actions: ["说明两袋69元", "说明仅本场有效"],
    },
    {
      phase: "order_guidance",
      duration_minutes: 10,
      objective: "帮助适合的用户完成选择",
      host_actions: ["复述规格", "说明下单前核对内容"],
    },
    {
      phase: "recap",
      duration_minutes: 15,
      objective: "总结并完成最后答疑",
      host_actions: ["总结适用场景", "记录未解决问题"],
    },
  ],
  retention_scripts: [
    {
      trigger: "新观众进入",
      script: "刚进来的朋友先别急着看价格，我们正在现场做三分钟早餐。",
      next_action: "继续完成当前演示，不中断节奏。",
    },
    {
      trigger: "在线人数下降",
      script: "接下来把大家最容易误解的未添加蔗糖讲清楚。",
      next_action: "切换到配料表近景。",
    },
    {
      trigger: "配料问题集中出现",
      script: "这个问题值得停一下，我们只按包装明确的信息回答。",
      next_action: "逐条读已确认事实。",
    },
    {
      trigger: "观众询问是否适合自己",
      script: "先说你的早餐场景和在意点，我不替你做统一结论。",
      next_action: "按场景回答并说明边界。",
    },
  ],
  product_presentation: {
    problem_entry: "工作日早餐准备时间不足，临时选择又容易过甜",
    scenario_story: "主播以打卡前在工位准备早餐的真实动作展开",
    demonstration_steps: [
      "从抽屉取出商品和早餐杯",
      "倒出一次实际食用量",
      "加入牛奶并展示颗粒",
      "给配料表和净含量近景",
    ],
    proof_points: ["配料表未添加蔗糖", "每袋净含量400克"],
    limitation_disclosure: "未添加蔗糖不等于无糖，营养成分仍需以包装为准",
  },
  interaction_questions: [
    {
      question: "你通常在家吃早餐还是到公司吃？",
      purpose: "识别主要使用场景",
      follow_up: "按场景演示不同准备方式",
    },
    {
      question: "你更在意配料、口感还是方便？",
      purpose: "判断用户购买动机",
      follow_up: "优先解释评论最多的维度",
    },
    {
      question: "你早餐最多能留几分钟？",
      purpose: "建立时间痛点",
      follow_up: "匹配三分钟演示",
    },
    {
      question: "你喜欢干吃还是搭配牛奶？",
      purpose: "了解食用偏好",
      follow_up: "展示对应吃法",
    },
    {
      question: "你会先看配料表还是营养成分表？",
      purpose: "引导理性决策",
      follow_up: "说明当前已确认和缺失信息",
    },
    {
      question: "你是自己吃还是给家里人准备？",
      purpose: "识别购买角色",
      follow_up: "调整场景表达而不改变事实",
    },
  ],
  objection_handling: [
    {
      objection: "未添加蔗糖是不是无糖？",
      response: "不是，这两个概念不能画等号，具体以包装营养信息为准。",
      boundary: "不宣称无糖。",
    },
    {
      objection: "吃这个能减肥吗？",
      response: "我们不做减肥承诺，它只是一个方便的早餐或零食选择。",
      boundary: "不提供体重结果或治疗建议。",
    },
    {
      objection: "会不会太甜？",
      response: "甜度感受很主观，只能展示配料和主播现场口感描述。",
      boundary: "不把个人感受说成所有人的结论。",
    },
    {
      objection: "值不值得买？",
      response: "先看你是否需要方便早餐，再核对份量、配料和组合价格。",
      boundary: "不替用户做绝对价值判断。",
    },
  ],
  urgency_scripts: [
    {
      basis: "confirmed_offer_deadline",
      script: "两袋69元是本场已确认的组合价，需要的话在本场结束前核对下单。",
      use_condition: "仅在已确认本场优惠仍有效时使用。",
    },
    {
      basis: "confirmed_inventory",
      script: "当前确认库存是300份，库存变化以后台实时信息为准。",
      use_condition: "主播能够看到并确认实时库存时使用。",
    },
    {
      basis: "decision_support",
      script: "不确定就先别急，先核对配料、份量和你的早餐场景。",
      use_condition: "任何时候都可用于降低决策压力。",
    },
  ],
  offer_plan: {
    confirmed_offers: [
      {
        name: "直播组合价",
        details: "两袋69元",
        deadline: "仅本场直播有效",
      },
    ],
    recommendations: [
      {
        idea: "增加单袋试吃装选择",
        rationale: "降低第一次购买的决策成本",
        requires_confirmation: true,
      },
    ],
    urgency_boundary: "只使用已确认库存和截止时间，不制造虚假紧迫感",
  },
  order_guidance: [
    {
      step: 1,
      script: "先确认页面上的规格和袋数是不是你需要的。",
    },
    {
      step: 2,
      script: "再核对当前显示价格与主播说明是否一致。",
    },
    {
      step: 3,
      script: "确认收货信息后再提交，页面实际信息优先。",
    },
  ],
  closing_and_review: {
    closing_script: "今天把使用场景、配料边界和组合价都讲清楚了，不确定的问题可以继续留言。",
    metrics_to_record: [
      "峰值在线人数",
      "平均停留时长",
      "商品点击人数",
      "加购人数",
      "成交订单数",
      "退款订单数",
      "高频评论问题",
    ],
    host_review_questions: [
      "开场三分钟是否讲清留下理由？",
      "哪个演示节点在线人数提升？",
      "哪些事实问题没有资料可回答？",
      "催单话术是否都具备真实依据？",
    ],
  },
};
