import {
  liveAgentOutputSchema,
  type LiveAgentOutput,
  type LiveContext,
} from "../../schemas/live-agent.schema.js";
import {
  scriptAgentOutputSchema,
  type ScriptAgentOutput,
  type ScriptVersion,
} from "../../schemas/script-agent.schema.js";
import type { DimensionScore } from "./phase-one-evaluator.js";

export interface PhaseTwoEvaluation {
  hardGates: {
    scriptSchemaValid: boolean;
    liveSchemaValid: boolean;
    directionConsistent: boolean;
    scriptTimelinesValid: boolean;
    openingMinutesValid: boolean;
    noHardSellLanguage: boolean;
    confirmedOffersGrounded: boolean;
    urgencyGrounded: boolean;
  };
  scriptQuality: DimensionScore;
  shootability: DimensionScore;
  liveCompleteness: DimensionScore;
  commercialTrust: DimensionScore;
  overallScore: number;
  passed: boolean;
}

const hardSellPhrases = [
  "品质之选",
  "不容错过",
  "家人们冲",
  "闭眼入",
  "全网最低",
  "最后一天",
  "卖疯了",
  "绝对有效",
];

export function evaluatePhaseTwoArtifacts(
  rawScriptOutput: unknown,
  rawLiveOutput: unknown,
  liveContext?: LiveContext,
): PhaseTwoEvaluation {
  const script = scriptAgentOutputSchema.safeParse(rawScriptOutput);
  const live = liveAgentOutputSchema.safeParse(rawLiveOutput);

  const directionConsistent =
    script.success &&
    live.success &&
    script.data.selected_direction_id === live.data.selected_direction_id;
  const scriptTimelinesValid =
    script.success && allScriptTimelinesValid(script.data);
  const openingMinutesValid =
    live.success &&
    new Set(live.data.opening_five_minutes.map((item) => item.minute))
      .size === 5 &&
    live.data.opening_five_minutes.every(
      (item, index) => item.minute === index + 1,
    );
  const noHardSellLanguage =
    script.success &&
    live.success &&
    !containsHardSellLanguage(script.data, live.data);
  const confirmedOffersGrounded =
    live.success &&
    (liveContext === undefined ||
      offersAreGrounded(live.data, liveContext));
  const urgencyGrounded =
    live.success &&
    (liveContext === undefined ||
      urgencyIsGrounded(live.data, liveContext));

  const scriptQuality = script.success
    ? scoreScriptQuality(script.data, noHardSellLanguage)
    : invalidDimension("Script output schema is invalid.");
  const shootability = script.success
    ? scoreShootability(script.data, scriptTimelinesValid)
    : invalidDimension("Script output schema is invalid.");
  const liveCompleteness = live.success
    ? scoreLiveCompleteness(live.data, liveContext, openingMinutesValid)
    : invalidDimension("Live output schema is invalid.");
  const commercialTrust = live.success
    ? scoreCommercialTrust(
        live.data,
        confirmedOffersGrounded,
        urgencyGrounded,
      )
    : invalidDimension("Live output schema is invalid.");

  const scores = [
    scriptQuality.score,
    shootability.score,
    liveCompleteness.score,
    commercialTrust.score,
  ];
  const overallScore = round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  const allHardGates = [
    script.success,
    live.success,
    directionConsistent,
    scriptTimelinesValid,
    openingMinutesValid,
    noHardSellLanguage,
    confirmedOffersGrounded,
    urgencyGrounded,
  ].every(Boolean);

  return {
    hardGates: {
      scriptSchemaValid: script.success,
      liveSchemaValid: live.success,
      directionConsistent,
      scriptTimelinesValid,
      openingMinutesValid,
      noHardSellLanguage,
      confirmedOffersGrounded,
      urgencyGrounded,
    },
    scriptQuality,
    shootability,
    liveCompleteness,
    commercialTrust,
    overallScore,
    passed: allHardGates && overallScore >= 3.5,
  };
}

function scoreScriptQuality(
  output: ScriptAgentOutput,
  noHardSellLanguage: boolean,
): DimensionScore {
  const versions = scriptVersions(output);
  let score = 1;
  const reasons: string[] = [];

  if (versions.every((version) => [...version.hook].length <= 40)) {
    score += 1;
    reasons.push("All hooks are concise enough for an opening beat.");
  }
  if (new Set(versions.map((version) => version.shots.length)).size === 3) {
    score += 1;
    reasons.push("The three durations use materially different pacing.");
  }
  if (
    versions.every(
      (version) =>
        version.fact_check.claims_used.length > 0 &&
        version.fact_check.risk_notes.length > 0,
    )
  ) {
    score += 1;
    reasons.push("Every version includes claim evidence and risk notes.");
  }
  if (noHardSellLanguage) {
    score += 1;
    reasons.push("No configured AI-advertising phrase was detected.");
  }

  return { score: clampScore(score), reasons };
}

