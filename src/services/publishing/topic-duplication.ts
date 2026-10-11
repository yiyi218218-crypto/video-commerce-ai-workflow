export interface TopicDuplicateMatch {
  text: string;
  score: number;
  shared_terms: string[];
}

const knownHistoricalTerms = [
  "鸿门宴",
  "项羽",
  "刘邦",
  "范增",
  "项庄",
  "项伯",
  "樊哙",
  "陈桥兵变",
  "陈桥",
  "黄袍加身",
  "赵匡胤",
  "杯酒释兵权",
  "兵权",
  "石守信",
  "王审琦",
  "围魏救赵",
  "孙膑",
  "庞涓",
  "魏国",
  "赵国",
  "齐国",
  "赤壁",
  "苏轼",
  "曹操",
  "诸葛亮",
  "司马懿",
  "韩信",
  "萧何",
  "张良",
  "商鞅",
  "秦始皇",
  "李斯",
  "吕不韦",
  "司马迁",
];

const genericSharedTerms = new Set([
  "ai",
  "aigc",
  "历史",
  "视频",
  "画面",
  "创作",
  "辅助",
  "辅助创作",
  "公开",
  "资料",
  "依据",
  "改编",
  "部分",
  "对白",
  "史记",
]);

export function findTopicDuplicates(
  currentText: string,
  previousTexts: string[],
): TopicDuplicateMatch[] {
  const currentTerms = extractTopicTerms(currentText);
  return previousTexts
    .map((text) => {
      const previousTerms = extractTopicTerms(text);
      const sharedTerms = [...currentTerms].filter((term) =>
        previousTerms.has(term),
      );
      return {
        text,
        score: calculateTopicScore(currentTerms, previousTerms, sharedTerms),
        shared_terms: summarizeSharedTerms(sharedTerms),
      };
    })
    .filter((match) => isLikelyDuplicate(match))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

export function extractTopicTerms(text: string): Set<string> {
  const normalized = normalizeText(text);
  const terms = new Set<string>();

  for (const term of knownHistoricalTerms) {
    if (normalized.includes(normalizeText(term))) {
      terms.add(term);
    }
  }

  for (const segment of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (const size of [2, 3, 4]) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        terms.add(segment.slice(index, index + size));
      }
    }
  }

  return terms;
}

function calculateTopicScore(
  currentTerms: Set<string>,
  previousTerms: Set<string>,
  sharedTerms: string[],
): number {
  if (currentTerms.size === 0 || previousTerms.size === 0) {
    return 0;
  }
  const unionSize = new Set([...currentTerms, ...previousTerms]).size;
  const jaccard = sharedTerms.length / unionSize;
  const namedTermBonus = sharedTerms.some((term) =>
    knownHistoricalTerms.includes(term),
  )
    ? 0.25
    : 0;
  const multipleNamedTermsBonus =
    sharedTerms.filter((term) => knownHistoricalTerms.includes(term)).length >=
    2
      ? 0.2
      : 0;
  return roundScore(Math.min(1, jaccard + namedTermBonus + multipleNamedTermsBonus));
}

function isLikelyDuplicate(match: TopicDuplicateMatch): boolean {
  const namedSharedTerms = match.shared_terms.filter((term) =>
    knownHistoricalTerms.includes(term),
  );
  const hasSpecificSingleTerm = namedSharedTerms.some((term) => term.length >= 3);
  return (
    namedSharedTerms.length >= 2 ||
    (hasSpecificSingleTerm && match.score >= 0.32) ||
    (namedSharedTerms.length === 1 && match.score >= 0.5) ||
    (namedSharedTerms.length === 0 &&
      match.score >= 0.55 &&
      match.shared_terms.length >= 4)
  );
}

function summarizeSharedTerms(sharedTerms: string[]): string[] {
  const knownTerms = knownHistoricalTerms.filter((term) =>
    sharedTerms.includes(term),
  );
  if (knownTerms.length > 0) {
    return knownTerms.slice(0, 8);
  }
  const phraseTerms = sharedTerms
    .filter(
      (term) =>
        term.length >= 3 &&
        !knownHistoricalTerms.includes(term) &&
        !genericSharedTerms.has(term),
    )
    .sort(
      (left, right) =>
        right.length - left.length || left.localeCompare(right, "zh-CN"),
    );
  return [...knownTerms, ...phraseTerms].slice(0, 12);
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "")
    .trim();
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
