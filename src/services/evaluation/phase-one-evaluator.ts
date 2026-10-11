import {
  contentAgentOutputSchema,
  type ContentAgentOutput,
} from "../../schemas/content-agent.schema.js";
import {
  productAgentOutputSchema,
  type ProductAgentOutput,
} from "../../schemas/product-agent.schema.js";

export interface DimensionScore {
  score: number;
  reasons: string[];
}

export interface PhaseOneEvaluation {
  hardGates: {
    productSchemaValid: boolean;
    contentSchemaValid: boolean;
    directionCountValid: boolean;
    directionIdsUnique: boolean;
    noHardSellLanguage: boolean;
  };
  commercialValue: DimensionScore;
  contentQuality: DimensionScore;
  videoChannelsFit: DimensionScore;
  conversionAbility: DimensionScore;
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
];

export function evaluatePhaseOneArtifacts(
  rawProductOutput: unknown,
  rawContentOutput: unknown,
): PhaseOneEvaluation {
  const product = productAgentOutputSchema.safeParse(rawProductOutput);
  const content = contentAgentOutputSchema.safeParse(rawContentOutput);

  const directionCountValid =
    content.success && content.data.directions.length === 5;
  const directionIdsUnique =
    content.success &&
    new Set(
      content.data.directions.map((direction) => direction.direction_id),
    ).size === 5;
  const noHardSellLanguage =
    content.success && !containsHardSellLanguage(content.data);

  const commercialValue = product.success
    ? scoreCommercialValue(product.data)
    : invalidDimension("Product output schema is invalid.");
  const contentQuality = content.success
    ? scoreContentQuality(content.data)
    : invalidDimension("Content output schema is invalid.");
  const videoChannelsFit = content.success
    ? scoreVideoChannelsFit(content.data, noHardSellLanguage)
    : invalidDimension("Content output schema is invalid.");
  const conversionAbility =
    product.success && content.success
      ? scoreConversionAbility(product.data, content.data)
      : invalidDimension("Product or content output schema is invalid.");

  const scores = [
    commercialValue.score,
    contentQuality.score,
    videoChannelsFit.score,
    conversionAbility.score,
  ];
  const overallScore = round(
    scores.reduce((total, score) => total + score, 0) / scores.length,
  );
  const allHardGates = [
    product.success,
    content.success,
    directionCountValid,
    directionIdsUnique,
    noHardSellLanguage,
  ].every(Boolean);

  return {
    hardGates: {
      productSchemaValid: product.success,
      contentSchemaValid: content.success,
      directionCountValid,
      directionIdsUnique,
      noHardSellLanguage,
    },
    commercialValue,
    contentQuality,
    videoChannelsFit,
    conversionAbility,
    overallScore,
    passed: allHardGates && overallScore >= 3.5,
  };
}

function scoreCommercialValue(output: ProductAgentOutput): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (output.selling_points.length >= 3) {
    score += 1;
    reasons.push("At least three selling points are available.");
  }
  if (output.core_purchase_motivations.length >= 3) {
    score += 1;
    reasons.push("Purchase motivations are sufficiently developed.");
  }
  if ((output.audience_profiles[0]?.usage_scenarios.length ?? 0) >= 2) {
    score += 0.75;
    reasons.push("Audience analysis includes concrete usage scenarios.");
  }
  if (output.differentiators.length > 0 || output.sales_risks.length > 0) {
    score += 0.75;
    reasons.push("The analysis addresses differentiation or sales resistance.");
  }
  if (
    output.selling_points.every(
      (point) =>
        point.evidence_status !== "provided_fact" ||
        point.basis.trim().length > 0,
    )
  ) {
    score += 0.5;
    reasons.push("Provided-fact selling points include an explicit basis.");
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

function scoreContentQuality(output: ContentAgentOutput): DimensionScore {
  const themes = new Set(
    output.directions.map((direction) => normalize(direction.theme)),
  );
  const modes = new Set(
    output.directions.map((direction) => direction.narrative_mode),
  );
  const uniqueTitles = new Set(
    output.directions.flatMap((direction) =>
      direction.titles.map(normalize),
    ),
  );
  const uniqueHooks = new Set(
    output.directions.flatMap((direction) =>
      direction.hooks.map(normalize),
    ),
  );
  let score = 1;
  const reasons: string[] = [];

  if (themes.size === 5) {
    score += 1;
    reasons.push("All five themes are distinct.");
  }
  if (modes.size >= 3) {
    score += 1;
    reasons.push("At least three narrative modes are represented.");
  }
  if (uniqueTitles.size >= 13 && uniqueHooks.size >= 13) {
    score += 1;
    reasons.push("Titles and hooks show low duplication.");
  }
  if (
    output.directions.every(
      (direction) => direction.content_structure.length >= 4,
    )
  ) {
    score += 1;
    reasons.push("Every direction has a shootable content structure.");
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

function scoreVideoChannelsFit(
  output: ContentAgentOutput,
  noHardSellLanguage: boolean,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];
  const hooks = output.directions.flatMap((direction) => direction.hooks);
  const conciseHooks = hooks.filter((hook) => [...hook].length <= 40).length;

  if (noHardSellLanguage) {
    score += 1.5;
    reasons.push("No configured hard-sell phrase was detected.");
  }
  if (
    output.directions.every(
      (direction) => direction.product_integration.timing !== "through_story",
    )
  ) {
    score += 0.75;
    reasons.push("Products are introduced after the content premise.");
  } else {
    score += 0.5;
    reasons.push("Most product integrations avoid a direct hard-ad opening.");
  }
  if (conciseHooks >= 12) {
    score += 1;
    reasons.push("Most hooks are concise enough for the first three seconds.");
  }
  if (
    output.directions.every(
      (direction) => direction.identity_resonance.trim().length >= 6,
    )
  ) {
    score += 0.75;
    reasons.push("Every direction contains an identity resonance angle.");
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

function scoreConversionAbility(
  product: ProductAgentOutput,
  content: ContentAgentOutput,
): DimensionScore {
  let score = 1;
  const reasons: string[] = [];

  if (
    content.directions.every(
      (direction) => direction.conversion_cta.trim().length >= 6,
    )
  ) {
    score += 1;
    reasons.push("Every direction includes a concrete low-pressure CTA.");
  }
  if (
    content.directions.every(
      (direction) => direction.product_integration.method.trim().length >= 8,
    )
  ) {
    score += 1;
    reasons.push("Product integration is actionable rather than generic.");
  }
  if (
    content.directions.every(
      (direction) =>
        direction.core_conflict.trim().length >= 6 &&
        direction.why_it_can_work.trim().length >= 8,
    )
  ) {
    score += 1;
    reasons.push("Each direction connects conflict to a conversion hypothesis.");
  }
  if (
    product.selling_points.length >= 2 &&
    content.selection_guide.recommended_direction_ids.length === 2
  ) {
    score += 1;
    reasons.push("The plan supports selection against defined selling points.");
  }

  return {
    score: clampScore(score),
    reasons,
  };
}

function containsHardSellLanguage(output: ContentAgentOutput): boolean {
  const text = JSON.stringify(output);
  return hardSellPhrases.some((phrase) => text.includes(phrase));
}

function invalidDimension(reason: string): DimensionScore {
  return {
    score: 1,
    reasons: [reason],
  };
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function clampScore(score: number): number {
  return round(Math.min(5, Math.max(1, score)));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
