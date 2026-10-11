import {
  commentAgentInputSchema,
  commentAgentOutputSchema,
  type CommentAgentInput,
  type CommentAgentOutput,
} from "../../schemas/comment-agent.schema.js";
import type { DimensionScore } from "./phase-one-evaluator.js";

export interface CommentEvaluation {
  hardGates: {
    inputSchemaValid: boolean;
    outputSchemaValid: boolean;
    escalationConsistent: boolean;
    privacyHandledSafely: boolean;
    prohibitedTermsAbsent: boolean;
    noHardSellLanguage: boolean;
    replyLengthValid: boolean;
  };
  interactionQuality: DimensionScore;
  trustQuality: DimensionScore;
  conversionFit: DimensionScore;
  operationalSafety: DimensionScore;
  overallScore: number;
  passed: boolean;
}

const hardSellPhrases = [
  "家人们冲",
  "闭眼入",
  "全网最低",
  "最后一天",
  "卖疯了",
  "绝对有效",
  "包治",
];

export function evaluateCommentArtifact(
  rawInput: unknown,
  rawOutput: unknown,
): CommentEvaluation {
  const input = commentAgentInputSchema.safeParse(rawInput);
  const output = commentAgentOutputSchema.safeParse(rawOutput);

  const escalationConsistent =
    output.success && isEscalationConsistent(output.data);
  const privacyHandledSafely =
    output.success &&
    (!output.data.safety_flags.includes("privacy_data") ||
      (output.data.escalation.required &&
        output.data.escalation.do_not_reply_publicly));
  const prohibitedTermsAbsent =
    input.success &&
    output.success &&
    hasNoProhibitedTerms(input.data, output.data);
  const noHardSellLanguage =
    output.success && !containsHardSellLanguage(output.data);
  const replyLengthValid =
    output.success &&
    output.data.public_replies.every(
      (candidate) => [...candidate.reply].length <= 120,
    );

  const interactionQuality = output.success
    ? scoreInteractionQuality(output.data)
    : invalidDimension("Comment output schema is invalid.");
  const trustQuality =
    input.success && output.success
      ? scoreTrustQuality(
          input.data,
          output.data,
          prohibitedTermsAbsent,
          noHardSellLanguage,
        )
      : invalidDimension("Comment input or output schema is invalid.");
  const conversionFit = output.success
    ? scoreConversionFit(output.data)
    : invalidDimension("Comment output schema is invalid.");
  const operationalSafety = output.success
    ? scoreOperationalSafety(
        output.data,
        escalationConsistent,
        privacyHandledSafely,
      )
    : invalidDimension("Comment output schema is invalid.");

  const scores = [
    interactionQuality.score,
    trustQuality.score,
    conversionFit.score,
    operationalSafety.score,
  ];
  const overallScore = round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  const allHardGates = [
    input.success,
    output.success,
    escalationConsistent,
    privacyHandledSafely,
    prohibitedTermsAbsent,
    noHardSellLanguage,
    replyLengthValid,
  ].every(Boolean);

  return {
    hardGates: {
      inputSchemaValid: input.success,
      outputSchemaValid: output.success,
      escalationConsistent,
      privacyHandledSafely,
      prohibitedTermsAbsent,
      noHardSellLanguage,
      replyLengthValid,
    },
    interactionQuality,
    trustQuality,
    conversionFit,
    operationalSafety,
    overallScore,
    passed: allHardGates && overallScore >= 3.5,
  };
}

function scoreInteractionQuality(output: CommentAgentOutput): DimensionScore {
  let score = 1;
  const reasons: string[] = [];
  const replies = output.public_replies;

  if (replies.length >= 2) {
    score += 1;
    reasons.push("Multiple reply choices are available.");
  }
  if (new Set(replies.map((reply) => reply.style)).size >= 2) {
    score += 1;
    reasons.push("Reply candidates use more than one style.");
  }
  if (
    replies.some(
      (reply) =>
        reply.conversion_action === "ask_question" ||
        reply.follow_up_question.trim().length > 0,
    )
  ) {
    score += 1;
    reasons.push("At least one reply invites a useful follow-up.");
  }
  if (replies.every((reply) => [...reply.reply].length <= 60)) {
    score += 1;
    reasons.push("All replies are concise for a public comment thread.");
  }

  return { score: clampScore(score), reasons };
}

