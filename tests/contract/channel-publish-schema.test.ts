import { describe, expect, it } from "vitest";

import {
  channelPublishPackageSchema,
  createChannelPublishPackageRequestSchema,
} from "../../src/schemas/channel-publish.schema.js";
import { completedPhaseTwoRun } from "../fixtures/completed-phase-two-run.js";

describe("channel publish schemas", () => {
  it("accepts a strict local publish-package request", () => {
    const parsed = createChannelPublishPackageRequestSchema.parse({
      run: completedPhaseTwoRun,
      channel: {
        display_name: "测试视频号",
      },
      duration_seconds: 30,
      commerce: {
        mode: "wechat_store_product",
        product_id_or_sku: "SKU-001",
        linkage_confirmed: true,
      },
    });

    expect(parsed.channel.display_name).toBe("测试视频号");
    expect(parsed.duration_seconds).toBe(30);
  });

  it("rejects extra fields and unsupported durations", () => {
    const parsed = createChannelPublishPackageRequestSchema.safeParse({
      run: completedPhaseTwoRun,
      channel: {
        display_name: "测试视频号",
        cookie: "must-not-be-accepted",
      },
      duration_seconds: 20,
      commerce: {
        mode: "wechat_store_product",
        linkage_confirmed: true,
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("requires the manifest to describe manual actions", () => {
    const parsed = channelPublishPackageSchema.safeParse({
      id: "6a34f326-7480-47ba-a35f-da4f852bd755",
      status: "prepared",
      run_id: "run",
      created_at: "2026-07-23T08:00:00.000Z",
      updated_at: "2026-07-23T08:00:00.000Z",
      directory_path: "C:\\publish",
      channel: { display_name: "测试视频号" },
      product: {
        name: "商品",
        category: "food",
        price_display: "¥39.90",
      },
      duration_seconds: 30,
      publication: {
        title: "标题",
        caption: "文案",
        hashtags: ["#视频号"],
      },
      commerce: {
        mode: "none",
        linkage_confirmed: true,
      },
      readiness: {
        ready_for_manual_publish: false,
        blocking_items: ["缺少成片"],
        manual_actions: [],
      },
      files: ["a", "b", "c", "d"],
    });

    expect(parsed.success).toBe(false);
  });
});
