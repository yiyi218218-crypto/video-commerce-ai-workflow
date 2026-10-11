import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSelectionBatchStore } from "../../src/services/selection/file-selection-batch-store.js";
import { selectionCandidates } from "../fixtures/product-selection.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("FileSelectionBatchStore", () => {
  it("persists only schema-valid visible candidates", async () => {
    const store = await createStore();
    const batch = await store.importCandidates({
      source_page_url: "https://store.weixin.qq.com/talent/selection",
      captured_at: "2026-07-23T09:00:00.000Z",
      candidates: selectionCandidates,
    });

    expect((await store.get(batch.id)).candidates).toEqual(
      selectionCandidates,
    );
    expect(await store.list()).toHaveLength(1);
  });

  it("marks unfinished analysis as interrupted on startup", async () => {
    const store = await createStore();
    const batch = await store.importCandidates({
      source_page_url: "https://store.weixin.qq.com/talent/selection",
      captured_at: "2026-07-23T09:00:00.000Z",
      candidates: selectionCandidates,
    });
    await store.save({
      ...batch,
      status: "queued",
      analysis_profile: {
        channel_name: "测试视频号",
        target_audiences: ["上班族"],
        preferred_categories: [],
        excluded_keywords: [],
        content_strengths: ["真实场景"],
      },
      updated_at: "2026-07-23T09:01:00.000Z",
    });

    await expect(store.markInterrupted()).resolves.toBe(1);
    expect((await store.get(batch.id)).error?.code).toBe(
      "SELECTION_ANALYSIS_INTERRUPTED",
    );
  });

  it("attaches explicitly captured visible detail images to one candidate", async () => {
    const store = await createStore();
    const batch = await store.importCandidates({
      source_page_url: "https://store.weixin.qq.com/talent/selection",
      captured_at: "2026-07-23T09:00:00.000Z",
      candidates: selectionCandidates,
    });
    const candidateId = selectionCandidates[0]?.candidate_id;
    if (!candidateId) {
      throw new Error("Fixture must include a candidate.");
    }

    const updated = await store.attachCandidateGallery(batch.id, candidateId, {
      captured_at: "2026-07-23T09:02:00.000Z",
      image_urls: [
        "https://qpic.cn/product/detail-1.jpg",
        "https://qpic.cn/product/detail-2.jpg",
      ],
    });

    expect(updated.candidates[0]?.gallery_image_urls).toEqual([
      "https://qpic.cn/product/detail-1.jpg",
      "https://qpic.cn/product/detail-2.jpg",
    ]);
  });

  it("rejects path-like batch ids", async () => {
    const store = await createStore();

    await expect(store.get("../batch")).rejects.toMatchObject({
      code: "SELECTION_BATCH_ID_INVALID",
    });
  });
});

async function createStore(): Promise<FileSelectionBatchStore> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "vca-selection-store-"),
  );
  directories.push(directory);
  return new FileSelectionBatchStore(directory);
}
