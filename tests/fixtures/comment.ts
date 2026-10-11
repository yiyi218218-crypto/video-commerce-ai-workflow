import type {
  CommentAgentInput,
  CommentAgentOutput,
} from "../../src/schemas/comment-agent.schema.js";
import { sampleProductInput } from "./phase-one.js";

export const sampleCommentInput: CommentAgentInput = {
  comment_id: "comment-001",
  comment_text: "这个是不是无糖的？减肥期间能不能随便吃？",
  product: sampleProductInput,
  video_context: {
    title: "打卡前的三分钟早餐",
    summary: "展示在办公室用燕麦坚果脆搭配牛奶的早餐场景。",
    selected_direction_id: "direction_1",
  },
  conversation_history: [],
  brand_tone: "真实、耐心、不过度推销",
  known_facts: ["配料表未添加蔗糖", "未添加蔗糖不等于无糖"],
  prohibited_terms: ["随便吃也不胖", "减肥食品"],
  reply_constraints: [
    "提示用户查看包装营养成分",
    "不得给出个体化饮食医疗建议",
  ],
};

export const sampleCommentOutput: CommentAgentOutput = {
  classification: {
    intent: "suitability_question",
    sentiment: "uncertain",
    risk_level: "medium",
    rationale: "用户同时询问糖分概念和体重管理适用性，涉及容易误导的功效边界。",
  },
  response_strategy: {
    goal: "澄清未添加蔗糖不等于无糖，并引导用户查看营养信息",
    tone: "耐心、直接、不做个体化承诺",
    trust_action: "明确商品事实和无法承诺的边界",
    conversion_action: "请用户先核对包装营养成分和自己的饮食需求",
  },
  public_replies: [
    {
      reply: "不是无糖哦，配料表写的是未添加蔗糖。具体糖分请看包装营养成分。",
      style: "concise",
      purpose: "直接澄清糖分概念",
      follow_up_question: "你更想了解配料还是每份营养信息？",
      conversion_action: "ask_question",
      fact_claims: ["配料表未添加蔗糖", "未添加蔗糖不等于无糖"],
    },
    {
      reply: "它不能作为体重管理结果的保证，先看营养成分和份量是否符合你的需要。",
      style: "professional",
      purpose: "说明适用边界并支持理性判断",
      follow_up_question: "",
      conversion_action: "check_product_details",
      fact_claims: ["不得宣称减肥效果"],
    },
    {
      reply: "这个问题问得很关键：未添加蔗糖和无糖不是一回事，包装信息要一起看。",
      style: "warm",
      purpose: "认可问题并建立信任",
      follow_up_question: "",
      conversion_action: "check_product_details",
      fact_claims: ["未添加蔗糖不等于无糖"],
    },
  ],
  private_follow_up: {
    recommended: false,
    reason: "公开澄清商品事实即可，不需要收集订单或个人信息。",
    message: "",
  },
  factual_basis: [
    {
      claim: "配料表未添加蔗糖",
      basis: "商品输入明确提供",
      evidence_status: "provided_fact",
    },
    {
      claim: "未添加蔗糖不等于无糖",
      basis: "商品销售限制明确提供",
      evidence_status: "provided_fact",
    },
    {
      claim: "不得宣称减肥效果",
      basis: "商品销售限制明确提供",
      evidence_status: "provided_fact",
    },
  ],
  safety_flags: ["medical_claim"],
  escalation: {
    required: true,
    owner: "compliance",
    reason: "涉及体重管理功效边界，建议人工确认公开措辞。",
    do_not_reply_publicly: false,
  },
  operator_note: "发布前确认营养成分信息是否能在商品页面清楚查看。",
};