function scoreShootability(
  output: ScriptAgentOutput,
  timelinesValid: boolean,
): DimensionScore {
  const versions = scriptVersions(output);
  let score = 1;
  const reasons: string[] = [];

  if (timelinesValid) {
    score += 1.5;
    reasons.push("All shot timelines are ordered and fit their durations.");
  }
  if (
    versions.every((version) =>
      version.shots.every(
        (shot) =>
          shot.visual.length >= 4 &&
          shot.action.length >= 4 &&
          shot.audio_cue.length >= 4,
      ),
    )
  ) {
    score += 1;
    reasons.push("Every shot includes visual, action, and audio direction.");
  }
  if (versions.every((version) => version.performance_notes.length >= 2)) {
    score += 0.75;
    reasons.push("Performance guidance is present for all durations.");
  }
  if (
    versions.every(
      (version) =>
        version.product_showcase.length >= 8 &&
        version.closing_cta.length >= 8,
    )
  ) {
    score += 0.75;
    reasons.push("Product display and CTA are concrete in every version.");
  }

  return { score: clampScore(score), reasons };
}

function scoreLiveCompleteness(
  output: LiveAgentOutput,
  context: LiveContext | undefined,
  openingMinutesValid: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (openingMinutesValid) {
    score += 1;
    reasons.push("The opening is planned minute by minute.");
  }
  if (new Set(output.run_of_show.map((item) => item.phase)).size >= 6) {
    score += 1;
    reasons.push("The run of show covers at least six live phases.");
  }
  const totalMinutes = output.run_of_show.reduce(
    (total, item) => total + item.duration_minutes,
    0,
  );
  if (
    context === undefined ||
    totalMinutes === context.live_duration_minutes
  ) {
    score += 1;
    reasons.push("The run of show matches the planned live duration.");
  }
  if (
    output.interaction_questions.length >= 6 &&
    output.objection_handling.length >= 4 &&
    output.closing_and_review.metrics_to_record.length >= 6
  ) {
    score += 1;
    reasons.push("Interaction, objections, and review metrics are complete.");
  }

  return { score: clampScore(score), reasons };
}

function scoreCommercialTrust(
  output: LiveAgentOutput,
  offersGrounded: boolean,
  urgencyGrounded: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (offersGrounded) {
    score += 1.5;
    reasons.push("Every confirmed offer is grounded in the live input.");
  }
  if (urgencyGrounded) {
    score += 1;
    reasons.push("Inventory and deadline urgency have confirmed support.");
  }
  if (
    output.offer_plan.recommendations.every(
      (item) => item.requires_confirmation,
    )
  ) {
    score += 0.75;
    reasons.push("New offer ideas remain explicitly unconfirmed.");
  }
  if (
    output.facts_boundary.missing_facts_that_limit_sales.length > 0 &&
    output.product_presentation.limitation_disclosure.length >= 8
  ) {
    score += 0.75;
    reasons.push("Missing facts and product limitations are disclosed.");
  }

  return { score: clampScore(score), reasons };
}

function allScriptTimelinesValid(output: ScriptAgentOutput): boolean {
  return scriptVersions(output).every((version) => {
    let previousEnd = 0;
    for (const shot of version.shots) {
      if (
        shot.start_second < previousEnd ||
        shot.end_second <= shot.start_second ||
        shot.end_second > version.duration_seconds
      ) {
        return false;
      }
      previousEnd = shot.end_second;
    }
    return (
      version.shots[0]?.start_second === 0 &&
      previousEnd === version.duration_seconds
    );
  });
}

function offersAreGrounded(
  output: LiveAgentOutput,
  context: LiveContext,
): boolean {
  const confirmedOffers = new Set(
    context.confirmed_offers.map(serializeOffer),
  );
  return output.offer_plan.confirmed_offers.every((offer) =>
    confirmedOffers.has(serializeOffer(offer)),
  );
}

function urgencyIsGrounded(
  output: LiveAgentOutput,
  context: LiveContext,
): boolean {
  return output.urgency_scripts.every((item) => {
    if (item.basis === "confirmed_inventory") {
      return context.inventory_quantity !== undefined;
    }
    if (item.basis === "confirmed_offer_deadline") {
      return context.confirmed_offers.some(
        (offer) => offer.deadline !== undefined,
      );
    }
    return true;
  });
}

function containsHardSellLanguage(
  script: ScriptAgentOutput,
  live: LiveAgentOutput,
): boolean {
  const text = JSON.stringify([script, live]);
  return hardSellPhrases.some((phrase) => text.includes(phrase));
}

function scriptVersions(output: ScriptAgentOutput): ScriptVersion[] {
  return [
    output.scripts.fifteen_seconds,
    output.scripts.thirty_seconds,
    output.scripts.sixty_seconds,
  ];
}

function serializeOffer(offer: {
  name: string;
  details: string;
  deadline?: string | undefined;
}): string {
  return JSON.stringify([
    offer.name,
    offer.details,
    offer.deadline ?? null,
  ]);
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
