import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FileProductVideoProductionJobStore } from "../../src/services/video/file-product-video-production-job-store.js";
import { ProductVideoProductionQueue } from "../../src/services/video/product-video-production-queue.js";
import type { ProductVideoProject } from "../../src/schemas/product-video-project.schema.js";

describe("ProductVideoProductionQueue", () => {
  it("persists a completed creative-production job without holding the HTTP caller", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-video-production-job-"));
    const store = new FileProductVideoProductionJobStore(directory);
    const queue = new ProductVideoProductionQueue(store, async () => projectFixture());

    const submitted = await queue.submit({
      batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(submitted.status).toBe("queued");

    const completed = await waitForCompleted(queue, submitted.id);
    expect(completed.status).toBe("completed");
    expect(completed.project?.id).toBe(projectFixture().id);
    expect(
      await readFile(path.join(directory, `${submitted.id}.json`), "utf8"),
    ).toContain('"status": "completed"');
  });

  it("records executor errors for polling clients", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "vca-video-production-job-"));
    const store = new FileProductVideoProductionJobStore(directory);
    const queue = new ProductVideoProductionQueue(store, async () => {
      throw new Error("Codex unavailable");
    });

    const submitted = await queue.submit({
      batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    const failed = await waitForCompleted(queue, submitted.id);
    expect(failed.status).toBe("failed");
    expect(failed.error?.message).toContain("Codex unavailable");
  });
});

async function waitForCompleted(
  queue: ProductVideoProductionQueue,
  jobId: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const job = await queue.get(jobId);
    if (job.status === "completed" || job.status === "failed") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Video production job did not settle in time.");
}

function projectFixture(): ProductVideoProject {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "prepared",
    batch_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    candidate: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "Product",
      raw_text: "Product",
      image_url: "https://example.com/product.jpg",
    },
    recommendation: {
      candidate_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      product_name: "Product",
      overall_score: 80,
      dimensions: {
        account_fit: 16,
        demand_evidence: 16,
        commission_value: 16,
        content_potential: 16,
        trust_and_safety: 16,
      },
      recommendation_level: "priority_test",
      reasons: ["fit", "demand", "content"],
      risk_flags: ["verify"],
      facts_to_verify: ["price"],
      video_plan: {
        duration_seconds: 15,
        hook: "Hook",
        voiceover: "Voiceover",
        cards: [
          { start_second: 0, end_second: 4, headline: "A", subline: "B", visual_treatment: "pain_point" },
          { start_second: 4, end_second: 8, headline: "A", subline: "B", visual_treatment: "product_reveal" },
          { start_second: 8, end_second: 12, headline: "A", subline: "B", visual_treatment: "proof_focus" },
          { start_second: 12, end_second: 15, headline: "A", subline: "B", visual_treatment: "call_to_action" },
        ],
        call_to_action: "Check",
      },
    },
    created_at: "2026-07-25T00:00:00.000Z",
    updated_at: "2026-07-25T00:00:00.000Z",
    directory_path: "C:/temp/project",
    assets: {
      image: { relative_path: "product.jpg", media_type: "image/jpeg" },
    },
    warnings: [],
    files: ["a", "b", "c", "d"],
  };
}
