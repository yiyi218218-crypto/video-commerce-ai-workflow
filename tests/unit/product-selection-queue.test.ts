import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSelectionBatchStore } from "../../src/services/selection/file-selection-batch-store.js";
import { ProductSelectionQueue } from "../../src/services/selection/product-selection-queue.js";
import {
  selectionCandidates,
  selectionInput,
  selectionOutput,
} from "../fixtures/product-selection.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("ProductSelectionQueue", () => {
  it("persists queued, analyzing, and completed selection states", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "vca-selection-queue-"),
    );
    directories.push(directory);
    const store = new FileSelectionBatchStore(directory);
    const executor = vi.fn().mockResolvedValue(selectionOutput);
    const queue = new ProductSelectionQueue(store, executor);
    const imported = await store.importCandidates({
      source_page_url: "https://store.weixin.qq.com/talent/selection",
      captured_at: "2026-07-23T09:00:00.000Z",
      candidates: selectionCandidates,
    });

    const queued = await queue.submit(imported.id, selectionInput.profile);
    expect(queued.status).toBe("queued");

    const completed = await waitForCompleted(queue, imported.id);
    expect(completed.status).toBe("analyzed");
    expect(completed.analysis).toEqual(selectionOutput);
    expect(executor).toHaveBeenCalledWith(selectionInput);
  });
});

async function waitForCompleted(
  queue: ProductSelectionQueue,
  batchId: string,
) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const batch = await queue.get(batchId);
    if (batch.status === "analyzed" || batch.status === "failed") {
      return batch;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Selection queue did not complete.");
}
