import { describe, expect, it } from "vitest";

import { MetricsService } from "../../src/services/metrics/metrics-service.js";
import { sampleDataAnalysisInput } from "../fixtures/data-analysis.js";

describe("MetricsService", () => {
  it("calculates rates, revenue efficiency, and baseline deltas deterministically", () => {
    const result = new MetricsService().calculate(
      sampleDataAnalysisInput,
    );

    expect(result).toMatchObject({
      views: 12_000,
      estimated_completions: 5_040,
      rates: {
        completion_rate: 0.42,
        like_rate: 0.06,
        comment_rate: 0.008,
        save_rate: 0.02,
        share_rate: 0.005,
        click_rate: 0.04,
        add_to_cart_rate: 0.01,
        order_rate_per_view: 0.003,
        order_rate_per_click: 0.075,
      },
      revenue: {
        total: 3_564,
        per_thousand_views: 297,
        average_order_value: 99,
      },
      baseline_comparison: {
        view_index: 2,
        completion_rate_delta: 0.12,
        like_rate_delta: 0.02,
        comment_rate_delta: 0.003,
        save_rate_delta: 0.01,
        share_rate_delta: 0.002,
        click_rate_delta: 0.015,
        order_rate_delta: 0.0015,
      },
      sample_quality: "high",
      data_quality: {
        usable: true,
        warnings: [],
      },
    });
  });

  it("marks impossible funnel counts as unusable instead of interpreting them", () => {
    const result = new MetricsService().calculate({
      ...sampleDataAnalysisInput,
      metrics: {
        ...sampleDataAnalysisInput.metrics,
        views: 100,
        product_clicks: 120,
        add_to_carts: 130,
        orders: 125,
      },
    });

    expect(result.data_quality.usable).toBe(false);
    expect(result.data_quality.warnings).toEqual(
      expect.arrayContaining([
        "商品点击数大于播放量，请检查数据口径。",
        "加购数大于商品点击数，请检查漏斗口径。",
        "成交数大于商品点击数，请检查归因窗口或数据口径。",
      ]),
    );
  });

  it("handles zero views without division by zero", () => {
    const result = new MetricsService().calculate({
      ...sampleDataAnalysisInput,
      metrics: {
        views: 0,
        completion_rate: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0,
        orders: 0,
      },
    });

    expect(result.sample_quality).toBe("insufficient");
    expect(result.rates.like_rate).toBe(0);
    expect(result.rates.click_rate).toBeNull();
    expect(result.data_quality.usable).toBe(false);
  });
});
