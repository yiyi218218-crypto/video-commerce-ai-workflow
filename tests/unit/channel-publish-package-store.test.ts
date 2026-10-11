import { Readable } from "node:stream";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ChannelPublishPackageStore } from "../../src/services/publishing/channel-publish-package-store.js";
import { completedPhaseTwoRun } from "../fixtures/completed-phase-two-run.js";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("ChannelPublishPackageStore", () => {
  it("creates an auditable package and links the workflow product context", async () => {
    const { root, store } = await createStore();
    const result = await store.create(
      createRequest({ linkage_confirmed: false }),
    );

    expect(result.status).toBe("prepared");
    expect(result.product.name).toBe("低糖燕麦坚果脆");
    expect(result.commerce.product_name).toBe("低糖燕麦坚果脆");
    expect(result.readiness.ready_for_manual_publish).toBe(false);
    expect(result.readiness.blocking_items).toEqual([
      "尚未附加可发布成片。",
      "尚未确认发布时在视频号带货助手中选择并核对商品。",
    ]);
    expect(await stat(result.directory_path)).toMatchObject({
      isDirectory: expect.any(Function),
    });

    const checklist = await readFile(
      path.join(result.directory_path, "03-带货关联清单.md"),
      "utf8",
    );
    expect(checklist).toContain("微信小店带货助手");
    expect(checklist).toContain("商品 ID / SKU：SKU-001");
    expect(checklist).toContain("不会自动点击发布");
    expect(result.directory_path.startsWith(root)).toBe(true);

    const manifest = JSON.parse(
      await readFile(
        path.join(result.directory_path, "manifest.json"),
        "utf8",
      ),
    ) as { run_id: string };
    expect(manifest.run_id).toBe(completedPhaseTwoRun.id);
  });

  it("streams a valid finished video and marks the handoff ready", async () => {
    const { store } = await createStore();
    const prepared = await store.create(
      createRequest({ linkage_confirmed: true }),
    );
    const video = validMp4Header();

    const updated = await store.attachVideo(prepared.id, {
      filename: "剪辑成片.mp4",
      mediaType: "video/mp4",
      source: Readable.from(video),
      declaredBytes: video.length,
    });

    expect(updated.status).toBe("video_attached");
    expect(updated.video).toMatchObject({
      name: "剪辑成片.mp4",
      relative_path: "05-成片.mp4",
      media_type: "video/mp4",
      size_bytes: video.length,
    });
    expect(updated.readiness.ready_for_manual_publish).toBe(true);
    expect(updated.readiness.blocking_items).toEqual([]);
    expect(
      await readFile(
        path.join(updated.directory_path, "05-成片.mp4"),
      ),
    ).toEqual(video);
    expect((await store.get(updated.id)).status).toBe("video_attached");
  });

  it("rejects a fake video and removes the partial upload", async () => {
    const { store } = await createStore();
    const prepared = await store.create(
      createRequest({ linkage_confirmed: true }),
    );

    await expect(
      store.attachVideo(prepared.id, {
        filename: "not-a-video.mp4",
        mediaType: "video/mp4",
        source: Readable.from(Buffer.from("not a real mp4")),
        declaredBytes: 14,
      }),
    ).rejects.toMatchObject({
      code: "PUBLISH_VIDEO_SIGNATURE_INVALID",
    });

    const files = await readdir(prepared.directory_path);
    expect(files.some((file) => file.endsWith(".uploading"))).toBe(false);
    expect(files).not.toContain("05-成片.mp4");
  });

  it("does not allow path-like package ids", async () => {
    const { store } = await createStore();

    await expect(store.get("../manifest")).rejects.toMatchObject({
      code: "PUBLISH_PACKAGE_ID_INVALID",
    });
  });
});

async function createStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vca-publish-test-"));
  createdDirectories.push(root);
  return {
    root,
    store: new ChannelPublishPackageStore(path.join(root, "packages")),
  };
}

function createRequest(options: { linkage_confirmed: boolean }) {
  return {
    run: completedPhaseTwoRun,
    channel: {
      display_name: "测试视频号",
    },
    duration_seconds: 30 as const,
    commerce: {
      mode: "wechat_store_product" as const,
      product_id_or_sku: "SKU-001",
      linkage_confirmed: options.linkage_confirmed,
    },
  };
}

function validMp4Header(): Buffer {
  return Buffer.from([
    0x00, 0x00, 0x00, 0x0c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73,
    0x6f, 0x6d,
  ]);
}
