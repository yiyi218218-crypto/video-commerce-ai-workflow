import type {
  DataAnalysisInput,
  DerivedMetrics,
} from "../../schemas/data-analysis.schema.js";

export class MetricsService {
  calculate(input: DataAnalysisInput): DerivedMetrics {
    const { metrics, baseline } = input;
    const { views } = metrics;
    const warnings = this.collectWarnings(input);
    const denominator = views > 0 ? views : undefined;
    const likeRate = ratio(metrics.likes, denominator);
    const commentRate = ratio(metrics.comments, denominator);
    const saveRate = ratio(metrics.saves, denominator);
    const shareRate = ratio(metrics.shares, denominator);
    const clickRate = optionalRatio(metrics.product_clicks, denominator);
    const addToCartRate = optionalRatio(metrics.add_to_carts, denominator);
    const orderRatePerView = ratio(metrics.orders, denominator);
    const orderRatePerClick = optionalRatio(
      metrics.orders,
      positive(metrics.product_clicks),
    );
    const revenueTotal = metrics.revenue ?? null;

    return {
      views,
      estimated_completions: Math.round(
        views * metrics.completion_rate,
      ),
      rates: {
        completion_rate: round(metrics.completion_rate),
        like_rate: likeRate,
        comment_rate: commentRate,
        save_rate: saveRate,
        share_rate: shareRate,
        click_rate: clickRate,
        add_to_cart_rate: addToCartRate,
        order_rate_per_view: orderRatePerView,
        order_rate_per_click: orderRatePerClick,
      },
      revenue: {
        total: revenueTotal,
        per_thousand_views:
          revenueTotal !== null && denominator !== undefined
            ? round((revenueTotal / denominator) * 1_000)
            : null,
        average_order_value:
          revenueTotal !== null && metrics.orders > 0
            ? round(revenueTotal / metrics.orders)
            : null,
      },
      baseline_comparison: {
        view_index:
          baseline?.average_views !== undefined &&
          baseline.average_views > 0
            ? round(views / baseline.average_views)
            : null,
        completion_rate_delta: delta(
          metrics.completion_rate,
          baseline?.completion_rate,
        ),
        like_rate_delta: delta(likeRate, baseline?.like_rate),
        comment_rate_delta: delta(
          commentRate,
          baseline?.comment_rate,
        ),
        save_rate_delta: delta(saveRate, baseline?.save_rate),
        share_rate_delta: delta(shareRate, baseline?.share_rate),
        click_rate_delta: nullableDelta(clickRate, baseline?.click_rate),
        order_rate_delta: delta(
          orderRatePerView,
          baseline?.order_rate,
        ),
      },
      sample_quality: sampleQuality(views),
      data_quality: {
        usable: views > 0 && warnings.length === 0,
        warnings,
      },
    };
  }

  private collectWarnings(input: DataAnalysisInput): string[] {
    const { metrics } = input;
    const warnings: string[] = [];

    if (metrics.views === 0) {
      warnings.push("播放量为 0，无法计算基于播放的漏斗指标。");
    }
    for (const [name, value] of [
      ["点赞", metrics.likes],
      ["评论", metrics.comments],
      ["收藏", metrics.saves],
      ["分享", metrics.shares],
    ] as const) {
      if (value > metrics.views) {
        warnings.push(`${name}数大于播放量，请检查数据口径。`);
      }
    }
    if (
      metrics.product_clicks !== undefined &&
      metrics.product_clicks > metrics.views
    ) {
      warnings.push("商品点击数大于播放量，请检查数据口径。");
    }
    if (
      metrics.add_to_carts !== undefined &&
      metrics.product_clicks !== undefined &&
      metrics.add_to_carts > metrics.product_clicks
    ) {
      warnings.push("加购数大于商品点击数，请检查漏斗口径。");
    }
    if (
      metrics.product_clicks !== undefined &&
      metrics.orders > metrics.product_clicks
    ) {
      warnings.push("成交数大于商品点击数，请检查归因窗口或数据口径。");
    }
    return warnings;
  }
}

function sampleQuality(
  views: number,
): DerivedMetrics["sample_quality"] {
  if (views === 0) {
    return "insufficient";
  }
  if (views < 100) {
    return "low";
  }
  if (views < 1_000) {
    return "medium";
  }
  return "high";
}

function ratio(
  numerator: number,
  denominator: number | undefined,
): number {
  return denominator === undefined ? 0 : round(numerator / denominator);
}

function optionalRatio(
  numerator: number | undefined,
  denominator: number | undefined,
): number | null {
  if (numerator === undefined || denominator === undefined) {
    return null;
  }
  return round(numerator / denominator);
}

function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

function delta(current: number, baseline: number | undefined): number | null {
  return baseline === undefined ? null : round(current - baseline);
}

function nullableDelta(
  current: number | null,
  baseline: number | undefined,
): number | null {
  return current === null || baseline === undefined
    ? null
    : round(current - baseline);
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
