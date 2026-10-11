import { describe, expect, it, vi } from "vitest";

import {
  attachChannelPublishVideo,
  createChannelPublishPackage,
  openChannelPublishPackageDirectory,
} from "../../src/web/channel-publish-api-client.js";
import type { ChannelPublishPackage } from "../../src/schemas/channel-publish.schema.js";
import { completedPhaseTwoRun } from "../fixtures/completed-phase-two-run.js";

const packageRecord: ChannelPublishPackage = {
  id: "6a34f326-7480-47ba-a35f-da4f852bd755",
  status: "prepared",
  run_id: completedPhaseTwoRun.id,
  created_at: "2026-07-23T08:00:00.000Z",
  updated_at: "2026-07-23T08:00:00.000Z",
  directory_path: "C:\\publish",
  channel: { display_name: "测试视频号" },
  product: {
    name: "低糖燕麦坚果脆",
    category: "food",
    price_display: "¥39.90",
  },
  duration_seconds: 30,
  publication: {
    title: "迟到前的三分钟早餐",
    caption: "发布文案",
    hashtags: ["#视频号"],
  },
  commerce: {
    mode: "wechat_store_product",
    product_name: "低糖燕麦坚果脆",
    linkage_confirmed: true,
  },
  readiness: {
    ready_for_manual_publish: false,
    blocking_items: ["尚未附加可发布成片。"],
    manual_actions: ["人工发布"],
  },
  files: ["a", "b", "c", "d"],
};

describe("channel publish API client", () => {
  it("posts the workflow run and parses the publish package", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(201, {
        ok: true,
        package: packageRecord,
      }),
    );

    const result = await createChannelPublishPackage(
      {
        run: completedPhaseTwoRun,
        channel: { display_name: "测试视频号" },
        duration_seconds: 30,
        commerce: {
          mode: "wechat_store_product",
          linkage_confirmed: true,
        },
      },
      fetchMock,
    );

    expect(result.id).toBe(packageRecord.id);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/channel-publish-packages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("uploads only a video whose extension matches the media type", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, {
        ok: true,
        package: packageRecord,
      }),
    );
    const video = new File([validMp4BlobPart()], "成片.mp4", {
      type: "video/mp4",
    });

    await attachChannelPublishVideo(
      packageRecord.id,
      video,
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("filename="),
      expect.objectContaining({
        method: "PUT",
        body: video,
      }),
    );
  });

  it("surfaces API errors from the folder handoff", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(404, {
        ok: false,
        error: {
          code: "PUBLISH_PACKAGE_NOT_FOUND",
          message: "missing",
        },
      }),
    );

    await expect(
      openChannelPublishPackageDirectory(
        packageRecord.id,
        fetchMock,
      ),
    ).rejects.toMatchObject({
      code: "PUBLISH_PACKAGE_NOT_FOUND",
    });
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function validMp4BlobPart(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(12));
  bytes.set([
    0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73,
    0x6f, 0x6d,
  ]);
  return bytes;
}