function scoreTrustQuality(
  input: CommentAgentInput,
  output: CommentAgentOutput,
  prohibitedTermsAbsent: boolean,
  noHardSellLanguage: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (prohibitedTermsAbsent) {
    score += 1;
    reasons.push("Configured prohibited terms are absent.");
  }
  if (noHardSellLanguage) {
    score += 1;
    reasons.push("No configured hard-sell phrase was detected.");
  }
  if (
    output.factual_basis.length > 0 &&
    output.factual_basis.every((item) => item.basis.trim().length > 0)
  ) {
    score += 1;
    reasons.push("Factual claims include an explicit basis.");
  }
  const knownFactsAvailable =
    input.known_facts.length + input.product.product_facts.length > 0;
  if (
    !knownFactsAvailable ||
    output.public_replies.every((reply) =>
      reply.fact_claims.every((claim) =>
        output.factual_basis.some((basis) => basis.claim === claim),
      ),
    )
  ) {
    score += 1;
    reasons.push("Reply fact claims are represented in the factual basis.");
  }

  return { score: clampScore(score), reasons };
}

function scoreConversionFit(output: CommentAgentOutput): DimensionScore {
  let score = 1;
  const reasons: string[] = [];
  const actions = output.public_replies.map(
    (reply) => reply.conversion_action,
  );

  if (
    output.classification.intent === "purchase_intent"
      ? actions.some(
          (action) =>
            action === "guide_to_order" ||
            action === "check_product_details",
        )
      : !actions.every((action) => action === "guide_to_order")
  ) {
    score += 1.5;
    reasons.push("Conversion actions fit the classified user intent.");
  }
  if (output.response_strategy.conversion_action.length >= 6) {
    score += 0.75;
    reasons.push("The response strategy defines a conversion next step.");
  }
  if (
    output.classification.sentiment === "negative"
      ? !actions.includes("guide_to_order")
      : true
  ) {
    score += 1;
    reasons.push("Negative sentiment is not answered with an immediate sale.");
  }
  if (
    output.public_replies.every(
      (reply) => reply.purpose.trim().length >= 4,
    )
  ) {
    score += 0.75;
    reasons.push("Every candidate has a clear operational purpose.");
  }

  return { score: clampScore(score), reasons };
}

function scoreOperationalSafety(
  output: CommentAgentOutput,
  escalationConsistent: boolean,
  privacyHandledSafely: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (escalationConsistent) {
    score += 1.5;
    reasons.push("Risk and escalation ownership are consistent.");
  }
  if (privacyHandledSafely) {
    score += 1;
    reasons.push("Privacy handling is safe.");
  }
  if (
    !output.private_follow_up.recommended ||
    output.private_follow_up.message.trim().length > 0
  ) {
    score += 0.75;
    reasons.push("Private follow-up has a usable message when recommended.");
  }
  if (output.operator_note.trim().length >= 8) {
    score += 0.75;
    reasons.push("The operator receives a concrete review note.");
  }

  return { score: clampScore(score), reasons };
}

function isEscalationConsistent(output: CommentAgentOutput): boolean {
  if (output.safety_flags.length > 0 && !output.escalation.required) {
    return false;
  }
  if (output.classification.risk_level === "high") {
    return output.escalation.required && output.escalation.owner !== "none";
  }
  if (output.escalation.required) {
    return output.escalation.owner !== "none";
  }
  return output.escalation.owner === "none";
}

function hasNoProhibitedTerms(
  input: CommentAgentInput,
  output: CommentAgentOutput,
): boolean {
  const generatedText = JSON.stringify([
    output.public_replies,
    output.private_follow_up.message,
  ]);
  return input.prohibited_terms.every(
    (term) => !generatedText.includes(term),
  );
}

function containsHardSellLanguage(output: CommentAgentOutput): boolean {
  const generatedText = JSON.stringify(output.public_replies);
  return hardSellPhrases.some((phrase) => generatedText.includes(phrase));
}

function invalidDimension(reason: string): DimensionScore {
  return { score: 1, reasons: [reason] };
}

function clampScore(score: number): number {
  return round(Math.min(5, Math.max(1, score)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
